from django.contrib import admin

from .models import CreditLedger, Customer


class CreditLedgerInline(admin.TabularInline):
    model = CreditLedger
    extra = 0
    readonly_fields = ["created_at", "created_by"]
    fields = ["date", "entry_type", "amount", "order", "notes", "created_at"]


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ["name", "phone", "customer_type", "is_active", "created_at"]
    list_filter = ["customer_type", "is_active"]
    search_fields = ["name", "phone", "email"]
    readonly_fields = ["created_at", "updated_at", "created_by", "updated_by"]
    inlines = [CreditLedgerInline]


@admin.register(CreditLedger)
class CreditLedgerAdmin(admin.ModelAdmin):
    list_display = ["customer", "date", "entry_type", "amount", "created_at"]
    list_filter = ["entry_type"]
    search_fields = ["customer__name", "customer__phone"]
    readonly_fields = ["created_at", "created_by"]

    def has_change_permission(self, request, obj=None):
        # Ledger is append-only — no edits in admin either
        return False

    def has_delete_permission(self, request, obj=None):
        return False
