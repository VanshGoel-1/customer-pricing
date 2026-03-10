"""
Role-based permission classes for DRF views.

Mirrors Odoo's access rights system:
  - group_sale_salesman       → CASHIER  (read + create orders)
  - group_sale_salesman_all   → MANAGER  (+ manage customers/products/prices)
  - base.group_system         → ADMIN    (everything + user management)

Usage on views:
    permission_classes = [IsAuthenticated, IsManagerOrAbove]
"""
from rest_framework.permissions import BasePermission, IsAuthenticated  # noqa: F401


class IsAdmin(BasePermission):
    """Only users with role='admin' are allowed."""

    message = "Admin access required."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == "admin"
        )


class IsManagerOrAbove(BasePermission):
    """Managers and admins are allowed."""

    message = "Manager or admin access required."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in ("manager", "admin")
        )


class IsAnyRole(BasePermission):
    """Any authenticated user with a valid role (admin, manager, cashier)."""

    message = "Authentication required."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in ("admin", "manager", "cashier")
        )


class ReadOnly(BasePermission):
    """
    Allow GET / HEAD / OPTIONS to all authenticated users;
    restrict mutating methods to the combined permission.

    Pair with another permission class using | operator:
        permission_classes = [IsAuthenticated, IsManagerOrAbove | ReadOnly]
    """

    def has_permission(self, request, view):
        return request.method in ("GET", "HEAD", "OPTIONS")
