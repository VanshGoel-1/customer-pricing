from django.urls import path

app_name = "pricing"

from .views import (
    CustomerPriceLookupView,
    CustomerPricelistView,
    PriceHistoryListView,
    PricelistItemDetailView,
    PricelistItemListCreateView,
    SetCustomerPriceView,
)

urlpatterns = [
    path("history/", PriceHistoryListView.as_view(), name="price-history-list"),
    path("items/", PricelistItemListCreateView.as_view(), name="pricelist-item-list-create"),
    path("items/<int:pk>/", PricelistItemDetailView.as_view(), name="pricelist-item-detail"),
    path("set-price/", SetCustomerPriceView.as_view(), name="set-customer-price"),
    path("lookup/", CustomerPriceLookupView.as_view(), name="price-lookup"),
    path("pricelist/<int:customer_id>/", CustomerPricelistView.as_view(), name="customer-pricelist"),
]
