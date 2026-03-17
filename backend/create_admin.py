"""
Ensures the admin user exists and credentials match the current env vars.
Run via: python create_admin.py
- Creates the admin if none exists.
- Updates email, name, and password if they differ from env vars.
"""
import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.production")
django.setup()

from apps.users.models import User  # noqa: E402

email = os.environ.get("ADMIN_EMAIL", "admin@example.com")
name = os.environ.get("ADMIN_NAME", "Administrator")
password = os.environ.get("ADMIN_PASSWORD", "Admin@2026!")

admin = User.objects.filter(role="admin").first()
if admin is None:
    User.objects.create_superuser(email=email, name=name, password=password)
    print("Admin user created.")
else:
    admin.email = email
    admin.name = name
    admin.set_password(password)
    admin.is_active = True
    admin.save(update_fields=["email", "name", "password", "is_active", "updated_at"])
    print("Admin credentials synced.")
