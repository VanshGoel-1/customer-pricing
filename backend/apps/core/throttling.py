"""
Layer 3 of the rate-limiting stack: DRF per-user, per-endpoint throttles.

These run inside DRF after authentication, so the cache key includes
the authenticated user ID — a much more precise signal than IP alone.

Throttle tiers by risk level
─────────────────────────────────────────────────────────────────────────────
Tier        Scope          Limit       Endpoint(s)
─────────────────────────────────────────────────────────────────────────────
CRITICAL    IP (anon)      5 / min     Login — credential stuffing
CRITICAL    IP (anon)      10 / min    Token refresh — token stuffing
HIGH        user           5 / min     Change-password — brute old_password
HIGH        user           10 / min    Phone lookup — customer enumeration
HIGH        user           10 / min    Order confirm — ledger flooding
HIGH        user           5 / min     Payment / ledger post — balance fraud
MEDIUM      user           20 / min    Order create — fake order flood
MEDIUM      user           20 / min    Set price — price-history spam
BASELINE    user           300 / min   Everything else (authenticated reads)
─────────────────────────────────────────────────────────────────────────────

All throttle classes inherit DRF's SimpleRateThrottle which uses
Django's cache (configured as the "throttle" cache in settings).
"""
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle


# ---------------------------------------------------------------------------
# Unauthenticated (IP-keyed) — for endpoints that accept anonymous requests
# ---------------------------------------------------------------------------

class LoginRateThrottle(AnonRateThrottle):
    """
    5 attempts/min per IP on the login endpoint.
    After 5 failed attempts the IP must wait 60 seconds.
    This is the primary defence against credential-stuffing attacks.
    """
    scope = "login"


class TokenRefreshThrottle(AnonRateThrottle):
    """
    10 refresh attempts/min per IP.
    Prevents rapid token-stuffing (submitting many stolen refresh tokens
    to test which are still valid).
    """
    scope = "token_refresh"


# ---------------------------------------------------------------------------
# Authenticated (user-ID-keyed) — applied per user, not per IP
# ---------------------------------------------------------------------------

class AuthThrottle(UserRateThrottle):
    """
    5 attempts/min on password-sensitive operations (change-password).
    Prevents brute-forcing the old_password field even from a valid session.
    """
    scope = "auth_sensitive"


class PhoneLookupThrottle(UserRateThrottle):
    """
    10 lookups/min per authenticated user on the phone-lookup endpoint.
    Prevents systematic enumeration of all customer phone numbers.
    """
    scope = "phone_lookup"


class OrderCreateThrottle(UserRateThrottle):
    """
    20 order creations/min per user.
    A cashier creating a genuine bill takes at least 30 seconds.
    Anything faster than 20/min is automated abuse.
    """
    scope = "order_create"


class OrderActionThrottle(UserRateThrottle):
    """
    10 state-change actions/min per user.
    Covers confirm, mark-paid, cancel — each posts a ledger entry.
    Prevents rapid ledger flooding from a compromised account.
    """
    scope = "order_action"


class PaymentPostThrottle(UserRateThrottle):
    """
    5 manual ledger entries/min per user.
    Prevents rapid fake-payment posting that would zero out balances.
    Manager+ only, so this is defence-in-depth against insider abuse.
    """
    scope = "payment_post"


class PriceSetThrottle(UserRateThrottle):
    """
    20 price-set wizard calls/min per user.
    Each call creates an immutable PriceHistory row — flooding it would
    inflate the audit log with noise.
    """
    scope = "price_set"
