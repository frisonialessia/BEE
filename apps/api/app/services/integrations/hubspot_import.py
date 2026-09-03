"""HubSpotImportService — one-way, explicit pull of standard HubSpot CRM
objects into BEE's own Company/Lead/Opportunity tables.

Same shape and same reasoning as SalesforceImportService — see that
module's own docstring for the full "why one-way, why standard fields
only, why idempotent on an external id" rationale, which applies here
unchanged. The HubSpot-specific details:

Standard objects and fields only
----------------------------------
Companies (name/domain/industry/numberofemployees/country), Contacts
(firstname/lastname/email/phone/jobtitle), Deals (dealname/amount/
dealstage/closedate/hs_is_closed/hs_is_closed_won) — every property read
here is a default HubSpot property present on every portal regardless of
customization. Win/loss reads hs_is_closed_won/hs_is_closed, the same
"trust the boolean, never the stage label" approach Salesforce's
IsWon/IsClosed gets, since a portal's real pipeline stage labels are
customized far more often than not.

Idempotency
-----------
Every BEE record created here gets ``attributes["hubspot_id"]`` set to
the source record's id, checked first on re-run before falling back to a
domain (Company) or email (Lead) match — same convention as
``attributes["salesforce_id"]``.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

import httpx
from sqlmodel import Session, select

from app.core.logging import get_logger
from app.models.base import LeadStatus, OpportunityStatus
from app.models.company import Company
from app.models.lead import Lead
from app.models.opportunity import Opportunity

logger = get_logger(__name__)

API_BASE = "https://api.hubapi.com"
# Most-recently-created first isn't offered by HubSpot's default object
# listing the way Salesforce's ORDER BY is — objects come back in
# creation order, oldest first, so this pages forward from the start
# rather than trying to bias toward "recently changed". Capped the same
# way Salesforce's importer is, for the same "stay inside one HTTP
# request" reason.
_IMPORT_LIMIT = 500
_PAGE_SIZE = 100


class HubSpotImportError(Exception):
    """Raised when HubSpot rejects a request (expired token, no API access)."""


@dataclass
class ImportCounts:
    created: int = 0
    updated: int = 0
    skipped: int = 0


@dataclass
class HubSpotImportSummary:
    companies: ImportCounts = field(default_factory=ImportCounts)
    leads: ImportCounts = field(default_factory=ImportCounts)
    opportunities: ImportCounts = field(default_factory=ImportCounts)
    errors: list[str] = field(default_factory=list)


def _normalize_domain(domain: str | None) -> str | None:
    if not domain:
        return None
    d = domain.strip().lower()
    for prefix in ("https://", "http://"):
        if d.startswith(prefix):
            d = d[len(prefix) :]
    if d.startswith("www."):
        d = d[4:]
    d = d.split("/")[0].strip()
    return d or None


def _parse_close_date(value: str | None) -> datetime | None:
    """HubSpot returns closedate as an epoch-millisecond string on the v3
    properties API, not an ISO date the way Salesforce's CloseDate is."""
    if not value:
        return None
    try:
        return datetime.fromtimestamp(int(value) / 1000, tz=UTC)
    except (ValueError, OverflowError):
        return None


