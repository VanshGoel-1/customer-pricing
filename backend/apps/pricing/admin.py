from django.contrib import admin

from .models import CustomerPricelist, PriceHistory, PricelistItem


class PricelistItemInline(admin.TabularInline):
    model = PricelistItem
    extra = 0
    readonly_fields = ["created_at", "updated_at"]
    fields = ["product", "price", "effective_from", "effective_to"]


@admin.register(CustomerPricelist)
class CustomerPricelistAdmin(admin.ModelAdmin):
    list_display = ["name", "customer", "is_active", "created_at"]
    search_fields = ["name", "customer__name"]
    inlines = [PricelistItemInline]
    readonly_fields = ["created_at", "updated_at"]


@admin.register(PriceHistory)
class PriceHistoryAdmin(admin.ModelAdmin):
    list_display = ["customer", "product", "old_price", "new_price", "version", "changed_by", "changed_at"]
    list_filter = ["customer", "product"]
    search_fields = ["customer__name", "product__name", "product__sku"]
    readonly_fields = [f.name for f in PriceHistory._meta.get_fields()]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
