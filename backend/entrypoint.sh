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

echo "[entrypoint] Collecting static files..."
python manage.py collectstatic --no-input --clear

echo "[entrypoint] Creating admin user if needed..."
python create_admin.py

echo "[entrypoint] Starting gunicorn..."
exec gunicorn config.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers 3 \
    --timeout 120 \
    --access-logfile - \
    --error-logfile -
