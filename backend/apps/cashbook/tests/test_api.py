"""
API tests for the Cashbook endpoints.

Covers:
  - POST /api/v1/cashbook/in/          — create IN transaction
  - POST /api/v1/cashbook/out/         — create OUT transaction
  - GET  /api/v1/cashbook/             — list with filters
  - GET  /api/v1/cashbook/summary/     — balance totals
  - GET  /api/v1/cashbook/categories/  — category list
  - GET/PATCH/DELETE /api/v1/cashbook/{id}/
  - Role-based access: unauthenticated → 401, cashier scope, manager scope
  - Order sync: cash/online confirm → auto CashTransaction; credit confirm → no entry
  - Payment sync: mark_paid / record_payment → CashTransaction payment_received
"""
import datetime
from decimal import Decimal

import pytest

from apps.cashbook.models import CashTransaction


CASHBOOK_LIST_URL     = "/api/v1/cashbook/"
CASHBOOK_IN_URL       = "/api/v1/cashbook/in/"
CASHBOOK_OUT_URL      = "/api/v1/cashbook/out/"
CASHBOOK_SUMMARY_URL  = "/api/v1/cashbook/summary/"
CASHBOOK_CATEGORIES_URL = "/api/v1/cashbook/categories/"


def detail_url(pk):
    return f"/api/v1/cashbook/{pk}/"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _in_payload(**kwargs):
    defaults = {
        "amount":           "500.00",
        "category":         "sale",
        "mode":             "cash",
        "transaction_date": str(datetime.date.today()),
        "description":      "Morning sales",
    }
    defaults.update(kwargs)
    return defaults


def _out_payload(**kwargs):
    defaults = {
        "amount":           "200.00",
        "category":         "expense",
        "mode":             "cash",
        "transaction_date": str(datetime.date.today()),
        "description":      "Monthly rent",
    }
    defaults.update(kwargs)
    return defaults


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestCashbookAuth:

    def test_unauthenticated_list_returns_401(self, api_client):
        assert api_client.get(CASHBOOK_LIST_URL).status_code == 401

    def test_unauthenticated_summary_returns_401(self, api_client):
        assert api_client.get(CASHBOOK_SUMMARY_URL).status_code == 401

    def test_unauthenticated_in_post_returns_401(self, api_client):
        assert api_client.post(CASHBOOK_IN_URL, _in_payload()).status_code == 401

    def test_unauthenticated_out_post_returns_401(self, api_client):
        assert api_client.post(CASHBOOK_OUT_URL, _out_payload()).status_code == 401


# ---------------------------------------------------------------------------
# Create via /cashbook/in/ and /cashbook/out/
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestCashbookCreate:

    def test_create_in_returns_201(self, admin_api_client):
        res = admin_api_client.post(CASHBOOK_IN_URL, _in_payload(), format="json")
        assert res.status_code == 201
        assert res.data["success"] is True
        assert res.data["data"]["transaction_type"] == "IN"
        assert res.data["data"]["amount"] == "500.00"

    def test_create_out_returns_201(self, admin_api_client):
        res = admin_api_client.post(CASHBOOK_OUT_URL, _out_payload(), format="json")
        assert res.status_code == 201
        assert res.data["data"]["transaction_type"] == "OUT"

    def test_in_endpoint_forces_in_type(self, admin_api_client):
        """Even if client sends transaction_type=OUT, the /in/ endpoint overrides it."""
        payload = {**_in_payload(), "transaction_type": "OUT"}
        res = admin_api_client.post(CASHBOOK_IN_URL, payload, format="json")
        assert res.status_code == 201
        assert res.data["data"]["transaction_type"] == "IN"

    def test_out_endpoint_forces_out_type(self, admin_api_client):
        payload = {**_out_payload(), "transaction_type": "IN"}
        res = admin_api_client.post(CASHBOOK_OUT_URL, payload, format="json")
        assert res.status_code == 201
        assert res.data["data"]["transaction_type"] == "OUT"

    def test_create_negative_amount_returns_400(self, admin_api_client):
        res = admin_api_client.post(CASHBOOK_IN_URL, _in_payload(amount="-10"), format="json")
        assert res.status_code == 400

    def test_create_zero_amount_returns_400(self, admin_api_client):
        res = admin_api_client.post(CASHBOOK_IN_URL, _in_payload(amount="0"), format="json")
        assert res.status_code == 400

    def test_out_category_on_in_url_returns_400(self, admin_api_client):
        """expense is an OUT category — posting to /in/ should 400."""
        res = admin_api_client.post(CASHBOOK_IN_URL, _in_payload(category="expense"), format="json")
        assert res.status_code == 400

    def test_in_category_on_out_url_returns_400(self, admin_api_client):
        """sale is an IN category — posting to /out/ should 400."""
        res = admin_api_client.post(CASHBOOK_OUT_URL, _out_payload(category="sale"), format="json")
        assert res.status_code == 400

    def test_cashier_can_create_in(self, cashier_api_client):
        res = cashier_api_client.post(CASHBOOK_IN_URL, _in_payload(), format="json")
        assert res.status_code == 201

    def test_cashier_can_create_out(self, cashier_api_client):
        res = cashier_api_client.post(CASHBOOK_OUT_URL, _out_payload(), format="json")
        assert res.status_code == 201


