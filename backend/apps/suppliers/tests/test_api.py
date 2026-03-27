"""
API tests for the suppliers app.

Covers:
  - Authentication / authorization on all endpoints
  - Supplier CRUD (create, list, update, soft-delete)
  - PurchaseInvoice lifecycle (create, confirm, mark-paid, delete)
  - SupplierPayment creation and cashbook sync
  - SupplierLedger merged chronological view
"""
import datetime
from decimal import Decimal

import pytest

from apps.cashbook.models import CashTransaction
from apps.products.models import Product, ProductCategory
from apps.suppliers.models import (
    PurchaseInvoice,
    PurchaseItem,
    Supplier,
    SupplierPayment,
)

SUPPLIER_LIST_URL = "/api/v1/suppliers/"
PURCHASE_LIST_URL = "/api/v1/purchases/"


def supplier_detail_url(pk):
    return f"/api/v1/suppliers/{pk}/"


def supplier_products_url(supplier_pk):
    return f"/api/v1/suppliers/{supplier_pk}/products/"


def supplier_payments_url(supplier_pk):
    return f"/api/v1/suppliers/{supplier_pk}/payments/"


def supplier_ledger_url(supplier_pk):
    return f"/api/v1/suppliers/{supplier_pk}/ledger/"


def purchase_detail_url(pk):
    return f"/api/v1/purchases/{pk}/"


def purchase_confirm_url(pk):
    return f"/api/v1/purchases/{pk}/confirm/"


def purchase_mark_paid_url(pk):
    return f"/api/v1/purchases/{pk}/mark-paid/"


def purchase_item_delete_url(invoice_pk, item_pk):
    return f"/api/v1/purchases/{invoice_pk}/items/{item_pk}/"


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def product(db):
    cat = ProductCategory.objects.create(name="TestCat")
    return Product.objects.create(
        name="Rice",
        sku="RICE-001",
        base_price=Decimal("50.00"),
        unit="kg",
        category=cat,
    )


@pytest.fixture
def supplier(db):
    return Supplier.objects.create(name="Best Wholesale", phone="9876543210")


@pytest.fixture
def draft_invoice(db, supplier, product):
    inv = PurchaseInvoice.objects.create(
        supplier=supplier,
        invoice_date=datetime.date.today(),
        invoice_number="INV-TEST-001",
    )
    PurchaseItem.objects.create(
        invoice=inv, product=product,
        quantity=Decimal("10.000"), unit_price=Decimal("40.00"),
    )
    inv.recalculate_total()
    return inv


@pytest.fixture
def confirmed_invoice(db, draft_invoice):
    draft_invoice.status = PurchaseInvoice.STATUS_CONFIRMED
    draft_invoice.confirmed_at = datetime.datetime.now(tz=datetime.timezone.utc)
    draft_invoice.save(update_fields=["status", "confirmed_at", "updated_at"])
    return draft_invoice


def _supplier_payload(**kwargs):
    defaults = {
        "name": "New Supplier",
        "phone": "9000000001",
        "email": "new@supplier.com",
    }
    defaults.update(kwargs)
    return defaults


def _invoice_payload(supplier_id, product_id, **kwargs):
    defaults = {
        "supplier": supplier_id,
        "invoice_number": "EXT-001",
        "invoice_date": str(datetime.date.today()),
        "items": [
            {"product": product_id, "quantity": "5.000", "unit_price": "80.00", "gst_rate": "5.00"},
        ],
    }
    defaults.update(kwargs)
    return defaults


# ---------------------------------------------------------------------------
# TestSupplierAuth — unauthenticated requests should get 401
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestSupplierAuth:
    def test_unauthenticated_list_returns_401(self, api_client):
        response = api_client.get(SUPPLIER_LIST_URL)
        assert response.status_code == 401

    def test_unauthenticated_create_returns_401(self, api_client):
        response = api_client.post(SUPPLIER_LIST_URL, _supplier_payload())
        assert response.status_code == 401

    def test_unauthenticated_purchases_list_returns_401(self, api_client):
        response = api_client.get(PURCHASE_LIST_URL)
        assert response.status_code == 401


