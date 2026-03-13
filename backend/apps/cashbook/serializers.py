from rest_framework import serializers

from .models import IN_CATEGORIES, OUT_CATEGORIES, CashTransaction

_IN_CATEGORY_KEYS  = {c[0] for c in IN_CATEGORIES}
_OUT_CATEGORY_KEYS = {c[0] for c in OUT_CATEGORIES}


class CashTransactionSerializer(serializers.ModelSerializer):
    transaction_type_display = serializers.CharField(
        source="get_transaction_type_display", read_only=True
    )
    category_display = serializers.CharField(source="get_category_display", read_only=True)
    mode_display     = serializers.CharField(source="get_mode_display",     read_only=True)
    created_by_name  = serializers.CharField(source="created_by.name",     read_only=True, default=None)
    order_number     = serializers.CharField(source="order.order_number",  read_only=True, default=None)

    class Meta:
        model  = CashTransaction
        fields = [
            "id",
            "transaction_type",
            "transaction_type_display",
            "amount",
            "category",
            "category_display",
            "mode",
            "mode_display",
            "description",
            "transaction_date",
            "attachment",
            "order_number",
            "created_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "order_number", "created_at", "updated_at"]

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Amount must be greater than zero.")
        return value

    def validate(self, attrs):
        transaction_type = attrs.get("transaction_type")
        category         = attrs.get("category")

        if transaction_type and category:
            if transaction_type == CashTransaction.TYPE_IN and category not in _IN_CATEGORY_KEYS:
                valid = ", ".join(_IN_CATEGORY_KEYS)
                raise serializers.ValidationError(
                    {"category": f"Invalid category for IN transaction. Valid: {valid}."}
                )
            if transaction_type == CashTransaction.TYPE_OUT and category not in _OUT_CATEGORY_KEYS:
                valid = ", ".join(_OUT_CATEGORY_KEYS)
                raise serializers.ValidationError(
                    {"category": f"Invalid category for OUT transaction. Valid: {valid}."}
                )
        return attrs
