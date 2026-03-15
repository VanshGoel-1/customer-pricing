"""
One-time script to create the initial admin user.
Run via: python create_admin.py
Only works if no admin user exists yet.
"""
import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.production")
django.setup()

from apps.users.models import User  # noqa: E402

if not User.objects.filter(role="admin").exists():
    User.objects.create_superuser(
        email=os.environ.get("ADMIN_EMAIL", "admin@example.com"),
        name=os.environ.get("ADMIN_NAME", "Administrator"),
        password=os.environ.get("ADMIN_PASSWORD", "Admin@2026!"),
    )
    print("Admin user created.")
else:
    print("Admin already exists — skipping.")
