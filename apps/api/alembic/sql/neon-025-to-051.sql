-- =============================================================================
-- Migración de la base de PRODUCCIÓN: 025_account_activity_events -> 051 (head)
-- =============================================================================
-- Generado con:
--   cd apps/api && alembic upgrade 025_account_activity_events:head --sql
--
-- PARA QUÉ SIRVE
-- La base de producción (Neon) se quedó en la revisión 025 mientras el código
-- avanzó hasta 051: son 26 migraciones de diferencia. Cualquier consulta que
-- toque una columna nueva falla con 500 — entre ellas el propio login, que lee
-- users.avatar_color (migración 050). Este archivo aplica las 26 de una vez.
--
-- CÓMO USARLO (sin instalar nada)
--   Neon -> Dashboard -> SQL Editor -> pegar TODO este archivo -> Run.
-- Va dentro de una sola transacción (BEGIN/COMMIT): o entra completo o no
-- entra nada, así que no puede dejar la base a medias.
--
-- POR QUÉ LA PRIMERA LÍNEA
-- alembic_version.version_num es VARCHAR(32) por defecto, y los ids de estas
-- revisiones llegan a 33 caracteres (042_organization_deletion_request). Sin
-- ensanchar la columna, el script truena a media migración.
--
-- DESPUÉS DE CORRER ESTO
-- Para que no vuelva a pasar: GitHub -> Settings -> Secrets and variables ->
-- Actions -> New repository secret -> PRODUCTION_DATABASE_URL = la cadena
-- DIRECTA de Neon (la que NO lleva "-pooler"). El workflow migrate.yml ya
-- existe y corre solo en cada push que toque migraciones, pero sin ese secreto
-- se salta el trabajo en silencio (lleva 4 de 4 ejecuciones saltándoselo).
--
-- COMPROBACIÓN
--   GET https://bee-api-two.vercel.app/api/v1/ready  ->  {"status":"ready"}
--   (responde 503 mientras siga habiendo deriva de esquema)
-- =============================================================================

BEGIN;

-- Ver 'POR QUÉ LA PRIMERA LÍNEA' arriba.
ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(128);

-- Running upgrade 025_account_activity_events -> 026_market_scan_scaffold

ALTER TABLE companies ADD COLUMN next_scan_due_at TIMESTAMP WITHOUT TIME ZONE;

CREATE INDEX ix_companies_next_scan_due_at ON companies (next_scan_due_at);

ALTER TABLE companies ADD COLUMN last_scanned_at TIMESTAMP WITHOUT TIME ZONE;

CREATE TABLE market_scan_logs (
    id UUID NOT NULL, 
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
    companies_scanned INTEGER NOT NULL, 
    signals_created INTEGER NOT NULL, 
    errors JSON NOT NULL, 
    duration_ms INTEGER NOT NULL, 
    PRIMARY KEY (id)
);

CREATE INDEX ix_market_scan_logs_id ON market_scan_logs (id);

UPDATE alembic_version SET version_num='026_market_scan_scaffold' WHERE alembic_version.version_num = '025_account_activity_events';

-- Running upgrade 026_market_scan_scaffold -> 027_account_briefs

CREATE TABLE account_briefs (
    id UUID NOT NULL, 
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
    organization_id UUID, 
    company_id UUID NOT NULL, 
    summary VARCHAR NOT NULL, 
    findings JSON NOT NULL, 
    sources JSON NOT NULL, 
    generated_by VARCHAR NOT NULL, 
    model_used VARCHAR, 
    PRIMARY KEY (id), 
    FOREIGN KEY(organization_id) REFERENCES organizations (id), 
    FOREIGN KEY(company_id) REFERENCES companies (id)
);

CREATE INDEX ix_account_briefs_id ON account_briefs (id);

CREATE INDEX ix_account_briefs_organization_id ON account_briefs (organization_id);

CREATE INDEX ix_account_briefs_company_id ON account_briefs (company_id);

UPDATE alembic_version SET version_num='027_account_briefs' WHERE alembic_version.version_num = '026_market_scan_scaffold';

-- Running upgrade 027_account_briefs -> 028_password_reset_tokens

CREATE TABLE password_reset_tokens (
    id UUID NOT NULL, 
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
    user_id UUID NOT NULL, 
    token_hash VARCHAR NOT NULL, 
    expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
    used_at TIMESTAMP WITHOUT TIME ZONE, 
    PRIMARY KEY (id), 
    FOREIGN KEY(user_id) REFERENCES users (id)
);

