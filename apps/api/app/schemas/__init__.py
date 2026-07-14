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
from app.schemas.insights import MarketInsightOut, MarketInsightRef, TrendAnalysisResult
from app.schemas.orchestrator import (
    ApprovalIn,
    OrchestratorStatusOut,
    PendingActionOut,
    RejectionIn,
)
from app.schemas.predictor import OutcomeWithPrediction, ResourcePrediction
from app.schemas.signal import (
    CompanyRef,
    LeadRef,
    OpportunityOut,
    SignalIngestResult,
    SignalOut,
    SignalWebhookIn,
)
from app.schemas.simulator import RevenueSimulation, SimulatorScenario
from app.schemas.strategy import (
    BattlecardCompany,
    BattlecardLead,
    BattlecardOut,
    BattlecardSignal,
    StrategySchema,
    TimingWindow,
)
from app.schemas.variants import ActiveVariantRef, VariantCreateIn, VariantOut
from app.schemas.workflow import BeeEvent, WorkflowStatusOut, WorkflowTaskOut

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
    # insights
    "MarketInsightOut",
    "MarketInsightRef",
    "TrendAnalysisResult",
    # orchestrator
    "ApprovalIn",
    "OrchestratorStatusOut",
    "PendingActionOut",
    "RejectionIn",
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
    # variants
    "ActiveVariantRef",
    "VariantCreateIn",
    "VariantOut",
    # predictor
    "OutcomeWithPrediction",
    "ResourcePrediction",
    # simulator
    "RevenueSimulation",
    "SimulatorScenario",
    # workflow
    "BeeEvent",
    "WorkflowStatusOut",
    "WorkflowTaskOut",
]
