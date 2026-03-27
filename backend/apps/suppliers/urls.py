"""
URL patterns for the suppliers sub-domain.
Mounted at /api/v1/suppliers/ in config/urls.py.
"""
from django.urls import path

from .views import (
    SupplierDetailView,
    SupplierLedgerView,
    SupplierListCreateView,
    SupplierPaymentListCreateView,
    SupplierProductDeleteView,
    SupplierProductListCreateView,
)

app_name = "suppliers"

urlpatterns = [
    path("", SupplierListCreateView.as_view(), name="supplier-list"),
    path("<int:pk>/", SupplierDetailView.as_view(), name="supplier-detail"),
    path("<int:supplier_pk>/products/", SupplierProductListCreateView.as_view(), name="supplier-products"),
    path("<int:supplier_pk>/products/<int:pk>/", SupplierProductDeleteView.as_view(), name="supplier-product-delete"),
    path("<int:supplier_pk>/payments/", SupplierPaymentListCreateView.as_view(), name="supplier-payments"),
    path("<int:supplier_pk>/ledger/", SupplierLedgerView.as_view(), name="supplier-ledger"),
]
