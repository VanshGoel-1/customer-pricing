from django.urls import path

from .views import (
    ProductCategoryDetailView,
    ProductCategoryListCreateView,
    ProductDetailView,
    ProductListCreateView,
)

app_name = "products"

urlpatterns = [
    # Static paths must come before dynamic <pk> paths so Django matches
    # /categories/ correctly without relying on int-cast failure as a fallthrough.
    path("categories/", ProductCategoryListCreateView.as_view(), name="category-list-create"),
    path("categories/<int:pk>/", ProductCategoryDetailView.as_view(), name="category-detail"),
    path("", ProductListCreateView.as_view(), name="product-list-create"),
    path("<int:pk>/", ProductDetailView.as_view(), name="product-detail"),
]
