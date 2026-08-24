"""Follow-up tasks — a lightweight to-do list scoped to one opportunity.

Deliberately flat (``/tasks``, not nested under ``/opportunities/{id}``): a
task always carries its own ``opportunity_id``, so a single ``GET /tasks``
(filtered or not) can double as both "tasks for this opportunity" (drawer)
and "my open tasks across every opportunity" (Daily Brief) without two
different route shapes for the same resource.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, or_, select

from app.api.deps import get_current_user, get_current_user_optional
from app.core.database import get_session
from app.models.opportunity import Opportunity
from app.models.opportunity_task import OpportunityTask
from app.models.user import User
from app.schemas.opportunity_task import (
    OpportunityTaskCreateIn,
    OpportunityTaskOut,
    OpportunityTaskUpdateIn,
)
from app.services.permissions import get_visible_user_ids, scope_by_organization_id

router = APIRouter(prefix="/tasks", tags=["Opportunity Tasks"])


def _hidden_from(session: Session, current_user: User | None, task: OpportunityTask) -> bool:
    """Same two-boundary check as opportunities/companies/leads: tenant, then assignment."""
    if current_user is None:
        return False
    if task.organization_id is not None and task.organization_id != current_user.organization_id:
        return True
    if task.assigned_to_user_id is None:
        return False
    visible = get_visible_user_ids(session, current_user)
    return visible is not None and task.assigned_to_user_id not in visible


@router.post(
    "",
    response_model=OpportunityTaskOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a follow-up task for an opportunity",
)
def create_task(
    data: OpportunityTaskCreateIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> OpportunityTaskOut:
    opportunity = session.get(Opportunity, data.opportunity_id)
    if opportunity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Opportunity not found.")
    if (
        opportunity.organization_id is not None
        and opportunity.organization_id != current_user.organization_id
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Opportunity not found.")

    task = OpportunityTask(
        organization_id=current_user.organization_id,
        opportunity_id=data.opportunity_id,
        # Defaults to whoever the opportunity itself is assigned to — the
        # common case (a rep reminding themselves about their own deal) needs
        # no extra picker; explicitly passing a different id still overrides it.
        assigned_to_user_id=data.assigned_to_user_id
        if data.assigned_to_user_id is not None
        else opportunity.assigned_to_user_id,
        created_by_user_id=current_user.id,
        title=data.title,
        due_at=data.due_at,
    )
    session.add(task)
    session.commit()
    session.refresh(task)
    return OpportunityTaskOut.model_validate(task)


@router.get(
    "",
    response_model=list[OpportunityTaskOut],
    summary="List follow-up tasks, optionally filtered by opportunity or overdue status",
)
def list_tasks(
    opportunity_id: uuid.UUID | None = None,
    include_completed: bool = False,
    overdue_only: bool = False,
    limit: int = Query(default=100, le=500),
    offset: int = 0,
    session: Session = Depends(get_session),
    current_user: User | None = Depends(get_current_user_optional),
) -> list[OpportunityTaskOut]:
    statement = select(OpportunityTask)

    organization_id = current_user.organization_id if current_user else None
    statement = scope_by_organization_id(statement, OpportunityTask.organization_id, organization_id)

    if current_user is not None:
        visible_user_ids = get_visible_user_ids(session, current_user)
        if visible_user_ids is not None:
            statement = statement.where(
                or_(
                    OpportunityTask.assigned_to_user_id.in_(visible_user_ids),  # type: ignore[union-attr]
                    OpportunityTask.assigned_to_user_id.is_(None),
                )
            )

    if opportunity_id is not None:
        statement = statement.where(OpportunityTask.opportunity_id == opportunity_id)
    if not include_completed:
        statement = statement.where(OpportunityTask.completed_at.is_(None))  # type: ignore[union-attr]
    if overdue_only:
        statement = statement.where(
            OpportunityTask.due_at.is_not(None),  # type: ignore[union-attr]
            OpportunityTask.due_at < datetime.now(UTC),
        )

    statement = statement.order_by(OpportunityTask.due_at.asc().nulls_last(), OpportunityTask.created_at.desc())  # type: ignore[union-attr]
    statement = statement.limit(limit).offset(offset)

    tasks = list(session.exec(statement).all())
    return [OpportunityTaskOut.model_validate(t) for t in tasks]


@router.patch(
    "/{task_id}",
    response_model=OpportunityTaskOut,
    summary="Update a task, or mark it complete/incomplete",
)
def update_task(
    task_id: uuid.UUID,
    data: OpportunityTaskUpdateIn,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> OpportunityTaskOut:
    task = session.get(OpportunityTask, task_id)
    if task is None or _hidden_from(session, current_user, task):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found.")

    updates = data.model_dump(exclude_unset=True, exclude={"completed"})
    for field, value in updates.items():
        setattr(task, field, value)

    if data.completed is not None:
        task.completed_at = datetime.now(UTC) if data.completed else None

    session.add(task)
    session.commit()
    session.refresh(task)
    return OpportunityTaskOut.model_validate(task)


@router.delete(
    "/{task_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a task",
)
def delete_task(
    task_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> None:
    task = session.get(OpportunityTask, task_id)
    if task is None or _hidden_from(session, current_user, task):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found.")

    session.delete(task)
    session.commit()
