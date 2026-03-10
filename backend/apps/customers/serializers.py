from rest_framework import serializers

from .models import CreditLedger, Customer


class CreditLedgerSerializer(serializers.ModelSerializer):
    entry_type_display = serializers.CharField(source="get_entry_type_display", read_only=True)
    order_number = serializers.CharField(source="order.order_number", read_only=True, default=None)

    class Meta:
        model = CreditLedger
        fields = [
            "id", "customer", "date", "entry_type", "entry_type_display",
            "amount", "order", "order_number", "notes", "created_at",
        ]
        read_only_fields = ["id", "created_at", "order_number", "entry_type_display"]

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Amount must be greater than zero.")
        return value


class CustomerSerializer(serializers.ModelSerializer):
    outstanding_balance = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True
    )
    is_over_credit_limit = serializers.BooleanField(read_only=True)
    customer_type_display = serializers.CharField(
        source="get_customer_type_display", read_only=True
    )

    class Meta:
        model = Customer
        fields = [
            "id", "name", "phone", "email", "customer_type", "customer_type_display",
            "credit_limit", "notes", "is_active",
            "outstanding_balance", "is_over_credit_limit",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_phone(self, value):
        # Normalise: strip spaces and dashes
        return value.strip().replace(" ", "").replace("-", "")

    def validate_credit_limit(self, value):
        if value < 0:
            raise serializers.ValidationError("Credit limit cannot be negative.")
        return value


class CustomerLookupSerializer(serializers.ModelSerializer):
    """Minimal serializer for phone-based lookup on the billing screen."""
    outstanding_balance = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True
    )

    class Meta:
        model = Customer
        fields = ["id", "name", "phone", "customer_type", "outstanding_balance", "credit_limit"]
