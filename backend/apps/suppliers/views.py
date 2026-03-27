"""
Views for the suppliers app.

Role policy:
  - Cashiers:       read-only on all supplier/payment/ledger endpoints
  - Managers/Admin: full CRUD

Response envelope for single-object mutations:
  {"success": True, "data": {...}}
List endpoints use standard DRF pagination (no envelope).
"""
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import IsManagerOrAbove, ReadOnly
from apps.core.throttling import SupplierWriteThrottle, PurchaseCreateThrottle

from .filters import PurchaseInvoiceFilter
from .models import (
    PurchaseInvoice,
    PurchaseItem,
    Supplier,
    SupplierPayment,
    SupplierProduct,
)
from .serializers import (
    PurchaseInvoiceCreateSerializer,
    PurchaseInvoiceSerializer,
    SupplierLedgerEntrySerializer,
    SupplierPaymentSerializer,
    SupplierProductSerializer,
    SupplierSerializer,
)


# ---------------------------------------------------------------------------
# Suppliers
# ---------------------------------------------------------------------------

class SupplierListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/v1/suppliers/   — all authenticated roles
    POST /api/v1/suppliers/   — manager / admin only
    """
    serializer_class = SupplierSerializer
    throttle_classes = [SupplierWriteThrottle]
    search_fields = ["name", "phone", "email"]
    ordering_fields = ["name", "created_at"]

    def get_queryset(self):
        return Supplier.objects.filter(is_active=True)

    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [IsAuthenticated()]
        return [IsAuthenticated(), IsManagerOrAbove()]

    def create(self, request, *args, **kwargs):
        serializer = SupplierSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        supplier = serializer.save()
        return Response(
            {"success": True, "data": SupplierSerializer(supplier).data},
            status=status.HTTP_201_CREATED,
        )


class SupplierDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET    /api/v1/suppliers/{id}/  — all authenticated roles
    PATCH  /api/v1/suppliers/{id}/  — manager / admin only
    DELETE /api/v1/suppliers/{id}/  — soft-delete (manager / admin only)
    """
    serializer_class = SupplierSerializer
    permission_classes = [IsAuthenticated, IsManagerOrAbove | ReadOnly]
    queryset = Supplier.objects.all()

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = SupplierSerializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        supplier = serializer.save()
        return Response({"success": True, "data": SupplierSerializer(supplier).data})

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        instance.is_active = False
        instance.save(update_fields=["is_active", "updated_at"])
        return Response(
            {"success": True, "message": "Supplier deactivated."},
            status=status.HTTP_200_OK,
        )


# ---------------------------------------------------------------------------
# Supplier Products
# ---------------------------------------------------------------------------

class SupplierProductListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/v1/suppliers/{supplier_pk}/products/
    POST /api/v1/suppliers/{supplier_pk}/products/
    """
    serializer_class = SupplierProductSerializer
    permission_classes = [IsAuthenticated, IsManagerOrAbove | ReadOnly]

    def get_queryset(self):
        return SupplierProduct.objects.filter(
            supplier_id=self.kwargs["supplier_pk"]
        ).select_related("product")

    def create(self, request, *args, **kwargs):
        serializer = SupplierProductSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        sp = serializer.save(supplier_id=self.kwargs["supplier_pk"])
        return Response(
            {"success": True, "data": SupplierProductSerializer(sp).data},
            status=status.HTTP_201_CREATED,
        )


class SupplierProductDeleteView(generics.DestroyAPIView):
    """DELETE /api/v1/suppliers/{supplier_pk}/products/{pk}/"""
    permission_classes = [IsAuthenticated, IsManagerOrAbove]

    def get_object(self):
        return get_object_or_404(
            SupplierProduct,
            pk=self.kwargs["pk"],
            supplier_id=self.kwargs["supplier_pk"],
        )

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Supplier Payments
# ---------------------------------------------------------------------------

class SupplierPaymentListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/v1/suppliers/{supplier_pk}/payments/
    POST /api/v1/suppliers/{supplier_pk}/payments/
    """
    serializer_class = SupplierPaymentSerializer
    permission_classes = [IsAuthenticated, IsManagerOrAbove | ReadOnly]

    def get_queryset(self):
        return SupplierPayment.objects.filter(
            supplier_id=self.kwargs["supplier_pk"]
        )

    def create(self, request, *args, **kwargs):
        serializer = SupplierPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payment = serializer.save(supplier_id=self.kwargs["supplier_pk"], created_by=request.user)
        return Response(
            {"success": True, "data": SupplierPaymentSerializer(payment).data},
            status=status.HTTP_201_CREATED,
        )


