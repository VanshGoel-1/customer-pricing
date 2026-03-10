import re

import django_filters
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import IsManagerOrAbove, ReadOnly
from apps.core.throttling import PaymentPostThrottle, PhoneLookupThrottle

# E.164-style: optional leading +, then 7–15 digits only.
# Rejects SQL fragments, scripts, and excessively long strings before the ORM sees them.
_PHONE_RE = re.compile(r"^\+?\d{7,15}$")

from .models import CreditLedger, Customer
from .serializers import (
    CreditLedgerSerializer,
    CustomerLookupSerializer,
    CustomerSerializer,
)


class CustomerFilter(django_filters.FilterSet):
    customer_type = django_filters.CharFilter()
    is_active = django_filters.BooleanFilter()

    class Meta:
        model = Customer
        fields = ["customer_type", "is_active"]


class CustomerListCreateView(generics.ListCreateAPIView):
    """
    GET  — all roles (cashier needs customer search on billing screen)
    POST — manager/admin only
    """
    queryset = Customer.objects.all()
    permission_classes = [IsAuthenticated, IsManagerOrAbove | ReadOnly]
    filterset_class = CustomerFilter
    search_fields = ["name", "phone", "email"]
    ordering_fields = ["name", "created_at"]

    def get_serializer_class(self):
        if self.request.user.role == "cashier":
            return CustomerLookupSerializer
        return CustomerSerializer

    def create(self, request, *args, **kwargs):
        serializer = CustomerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        customer = serializer.save()
        return Response(
            {"success": True, "data": CustomerSerializer(customer).data},
            status=status.HTTP_201_CREATED,
        )


class CustomerDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Customer.objects.all()
    serializer_class = CustomerSerializer
    permission_classes = [IsAuthenticated, IsManagerOrAbove | ReadOnly]

    def destroy(self, request, *args, **kwargs):
        customer = self.get_object()
        customer.is_active = False
        customer.save(update_fields=["is_active", "updated_at"])
        return Response({"success": True, "message": "Customer deactivated."})


class CustomerPhoneLookupView(APIView):
    """
    GET /api/v1/customers/lookup/?phone=0712345678
    Used by the cashier billing screen to find a customer by phone number.

    Hardened against:
    - Enumeration attacks  → throttle (10 req/min per user)
    - Injection attempts   → regex whitelist before ORM query
    - Oversized input      → length enforced by regex (max 16 chars)
    """
    permission_classes = [IsAuthenticated]
    throttle_classes = [PhoneLookupThrottle]

    def get(self, request):
        raw = request.query_params.get("phone", "")
        # Normalise: strip whitespace, spaces, dashes — same as before
        phone = raw.strip().replace(" ", "").replace("-", "")

        # Whitelist validation: must be E.164-compatible digits only
        if not phone or not _PHONE_RE.match(phone):
            return Response(
                {"success": False, "error": {"code": "validation_error", "message": "Provide a valid phone number (7–15 digits, optional leading +)."}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            customer = Customer.objects.get(phone=phone, is_active=True)
            return Response({"success": True, "data": CustomerLookupSerializer(customer).data})
        except Customer.DoesNotExist:
            return Response(
                {"success": False, "error": {"code": "not_found", "message": "No customer found with that phone number."}},
                status=status.HTTP_404_NOT_FOUND,
            )


class CreditLedgerListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/v1/customers/{id}/ledger/  — ledger for one customer
    POST /api/v1/customers/{id}/ledger/  — post a manual adjustment / payment
    """
    serializer_class = CreditLedgerSerializer
    permission_classes = [IsAuthenticated, IsManagerOrAbove | ReadOnly]
    throttle_classes = [PaymentPostThrottle]  # 5/min per user — fake-payment flood guard

    def get_queryset(self):
        return CreditLedger.objects.filter(
            customer_id=self.kwargs["customer_pk"]
        ).select_related("order")

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        entry = serializer.save(customer_id=self.kwargs["customer_pk"])
        return Response(
            {"success": True, "data": CreditLedgerSerializer(entry).data},
            status=status.HTTP_201_CREATED,
        )