class HubSpotImportService:
    def __init__(self, session: Session, *, access_token: str) -> None:
        self.session = session
        self.access_token = access_token

    # ── HubSpot CRM v3 REST ──────────────────────────────────────────────────

    def _list_objects(
        self, object_type: str, properties: list[str], *, associations: list[str] | None = None
    ) -> list[dict[str, Any]]:
        """Page through /crm/v3/objects/{object_type} until exhausted or
        _IMPORT_LIMIT is reached — mirrors SalesforceImportService._query's
        pagination loop, just cursor-based (``after``) instead of a
        follow-the-next-url one."""
        records: list[dict[str, Any]] = []
        after: str | None = None
        headers = {"Authorization": f"Bearer {self.access_token}"}
        params: dict[str, Any] = {"limit": _PAGE_SIZE, "properties": ",".join(properties)}
        if associations:
            params["associations"] = ",".join(associations)

        try:
            while len(records) < _IMPORT_LIMIT:
                page_params = {**params, **({"after": after} if after else {})}
                resp = httpx.get(
                    f"{API_BASE}/crm/v3/objects/{object_type}", headers=headers, params=page_params, timeout=20.0
                )
                resp.raise_for_status()
                data = resp.json()
                records.extend(data.get("results", []))
                after = (data.get("paging") or {}).get("next", {}).get("after")
                if not after:
                    break
        except httpx.HTTPError as exc:
            logger.warning("HubSpot %s list failed: %s", object_type, exc)
            raise HubSpotImportError(f"HubSpot rejected the {object_type} request: {exc}") from exc
        return records[:_IMPORT_LIMIT]

    @staticmethod
    def _first_association_id(rec: dict[str, Any], association_type: str) -> str | None:
        results = ((rec.get("associations") or {}).get(association_type) or {}).get("results") or []
        return results[0]["id"] if results else None

    # ── Orchestration ────────────────────────────────────────────────────────

    def import_all(self, organization_id: uuid.UUID) -> HubSpotImportSummary:
        summary = HubSpotImportSummary()
        try:
            hs_id_to_company_id = self._import_companies(organization_id, summary)
        except HubSpotImportError as exc:
            summary.errors.append(str(exc))
            return summary

        try:
            self._import_contacts(organization_id, hs_id_to_company_id, summary)
        except HubSpotImportError as exc:
            summary.errors.append(str(exc))

        try:
            self._import_deals(organization_id, hs_id_to_company_id, summary)
        except HubSpotImportError as exc:
            summary.errors.append(str(exc))

        self.session.flush()
        return summary

    # ── Companies → Companies ────────────────────────────────────────────────

    def _import_companies(self, organization_id: uuid.UUID, summary: HubSpotImportSummary) -> dict[str, uuid.UUID]:
        existing = self.session.exec(select(Company).where(Company.organization_id == organization_id)).all()
        by_hs_id: dict[str, Company] = {
            c.attributes["hubspot_id"]: c for c in existing if c.attributes.get("hubspot_id")
        }
        by_domain: dict[str, Company] = {c.domain: c for c in existing if c.domain}

        records = self._list_objects("companies", ["name", "domain", "industry", "numberofemployees", "country"])

        hs_id_to_company_id: dict[str, uuid.UUID] = {}
        for rec in records:
            hs_id = rec["id"]
            props = rec.get("properties") or {}
            domain = _normalize_domain(props.get("domain"))

            company = by_hs_id.get(hs_id) or (by_domain.get(domain) if domain else None)
            if company:
                company.name = props.get("name") or company.name
                company.industry = props.get("industry") or company.industry
                if props.get("numberofemployees"):
                    company.attributes = {**company.attributes, "hubspot_employee_count": props["numberofemployees"]}
                company.country = props.get("country") or company.country
                company.attributes = {**company.attributes, "hubspot_id": hs_id}
                self.session.add(company)
                summary.companies.updated += 1
            else:
                company = Company(
                    organization_id=organization_id,
                    name=props.get("name") or "(sin nombre)",
                    domain=domain,
                    industry=props.get("industry"),
                    country=props.get("country"),
                    attributes={"hubspot_id": hs_id},
                )
                self.session.add(company)
                self.session.flush()
                if domain:
                    by_domain[domain] = company
                summary.companies.created += 1

            by_hs_id[hs_id] = company
            hs_id_to_company_id[hs_id] = company.id

        return hs_id_to_company_id

    # ── Contacts → Leads ──────────────────────────────────────────────────────

    def _import_contacts(
        self,
        organization_id: uuid.UUID,
        hs_id_to_company_id: dict[str, uuid.UUID],
        summary: HubSpotImportSummary,
    ) -> None:
        existing = self.session.exec(select(Lead).where(Lead.organization_id == organization_id)).all()
        by_hs_id: dict[str, Lead] = {
            lead.attributes["hubspot_id"]: lead for lead in existing if lead.attributes.get("hubspot_id")
        }
        by_email: dict[str, Lead] = {lead.email.lower(): lead for lead in existing if lead.email}

        records = self._list_objects(
            "contacts", ["firstname", "lastname", "email", "phone", "jobtitle"], associations=["companies"]
        )

        for rec in records:
            hs_id = rec["id"]
            props = rec.get("properties") or {}
            full_name = " ".join(p for p in [props.get("firstname"), props.get("lastname")] if p).strip()
            if not full_name:
                summary.leads.skipped += 1
                continue
            email = (props.get("email") or "").strip().lower() or None
            company_id = hs_id_to_company_id.get(self._first_association_id(rec, "companies") or "")

            lead = by_hs_id.get(hs_id) or (by_email.get(email) if email else None)
            if lead:
                lead.full_name = full_name
                lead.email = email or lead.email
                lead.title = props.get("jobtitle") or lead.title
                lead.phone = props.get("phone") or lead.phone
                lead.company_id = company_id or lead.company_id
                lead.attributes = {**lead.attributes, "hubspot_id": hs_id}
                self.session.add(lead)
                summary.leads.updated += 1
            else:
                lead = Lead(
                    organization_id=organization_id,
                    company_id=company_id,
                    full_name=full_name,
                    email=email,
                    title=props.get("jobtitle"),
                    phone=props.get("phone"),
                    status=LeadStatus.NEW,
                    attributes={"hubspot_id": hs_id},
                )
                self.session.add(lead)
                self.session.flush()
                summary.leads.created += 1

            by_hs_id[hs_id] = lead
            if email:
                by_email[email] = lead

    # ── Deals → Opportunities ────────────────────────────────────────────────

    def _import_deals(
        self,
        organization_id: uuid.UUID,
        hs_id_to_company_id: dict[str, uuid.UUID],
        summary: HubSpotImportSummary,
    ) -> None:
        existing = self.session.exec(select(Opportunity).where(Opportunity.organization_id == organization_id)).all()
        by_hs_id = {o.attributes.get("hubspot_id"): o for o in existing if o.attributes.get("hubspot_id")}

        records = self._list_objects(
            "deals",
            ["dealname", "amount", "dealstage", "closedate", "hs_is_closed", "hs_is_closed_won"],
            associations=["companies"],
        )

        for rec in records:
            hs_id = rec["id"]
            props = rec.get("properties") or {}
            # hs_is_closed_won/hs_is_closed are standard properties HubSpot
            # sets on every deal regardless of a portal's custom pipeline —
            # see module docstring for why this module trusts only these,
            # never dealstage's own (customizable) label.
            if str(props.get("hs_is_closed_won")).lower() == "true":
                deal_status = OpportunityStatus.WON
            elif str(props.get("hs_is_closed")).lower() == "true":
                deal_status = OpportunityStatus.LOST
            else:
                deal_status = OpportunityStatus.IN_PROGRESS
            close_date = _parse_close_date(props.get("closedate"))
            amount_raw = props.get("amount")
            # HubSpot's properties API always returns values as strings
            # (even for number-typed properties) — str() first so this
            # is a real narrowing for mypy too, not just a runtime check.
            amount = float(str(amount_raw)) if amount_raw not in (None, "") else None
            company_id = hs_id_to_company_id.get(self._first_association_id(rec, "companies") or "")

            opp = by_hs_id.get(hs_id)
            if opp:
                opp.title = props.get("dealname") or opp.title
                opp.amount = amount if amount is not None else opp.amount
                opp.status = deal_status
                opp.company_id = company_id or opp.company_id
                if deal_status in (OpportunityStatus.WON, OpportunityStatus.LOST):
                    opp.closed_at = close_date or opp.closed_at
                else:
                    opp.expected_close_date = close_date.date() if close_date else opp.expected_close_date
                opp.attributes = {**opp.attributes, "hubspot_id": hs_id, "hubspot_stage": props.get("dealstage")}
                self.session.add(opp)
                summary.opportunities.updated += 1
            else:
                opp = Opportunity(
                    organization_id=organization_id,
                    company_id=company_id,
                    title=props.get("dealname") or "(sin nombre)",
                    status=deal_status,
                    amount=amount,
                    closed_at=close_date if deal_status in (OpportunityStatus.WON, OpportunityStatus.LOST) else None,
                    expected_close_date=(
                        close_date.date() if close_date and deal_status == OpportunityStatus.IN_PROGRESS else None
                    ),
                    attributes={"hubspot_id": hs_id, "hubspot_stage": props.get("dealstage")},
                )
                self.session.add(opp)
                self.session.flush()
                summary.opportunities.created += 1

            by_hs_id[hs_id] = opp
