from django.urls import path

from .views import ChangePasswordView, MeView, UserDetailView, UserListCreateView

app_name = "users"

urlpatterns = [
    path("", UserListCreateView.as_view(), name="user-list-create"),
    path("me/", MeView.as_view(), name="user-me"),
    path("me/change-password/", ChangePasswordView.as_view(), name="user-change-password"),
    path("<int:pk>/", UserDetailView.as_view(), name="user-detail"),
]
