"""SQLModel entities for the BEE domain.

Importing every model here ensures their table metadata is registered with the
shared ``SQLModel.metadata`` object, which :func:`app.core.database.init_db`
relies on to create the schema.
"""

from app.models.base import (
    ActionStatus,
    ActionType,
    BehavioralEventType,
    InsightType,
    LeadStatus,
    OpportunityStatus,
    SignalSource,
    SignalType,
    VariantStatus,
)
from app.models.brand_profile import BrandFragment, VoiceProfile
from app.models.company import Company
from app.models.dark_funnel import DarkFunnelSignal, HotLeadScore
from app.models.engagement_event import IncomingEngagementEvent
from app.models.lead import Lead
from app.models.market_insight import MarketInsight
from app.models.network import NetworkConnection
from app.models.opportunity import Opportunity
from app.models.pending_action import PendingAction
from app.models.psychographic import LeadPsychographic
from app.models.sequence import DynamicSequence, SequenceExecution
from app.models.signal import Signal
from app.models.strategy_outcome import StrategyOutcome
from app.models.tactic_variant import TacticVariant, VariantOutcome
from app.models.workflow_task import WorkflowTask

__all__ = [
    "Company",
    "Lead",
    "MarketInsight",
    "PendingAction",
    "Signal",
    "Opportunity",
    "StrategyOutcome",
    "TacticVariant",
    "VariantOutcome",
    "WorkflowTask",
    "VoiceProfile",
    "BrandFragment",
    "IncomingEngagementEvent",
    "DynamicSequence",
    "SequenceExecution",
    "LeadPsychographic",
    "DarkFunnelSignal",
    "HotLeadScore",
    "NetworkConnection",
    "ActionStatus",
    "ActionType",
    "BehavioralEventType",
    "InsightType",
    "LeadStatus",
    "OpportunityStatus",
    "SignalSource",
    "SignalType",
    "VariantStatus",
]
