from rest_framework import serializers

from .models import Product, ProductCategory


class ProductCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductCategory
        fields = ["id", "name", "description", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class ProductSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)

    class Meta:
        model = Product
        fields = [
            "id", "name", "sku", "category", "category_name",
            "description", "base_price", "unit", "is_active",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_sku(self, value):
        return value.upper().strip()

    def validate_base_price(self, value):
        if value < 0:
            raise serializers.ValidationError("Base price cannot be negative.")
        return value


class ProductLookupSerializer(serializers.ModelSerializer):
    """Minimal serializer used for product search on the billing screen."""
    category_name = serializers.CharField(source="category.name", read_only=True)

    class Meta:
        model = Product
        fields = ["id", "name", "sku", "base_price", "unit", "category_name"]
