# Customer Pricing System — Software Handoff Document

**Version:** Phase 2 Complete (Cashbook + Suppliers)
**Date:** 2026-03-26
**Prepared for:** Incoming development team

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture Overview](#2-architecture-overview)
3. [Technology Stack](#3-technology-stack)
4. [Repository Structure](#4-repository-structure)
5. [Backend Deep Dive](#5-backend-deep-dive)
6. [Frontend Deep Dive](#6-frontend-deep-dive)
7. [API Reference](#7-api-reference)
8. [Database Schema](#8-database-schema)
9. [Authentication & Roles](#9-authentication--roles)
10. [Design Language](#10-design-language)
11. [Infrastructure & DevOps](#11-infrastructure--devops)
12. [Environment Variables](#12-environment-variables)
13. [Running Locally](#13-running-locally)
14. [Known Issues & Technical Debt](#14-known-issues--technical-debt)
15. [Design Inspiration & Reference Codebases](#15-design-inspiration--reference-codebases)
16. [Future Scope & Remaining Tasks](#16-future-scope--remaining-tasks)
17. [Task Tracker — Detailed Checklist](#17-task-tracker--detailed-checklist)

---

## 1. Project Overview

The Customer Pricing System is a business operations tool for small to medium retail/wholesale businesses. It was modelled after the workflow of **Khatabook** (mobile-first Indian accounting app) and **Odoo 18** (enterprise ERP), adapted into a lightweight web application.

### Core Business Problems It Solves

| Problem | Solution |
|---|---|
| Cashiers need different prices per customer | Per-customer price lists with history |
| Manager needs to track daily cash in/out | Cashbook with categories and modes |
| Supplier invoices need to sync with finances | Purchase invoices auto-create cashbook entries on paid |
| Supplier payments need to be tracked | Supplier payment ledger linked to cashbook |
| Customer credit balances need tracking | Credit ledger per customer |
| Multiple staff, different access levels | Three-role system: Admin / Manager / Cashier |

### User Roles Summary

| Role | Access |
|---|---|
| **Cashier** | New Bill, Orders (own), Cashbook (own entries) |
| **Manager** | Everything above + Customers, Products, Pricing, Suppliers, full Cashbook |
| **Admin** | Everything above + User management |

---

## 2. Architecture Overview

```
Browser
  |
  | HTTP :80
  v
[Nginx Container]          <- serves built React SPA
  |
  | /api/v1/* proxy_pass
  v
[Django/Gunicorn Container] <- REST API (3 workers)
  |
  | psycopg3
  v
[PostgreSQL 16 Container]   <- persistent data (Docker volume)
```

All three services run inside a single Docker Compose stack. The frontend Nginx container proxies all `/api/v1/` requests to the backend container — there is no direct browser-to-backend connection in production, which eliminates CORS issues at runtime (CORS headers exist for development only).

For cloud deployment, the project includes `render.yaml` which maps each service to a Render.com service.

---

## 3. Technology Stack

### Backend
| Technology | Version | Purpose |
|---|---|---|
| Python | 3.12 | Runtime |
| Django | 5.2 | Web framework, ORM, migrations |
| Django REST Framework | 3.15.2 | API views, serializers, pagination |
| djangorestframework-simplejwt | 5.3.1 | JWT access + refresh tokens |
| django-filter | 24.2 | Querystring filtering on list endpoints |
| django-cors-headers | 4.4.0 | CORS for local dev |
| psycopg3 | 3.2.3 | PostgreSQL driver (modern, async-capable) |
| Gunicorn | — | WSGI server (3 workers) |
| pytest-django | 4.9.0 | Test runner |

### Frontend
| Technology | Version | Purpose |
|---|---|---|
| React | 18 | UI framework |
| Vite | 6.4.1 | Build tool and dev server |
| React Router | 6 | Client-side routing |
| Axios | — | HTTP client with JWT interceptor |
| Tailwind CSS | — | Utility-first styling |
| Vitest | — | Unit test runner |

### Infrastructure
| Technology | Purpose |
|---|---|
| Docker Desktop | Local container runtime |
| Docker Compose | Multi-container orchestration |
| Nginx 1.27 Alpine | Static file server + API reverse proxy |
| PostgreSQL 16 Alpine | Database |
| Render.com | Cloud deployment target |

---

## 4. Repository Structure

```
customer-pricing/
├── start.bat                    # Double-click to start everything (starts Docker, runs compose)
├── stop.bat                     # Stops all containers
├── docker-compose.yml           # Service definitions: db, backend, frontend
├── render.yaml                  # Render.com cloud deployment config
├── .env                         # Local secrets (never committed)
├── .env.example                 # Template for .env
│
├── backend/
│   ├── Dockerfile               # Python 3.12-slim image
│   ├── entrypoint.sh            # Startup script: wait for DB, makemigrations,
│   │                            #   migrate, schema patches, backfill, collectstatic,
│   │                            #   create admin, start gunicorn
│   ├── requirements.txt         # Python dependencies
│   ├── manage.py                # Django management entry point
│   ├── create_admin.py          # Idempotent admin user creation from env vars
│   ├── conftest.py              # pytest fixtures (DB, users, auth tokens)
│   ├── pytest.ini               # pytest configuration
│   │
│   ├── config/
│   │   ├── urls.py              # Root URL config — all routes versioned at /api/v1/
│   │   ├── wsgi.py              # WSGI application entry point
│   │   └── settings/
│   │       ├── base.py          # Shared settings (DRF, JWT, throttles, pagination)
│   │       ├── development.py   # Dev overrides (SQLite option, DEBUG=True)
│   │       └── production.py    # Production overrides (DATABASE_URL, ALLOWED_HOSTS)
│   │
│   └── apps/
│       ├── core/                # Shared infrastructure (used by all apps)
│       │   ├── models.py        # AuditModel — abstract base with created_at/updated_at/
│       │   │                    #   created_by/updated_by (auto-set via thread-local)
│       │   ├── middleware.py    # RequestUserMiddleware — injects request user into
│       │   │                    #   thread-local for AuditModel.save()
│       │   ├── thread_local.py  # get_current_user / set_current_user helpers
│       │   ├── permissions.py   # IsAdmin, IsManagerOrAbove, IsAnyRole, ReadOnly
│       │   ├── throttling.py    # Rate limit classes (login, order, payment, etc.)
│       │   ├── pagination.py    # StandardResultsPagination (page_size=50)
│       │   ├── exceptions.py    # Custom DRF exception handler
│       │   ├── bot_guard.py     # Middleware: blocks requests with no User-Agent
│       │   ├── ip_throttle.py   # IP-based throttle (pre-auth layer)
│       │   └── views.py         # GET /health/ liveness probe
│       │
│       ├── users/               # Authentication and user management
│       │   ├── models.py        # Custom User: email login, role field
│       │   ├── serializers.py   # UserSerializer, LoginSerializer, ChangePasswordSerializer
│       │   ├── views.py         # UserListCreateView, MeView, ChangePasswordView
│       │   ├── authentication.py # ActiveUserJWTAuthentication (blocks inactive users)
│       │   ├── auth_urls.py     # /auth/login/, /auth/refresh/, /auth/logout/
│       │   └── urls.py          # /users/, /users/me/, /users/<pk>/
│       │
│       ├── products/            # Product catalogue
│       │   ├── models.py        # Product, ProductCategory, QuickProduct
│       │   ├── serializers.py
│       │   ├── views.py         # CRUD + quick-products list/manage
│       │   └── urls.py
│       │
│       ├── customers/           # Customer profiles and credit ledger
│       │   ├── models.py        # Customer (name, phone, email, type), CreditLedger
│       │   ├── serializers.py
│       │   ├── views.py         # CRUD + phone lookup + ledger
│       │   └── urls.py
│       │
│       ├── pricing/             # Per-customer price management
│       │   ├── models.py        # PricelistItem, PriceHistory (immutable audit log)
│       │   ├── serializers.py
│       │   ├── views.py         # set-price wizard, lookup, history
│       │   └── urls.py
│       │
│       ├── orders/              # Sales order lifecycle
│       │   ├── models.py        # Order (draft→confirmed→paid/credit), OrderItem
│       │   ├── serializers.py
│       │   ├── views.py         # CRUD + confirm + mark-paid + cancel + payment
│       │   └── urls.py
│       │
│       ├── cashbook/            # Daily cash flow ledger
│       │   ├── models.py        # CashTransaction (IN/OUT, category, mode)
│       │   ├── serializers.py
│       │   ├── views.py         # List, in-create, out-create, detail, summary, categories
│       │   ├── urls.py
│       │   └── management/commands/backfill_cashbook.py  # Management command for backfill
│       │
│       └── suppliers/           # Supplier management (Phase 1, latest addition)
│           ├── models.py        # Supplier, SupplierProduct, PurchaseInvoice,
│           │                    #   PurchaseItem, SupplierPayment
│           ├── serializers.py
│           ├── views.py         # All supplier + purchase invoice views
│           ├── signals.py       # post_save on SupplierPayment → creates CashTransaction
│           ├── filters.py       # PurchaseInvoiceFilter (status, supplier, date range)
│           ├── apps.py          # AppConfig — imports signals in ready()
│           ├── urls.py          # /suppliers/ routes
│           └── purchases_urls.py # /purchases/ routes
│
└── frontend/
    ├── Dockerfile               # Two-stage: node:20-alpine build → nginx:1.27-alpine serve
    ├── nginx.conf               # SPA fallback + /api/v1/ proxy to backend
    ├── index.html               # HTML entry point
    ├── vite.config.js           # Vite + React plugin config
    ├── tailwind.config.js       # Brand colour extension (blue scale)
    ├── postcss.config.js        # Tailwind + autoprefixer
    ├── package.json             # Dependencies
    │
    └── src/
        ├── main.jsx             # React DOM root render
        ├── App.jsx              # BrowserRouter + all Route definitions
        ├── index.css            # Tailwind directives + component layer (.btn, .card, .badge)
        │
        ├── api/                 # One file per backend domain — all return Axios promises
        │   ├── client.js        # Axios instance: JWT attach + silent refresh on 401
        │   ├── auth.js          # login, refresh, logout
        │   ├── products.js      # CRUD + quick products
        │   ├── customers.js     # CRUD + lookup + ledger
        │   ├── pricing.js       # set-price, lookup, history
        │   ├── orders.js        # CRUD + confirm + cancel + payment
        │   ├── cashbook.js      # transactions + summary + categories
        │   └── suppliers.js     # suppliers + products + payments + ledger + purchases
        │
        ├── context/
        │   └── AuthContext.jsx  # useAuth() hook: user, isManager, isAdmin, login, logout
        │
        ├── components/
        │   ├── Layout.jsx                   # Shell: Sidebar + main content area
        │   ├── Sidebar.jsx                  # Navigation links (role-aware visibility)
        │   ├── ProtectedRoute.jsx           # Redirects unauthenticated / insufficient role
        │   ├── AddTransactionModal.jsx      # Modal: create cashbook IN or OUT entry
        │   ├── AddPurchaseInvoiceModal.jsx  # Modal: create purchase invoice with line items
        │   ├── CashTransactionDetailPanel.jsx # Slide-in panel: cashbook entry detail
        │   ├── OrderDetailModal.jsx         # Modal: order detail + line items
        │   ├── QuickProductGrid.jsx         # Touch-friendly product quick-select grid
        │   └── QuantityInput.jsx            # Increment/decrement input with unit support
        │
        ├── pages/
        │   ├── Login.jsx            # Email + password login form
        │   ├── Dashboard.jsx        # Summary cards + recent activity
        │   ├── NewBill.jsx          # Full billing screen (customer confirm + product add)
        │   ├── Orders.jsx           # Orders list with filters
        │   ├── Cashbook.jsx         # Transaction list + summary cards + filters
        │   ├── Customers.jsx        # Customer list + search
        │   ├── CustomerProfile.jsx  # Customer detail: orders, ledger, price list
        │   ├── Products.jsx         # Product catalogue CRUD
        │   ├── QuickProducts.jsx    # Manage quick-access product grid
        │   ├── PriceHistory.jsx     # Immutable price change audit log
        │   ├── Suppliers.jsx        # Supplier list + search + add
        │   ├── SupplierDetail.jsx   # Supplier tabs: Invoices, Payments, Ledger, Products
        │   ├── Purchases.jsx        # All purchase invoices across all suppliers
        │   └── Users.jsx            # User management (admin only)
        │
        ├── utils/
        │   └── unitConfig.js    # Unit metadata: kg/g/L/mL/pcs — display and conversion
        │
        └── test/
            ├── setup.js         # Vitest + Testing Library setup
            └── Cashbook.test.jsx
```

---

## 5. Backend Deep Dive

### AuditModel Pattern

Every model in the system extends `AuditModel` (except `User` which has its own timestamps):

```python
class AuditModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(User, null=True, ...)  # auto-set from thread-local
    updated_by = models.ForeignKey(User, null=True, ...)  # auto-set from thread-local
```

The `save()` method reads the current user from `apps.core.thread_local.get_current_user()`. This is populated by `RequestUserMiddleware` for session-auth requests. For JWT API views, `created_by=request.user` must be passed explicitly to `serializer.save()`.

### Response Envelope Convention

**Single-object mutations** (POST create, PATCH update, action endpoints) return:
```json
{ "success": true, "data": { ...object... } }
```

**List endpoints** (GET list) return standard DRF pagination — no envelope:
```json
{ "count": 42, "next": null, "previous": null, "results": [...] }
```

This distinction matters in the frontend: list responses use `data.results`, single-object responses use `data.data`.

### Migrations Strategy

There are **no committed migration files**. The `entrypoint.sh` runs `makemigrations` + `migrate` on every container startup. This means:

- The database schema is always derived from the current model state.
- New developers get a clean migration history automatically.
- **Downside:** If a model change is not detected by `makemigrations` (e.g. due to Docker layer cache), schema patches in `entrypoint.sh` serve as a fallback.

Schema patches live in the `entrypoint.sh` `shell -c` block and use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` — idempotent, safe to run repeatedly.

### Signal: SupplierPayment → Cashbook

`backend/apps/suppliers/signals.py` — when a `SupplierPayment` is created:
1. Maps payment mode: `online` → `online`, everything else (`cash`, `cheque`, `bank`) → `cash` (CashTransaction only supports cash/online).
2. Creates a `CashTransaction(type=OUT, category=supplier_payment)`.
3. Writes `cashbook_entry_id` back to the payment via `.update()` (avoids re-triggering the signal).

### Signal: PurchaseInvoice Mark Paid → Cashbook

In `PurchaseInvoiceMarkPaidView.post()` (not a signal — inline in the view):
1. Changes invoice `status` to `paid`.
2. Creates a `CashTransaction(type=OUT, category=supplier_payment)`.
3. Writes `cashbook_entry_id` back to `PurchaseInvoice` via `.update()`.

### Rate Limiting (Three-Layer Stack)

| Layer | Mechanism | Location |
|---|---|---|
| 1 | BotGuardMiddleware — blocks no-User-Agent requests | `apps/core/bot_guard.py` |
| 2 | IP-based throttle — applied before auth | `apps/core/ip_throttle.py` |
| 3 | DRF per-user throttles — applied inside views | `apps/core/throttling.py` |

Key throttle limits:
- Login: 5/min per IP
- Token refresh: 10/min per IP
- Order confirm/actions: 10/min per user
- Payment post: 5/min per user
- Cashbook create: 30/min per user

---

## 6. Frontend Deep Dive

### Auth Flow

1. User submits email + password to `POST /api/v1/auth/login/`.
2. Response: `{ access, refresh, user: { id, name, email, role } }`.
3. Tokens stored in `localStorage`. User object stored in `localStorage` and `AuthContext`.
4. Every Axios request attaches `Authorization: Bearer <access>` via request interceptor.
5. On 401 response: interceptor silently calls `POST /api/v1/auth/refresh/`, retries once.
6. On refresh failure: clears localStorage, redirects to `/login`.

### AuthContext

```jsx
const { user, isManager, isAdmin, login, logout } = useAuth()
```

`isManager` is true for both `manager` and `admin` roles — use this for most manager-gated UI elements. `isAdmin` is only true for the admin role.

### Route Protection

`ProtectedRoute` wraps every authenticated page. It accepts an optional `requireRole` prop:
- `requireRole="manager"` — redirects cashiers to `/`
- `requireRole="admin"` — redirects managers and cashiers to `/`
- No prop — any authenticated user passes

### API Client

`src/api/client.js` — single Axios instance shared by all API modules. Handles:
- Base URL from `VITE_API_BASE_URL` env var (defaults to relative `/api/v1` for Docker)
- JWT attach on every request
- Automatic silent token refresh on 401

### Component Patterns

All form pages follow this pattern:
```
useState for form fields
useState for saving/loading/error
async handler → try/catch → setError on failure
onSaved() + onClose() called on success
```

All list pages follow:
```
useEffect → load data on mount + filter change
data.results || data || []   ← handles both paginated and plain array responses
```

---

## 7. API Reference

All endpoints are prefixed with `/api/v1/`. All require `Authorization: Bearer <token>` except auth endpoints.

### Auth

| Method | URL | Description | Auth |
|---|---|---|---|
| POST | `/auth/login/` | Get access + refresh tokens | None |
| POST | `/auth/refresh/` | Rotate refresh token, get new access | None |
| POST | `/auth/logout/` | Blacklist refresh token | Any |

### Users

| Method | URL | Description | Role |
|---|---|---|---|
| GET | `/users/` | List all users | Admin |
| POST | `/users/` | Create user | Admin |
| GET | `/users/me/` | Current user profile | Any |
| PATCH | `/users/me/change-password/` | Change own password | Any |
| GET/PATCH/DELETE | `/users/<pk>/` | User detail/edit/delete | Admin |

### Products

| Method | URL | Description | Role |
|---|---|---|---|
| GET | `/products/` | List products (paginated, searchable) | Any |
| POST | `/products/` | Create product | Manager |
| GET/PATCH/DELETE | `/products/<pk>/` | Product detail | Manager |
| GET | `/products/categories/` | List categories | Any |
| POST | `/products/categories/` | Create category | Manager |
| GET/PATCH/DELETE | `/products/categories/<pk>/` | Category detail | Manager |
| GET | `/products/quick/` | List quick-access products | Any |
| POST | `/products/quick/manage/` | Add product to quick list | Manager |
| DELETE | `/products/quick/manage/<pk>/` | Remove from quick list | Manager |

### Customers

| Method | URL | Description | Role |
|---|---|---|---|
| GET | `/customers/` | List customers (search by name/phone) | Manager |
| POST | `/customers/` | Create customer | Manager |
| GET/PATCH/DELETE | `/customers/<pk>/` | Customer detail | Manager |
| GET | `/customers/lookup/?phone=` | Phone number lookup | Any |
| GET | `/customers/<pk>/ledger/` | Credit ledger entries | Manager |
| POST | `/customers/<pk>/ledger/` | Add ledger entry | Manager |

### Pricing

| Method | URL | Description | Role |
|---|---|---|---|
| GET | `/pricing/lookup/?customer=&product=` | Get price for customer+product | Any |
| POST | `/pricing/set-price/` | Set customer-specific price | Manager |
| GET | `/pricing/items/` | List all pricelist items | Manager |
| GET/PATCH/DELETE | `/pricing/items/<pk>/` | Pricelist item detail | Manager |
| GET | `/pricing/pricelist/<customer_id>/` | Full pricelist for customer | Manager |
| GET | `/pricing/history/` | Immutable price change history | Manager |

### Orders

| Method | URL | Description | Role |
|---|---|---|---|
| GET | `/orders/` | List orders (filter by status, customer, date) | Any |
| POST | `/orders/` | Create draft order | Any |
| GET/PATCH | `/orders/<pk>/` | Order detail | Any |
| POST | `/orders/<pk>/confirm/` | Confirm order (creates cashbook IN) | Any |
| POST | `/orders/<pk>/mark-paid/` | Mark credit order as paid | Manager |
| POST | `/orders/<pk>/cancel/` | Cancel order | Any |
| POST | `/orders/<pk>/payment/` | Record partial payment | Manager |
| GET/POST | `/orders/<order_pk>/items/` | Order line items | Any |
| DELETE | `/orders/<order_pk>/items/<pk>/` | Remove line item | Any |

### Cashbook

| Method | URL | Description | Role |
|---|---|---|---|
| GET | `/cashbook/` | List transactions (filter: type, mode, category, date range) | Any |
| GET/PATCH/DELETE | `/cashbook/<pk>/` | Transaction detail | Any |
| POST | `/cashbook/in/` | Create money-in entry | Any |
| POST | `/cashbook/out/` | Create money-out entry | Any |
| GET | `/cashbook/summary/` | Total in, out, balance, cash-in-hand | Any |
| GET | `/cashbook/categories/` | IN and OUT category lists | Any |

**Cashbook categories:**
- IN: `sale`, `payment_received`, `manual_in`
- OUT: `expense`, `manual_out`, `supplier_payment`

**Cashbook modes:** `cash`, `online`

### Suppliers

| Method | URL | Description | Role |
|---|---|---|---|
| GET | `/suppliers/` | List suppliers (search by name/phone/email) | Any |
| POST | `/suppliers/` | Create supplier | Manager |
| GET | `/suppliers/<pk>/` | Supplier detail + outstanding balance | Any |
| PATCH | `/suppliers/<pk>/` | Update supplier | Manager |
| DELETE | `/suppliers/<pk>/` | Soft-delete (sets is_active=False) | Manager |
| GET/POST | `/suppliers/<pk>/payments/` | List or record payments | Manager |
| GET | `/suppliers/<pk>/ledger/` | Merged invoice+payment ledger | Any |
| GET/POST | `/suppliers/<pk>/products/` | Supplier product catalogue | Manager |
| DELETE | `/suppliers/<pk>/products/<pk>/` | Remove product from catalogue | Manager |

### Purchase Invoices

| Method | URL | Description | Role |
|---|---|---|---|
| GET | `/purchases/` | List all invoices (filter: supplier, status, date) | Any |
| POST | `/purchases/` | Create draft invoice with line items | Manager |
| GET/PATCH | `/purchases/<pk>/` | Invoice detail (PATCH: draft only) | Manager |
| DELETE | `/purchases/<pk>/` | Delete draft invoice | Manager |
| POST | `/purchases/<pk>/confirm/` | Confirm invoice (draft → confirmed) | Manager |
| POST | `/purchases/<pk>/mark-paid/` | Mark paid + create cashbook OUT entry | Manager |
| DELETE | `/purchases/<invoice_pk>/items/<pk>/` | Remove line item | Manager |

---

## 8. Database Schema

### Key Models and Relationships

```
User
 └─ role: admin | manager | cashier

Product ──────────────────────── ProductCategory
 └─ QuickProduct (sort_order)

Customer
 ├─ CreditLedger (entries: credit/debit)
 └─ PricelistItem ──── Product
      └─ PriceHistory (immutable log of every price change)

Order ──── Customer
 ├─ OrderItem ──── Product
 └─ CashTransaction (auto-created on confirm/mark-paid)

CashTransaction
 ├─ transaction_type: IN | OUT
 ├─ category: sale | payment_received | manual_in | expense | manual_out | supplier_payment
 ├─ mode: cash | online
 └─ order (FK, optional — links back to source order)

Supplier
 ├─ SupplierProduct ──── Product
 ├─ SupplierPayment
 │    └─ cashbook_entry (FK → CashTransaction, auto-created via signal)
 └─ PurchaseInvoice
      ├─ PurchaseItem ──── Product
      └─ cashbook_entry (FK → CashTransaction, auto-created on mark-paid)
```

### PurchaseInvoice Status Lifecycle

```
draft → confirmed → paid
         (confirm)   (mark-paid)
```

Only `draft` invoices can be edited or deleted. `mark-paid` creates the cashbook OUT entry.

### Supplier outstanding_balance

Computed property on `Supplier` model:
```
outstanding_balance = SUM(confirmed + paid invoice amounts) - SUM(payment amounts)
```

---

## 9. Authentication & Roles

### JWT Configuration (from base.py)

- **Access token lifetime:** configurable via `JWT_ACCESS_TOKEN_LIFETIME_MINUTES` env var
- **Refresh token lifetime:** configurable via `JWT_REFRESH_TOKEN_LIFETIME_DAYS` env var
- **Rotate refresh tokens:** `True` — each refresh call issues a new refresh token
- **Blacklisting:** Enabled via `simplejwt.token_blacklist` — logout invalidates the token

### Custom Authentication Class

`apps.users.authentication.ActiveUserJWTAuthentication` extends simplejwt's default auth to reject tokens for users with `is_active=False`. A deactivated user cannot use existing tokens even before expiry.

### Permission Classes

```python
# Any authenticated user (admin, manager, cashier)
permission_classes = [IsAuthenticated, IsAnyRole]

# Manager or admin — used on most write endpoints
permission_classes = [IsAuthenticated, IsManagerOrAbove]

# Admin only — user management
permission_classes = [IsAuthenticated, IsAdmin]

# Read for all, write for manager — used on catalogue endpoints
permission_classes = [IsAuthenticated, IsManagerOrAbove | ReadOnly]
```

---

## 10. Design Language

The UI follows a clean, professional SaaS aesthetic inspired by Khatabook's simplicity and Odoo's structure. It is intentionally not a mobile-first design — it targets desktop/tablet browsers used at a shop counter.

### Colour Palette

| Token | Hex | Usage |
|---|---|---|
| `brand-50` | `#eff6ff` | Light backgrounds, hover states |
| `brand-100` | `#dbeafe` | Badge backgrounds |
| `brand-500` | `#3b82f6` | Focus rings, icons |
| `brand-600` | `#2563eb` | Primary buttons, links |
| `brand-700` | `#1d4ed8` | Button hover states |
| `brand-900` | `#1e3a8a` | Dark text on light brand bg |
| `gray-50` | — | Page background |
| `gray-200` | — | Card borders, dividers |
| `gray-700` | — | Body text |
| `green-*` | — | Money in, paid status, cash mode |
| `red-*` | — | Money out, danger, delete |
| `blue-*` | — | Confirmed status, online mode |
| `amber-*` | — | Draft status, warnings |
| `purple-*` | — | Cheque mode |
| `indigo-*` | — | Bank transfer mode |

### Component Classes (defined in `src/index.css`)

```css
.btn           /* base button: flex, padding, rounded-lg, focus ring */
.btn-primary   /* brand-600 background, white text */
.btn-secondary /* white background, gray border */
.btn-danger    /* red-600 background */
.input         /* standard form input with brand focus ring */
.card          /* white, rounded-xl, shadow-sm, border-gray-200, p-6 */
.badge         /* inline-flex, rounded-full, text-xs, font-medium */
```

### Typography

- Font: system-default (no custom font loaded — keeps bundle small)
- Page headings: `text-xl font-bold text-gray-900`
- Section headings: `text-base font-semibold text-gray-800`
- Body: `text-sm text-gray-700`
- Muted/secondary: `text-xs text-gray-500`
- Monospace (invoice numbers, codes): `font-mono`

### Layout Shell

```
┌─────────────────────────────────────────────────────────┐
│  Sidebar (fixed left, w-64)  │  Main content area        │
│  ─────────────────────────   │  (scrollable, p-6)        │
│  Logo + app name             │                           │
│  Nav links (role-aware)      │  <Page component />       │
│  ─────────────────────────   │                           │
│  User name + role badge      │                           │
│  Logout button               │                           │
└─────────────────────────────────────────────────────────┘
```

### Status Badge Colours (consistent across all pages)

| Status | Class |
|---|---|
| `draft` | `bg-gray-100 text-gray-600` |
| `confirmed` | `bg-blue-100 text-blue-700` |
| `paid` | `bg-green-100 text-green-700` |
| `credit` | `bg-amber-100 text-amber-700` |
| `cancelled` | `bg-red-100 text-red-600` |

### Currency Formatting

All monetary values use this formatter throughout the codebase:
```js
const fmt = (n) =>
  Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
// Output: ₹1,23,456.78  (Indian number format)
```

---

## 11. Infrastructure & DevOps

### Docker Compose Service Dependency Chain

```
db (postgres)
  ↓ healthcheck: pg_isready
backend (django/gunicorn)
  ↓ healthcheck: GET /health/
frontend (nginx)
```

The frontend container only starts after the backend passes its health check. This means the nginx API proxy will always have a live backend to forward to.

### entrypoint.sh Startup Sequence

Every time the backend container starts, it runs in order:

1. **Wait for PostgreSQL** — polls `psycopg.connect()` every 2 seconds until ready
2. **`makemigrations`** — generates migration files for all custom apps
3. **`migrate`** — applies pending migrations
4. **Schema patches** — `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for columns that migrations miss (idempotent)
5. **Cashbook backfill** — creates cashbook entries for any `SupplierPayment` or paid `PurchaseInvoice` that has `cashbook_entry=NULL` (idempotent)
6. **`collectstatic`** — copies static files for Django admin
7. **Create admin** — `create_admin.py` creates the admin user from env vars if it doesn't exist
8. **Start gunicorn** — 3 workers, port 8000, 120s timeout

### Nginx Configuration

`frontend/nginx.conf` does two things:
1. Serves the built React SPA (`/dist`) with `try_files $uri $uri/ /index.html` for client-side routing
2. Proxies `/api/v1/` to `http://backend:8000` — the backend hostname resolves via Docker's internal DNS

### Render.com Deployment

`render.yaml` defines:
- **Web service** for backend (Docker, from `./backend`, env vars from Render dashboard)
- **Static site** or web service for frontend (Docker, from `./frontend`)
- **PostgreSQL** managed database

The `VITE_API_BASE_URL` env var on the frontend build must point to the backend's Render URL when deploying to Render (since the proxy isn't available outside Docker).

---

## 12. Environment Variables

Copy `.env.example` to `.env` before running. All variables are required unless marked optional.

```env
# Django
SECRET_KEY=your-secret-key-here
DEBUG=False
ALLOWED_HOSTS=localhost,127.0.0.1

# Database (used when DATABASE_URL is not set)
DB_NAME=customer_pricing
DB_USER=postgres
DB_PASSWORD=your-db-password
DB_HOST=db
DB_PORT=5432

# Or use a full DATABASE_URL (Render provides this automatically)
# DATABASE_URL=postgresql://user:pass@host:5432/dbname

# JWT
JWT_ACCESS_TOKEN_LIFETIME_MINUTES=60
JWT_REFRESH_TOKEN_LIFETIME_DAYS=7

# Admin user (auto-created on startup)
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=your-admin-password
ADMIN_NAME=Admin

# Frontend (only needed for Render/separate deployment)
# VITE_API_BASE_URL=https://your-backend.onrender.com/api/v1
```

---

## 13. Running Locally

### Prerequisites

- Docker Desktop installed and running
- Windows 10/11 (the `start.bat` handles Docker startup automatically)

### Start

```
Double-click start.bat
```

Or from terminal:
```bat
start.bat
```

The script:
1. Checks for Docker CLI
2. Starts Docker Desktop if not running
3. Waits up to 60 seconds for the Docker daemon
4. Runs `docker compose up --build -d`

Access the app at `http://localhost`

### Stop

```
Double-click stop.bat
```

### Rebuild after code changes

The Docker build cache will reuse layers. If backend Python files changed, the backend image rebuilds automatically when you re-run `start.bat`. If you want to force a full rebuild:

```bat
docker compose build --no-cache
docker compose up -d
```

### Running Tests

Backend tests (requires Python + dependencies installed locally, or run inside container):
```bash
cd backend
pytest
```

Or inside the running container:
```bash
docker exec -it customer-pricing-backend-1 pytest
```

Frontend tests:
```bash
cd frontend
npm test
```

### Viewing Logs

```bash
docker logs customer-pricing-backend-1 -f
docker logs customer-pricing-frontend-1 -f
```

### Django Admin

Available at `http://localhost/admin/` — log in with the `ADMIN_EMAIL` / `ADMIN_PASSWORD` from your `.env`.

---

## 14. Known Issues & Technical Debt

### Migration Detection Reliability

Django's `makemigrations` running inside the container sometimes reports "No changes detected" when model fields are added. This is caused by Docker build cache reusing old migration state. **Workaround:** all additive schema changes should also have a matching `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` patch in `entrypoint.sh`.

### AuditModel `created_by` for JWT Requests

`RequestUserMiddleware` sets the thread-local user from session auth, which does not include JWT-authenticated API requests. As a result, `AuditModel.save()` cannot auto-set `created_by` for API-created records. Every view that creates records must pass `created_by=request.user` explicitly to `serializer.save()`. This is inconsistently applied — some views pass it, some don't.

### Mark-Paid Payment Mode

When an invoice is marked paid via `POST /purchases/<pk>/mark-paid/`, the cashbook entry is created with `mode=cash` by default. There is no UI to specify whether the payment was made in cash or online. A future improvement would be a confirmation modal asking for payment mode before marking paid.

### No Pagination on Supplier Ledger

`GET /suppliers/<pk>/ledger/` returns all entries without pagination. For suppliers with many transactions this could become a large response. The endpoint returns `{"success": true, "data": [...]}` (not paginated), which is inconsistent with other list endpoints.

### `SupplierPayment.reference_invoice` UI

The "Reference Invoice #" field in the Record Payment form accepts free text (invoice number string) but the API expects the invoice PK integer. This field is currently non-functional for linking payments to invoices.

### No File Attachments on Purchase Invoices

`CashTransaction` has an `attachment` file field, but `PurchaseInvoice` does not. Storing scanned invoices/receipts against purchase records is a missing feature.

---

## 15. Design Inspiration & Reference Codebases

### Odoo 18 — `D:\Asus\odoo-18.0`

The system draws heavily from Odoo's architecture patterns. Specific parallels:

| This project | Odoo equivalent |
|---|---|
| `AuditModel` with `created_by/updated_by` | `mail.thread` / `res.users` audit fields |
| `created_by` via thread-local | `self.env.user` |
| `User.role` (admin/manager/cashier) | `res.groups` (group_system, group_sale_manager, group_sale_salesman) |
| Email as `USERNAME_FIELD` | `res.users.login = email` |
| `PurchaseInvoice` lifecycle (draft→confirmed→paid) | `account.move` state machine |
| `CashTransaction` categories | `account.journal` types |
| `SupplierPayment` | `account.payment` (vendor payments) |
| `PricelistItem` | `product.pricelist.item` |
| `PriceHistory` (immutable) | `mail.message` price change chatter |
| Soft-delete (`is_active=False`) | `active` field convention |

**Key Odoo files to reference in `D:\Asus\odoo-18.0`:**
- `odoo/models.py` — BaseModel, `create_uid`, `write_uid`, `create_date`, `write_date`
- `addons/sale/models/sale_order.py` — order state machine (draft→sale→done→cancel)
- `addons/account/models/account_move.py` — invoice lifecycle
- `addons/account/models/account_payment.py` — payment recording pattern
- `addons/product/models/product_pricelist.py` — per-customer pricing
- `addons/point_of_sale/` — cashbook/POS session concept

### Khatabook

The UX flow for cashbook and billing is modelled after Khatabook's mobile app:
- Cashbook shows daily IN/OUT with running balance
- Customer ledger (credit/debit entries per customer)
- Quick product grid for fast billing at counter
- Supplier payments with mode selection (cash/online/cheque)

### Django REST Framework Patterns

The view/serializer structure follows the DRF tutorial conventions:
- `generics.ListCreateAPIView` for list + create
- `generics.RetrieveUpdateDestroyAPIView` for detail operations
- `APIView` for custom action endpoints (confirm, mark-paid, etc.)
- `ModelSerializer` with explicit `fields` and `read_only_fields`
- `SimpleRateThrottle` subclasses for per-endpoint rate limiting

### Frontend Component Patterns

The form and table patterns are consistent with how Tailwind UI structures its components:
- Cards as the primary container (`bg-white rounded-xl shadow-sm border`)
- Modals with fixed overlay and centered panel
- Status badges as `rounded-full` pills
- Table rows with `hover:bg-gray-50` and `divide-y` separators

---

## 16. Future Scope & Remaining Tasks

This section consolidates all outstanding bugs, unfinished features, planned phases, and security fixes sourced from `plans/` and issue logs. Items are grouped by priority and phase.

---

### 16.1 Active Bugs (Fix Before Next Release)

These are confirmed bugs observed during testing that have not yet been resolved.

| # | Area | Bug | File(s) |
|---|---|---|---|
| B1 | Cashbook | Duplicate cashbook entries on order mark-paid — same payment recorded twice as both `Sale` and `Payment Received` with same order reference | `apps/orders/views.py` |
| B2 | Pricing | Price history not showing after customer-specific price is edited — base price changes instead of creating new history row | `apps/pricing/views.py`, `PriceHistory.jsx` |
| B3 | Orders | When a new bill is created and paid immediately, clicking "Mark Fully Paid" on re-open records it as a second payment entry | `pages/NewBill.jsx`, `apps/orders/views.py` |
| B4 | Dashboard | Bill detail card (same as Orders.jsx order modal) is missing from Dashboard recent activity — clicking an order row does nothing | `pages/Dashboard.jsx` |
| B5 | Suppliers | `reference_invoice` field in Record Payment form accepts free-text invoice number but API expects an integer PK — field is silently non-functional | `pages/SupplierDetail.jsx` |
| B6 | Suppliers | Mark Paid creates cashbook entry with `mode=cash` hardcoded — no way for user to specify online/cash at the time of marking paid | `apps/suppliers/views.py` (PurchaseInvoiceMarkPaidView) |
| B7 | Suppliers | Supplier ledger endpoint not paginated — returns all entries in one response, no `results` wrapper | `apps/suppliers/views.py` (SupplierLedgerView) |
| B8 | AuditModel | `created_by` is not consistently set across all API views — only views that explicitly pass `created_by=request.user` to `serializer.save()` populate the field | Multiple views |

---

### 16.2 Phase 3 — Settings & Business Profile

**Goal:** Allow admin to configure the business identity, toggle GST, manage invoice templates.

| Task | Description | Backend | Frontend |
|---|---|---|---|
| S3.1 | `BusinessProfile` singleton model | `apps/settings/models.py` — name, address, GSTIN, logo, currency, timezone | `pages/Settings.jsx` |
| S3.2 | GET/PATCH `/api/v1/settings/profile/` | Single-object endpoint, admin-only write | Settings form page |
| S3.3 | GST toggle | Boolean `gst_enabled` on BusinessProfile — when False, hide GST fields across all invoice forms | Conditional render in `NewBill.jsx`, `AddPurchaseInvoiceModal.jsx` |
| S3.4 | Business logo upload | FileField on BusinessProfile, served via Django static/media | Logo preview in Settings, shown on PDF exports |
| S3.5 | Invoice number prefix config | `invoice_prefix` field (e.g. `INV`, `ORD`) — replace hardcoded `ORD/2026/` format | `apps/orders/models.py` auto_number logic |
| S3.6 | Data export — Orders CSV | `GET /api/v1/orders/export/?date_from=&date_to=` → returns CSV download | Export button in Orders page |
| S3.7 | Data export — Cashbook CSV | `GET /api/v1/cashbook/export/` → CSV with all transactions in date range | Export button in Cashbook page |
| S3.8 | PDF invoice generation | `GET /api/v1/orders/<pk>/pdf/` → returns PDF using WeasyPrint or ReportLab | "Download Invoice" button in order detail modal |

---

### 16.3 Phase 4 — Inventory & Stock Tracking

**Goal:** Add stock quantity to products, track movements when bills are confirmed and purchases are received.

| Task | Description | Files |
|---|---|---|
| I4.1 | `stock_quantity` field on Product | `DecimalField`, default 0. Show in product list and detail | `apps/products/models.py` |
| I4.2 | `StockMovement` model | `movement_type` (IN/OUT), `quantity`, `reference` (order or purchase invoice FK), `product` FK | `apps/products/models.py` |
| I4.3 | Auto-deduct stock on order confirm | Signal or inline: for each `OrderItem`, create `StockMovement(OUT)` and update `product.stock_quantity` | `apps/orders/views.py` or signals |
| I4.4 | Auto-add stock on purchase invoice confirm | For each `PurchaseItem`, create `StockMovement(IN)` and update `product.stock_quantity` | `apps/suppliers/views.py` (PurchaseInvoiceConfirmView) |
| I4.5 | Low stock alerts on Dashboard | Query products where `stock_quantity < reorder_level` — show alert card | `pages/Dashboard.jsx` |
| I4.6 | `reorder_level` field on Product | Threshold for low stock alert. Default 0 (disabled) | `apps/products/models.py` |
| I4.7 | Stock movement history page | Table of all IN/OUT movements filterable by product and date | `pages/Products.jsx` (new tab) or `pages/Inventory.jsx` |
| I4.8 | Reorder suggestion from supplier | When stock is low, surface the linked `SupplierProduct` with last known price | `pages/Dashboard.jsx` |

---

### 16.4 Phase 5 — Collections & Reminders

**Goal:** Surface outstanding customer balances and enable payment reminders.

| Task | Description | Files |
|---|---|---|
| C5.1 | Collections dashboard | List all customers with `outstanding_balance > 0`, sorted by amount, with days-overdue | `pages/Collections.jsx` (new) |
| C5.2 | Payment reminder via WhatsApp | "Send Reminder" button → opens WhatsApp deep-link with pre-filled message template | Frontend only — `wa.me/<phone>?text=...` |
| C5.3 | Due date on orders | `due_date` field on `Order` for credit orders — used for overdue calculation | `apps/orders/models.py` |
| C5.4 | Overdue badge | Show "X days overdue" badge on order rows where `due_date < today` and status is credit | `pages/Orders.jsx`, `pages/Collections.jsx` |
| C5.5 | Staff activity log | `UserActivityLog` model — log critical actions (login, order confirm, price change, payment post) | New `apps/core/activity_log.py` |
| C5.6 | Activity log API | `GET /api/v1/activity-log/` — admin only, filterable by user and date | `apps/core/views.py` |

---

### 16.5 Phase 6 — Internationalisation (i18n)

**Goal:** Support Hindi, Marathi, and Hinglish for cashiers operating in non-English environments.

| Task | Description |
|---|---|
| i6.1 | Add `django-gettext` string extraction to backend error messages and category labels |
| i6.2 | Add `react-i18next` to frontend — wrap all UI strings in `t()` |
| i6.3 | Create translation files: `en.json`, `hi.json`, `mr.json` |
| i6.4 | Language selector in user profile / Settings page |
| i6.5 | Onboarding wizard: language selection screen shown on first login |
| i6.6 | Currency symbol stays `₹` — only UI labels are translated, not number formats |

---

### 16.6 Phase 7 — AI & Advanced Features ("Better Version")

These are longer-horizon features requiring external services or significant backend work.

| Task | Description | Complexity |
|---|---|---|
| A7.1 | AI invoice scanner | Upload photo of paper supplier invoice → OCR (AWS Textract or Google Vision) → pre-fill `AddPurchaseInvoiceModal` fields | High |
| A7.2 | Auto GST filing export | Generate GSTR-1 (sales) and GSTR-2 (purchases) JSON in the exact portal format | High |
| A7.3 | Inventory forecasting | Moving average calculation per product — predict when stock will run out based on past `StockMovement` rate | Medium |
| A7.4 | Supplier credit scoring | Score 0–100 per supplier based on ratio of on-time payments vs total invoices, weighted by amount | Medium |
| A7.5 | Best supplier comparison | For a given product, show table of all linked suppliers with avg unit price, quality rating, avg delivery days | Low |
| A7.6 | Bulk purchase invoice import | CSV upload → create multiple `PurchaseInvoice` records in one request | Medium |
| A7.7 | WhatsApp/email payment receipts | Auto-send receipt PDF to supplier on `SupplierPayment` create (Twilio or SendGrid) | Medium |
| A7.8 | Multi-currency support | `currency` and `exchange_rate` fields on `PurchaseInvoice` — useful for imported goods | High |
| A7.9 | Supplier portal | Read-only login for supplier to view their own invoice + payment history | High |

---

### 16.7 Supplier Module — Remaining Near-Term Tasks

These are small extensions to the already-built suppliers module, not full phases.

| Task | Description |
|---|---|
| SP1 | Supplier price history — track `unit_price` changes per `SupplierProduct` over time with date |
| SP2 | Payment mode on Mark Paid — show a small modal asking cash/online before creating the cashbook entry |
| SP3 | Fix `reference_invoice` field — change UI from free-text to a dropdown of the supplier's confirmed invoices |
| SP4 | Paginate supplier ledger — add pagination to `SupplierLedgerView` to match other list endpoints |
| SP5 | Payment reminders — `due_date` field on `PurchaseInvoice`, show overdue badge when past due |
| SP6 | Bulk CSV import for `PurchaseItems` — for high-volume suppliers sending price lists |

---

### 16.8 Security Fixes (from Security Audit)

These are confirmed vulnerabilities identified in `plans/security_audit.md` that must be resolved before any public/cloud deployment.

| Priority | Issue | Current State | Fix |
|---|---|---|---|
| CRITICAL | **IP Spoofing bypass on rate limiting** | `ip_throttle.py` reads the leftmost IP from `X-Forwarded-For` — an attacker can inject `X-Forwarded-For: 1.1.1.1` to bypass all IP-based throttles | Read `X-Real-IP` set by Nginx, or use the rightmost (trusted) IP from `X-Forwarded-For` |
| HIGH | **Deactivated user JWT still valid** | When a user is deactivated or their role changes, existing access tokens remain valid until expiry (up to 60 min) | Custom `JWTAuthentication` that queries `user.is_active` and `user.updated_at` on every request, or reduce `JWT_ACCESS_TOKEN_LIFETIME_MINUTES` to 5 |
| MEDIUM | **Bot Guard trivially bypassed** | `bot_guard.py` blocks requests with no User-Agent but any standard browser UA string passes | Not a standalone fix — document as accepted risk, supplement with other controls |
| MEDIUM | **JWT payload information leakage** | `email`, `role`, `name` are readable from the token payload (Base64, not encrypted) | Move sensitive claims out of the JWT or document as accepted risk (payload is signed, not encrypted — standard JWT behaviour) |

---

### 16.9 NewBill Page Improvements (Planned but Not Yet Built)

These were planned in `plans/newbill_improvements.md` and `plans/newbill_v2.md` but not fully implemented.

| Task | Description |
|---|---|
| NB1 | **Inline customer creation** — when search returns no results, show a compact "Create customer" form inline without leaving the billing screen. Requires splitting `CustomerListCreateView` permissions so cashiers can POST |
| NB2 | **Delete line item confirmation modal** — clicking remove on an order item currently deletes immediately with no confirmation |
| NB3 | **Recommended products** — show products the customer has ordered before at the top of product search results |
| NB4 | **Draft bill restore** — if a cashier accidentally navigates away, restore the in-progress draft on return via `?draft=ID` URL param (partially implemented) |
| NB5 | **Keyboard shortcuts** — `Enter` to confirm customer, `Tab` to move between quantity fields, `/` to focus product search |

---

### 16.10 Infrastructure & DevOps Improvements

| Task | Description |
|---|---|
| D1 | Move Docker WSL data from C: to D: drive (step-by-step guide in `plans/edits in customer pricing.txt`) to free C: drive space |
| D2 | Commit migration files instead of running `makemigrations` at startup — avoids the "No changes detected" cache issue |
| D3 | Add a staging environment on Render — separate from production, used for testing before deploying |
| D4 | Add pre-commit hooks for `ruff` (Python linting) and `eslint` (JS linting) |
| D5 | GitHub Actions CI — run `pytest` and `npm test` on every push to main |
| D6 | Docker volume backup script — automate `pg_dump` to a local file on a schedule |
| D7 | Separate `VITE_API_BASE_URL` into an env var injected at runtime (not baked into the Docker image at build time) — currently requires a full rebuild to change the backend URL |

---

## 17. Task Tracker — Detailed Checklist

> **Legend:** `[x]` = done · `[~]` = in progress · `[ ]` = todo · `[!]` = blocked

---

### Phase 1 — Cashbook (COMPLETE)

| Task | Description | Status |
|---|---|---|
| T1.1.1 | Create `backend/apps/cashbook/` directory | `[x]` |
| T1.1.2 | Define `CashTransaction` model (type, amount, category, mode, description, attachment, created_by) | `[x]` |
| T1.1.3 | Register app in `LOCAL_APPS` | `[x]` |
| T1.1.4 | Run migrations | `[x]` |
| T1.1.5 | `CashTransactionSerializer` with amount > 0 validator + category/type cross-validation | `[x]` |
| T1.1.6 | Views: List/Create/Detail + `CashbookSummaryView` + `CashbookCategoriesView` | `[x]` |
| T1.1.7 | `urls.py` registered at `/api/v1/cashbook/` | `[x]` |
| T1.1.8 | `admin.py` registration | `[x]` |
| T1.1.9 | `CashbookCreateThrottle` (30/min) | `[x]` |
| T1.1.T1 | Model tests: amount ≤ 0 raises ValidationError; balance = SUM(IN) - SUM(OUT) | `[x]` |
| T1.1.T2 | API tests: POST invalid → 400; valid IN/OUT → 201; summary; filter by type; unauth → 401 | `[x]` |
| T1.2.1 | `Cashbook.jsx` — summary cards (Total Balance, Today IN/OUT, Cash in Hand) + transaction list | `[x]` |
| T1.2.2 | `AddTransactionModal.jsx` — type toggle, amount, category, mode, description | `[x]` |
| T1.2.3 | `cashbook.js` API module | `[x]` |
| T1.2.4 | `/cashbook` route in `App.jsx` | `[x]` |
| T1.2.5 | "Cashbook" nav link in `Sidebar.jsx` | `[x]` |

---

### Phase 2 — Suppliers & Purchase Ledger (COMPLETE)

| Task | Description | Status |
|---|---|---|
| T2.1.1 | Create `backend/apps/suppliers/` directory | `[x]` |
| T2.1.2 | Models: `Supplier`, `SupplierProduct`, `PurchaseInvoice`, `PurchaseItem`, `SupplierPayment` | `[x]` |
| T2.1.3 | Migrations | `[x]` |
| T2.1.4 | Serializers, views (full CRUD + confirm/mark-paid/ledger), urls | `[x]` |
| T2.1.5 | Signal: `SupplierPayment` post_save → creates `CashTransaction OUT` | `[x]` |
| T2.1.6 | Mark-paid view → creates `CashTransaction OUT` + sets `cashbook_entry_id` on invoice | `[x]` |
| T2.1.7 | `admin.py` with inlines | `[x]` |
| T2.1.8 | `SupplierWriteThrottle` + `PurchaseCreateThrottle` | `[x]` |
| T2.1.9 | `supplier_payment` category added to cashbook `OUT_CATEGORIES` | `[x]` |
| T2.1.10 | Backfill script in `entrypoint.sh` for existing payments/invoices without cashbook entries | `[x]` |
| T2.1.T1 | Model tests | `[x]` |
| T2.1.T2 | API tests (31 tests) | `[x]` |
| T2.2.1 | `Suppliers.jsx` — list with outstanding balance + search | `[x]` |
| T2.2.2 | `SupplierDetail.jsx` — tabs: Invoices, Payments, Ledger, Products | `[x]` |
| T2.2.3 | `AddPurchaseInvoiceModal.jsx` — multi-line item entry + evaluation fields | `[x]` |
| T2.2.4 | `Purchases.jsx` — all invoices across all suppliers | `[x]` |
| T2.2.5 | `suppliers.js` API module (17 functions) | `[x]` |
| T2.2.6 | Routes `/suppliers`, `/suppliers/:id`, `/purchases` | `[x]` |

---

### Phase 3 — Settings & Business Profile (NOT STARTED)

| Task | Description | Status |
|---|---|---|
| T3.1.1 | Create `backend/apps/settings_app/` (avoid shadowing Python `settings`) | `[ ]` |
| T3.1.2 | `BusinessProfile` singleton model: name, address, GSTIN, logo, gst_enabled, invoice_template | `[ ]` |
| T3.1.3 | Singleton enforcement: override `save()` to allow only one instance | `[ ]` |
| T3.1.4 | Migrations | `[ ]` |
| T3.1.5 | `GET/PATCH /api/v1/settings/business-profile/` (admin only) | `[ ]` |
| T3.1.6 | PDF export: `GET /api/v1/orders/{id}/export/pdf/` using WeasyPrint or ReportLab | `[ ]` |
| T3.1.7 | CSV export: `GET /api/v1/orders/export/` and `GET /api/v1/cashbook/export/` | `[ ]` |
| T3.1.T1 | Creating second `BusinessProfile` raises `ValidationError` | `[ ]` |
| T3.1.T2 | `PATCH` by non-admin → 403 | `[ ]` |
| T3.1.T3 | PDF export returns `Content-Type: application/pdf` | `[ ]` |
| T3.2.1 | `Settings.jsx` with tabs: Business Profile, Invoice Template, GST, Data Export | `[ ]` |
| T3.2.2 | Business profile form with logo upload preview | `[ ]` |
| T3.2.3 | "Export PDF" + "Export CSV" buttons on order detail and cashbook pages | `[ ]` |
| T3.2.4 | Wire `/settings` route (admin only) | `[ ]` |
| T3.2.T1 | Settings form renders existing data; saving sends PATCH; non-admin sees read-only | `[ ]` |

---

### Phase 4 — Inventory & Stock Tracking (NOT STARTED)

| Task | Description | Status |
|---|---|---|
| T4.1.1 | Add `stock_quantity` (default=0) and `low_stock_threshold` (default=10) to `Product` | `[ ]` |
| T4.1.2 | `StockMovement` model: product FK, type IN/OUT, quantity, order FK (nullable), purchase FK (nullable), note | `[ ]` |
| T4.1.3 | Migrations | `[ ]` |
| T4.1.4 | Signal: order confirm → OUT `StockMovement` per item; purchase confirm → IN `StockMovement` per item | `[ ]` |
| T4.1.5 | `GET /api/v1/products/low-stock/` — products where `stock_quantity ≤ low_stock_threshold` | `[ ]` |
| T4.1.6 | `GET /api/v1/products/{id}/stock-movements/` — paginated movement history | `[ ]` |
| T4.1.T1 | Confirm order with 5 units → `stock_quantity` reduces by 5 | `[ ]` |
| T4.1.T2 | Low-stock endpoint excludes products above threshold | `[ ]` |
| T4.1.T3 | `StockMovement` count equals `OrderItem` count after confirm | `[ ]` |
| T4.2.1 | `stock_quantity` column in Products list page | `[ ]` |
| T4.2.2 | Low-stock badge on product cards when below threshold | `[ ]` |
| T4.2.3 | `StockMovementsDrawer.jsx` — IN/OUT timeline per product | `[ ]` |
| T4.2.4 | Low-stock alert cards on Dashboard | `[ ]` |
| T4.2.T1 | Product with `stock=5, threshold=10` shows low-stock badge | `[ ]` |

---

### Phase 5 — Collections & Staff Activity (NOT STARTED)

| Task | Description | Status |
|---|---|---|
| T5.1.1 | `GET /api/v1/customers/pending-collections/` — customers with `outstanding_balance > 0`, ordered by amount | `[ ]` |
| T5.1.2 | `POST /api/v1/customers/{id}/send-reminder/` — WhatsApp deep-link or Business API template | `[ ]` |
| T5.1.3 | `due_date` field on `Order` for credit orders | `[ ]` |
| T5.1.4 | `UserActivityLog` model: user FK, action, object_type, object_id, metadata JSON, timestamp | `[ ]` |
| T5.1.5 | Middleware/signal to auto-log critical actions (order confirm, payment, price change, delete) | `[ ]` |
| T5.1.6 | `GET /api/v1/staff/activity-logs/` (manager+ only, filterable by user and date) | `[ ]` |
| T5.1.T1 | Creating an order generates a `UserActivityLog` entry with correct metadata | `[ ]` |
| T5.1.T2 | Pending-collections excludes customers with balance = 0 | `[ ]` |
| T5.1.T3 | Activity log by cashier → 403 | `[ ]` |
| T5.2.1 | `Collections.jsx` — overdue balances list + "Send WhatsApp Reminder" button | `[ ]` |
| T5.2.2 | Overdue badge on order rows where `due_date < today` and status is credit | `[ ]` |
| T5.2.3 | `StaffActivity.jsx` — paginated action log (admin/manager only) | `[ ]` |
| T5.2.4 | Wire `/collections`, `/staff/activity` routes | `[ ]` |
| T5.2.T1 | Reminder button constructs correct `wa.me/<phone>?text=...` deep-link | `[ ]` |
| T5.2.T2 | Cashier role does not see StaffActivity link in nav | `[ ]` |
| TCC.6 | Add Celery + Redis for async WhatsApp/email dispatch (non-blocking) | `[ ]` |

---

### Phase 6 — Internationalisation & Onboarding (NOT STARTED)

| Task | Description | Status |
|---|---|---|
| T6.1.1 | `USE_I18N=True`, `LocaleMiddleware`, `LANGUAGE_CODE` in settings | `[ ]` |
| T6.1.2 | `gettext` strings on model verbose names and API error messages | `[ ]` |
| T6.1.3 | `.po`/`.mo` locale files: `en`, `hi` (Hindi), `mr` (Marathi) | `[ ]` |
| T6.1.4 | `GET /api/v1/config/languages/` — available languages list | `[ ]` |
| T6.1.5 | `preferred_language` field on `User` model | `[ ]` |
| T6.1.T1 | API error messages return in Hindi when `Accept-Language: hi` is set | `[ ]` |
| T6.2.1 | Install `react-i18next`; create `en.json`, `hi.json`, `mr.json` translation files | `[ ]` |
| T6.2.2 | `OnboardingWizard.jsx` — step 1: language, step 2: business name, step 3: profile photo | `[ ]` |
| T6.2.3 | Show wizard on first login only (localStorage flag or `is_onboarded` API field) | `[ ]` |
| T6.2.4 | Language toggle in Settings page and nav header | `[ ]` |
| T6.2.5 | Wrap all existing UI strings in `t()` | `[ ]` |
| T6.2.T1 | Switching to Hindi re-renders nav labels in Hindi | `[ ]` |
| T6.2.T2 | Wizard shows on first login; does not show on subsequent logins | `[ ]` |

---

### Phase 7 — AI & Advanced Features (NOT STARTED)

| Task | Description | Status |
|---|---|---|
| T7.1.1 | `POST /api/v1/purchases/scan-invoice/` — image upload → AWS Textract / Google Vision OCR | `[ ]` |
| T7.1.2 | Parse OCR output → pre-fill `PurchaseInvoice` draft fields | `[ ]` |
| T7.1.3 | `ScanInvoiceButton.jsx` — camera/file upload → parsed draft for user confirmation | `[ ]` |
| T7.1.T1 | Mock OCR response → assert correct field mapping to invoice draft | `[ ]` |
| T7.2.1 | `GET /api/v1/reports/gst/?period=YYYY-MM` — GSTR-1 format (B2B, B2C, HSN summary) | `[ ]` |
| T7.2.2 | Export as GST portal JSON + Excel (openpyxl) | `[ ]` |
| T7.2.3 | `GSTReport.jsx` — period picker + download button | `[ ]` |
| T7.2.T1 | GST report for known period returns correct taxable value, CGST, SGST totals | `[ ]` |
| T7.3.1 | `GET /api/v1/products/{id}/forecast/` — 30-day moving average → days-to-stockout | `[ ]` |
| T7.3.2 | Forecast chip on product detail page | `[ ]` |
| T7.3.T1 | 10 units/day OUT rate + stock=150 → forecast returns 15 days | `[ ]` |
| T7.4.1 | Supplier credit score algorithm: on-time ratio weighted by invoice size | `[ ]` |
| T7.4.2 | `GET /api/v1/suppliers/{id}/credit-score/` | `[ ]` |
| T7.4.3 | Score badge on `SupplierDetail.jsx` | `[ ]` |
| T7.4.T1 | 10/10 on-time → score 100; 5/10 → ~50 | `[ ]` |

---

### Cross-Cutting Concerns (all phases)

| Task | Description | Status |
|---|---|---|
| TCC.1 | All new endpoints: `IsAuthenticated` + role checks | `[ ]` |
| TCC.2 | All new models extend `AuditModel` | `[ ]` |
| TCC.3 | Every new endpoint has a throttle class | `[ ]` |
| TCC.4 | Maintain ≥ 80% test coverage on new code per phase | `[ ]` |
| TCC.5 | Update `docker-compose.yml` for new deps (WeasyPrint, openpyxl, Celery, Redis) | `[ ]` |
| TCC.6 | Celery + Redis for async task dispatch | `[ ]` |

---

### Progress Summary

| Phase | Status | Tasks Done | Tasks Remaining |
|---|---|---|---|
| 1 — Cashbook | COMPLETE | 16/16 | 0 |
| 2 — Suppliers | COMPLETE | 18/18 | 0 |
| 3 — Settings | Not started | 0/15 | 15 |
| 4 — Inventory | Not started | 0/14 | 14 |
| 5 — Collections | Not started | 0/16 | 16 |
| 6 — i18n | Not started | 0/13 | 13 |
| 7 — AI/Advanced | Not started | 0/14 | 14 |
| Cross-cutting | Not started | 0/6 | 6 |
| **Total** | | **34/96** | **62** |