# ---------------------------------------------------------------------------
# TestSupplierCRUD
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestSupplierCRUD:
    def test_manager_can_create_supplier(self, manager_api_client):
        response = manager_api_client.post(SUPPLIER_LIST_URL, _supplier_payload(), format="json")
        assert response.status_code == 201
        assert response.data["success"] is True
        assert response.data["data"]["name"] == "New Supplier"

    def test_admin_can_create_supplier(self, admin_api_client):
        response = admin_api_client.post(SUPPLIER_LIST_URL, _supplier_payload(name="Admin Supplier"), format="json")
        assert response.status_code == 201

    def test_cashier_cannot_create_supplier(self, cashier_api_client):
        response = cashier_api_client.post(SUPPLIER_LIST_URL, _supplier_payload(), format="json")
        assert response.status_code == 403

    def test_cashier_can_list_suppliers(self, cashier_api_client, supplier):
        response = cashier_api_client.get(SUPPLIER_LIST_URL)
        assert response.status_code == 200

    def test_list_returns_active_only(self, manager_api_client, supplier):
        # Create an inactive supplier
        Supplier.objects.create(name="Inactive Co", is_active=False)
        response = manager_api_client.get(SUPPLIER_LIST_URL)
        names = [s["name"] for s in response.data["results"]]
        assert "Best Wholesale" in names
        assert "Inactive Co" not in names

    def test_manager_can_update_supplier(self, manager_api_client, supplier):
        response = manager_api_client.patch(
            supplier_detail_url(supplier.pk),
            {"name": "Updated Name"},
            format="json",
        )
        assert response.status_code == 200
        assert response.data["data"]["name"] == "Updated Name"

    def test_cashier_cannot_update_supplier(self, cashier_api_client, supplier):
        response = cashier_api_client.patch(
            supplier_detail_url(supplier.pk),
            {"name": "Hacked"},
            format="json",
        )
        assert response.status_code == 403

    def test_soft_delete_deactivates_supplier(self, manager_api_client, supplier):
        response = manager_api_client.delete(supplier_detail_url(supplier.pk))
        assert response.status_code == 200
        assert response.data["success"] is True
        supplier.refresh_from_db()
        assert supplier.is_active is False

    def test_phone_strips_spaces_and_dashes(self, manager_api_client):
        response = manager_api_client.post(
            SUPPLIER_LIST_URL,
            _supplier_payload(phone="98 765-43210"),
            format="json",
        )
        assert response.status_code == 201
        assert response.data["data"]["phone"] == "9876543210"


