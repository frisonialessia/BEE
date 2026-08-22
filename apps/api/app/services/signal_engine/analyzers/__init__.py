"""Signal analyzers package.

Importing this package registers all built-in analyzers as a side effect (each
module uses the ``@register_analyzer`` decorator). To add your own analyzer,
create a module here, decorate the class, and import it below — or rely on the
engine's autoloading in :mod:`app.services.signal_engine.engine`.
"""

# Importing these modules triggers registration of the built-in analyzers.
from app.services.signal_engine.analyzers import (
    keyword_analyzers,  # noqa: F401
    llm_analyzer,  # noqa: F401  (registers LLMAnalyzer; no-op if AI disabled)
)
from app.services.signal_engine.analyzers.base import (
    AnalysisResult,
    SignalAnalyzer,
)
from app.services.signal_engine.analyzers.registry import (
    get_analyzers,
    register_analyzer,
)

__all__ = [
    "AnalysisResult",
    "SignalAnalyzer",
    "get_analyzers",
    "register_analyzer",
]
