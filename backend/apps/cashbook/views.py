import django_filters
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import IsAnyRole
from apps.core.throttling import CashbookCreateThrottle

from .models import IN_CATEGORIES, OUT_CATEGORIES, CashTransaction, compute_balance
from .serializers import CashTransactionSerializer


# ---------------------------------------------------------------------------
# Filter
# ---------------------------------------------------------------------------

class CashTransactionFilter(django_filters.FilterSet):
    date_from = django_filters.DateFilter(field_name="transaction_date", lookup_expr="gte")
    date_to   = django_filters.DateFilter(field_name="transaction_date", lookup_expr="lte")

    class Meta:
        model  = CashTransaction
        fields = ["transaction_type", "mode", "category", "date_from", "date_to"]


# ---------------------------------------------------------------------------
# List (GET /cashbook/)
# ---------------------------------------------------------------------------

class CashTransactionListView(generics.ListAPIView):
    """
    GET — manager/admin see all; cashier sees only their own entries.
    """
    serializer_class = CashTransactionSerializer
    permission_classes = [IsAuthenticated, IsAnyRole]
    filterset_class = CashTransactionFilter
    search_fields = ["description"]
    ordering_fields = ["transaction_date", "amount", "created_at"]

    def get_queryset(self):
        qs = CashTransaction.objects.select_related("order", "created_by")
        if self.request.user.role == "cashier":
            return qs.filter(created_by=self.request.user)
        return qs


# ---------------------------------------------------------------------------
# Separate create endpoints
# ---------------------------------------------------------------------------

class _CashbookCreateBase(generics.CreateAPIView):
    """
    Base for POST /cashbook/in/ and POST /cashbook/out/.
    Subclasses set `transaction_type` class attribute.
    """
    serializer_class  = CashTransactionSerializer
    permission_classes = [IsAuthenticated, IsAnyRole]
    throttle_classes   = [CashbookCreateThrottle]
    transaction_type   = None  # set by subclass

    def create(self, request, *args, **kwargs):
        # Merge transaction_type from URL semantics into submitted data.
        raw = request.data.copy() if hasattr(request.data, "copy") else dict(request.data)
        raw["transaction_type"] = self.transaction_type
        serializer = self.get_serializer(data=raw)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(
            {"success": True, "data": serializer.data},
            status=status.HTTP_201_CREATED,
        )


class CashbookInCreateView(_CashbookCreateBase):
    """POST /cashbook/in/ — record a Money In entry."""
    transaction_type = "IN"


class CashbookOutCreateView(_CashbookCreateBase):
    """POST /cashbook/out/ — record a Money Out entry."""
    transaction_type = "OUT"


# ---------------------------------------------------------------------------
# Detail (GET / PATCH / DELETE /cashbook/<pk>/)
# ---------------------------------------------------------------------------

class CashTransactionDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET/PATCH/DELETE — manager/admin unrestricted; cashier owns-only.
    DELETE restricted to manager/admin.
    """
    serializer_class   = CashTransactionSerializer
    permission_classes = [IsAuthenticated, IsAnyRole]

    def get_queryset(self):
        qs = CashTransaction.objects.select_related("order", "created_by")
        if self.request.user.role == "cashier":
            return qs.filter(created_by=self.request.user)
        return qs

    def destroy(self, request, *args, **kwargs):
        if request.user.role == "cashier":
            return Response(
                {"success": False, "error": {
                    "code": "permission_denied",
                    "message": "Cashiers cannot delete transactions.",
                }},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        kwargs["partial"] = True
        return super().update(request, *args, **kwargs)


# ---------------------------------------------------------------------------
# Summary (GET /cashbook/summary/)
# ---------------------------------------------------------------------------

class CashbookSummaryView(APIView):
    """
    GET /api/v1/cashbook/summary/
    Returns total_in, total_out, balance, cash_in_hand.
    Supports optional ?date_from= and ?date_to= query params.
    """
    permission_classes = [IsAuthenticated, IsAnyRole]

    def get(self, request):
        qs = CashTransaction.objects.all()
        if request.user.role == "cashier":
            qs = qs.filter(created_by=request.user)

        date_from = request.query_params.get("date_from")
        date_to   = request.query_params.get("date_to")
        if date_from:
            qs = qs.filter(transaction_date__gte=date_from)
        if date_to:
            qs = qs.filter(transaction_date__lte=date_to)

        return Response({"success": True, "data": compute_balance(qs)})


# ---------------------------------------------------------------------------
# Categories (GET /cashbook/categories/)
# ---------------------------------------------------------------------------

class CashbookCategoriesView(APIView):
    """
    GET /api/v1/cashbook/categories/
    Returns the fixed IN/OUT category lists.
    """
    permission_classes = [IsAuthenticated, IsAnyRole]

    def get(self, request):
        return Response({
            "success": True,
            "data": {
                "IN":  [{"value": k, "label": v} for k, v in IN_CATEGORIES],
                "OUT": [{"value": k, "label": v} for k, v in OUT_CATEGORIES],
            },
        })
