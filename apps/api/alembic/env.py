"""Alembic migration environment.

Wires Alembic to the application's settings and SQLModel metadata so that
``alembic revision --autogenerate`` sees the full schema and the connection URL
is sourced from the environment (never hard-coded).
"""

from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool
from sqlmodel import SQLModel

# Importing the models registers their tables on SQLModel.metadata.
import app.models  # noqa: F401
from app.core.config import settings

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Inject the runtime database URL from application settings.
config.set_main_option("sqlalchemy.url", settings.sqlalchemy_database_uri)

target_metadata = SQLModel.metadata


def run_migrations_offline() -> None:
    """Run migrations without a live DB connection (emits SQL)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations against a live database connection."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        # Alembic bootstraps `alembic_version.version_num` as VARCHAR(32).
        # Our revision ids are descriptive ("032_federated_intelligence_opt_in"
        # is 33 chars) and Postgres enforces the length — SQLite (the test
        # suite) does not, which is how a too-long id reached production and
        # made `alembic upgrade head` fail there with "value too long". Widen
        # the column before running anything so every environment behaves
        # like the ones that were bootstrapped wider. No-op on a fresh DB.
        if connection.dialect.name == "postgresql":
            from sqlalchemy import text

            connection.execute(
                text(
                    "DO $$ BEGIN "
                    "IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'alembic_version') THEN "
                    "ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(128); "
                    "END IF; END $$;"
                )
            )
            connection.commit()
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