# ---------------------------------------------------------------------------
# TestPurchaseInvoice
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestPurchaseInvoice:
    def test_create_invoice_with_items(self, manager_api_client, supplier, product):
        payload = _invoice_payload(supplier.pk, product.pk)
        response = manager_api_client.post(PURCHASE_LIST_URL, payload, format="json")
        assert response.status_code == 201
        assert response.data["success"] is True
        data = response.data["data"]
        assert data["status"] == "draft"
        assert len(data["items"]) == 1
        assert Decimal(data["total_amount"]) == Decimal("400.00")  # 5 * 80

    def test_cashier_cannot_create_invoice(self, cashier_api_client, supplier, product):
        payload = _invoice_payload(supplier.pk, product.pk)
        response = cashier_api_client.post(PURCHASE_LIST_URL, payload, format="json")
        assert response.status_code == 403

    def test_cashier_can_list_invoices(self, cashier_api_client, draft_invoice):
        response = cashier_api_client.get(PURCHASE_LIST_URL)
        assert response.status_code == 200

    def test_confirm_invoice(self, manager_api_client, draft_invoice):
        response = manager_api_client.post(purchase_confirm_url(draft_invoice.pk))
        assert response.status_code == 200
        assert response.data["data"]["status"] == "confirmed"
        assert response.data["data"]["confirmed_at"] is not None

    def test_cannot_confirm_already_confirmed(self, manager_api_client, confirmed_invoice):
        response = manager_api_client.post(purchase_confirm_url(confirmed_invoice.pk))
        assert response.status_code == 400

    def test_mark_paid(self, manager_api_client, confirmed_invoice):
        response = manager_api_client.post(purchase_mark_paid_url(confirmed_invoice.pk))
        assert response.status_code == 200
        assert response.data["data"]["status"] == "paid"
        assert response.data["data"]["paid_at"] is not None

    def test_cannot_mark_paid_draft(self, manager_api_client, draft_invoice):
        response = manager_api_client.post(purchase_mark_paid_url(draft_invoice.pk))
        assert response.status_code == 400

    def test_delete_draft_invoice(self, manager_api_client, draft_invoice):
        response = manager_api_client.delete(purchase_detail_url(draft_invoice.pk))
        assert response.status_code == 204
        assert not PurchaseInvoice.objects.filter(pk=draft_invoice.pk).exists()

    def test_cannot_delete_confirmed_invoice(self, manager_api_client, confirmed_invoice):
        response = manager_api_client.delete(purchase_detail_url(confirmed_invoice.pk))
        assert response.status_code == 400

    def test_create_without_items_returns_400(self, manager_api_client, supplier):
        payload = {
            "supplier": supplier.pk,
            "invoice_date": str(datetime.date.today()),
            "items": [],
        }
        response = manager_api_client.post(PURCHASE_LIST_URL, payload, format="json")
        assert response.status_code == 400

    def test_patch_draft_invoice_rebuilds_items(self, manager_api_client, draft_invoice, product):
        new_payload = {
            "items": [
                {"product": product.pk, "quantity": "2.000", "unit_price": "200.00", "gst_rate": "0.00"}
            ]
        }
        response = manager_api_client.patch(
            purchase_detail_url(draft_invoice.pk), new_payload, format="json"
        )
        assert response.status_code == 200
        # 2 * 200 = 400
        assert Decimal(response.data["data"]["total_amount"]) == Decimal("400.00")

    def test_delete_item_from_draft(self, manager_api_client, draft_invoice):
        item = draft_invoice.items.first()
        response = manager_api_client.delete(
            purchase_item_delete_url(draft_invoice.pk, item.pk)
        )
        assert response.status_code == 204
        draft_invoice.refresh_from_db()
        assert draft_invoice.total_amount == Decimal("0.00")

    def test_cannot_delete_item_from_confirmed_invoice(self, manager_api_client, confirmed_invoice):
        item = confirmed_invoice.items.first()
        response = manager_api_client.delete(
            purchase_item_delete_url(confirmed_invoice.pk, item.pk)
        )
        assert response.status_code == 400


