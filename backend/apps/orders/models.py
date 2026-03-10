"""
Order and OrderItem models.

Mirrors Odoo:
  Order     → sale.order
  OrderItem → sale.order.line

Key Odoo patterns:
1. confirm() is atomic — wraps in transaction.atomic().
   Mirrors Odoo's action_confirm() which posts ledger and changes state
   together or not at all.
2. OrderItem stores is_price_overridden=True when cashier changes the
   auto-filled price — mirrors Odoo's price_unit override tracking.
3. total_amount is auto-calculated from lines on save.
4. Order number is auto-generated (ORD/2026/00001 format).
"""
import datetime
from decimal import Decimal

from django.conf import settings
from django.db import models, transaction
from django.utils import timezone

from apps.core.models import AuditModel
from apps.core.thread_local import get_current_user


def _generate_order_number():
    """
    Generate a sequential order number: ORD/YYYY/NNNNN

    select_for_update() acquires a row-level lock on the last order row
    so concurrent requests cannot read the same sequence number and
    produce duplicate order numbers.  Must be called inside a transaction.
    """
    year = datetime.date.today().year
    with transaction.atomic():
        last = (
            Order.objects.filter(order_number__startswith=f"ORD/{year}/")
            .select_for_update()          # lock — prevents duplicate sequence
            .order_by("-order_number")
            .values_list("order_number", flat=True)
            .first()
        )
        if last:
            try:
                seq = int(last.split("/")[-1]) + 1
            except (IndexError, ValueError):
                # Malformed order_number in DB — fall back to count-based
                seq = Order.objects.filter(order_number__startswith=f"ORD/{year}/").count() + 1
        else:
            seq = 1
    return f"ORD/{year}/{seq:05d}"


class Order(AuditModel):
    STATUS_DRAFT = "draft"
    STATUS_CONFIRMED = "confirmed"
    STATUS_PAID = "paid"
    STATUS_CANCELLED = "cancelled"

    STATUS_CHOICES = [
        (STATUS_DRAFT, "Draft"),
        (STATUS_CONFIRMED, "Confirmed"),
        (STATUS_PAID, "Paid"),
        (STATUS_CANCELLED, "Cancelled"),
    ]

    order_number = models.CharField(max_length=50, unique=True, db_index=True)
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.PROTECT,  # never lose order history if customer is archived
        related_name="orders",
    )
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default=STATUS_DRAFT, db_index=True
    )
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    notes = models.TextField(blank=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="confirmed_orders",
    )

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Order"
        verbose_name_plural = "Orders"

    def __str__(self):
        return f"{self.order_number} | {self.customer.name} | {self.status}"

    def save(self, *args, **kwargs):
        if not self.order_number:
            self.order_number = _generate_order_number()
        super().save(*args, **kwargs)

    def recalculate_total(self):
        """Recompute total_amount from all line items."""
        total = self.items.aggregate(
            total=models.Sum(models.F("quantity") * models.F("unit_price"))
        )["total"] or Decimal("0.00")
        Order.objects.filter(pk=self.pk).update(total_amount=total)
        self.total_amount = total

    def confirm(self):
        """
        Confirm the order and post a credit ledger entry atomically.
        Mirrors Odoo's action_confirm() + credit posting in one transaction.
        """
        if self.status != self.STATUS_DRAFT:
            raise ValueError(f"Only draft orders can be confirmed. Current status: {self.status}")

        if not self.items.exists():
            raise ValueError("Cannot confirm an order with no items.")

        with transaction.atomic():
            self.status = self.STATUS_CONFIRMED
            self.confirmed_at = timezone.now()
            self.confirmed_by = get_current_user()
            self.save(update_fields=["status", "confirmed_at", "confirmed_by", "updated_at"])

            # Post credit ledger entry — mirrors Odoo's action_confirm() hook
            from apps.customers.models import CreditLedger
            CreditLedger.objects.create(
                customer=self.customer,
                date=self.confirmed_at.date(),
                entry_type="credit",
                amount=self.total_amount,
                order=self,
                notes=f"Sale Order {self.order_number}",
            )

    def cancel(self):
        """Cancel a draft order. Confirmed orders cannot be cancelled via API."""
        if self.status not in (self.STATUS_DRAFT,):
            raise ValueError("Only draft orders can be cancelled.")
        self.status = self.STATUS_CANCELLED
        self.save(update_fields=["status", "updated_at"])

    def mark_paid(self):
        """
        Mark confirmed order as paid and post a payment ledger entry.
        """
        if self.status != self.STATUS_CONFIRMED:
            raise ValueError("Only confirmed orders can be marked as paid.")
        with transaction.atomic():
            self.status = self.STATUS_PAID
            self.save(update_fields=["status", "updated_at"])
            remaining = self.remaining_balance
            if remaining > 0:
                from apps.customers.models import CreditLedger
                CreditLedger.objects.create(
                    customer=self.customer,
                    date=timezone.now().date(),
                    entry_type="payment",
                    amount=remaining,
                    order=self,
                    notes=f"Payment for {self.order_number}",
                )

    @property
    def total_paid(self):
        from apps.customers.models import CreditLedger
        from django.db.models import Sum
        result = CreditLedger.objects.filter(
            order=self, entry_type="payment"
        ).aggregate(total=Sum("amount"))
        return result["total"] or Decimal("0.00")

    @property
    def remaining_balance(self):
        return max(self.total_amount - self.total_paid, Decimal("0.00"))


class OrderItem(AuditModel):
    """
    One line in an order.

    unit_price is auto-filled from the customer's pricelist at creation
    time (via API). The cashier can override it; is_price_overridden tracks
    whether they did — mirrors Odoo's price_unit manual override pattern.
    """

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey(
        "products.Product", on_delete=models.PROTECT, related_name="order_items"
    )
    quantity = models.DecimalField(max_digits=10, decimal_places=3)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    is_price_overridden = models.BooleanField(default=False)
    notes = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["id"]
        verbose_name = "Order Item"
        verbose_name_plural = "Order Items"
        constraints = [
            models.CheckConstraint(
                check=models.Q(quantity__gt=0),
                name="order_item_quantity_positive",
            ),
            models.CheckConstraint(
                check=models.Q(unit_price__gte=0),
                name="order_item_unit_price_non_negative",
            ),
        ]

    def __str__(self):
        return f"{self.order.order_number} | {self.product.name} x {self.quantity}"

    @property
    def line_total(self):
        return self.quantity * self.unit_price

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        # Recalculate order total whenever a line changes
        self.order.recalculate_total()
