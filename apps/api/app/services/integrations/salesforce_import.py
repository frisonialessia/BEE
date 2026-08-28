"""SalesforceImportService — one-way, explicit pull of standard Salesforce
objects into BEE's own Company/Lead/Opportunity tables.

Explicit and one-way on purpose
--------------------------------
A rep clicks "Importar de Salesforce" (POST /integrations/salesforce/import)
and this runs once, synchronously, and reports what it did. There is no
background job, no continuous/automatic sync, and BEE never writes anything
back to Salesforce — this only reads. Re-running it is safe and expected
(pulls newer/changed records, updates what it already imported) rather than
something that "keeps two systems in sync" on its own; that would be a much
bigger, riskier feature this project isn't taking on right now.

Standard objects and fields only
----------------------------------
Every field this module reads (Account.Name/Website/Industry/
NumberOfEmployees/BillingCountry, Contact/Lead's Name/Email/Phone/Title,
Opportunity's Name/Amount/StageName/IsWon/IsClosed/CloseDate) is a
standard Salesforce field present on every org regardless of
customization — see salesforce_oauth's module docstring for why this
module deliberately never touches a custom field or tries to interpret a
custom StageName picklist. Win/loss is read from the IsWon/IsClosed
booleans Salesforce puts on every Opportunity stage (even a fully
customized one), not from string-matching "Closed Won" — that's what
makes reading Opportunities safe without knowing this org's real
picklist values.

Idempotency
-----------
Every BEE record created here gets ``attributes["salesforce_id"]`` set to
the source record's Id, and re-running looks that up first before
considering a match by domain (Company) or email (Lead) to avoid creating
a second row for something already tracked — including something BEE
already knew about before the first import (a Company found via a market
signal, not Salesforce).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from urllib.parse import quote

import httpx
from sqlmodel import Session, select

from app.core.logging import get_logger
from app.models.base import LeadStatus, OpportunityStatus
from app.models.company import Company
from app.models.lead import Lead
from app.models.opportunity import Opportunity

logger = get_logger(__name__)

API_VERSION = "v59.0"
# Most-recently-modified first, capped per object type per run — re-run to
# pull the next batch or refresh changed records. Keeps one import call
# comfortably inside an HTTP request instead of needing a background job.
_IMPORT_LIMIT = 500


class SalesforceImportError(Exception):
    """Raised when Salesforce rejects a query (expired token, no API access)."""


@dataclass
class ImportCounts:
    created: int = 0
    updated: int = 0
    skipped: int = 0


@dataclass
class SalesforceImportSummary:
    companies: ImportCounts = field(default_factory=ImportCounts)
    leads: ImportCounts = field(default_factory=ImportCounts)
    opportunities: ImportCounts = field(default_factory=ImportCounts)
    errors: list[str] = field(default_factory=list)


def _normalize_domain(website: str | None) -> str | None:
    if not website:
        return None
    d = website.strip().lower()
    for prefix in ("https://", "http://"):
        if d.startswith(prefix):
            d = d[len(prefix) :]
    if d.startswith("www."):
        d = d[4:]
    d = d.split("/")[0].strip()
    return d or None


def _parse_close_date(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value).replace(tzinfo=UTC)
    except ValueError:
        return None


class SalesforceImportService:
    def __init__(self, session: Session, *, access_token: str, instance_url: str) -> None:
        self.session = session
        self.access_token = access_token
        self.instance_url = instance_url.rstrip("/")

    # ── Salesforce REST/SOQL ────────────────────────────────────────────────

    def _query(self, soql: str) -> list[dict[str, Any]]:
        """Run one SOQL query, following pagination until exhausted."""
        url: str | None = f"{self.instance_url}/services/data/{API_VERSION}/query?q={quote(soql)}"
        headers = {"Authorization": f"Bearer {self.access_token}"}
        records: list[dict[str, Any]] = []
        try:
            while url:
                resp = httpx.get(url, headers=headers, timeout=20.0)
                resp.raise_for_status()
                data = resp.json()
                records.extend(data.get("records", []))
                next_path = data.get("nextRecordsUrl")
                url = f"{self.instance_url}{next_path}" if next_path and not data.get("done", True) else None
        except httpx.HTTPError as exc:
            logger.warning("Salesforce SOQL query failed: %s", exc)
            raise SalesforceImportError(f"Salesforce rejected the query: {exc}") from exc
        return records

    # ── Orchestration ────────────────────────────────────────────────────────

    def import_all(self, organization_id: uuid.UUID) -> SalesforceImportSummary:
        summary = SalesforceImportSummary()
        try:
            sf_id_to_company_id = self._import_accounts(organization_id, summary)
        except SalesforceImportError as exc:
            summary.errors.append(str(exc))
            return summary

        try:
            self._import_contacts_and_leads(organization_id, sf_id_to_company_id, summary)
        except SalesforceImportError as exc:
            summary.errors.append(str(exc))

        try:
            self._import_opportunities(organization_id, sf_id_to_company_id, summary)
        except SalesforceImportError as exc:
            summary.errors.append(str(exc))

        self.session.flush()
        return summary

    # ── Accounts → Companies ─────────────────────────────────────────────────

    def _import_accounts(self, organization_id: uuid.UUID, summary: SalesforceImportSummary) -> dict[str, uuid.UUID]:
        existing = self.session.exec(
            select(Company).where(Company.organization_id == organization_id)
        ).all()
        by_sf_id: dict[str, Company] = {
            c.attributes["salesforce_id"]: c for c in existing if c.attributes.get("salesforce_id")
        }
        by_domain: dict[str, Company] = {c.domain: c for c in existing if c.domain}

        records = self._query(
            "SELECT Id, Name, Website, Industry, NumberOfEmployees, BillingCountry "
            f"FROM Account ORDER BY LastModifiedDate DESC LIMIT {_IMPORT_LIMIT}"
        )

        sf_id_to_company_id: dict[str, uuid.UUID] = {}
        for rec in records:
            sf_id = rec["Id"]
            domain = _normalize_domain(rec.get("Website"))

            company = by_sf_id.get(sf_id) or (by_domain.get(domain) if domain else None)
            if company:
                company.name = rec.get("Name") or company.name
                company.website = rec.get("Website") or company.website
                company.industry = rec.get("Industry") or company.industry
                if rec.get("NumberOfEmployees") is not None:
                    company.attributes = {**company.attributes, "salesforce_employee_count": rec["NumberOfEmployees"]}
                company.country = rec.get("BillingCountry") or company.country
                company.attributes = {**company.attributes, "salesforce_id": sf_id}
                # domain never overwritten once set — the unique constraint is
                # keyed on it and we found this row by domain match already.
                self.session.add(company)
                summary.companies.updated += 1
            else:
                company = Company(
                    organization_id=organization_id,
                    name=rec.get("Name") or "(sin nombre)",
                    domain=domain,
                    industry=rec.get("Industry"),
                    country=rec.get("BillingCountry"),
                    website=rec.get("Website"),
                    attributes={"salesforce_id": sf_id},
                )
                self.session.add(company)
                self.session.flush()
                if domain:
                    by_domain[domain] = company
                summary.companies.created += 1

            by_sf_id[sf_id] = company
            sf_id_to_company_id[sf_id] = company.id

        return sf_id_to_company_id

    # ── Contacts + Leads → Leads ──────────────────────────────────────────────

    def _import_contacts_and_leads(
        self,
        organization_id: uuid.UUID,
        sf_id_to_company_id: dict[str, uuid.UUID],
        summary: SalesforceImportSummary,
    ) -> None:
        existing = self.session.exec(select(Lead).where(Lead.organization_id == organization_id)).all()
        by_sf_id: dict[str, Lead] = {
            lead.attributes["salesforce_id"]: lead for lead in existing if lead.attributes.get("salesforce_id")
        }
        by_email: dict[str, Lead] = {lead.email.lower(): lead for lead in existing if lead.email}

        contacts = self._query(
            "SELECT Id, FirstName, LastName, Email, Phone, Title, AccountId "
            f"FROM Contact ORDER BY LastModifiedDate DESC LIMIT {_IMPORT_LIMIT}"
        )
        # Salesforce's own Lead object (unconverted prospects, no Account yet)
        # — Company here is a plain text field, not a relationship, so it
        # can't be linked to a BEE Company the way Contact.AccountId can.
        sf_leads = self._query(
            "SELECT Id, FirstName, LastName, Email, Phone, Title "
            f"FROM Lead WHERE IsConverted = false ORDER BY LastModifiedDate DESC LIMIT {_IMPORT_LIMIT}"
        )

        for rec in contacts:
            self._upsert_lead(
                organization_id, rec, summary, by_sf_id, by_email,
                company_id=sf_id_to_company_id.get(rec.get("AccountId") or ""),
            )
        for rec in sf_leads:
            self._upsert_lead(organization_id, rec, summary, by_sf_id, by_email, company_id=None)

    def _upsert_lead(
        self,
        organization_id: uuid.UUID,
        rec: dict[str, Any],
        summary: SalesforceImportSummary,
        by_sf_id: dict[str, Lead],
        by_email: dict[str, Lead],
        *,
        company_id: uuid.UUID | None,
    ) -> None:
        sf_id = rec["Id"]
        full_name = " ".join(p for p in [rec.get("FirstName"), rec.get("LastName")] if p).strip()
        if not full_name:
            summary.leads.skipped += 1
            return
        email = (rec.get("Email") or "").strip().lower() or None

        lead = by_sf_id.get(sf_id) or (by_email.get(email) if email else None)
        if lead:
            lead.full_name = full_name
            lead.email = email or lead.email
            lead.title = rec.get("Title") or lead.title
            lead.phone = rec.get("Phone") or lead.phone
            lead.company_id = company_id or lead.company_id
            lead.attributes = {**lead.attributes, "salesforce_id": sf_id}
            self.session.add(lead)
            summary.leads.updated += 1
        else:
            lead = Lead(
                organization_id=organization_id,
                company_id=company_id,
                full_name=full_name,
                email=email,
                title=rec.get("Title"),
                phone=rec.get("Phone"),
                status=LeadStatus.NEW,
                attributes={"salesforce_id": sf_id},
            )
            self.session.add(lead)
            self.session.flush()
            summary.leads.created += 1

        by_sf_id[sf_id] = lead
        if email:
            by_email[email] = lead

    # ── Opportunities → Opportunities ────────────────────────────────────────

    def _import_opportunities(
        self,
        organization_id: uuid.UUID,
        sf_id_to_company_id: dict[str, uuid.UUID],
        summary: SalesforceImportSummary,
    ) -> None:
        existing = self.session.exec(
            select(Opportunity).where(Opportunity.organization_id == organization_id)
        ).all()
        by_sf_id = {o.attributes.get("salesforce_id"): o for o in existing if o.attributes.get("salesforce_id")}

        records = self._query(
            "SELECT Id, Name, Amount, StageName, IsWon, IsClosed, CloseDate, AccountId "
            f"FROM Opportunity ORDER BY LastModifiedDate DESC LIMIT {_IMPORT_LIMIT}"
        )

        for rec in records:
            sf_id = rec["Id"]
            # IsWon/IsClosed are booleans Salesforce sets on every Opportunity
            # stage, custom or not — see module docstring for why this is the
            # only status signal this module trusts, never StageName's text.
            if rec.get("IsWon"):
                status = OpportunityStatus.WON
            elif rec.get("IsClosed"):
                status = OpportunityStatus.LOST
            else:
                status = OpportunityStatus.IN_PROGRESS
            close_date = _parse_close_date(rec.get("CloseDate"))
            company_id = sf_id_to_company_id.get(rec.get("AccountId") or "")

            opp = by_sf_id.get(sf_id)
            if opp:
                opp.title = rec.get("Name") or opp.title
                opp.amount = rec.get("Amount") if rec.get("Amount") is not None else opp.amount
                opp.status = status
                opp.company_id = company_id or opp.company_id
                if status in (OpportunityStatus.WON, OpportunityStatus.LOST):
                    opp.closed_at = close_date or opp.closed_at
                else:
                    opp.expected_close_date = close_date.date() if close_date else opp.expected_close_date
                opp.attributes = {**opp.attributes, "salesforce_id": sf_id, "salesforce_stage": rec.get("StageName")}
                self.session.add(opp)
                summary.opportunities.updated += 1
            else:
                opp = Opportunity(
                    organization_id=organization_id,
                    company_id=company_id,
                    title=rec.get("Name") or "(sin nombre)",
                    status=status,
                    amount=rec.get("Amount"),
                    closed_at=close_date if status in (OpportunityStatus.WON, OpportunityStatus.LOST) else None,
                    expected_close_date=(
                        close_date.date() if close_date and status == OpportunityStatus.IN_PROGRESS else None
                    ),
                    attributes={"salesforce_id": sf_id, "salesforce_stage": rec.get("StageName")},
                )
                self.session.add(opp)
                self.session.flush()
                summary.opportunities.created += 1

            by_sf_id[sf_id] = opp
