"""
CashTransaction — daily cash flow ledger.

Categories (5 total):
  IN:  sale             — auto-created when a cash/online order is confirmed
       payment_received — auto-created when a credit customer pays
       manual_in        — cashier-entered miscellaneous income
  OUT: expense          — any business expense (rent, salary, supplies, …)
       manual_out       — cashier-entered miscellaneous outflow

The `order` FK links auto-created entries back to the source Order for
traceability. It is system-set; not writable via API.
"""
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import DecimalField, Q, Sum, Value
from django.db.models.functions import Coalesce

from apps.core.models import AuditModel


# ---------------------------------------------------------------------------
# Category constants
# ---------------------------------------------------------------------------

IN_CATEGORIES = [
    ("sale",              "Sale"),
    ("payment_received",  "Payment Received"),
    ("manual_in",         "Manual In"),
]

OUT_CATEGORIES = [
    ("expense",    "Expense"),
    ("manual_out", "Manual Out"),
]

_IN_CATEGORY_KEYS  = {c[0] for c in IN_CATEGORIES}
_OUT_CATEGORY_KEYS = {c[0] for c in OUT_CATEGORIES}

CATEGORY_CHOICES = IN_CATEGORIES + OUT_CATEGORIES


class CashTransaction(AuditModel):
    """One cash flow event — either money in (IN) or money out (OUT)."""

    TYPE_IN  = "IN"
    TYPE_OUT = "OUT"
    TYPE_CHOICES = [
        (TYPE_IN,  "Money In"),
        (TYPE_OUT, "Money Out"),
    ]

    MODE_CASH   = "cash"
    MODE_ONLINE = "online"
    MODE_CHOICES = [
        (MODE_CASH,   "Cash"),
        (MODE_ONLINE, "Online / UPI / Card"),
    ]

    transaction_type = models.CharField(
        max_length=3, choices=TYPE_CHOICES, db_index=True,
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    category = models.CharField(
        max_length=20, choices=CATEGORY_CHOICES, db_index=True,
    )
    mode = models.CharField(
        max_length=10, choices=MODE_CHOICES, default=MODE_CASH, db_index=True,
    )
    description    = models.TextField(blank=True)
    transaction_date = models.DateField(db_index=True)
    attachment = models.FileField(
        upload_to="cashbook/attachments/%Y/%m/",
        null=True, blank=True,
    )

    # Optional FK back to the Order that triggered this entry (auto-set by Order.confirm / mark_paid).
    order = models.ForeignKey(
        "orders.Order",
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="cash_transactions",
    )

    class Meta:
        ordering = ["-transaction_date", "-id"]
        verbose_name = "Cash Transaction"
        verbose_name_plural = "Cash Transactions"
        constraints = [
            models.CheckConstraint(
                condition=Q(amount__gt=0),
                name="cash_transaction_amount_positive",
            ),
            models.CheckConstraint(
                condition=Q(transaction_type__in=["IN", "OUT"]),
                name="cash_transaction_type_valid",
            ),
        ]

    def __str__(self):
        return (
            f"{self.transaction_type} | {self.get_category_display()} "
            f"| ₹{self.amount} | {self.transaction_date}"
        )

    def clean(self):
        """Enforce category ↔ transaction_type consistency."""
        if self.category:
            if self.transaction_type == self.TYPE_IN and self.category not in _IN_CATEGORY_KEYS:
                raise ValidationError(
                    {"category": f"Category '{self.category}' is not valid for IN transactions. "
                                 f"Valid: {', '.join(_IN_CATEGORY_KEYS)}."}
                )
            if self.transaction_type == self.TYPE_OUT and self.category not in _OUT_CATEGORY_KEYS:
                raise ValidationError(
                    {"category": f"Category '{self.category}' is not valid for OUT transactions. "
                                 f"Valid: {', '.join(_OUT_CATEGORY_KEYS)}."}
                )

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)


# ---------------------------------------------------------------------------
# Balance utility
# ---------------------------------------------------------------------------

def compute_balance(queryset=None):
    """
    Return dict: total_in, total_out, balance, cash_in_hand.
    cash_in_hand = (cash-mode IN) - (cash-mode OUT).
    """
    qs = queryset if queryset is not None else CashTransaction.objects.all()

    agg = qs.aggregate(
        total_in=Coalesce(
            Sum("amount", filter=Q(transaction_type=CashTransaction.TYPE_IN)),
            Value(0),
            output_field=DecimalField(max_digits=12, decimal_places=2),
        ),
        total_out=Coalesce(
            Sum("amount", filter=Q(transaction_type=CashTransaction.TYPE_OUT)),
            Value(0),
            output_field=DecimalField(max_digits=12, decimal_places=2),
        ),
        cash_in=Coalesce(
            Sum("amount", filter=Q(
                transaction_type=CashTransaction.TYPE_IN, mode=CashTransaction.MODE_CASH,
            )),
            Value(0),
            output_field=DecimalField(max_digits=12, decimal_places=2),
        ),
        cash_out=Coalesce(
            Sum("amount", filter=Q(
                transaction_type=CashTransaction.TYPE_OUT, mode=CashTransaction.MODE_CASH,
            )),
            Value(0),
            output_field=DecimalField(max_digits=12, decimal_places=2),
        ),
    )

    return {
        "total_in":     agg["total_in"],
        "total_out":    agg["total_out"],
        "balance":      agg["total_in"] - agg["total_out"],
        "cash_in_hand": agg["cash_in"]  - agg["cash_out"],
    }
