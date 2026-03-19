from django.urls import path

from .views import (
    ProductCategoryDetailView,
    ProductCategoryListCreateView,
    ProductDetailView,
    ProductListCreateView,
    QuickProductDeleteView,
    QuickProductListView,
    QuickProductManageView,
)

app_name = "products"

urlpatterns = [
    # Quick product endpoints — must come before <int:pk>/ to avoid shadowing
    path("quick/",                QuickProductListView.as_view(),   name="quick-list"),
    path("quick/manage/",         QuickProductManageView.as_view(), name="quick-manage"),
    path("quick/manage/<int:pk>/", QuickProductDeleteView.as_view(), name="quick-delete"),

    # Category endpoints — static before dynamic
    path("categories/",           ProductCategoryListCreateView.as_view(), name="category-list-create"),
    path("categories/<int:pk>/",  ProductCategoryDetailView.as_view(),     name="category-detail"),

    # Product CRUD
    path("",           ProductListCreateView.as_view(), name="product-list-create"),
    path("<int:pk>/",  ProductDetailView.as_view(),     name="product-detail"),
]
