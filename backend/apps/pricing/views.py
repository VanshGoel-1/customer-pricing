import django_filters
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import IsManagerOrAbove, ReadOnly
from apps.core.throttling import PriceSetThrottle

from .models import CustomerPricelist, PriceHistory, PricelistItem
from .serializers import (
    CustomerPricelistSerializer,
    PriceHistorySerializer,
    PricelistItemSerializer,
    SetCustomerPriceSerializer,
)


class PriceHistoryFilter(django_filters.FilterSet):
    customer = django_filters.NumberFilter(field_name="customer__id")
    product = django_filters.NumberFilter(field_name="product__id")

    class Meta:
        model = PriceHistory
        fields = ["customer", "product"]


class PriceHistoryListView(generics.ListAPIView):
    """
    GET /api/v1/pricing/history/
    Read-only for all authenticated roles (cashier can view history).
    """
    queryset = (
        PriceHistory.objects
        .select_related("customer", "product", "changed_by")
        .all()
    )
    serializer_class = PriceHistorySerializer
    permission_classes = [IsAuthenticated]
    filterset_class = PriceHistoryFilter
    search_fields = ["customer__name", "product__name", "product__sku"]
    ordering_fields = ["changed_at", "version"]


class PricelistItemListCreateView(generics.ListCreateAPIView):
    """
    GET  — all roles
    POST — manager/admin only
    """
    queryset = (
        PricelistItem.objects
        .select_related("pricelist__customer", "product")
        .all()
    )
    permission_classes = [IsAuthenticated, IsManagerOrAbove | ReadOnly]
    search_fields = ["product__name", "product__sku", "pricelist__customer__name"]
    ordering_fields = ["price", "effective_from", "created_at"]

    def get_serializer_class(self):
        return PricelistItemSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        item = serializer.save()
        return Response(
            {"success": True, "data": PricelistItemSerializer(item).data},
            status=status.HTTP_201_CREATED,
        )


class PricelistItemDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = PricelistItem.objects.select_related("pricelist__customer", "product").all()
    serializer_class = PricelistItemSerializer
    permission_classes = [IsAuthenticated, IsManagerOrAbove | ReadOnly]

    def destroy(self, request, *args, **kwargs):
        # Deleting a price rule is allowed; the history is immutable and stays.
        instance = self.get_object()
        instance.delete()
        return Response({"success": True, "message": "Pricelist item removed."})


class SetCustomerPriceView(APIView):
    """
    POST /api/v1/pricing/set-price/

    Wizard endpoint — mirrors Odoo's set.customer.price.wizard.
    Creates or updates a product price for a customer in one call.
    Auto-creates the pricelist if the customer doesn't have one yet.
    """
    permission_classes = [IsAuthenticated, IsManagerOrAbove]
    throttle_classes = [PriceSetThrottle]  # 20/min per user — price-history spam guard

    def post(self, request):
        serializer = SetCustomerPriceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        item = serializer.save()
        return Response(
            {"success": True, "data": PricelistItemSerializer(item).data},
            status=status.HTTP_200_OK,
        )


class CustomerPriceLookupView(APIView):
    """
    GET /api/v1/pricing/lookup/?customer_id=1&product_id=5

    Returns the effective price for a customer+product pair.
    Falls back to product's base_price if no customer-specific price exists.
    Used by the cashier billing screen to auto-fill on product selection —
    mirrors Odoo's pricelist._get_product_price().
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Explicit integer casting — prevents type-confusion attacks where a
        # non-integer string bypasses ORM filters or triggers unhandled exceptions.
        try:
            customer_id = int(request.query_params["customer_id"])
            product_id = int(request.query_params["product_id"])
        except (KeyError, ValueError, TypeError):
            return Response(
                {"success": False, "error": {"code": "validation_error", "message": "customer_id and product_id must be positive integers."}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if customer_id <= 0 or product_id <= 0:
            return Response(
                {"success": False, "error": {"code": "validation_error", "message": "customer_id and product_id must be positive integers."}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from apps.products.models import Product

        try:
            product = Product.objects.get(pk=product_id, is_active=True)
        except Product.DoesNotExist:
            return Response(
                {"success": False, "error": {"code": "not_found", "message": "Product not found."}},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Try customer-specific price first
        price = product.base_price
        is_custom_price = False

        item = (
            PricelistItem.objects
            .filter(pricelist__customer_id=customer_id, product_id=product_id)
            .first()
        )
        if item:
            price = item.price
            is_custom_price = True

        return Response({
            "success": True,
            "data": {
                "product_id": product.id,
                "product_name": product.name,
                "product_sku": product.sku,
                "unit": product.unit,
                "price": price,
                "base_price": product.base_price,
                "is_custom_price": is_custom_price,
            },
        })


class CustomerPricelistView(generics.RetrieveAPIView):
    """
    GET /api/v1/pricing/pricelist/{customer_id}/
    Full pricelist for a customer with all items.
    """
    serializer_class = CustomerPricelistSerializer
    permission_classes = [IsAuthenticated, IsManagerOrAbove | ReadOnly]

    def get_object(self):
        from apps.customers.models import Customer
        customer = generics.get_object_or_404(Customer, pk=self.kwargs["customer_id"])
        pricelist, _ = CustomerPricelist.objects.prefetch_related("items__product").get_or_create(
            customer=customer,
            defaults={"name": f"{customer.name} – Custom Prices"},
        )
        return pricelist