# ---------------------------------------------------------------------------
# TestSupplierPayment
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestSupplierPayment:
    def test_record_payment_returns_201(self, manager_api_client, supplier):
        payload = {
            "supplier": supplier.pk,
            "amount": "500.00",
            "mode": "cash",
            "payment_date": str(datetime.date.today()),
        }
        response = manager_api_client.post(
            supplier_payments_url(supplier.pk), payload, format="json"
        )
        assert response.status_code == 201
        assert response.data["success"] is True

    def test_payment_creates_cashbook_entry(self, manager_api_client, supplier):
        before = CashTransaction.objects.filter(category="supplier_payment").count()
        payload = {
            "supplier": supplier.pk,
            "amount": "750.00",
            "mode": "online",
            "payment_date": str(datetime.date.today()),
        }
        manager_api_client.post(supplier_payments_url(supplier.pk), payload, format="json")
        after = CashTransaction.objects.filter(category="supplier_payment").count()
        assert after == before + 1

    def test_cashbook_entry_is_out_type(self, manager_api_client, supplier):
        payload = {
            "supplier": supplier.pk,
            "amount": "300.00",
            "mode": "cash",
            "payment_date": str(datetime.date.today()),
        }
        manager_api_client.post(supplier_payments_url(supplier.pk), payload, format="json")
        entry = CashTransaction.objects.filter(category="supplier_payment").last()
        assert entry is not None
        assert entry.transaction_type == CashTransaction.TYPE_OUT
        assert entry.amount == Decimal("300.00")

    def test_cashier_cannot_create_payment(self, cashier_api_client, supplier):
        payload = {
            "supplier": supplier.pk,
            "amount": "100.00",
            "mode": "cash",
            "payment_date": str(datetime.date.today()),
        }
        response = cashier_api_client.post(
            supplier_payments_url(supplier.pk), payload, format="json"
        )
        assert response.status_code == 403

    def test_zero_amount_returns_400(self, manager_api_client, supplier):
        payload = {
            "supplier": supplier.pk,
            "amount": "0.00",
            "mode": "cash",
            "payment_date": str(datetime.date.today()),
        }
        response = manager_api_client.post(
            supplier_payments_url(supplier.pk), payload, format="json"
        )
        assert response.status_code == 400

    def test_cheque_mode_creates_cash_cashbook_entry(self, manager_api_client, supplier):
        """Cheque payments map to mode='cash' in the cashbook."""
        payload = {
            "supplier": supplier.pk,
            "amount": "1000.00",
            "mode": "cheque",
            "payment_date": str(datetime.date.today()),
        }
        manager_api_client.post(supplier_payments_url(supplier.pk), payload, format="json")
        entry = CashTransaction.objects.filter(category="supplier_payment").last()
        assert entry is not None
        assert entry.mode == CashTransaction.MODE_CASH


# ---------------------------------------------------------------------------
# TestSupplierLedger
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestSupplierLedger:
    def test_ledger_empty_for_new_supplier(self, manager_api_client, supplier):
        response = manager_api_client.get(supplier_ledger_url(supplier.pk))
        assert response.status_code == 200
        assert response.data["data"] == []

    def test_ledger_draft_invoice_not_included(self, manager_api_client, supplier, draft_invoice):
        response = manager_api_client.get(supplier_ledger_url(supplier.pk))
        assert response.status_code == 200
        assert response.data["data"] == []

    def test_ledger_includes_confirmed_invoice(self, manager_api_client, supplier, confirmed_invoice):
        response = manager_api_client.get(supplier_ledger_url(supplier.pk))
        assert response.status_code == 200
        entries = response.data["data"]
        assert len(entries) == 1
        assert entries[0]["entry_type"] == "invoice"
        assert entries[0]["status"] == "confirmed"

    def test_ledger_includes_payment(self, manager_api_client, supplier, confirmed_invoice):
        SupplierPayment.objects.create(
            supplier=supplier,
            amount=Decimal("100.00"),
            payment_date=datetime.date.today(),
        )
        response = manager_api_client.get(supplier_ledger_url(supplier.pk))
        entry_types = [e["entry_type"] for e in response.data["data"]]
        assert "invoice" in entry_types
        assert "payment" in entry_types

    def test_ledger_sorted_by_date_desc(self, manager_api_client, supplier):
        yesterday = datetime.date.today() - datetime.timedelta(days=1)
        old_inv = PurchaseInvoice.objects.create(
            supplier=supplier,
            invoice_date=yesterday,
            invoice_number="OLD-001",
            status=PurchaseInvoice.STATUS_CONFIRMED,
            total_amount=Decimal("100.00"),
        )
        new_inv = PurchaseInvoice.objects.create(
            supplier=supplier,
            invoice_date=datetime.date.today(),
            invoice_number="NEW-001",
            status=PurchaseInvoice.STATUS_CONFIRMED,
            total_amount=Decimal("200.00"),
        )
        response = manager_api_client.get(supplier_ledger_url(supplier.pk))
        entries = response.data["data"]
        assert len(entries) == 2
        # Most recent first
        assert entries[0]["reference_id"] == "NEW-001"
        assert entries[1]["reference_id"] == "OLD-001"

    def test_cashier_can_read_ledger(self, cashier_api_client, supplier):
        response = cashier_api_client.get(supplier_ledger_url(supplier.pk))
        assert response.status_code == 200
