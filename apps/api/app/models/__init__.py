"""SQLModel entities for the BEE domain.

Importing every model here ensures their table metadata is registered with the
shared ``SQLModel.metadata`` object, which :func:`app.core.database.init_db`
relies on to create the schema.
"""

from app.models.account_activity import AccountActivityEvent, AccountActivityEventType
from app.models.account_brief import AccountBrief
from app.models.admin_audit_log import AdminAuditLog
from app.models.anomaly import AnomalyAlert
from app.models.audit_trail import AuditEntry
from app.models.autopilot_config import AutopilotConfig
from app.models.base import (
    ActionStatus,
    ActionType,
    BehavioralEventType,
    InsightType,
    LeadStatus,
    OpportunityStatus,
    SignalSource,
    SignalType,
    UserRole,
    VariantStatus,
)
from app.models.brand_profile import BrandFragment, VoiceProfile
from app.models.company import Company
from app.models.contact_submission import ContactSubmission
from app.models.correction import ArtifactCorrection, UserStyleProfile
from app.models.dark_funnel import DarkFunnelSignal, HotLeadScore
from app.models.dead_letter import FailedEvent
from app.models.engagement_event import IncomingEngagementEvent
from app.models.integration_connection import IntegrationConnection
from app.models.lead import Lead
from app.models.market_insight import MarketInsight
from app.models.market_scan_log import MarketScanLog
from app.models.meeting import Meeting
from app.models.message_template import MessageTemplate
from app.models.network import NetworkConnection
from app.models.opportunity import Opportunity
from app.models.opportunity_task import OpportunityTask
from app.models.organization import Organization
from app.models.organization_api_key import OrganizationApiKey
from app.models.outbound_webhook import OutboundWebhook
from app.models.password_reset_token import PasswordResetToken
from app.models.pending_action import PendingAction
from app.models.psychographic import LeadPsychographic
from app.models.quota import Quota
from app.models.saved_view import SavedView
from app.models.sequence import DynamicSequence, SequenceExecution
from app.models.signal import Signal
from app.models.strategy_outcome import StrategyOutcome
from app.models.tactic_variant import TacticVariant, VariantOutcome
from app.models.team import Team
from app.models.team_profile import TeamProfile
from app.models.user import User
from app.models.workflow_task import WorkflowTask

__all__ = [
    "AccountActivityEvent",
    "AccountActivityEventType",
    "AccountBrief",
    "Company",
    "ContactSubmission",
    "Lead",
    "MarketInsight",
    "MarketScanLog",
    "Meeting",
    "MessageTemplate",
    "PendingAction",
    "Quota",
    "SavedView",
    "Signal",
    "Opportunity",
    "OpportunityTask",
    "StrategyOutcome",
    "TacticVariant",
    "VariantOutcome",
    "WorkflowTask",
    "VoiceProfile",
    "BrandFragment",
    "IncomingEngagementEvent",
    "IntegrationConnection",
    "DynamicSequence",
    "SequenceExecution",
    "LeadPsychographic",
    "DarkFunnelSignal",
    "HotLeadScore",
    "NetworkConnection",
    "AuditEntry",
    "AdminAuditLog",
    "AutopilotConfig",
    "FailedEvent",
    "AnomalyAlert",
    "ArtifactCorrection",
    "UserStyleProfile",
    "Organization",
    "OrganizationApiKey",
    "OutboundWebhook",
    "PasswordResetToken",
    "Team",
    "TeamProfile",
    "User",
    "ActionStatus",
    "ActionType",
    "BehavioralEventType",
    "InsightType",
    "LeadStatus",
    "OpportunityStatus",
    "SignalSource",
    "SignalType",
    "UserRole",
    "VariantStatus",
]
