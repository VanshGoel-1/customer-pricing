"""
django-filters FilterSets for the suppliers app.
"""
import django_filters

from .models import PurchaseInvoice


class PurchaseInvoiceFilter(django_filters.FilterSet):
    supplier = django_filters.NumberFilter(field_name="supplier__id")
    status = django_filters.CharFilter(field_name="status")

    class Meta:
        model = PurchaseInvoice
        fields = ["supplier", "status"]
