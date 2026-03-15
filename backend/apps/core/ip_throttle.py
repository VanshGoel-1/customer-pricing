"""
Layer 2 of the rate-limiting stack: IP-level sliding-window burst cap.

Runs after BotGuardMiddleware but before DRF views so a single IP
cannot flood any endpoint regardless of authentication status.

Algorithm: sliding window counter using Django's cache.
  - Count requests in the last WINDOW_SECONDS seconds per IP.
  - If count > LIMIT, return 429 with Retry-After header.
  - Separate, tighter limits for unauthenticated requests.

This is intentionally simple (no Redis required) — it uses Django's
built-in LocMemCache which is fast and needs zero extra dependencies.
For multi-container deployments, swap the cache backend to Redis.

Limits:
  Unauthenticated  →  30  req / 60 s  (scraper / bot floor)
  Authenticated    →  120 req / 60 s  (normal user ceiling)
  Auth endpoints   →  10  req / 60 s  (extra tight — login, refresh)
"""
import time

from django.core.cache import caches
from django.http import JsonResponse

# Use a dedicated cache bucket so throttle counters never evict app data
_CACHE = caches["throttle"]

# ---------------------------------------------------------------------------
# Limits  (requests, window_seconds)
# ---------------------------------------------------------------------------
_ANON_LIMIT = (30, 60)     # unauthenticated — 30 req/min
_AUTH_LIMIT = (120, 60)    # authenticated   — 120 req/min
_AUTH_EP_LIMIT = (10, 60)  # auth endpoints  — 10 req/min (login/refresh)

# API paths that get the tightest IP limit regardless of auth state
_AUTH_PATHS = frozenset({
    "/api/v1/auth/login/",
    "/api/v1/auth/refresh/",
})


def _get_client_ip(request):
    """
    Extract the real client IP from the X-Real-IP header set by Nginx.

    Nginx sets:  proxy_set_header X-Real-IP $remote_addr;
    $remote_addr is the actual TCP-connecting IP — it cannot be forged by
    the client because it comes from the OS socket, not from request headers.

    X-Forwarded-For is intentionally NOT used here: Nginx appends to any
    existing XFF the client sends, so the leftmost value is attacker-controlled
    and would allow unlimited rate-limit bypass by rotating fake IPs.
    """
    return (
        request.META.get("HTTP_X_REAL_IP")
        or request.META.get("REMOTE_ADDR", "unknown")
    )


def _sliding_window_check(cache_key, limit, window):
    """
    Sliding window counter.
    Returns (allowed: bool, current_count: int, retry_after: int).
    """
    now = int(time.time())
    window_start = now - window

    # Fetch the list of timestamps for this key
    timestamps = _CACHE.get(cache_key, [])

    # Drop timestamps outside the window
    timestamps = [t for t in timestamps if t > window_start]

    if len(timestamps) >= limit:
        # Oldest timestamp tells us when the window clears
        retry_after = window - (now - timestamps[0]) + 1
        return False, len(timestamps), max(retry_after, 1)

    # Record this request
    timestamps.append(now)
    _CACHE.set(cache_key, timestamps, timeout=window)
    return True, len(timestamps), 0


class IpThrottleMiddleware:
    """
    Positioned after BotGuardMiddleware in settings.MIDDLEWARE.
    Applies the appropriate limit based on path + auth state.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Only enforce on API paths
        if not request.path_info.startswith("/api/"):
            return self.get_response(request)

        # CORS preflight — always pass through
        if request.method == "OPTIONS":
            return self.get_response(request)

        ip = _get_client_ip(request)
        path = request.path_info

        # Determine which limit applies
        if path in _AUTH_PATHS:
            limit, window = _AUTH_EP_LIMIT
            cache_key = f"ip_throttle:auth_ep:{ip}"
        elif getattr(request, "user", None) and request.user.is_authenticated:
            limit, window = _AUTH_LIMIT
            cache_key = f"ip_throttle:auth:{ip}"
        else:
            limit, window = _ANON_LIMIT
            cache_key = f"ip_throttle:anon:{ip}"

        allowed, count, retry_after = _sliding_window_check(cache_key, limit, window)

        if not allowed:
            response = JsonResponse(
                {
                    "success": False,
                    "error": {
                        "code": "rate_limit_exceeded",
                        "message": f"Too many requests from this IP. Try again in {retry_after} seconds.",
                        "retry_after": retry_after,
                    },
                },
                status=429,
            )
            response["Retry-After"] = str(retry_after)
            response["X-RateLimit-Limit"] = str(limit)
            response["X-RateLimit-Remaining"] = "0"
            return response

        response = self.get_response(request)

        # Attach rate-limit headers to every response so clients can self-throttle
        response["X-RateLimit-Limit"] = str(limit)
        response["X-RateLimit-Remaining"] = str(max(limit - count, 0))
        response["X-RateLimit-Window"] = f"{window}s"
        return response
