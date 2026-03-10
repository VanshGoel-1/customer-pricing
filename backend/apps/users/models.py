"""
Custom User model.

Uses email as the login field (not username) — same approach Odoo uses
with res.users where login = email.

Three roles mirror Odoo's sale access groups:
  admin    → group_system         (full access + user management)
  manager  → group_sale_manager   (products, customers, pricing, orders)
  cashier  → group_sale_salesman  (billing only)
"""
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models


class UserManager(BaseUserManager):
    def create_user(self, email, name, password=None, **extra_fields):
        if not email:
            raise ValueError("Email is required.")
        email = self.normalize_email(email)
        user = self.model(email=email, name=name, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, name, password=None, **extra_fields):
        extra_fields.setdefault("role", User.ROLE_ADMIN)
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        return self.create_user(email, name, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    ROLE_ADMIN = "admin"
    ROLE_MANAGER = "manager"
    ROLE_CASHIER = "cashier"

    ROLE_CHOICES = [
        (ROLE_ADMIN, "Admin"),
        (ROLE_MANAGER, "Manager"),
        (ROLE_CASHIER, "Cashier"),
    ]

    email = models.EmailField(unique=True, db_index=True)
    name = models.CharField(max_length=150)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default=ROLE_CASHIER)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)  # Django admin access
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["name"]

    objects = UserManager()

    class Meta:
        ordering = ["name"]
        verbose_name = "User"
        verbose_name_plural = "Users"

    def __str__(self):
        return f"{self.name} <{self.email}> [{self.role}]"

    @property
    def is_admin(self):
        return self.role == self.ROLE_ADMIN

    @property
    def is_manager(self):
        return self.role in (self.ROLE_MANAGER, self.ROLE_ADMIN)

    @property
    def is_cashier(self):
        return self.role == self.ROLE_CASHIER
