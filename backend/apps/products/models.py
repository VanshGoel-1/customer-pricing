"""
Product catalogue.

Mirrors Odoo's product.product / product.category:
  - ProductCategory  →  product.category
  - Product          →  product.product (simplified, no variants)

DB-level constraints enforce data integrity — not just application-level.
"""
from django.db import models

from apps.core.models import AuditModel


class ProductCategory(AuditModel):
    """Grouping for products — e.g. Beverages, Dry Goods, Dairy."""

    name = models.CharField(max_length=150, unique=True)
    description = models.TextField(blank=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "Product Category"
        verbose_name_plural = "Product Categories"

    def __str__(self):
        return self.name


class Product(AuditModel):
    """
    A sellable item.

    base_price is the default/list price. Customer-specific prices
    are stored in PricelistItem (pricing app).
    """

    UNIT_CHOICES = [
        ("pcs", "Pieces"),
        ("kg", "Kilograms"),
        ("g", "Grams"),
        ("l", "Litres"),
        ("ml", "Millilitres"),
        ("box", "Box"),
        ("pack", "Pack"),
        ("dozen", "Dozen"),
    ]

    name = models.CharField(max_length=255, db_index=True)
    sku = models.CharField(max_length=50, unique=True, db_index=True)
    category = models.ForeignKey(
        ProductCategory,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="products",
    )
    description = models.TextField(blank=True)
    base_price = models.DecimalField(max_digits=12, decimal_places=2)
    unit = models.CharField(max_length=20, choices=UNIT_CHOICES, default="pcs")
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "Product"
        verbose_name_plural = "Products"
        constraints = [
            models.CheckConstraint(
                check=models.Q(base_price__gte=0),
                name="product_base_price_non_negative",
            )
        ]

    def __str__(self):
        return f"[{self.sku}] {self.name}"
