from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from apps.core.permissions import IsAdmin
from apps.core.throttling import AuthThrottle, LoginRateThrottle, TokenRefreshThrottle

from .models import User
from .serializers import (
    ChangePasswordSerializer,
    CustomTokenObtainPairSerializer,
    UserCreateSerializer,
    UserSerializer,
)


class CustomTokenObtainPairView(TokenObtainPairView):
    """Login — returns access + refresh tokens with role embedded."""
    serializer_class = CustomTokenObtainPairSerializer
    throttle_classes = [LoginRateThrottle]  # 5 attempts/min per IP — credential-stuffing guard


class ThrottledTokenRefreshView(TokenRefreshView):
    """Token refresh with token-stuffing guard (10 attempts/min per IP)."""
    throttle_classes = [TokenRefreshThrottle]


class LogoutView(APIView):
    """
    Blacklist the refresh token on logout.
    Even if the access token hasn't expired, the refresh token
    cannot be used to obtain new access tokens.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            refresh_token = request.data["refresh"]
            token = RefreshToken(refresh_token)
            token.blacklist()
            return Response({"success": True, "message": "Logged out successfully."})
        except Exception:
            return Response(
                {"success": False, "error": {"code": "invalid_token", "message": "Invalid or expired token."}},
                status=status.HTTP_400_BAD_REQUEST,
            )


class UserListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/v1/users/  — list all users (admin only)
    POST /api/v1/users/  — create a new user (admin only)
    """
    queryset = User.objects.all().order_by("name")
    permission_classes = [IsAuthenticated, IsAdmin]

    def get_serializer_class(self):
        if self.request.method == "POST":
            return UserCreateSerializer
        return UserSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            {"success": True, "data": UserSerializer(user).data},
            status=status.HTTP_201_CREATED,
        )


class UserDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET    /api/v1/users/{id}/  — retrieve (admin only)
    PATCH  /api/v1/users/{id}/  — update (admin only)
    DELETE /api/v1/users/{id}/  — deactivate, not hard-delete (admin only)
    """
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated, IsAdmin]

    def destroy(self, request, *args, **kwargs):
        # Soft-delete: deactivate instead of hard delete
        # Same pattern as Odoo's archive mechanism
        user = self.get_object()
        user.is_active = False
        user.save(update_fields=["is_active", "updated_at"])
        return Response({"success": True, "message": "User deactivated."})


class MeView(APIView):
    """GET /api/v1/users/me/ — current user's profile."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"success": True, "data": UserSerializer(request.user).data})


class ChangePasswordView(APIView):
    """POST /api/v1/users/me/change-password/ — change own password."""
    permission_classes = [IsAuthenticated]
    throttle_classes = [AuthThrottle]  # 5 attempts/min — brute-force guard

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save(update_fields=["password", "updated_at"])
        return Response({"success": True, "message": "Password changed. Please log in again."})
