import datetime
from decimal import Decimal, InvalidOperation

import django_filters
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import IsAnyRole, IsManagerOrAbove
from apps.core.throttling import OrderActionThrottle, OrderCreateThrottle

from .models import Order, OrderItem
from .serializers import (
    OrderCreateSerializer,
    OrderItemCreateSerializer,
    OrderItemSerializer,
    OrderSerializer,
)


class OrderFilter(django_filters.FilterSet):
    customer = django_filters.NumberFilter(field_name="customer__id")
    status = django_filters.CharFilter()

    class Meta:
        model = Order
        fields = ["customer", "status"]


class OrderListCreateView(generics.ListCreateAPIView):
    """
    GET  — all roles (cashier sees their own orders)
    POST — all roles (cashier creates orders on billing screen)
    """
    permission_classes = [IsAuthenticated, IsAnyRole]
    throttle_classes = [OrderCreateThrottle]  # 20/min per user — fake-order flood guard
    filterset_class = OrderFilter
    search_fields = ["order_number", "customer__name", "customer__phone"]
    ordering_fields = ["created_at", "total_amount"]

    def get_queryset(self):
        qs = Order.objects.select_related("customer", "confirmed_by").prefetch_related("items__product")
        # Cashiers only see their own orders
        if self.request.user.role == "cashier":
            return qs.filter(created_by=self.request.user)
        return qs

    def get_serializer_class(self):
        if self.request.method == "POST":
            return OrderCreateSerializer
        return OrderSerializer

    def create(self, request, *args, **kwargs):
        serializer = OrderCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = serializer.save(created_by=request.user)
        return Response(
            {"success": True, "data": OrderSerializer(order).data},
            status=status.HTTP_201_CREATED,
        )


class OrderDetailView(generics.RetrieveAPIView):
    """GET /api/v1/orders/{id}/ — retrieve one order."""
    serializer_class = OrderSerializer
    permission_classes = [IsAuthenticated, IsAnyRole]

    def get_queryset(self):
        qs = Order.objects.select_related("customer", "confirmed_by").prefetch_related("items__product")
        if self.request.user.role == "cashier":
            return qs.filter(created_by=self.request.user)
        return qs


