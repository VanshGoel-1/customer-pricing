"""
Management command: backfill_cashbook

Creates CashTransaction entries for historical orders that were confirmed/paid
before the cashbook sync was added.

Rules:
  1. Confirmed/paid orders with payment_mode cash or online and no linked
     `sale` CashTransaction → create a sale entry (money came in at confirm time).

  2. Paid orders with credit mode that have payment CreditLedger entries but
     no linked `payment_received` CashTransaction → create payment_received
     entries (one per payment ledger row).

Usage:
    python manage.py backfill_cashbook
    python manage.py backfill_cashbook --dry-run   (preview only)
"""
from django.core.management.base import BaseCommand
from django.utils import timezone


class Command(BaseCommand):
    help = "Backfill CashTransaction entries for historical orders."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print what would be created without writing to DB.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]

        from apps.cashbook.models import CashTransaction
        from apps.customers.models import CreditLedger
        from apps.orders.models import Order

        sale_created = 0
        payment_created = 0

        # ── Rule 1: cash/online confirmed or paid orders with no sale entry ──
        cash_orders = Order.objects.filter(
            payment_mode__in=(Order.PAYMENT_MODE_CASH, Order.PAYMENT_MODE_ONLINE),
            status__in=(Order.STATUS_CONFIRMED, Order.STATUS_PAID),
        ).exclude(cash_transactions__category="sale")

        for order in cash_orders:
            date = (
                order.confirmed_at.date()
                if order.confirmed_at
                else order.created_at.date()
            )
            self.stdout.write(
                f"  [sale] {order.order_number}  "
                f"mode={order.payment_mode}  ₹{order.total_amount}  date={date}"
            )
            if not dry_run:
                CashTransaction.objects.create(
                    transaction_type=CashTransaction.TYPE_IN,
                    category="sale",
                    amount=order.total_amount,
                    mode=order.payment_mode,
                    transaction_date=date,
                    description=f"Sale {order.order_number} (backfilled)",
                    order=order,
                )
            sale_created += 1

        # ── Rule 2: credit-mode paid orders — one entry per payment ledger row ──
        payment_ledger_rows = CreditLedger.objects.filter(
            entry_type="payment",
            order__isnull=False,
        ).exclude(
            order__cash_transactions__category="payment_received"
        ).select_related("order")

        for ledger in payment_ledger_rows:
            order = ledger.order
            self.stdout.write(
                f"  [payment_received] {order.order_number}  "
                f"₹{ledger.amount}  date={ledger.date}"
            )
            if not dry_run:
                CashTransaction.objects.create(
                    transaction_type=CashTransaction.TYPE_IN,
                    category="payment_received",
                    amount=ledger.amount,
                    mode=CashTransaction.MODE_CASH,   # default — unknown for old records
                    transaction_date=ledger.date,
                    description=f"Payment for {order.order_number} (backfilled)",
                    order=order,
                )
            payment_created += 1

        prefix = "[DRY RUN] Would create" if dry_run else "Created"
        self.stdout.write(
            self.style.SUCCESS(
                f"\n{prefix} {sale_created} sale + {payment_created} payment_received entries."
            )
        )
