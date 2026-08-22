"""Multi-tenant auth: Organization / Team / User + tenant columns.

Revision ID: 002_multi_tenant_auth
Revises: 001_pgvector_sales_dna
Create Date: 2026-08-22

Adds the multi-tenancy foundation:

* ``organizations`` — the tenant boundary.
* ``teams`` — the manager hierarchy (self-referential ``parent_team_id``).
* ``users`` — dashboard users, each in one organization and (optionally) one
  team, with a role (OWNER/ADMIN/MANAGER/MEMBER) that
  ``app.services.permissions`` uses to scope visibility.
* ``organization_id`` on ``companies``/``leads``/``signals``/``opportunities``
  (nullable — see ``app.models.organization``'s docstring for why existing,
  pre-multi-tenancy rows are intentionally left untagged rather than backfilled
  to a synthetic organization).
* ``assigned_to_user_id`` on ``leads``/``opportunities`` — the field
  MANAGER/MEMBER visibility filters on.

Generated via ``alembic revision --autogenerate``, then hand-edited to name
every foreign key constraint explicitly (autogenerate leaves them anonymous,
which produces an unrunnable ``downgrade()`` — `op.drop_constraint(None, ...)`
is not valid) and to drop the ``userrole`` Postgres enum type on downgrade
(same gap as migration 000 — autogenerate never emits `DROP TYPE`). Verified
upgrade -> downgrade -> upgrade end-to-end against a real Postgres instance
before landing.
"""
from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "002_multi_tenant_auth"
down_revision: str | None = "001_pgvector_sales_dna"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "organizations",
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("slug", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("plan", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_organizations_id"), "organizations", ["id"], unique=False)
    op.create_index(op.f("ix_organizations_is_active"), "organizations", ["is_active"], unique=False)
    op.create_index(op.f("ix_organizations_slug"), "organizations", ["slug"], unique=True)

    op.create_table(
        "teams",
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("parent_team_id", sa.Uuid(), nullable=True),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("description", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], name="fk_teams_organization_id"),
        sa.ForeignKeyConstraint(["parent_team_id"], ["teams.id"], name="fk_teams_parent_team_id"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_teams_id"), "teams", ["id"], unique=False)
    op.create_index(op.f("ix_teams_organization_id"), "teams", ["organization_id"], unique=False)
    op.create_index(op.f("ix_teams_parent_team_id"), "teams", ["parent_team_id"], unique=False)

    op.create_table(
        "users",
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("team_id", sa.Uuid(), nullable=True),
        sa.Column("email", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("hashed_password", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("full_name", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("role", sa.Enum("OWNER", "ADMIN", "MANAGER", "MEMBER", name="userrole"), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], name="fk_users_organization_id"),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], name="fk_users_team_id"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.create_index(op.f("ix_users_id"), "users", ["id"], unique=False)
    op.create_index(op.f("ix_users_is_active"), "users", ["is_active"], unique=False)
    op.create_index(op.f("ix_users_organization_id"), "users", ["organization_id"], unique=False)
    op.create_index(op.f("ix_users_role"), "users", ["role"], unique=False)
    op.create_index(op.f("ix_users_team_id"), "users", ["team_id"], unique=False)

    op.add_column("companies", sa.Column("organization_id", sa.Uuid(), nullable=True))
    op.create_index(op.f("ix_companies_organization_id"), "companies", ["organization_id"], unique=False)
    op.create_foreign_key(
        "fk_companies_organization_id", "companies", "organizations", ["organization_id"], ["id"]
    )

    op.add_column("leads", sa.Column("organization_id", sa.Uuid(), nullable=True))
    op.add_column("leads", sa.Column("assigned_to_user_id", sa.Uuid(), nullable=True))
    op.create_index(op.f("ix_leads_assigned_to_user_id"), "leads", ["assigned_to_user_id"], unique=False)
    op.create_index(op.f("ix_leads_organization_id"), "leads", ["organization_id"], unique=False)
    op.create_foreign_key("fk_leads_organization_id", "leads", "organizations", ["organization_id"], ["id"])
    op.create_foreign_key("fk_leads_assigned_to_user_id", "leads", "users", ["assigned_to_user_id"], ["id"])

    op.add_column("opportunities", sa.Column("organization_id", sa.Uuid(), nullable=True))
    op.add_column("opportunities", sa.Column("assigned_to_user_id", sa.Uuid(), nullable=True))
    op.create_index(
        op.f("ix_opportunities_assigned_to_user_id"), "opportunities", ["assigned_to_user_id"], unique=False
    )
    op.create_index(op.f("ix_opportunities_organization_id"), "opportunities", ["organization_id"], unique=False)
    op.create_foreign_key(
        "fk_opportunities_assigned_to_user_id", "opportunities", "users", ["assigned_to_user_id"], ["id"]
    )
    op.create_foreign_key(
        "fk_opportunities_organization_id", "opportunities", "organizations", ["organization_id"], ["id"]
    )

    op.add_column("signals", sa.Column("organization_id", sa.Uuid(), nullable=True))
    op.create_index(op.f("ix_signals_organization_id"), "signals", ["organization_id"], unique=False)
    op.create_foreign_key("fk_signals_organization_id", "signals", "organizations", ["organization_id"], ["id"])


def downgrade() -> None:
    op.drop_constraint("fk_signals_organization_id", "signals", type_="foreignkey")
    op.drop_index(op.f("ix_signals_organization_id"), table_name="signals")
    op.drop_column("signals", "organization_id")

    op.drop_constraint("fk_opportunities_organization_id", "opportunities", type_="foreignkey")
    op.drop_constraint("fk_opportunities_assigned_to_user_id", "opportunities", type_="foreignkey")
    op.drop_index(op.f("ix_opportunities_organization_id"), table_name="opportunities")
    op.drop_index(op.f("ix_opportunities_assigned_to_user_id"), table_name="opportunities")
    op.drop_column("opportunities", "assigned_to_user_id")
    op.drop_column("opportunities", "organization_id")

    op.drop_constraint("fk_leads_assigned_to_user_id", "leads", type_="foreignkey")
    op.drop_constraint("fk_leads_organization_id", "leads", type_="foreignkey")
    op.drop_index(op.f("ix_leads_organization_id"), table_name="leads")
    op.drop_index(op.f("ix_leads_assigned_to_user_id"), table_name="leads")
    op.drop_column("leads", "assigned_to_user_id")
    op.drop_column("leads", "organization_id")

    op.drop_constraint("fk_companies_organization_id", "companies", type_="foreignkey")
    op.drop_index(op.f("ix_companies_organization_id"), table_name="companies")
    op.drop_column("companies", "organization_id")

    op.drop_index(op.f("ix_users_team_id"), table_name="users")
    op.drop_index(op.f("ix_users_role"), table_name="users")
    op.drop_index(op.f("ix_users_organization_id"), table_name="users")
    op.drop_index(op.f("ix_users_is_active"), table_name="users")
    op.drop_index(op.f("ix_users_id"), table_name="users")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")

    op.drop_index(op.f("ix_teams_parent_team_id"), table_name="teams")
    op.drop_index(op.f("ix_teams_organization_id"), table_name="teams")
    op.drop_index(op.f("ix_teams_id"), table_name="teams")
    op.drop_table("teams")

    op.drop_index(op.f("ix_organizations_slug"), table_name="organizations")
    op.drop_index(op.f("ix_organizations_is_active"), table_name="organizations")
    op.drop_index(op.f("ix_organizations_id"), table_name="organizations")
    op.drop_table("organizations")

    # See migration 000's downgrade() for why this is necessary: autogenerate
    # never emits DROP TYPE for enum columns, so without this, a subsequent
    # upgrade fails with "type userrole already exists".
    op.execute("DROP TYPE IF EXISTS userrole")
