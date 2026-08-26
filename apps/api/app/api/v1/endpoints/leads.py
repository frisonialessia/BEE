"""Lead endpoints.

Most leads are created via signal ingestion (get-or-create resolution — see
``app.repositories.lead.LeadRepository.get_or_create_from_ref``). ``POST /leads``
is the manual-entry counterpart for a rep adding a contact by hand. This
module exposes the list/detail/create views the dashboard needs, with the
same visibility scoping as ``GET /opportunities``.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.api.deps import get_current_user, get_current_user_optional
from app.core.database import get_session
from app.core.logging import get_logger
from app.models.lead import Lead
from app.models.user import User
from app.repositories.company import CompanyRepository
from app.repositories.lead import LeadRepository
from app.schemas.dedup import LeadDuplicateGroup, MergeIn
from app.schemas.lead import (
    LeadBulkCreateIn,
    LeadBulkError,
    LeadBulkResult,
    LeadBulkUpdateIn,
    LeadBulkUpdateResult,
    LeadCreateIn,
    LeadImportIn,
    LeadImportResult,
    LeadImportRow,
    LeadImportRowOutcome,
    LeadOut,
    LeadValidationOut,
)
from app.schemas.signal import CompanyRef, LeadRef
from app.services.data_validator import DataValidator
from app.services.permissions import get_visible_user_ids, user_can_view_assignment

logger = get_logger(__name__)

router = APIRouter(prefix="/leads", tags=["Leads"])


@router.post(
    "",
    response_model=LeadOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a lead manually",
)
def create_lead(
    data: LeadCreateIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> LeadOut:
    lead = Lead(
        organization_id=current_user.organization_id,
        company_id=data.company_id,
        full_name=data.full_name,
        email=data.email,
        title=data.title,
        seniority=data.seniority,
        linkedin_url=data.linkedin_url,
        phone=data.phone,
    )
    session.add(lead)
    session.commit()
    session.refresh(lead)
    _validate_new_lead(session, lead.id)
    session.refresh(lead)
    return LeadOut.model_validate(lead)


def _validate_new_lead(session: Session, lead_id: uuid.UUID) -> None:
    """Run DataValidator right after a lead is created — best-effort, the
    same way SignalEngine does it for leads resolved from a webhook. A
    validation failure must never fail the create request that triggered it."""
    try:
        DataValidator(session).validate_lead(lead_id)
        session.commit()
    except Exception:  # noqa: BLE001
        session.rollback()
        logger.exception("DataValidator failed for new lead %s", lead_id)


@router.post(
    "/bulk",
    response_model=LeadBulkResult,
    status_code=status.HTTP_201_CREATED,
    summary="Bulk-create leads (CSV import)",
)
def bulk_create_leads(
    data: LeadBulkCreateIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> LeadBulkResult:
    """CSV parsing happens in the browser — this just persists the rows it
    already validated. Each row is inserted independently so one bad row
    (e.g. a company_id that doesn't exist, or a field failing LeadCreateIn's
    own constraints) doesn't fail the whole import — see LeadBulkCreateIn's
    docstring for why row validation happens here rather than at the
    request-body layer.
    """
    created_count = 0
    errors: list[LeadBulkError] = []

    # Committed per row (not batched into one transaction) so a bad row
    # (e.g. a company_id that doesn't exist) can be rolled back on its own
    # without losing the rows already inserted earlier in the same import.
    for index, raw_row in enumerate(data.leads):
        try:
            row = LeadCreateIn.model_validate(raw_row)
            lead = Lead(
                organization_id=current_user.organization_id,
                company_id=row.company_id,
                full_name=row.full_name,
                email=row.email,
                title=row.title,
                seniority=row.seniority,
                linkedin_url=row.linkedin_url,
                phone=row.phone,
            )
            session.add(lead)
            session.commit()
            _validate_new_lead(session, lead.id)
            created_count += 1
        except Exception as exc:  # noqa: BLE001 - one bad row must not abort the batch
            session.rollback()
            errors.append(LeadBulkError(row=index, message=str(exc)))

    return LeadBulkResult(created_count=created_count, errors=errors)


@router.post(
    "/import",
    response_model=LeadImportResult,
    status_code=status.HTTP_201_CREATED,
    summary="Import an external prospect list (CSV/XLSX template)",
)
def import_leads(
    data: LeadImportIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> LeadImportResult:
    """Resolve each row's company by name/domain and its lead by email —
    the same get-or-create logic ``SignalEngine`` already uses for inbound
    webhooks (``CompanyRepository``/``LeadRepository.get_or_create_from_ref``),
    just fed from an uploaded row instead of a webhook payload. A row that
    matches an existing lead/company is reported as matched, never as
    created — see ``LeadImportResult``'s own docstring on why that distinction
    is never blurred. Newly created leads get the same first-encounter
    ``DataValidator`` pass a manually-created lead already gets (see
    ``_validate_new_lead`` below); a matched lead never gets re-validated
    and never has an existing field overwritten — the one exception is
    backfilling ``phone`` when the matched lead doesn't have one yet and the
    row supplies one, which fills a gap rather than overwriting data. An
    import shouldn't silently overwrite quality flags — or any other
    already-populated field — on a contact that already exists.

    Committed per row, same as ``POST /leads/bulk`` — one bad row (e.g. a
    company name so long it violates a column limit) never rolls back the
    rows already imported earlier in the same file. Row-shape validation
    itself also happens per-row here rather than at the request-body layer —
    see ``LeadImportIn``'s docstring for why.
    """
    companies = CompanyRepository(session)
    leads = LeadRepository(session)
    org_id = current_user.organization_id

    outcomes: list[LeadImportRowOutcome] = []
    leads_created = leads_matched = companies_created = companies_matched = skipped = 0

    for index, raw_row in enumerate(data.rows):
        try:
            row = LeadImportRow.model_validate(raw_row)
        except Exception as exc:  # noqa: BLE001 - one bad row must not abort the import
            outcomes.append(LeadImportRowOutcome(row=index, status="error", message=str(exc)))
            continue

        full_name = (row.full_name or "").strip() or None
        email = (row.email or "").strip().lower() or None
        if not full_name and not email:
            skipped += 1
            outcomes.append(
                LeadImportRowOutcome(
                    row=index,
                    status="error",
                    message="No full_name or email — nothing to key a lead on",
                )
            )
            continue

        try:
            company_id: uuid.UUID | None = None
            company_name = (row.company_name or "").strip() or None
            company_domain = (row.company_domain or "").strip().lower() or None
            if company_name or company_domain:
                already_existed = bool(
                    (company_domain and companies.get_by_domain(company_domain, org_id))
                    or (
                        not company_domain
                        and company_name
                        and companies.get_by_name(company_name, org_id)
                    )
                )
                company = companies.get_or_create_from_ref(
                    CompanyRef(
                        name=company_name,
                        domain=company_domain,
                        industry=(row.company_industry or "").strip() or None,
                        country=(row.company_country or "").strip() or None,
                    ),
                    org_id,
                )
                if company is not None:
                    company_id = company.id
                    if already_existed:
                        companies_matched += 1
                    else:
                        # CompanyRepository.add() (called inside
                        # get_or_create_from_ref for the not-found path)
                        # already flushes — the new row is visible to the
                        # Lead insert below within this same transaction.
                        companies_created += 1

            lead_already_existed = bool(email and leads.get_by_email(email, org_id))
            lead = leads.get_or_create_from_ref(
                LeadRef(
                    full_name=full_name,
                    email=email,
                    title=(row.title or "").strip() or None,
                    seniority=(row.seniority or "").strip() or None,
                    linkedin_url=(row.linkedin_url or "").strip() or None,
                ),
                company_id,
                org_id,
            )
            if lead is None:
                raise ValueError("Could not resolve a lead from this row")  # noqa: TRY301

            if row.phone and not lead.phone:
                lead.phone = row.phone.strip()
                session.add(lead)

            session.commit()

            if lead_already_existed:
                leads_matched += 1
                outcomes.append(
                    LeadImportRowOutcome(
                        row=index, status="matched_existing", lead_id=lead.id, company_id=company_id
                    )
                )
            else:
                leads_created += 1
                _validate_new_lead(session, lead.id)
                outcomes.append(
                    LeadImportRowOutcome(
                        row=index, status="created", lead_id=lead.id, company_id=company_id
                    )
                )
        except Exception as exc:  # noqa: BLE001 - one bad row must not abort the import
            session.rollback()
            outcomes.append(LeadImportRowOutcome(row=index, status="error", message=str(exc)))

    return LeadImportResult(
        total_rows=len(data.rows),
        leads_created=leads_created,
        leads_matched=leads_matched,
        companies_created=companies_created,
        companies_matched=companies_matched,
        skipped=skipped,
        rows=outcomes,
    )


@router.get(
    "",
    response_model=list[LeadOut],
    summary="List leads visible to the caller",
)
def list_leads(
    limit: int = 50,
    offset: int = 0,
    session: Session = Depends(get_session),
    current_user: User | None = Depends(get_current_user_optional),
) -> list[LeadOut]:
    """Return a page of leads, most recent first.

    Same visibility contract as ``GET /opportunities``: unauthenticated/
    API-key-only requests are unrestricted (existing integrations keep
    working); a logged-in session token scopes results to what that user can
    see (org-wide for OWNER/ADMIN, team subtree for MANAGER, own assignments
    for MEMBER).
    """
    repo = LeadRepository(session)
    visible_user_ids = get_visible_user_ids(session, current_user) if current_user else None
    organization_id = current_user.organization_id if current_user else None
    leads = repo.list_scoped(
        limit=limit,
        offset=offset,
        visible_user_ids=visible_user_ids,
        organization_id=organization_id,
    )
    return [LeadOut.model_validate(lead) for lead in leads]


def _hidden_from(session: Session, current_user: User | None, lead: Lead) -> bool:
    if current_user is None:
        return False
    return (
        lead.organization_id is not None and lead.organization_id != current_user.organization_id
    ) or not user_can_view_assignment(session, current_user, lead.assigned_to_user_id)


@router.get(
    "/duplicates",
    response_model=list[LeadDuplicateGroup],
    summary="Find likely-duplicate leads (same email)",
)
def list_duplicate_leads(
    session: Session = Depends(get_session),
    current_user: User | None = Depends(get_current_user_optional),
) -> list[LeadDuplicateGroup]:
    """Registered before ``/{lead_id}`` on purpose — see the equivalent note
    on ``GET /companies/duplicates``."""
    repo = LeadRepository(session)
    organization_id = current_user.organization_id if current_user else None
    groups = repo.find_duplicate_groups(organization_id)
    return [
        LeadDuplicateGroup(key=key, leads=[LeadOut.model_validate(l) for l in items])
        for key, items in groups
    ]


@router.post(
    "/merge",
    response_model=LeadOut,
    summary="Merge one duplicate lead into another",
)
def merge_leads(
    body: MergeIn,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> LeadOut:
    """Repoints every signal/opportunity from ``merge_id`` onto ``keep_id``
    and deletes ``merge_id``. Both leads must be visible to the caller."""
    repo = LeadRepository(session)
    for lead_id in (body.keep_id, body.merge_id):
        lead = repo.get(lead_id)
        if lead is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found.")
        if _hidden_from(session, current_user, lead):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found.")

    try:
        merged = repo.merge(body.keep_id, body.merge_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    session.commit()
    session.refresh(merged)
    return LeadOut.model_validate(merged)


@router.patch(
    "/bulk-update",
    response_model=LeadBulkUpdateResult,
    summary="Reassign or change status for several leads at once",
)
def bulk_update_leads(
    body: LeadBulkUpdateIn,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> LeadBulkUpdateResult:
    """The bulk-action toolbar in the leads directory — select a page of
    rows, reassign them or move them along the pipeline in one call instead
    of one PATCH per row. Committed per lead (not one shared transaction) so
    one hidden/missing id doesn't roll back the rest of the batch."""
    updates = body.model_dump(exclude_unset=True, include={"status", "assigned_to_user_id"})
    if not updates:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Nothing to update."
        )

    repo = LeadRepository(session)
    updated_count = 0
    errors: list[LeadBulkError] = []

    for index, lead_id in enumerate(body.ids):
        try:
            lead = repo.get(lead_id)
            if lead is None:
                raise ValueError("Lead not found.")
            if _hidden_from(session, current_user, lead):
                raise ValueError("Lead not found.")
            for field, value in updates.items():
                setattr(lead, field, value)
            session.add(lead)
            session.commit()
            updated_count += 1
        except Exception as exc:  # noqa: BLE001 - one bad row must not abort the batch
            session.rollback()
            errors.append(LeadBulkError(row=index, message=str(exc)))

    return LeadBulkUpdateResult(updated_count=updated_count, errors=errors)


