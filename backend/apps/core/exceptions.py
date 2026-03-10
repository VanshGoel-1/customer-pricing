"""
Consistent JSON error responses across all endpoints.
Replaces DRF's default handler so every error — validation, auth,
permission, 404, 500 — returns the same envelope shape:

    {
        "success": false,
        "error": {
            "code": "validation_error",
            "message": "...",
            "detail": { ... }   // field-level errors when applicable
        }
    }
"""
from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.http import Http404
from rest_framework import status
from rest_framework.exceptions import (
    AuthenticationFailed,
    MethodNotAllowed,
    NotAuthenticated,
    NotFound,
    PermissionDenied,
    Throttled,
    ValidationError,
)
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler


def custom_exception_handler(exc, context):
    # Let DRF convert Django exceptions first
    if isinstance(exc, Http404):
        exc = NotFound()
    elif isinstance(exc, DjangoPermissionDenied):
        exc = PermissionDenied()

    response = drf_exception_handler(exc, context)

    if response is None:
        # Unhandled exception — 500
        return Response(
            {
                "success": False,
                "error": {
                    "code": "internal_server_error",
                    "message": "An unexpected error occurred.",
                    "detail": {},
                },
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    # Map exception type to a stable code string
    code_map = {
        ValidationError: "validation_error",
        NotAuthenticated: "not_authenticated",
        AuthenticationFailed: "authentication_failed",
        PermissionDenied: "permission_denied",
        NotFound: "not_found",
        MethodNotAllowed: "method_not_allowed",
        Throttled: "throttled",
    }
    code = code_map.get(type(exc), "error")

    detail = response.data
    # Flatten single-string messages
    if isinstance(detail, list) and len(detail) == 1:
        message = str(detail[0])
        detail = {}
    elif isinstance(detail, dict) and "detail" in detail:
        message = str(detail.pop("detail"))
    else:
        message = str(exc)
        if isinstance(detail, dict):
            pass  # keep field errors as detail
        else:
            detail = {}

    response.data = {
        "success": False,
        "error": {
            "code": code,
            "message": message,
            "detail": detail if isinstance(detail, dict) else {},
        },
    }
    return response
