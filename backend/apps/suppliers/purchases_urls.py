"""
URL patterns for the purchases sub-domain.
Mounted at /api/v1/purchases/ in config/urls.py.
"""
from django.urls import path

from .views import (
    PurchaseInvoiceConfirmView,
    PurchaseInvoiceDetailView,
    PurchaseInvoiceListCreateView,
    PurchaseInvoiceMarkPaidView,
    PurchaseItemDeleteView,
)

app_name = "purchases"

urlpatterns = [
    path("", PurchaseInvoiceListCreateView.as_view(), name="purchase-list"),
    path("<int:pk>/", PurchaseInvoiceDetailView.as_view(), name="purchase-detail"),
    path("<int:pk>/confirm/", PurchaseInvoiceConfirmView.as_view(), name="purchase-confirm"),
    path("<int:pk>/mark-paid/", PurchaseInvoiceMarkPaidView.as_view(), name="purchase-mark-paid"),
    path("<int:invoice_pk>/items/<int:pk>/", PurchaseItemDeleteView.as_view(), name="purchase-item-delete"),
]
