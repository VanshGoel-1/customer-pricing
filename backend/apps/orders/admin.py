from django.contrib import admin

from .models import Order, OrderItem


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    readonly_fields = ["line_total", "is_price_overridden"]
    fields = ["product", "quantity", "unit_price", "is_price_overridden", "line_total", "notes"]


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ["order_number", "customer", "status", "total_amount", "confirmed_at", "created_at"]
    list_filter = ["status"]
    search_fields = ["order_number", "customer__name", "customer__phone"]
    readonly_fields = ["order_number", "total_amount", "confirmed_at", "confirmed_by", "created_at", "updated_at"]
    inlines = [OrderItemInline]

    def has_delete_permission(self, request, obj=None):
        # Orders are permanent records
        return False
