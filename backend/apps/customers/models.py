"""
Customer and CreditLedger models.

Mirrors Odoo:
  Customer      → res.partner (is_customer=True)
  CreditLedger  → customer.credit.ledger

outstanding_balance is computed from ledger rows (like Odoo's stored
computed field with @api.depends) — calculated in Python, not stored,
so it's always fresh. The DB aggregate is done in one query.
"""
from django.db import models
from django.db.models import Case, DecimalField, Q, Sum, Value, When

from apps.core.models import AuditModel


class Customer(AuditModel):
    CUSTOMER_TYPES = [
        ("wholesale", "Wholesale"),
        ("restaurant", "Restaurant / Hotel"),
        ("retail", "Retail"),
        ("walkin", "Walk-in"),
        ("distributor", "Distributor"),
        ("other", "Other"),
    ]

    name = models.CharField(max_length=255, db_index=True)
    last_name = models.CharField(max_length=150, blank=True)
    phone = models.CharField(max_length=20, unique=True, db_index=True)
    email = models.EmailField(blank=True)
    company_name = models.CharField(max_length=255, blank=True)
    sales_rep = models.CharField(max_length=150, blank=True)
    tax_tin = models.CharField(max_length=50, blank=True)
    customer_type = models.CharField(
        max_length=20, choices=CUSTOMER_TYPES, default="retail", db_index=True
    )
    credit_limit = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "Customer"
        verbose_name_plural = "Customers"
        constraints = [
            models.CheckConstraint(
                check=Q(credit_limit__gte=0),
                name="customer_credit_limit_non_negative",
            )
        ]

    def __str__(self):
        return f"{self.name} ({self.phone})"

    @property
    def outstanding_balance(self):
        """
        Computed from ledger (like Odoo's @api.depends computed field).
        Positive = customer owes us.  Negative = advance / overpayment.
        One DB query using conditional aggregation.
        """
        result = self.credit_ledger.aggregate(
            balance=Sum(
                Case(
                    When(entry_type="credit", then="amount"),
                    When(entry_type="payment", then=models.F("amount") * Value(-1)),
                    When(entry_type="adjustment", then="amount"),
                    default=Value(0),
                    output_field=DecimalField(max_digits=12, decimal_places=2),
                )
            )
        )
        return result["balance"] or 0

    @property
    def is_over_credit_limit(self):
        if self.credit_limit == 0:
            return False
        return self.outstanding_balance > self.credit_limit


class CreditLedger(AuditModel):
    """
    Append-only ledger — every financial event leaves an entry.

    entry_type:
      credit     → customer bought on credit (balance goes UP)
      payment    → customer paid (balance goes DOWN)
      adjustment → manual correction (signed amount)
    """

    ENTRY_TYPES = [
        ("credit", "Credit Sale"),
        ("payment", "Payment Received"),
        ("adjustment", "Adjustment"),
    ]

    customer = models.ForeignKey(
        Customer,
        on_delete=models.CASCADE,
        related_name="credit_ledger",
        db_index=True,
    )
    date = models.DateField()
    entry_type = models.CharField(max_length=20, choices=ENTRY_TYPES)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    # Link back to the order that triggered this entry (nullable — adjustments have none)
    order = models.ForeignKey(
        "orders.Order",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="ledger_entries",
    )
    notes = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["-date", "-id"]
        verbose_name = "Credit Ledger Entry"
        verbose_name_plural = "Credit Ledger Entries"
        constraints = [
            models.CheckConstraint(
                check=Q(amount__gt=0),
                name="credit_ledger_amount_must_be_positive",
            )
        ]

    def __str__(self):
        return f"{self.get_entry_type_display()} | {self.customer.name} | {self.amount}"
