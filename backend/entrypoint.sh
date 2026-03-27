#!/bin/sh
# Docker entrypoint — runs before gunicorn starts.
# Equivalent to Odoo's --init / --update flags at startup.
set -e

echo "[entrypoint] Waiting for PostgreSQL..."
until python -c "
import psycopg, os
from urllib.parse import urlparse
url = os.environ.get('DATABASE_URL', '')
if url:
    p = urlparse(url)
    params = dict(dbname=p.path[1:], user=p.username, password=p.password,
                  host=p.hostname, port=p.port or 5432, connect_timeout=3)
else:
    params = dict(dbname=os.environ['DB_NAME'], user=os.environ['DB_USER'],
                  password=os.environ['DB_PASSWORD'], host=os.environ['DB_HOST'],
                  port=os.environ['DB_PORT'], connect_timeout=3)
psycopg.connect(**params)
" 2>/dev/null; do
    echo "[entrypoint] PostgreSQL not ready, retrying in 2s..."
    sleep 2
done
echo "[entrypoint] PostgreSQL is ready."

echo "[entrypoint] Creating migrations for custom apps..."
python manage.py makemigrations core users products customers pricing orders cashbook suppliers --no-input

echo "[entrypoint] Running migrations..."
python manage.py migrate --no-input

echo "[entrypoint] Applying schema patches (idempotent)..."
python manage.py shell -c "
from django.db import connection
c = connection.cursor()

# Products — piece_weight_grams column
c.execute(\"ALTER TABLE products_product ADD COLUMN IF NOT EXISTS piece_weight_grams NUMERIC(8,2) NULL\")

# Products — quick products table
c.execute('''CREATE TABLE IF NOT EXISTS products_quickproduct (
    id          SERIAL PRIMARY KEY,
    product_id  INTEGER NOT NULL UNIQUE REFERENCES products_product(id) ON DELETE CASCADE,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_id INTEGER REFERENCES users_user(id) ON DELETE SET NULL
)''')

# Customers — new profile fields
c.execute(\"ALTER TABLE customers_customer ADD COLUMN IF NOT EXISTS last_name    VARCHAR(150) NOT NULL DEFAULT ''\")
c.execute(\"ALTER TABLE customers_customer ADD COLUMN IF NOT EXISTS company_name VARCHAR(255) NOT NULL DEFAULT ''\")
c.execute(\"ALTER TABLE customers_customer ADD COLUMN IF NOT EXISTS sales_rep    VARCHAR(150) NOT NULL DEFAULT ''\")
c.execute(\"ALTER TABLE customers_customer ADD COLUMN IF NOT EXISTS tax_tin      VARCHAR(50)  NOT NULL DEFAULT ''\")

c.execute(\"ALTER TABLE suppliers_purchaseinvoice ADD COLUMN IF NOT EXISTS cashbook_entry_id INTEGER REFERENCES cashbook_cashtransaction(id) ON DELETE SET NULL\")

print('[entrypoint] Schema patches applied.')
"

echo "[entrypoint] Backfilling cashbook entries for supplier payments and paid invoices..."
python manage.py shell -c "
from apps.suppliers.models import SupplierPayment, PurchaseInvoice
from apps.cashbook.models import CashTransaction

# ── SupplierPayments without a cashbook entry ──────────────────────────────
for pmt in SupplierPayment.objects.filter(cashbook_entry__isnull=True).select_related('supplier'):
    cashbook_mode = (
        pmt.mode if pmt.mode in (CashTransaction.MODE_CASH, CashTransaction.MODE_ONLINE)
        else CashTransaction.MODE_CASH
    )
    desc = 'Payment to ' + pmt.supplier.name
    if pmt.reference_invoice_id:
        inv = pmt.reference_invoice
        if inv.invoice_number:
            desc += ' — Inv #' + inv.invoice_number
    entry = CashTransaction.objects.create(
        transaction_type=CashTransaction.TYPE_OUT,
        category='supplier_payment',
        amount=pmt.amount,
        mode=cashbook_mode,
        description=desc,
        transaction_date=pmt.payment_date,
        created_by=pmt.created_by,
    )
    SupplierPayment.objects.filter(pk=pmt.pk).update(cashbook_entry_id=entry.pk)
    print('[backfill] Created cashbook entry for SupplierPayment', pmt.pk)

# ── Paid invoices without a cashbook entry ─────────────────────────────────
for inv in PurchaseInvoice.objects.filter(status='paid', cashbook_entry__isnull=True).select_related('supplier'):
    ref = inv.invoice_number or str(inv.pk)
    paid_date = inv.paid_at.date() if inv.paid_at else inv.invoice_date
    entry = CashTransaction.objects.create(
        transaction_type=CashTransaction.TYPE_OUT,
        category='supplier_payment',
        amount=inv.total_amount,
        mode=CashTransaction.MODE_CASH,
        description='Invoice paid: #' + ref + ' — ' + inv.supplier.name,
        transaction_date=paid_date,
        created_by=inv.created_by,
    )
    PurchaseInvoice.objects.filter(pk=inv.pk).update(cashbook_entry_id=entry.pk)
    print('[backfill] Created cashbook entry for PurchaseInvoice', inv.pk)

print('[entrypoint] Cashbook backfill done.')
"

echo "[entrypoint] Collecting static files..."
python manage.py collectstatic --no-input --clear

echo "[entrypoint] Creating admin user if needed..."
python create_admin.py

echo "[entrypoint] Starting gunicorn..."
exec gunicorn config.wsgi:application \
    --bind 0.0.0.0:${PORT:-8000} \
    --workers 3 \
    --timeout 120 \
    --access-logfile - \
    --error-logfile -
