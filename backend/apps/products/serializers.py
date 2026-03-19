from rest_framework import serializers

from .models import Product, ProductCategory, QuickProduct


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
            "description", "base_price", "unit", "piece_weight_grams",
            "is_active", "created_at", "updated_at",
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
        fields = ["id", "name", "sku", "base_price", "unit", "piece_weight_grams", "category_name"]


class QuickProductSerializer(serializers.ModelSerializer):
    quick_id   = serializers.IntegerField(source="id", read_only=True)
    id         = serializers.IntegerField(source="product.id", read_only=True)
    name       = serializers.CharField(source="product.name", read_only=True)
    sku        = serializers.CharField(source="product.sku", read_only=True)
    unit       = serializers.CharField(source="product.unit", read_only=True)
    base_price = serializers.DecimalField(source="product.base_price", max_digits=12, decimal_places=2, read_only=True)
    piece_weight_grams = serializers.DecimalField(source="product.piece_weight_grams", max_digits=8, decimal_places=2, read_only=True, allow_null=True)
    product    = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.filter(is_active=True),
        write_only=True,
    )

    class Meta:
        model  = QuickProduct
        fields = ["quick_id", "id", "name", "sku", "unit", "base_price", "piece_weight_grams", "sort_order", "product"]

    def validate(self, attrs):
        if self.instance is None:  # creation
            if QuickProduct.objects.count() >= 20:
                raise serializers.ValidationError("Quick product list is full (max 20 items).")
        return attrs
