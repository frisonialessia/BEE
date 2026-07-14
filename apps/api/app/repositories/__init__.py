"""Repository layer: encapsulated data access for each aggregate."""

from app.repositories.company import CompanyRepository
from app.repositories.lead import LeadRepository
from app.repositories.opportunity import OpportunityRepository
from app.repositories.signal import SignalRepository

__all__ = [
    "CompanyRepository",
    "LeadRepository",
    "OpportunityRepository",
    "SignalRepository",
]
