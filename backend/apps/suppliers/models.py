"""
Suppliers domain models.

Covers the full procure-to-pay cycle:
  Supplier → SupplierProduct (catalogue links) → PurchaseInvoice + PurchaseItem → SupplierPayment

Each model inherits AuditModel for full audit trail (created_at, updated_at,
created_by, updated_by) with zero extra boilerplate in views.
"""
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import DecimalField, Sum, Value
from django.db.models.functions import Coalesce

from apps.core.models import AuditModel


class Supplier(AuditModel):
    """A vendor / supplier that the business purchases from."""

    name = models.CharField(max_length=255, db_index=True)
    phone = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True)
    gstin = models.CharField(max_length=15, blank=True)
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "Supplier"
        verbose_name_plural = "Suppliers"

    def __str__(self):
        return self.name

    @property
    def outstanding_balance(self) -> Decimal:
        """
        Amount still owed to this supplier.
        = SUM(confirmed + paid invoice totals) − SUM(all payments made)
        """
        invoice_total = self.invoices.filter(
            status__in=(PurchaseInvoice.STATUS_CONFIRMED, PurchaseInvoice.STATUS_PAID)
        ).aggregate(
            total=Coalesce(
                Sum("total_amount"),
                Value(0),
                output_field=DecimalField(max_digits=12, decimal_places=2),
            )
        )["total"]

        payment_total = self.payments.aggregate(
            total=Coalesce(
                Sum("amount"),
                Value(0),
                output_field=DecimalField(max_digits=12, decimal_places=2),
            )
        )["total"]

        return invoice_total - payment_total


class SupplierProduct(AuditModel):
    """
    Links a Supplier to a Product with supplier-specific metadata.
    Allows the same product to have multiple suppliers with different SKUs
    and lead times.
    """

    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.CASCADE,
        related_name="supplier_products",
    )
    product = models.ForeignKey(
        "products.Product",
        on_delete=models.CASCADE,
        related_name="supplier_links",
    )
    our_sku = models.CharField(
        max_length=100, blank=True,
        help_text="Our internal code for this supplier's variant of the product.",
    )
    internal_description = models.TextField(blank=True)
    typical_lead_days = models.PositiveSmallIntegerField(null=True, blank=True)

    class Meta:
        unique_together = ("supplier", "product")
        ordering = ["supplier", "product"]
        verbose_name = "Supplier Product"
        verbose_name_plural = "Supplier Products"

    def __str__(self):
        return f"{self.supplier.name} → {self.product.name}"


class PurchaseInvoice(AuditModel):
    """
    A single purchase bill from a supplier.
    Lifecycle: draft → confirmed → paid
    """

    STATUS_DRAFT = "draft"
    STATUS_CONFIRMED = "confirmed"
    STATUS_PAID = "paid"
    STATUS_CHOICES = [
        (STATUS_DRAFT, "Draft"),
        (STATUS_CONFIRMED, "Confirmed"),
        (STATUS_PAID, "Paid"),
    ]

    DEAL_GOOD = "good"
    DEAL_OKAY = "okay"
    DEAL_BAD = "bad"
    DEAL_CHOICES = [
        (DEAL_GOOD, "Good Deal"),
        (DEAL_OKAY, "Okay Deal"),
        (DEAL_BAD, "Bad Deal"),
    ]

    QUALITY_GOOD = "good"
    QUALITY_OKAY = "okay"
    QUALITY_BAD = "bad"
    QUALITY_CHOICES = [
        (QUALITY_GOOD, "Good Quality"),
        (QUALITY_OKAY, "Okay Quality"),
        (QUALITY_BAD, "Bad Quality"),
    ]

    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.PROTECT,
        related_name="invoices",
    )
    invoice_number = models.CharField(max_length=100, blank=True)
    invoice_date = models.DateField()
    total_amount = models.DecimalField(
        max_digits=12, decimal_places=2, default=0,
        help_text="Auto-computed from line items.",
    )
    status = models.CharField(
        max_length=10, choices=STATUS_CHOICES, default=STATUS_DRAFT, db_index=True,
    )
    notes = models.TextField(blank=True)

    # Deal evaluation fields
    deal_label = models.CharField(max_length=10, blank=True, choices=DEAL_CHOICES)
    delivery_days = models.PositiveSmallIntegerField(null=True, blank=True)
    quality_rating = models.CharField(max_length=10, blank=True, choices=QUALITY_CHOICES)
    evaluation_notes = models.TextField(blank=True)

    # Lifecycle timestamps
    confirmed_at = models.DateTimeField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    # Cashbook link — set when invoice is marked paid
    cashbook_entry = models.ForeignKey(
        "cashbook.CashTransaction",
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    class Meta:
        ordering = ["-invoice_date", "-id"]
        verbose_name = "Purchase Invoice"
        verbose_name_plural = "Purchase Invoices"

    def __str__(self):
        ref = self.invoice_number or f"#{self.pk}"
        return f"{self.supplier.name} — {ref} ({self.invoice_date})"

    def recalculate_total(self):
        """Recompute total_amount from line items and persist."""
        result = self.items.aggregate(
            total=Coalesce(
                Sum(
                    models.ExpressionWrapper(
                        models.F("quantity") * models.F("unit_price"),
                        output_field=DecimalField(max_digits=12, decimal_places=2),
                    )
                ),
                Value(0),
                output_field=DecimalField(max_digits=12, decimal_places=2),
            )
        )
        self.total_amount = result["total"]
        self.save(update_fields=["total_amount", "updated_at"])


class PurchaseItem(AuditModel):
    """One line on a PurchaseInvoice."""

    invoice = models.ForeignKey(
        PurchaseInvoice,
        on_delete=models.CASCADE,
        related_name="items",
    )
    product = models.ForeignKey(
        "products.Product",
        on_delete=models.PROTECT,
    )
    quantity = models.DecimalField(max_digits=10, decimal_places=3)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    gst_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)

    class Meta:
        ordering = ["id"]
        verbose_name = "Purchase Item"
        verbose_name_plural = "Purchase Items"

    def __str__(self):
        return f"{self.product.name} × {self.quantity} @ {self.unit_price}"

    @property
    def line_total(self) -> Decimal:
        return self.quantity * self.unit_price


class SupplierPayment(AuditModel):
    """A payment made to a supplier, optionally linked to an invoice."""

    MODE_CASH = "cash"
    MODE_ONLINE = "online"
    MODE_CHEQUE = "cheque"
    MODE_BANK = "bank"
    MODE_CHOICES = [
        (MODE_CASH, "Cash"),
        (MODE_ONLINE, "Online / UPI"),
        (MODE_CHEQUE, "Cheque"),
        (MODE_BANK, "Bank Transfer"),
    ]

    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.PROTECT,
        related_name="payments",
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    mode = models.CharField(max_length=20, choices=MODE_CHOICES, default=MODE_CASH)
    reference_invoice = models.ForeignKey(
        PurchaseInvoice,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="payments",
    )
    note = models.TextField(blank=True)
    payment_date = models.DateField()
    cashbook_entry = models.ForeignKey(
        "cashbook.CashTransaction",
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    class Meta:
        ordering = ["-payment_date", "-id"]
        verbose_name = "Supplier Payment"
        verbose_name_plural = "Supplier Payments"

    def __str__(self):
        return f"Payment ₹{self.amount} to {self.supplier.name} on {self.payment_date}"

    def clean(self):
        if self.amount is not None and self.amount <= 0:
            raise ValidationError({"amount": "Payment amount must be greater than zero."})
