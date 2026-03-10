from .base import *  # noqa: F401, F403

# ---------------------------------------------------------------------------
# Production hardening — mirrors Odoo's production security stance
# ---------------------------------------------------------------------------
DEBUG = False

# HTTPS headers (Nginx terminates SSL and sets these)
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"

SESSION_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_SECURE = True

# Logging — errors only to stderr (captured by Docker)
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "WARNING"},
    "loggers": {
        "django": {"handlers": ["console"], "level": "WARNING", "propagate": False},
    },
}
