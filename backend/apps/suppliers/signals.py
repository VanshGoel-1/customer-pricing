"""
Signal handlers for the suppliers app.

post_save on SupplierPayment:
  - Auto-creates a CashTransaction OUT / supplier_payment entry so the
    cashbook stays in sync without the manager having to make a double entry.
  - Writes the created CashTransaction PK back to payment.cashbook_entry_id.

dispatch_uid prevents duplicate handler registration on app reload.
"""
from django.db.models.signals import post_save
from django.dispatch import receiver


@receiver(
    post_save,
    sender="suppliers.SupplierPayment",
    dispatch_uid="suppliers.create_cashbook_entry_on_payment",
)
def create_cashbook_entry_on_payment(sender, instance, created, **kwargs):
    """Create a CashTransaction OUT when a new SupplierPayment is saved."""
    if not created:
        return

    from apps.cashbook.models import CashTransaction

    # Only cash / online map directly to cashbook modes; cheque/bank fall back to cash.
    cashbook_mode = (
        instance.mode
        if instance.mode in (CashTransaction.MODE_CASH, CashTransaction.MODE_ONLINE)
        else CashTransaction.MODE_CASH
    )

    description = f"Payment to {instance.supplier.name}"
    if instance.reference_invoice_id and instance.reference_invoice.invoice_number:
        description += f" \u2014 Inv #{instance.reference_invoice.invoice_number}"

    entry = CashTransaction.objects.create(
        transaction_type=CashTransaction.TYPE_OUT,
        category="supplier_payment",
        amount=instance.amount,
        mode=cashbook_mode,
        description=description,
        transaction_date=instance.payment_date,
        created_by=instance.created_by,
    )

    # Write the FK back without triggering post_save again (update_fields, no signal loop).
    sender.objects.filter(pk=instance.pk).update(cashbook_entry_id=entry.pk)
    instance.cashbook_entry_id = entry.pk
