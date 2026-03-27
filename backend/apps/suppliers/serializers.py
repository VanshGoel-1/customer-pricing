"""
Serializers for the suppliers app.

Read vs write split:
  - PurchaseInvoiceSerializer        — full nested read (list / detail)
  - PurchaseInvoiceCreateSerializer  — write path (POST create, PATCH update)

All single-object responses must be wrapped as {"success": True, "data": ...}
in the view; the serializers themselves just produce the inner data dict.
"""
from decimal import Decimal

from rest_framework import serializers

from .models import (
    PurchaseInvoice,
    PurchaseItem,
    Supplier,
    SupplierPayment,
    SupplierProduct,
)


# ---------------------------------------------------------------------------
# Supplier
# ---------------------------------------------------------------------------

class SupplierSerializer(serializers.ModelSerializer):
    outstanding_balance = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True,
    )

    class Meta:
        model = Supplier
        fields = [
            "id", "name", "phone", "email", "address", "gstin",
            "notes", "is_active", "outstanding_balance",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "outstanding_balance", "created_at", "updated_at"]

    def validate_phone(self, value):
        """Strip common formatting characters from phone numbers."""
        return value.replace(" ", "").replace("-", "")


# ---------------------------------------------------------------------------
# SupplierProduct
# ---------------------------------------------------------------------------

class SupplierProductSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_sku = serializers.CharField(source="product.sku", read_only=True)

    class Meta:
        model = SupplierProduct
        fields = [
            "id", "supplier", "product", "product_name", "product_sku",
            "our_sku", "internal_description", "typical_lead_days", "created_at",
        ]
        read_only_fields = ["id", "product_name", "product_sku", "created_at"]


# ---------------------------------------------------------------------------
# PurchaseItem
# ---------------------------------------------------------------------------

class PurchaseItemSerializer(serializers.ModelSerializer):
    product_name = serializers.SerializerMethodField()
    product_sku = serializers.SerializerMethodField()
    unit = serializers.CharField(source="product.unit", read_only=True)
    line_total = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseItem
        fields = [
            "id", "product", "product_name", "product_sku", "unit",
            "quantity", "unit_price", "gst_rate", "line_total",
        ]
        read_only_fields = ["id", "product_name", "product_sku", "unit", "line_total"]

    def get_product_name(self, obj):
        return obj.product.name

    def get_product_sku(self, obj):
        return obj.product.sku

    def get_line_total(self, obj):
        return str(obj.line_total)


# ---------------------------------------------------------------------------
# PurchaseInvoice — read
# ---------------------------------------------------------------------------

class PurchaseInvoiceSerializer(serializers.ModelSerializer):
    items = PurchaseItemSerializer(many=True, read_only=True)
    supplier_name = serializers.CharField(source="supplier.name", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    deal_label_display = serializers.CharField(source="get_deal_label_display", read_only=True)
    quality_rating_display = serializers.CharField(source="get_quality_rating_display", read_only=True)
    item_count = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseInvoice
        fields = [
            "id", "supplier", "supplier_name",
            "invoice_number", "invoice_date",
            "total_amount", "status", "status_display",
            "notes",
            "deal_label", "deal_label_display",
            "delivery_days",
            "quality_rating", "quality_rating_display",
            "evaluation_notes",
            "confirmed_at", "paid_at",
            "item_count", "items",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "total_amount", "status", "confirmed_at", "paid_at",
            "created_at", "updated_at",
        ]

    def get_item_count(self, obj):
        return obj.items.count()


# ---------------------------------------------------------------------------
# PurchaseInvoice — write
# ---------------------------------------------------------------------------

class PurchaseInvoiceCreateSerializer(serializers.ModelSerializer):
    """
    Used for both POST (create) and PATCH (update draft).
    Items are passed as a plain list of dicts:
      [{"product": <id>, "quantity": "2.000", "unit_price": "150.00", "gst_rate": "18.00"}, ...]
    """
    items = serializers.ListField(
        child=serializers.DictField(),
        required=False,
        write_only=True,
    )

    class Meta:
        model = PurchaseInvoice
        fields = [
            "id", "supplier", "invoice_number", "invoice_date",
            "notes", "deal_label", "delivery_days", "quality_rating",
            "evaluation_notes", "items",
        ]
        read_only_fields = ["id"]

    def validate(self, attrs):
        items = attrs.get("items")
        # For create (no instance), items are required and must have at least one entry.
        if self.instance is None:
            if not items:
                raise serializers.ValidationError(
                    {"items": "At least one item is required to create a purchase invoice."}
                )
        return attrs

    def _create_items(self, invoice, items_data):
        from apps.products.models import Product

        for item_data in items_data:
            try:
                product = Product.objects.get(pk=item_data["product"])
            except (Product.DoesNotExist, KeyError):
                raise serializers.ValidationError(
                    {"items": f"Product with id {item_data.get('product')} not found."}
                )
            PurchaseItem.objects.create(
                invoice=invoice,
                product=product,
                quantity=item_data.get("quantity", 1),
                unit_price=item_data.get("unit_price", 0),
                gst_rate=item_data.get("gst_rate", 0),
            )

    def create(self, validated_data):
        items_data = validated_data.pop("items", [])
        invoice = PurchaseInvoice.objects.create(**validated_data)
        self._create_items(invoice, items_data)
        invoice.recalculate_total()
        return invoice

    def update(self, instance, validated_data):
        items_data = validated_data.pop("items", None)

        # Update scalar fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        # Rebuild items only if provided and invoice is still a draft
        if items_data is not None and instance.status == PurchaseInvoice.STATUS_DRAFT:
            instance.items.all().delete()
            self._create_items(instance, items_data)
            instance.recalculate_total()

        return instance


# ---------------------------------------------------------------------------
# SupplierPayment
# ---------------------------------------------------------------------------

class SupplierPaymentSerializer(serializers.ModelSerializer):
    mode_display = serializers.CharField(source="get_mode_display", read_only=True)
    reference_invoice_number = serializers.SerializerMethodField()

    class Meta:
        model = SupplierPayment
        fields = [
            "id", "supplier", "amount", "mode", "mode_display",
            "reference_invoice", "reference_invoice_number",
            "note", "payment_date", "created_at",
        ]
        read_only_fields = ["id", "supplier", "mode_display", "reference_invoice_number", "created_at"]

    def get_reference_invoice_number(self, obj):
        if obj.reference_invoice_id:
            return obj.reference_invoice.invoice_number
        return None

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Payment amount must be greater than zero.")
        return value


# ---------------------------------------------------------------------------
# SupplierLedgerEntry — plain (non-model) serializer
# ---------------------------------------------------------------------------

class SupplierLedgerEntrySerializer(serializers.Serializer):
    """
    Serializes a single entry in the merged supplier ledger.
    entry_type is either "invoice" or "payment".
    """
    id = serializers.IntegerField()
    entry_type = serializers.ChoiceField(choices=["invoice", "payment"])
    date = serializers.DateField()
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    description = serializers.CharField()
    reference_id = serializers.CharField(allow_blank=True)
    status = serializers.CharField(allow_blank=True, allow_null=True)
    created_at = serializers.DateTimeField()
