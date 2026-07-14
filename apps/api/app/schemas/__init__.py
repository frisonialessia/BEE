"""API-facing Pydantic schemas (DTOs)."""

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
