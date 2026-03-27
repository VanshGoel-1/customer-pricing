"""
Django admin registrations for the suppliers app.
"""
from django.contrib import admin

from .models import (
    PurchaseInvoice,
    PurchaseItem,
    Supplier,
    SupplierPayment,
    SupplierProduct,
)


class PurchaseItemInline(admin.TabularInline):
    model = PurchaseItem
    extra = 0
    fields = ["product", "quantity", "unit_price", "gst_rate"]


@admin.register(PurchaseInvoice)
class PurchaseInvoiceAdmin(admin.ModelAdmin):
    list_display = [
        "supplier", "invoice_number", "invoice_date",
        "total_amount", "status", "deal_label",
    ]
    list_filter = ["status", "deal_label", "quality_rating"]
    search_fields = ["invoice_number", "supplier__name"]
    inlines = [PurchaseItemInline]
    readonly_fields = ["total_amount", "confirmed_at", "paid_at", "created_at", "updated_at"]


class SupplierProductInline(admin.TabularInline):
    model = SupplierProduct
    extra = 0
    fields = ["product", "our_sku", "typical_lead_days"]


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = ["name", "phone", "email", "gstin", "is_active"]
    list_filter = ["is_active"]
    search_fields = ["name", "phone", "email", "gstin"]
    inlines = [SupplierProductInline]


@admin.register(SupplierPayment)
class SupplierPaymentAdmin(admin.ModelAdmin):
    list_display = ["supplier", "amount", "mode", "payment_date"]
    list_filter = ["mode"]
    search_fields = ["supplier__name"]
    readonly_fields = ["cashbook_entry", "created_at", "updated_at"]
