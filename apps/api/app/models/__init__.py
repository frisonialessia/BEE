"""SQLModel entities for the BEE domain.

Importing every model here ensures their table metadata is registered with the
shared ``SQLModel.metadata`` object, which :func:`app.core.database.init_db`
relies on to create the schema.
"""

from app.models.base import (
    LeadStatus,
    OpportunityStatus,
    SignalSource,
    SignalType,
)
from app.models.company import Company
from app.models.lead import Lead
from app.models.opportunity import Opportunity
from app.models.signal import Signal

__all__ = [
    "Company",
    "Lead",
    "Signal",
    "Opportunity",
    "LeadStatus",
    "OpportunityStatus",
    "SignalSource",
    "SignalType",
]
