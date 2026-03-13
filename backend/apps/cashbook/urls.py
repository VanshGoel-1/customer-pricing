from django.urls import path

from .views import (
    CashbookCategoriesView,
    CashbookInCreateView,
    CashbookOutCreateView,
    CashbookSummaryView,
    CashTransactionDetailView,
    CashTransactionListView,
)

app_name = "cashbook"

urlpatterns = [
    path("",            CashTransactionListView.as_view(),  name="list"),
    path("<int:pk>/",   CashTransactionDetailView.as_view(), name="detail"),
    path("in/",         CashbookInCreateView.as_view(),     name="in-create"),
    path("out/",        CashbookOutCreateView.as_view(),    name="out-create"),
    path("summary/",    CashbookSummaryView.as_view(),      name="summary"),
    path("categories/", CashbookCategoriesView.as_view(),   name="categories"),
]
