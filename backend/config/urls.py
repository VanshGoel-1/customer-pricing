"""
Root URL configuration.

All API routes are versioned under /api/v1/.
Each domain is mounted via include() with its own app_name namespace,
so URL names are referenced as  "namespace:name"  (e.g. "orders:order-detail").
"""
from django.contrib import admin
from django.urls import include, path

from apps.core.views import health

urlpatterns = [
    # Liveness probe — used by docker-compose healthcheck, outside /api/ so
    # BotGuardMiddleware never inspects it (no User-Agent requirement).
    path("health/", health, name="health"),

    # Django admin (internal tooling — not versioned)
    path("admin/", admin.site.urls),

    # ── API v1 ────────────────────────────────────────────────────────────────
    # Auth: login / token-refresh / logout
    path("api/v1/auth/",     include("apps.users.auth_urls")),

    # Domain APIs
    path("api/v1/users/",    include("apps.users.urls")),
    path("api/v1/products/", include("apps.products.urls")),
    path("api/v1/customers/",include("apps.customers.urls")),
    path("api/v1/pricing/",  include("apps.pricing.urls")),
    path("api/v1/orders/",   include("apps.orders.urls")),
    path("api/v1/cashbook/",   include("apps.cashbook.urls")),
    path("api/v1/suppliers/",  include("apps.suppliers.urls")),
    path("api/v1/purchases/",  include("apps.suppliers.purchases_urls")),
]