CREATE INDEX ix_password_reset_tokens_id ON password_reset_tokens (id);

CREATE INDEX ix_password_reset_tokens_user_id ON password_reset_tokens (user_id);

CREATE UNIQUE INDEX ix_password_reset_tokens_token_hash ON password_reset_tokens (token_hash);

UPDATE alembic_version SET version_num='028_password_reset_tokens' WHERE alembic_version.version_num = '027_account_briefs';

-- Running upgrade 028_password_reset_tokens -> 029_team_profiles

CREATE TABLE team_profiles (
    id UUID NOT NULL, 
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
    team_id UUID NOT NULL, 
    organization_id UUID NOT NULL, 
    signal_weights JSON NOT NULL, 
    research_focus VARCHAR(2000), 
    PRIMARY KEY (id), 
    CONSTRAINT fk_team_profiles_team_id FOREIGN KEY(team_id) REFERENCES teams (id), 
    CONSTRAINT fk_team_profiles_organization_id FOREIGN KEY(organization_id) REFERENCES organizations (id)
);

CREATE INDEX ix_team_profiles_id ON team_profiles (id);

CREATE UNIQUE INDEX ix_team_profiles_team_id ON team_profiles (team_id);

CREATE INDEX ix_team_profiles_organization_id ON team_profiles (organization_id);

UPDATE alembic_version SET version_num='029_team_profiles' WHERE alembic_version.version_num = '028_password_reset_tokens';

-- Running upgrade 029_team_profiles -> 030_autopilot_configs

CREATE TABLE autopilot_configs (
    id UUID NOT NULL, 
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
    organization_id UUID NOT NULL, 
    enabled BOOLEAN NOT NULL, 
    confidence_threshold FLOAT NOT NULL, 
    excluded_company_ids JSON NOT NULL, 
    forbidden_words JSON NOT NULL, 
    PRIMARY KEY (id), 
    CONSTRAINT fk_autopilot_configs_organization_id FOREIGN KEY(organization_id) REFERENCES organizations (id)
);

CREATE INDEX ix_autopilot_configs_id ON autopilot_configs (id);

CREATE UNIQUE INDEX ix_autopilot_configs_organization_id ON autopilot_configs (organization_id);

UPDATE alembic_version SET version_num='030_autopilot_configs' WHERE alembic_version.version_num = '029_team_profiles';

-- Running upgrade 030_autopilot_configs -> 031_opportunity_type

ALTER TABLE opportunities ADD COLUMN opportunity_type VARCHAR(32) DEFAULT 'new_logo' NOT NULL;

CREATE INDEX ix_opportunities_opportunity_type ON opportunities (opportunity_type);

UPDATE alembic_version SET version_num='031_opportunity_type' WHERE alembic_version.version_num = '030_autopilot_configs';

-- Running upgrade 031_opportunity_type -> 032_federated_intelligence_opt_in

ALTER TABLE organizations ADD COLUMN federated_intelligence_opt_in BOOLEAN DEFAULT false NOT NULL;

UPDATE alembic_version SET version_num='032_federated_intelligence_opt_in' WHERE alembic_version.version_num = '031_opportunity_type';

-- Running upgrade 032_federated_intelligence_opt_in -> 033_lead_deal_context

ALTER TABLE leads ADD COLUMN estimated_value FLOAT;

ALTER TABLE leads ADD COLUMN source VARCHAR(128);

ALTER TABLE leads ADD COLUMN next_meeting_at TIMESTAMP WITHOUT TIME ZONE;

ALTER TABLE leads ADD COLUMN meetings_held_count INTEGER DEFAULT '0' NOT NULL;

ALTER TABLE leads ADD COLUMN photo_url VARCHAR(300000);

UPDATE alembic_version SET version_num='033_lead_deal_context' WHERE alembic_version.version_num = '032_federated_intelligence_opt_in';

-- Running upgrade 033_lead_deal_context -> 034_meetings

CREATE TABLE meetings (
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
    id UUID NOT NULL, 
    organization_id UUID, 
    created_by_user_id UUID NOT NULL, 
    opportunity_id UUID, 
    lead_id UUID, 
    title VARCHAR(300) NOT NULL, 
    purpose VARCHAR(2000), 
    starts_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
    duration_minutes INTEGER DEFAULT '30' NOT NULL, 
    meeting_url VARCHAR(1000), 
    attendee_user_ids JSON NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(organization_id) REFERENCES organizations (id), 
    FOREIGN KEY(created_by_user_id) REFERENCES users (id), 
    FOREIGN KEY(opportunity_id) REFERENCES opportunities (id), 
    FOREIGN KEY(lead_id) REFERENCES leads (id)
);

