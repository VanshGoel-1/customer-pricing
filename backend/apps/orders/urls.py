from django.urls import path

app_name = "orders"

from .views import (
    OrderCancelView,
    OrderConfirmView,
    OrderDetailView,
    OrderItemDeleteView,
    OrderItemListCreateView,
    OrderListCreateView,
    OrderMarkPaidView,
    OrderRecordPaymentView,
)

urlpatterns = [
    path("", OrderListCreateView.as_view(), name="order-list-create"),
    path("<int:pk>/", OrderDetailView.as_view(), name="order-detail"),
    path("<int:pk>/confirm/", OrderConfirmView.as_view(), name="order-confirm"),
    path("<int:pk>/mark-paid/", OrderMarkPaidView.as_view(), name="order-mark-paid"),
    path("<int:pk>/cancel/", OrderCancelView.as_view(), name="order-cancel"),
    path("<int:pk>/payment/", OrderRecordPaymentView.as_view(), name="order-payment"),
    path("<int:order_pk>/items/", OrderItemListCreateView.as_view(), name="order-items"),
    path("<int:order_pk>/items/<int:pk>/", OrderItemDeleteView.as_view(), name="order-item-delete"),
]
