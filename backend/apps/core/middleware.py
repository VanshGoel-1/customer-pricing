"""
Middleware that injects the authenticated request user into thread-local
storage so AuditModel.save() can read it without explicit passing —
the same mechanism Odoo uses with self.env.user.
"""
from apps.core.thread_local import set_current_user


class RequestUserMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Note: request.user here is set by Django's session auth (not JWT).
        # DRF JWT authentication runs later inside the view layer, so we cannot
        # rely on request.user being correct at this point for API requests.
        # Views that create AuditModel instances must pass created_by=request.user
        # explicitly. This middleware handles the session-auth case and cleanup.
        user = getattr(request, "user", None)
        if user and user.is_authenticated:
            set_current_user(user)
        else:
            set_current_user(None)

        response = self.get_response(request)

        # Always clear after request to avoid leaking between threads
        set_current_user(None)
        return response