@router.get(
    "/{lead_id}",
    response_model=LeadOut,
    summary="Fetch a single lead by id",
)
def get_lead(
    lead_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User | None = Depends(get_current_user_optional),
) -> LeadOut:
    repo = LeadRepository(session)
    lead = repo.get(lead_id)
    if lead is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found.")

    if _hidden_from(session, current_user, lead):
        # 404, not 403 — a MEMBER (or a user from another org) shouldn't
        # learn that a lead they can't see exists at all just by guessing ids.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found.")

    return LeadOut.model_validate(lead)


@router.post(
    "/{lead_id}/validate",
    response_model=LeadValidationOut,
    summary="Re-run data quality checks against a lead on demand",
)
def validate_lead(
    lead_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User | None = Depends(get_current_user_optional),
) -> LeadValidationOut:
    """Re-check email/LinkedIn/title/staleness and refresh the quality score.

    New leads are already validated once at creation time (manual entry and
    signal ingestion both do this automatically) — this is for re-checking a
    lead later, e.g. after 90+ days, or after a rep edits its contact info.
    """
    repo = LeadRepository(session)
    lead = repo.get(lead_id)
    if lead is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found.")
    if _hidden_from(session, current_user, lead):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found.")

    report = DataValidator(session).validate_lead(lead_id)
    session.commit()
    return LeadValidationOut(
        lead_id=report.lead_id,
        flags=report.flags,
        freshness_score=report.freshness_score,
        stale_risk=report.stale_risk,
        validated_at=report.validated_at,
    )