# ---------------------------------------------------------------------------
# Supplier Ledger
# ---------------------------------------------------------------------------

class SupplierLedgerView(APIView):
    """
    GET /api/v1/suppliers/{supplier_pk}/ledger/

    Returns a merged chronological ledger of confirmed invoices and payments,
    sorted by date descending.
    """
    permission_classes = [IsAuthenticated, IsManagerOrAbove | ReadOnly]

    def get(self, request, supplier_pk):
        supplier = get_object_or_404(Supplier, pk=supplier_pk)

        entries = []

        # Confirmed and paid invoices
        invoices = supplier.invoices.filter(
            status__in=(PurchaseInvoice.STATUS_CONFIRMED, PurchaseInvoice.STATUS_PAID)
        ).select_related("supplier")
        for inv in invoices:
            entries.append({
                "id": inv.pk,
                "entry_type": "invoice",
                "date": inv.invoice_date,
                "amount": inv.total_amount,
                "description": f"Invoice #{inv.invoice_number or inv.pk} from {inv.supplier.name}",
                "reference_id": inv.invoice_number or str(inv.pk),
                "status": inv.status,
                "created_at": inv.created_at,
            })

        # All payments
        payments = supplier.payments.all().select_related("supplier")
        for pmt in payments:
            entries.append({
                "id": pmt.pk,
                "entry_type": "payment",
                "date": pmt.payment_date,
                "amount": pmt.amount,
                "description": f"Payment to {pmt.supplier.name}",
                "reference_id": str(pmt.pk),
                "status": None,
                "created_at": pmt.created_at,
            })

        # Sort by date descending, then by id descending as tiebreaker
        entries.sort(key=lambda e: (e["date"], e["id"]), reverse=True)

        serializer = SupplierLedgerEntrySerializer(entries, many=True)
        return Response({"success": True, "data": serializer.data})


# ---------------------------------------------------------------------------
# Purchase Invoices
# ---------------------------------------------------------------------------

class PurchaseInvoiceListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/v1/purchases/   — all authenticated roles
    POST /api/v1/purchases/   — manager / admin only
    """
    filterset_class = PurchaseInvoiceFilter
    search_fields = ["invoice_number", "supplier__name"]
    ordering_fields = ["invoice_date", "created_at", "total_amount"]
    throttle_classes = [PurchaseCreateThrottle]

    def get_queryset(self):
        return PurchaseInvoice.objects.select_related("supplier").prefetch_related(
            "items__product"
        )

    def get_serializer_class(self):
        if self.request.method == "POST":
            return PurchaseInvoiceCreateSerializer
        return PurchaseInvoiceSerializer

    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [IsAuthenticated()]
        return [IsAuthenticated(), IsManagerOrAbove()]

    def create(self, request, *args, **kwargs):
        write_serializer = PurchaseInvoiceCreateSerializer(data=request.data)
        write_serializer.is_valid(raise_exception=True)
        invoice = write_serializer.save()
        return Response(
            {"success": True, "data": PurchaseInvoiceSerializer(invoice).data},
            status=status.HTTP_201_CREATED,
        )


class PurchaseInvoiceDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET    /api/v1/purchases/{id}/
    PATCH  /api/v1/purchases/{id}/  — draft only
    DELETE /api/v1/purchases/{id}/  — draft only
    """
    permission_classes = [IsAuthenticated, IsManagerOrAbove | ReadOnly]
    queryset = PurchaseInvoice.objects.select_related("supplier").prefetch_related(
        "items__product"
    )

    def get_serializer_class(self):
        return PurchaseInvoiceSerializer

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        if instance.status != PurchaseInvoice.STATUS_DRAFT:
            raise ValidationError("Only draft invoices can be edited.")
        write_serializer = PurchaseInvoiceCreateSerializer(
            instance, data=request.data, partial=partial
        )
        write_serializer.is_valid(raise_exception=True)
        invoice = write_serializer.save()
        return Response(
            {"success": True, "data": PurchaseInvoiceSerializer(invoice).data}
        )

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.status != PurchaseInvoice.STATUS_DRAFT:
            raise ValidationError("Only draft invoices can be deleted.")
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Purchase Invoice Actions
# ---------------------------------------------------------------------------

