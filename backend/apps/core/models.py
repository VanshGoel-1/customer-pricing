"""
AuditModel — abstract base class for every domain model.

Mirrors Odoo's built-in audit fields:
  - create_date  → created_at
  - write_date   → updated_at
  - create_uid   → created_by
  - write_uid    → updated_by

All FKs to User use on_delete=SET_NULL so deleting a user never
cascades into business records — same policy Odoo follows.
"""
from django.conf import settings
from django.db import models

from apps.core.thread_local import get_current_user


class AuditModel(models.Model):
    """
    Abstract base. Every model that inherits this gets:
      - created_at / updated_at  (auto timestamps)
      - created_by / updated_by  (auto-set from request user via thread-local)
    """

    created_at = models.DateTimeField(auto_now_add=True, editable=False)
    updated_at = models.DateTimeField(auto_now=True, editable=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        editable=False,
        on_delete=models.SET_NULL,
        related_name="+",  # no reverse accessor — keeps namespace clean
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        editable=False,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        user = get_current_user()
        if user:
            if not self.pk:
                # New record — set both
                self.created_by = user
            self.updated_by = user
        super().save(*args, **kwargs)
