"""
Auth-specific URL patterns.

Kept separate from users/urls.py (user management) so the authentication
surface — login, token refresh, logout — has its own isolated module.

Mounted at /api/v1/auth/ in config/urls.py.
"""
from django.urls import path

from .views import CustomTokenObtainPairView, LogoutView, ThrottledTokenRefreshView

app_name = "auth"

urlpatterns = [
    path("login/",   CustomTokenObtainPairView.as_view(), name="login"),
    path("refresh/", ThrottledTokenRefreshView.as_view(), name="refresh"),
    path("logout/",  LogoutView.as_view(),                name="logout"),
]