class PurchaseInvoiceConfirmView(APIView):
    """POST /api/v1/purchases/{id}/confirm/"""
    permission_classes = [IsAuthenticated, IsManagerOrAbove]

    def post(self, request, pk):
        invoice = get_object_or_404(PurchaseInvoice, pk=pk)
        if invoice.status != PurchaseInvoice.STATUS_DRAFT:
            raise ValidationError("Only draft invoices can be confirmed.")
        invoice.status = PurchaseInvoice.STATUS_CONFIRMED
        invoice.confirmed_at = timezone.now()
        invoice.save(update_fields=["status", "confirmed_at", "updated_at"])
        return Response({"success": True, "data": PurchaseInvoiceSerializer(invoice).data})


class PurchaseInvoiceMarkPaidView(APIView):
    """POST /api/v1/purchases/{id}/mark-paid/"""
    permission_classes = [IsAuthenticated, IsManagerOrAbove]

    def post(self, request, pk):
        invoice = get_object_or_404(PurchaseInvoice, pk=pk)
        if invoice.status != PurchaseInvoice.STATUS_CONFIRMED:
            raise ValidationError("Only confirmed invoices can be marked as paid.")
        invoice.status = PurchaseInvoice.STATUS_PAID
        invoice.paid_at = timezone.now()
        invoice.save(update_fields=["status", "paid_at", "updated_at"])

        from apps.cashbook.models import CashTransaction
        ref = invoice.invoice_number or str(invoice.pk)
        entry = CashTransaction.objects.create(
            transaction_type=CashTransaction.TYPE_OUT,
            category="supplier_payment",
            amount=invoice.total_amount,
            mode=CashTransaction.MODE_CASH,
            description=f"Invoice paid: #{ref} — {invoice.supplier.name}",
            transaction_date=invoice.paid_at.date(),
            created_by=request.user,
        )
        PurchaseInvoice.objects.filter(pk=invoice.pk).update(cashbook_entry_id=entry.pk)

        return Response({"success": True, "data": PurchaseInvoiceSerializer(invoice).data})


# ---------------------------------------------------------------------------
# Purchase Item Delete
# ---------------------------------------------------------------------------

class PurchaseItemDeleteView(generics.DestroyAPIView):
    """DELETE /api/v1/purchases/{invoice_pk}/items/{pk}/"""
    permission_classes = [IsAuthenticated, IsManagerOrAbove]

    def get_object(self):
        item = get_object_or_404(
            PurchaseItem,
            pk=self.kwargs["pk"],
            invoice_id=self.kwargs["invoice_pk"],
        )
        if item.invoice.status != PurchaseInvoice.STATUS_DRAFT:
            raise ValidationError("Items can only be removed from draft invoices.")
        return item

    def perform_destroy(self, instance):
        invoice = instance.invoice
        instance.delete()
        invoice.recalculate_total()
