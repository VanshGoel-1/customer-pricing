"""
Shared pytest fixtures for the entire backend test suite.
"""
import pytest
from django.contrib.auth import get_user_model

User = get_user_model()

# ---------------------------------------------------------------------------
# User fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        email="admin@test.com", name="Admin", password="adminpass123", role="admin"
    )


@pytest.fixture
def manager_user(db):
    return User.objects.create_user(
        email="manager@test.com", name="Manager", password="managerpass123", role="manager"
    )


@pytest.fixture
def cashier_user(db):
    return User.objects.create_user(
        email="cashier@test.com", name="Cashier", password="cashierpass123", role="cashier"
    )


# ---------------------------------------------------------------------------
# API client fixtures
# Each creates its OWN APIClient instance so tests that use multiple role
# clients (e.g. admin + cashier) don't share state via force_authenticate.
# ---------------------------------------------------------------------------

def _make_client(**kwargs):
    from rest_framework.test import APIClient
    # BotGuardMiddleware requires a User-Agent on all /api/ paths.
    return APIClient(HTTP_USER_AGENT="TestClient/1.0", **kwargs)


@pytest.fixture
def api_client():
    """Unauthenticated API client."""
    return _make_client()


@pytest.fixture
def admin_api_client(admin_user):
    client = _make_client()
    client.force_authenticate(user=admin_user)
    return client


@pytest.fixture
def manager_api_client(manager_user):
    client = _make_client()
    client.force_authenticate(user=manager_user)
    return client


@pytest.fixture
def cashier_api_client(cashier_user):
    client = _make_client()
    client.force_authenticate(user=cashier_user)
    return client


# ---------------------------------------------------------------------------
# Throttle isolation
# IpThrottleMiddleware and DRF throttle both use in-memory cache buckets.
# Clear them before every test so rate counters from one test don't bleed
# into the next and cause spurious 429 responses.
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def clear_throttle_cache():
    from django.core.cache import cache, caches
    caches["throttle"].clear()
    cache.clear()
    yield
    caches["throttle"].clear()
    cache.clear()
