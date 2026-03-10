from rest_framework import serializers

from apps.products.serializers import ProductLookupSerializer

from .models import CustomerPricelist, PriceHistory, PricelistItem


class PriceHistorySerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_sku = serializers.CharField(source="product.sku", read_only=True)
    changed_by_name = serializers.CharField(source="changed_by.name", read_only=True, default=None)
    customer_name = serializers.CharField(source="customer.name", read_only=True)

    class Meta:
        model = PriceHistory
        fields = [
            "id", "customer", "customer_name", "product", "product_name", "product_sku",
            "old_price", "new_price", "version", "changed_at", "changed_by", "changed_by_name",
            "notes",
        ]
        read_only_fields = fields  # entirely read-only — immutable


class PricelistItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_sku = serializers.CharField(source="product.sku", read_only=True)
    customer_name = serializers.CharField(source="pricelist.customer.name", read_only=True)

    class Meta:
        model = PricelistItem
        fields = [
            "id", "pricelist", "product", "product_name", "product_sku",
            "customer_name", "price", "effective_from", "effective_to",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "customer_name", "created_at", "updated_at"]

    def validate_price(self, value):
        if value < 0:
            raise serializers.ValidationError("Price cannot be negative.")
        return value

    def validate(self, attrs):
        effective_from = attrs.get("effective_from")
        effective_to = attrs.get("effective_to")
        if effective_to and effective_from and effective_to < effective_from:
            raise serializers.ValidationError(
                {"effective_to": "Effective-to date cannot be before effective-from."}
            )
        return attrs


class SetCustomerPriceSerializer(serializers.Serializer):
    """
    Wizard-style serializer — mirrors Odoo's set.customer.price.wizard.
    Sets (or updates) a single product price for a customer in one call.
    Auto-creates the pricelist if it doesn't exist.
    """

    customer_id = serializers.IntegerField()
    product_id = serializers.IntegerField()
    price = serializers.DecimalField(max_digits=12, decimal_places=2)
    effective_from = serializers.DateField()
    effective_to = serializers.DateField(required=False, allow_null=True)

    def validate_price(self, value):
        if value < 0:
            raise serializers.ValidationError("Price cannot be negative.")
        return value

    def save(self):
        from apps.customers.models import Customer
        from apps.products.models import Product

        customer = Customer.objects.get(pk=self.validated_data["customer_id"])
        product = Product.objects.get(pk=self.validated_data["product_id"])

        pricelist = CustomerPricelist.get_or_create_for_customer(customer)

        item, _ = PricelistItem.objects.update_or_create(
            pricelist=pricelist,
            product=product,
            defaults={
                "price": self.validated_data["price"],
                "effective_from": self.validated_data["effective_from"],
                "effective_to": self.validated_data.get("effective_to"),
            },
        )
        return item


class CustomerPricelistSerializer(serializers.ModelSerializer):
    items = PricelistItemSerializer(many=True, read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)

    class Meta:
        model = CustomerPricelist
        fields = ["id", "customer", "customer_name", "name", "is_active", "items", "created_at"]
        read_only_fields = ["id", "created_at"]


class CustomerPriceLookupSerializer(serializers.Serializer):
    """
    GET /api/v1/pricing/lookup/?customer_id=1&product_id=5
    Returns the customer-specific price, falling back to base_price.
    Used by the billing screen to auto-fill price on product selection.
    """
    customer_id = serializers.IntegerField()
    product_id = serializers.IntegerField()
