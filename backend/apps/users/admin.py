from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ["email", "name", "role", "is_active", "created_at"]
    list_filter = ["role", "is_active"]
    search_fields = ["email", "name"]
    ordering = ["name"]
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Personal", {"fields": ("name",)}),
        ("Role & Access", {"fields": ("role", "is_active", "is_staff", "is_superuser")}),
        ("Timestamps", {"fields": ("created_at", "updated_at"), "classes": ("collapse",)}),
    )
    add_fieldsets = (
        (None, {"classes": ("wide",), "fields": ("email", "name", "role", "password1", "password2")}),
    )
    readonly_fields = ["created_at", "updated_at"]
