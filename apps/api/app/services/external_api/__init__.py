"""External API Ingestion Layer — connect BEE to the outside world.

Centralises all outbound calls to LinkedIn, G2, Google Search, and Capterra
behind :class:`ExternalAPIOrchestrator` with global rate limiting and
:c:class:`SecretManager` credential access.

Inbound external events arrive via ``POST /api/v1/webhooks/receive`` and are
processed asynchronously by :class:`IngestionWorker`.
"""

from app.services.external_api.orchestrator import ExternalAPIOrchestrator
from app.services.external_api.worker import IngestionWorker, get_ingestion_worker

__all__ = ["ExternalAPIOrchestrator", "IngestionWorker", "get_ingestion_worker"]
