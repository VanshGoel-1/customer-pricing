"""
Thread-local storage for the current request user.
Used by AuditModel to auto-set created_by / updated_by without
passing the user explicitly through every save() call —
the same pattern Odoo uses with self.env.user.
"""
import threading

_thread_locals = threading.local()


def get_current_user():
    return getattr(_thread_locals, "user", None)


def set_current_user(user):
    _thread_locals.user = user
