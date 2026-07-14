"""SQLModel entities for the BEE domain.

Importing every model here ensures their table metadata is registered with the
shared ``SQLModel.metadata`` object, which :func:`app.core.database.init_db`
relies on to create the schema.
"""

from app.models.base import (
    BehavioralEventType,
    LeadStatus,
    OpportunityStatus,
    SignalSource,
    SignalType,
)
from app.models.company import Company
from app.models.lead import Lead
from app.models.opportunity import Opportunity
from app.models.signal import Signal
from app.models.strategy_outcome import StrategyOutcome

__all__ = [
    "Company",
    "Lead",
    "Signal",
    "Opportunity",
    "StrategyOutcome",
    "BehavioralEventType",
    "LeadStatus",
    "OpportunityStatus",
    "SignalSource",
    "SignalType",
]