# ---------------------------------------------------------------------------
# Summary endpoint
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestCashbookSummary:

    def _create_txn(self, client, url, payload):
        client.post(url, payload, format="json")

    def test_summary_reflects_in_minus_out(self, admin_api_client):
        self._create_txn(admin_api_client, CASHBOOK_IN_URL,  _in_payload(amount="500.00"))
        self._create_txn(admin_api_client, CASHBOOK_OUT_URL, _out_payload(amount="200.00"))
        res = admin_api_client.get(CASHBOOK_SUMMARY_URL)
        assert res.status_code == 200
        data = res.data["data"]
        assert Decimal(data["balance"])   == Decimal("300.00")
        assert Decimal(data["total_in"])  == Decimal("500.00")
        assert Decimal(data["total_out"]) == Decimal("200.00")

    def test_cash_in_hand_excludes_online(self, admin_api_client):
        self._create_txn(admin_api_client, CASHBOOK_IN_URL,
                         _in_payload(amount="500.00", mode="cash"))
        self._create_txn(admin_api_client, CASHBOOK_IN_URL,
                         _in_payload(amount="100.00", mode="online", category="payment_received"))
        self._create_txn(admin_api_client, CASHBOOK_OUT_URL,
                         _out_payload(amount="200.00", mode="cash"))
        res = admin_api_client.get(CASHBOOK_SUMMARY_URL)
        data = res.data["data"]
        assert Decimal(data["cash_in_hand"]) == Decimal("300.00")
        assert Decimal(data["balance"])      == Decimal("400.00")

    def test_empty_cashbook_returns_zero_balance(self, admin_api_client):
        res = admin_api_client.get(CASHBOOK_SUMMARY_URL)
        assert res.status_code == 200
        assert Decimal(res.data["data"]["balance"]) == Decimal("0")


# ---------------------------------------------------------------------------
# Filtering (GET list)
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestCashbookFilters:

    def test_filter_by_type_in(self, admin_api_client):
        admin_api_client.post(CASHBOOK_IN_URL,  _in_payload(),  format="json")
        admin_api_client.post(CASHBOOK_OUT_URL, _out_payload(), format="json")
        res = admin_api_client.get(CASHBOOK_LIST_URL + "?transaction_type=IN")
        assert all(t["transaction_type"] == "IN" for t in res.data["results"])

    def test_filter_by_type_out(self, admin_api_client):
        admin_api_client.post(CASHBOOK_IN_URL,  _in_payload(),  format="json")
        admin_api_client.post(CASHBOOK_OUT_URL, _out_payload(), format="json")
        res = admin_api_client.get(CASHBOOK_LIST_URL + "?transaction_type=OUT")
        assert all(t["transaction_type"] == "OUT" for t in res.data["results"])

    def test_filter_by_mode(self, admin_api_client):
        admin_api_client.post(CASHBOOK_IN_URL, _in_payload(mode="online", category="payment_received"), format="json")
        admin_api_client.post(CASHBOOK_IN_URL, _in_payload(mode="cash"),   format="json")
        res = admin_api_client.get(CASHBOOK_LIST_URL + "?mode=online")
        assert all(t["mode"] == "online" for t in res.data["results"])


