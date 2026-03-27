"""
Unit tests for suppliers domain models.

Covers:
  - Supplier.outstanding_balance with no activity
  - Supplier.outstanding_balance = confirmed invoice total - payment
  - SupplierPayment.clean() raises ValidationError when amount <= 0
  - PurchaseInvoice.recalculate_total() aggregates line items correctly
"""
import datetime
from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError

from apps.products.models import Product, ProductCategory
from apps.suppliers.models import (
    PurchaseInvoice,
    PurchaseItem,
    Supplier,
    SupplierPayment,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

@pytest.fixture
def supplier(db):
    return Supplier.objects.create(name="Test Supplier")


@pytest.fixture
def product(db):
    cat = ProductCategory.objects.create(name="General")
    return Product.objects.create(
        name="Test Product",
        sku="TEST-001",
        base_price=Decimal("100.00"),
        unit="pcs",
        category=cat,
    )


@pytest.fixture
def draft_invoice(db, supplier):
    return PurchaseInvoice.objects.create(
        supplier=supplier,
        invoice_date=datetime.date.today(),
        invoice_number="INV-001",
    )


# ---------------------------------------------------------------------------
# Supplier.outstanding_balance
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestSupplierOutstandingBalance:
    def test_zero_with_no_invoices(self, supplier):
        assert supplier.outstanding_balance == Decimal("0")

    def test_zero_with_only_draft_invoice(self, supplier, product, draft_invoice):
        """Draft invoices do not count towards the outstanding balance."""
        PurchaseItem.objects.create(
            invoice=draft_invoice,
            product=product,
            quantity=Decimal("2.000"),
            unit_price=Decimal("50.00"),
        )
        draft_invoice.recalculate_total()
        assert supplier.outstanding_balance == Decimal("0")

    def test_balance_equals_confirmed_invoice_minus_payment(self, supplier, product, draft_invoice):
        PurchaseItem.objects.create(
            invoice=draft_invoice,
            product=product,
            quantity=Decimal("4.000"),
            unit_price=Decimal("100.00"),
        )
        draft_invoice.recalculate_total()
        # Confirm the invoice
        draft_invoice.status = PurchaseInvoice.STATUS_CONFIRMED
        draft_invoice.save(update_fields=["status", "updated_at"])

        # Balance should now equal the invoice total
        assert supplier.outstanding_balance == Decimal("400.00")

        # Record a partial payment (bypass signal by using update to avoid cashbook dep)
        SupplierPayment.objects.create(
            supplier=supplier,
            amount=Decimal("150.00"),
            payment_date=datetime.date.today(),
        )

        supplier.refresh_from_db()
        assert supplier.outstanding_balance == Decimal("250.00")

    def test_paid_invoice_included_in_balance(self, supplier, product, draft_invoice):
        PurchaseItem.objects.create(
            invoice=draft_invoice,
            product=product,
            quantity=Decimal("1.000"),
            unit_price=Decimal("200.00"),
        )
        draft_invoice.recalculate_total()
        draft_invoice.status = PurchaseInvoice.STATUS_PAID
        draft_invoice.save(update_fields=["status", "updated_at"])

        assert supplier.outstanding_balance == Decimal("200.00")


# ---------------------------------------------------------------------------
# SupplierPayment.clean()
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestSupplierPaymentClean:
    def test_zero_amount_raises(self, supplier):
        payment = SupplierPayment(
            supplier=supplier,
            amount=Decimal("0.00"),
            payment_date=datetime.date.today(),
        )
        with pytest.raises(ValidationError):
            payment.clean()

    def test_negative_amount_raises(self, supplier):
        payment = SupplierPayment(
            supplier=supplier,
            amount=Decimal("-10.00"),
            payment_date=datetime.date.today(),
        )
        with pytest.raises(ValidationError):
            payment.clean()

    def test_positive_amount_passes(self, supplier):
        payment = SupplierPayment(
            supplier=supplier,
            amount=Decimal("50.00"),
            payment_date=datetime.date.today(),
        )
        # Should not raise
        payment.clean()


# ---------------------------------------------------------------------------
# PurchaseInvoice.recalculate_total()
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestPurchaseInvoiceRecalculateTotal:
    def test_no_items_yields_zero(self, draft_invoice):
        draft_invoice.recalculate_total()
        draft_invoice.refresh_from_db()
        assert draft_invoice.total_amount == Decimal("0")

    def test_single_item(self, draft_invoice, product):
        PurchaseItem.objects.create(
            invoice=draft_invoice,
            product=product,
            quantity=Decimal("3.000"),
            unit_price=Decimal("25.00"),
        )
        draft_invoice.recalculate_total()
        draft_invoice.refresh_from_db()
        assert draft_invoice.total_amount == Decimal("75.00")

    def test_multiple_items_summed(self, draft_invoice, product):
        PurchaseItem.objects.create(
            invoice=draft_invoice, product=product,
            quantity=Decimal("2.000"), unit_price=Decimal("10.00"),
        )
        PurchaseItem.objects.create(
            invoice=draft_invoice, product=product,
            quantity=Decimal("5.000"), unit_price=Decimal("6.00"),
        )
        draft_invoice.recalculate_total()
        draft_invoice.refresh_from_db()
        # 2*10 + 5*6 = 20 + 30 = 50
        assert draft_invoice.total_amount == Decimal("50.00")