CREATE INDEX ix_meetings_id ON meetings (id);

CREATE INDEX ix_meetings_organization_id ON meetings (organization_id);

CREATE INDEX ix_meetings_created_by_user_id ON meetings (created_by_user_id);

CREATE INDEX ix_meetings_opportunity_id ON meetings (opportunity_id);

CREATE INDEX ix_meetings_lead_id ON meetings (lead_id);

CREATE INDEX ix_meetings_starts_at ON meetings (starts_at);

UPDATE alembic_version SET version_num='034_meetings' WHERE alembic_version.version_num = '033_lead_deal_context';

-- Running upgrade 034_meetings -> 035_meeting_color

ALTER TABLE meetings ADD COLUMN color VARCHAR(20);

UPDATE alembic_version SET version_num='035_meeting_color' WHERE alembic_version.version_num = '034_meetings';

-- Running upgrade 035_meeting_color -> 036_user_timezone

ALTER TABLE users ADD COLUMN timezone VARCHAR(64);

UPDATE alembic_version SET version_num='036_user_timezone' WHERE alembic_version.version_num = '035_meeting_color';

-- Running upgrade 036_user_timezone -> 037_opportunity_deal_context

ALTER TABLE opportunities ADD COLUMN source VARCHAR(100);

ALTER TABLE opportunities ADD COLUMN next_meeting_at TIMESTAMP WITHOUT TIME ZONE;

ALTER TABLE opportunities ADD COLUMN meetings_held_count INTEGER DEFAULT '0' NOT NULL;

ALTER TABLE opportunities ADD COLUMN photo_url VARCHAR(300000);

UPDATE alembic_version SET version_num='037_opportunity_deal_context' WHERE alembic_version.version_num = '036_user_timezone';

-- Running upgrade 037_opportunity_deal_context -> 038_company_fit_score

ALTER TABLE companies ADD COLUMN fit_score FLOAT;

CREATE INDEX ix_companies_fit_score ON companies (fit_score);

UPDATE alembic_version SET version_num='038_company_fit_score' WHERE alembic_version.version_num = '037_opportunity_deal_context';

-- Running upgrade 038_company_fit_score -> 039_meeting_completed_at

ALTER TABLE meetings ADD COLUMN completed_at TIMESTAMP WITHOUT TIME ZONE;

UPDATE alembic_version SET version_num='039_meeting_completed_at' WHERE alembic_version.version_num = '038_company_fit_score';

-- Running upgrade 039_meeting_completed_at -> 040_integration_connection_config

ALTER TABLE integration_connections ADD COLUMN config JSON;

UPDATE alembic_version SET version_num='040_integration_connection_config' WHERE alembic_version.version_num = '039_meeting_completed_at';

-- Running upgrade 040_integration_connection_config -> 041_admin_audit_log

CREATE TABLE admin_audit_logs (
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
    id UUID NOT NULL, 
    organization_id UUID NOT NULL, 
    actor_user_id UUID, 
    action VARCHAR NOT NULL, 
    entity_type VARCHAR, 
    entity_id UUID, 
    summary VARCHAR NOT NULL, 
    detail JSON, 
    ip_address VARCHAR, 
    PRIMARY KEY (id), 
    FOREIGN KEY(organization_id) REFERENCES organizations (id), 
    FOREIGN KEY(actor_user_id) REFERENCES users (id)
);

CREATE INDEX ix_admin_audit_logs_id ON admin_audit_logs (id);

CREATE INDEX ix_admin_audit_logs_organization_id ON admin_audit_logs (organization_id);

CREATE INDEX ix_admin_audit_logs_actor_user_id ON admin_audit_logs (actor_user_id);

CREATE INDEX ix_admin_audit_logs_action ON admin_audit_logs (action);

CREATE INDEX ix_admin_audit_logs_entity_id ON admin_audit_logs (entity_id);

UPDATE alembic_version SET version_num='041_admin_audit_log' WHERE alembic_version.version_num = '040_integration_connection_config';

-- Running upgrade 041_admin_audit_log -> 042_organization_deletion_request

ALTER TABLE organizations ADD COLUMN deletion_requested_at TIMESTAMP WITHOUT TIME ZONE;

ALTER TABLE organizations ADD COLUMN deletion_requested_by_user_id UUID;

UPDATE alembic_version SET version_num='042_organization_deletion_request' WHERE alembic_version.version_num = '041_admin_audit_log';

