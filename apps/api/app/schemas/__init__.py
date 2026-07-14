"""API-facing Pydantic schemas (DTOs)."""

from app.schemas.executive import (
    ActionItem,
    AgendaItem,
    ArtifactBundle,
    ArtifactEventPayload,
    EmailDraftArtifact,
    MeetingStructureArtifact,
    NextStepsArtifact,
)
from app.schemas.feedback import (
    OutcomeIn,
    OutcomeOut,
    SuccessHint,
    SuccessPatternOut,
)

__all__ = [
    # executive
    "ActionItem",
    "AgendaItem",
    "ArtifactBundle",
    "ArtifactEventPayload",
    "EmailDraftArtifact",
    "MeetingStructureArtifact",
    "NextStepsArtifact",
    # feedback
    "OutcomeIn",
    "OutcomeOut",
    "SuccessHint",
    "SuccessPatternOut",
    # signal
    "CompanyRef",
    "LeadRef",
    "OpportunityOut",
    "SignalIngestResult",
    "SignalOut",
    "SignalWebhookIn",
    # strategy
    "BattlecardCompany",
    "BattlecardLead",
    "BattlecardOut",
    "BattlecardSignal",
    "StrategySchema",
    "TimingWindow",
]
from app.schemas.signal import (
    CompanyRef,
    LeadRef,
    OpportunityOut,
    SignalIngestResult,
    SignalOut,
    SignalWebhookIn,
)
from app.schemas.strategy import (
    BattlecardCompany,
    BattlecardLead,
    BattlecardOut,
    BattlecardSignal,
    StrategySchema,
    TimingWindow,
)

__all__ = [
    "CompanyRef",
    "LeadRef",
    "OpportunityOut",
    "SignalIngestResult",
    "SignalOut",
    "SignalWebhookIn",
    "BattlecardCompany",
    "BattlecardLead",
    "BattlecardOut",
    "BattlecardSignal",
    "StrategySchema",
    "TimingWindow",
]