class OrderConfirmView(APIView):
    """
    POST /api/v1/orders/{id}/confirm/
    Confirm a draft order — atomically posts a credit ledger entry.
    Mirrors Odoo's action_confirm().
    """
    permission_classes = [IsAuthenticated, IsAnyRole]
    throttle_classes = [OrderActionThrottle]  # 10/min per user — ledger-flooding guard

    def post(self, request, pk):
        try:
            order = Order.objects.get(pk=pk)
        except Order.DoesNotExist:
            return Response(
                {"success": False, "error": {"code": "not_found", "message": "Order not found."}},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Cashiers can only confirm their own orders
        if request.user.role == "cashier" and order.created_by != request.user:
            return Response(
                {"success": False, "error": {"code": "permission_denied", "message": "You can only confirm your own orders."}},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            order.confirm()
        except ValueError as e:
            return Response(
                {"success": False, "error": {"code": "validation_error", "message": str(e)}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response({"success": True, "data": OrderSerializer(order).data})


class OrderMarkPaidView(APIView):
    """POST /api/v1/orders/{id}/mark-paid/ — manager/admin only."""
    permission_classes = [IsAuthenticated, IsManagerOrAbove]
    throttle_classes = [OrderActionThrottle]  # 10/min per user — ledger-flooding guard

    def post(self, request, pk):
        try:
            order = Order.objects.get(pk=pk)
        except Order.DoesNotExist:
            return Response(
                {"success": False, "error": {"code": "not_found", "message": "Order not found."}},
                status=status.HTTP_404_NOT_FOUND,
            )
        payment_mode = request.data.get("mode", Order.PAYMENT_MODE_CASH)
        if payment_mode not in (Order.PAYMENT_MODE_CASH, Order.PAYMENT_MODE_ONLINE):
            payment_mode = Order.PAYMENT_MODE_CASH
        try:
            order.mark_paid(payment_mode=payment_mode)
        except ValueError as e:
            return Response(
                {"success": False, "error": {"code": "validation_error", "message": str(e)}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response({"success": True, "data": OrderSerializer(order).data})


class OrderCancelView(APIView):
    """
    POST /api/v1/orders/{id}/cancel/
    Managers can cancel any draft order.
    Cashiers can cancel only their own draft orders.
    """
    permission_classes = [IsAuthenticated, IsAnyRole]
    throttle_classes = [OrderActionThrottle]

    def post(self, request, pk):
        try:
            order = Order.objects.get(pk=pk)
        except Order.DoesNotExist:
            return Response(
                {"success": False, "error": {"code": "not_found", "message": "Order not found."}},
                status=status.HTTP_404_NOT_FOUND,
            )
        if request.user.role == "cashier" and order.created_by != request.user:
            return Response(
                {"success": False, "error": {"code": "permission_denied", "message": "You can only cancel your own orders."}},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not request.user.role == "cashier" and order.status not in (Order.STATUS_DRAFT,):
            # Managers can only cancel drafts too — confirmed orders need mark-paid flow
            pass
        try:
            order.cancel()
        except ValueError as e:
            return Response(
                {"success": False, "error": {"code": "validation_error", "message": str(e)}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response({"success": True, "message": "Order cancelled."})


class OrderRecordPaymentView(APIView):
    """
    POST /api/v1/orders/{id}/payment/
    Record a (possibly partial) payment against a confirmed order.
    Auto-marks as paid when total_paid >= total_amount.
    """
    permission_classes = [IsAuthenticated, IsAnyRole]
    throttle_classes = [OrderActionThrottle]

    def post(self, request, pk):
        try:
            order = Order.objects.get(pk=pk)
        except Order.DoesNotExist:
            return Response(
                {"success": False, "error": {"code": "not_found", "message": "Order not found."}},
                status=status.HTTP_404_NOT_FOUND,
            )
        if order.status != Order.STATUS_CONFIRMED:
            return Response(
                {"success": False, "error": {"code": "validation_error", "message": "Payments can only be recorded on confirmed orders."}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            amount = Decimal(str(request.data.get("amount", "")))
        except (InvalidOperation, ValueError):
            return Response(
                {"success": False, "error": {"code": "validation_error", "message": "Provide a valid payment amount."}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if amount <= 0:
            return Response(
                {"success": False, "error": {"code": "validation_error", "message": "Payment amount must be greater than zero."}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if amount > order.remaining_balance:
            return Response(
                {"success": False, "error": {"code": "validation_error", "message": f"Payment ({amount}) exceeds remaining balance ({order.remaining_balance})."}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        payment_mode = request.data.get("mode", Order.PAYMENT_MODE_CASH)
        if payment_mode not in (Order.PAYMENT_MODE_CASH, Order.PAYMENT_MODE_ONLINE):
            payment_mode = Order.PAYMENT_MODE_CASH

        from django.db import transaction as db_transaction
        with db_transaction.atomic():
            from apps.customers.models import CreditLedger
            CreditLedger.objects.create(
                customer=order.customer,
                date=datetime.date.today(),
                entry_type="payment",
                amount=amount,
                order=order,
                notes=f"Partial payment for {order.order_number}",
            )
            # Cashbook sync — record cash received from credit customer
            from apps.cashbook.models import CashTransaction
            CashTransaction.objects.create(
                transaction_type=CashTransaction.TYPE_IN,
                category="payment_received",
                amount=amount,
                mode=payment_mode,
                transaction_date=datetime.date.today(),
                description=f"Payment received for {order.order_number}",
                order=order,
            )
            order.refresh_from_db()
            if order.remaining_balance <= 0:
                order.status = Order.STATUS_PAID
                order.save(update_fields=["status", "updated_at"])
        order.refresh_from_db()
        return Response({"success": True, "data": OrderSerializer(order).data})


class OrderItemDeleteView(generics.DestroyAPIView):
    """
    DELETE /api/v1/orders/{order_pk}/items/{pk}/
    Remove a line from a draft order. Recalculates total after deletion.
    Cashiers can only remove items from their own orders.
    """
    permission_classes = [IsAuthenticated, IsAnyRole]

    def get_object(self):
        from django.shortcuts import get_object_or_404
        from rest_framework.exceptions import PermissionDenied, ValidationError
        item = get_object_or_404(OrderItem, pk=self.kwargs["pk"], order_id=self.kwargs["order_pk"])
        if item.order.status != Order.STATUS_DRAFT:
            raise ValidationError("Items can only be removed from draft orders.")
        if self.request.user.role == "cashier" and item.order.created_by != self.request.user:
            raise PermissionDenied("You can only modify your own orders.")
        return item

    def perform_destroy(self, instance):
        order = instance.order
        instance.delete()
        order.recalculate_total()


class OrderItemListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/v1/orders/{order_id}/items/
    POST /api/v1/orders/{order_id}/items/ — add a line to a draft order
    """
    permission_classes = [IsAuthenticated, IsAnyRole]

    def get_queryset(self):
        return OrderItem.objects.filter(
            order_id=self.kwargs["order_pk"]
        ).select_related("product")

    def get_serializer_class(self):
        if self.request.method == "POST":
            return OrderItemCreateSerializer
        return OrderItemSerializer

    def create(self, request, *args, **kwargs):
        order = Order.objects.get(pk=self.kwargs["order_pk"])
        if order.status != Order.STATUS_DRAFT:
            return Response(
                {"success": False, "error": {"code": "validation_error", "message": "Items can only be added to draft orders."}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = OrderItemCreateSerializer(
            data=request.data, context={"order": order}
        )
        serializer.is_valid(raise_exception=True)
        item = serializer.save()
        return Response(
            {"success": True, "data": OrderItemSerializer(item).data},
            status=status.HTTP_201_CREATED,
        )