# ---------------------------------------------------------------------------
# Role-based scope
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestCashbookRoleScope:

    def test_cashier_sees_only_own_transactions(self, cashier_api_client, cashier_user, admin_user, db):
        CashTransaction.objects.create(
            transaction_type="IN", amount=500, category="sale",
            mode="cash", transaction_date=datetime.date.today(), created_by=admin_user,
        )
        CashTransaction.objects.create(
            transaction_type="IN", amount=300, category="sale",
            mode="cash", transaction_date=datetime.date.today(), created_by=cashier_user,
        )
        res = cashier_api_client.get(CASHBOOK_LIST_URL)
        assert res.data["count"] == 1

    def test_manager_sees_all_transactions(self, manager_api_client, cashier_user, admin_user, db):
        CashTransaction.objects.create(
            transaction_type="IN", amount=500, category="sale",
            mode="cash", transaction_date=datetime.date.today(), created_by=admin_user,
        )
        CashTransaction.objects.create(
            transaction_type="IN", amount=300, category="sale",
            mode="cash", transaction_date=datetime.date.today(), created_by=cashier_user,
        )
        res = manager_api_client.get(CASHBOOK_LIST_URL)
        assert res.data["count"] == 2

    def test_cashier_cannot_delete(self, cashier_api_client):
        res = cashier_api_client.post(CASHBOOK_IN_URL, _in_payload(), format="json")
        pk = res.data["data"]["id"]
        assert cashier_api_client.delete(detail_url(pk)).status_code == 403

    def test_manager_can_delete(self, manager_api_client):
        res = manager_api_client.post(CASHBOOK_IN_URL, _in_payload(), format="json")
        pk = res.data["data"]["id"]
        assert manager_api_client.delete(detail_url(pk)).status_code == 204


# ---------------------------------------------------------------------------
# Categories endpoint
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestCashbookCategories:

    def test_categories_returns_in_and_out(self, admin_api_client):
        res = admin_api_client.get(CASHBOOK_CATEGORIES_URL)
        assert res.status_code == 200
        data = res.data["data"]
        assert "IN" in data and "OUT" in data
        in_values  = [c["value"] for c in data["IN"]]
        out_values = [c["value"] for c in data["OUT"]]
        assert "sale"             in in_values
        assert "payment_received" in in_values
        assert "manual_in"        in in_values
        assert "expense"          in out_values
        assert "manual_out"       in out_values


# ---------------------------------------------------------------------------
# Order sync
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestOrderCashbookSync:

    def _create_order(self, client, payment_mode="credit"):
        """Create customer + product + order with one item via API."""
        from apps.customers.models import Customer
        from apps.products.models import Product
        customer = Customer.objects.create(name="Test Customer", phone="9999999999")
        product  = Product.objects.create(name="Widget", sku="W001", base_price=Decimal("100.00"), unit="pcs")
        res = client.post("/api/v1/orders/", {
            "customer":     customer.pk,
            "payment_mode": payment_mode,
            "items": [{"product": product.pk, "quantity": "1"}],
        }, format="json")
        assert res.status_code == 201
        return res.data["data"]["id"]

    def test_cash_order_confirm_creates_cashbook_entry(self, admin_api_client):
        order_id = self._create_order(admin_api_client, payment_mode="cash")
        admin_api_client.post(f"/api/v1/orders/{order_id}/confirm/")
        txn = CashTransaction.objects.filter(order_id=order_id).first()
        assert txn is not None
        assert txn.transaction_type == "IN"
        assert txn.category          == "sale"
        assert txn.mode              == "cash"
        assert txn.amount            == Decimal("100.00")

    def test_online_order_confirm_creates_cashbook_entry(self, admin_api_client):
        order_id = self._create_order(admin_api_client, payment_mode="online")
        admin_api_client.post(f"/api/v1/orders/{order_id}/confirm/")
        txn = CashTransaction.objects.filter(order_id=order_id).first()
        assert txn is not None
        assert txn.category == "sale"
        assert txn.mode     == "online"

    def test_credit_order_confirm_does_not_create_cashbook_entry(self, admin_api_client):
        order_id = self._create_order(admin_api_client, payment_mode="credit")
        admin_api_client.post(f"/api/v1/orders/{order_id}/confirm/")
        assert CashTransaction.objects.filter(order_id=order_id).count() == 0

    def test_mark_paid_creates_payment_received_entry(self, manager_api_client):
        order_id = self._create_order(manager_api_client, payment_mode="credit")
        manager_api_client.post(f"/api/v1/orders/{order_id}/confirm/")
        manager_api_client.post(f"/api/v1/orders/{order_id}/mark-paid/", {"mode": "cash"}, format="json")
        txn = CashTransaction.objects.filter(order_id=order_id, category="payment_received").first()
        assert txn is not None
        assert txn.mode   == "cash"
        assert txn.amount == Decimal("100.00")

    def test_record_payment_creates_payment_received_entry(self, manager_api_client):
        order_id = self._create_order(manager_api_client, payment_mode="credit")
        manager_api_client.post(f"/api/v1/orders/{order_id}/confirm/")
        manager_api_client.post(
            f"/api/v1/orders/{order_id}/payment/",
            {"amount": "60.00", "mode": "online"},
            format="json",
        )
        txn = CashTransaction.objects.filter(
            order_id=order_id, category="payment_received"
        ).first()
        assert txn is not None
        assert txn.amount == Decimal("60.00")
        assert txn.mode   == "online"
