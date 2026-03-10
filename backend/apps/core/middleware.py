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
        user = getattr(request, "user", None)
        # Only store authenticated users (not AnonymousUser)
        if user and user.is_authenticated:
            set_current_user(user)
        else:
            set_current_user(None)

        response = self.get_response(request)

        # Clear after request to avoid leaking between threads in thread pools
        set_current_user(None)
        return response
