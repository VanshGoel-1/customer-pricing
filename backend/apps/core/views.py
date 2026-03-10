from django.http import JsonResponse


def health(request):
    """
    Lightweight liveness probe used by docker-compose healthcheck.
    Lives at /health/ — outside /api/ — so BotGuardMiddleware never inspects it.
    Returns 200 as soon as Django can handle a request (DB not checked here;
    migrations ensure the DB is ready before gunicorn starts).
    """
    return JsonResponse({"status": "ok"})
