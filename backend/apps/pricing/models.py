"""
Pricing models.

Mirrors Odoo:
  CustomerPricelist  → product.pricelist (one per customer)
  PricelistItem      → product.pricelist.item
  PriceHistory       → customer.price.history  (IMMUTABLE)

Key Odoo patterns reproduced:
1. PricelistItem.save() captures old price before write, then
   delegates to _log_price_history — mirrors Odoo's write() override.
2. PriceHistory.save() raises PermissionDenied if pk exists —
   mirrors Odoo's _rec_name pattern plus append-only design.
3. Version auto-increment per customer+product pair.
4. get_or_create_pricelist() on Customer  — mirrors res.partner._get_or_create_pricelist()
"""
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import PermissionDenied
from django.db import models

from apps.core.models import AuditModel
from apps.core.thread_local import get_current_user


class CustomerPricelist(AuditModel):
    """
    One pricelist per customer.
    Created automatically the first time a price is set for a customer.
    """

    customer = models.OneToOneField(
        "customers.Customer",
        on_delete=models.CASCADE,
        related_name="pricelist",
    )
    name = models.CharField(max_length=255)  # auto-generated, e.g. "John Doe – Custom Prices"
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["customer__name"]
        verbose_name = "Customer Pricelist"
        verbose_name_plural = "Customer Pricelists"

    def __str__(self):
        return self.name

    @classmethod
    def get_or_create_for_customer(cls, customer):
        """
        Return the customer's pricelist, creating one if it doesn't exist.
        Direct port of Odoo's _get_or_create_pricelist().
        """
        pricelist, _ = cls.objects.get_or_create(
            customer=customer,
            defaults={"name": f"{customer.name} – Custom Prices"},
        )
        return pricelist


class PricelistItem(AuditModel):
    """
    One row per product in a customer's pricelist.
    Saving a new price (or updating an existing one) automatically
    creates a PriceHistory record via _log_price_history().
    """

    pricelist = models.ForeignKey(
        CustomerPricelist,
        on_delete=models.CASCADE,
        related_name="items",
    )
    product = models.ForeignKey(
        "products.Product",
        on_delete=models.CASCADE,
        related_name="pricelist_items",
    )
    price = models.DecimalField(max_digits=12, decimal_places=2)
    effective_from = models.DateField()
    effective_to = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ["product__name"]
        verbose_name = "Pricelist Item"
        verbose_name_plural = "Pricelist Items"
        # One price per product per pricelist — same uniqueness Odoo enforces
        unique_together = [["pricelist", "product"]]
        constraints = [
            models.CheckConstraint(
                check=models.Q(price__gte=0),
                name="pricelist_item_price_non_negative",
            )
        ]

    def __str__(self):
        return f"{self.pricelist.customer.name} | {self.product.name} @ {self.price}"

    # ------------------------------------------------------------------
    # Odoo-style save hook: capture old price → write → log history
    # ------------------------------------------------------------------

    def save(self, *args, **kwargs):
        is_new = self.pk is None
        old_price = None

        if not is_new:
            # Capture current price BEFORE the write — mirrors Odoo's
            # `old_prices = {item.id: item.fixed_price for item in self}`
            try:
                old_price = PricelistItem.objects.values_list("price", flat=True).get(pk=self.pk)
            except PricelistItem.DoesNotExist:
                old_price = Decimal("0.00")

        super().save(*args, **kwargs)

        # Only log if price actually changed (or is new)
        if is_new or (old_price is not None and old_price != self.price):
            self._log_price_history(
                old_price=old_price or Decimal("0.00"),
                is_new=is_new,
            )

    def _log_price_history(self, old_price, is_new):
        """
        Write one immutable PriceHistory row.
        Version auto-increments per customer+product pair.
        """
        customer = self.pricelist.customer
        last = (
            PriceHistory.objects.filter(customer=customer, product=self.product)
            .order_by("-version")
            .values_list("version", flat=True)
            .first()
        )
        version = (last + 1) if last else 1

        PriceHistory.objects.create(
            customer=customer,
            product=self.product,
            pricelist_item=self,
            old_price=old_price,
            new_price=self.price,
            version=version,
            notes="Initial price set" if is_new else "",
            changed_by=get_current_user(),
        )


class PriceHistory(models.Model):
    """
    Immutable audit log of every price change.

    save()   raises PermissionDenied if the record already exists (pk set).
    delete() always raises PermissionDenied.

    Direct port of Odoo's customer.price.history which has no write/unlink
    access rights for any group.
    """

    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.CASCADE,
        related_name="price_history",
        db_index=True,
    )
    product = models.ForeignKey(
        "products.Product",
        on_delete=models.CASCADE,
        related_name="price_history",
        db_index=True,
    )
    pricelist_item = models.ForeignKey(
        PricelistItem,
        null=True,
        on_delete=models.SET_NULL,
        related_name="history",
    )
    old_price = models.DecimalField(max_digits=12, decimal_places=2)
    new_price = models.DecimalField(max_digits=12, decimal_places=2)
    version = models.PositiveIntegerField()
    changed_at = models.DateTimeField(auto_now_add=True)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    notes = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["-changed_at"]
        verbose_name = "Price History"
        verbose_name_plural = "Price History"
        # Uniqueness: one version number per customer+product pair
        unique_together = [["customer", "product", "version"]]

    def __str__(self):
        return (
            f"{self.product.name} | {self.customer.name} | "
            f"v{self.version} | {self.old_price} → {self.new_price}"
        )

    # ------------------------------------------------------------------
    # Immutability guards — Odoo equivalent: no write/unlink on model
    # ------------------------------------------------------------------

    def save(self, *args, **kwargs):
        if self.pk:
            raise PermissionDenied(
                "Price history records are immutable and cannot be modified."
            )
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise PermissionDenied(
            "Price history records are immutable and cannot be deleted."
        )
