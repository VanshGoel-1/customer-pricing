from django.urls import path

app_name = "customers"

from .views import (
    CreditLedgerListCreateView,
    CustomerDetailView,
    CustomerListCreateView,
    CustomerPhoneLookupView,
)

urlpatterns = [
    path("", CustomerListCreateView.as_view(), name="customer-list-create"),
    path("lookup/", CustomerPhoneLookupView.as_view(), name="customer-phone-lookup"),
    path("<int:pk>/", CustomerDetailView.as_view(), name="customer-detail"),
    path("<int:customer_pk>/ledger/", CreditLedgerListCreateView.as_view(), name="customer-ledger"),
]
