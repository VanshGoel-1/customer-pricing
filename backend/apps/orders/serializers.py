from decimal import Decimal

from rest_framework import serializers

from apps.pricing.models import PricelistItem

from .models import Order, OrderItem


class OrderItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_sku = serializers.CharField(source="product.sku", read_only=True)
    unit = serializers.CharField(source="product.unit", read_only=True)
    line_total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = OrderItem
        fields = [
            "id", "product", "product_name", "product_sku", "unit",
            "quantity", "unit_price", "is_price_overridden", "line_total", "notes",
        ]
        read_only_fields = ["id", "line_total"]

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError("Quantity must be greater than zero.")
        return value

    def validate_unit_price(self, value):
        if value < 0:
            raise serializers.ValidationError("Unit price cannot be negative.")
        return value


class OrderItemCreateSerializer(serializers.ModelSerializer):
    """
    Used when adding items to an order.
    Auto-fills unit_price from the customer pricelist if not provided.
    Sets is_price_overridden=True if the caller supplies a different price.
    """
    unit_price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)

    class Meta:
        model = OrderItem
        fields = ["product", "quantity", "unit_price", "notes"]

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError("Quantity must be greater than zero.")
        return value

    def create(self, validated_data):
        order = self.context["order"]
        product = validated_data["product"]

        # Auto-fill price from pricelist — mirrors Odoo's _onchange_product_id_customer_price
        pricelist_price = None
        item = PricelistItem.objects.filter(
            pricelist__customer=order.customer, product=product
        ).first()
        if item:
            pricelist_price = item.price

        requested_price = validated_data.pop("unit_price", None)
        effective_price = pricelist_price or product.base_price

        is_overridden = False
        if requested_price is not None and requested_price != effective_price:
            effective_price = requested_price
            is_overridden = True

        return OrderItem.objects.create(
            order=order,
            unit_price=effective_price,
            is_price_overridden=is_overridden,
            **validated_data,
        )


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    customer_phone = serializers.CharField(source="customer.phone", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    payment_mode_display = serializers.CharField(source="get_payment_mode_display", read_only=True)
    confirmed_by_name = serializers.CharField(source="confirmed_by.name", read_only=True, default=None)
    total_paid = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    remaining_balance = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = Order
        fields = [
            "id", "order_number", "customer", "customer_name", "customer_phone",
            "status", "status_display", "payment_mode", "payment_mode_display",
            "total_amount", "total_paid", "remaining_balance", "notes",
            "confirmed_at", "confirmed_by", "confirmed_by_name",
            "created_at", "updated_at", "items",
        ]
        read_only_fields = [
            "id", "order_number", "total_amount", "status",
            "confirmed_at", "confirmed_by", "created_at", "updated_at",
        ]


class OrderCreateSerializer(serializers.ModelSerializer):
    items = OrderItemCreateSerializer(many=True, required=False)

    class Meta:
        model = Order
        fields = ["customer", "payment_mode", "notes", "items"]

    def create(self, validated_data):
        items_data = validated_data.pop("items", [])
        order = Order.objects.create(**validated_data)
        for item_data in items_data:
            # item_data is already validated — call create() directly to avoid
            # re-running PrimaryKeyRelatedField.to_internal_value() on a model
            # instance (which raises TypeError and produces a 400 error).
            OrderItemCreateSerializer(context={"order": order}).create(item_data)
        order.recalculate_total()
        return order
