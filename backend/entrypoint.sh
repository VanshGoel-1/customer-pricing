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
python manage.py makemigrations core users products customers pricing orders cashbook --no-input

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

print('[entrypoint] Schema patches applied.')
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
