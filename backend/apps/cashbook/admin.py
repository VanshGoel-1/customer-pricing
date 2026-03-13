from django.contrib import admin

from .models import CashTransaction


@admin.register(CashTransaction)
class CashTransactionAdmin(admin.ModelAdmin):
    list_display = [
        "id", "transaction_type", "category", "amount", "mode",
        "transaction_date", "order", "created_by",
    ]
    list_filter = ["transaction_type", "mode", "category", "transaction_date"]
    search_fields = ["description", "order__order_number"]
    readonly_fields = ["created_at", "updated_at", "created_by", "updated_by"]
    date_hierarchy = "transaction_date"