-- Running upgrade 042_organization_deletion_request -> 043_organization_sso

ALTER TABLE organizations ADD COLUMN sso_enabled BOOLEAN DEFAULT false NOT NULL;

ALTER TABLE organizations ADD COLUMN sso_connection_id VARCHAR;

ALTER TABLE organizations ADD COLUMN sso_domain VARCHAR;

CREATE INDEX ix_organizations_sso_domain ON organizations (sso_domain);

UPDATE alembic_version SET version_num='043_organization_sso' WHERE alembic_version.version_num = '042_organization_deletion_request';

-- Running upgrade 043_organization_sso -> 044_organization_billing

ALTER TABLE organizations ADD COLUMN stripe_customer_id VARCHAR;

ALTER TABLE organizations ADD COLUMN stripe_subscription_id VARCHAR;

ALTER TABLE organizations ADD COLUMN stripe_subscription_status VARCHAR;

CREATE INDEX ix_organizations_stripe_customer_id ON organizations (stripe_customer_id);

UPDATE alembic_version SET version_num='044_organization_billing' WHERE alembic_version.version_num = '043_organization_sso';

-- Running upgrade 044_organization_billing -> 045_meeting_attendee_responses

ALTER TABLE meetings ADD COLUMN attendee_responses JSON DEFAULT '{}' NOT NULL;

UPDATE alembic_version SET version_num='045_meeting_attendee_responses' WHERE alembic_version.version_num = '044_organization_billing';

-- Running upgrade 045_meeting_attendee_responses -> 046_organization_daily_digest

ALTER TABLE organizations ADD COLUMN digest_webhook_url VARCHAR;

ALTER TABLE organizations ADD COLUMN digest_enabled BOOLEAN DEFAULT false NOT NULL;

ALTER TABLE organizations ADD COLUMN digest_hour_utc INTEGER DEFAULT '8' NOT NULL;

ALTER TABLE organizations ADD COLUMN digest_last_sent_at TIMESTAMP WITHOUT TIME ZONE;

UPDATE alembic_version SET version_num='046_organization_daily_digest' WHERE alembic_version.version_num = '045_meeting_attendee_responses';

-- Running upgrade 046_organization_daily_digest -> 047_team_currency_quota_count

ALTER TABLE teams ADD COLUMN currency VARCHAR(3) DEFAULT 'USD' NOT NULL;

ALTER TABLE quotas ADD COLUMN target_count INTEGER;

UPDATE alembic_version SET version_num='047_team_currency_quota_count' WHERE alembic_version.version_num = '046_organization_daily_digest';

-- Running upgrade 047_team_currency_quota_count -> 048_opportunity_color

ALTER TABLE opportunities ADD COLUMN color VARCHAR(20);

UPDATE alembic_version SET version_num='048_opportunity_color' WHERE alembic_version.version_num = '047_team_currency_quota_count';

-- Running upgrade 048_opportunity_color -> 049_hot_lead_manual_temperature

ALTER TABLE hot_lead_scores ADD COLUMN manual_temperature FLOAT;

UPDATE alembic_version SET version_num='049_hot_lead_manual_temperature' WHERE alembic_version.version_num = '048_opportunity_color';

-- Running upgrade 049_hot_lead_manual_temperature -> 050_user_avatar_color

ALTER TABLE users ADD COLUMN avatar_color VARCHAR(20);

UPDATE alembic_version SET version_num='050_user_avatar_color' WHERE alembic_version.version_num = '049_hot_lead_manual_temperature';

-- Running upgrade 050_user_avatar_color -> 051_assistant_conversations

CREATE TABLE assistant_conversations (
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
    id UUID NOT NULL, 
    organization_id UUID, 
    user_id UUID NOT NULL, 
    title VARCHAR(200) NOT NULL, 
    messages JSON DEFAULT '[]' NOT NULL, 
    last_message_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(organization_id) REFERENCES organizations (id), 
    FOREIGN KEY(user_id) REFERENCES users (id)
);

CREATE INDEX ix_assistant_conversations_id ON assistant_conversations (id);

CREATE INDEX ix_assistant_conversations_organization_id ON assistant_conversations (organization_id);

CREATE INDEX ix_assistant_conversations_user_id ON assistant_conversations (user_id);

CREATE INDEX ix_assistant_conversations_last_message_at ON assistant_conversations (last_message_at);

UPDATE alembic_version SET version_num='051_assistant_conversations' WHERE alembic_version.version_num = '050_user_avatar_color';

COMMIT;

