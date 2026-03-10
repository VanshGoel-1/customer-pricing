from django.contrib import admin

from .models import Product, ProductCategory


@admin.register(ProductCategory)
class ProductCategoryAdmin(admin.ModelAdmin):
    list_display = ["name", "created_at"]
    search_fields = ["name"]


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ["sku", "name", "category", "base_price", "unit", "is_active", "created_at"]
    list_filter = ["category", "is_active", "unit"]
    search_fields = ["name", "sku"]
    readonly_fields = ["created_at", "updated_at", "created_by", "updated_by"]
