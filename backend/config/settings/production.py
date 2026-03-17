import os

from .base import *  # noqa: F401, F403

# ---------------------------------------------------------------------------
# Production hardening — mirrors Odoo's production security stance
# ---------------------------------------------------------------------------
DEBUG = False

# Render automatically sets RENDER_EXTERNAL_HOSTNAME to the service's public
# hostname. Appending it means we never need to hardcode it in env vars.
_render_host = os.environ.get("RENDER_EXTERNAL_HOSTNAME")
if _render_host:
    ALLOWED_HOSTS = list(ALLOWED_HOSTS) + [_render_host]

# WhiteNoise — serve Django static files directly from gunicorn (no Nginx needed)
# Must come right after SecurityMiddleware.
_wn = "whitenoise.middleware.WhiteNoiseMiddleware"
if _wn not in MIDDLEWARE:
    _idx = MIDDLEWARE.index("django.middleware.security.SecurityMiddleware")
    MIDDLEWARE = list(MIDDLEWARE)
    MIDDLEWARE.insert(_idx + 1, _wn)

STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"

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
