"""
Layer 1 of the rate-limiting stack: Bot Guard middleware.

Runs before DRF throttling so malformed / automated requests never
reach the ORM or business logic — they are rejected cheaply at the
WSGI layer.

What it blocks:
  1. Requests with no User-Agent header (virtually all real browsers send one)
  2. Known headless browser / scraper / vulnerability scanner signatures
  3. HTTP methods that this API never serves (TRACE, CONNECT, etc.)

What it does NOT do:
  - Block legitimate search engine crawlers on public pages
    (this API has none — every endpoint requires authentication)
  - Replace DRF throttling (Layer 2 & 3 still apply)
"""
import re

from django.http import JsonResponse

# ---------------------------------------------------------------------------
# Known bad User-Agent patterns
# Compiled once at import time — no cost per request.
# ---------------------------------------------------------------------------
_BOT_PATTERN = re.compile(
    r"""
    python-requests        |   # raw requests library — no browser UA set
    python-urllib          |   # urllib default UA
    go-http-client         |   # Go's net/http default UA
    java/                  |   # Java URLConnection default UA
    curl/                  |   # cURL default (legitimate devs override this)
    wget/                  |   # wget default
    scrapy                 |   # Scrapy framework
    httpx                  |   # httpx default (no custom UA)
    aiohttp                |   # aiohttp default
    libwww-perl            |   # Perl LWP
    nikto                  |   # Nikto vulnerability scanner
    sqlmap                 |   # SQLMap injection scanner
    nmap                   |   # nmap HTTP probe
    masscan                |   # masscan
    zgrab                  |   # zgrab internet scanner
    dirbuster              |   # DirBuster directory scanner
    gobuster               |   # GoBuster directory scanner
    wfuzz                  |   # wfuzz fuzzer
    hydra                  |   # Hydra brute-force tool
    nuclei                 |   # Nuclei vulnerability scanner
    acunetix               |   # Acunetix web scanner
    burpsuite              |   # Burp Suite scanner UA
    semrush                |   # SEMrush crawler
    dataprovider               # dataprovider.com crawler
    """,
    re.IGNORECASE | re.VERBOSE,
)

# Methods this JSON API never serves — reject immediately
_DISALLOWED_METHODS = frozenset({"TRACE", "CONNECT", "PROPFIND", "PROPPATCH"})


def _json_403(message):
    return JsonResponse(
        {"success": False, "error": {"code": "forbidden", "message": message}},
        status=403,
    )


def _json_405(method):
    return JsonResponse(
        {"success": False, "error": {"code": "method_not_allowed", "message": f"{method} is not allowed."}},
        status=405,
    )


class BotGuardMiddleware:
    """
    WSGI middleware — positioned as the second middleware in the stack
    (after CorsMiddleware, before SecurityMiddleware) so CORS preflight
    OPTIONS requests from the browser still pass through correctly.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # ── 1. Block disallowed HTTP methods ─────────────────────────────
        if request.method in _DISALLOWED_METHODS:
            return _json_405(request.method)

        # ── 2. Allow CORS preflight unconditionally ───────────────────────
        # Browsers send OPTIONS before POST/PUT; blocking it breaks the app.
        if request.method == "OPTIONS":
            return self.get_response(request)

        # ── 3. Require a User-Agent on API paths ─────────────────────────
        # Django admin and static files are excluded — they have their own
        # auth and are served differently.
        path = request.path_info
        if path.startswith("/api/"):
            ua = request.META.get("HTTP_USER_AGENT", "").strip()

            if not ua:
                return _json_403(
                    "Requests to this API must include a User-Agent header."
                )

            if _BOT_PATTERN.search(ua):
                return _json_403(
                    "Automated scanning tools are not permitted."
                )

        return self.get_response(request)
