import django_filters
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.permissions import IsAnyRole, IsManagerOrAbove, ReadOnly

from .models import Product, ProductCategory, QuickProduct
from .serializers import (
    ProductCategorySerializer,
    ProductLookupSerializer,
    ProductSerializer,
    QuickProductSerializer,
)


class ProductCategoryListCreateView(generics.ListCreateAPIView):
    """
    GET  — all roles can read
    POST — manager/admin only
    """
    queryset = ProductCategory.objects.all()
    serializer_class = ProductCategorySerializer
    permission_classes = [IsAuthenticated, IsManagerOrAbove | ReadOnly]
    search_fields = ["name"]
    ordering_fields = ["name", "created_at"]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        category = serializer.save()
        return Response(
            {"success": True, "data": ProductCategorySerializer(category).data},
            status=status.HTTP_201_CREATED,
        )


class ProductCategoryDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = ProductCategory.objects.all()
    serializer_class = ProductCategorySerializer
    permission_classes = [IsAuthenticated, IsManagerOrAbove | ReadOnly]


class ProductFilter(django_filters.FilterSet):
    category = django_filters.NumberFilter(field_name="category__id")
    min_price = django_filters.NumberFilter(field_name="base_price", lookup_expr="gte")
    max_price = django_filters.NumberFilter(field_name="base_price", lookup_expr="lte")
    is_active = django_filters.BooleanFilter()

    class Meta:
        model = Product
        fields = ["category", "is_active", "min_price", "max_price"]


class ProductListCreateView(generics.ListCreateAPIView):
    """
    GET  — all roles (cashier needs product search on billing screen)
    POST — manager/admin only
    """
    queryset = Product.objects.select_related("category").all()
    permission_classes = [IsAuthenticated, IsManagerOrAbove | ReadOnly]
    filterset_class = ProductFilter
    search_fields = ["name", "sku", "description"]
    ordering_fields = ["name", "base_price", "created_at"]

    def get_serializer_class(self):
        # Cashiers get the minimal lookup serializer
        if self.request.user.role == "cashier":
            return ProductLookupSerializer
        return ProductSerializer

    def create(self, request, *args, **kwargs):
        serializer = ProductSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        product = serializer.save()
        return Response(
            {"success": True, "data": ProductSerializer(product).data},
            status=status.HTTP_201_CREATED,
        )


class ProductDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET    — all roles
    PATCH  — manager/admin only
    DELETE — manager/admin only (soft-delete via is_active=False)
    """
    queryset = Product.objects.select_related("category").all()
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticated, IsManagerOrAbove | ReadOnly]

    def destroy(self, request, *args, **kwargs):
        product = self.get_object()
        product.is_active = False
        product.save(update_fields=["is_active", "updated_at"])
        return Response({"success": True, "message": "Product deactivated."})


class QuickProductListView(generics.ListAPIView):
    """GET /api/v1/products/quick/ — curated quick-access list (all roles)."""
    serializer_class   = QuickProductSerializer
    permission_classes = [IsAuthenticated, IsAnyRole]
    queryset           = QuickProduct.objects.select_related("product").order_by("sort_order", "product__name")


class QuickProductManageView(generics.ListCreateAPIView):
    """
    GET  /api/v1/products/quick/manage/ — list with quick_id for delete (manager+)
    POST /api/v1/products/quick/manage/ — add a product to the quick list (manager+)
    """
    serializer_class   = QuickProductSerializer
    permission_classes = [IsAuthenticated, IsManagerOrAbove]
    queryset           = QuickProduct.objects.select_related("product").order_by("sort_order", "product__name")

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        obj = serializer.save()
        return Response(
            {"success": True, "data": QuickProductSerializer(obj).data},
            status=status.HTTP_201_CREATED,
        )


class QuickProductDeleteView(generics.DestroyAPIView):
    """DELETE /api/v1/products/quick/manage/{id}/ — remove from quick list (manager+)."""
    queryset           = QuickProduct.objects.all()
    permission_classes = [IsAuthenticated, IsManagerOrAbove]

    def destroy(self, request, *args, **kwargs):
        super().destroy(request, *args, **kwargs)
        return Response({"success": True, "message": "Removed from quick list."})
