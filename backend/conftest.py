import pytest
from django.core.cache import cache


@pytest.fixture(autouse=True)
def _clear_cache():
    """Throttle counters live in the cache; reset them so tests don't leak into each other."""
    cache.clear()
    yield
    cache.clear()
