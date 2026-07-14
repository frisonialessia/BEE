"""Generic repository base class.

The Repository pattern isolates persistence concerns from business logic. Services
depend on repositories (an abstraction) rather than issuing raw queries, which
keeps the domain layer testable and makes the storage backend swappable
(Dependency Inversion Principle).
"""

from __future__ import annotations

import uuid
from typing import Generic, TypeVar

from sqlmodel import Session, SQLModel, select

ModelT = TypeVar("ModelT", bound=SQLModel)


class BaseRepository(Generic[ModelT]):
    """CRUD operations shared by all concrete repositories."""

    model: type[ModelT]

    def __init__(self, session: Session) -> None:
        self.session = session

    def get(self, entity_id: uuid.UUID) -> ModelT | None:
        """Fetch a single entity by primary key."""
        return self.session.get(self.model, entity_id)

    def list(self, *, limit: int = 100, offset: int = 0) -> list[ModelT]:
        """Return a page of entities, newest first when a ``created_at`` exists."""
        statement = select(self.model)
        created_at = getattr(self.model, "created_at", None)
        if created_at is not None:
            statement = statement.order_by(created_at.desc())  # type: ignore[union-attr]
        statement = statement.limit(limit).offset(offset)
        return list(self.session.exec(statement).all())

    def add(self, entity: ModelT) -> ModelT:
        """Persist a new or updated entity and refresh it with DB-generated data.

        The caller is responsible for committing; keeping commit control at the
        service layer allows multiple repository operations to participate in a
        single atomic unit of work.
        """
        self.session.add(entity)
        self.session.flush()  # assign PKs/defaults without ending the transaction
        self.session.refresh(entity)
        return entity
