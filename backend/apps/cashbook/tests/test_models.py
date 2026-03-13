"""
Unit tests for CashTransaction model and compute_balance utility.

Covers:
  - Amount must be > 0 (ValidationError on <= 0)
  - Category must match transaction_type (new categories: sale/payment_received/manual_in vs expense/manual_out)
  - order FK linkage (optional)
  - compute_balance returns correct totals
"""
import datetime
from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError

from apps.cashbook.models import CashTransaction, compute_balance


@pytest.mark.django_db
class TestCashTransactionModel:

    def _make(self, **kwargs):
        defaults = {
            "transaction_type": CashTransaction.TYPE_IN,
            "amount":           Decimal("100.00"),
            "category":         "sale",
            "mode":             CashTransaction.MODE_CASH,
            "transaction_date": datetime.date.today(),
        }
        defaults.update(kwargs)
        return CashTransaction(**defaults)

    def test_valid_in_sale_saves(self, db):
        txn = self._make(category="sale")
        txn.save()
        assert txn.pk is not None

    def test_valid_in_payment_received_saves(self, db):
        txn = self._make(category="payment_received")
        txn.save()
        assert txn.pk is not None

    def test_valid_in_manual_in_saves(self, db):
        txn = self._make(category="manual_in")
        txn.save()
        assert txn.pk is not None

    def test_valid_out_expense_saves(self, db):
        txn = self._make(transaction_type=CashTransaction.TYPE_OUT, category="expense")
        txn.save()
        assert txn.pk is not None

    def test_valid_out_manual_out_saves(self, db):
        txn = self._make(transaction_type=CashTransaction.TYPE_OUT, category="manual_out")
        txn.save()
        assert txn.pk is not None

    def test_amount_zero_raises(self, db):
        txn = self._make(amount=Decimal("0"))
        with pytest.raises(ValidationError):
            txn.save()

    def test_amount_negative_raises(self, db):
        txn = self._make(amount=Decimal("-50"))
        with pytest.raises(ValidationError):
            txn.save()

    def test_out_category_on_in_type_raises(self, db):
        txn = self._make(transaction_type=CashTransaction.TYPE_IN, category="expense")
        with pytest.raises(ValidationError) as exc:
            txn.save()
        assert "category" in str(exc.value)

    def test_in_category_on_out_type_raises(self, db):
        txn = self._make(transaction_type=CashTransaction.TYPE_OUT, category="sale")
        with pytest.raises(ValidationError) as exc:
            txn.save()
        assert "category" in str(exc.value)

    def test_manual_out_on_in_type_raises(self, db):
        txn = self._make(transaction_type=CashTransaction.TYPE_IN, category="manual_out")
        with pytest.raises(ValidationError) as exc:
            txn.save()
        assert "category" in str(exc.value)


@pytest.mark.django_db
class TestComputeBalance:

    def _create(self, txn_type, category, amount, mode=CashTransaction.MODE_CASH):
        CashTransaction.objects.create(
            transaction_type=txn_type,
            amount=Decimal(str(amount)),
            category=category,
            mode=mode,
            transaction_date=datetime.date.today(),
        )

    def test_balance_in_minus_out(self, db):
        self._create(CashTransaction.TYPE_IN,  "sale",    500)
        self._create(CashTransaction.TYPE_OUT, "expense", 200)
        result = compute_balance()
        assert result["total_in"]  == Decimal("500.00")
        assert result["total_out"] == Decimal("200.00")
        assert result["balance"]   == Decimal("300.00")

    def test_cash_in_hand_cash_mode_only(self, db):
        self._create(CashTransaction.TYPE_IN,  "sale",             500, mode=CashTransaction.MODE_CASH)
        self._create(CashTransaction.TYPE_IN,  "payment_received", 100, mode=CashTransaction.MODE_ONLINE)
        self._create(CashTransaction.TYPE_OUT, "expense",          200, mode=CashTransaction.MODE_CASH)
        result = compute_balance()
        assert result["cash_in_hand"] == Decimal("300.00")   # 500 - 200
        assert result["balance"]      == Decimal("400.00")   # 600 - 200

    def test_empty_returns_zeroes(self, db):
        result = compute_balance()
        assert result["balance"]      == Decimal("0")
        assert result["cash_in_hand"] == Decimal("0")

    def test_compute_balance_with_queryset_filter(self, db):
        self._create(CashTransaction.TYPE_IN, "sale",      300)
        self._create(CashTransaction.TYPE_IN, "manual_in", 700)
        qs = CashTransaction.objects.filter(category="sale")
        result = compute_balance(qs)
        assert result["total_in"]  == Decimal("300.00")
        assert result["total_out"] == Decimal("0")
