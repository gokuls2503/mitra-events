# Mitra Events Management

Public website + admin system (CRM, Tally-style accounting & billing, dashboards)
for Mitra Events Management, Coimbatore.

- **backend/** — Django 5.2 + Django REST Framework, PostgreSQL
- **frontend/** — React 19 + TypeScript (Vite), Tailwind CSS

No Docker: everything runs directly on the machine.

## Prerequisites

- Python 3.12+ (developed on 3.14)
- Node 20+
- PostgreSQL 15+ running locally

## Backend setup

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env            # then set DJANGO_SECRET_KEY and DATABASE_URL
createdb mitra_events
.venv/bin/python manage.py migrate
.venv/bin/python manage.py seed_users      # dev only: one demo login per role
.venv/bin/python manage.py seed_website    # dev only: PLACEHOLDER site content + generated images
.venv/bin/python manage.py seed_crm        # dev only: demo leads, follow-ups and bookings ("Demo Lead N")
.venv/bin/python manage.py seed_ops        # dev only: demo vendors, event teams, checklists (run after seed_crm)
.venv/bin/python manage.py runserver       # http://127.0.0.1:8000
```

Run tests: `.venv/bin/pytest`

API docs (Swagger): http://127.0.0.1:8000/api/docs/

## Frontend setup

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173 — proxies /api and /media to Django
```

- Public site: http://localhost:5173/
- Admin: http://localhost:5173/admin

### Production build (pre-rendered for SEO)

```bash
cp .env.example .env    # set VITE_SITE_URL to the real domain
npm run build           # Django must be running: pages are rendered with live content
npm run preview         # http://localhost:4173 — serves dist/ exactly as production should
```

`npm run build` type-checks, builds the browser bundle, then renders every public page
(including one page per service) to static HTML with real titles, descriptions, Open Graph
tags and schema.org data, and writes `sitemap.xml` and `robots.txt`.

The web server must route like `npm run preview` does (see `vite.config.ts`):

| Request | Serve |
|---|---|
| `/admin/*` | `dist/spa.html` (the admin is never pre-rendered) |
| `/api/*`, `/media/*` | Django |
| a public path with `dist/<path>/index.html` | that file |
| anything else | `dist/404.html` with status 404 |

Content edited in the admin shows up for visitors immediately (pages refetch on load);
search engines see it after the next `npm run build`.

## Demo logins (after `seed_users`)

| Role | Email | Password |
|---|---|---|
| Owner | owner@mitra.local | Mitra@2026 |
| Manager | manager@mitra.local | Mitra@2026 |
| Staff | staff@mitra.local | Mitra@2026 |
| Accountant | accounts@mitra.local | Mitra@2026 |

`seed_users` refuses to run unless `DJANGO_DEBUG=True`. Never use these in production.

## Auth design

- Login returns a 15-minute **access token** (kept in memory only) and sets a 7-day
  **refresh token** as an `httpOnly` cookie scoped to `/api/v1/auth/`.
- Refresh tokens rotate on every use; the old one is blacklisted. Logout blacklists too.
- Roles: `OWNER`, `MANAGER`, `STAFF`, `ACCOUNTANT`. Backend enforcement lives in
  `apps/core/permissions.py`; the frontend hides nav items per role (`src/admin/layout/nav.ts`)
  but the API is the source of truth.
- Users are deactivated, never deleted (keeps history for invoices, leads, etc.).

## Website content

Owner and Manager edit everything on the public site under **Admin → Website content**:
site settings and contact details, services, packages, gallery, testimonials and the cost
estimator's prices. `seed_website` content is placeholder only. Before launch, replace the
contact details, images and especially the testimonials (only publish genuine reviews).

Enquiries from the website (contact form, service pages, estimator) create a `Lead` with
status *New* in the CRM. There are no email/WhatsApp alerts (owner's choice for now); the
sidebar shows a live count of new leads instead.

## CRM (Admin → Leads & clients, Events & bookings)

- **Pipeline:** New → Contacted → Meeting / site visit → Quotation sent → Negotiation → Won / Lost.
  Drag cards on the board, or use the stage bar on a lead. *Lost* needs a reason. *Won* only
  happens by **converting** the lead, which creates the client (matched by phone number, so
  repeat customers aren't duplicated) and a booking numbered per financial year, e.g. `BK/2026-27/0001`.
- **Timeline:** every lead keeps an automatic history (created, status changes, assignment,
  follow-ups, conversion) plus notes, calls, WhatsApp and meetings logged by staff.
- **Follow-ups:** scheduled per lead; the Follow-ups tab shows Overdue / Today / Upcoming / Done.
  Losing or converting a lead clears its pending follow-ups.
- **Bookings** are never deleted — cancel them instead, so history (and later invoices) stays intact.

| | Owner / Manager | Staff | Accountant |
|---|---|---|---|
| Leads | all; assign, delete, convert | only leads assigned to them; work them (status, notes, follow-ups); new leads are self-assigned | read-only |
| Clients | all; add / edit | only clients from their leads or events | read-only |
| Events | all; create, edit, cancel | only events they coordinate (read) | read-only |

Enforced in the API (`apps/crm/views.py`); the UI just hides what a role can't do.

Public form protection: a hidden honeypot field, 20 enquiries/hour per IP, and phone
numbers normalised to `+91XXXXXXXXXX`.

## Operations (Admin → Dashboard, Tasks & vendors, event pages)

- **Dashboard** (home page after login) is role-aware: managers see team-wide counts, new
  enquiries waiting for a first call, events this week with prep progress, and events with no
  coordinator; staff see only their own events, tasks and follow-ups. Refreshes every minute.
- **Event page** has *Team & vendors* (who works the event, reporting times, vendor costs, and a
  warning if someone is already booked on an overlapping date) and *Tasks*.
- **Add standard checklist** creates the usual prep tasks dated back from the event day and
  assigned to the coordinator. The list lives in `apps/operations/services.py` (`STANDARD_CHECKLIST`).
- **Event sheet** prints a clean run sheet for the team (venue, timings, team & vendor phone
  numbers, checklist). Prices and vendor costs are left off the printout.
- **Vendors** can't be deleted once they've worked an event — mark them inactive instead.

Staff can see events they coordinate **or** are assigned to, add tasks for themselves and tick
off their own tasks. Assigning people and vendors is owner/manager only.

## Accounts & billing (Admin → Accounts & billing)

Mitra's own Tally-style, double-entry books — no Tally integration.

**First-time setup (Owner or Accountant): Accounts → Settings.** Enter the GSTIN (required
before any invoice can be issued), PAN, address, bank & UPI details, document prefixes,
default SAC/GST rate, due days and default terms. Everything is editable later.
Then add opening balances on ledgers (Accounts → Ledgers): bank, cash, capital, and any
amounts clients owe or Mitra owes vendors on the start date.

- **Quotations** → convert to a **draft invoice** → **Issue** (gets the next number, e.g.
  `INV/2026-27/0001`, locks it and posts it to the books). Numbers restart every April and
  are never reused; issued invoices are cancelled, not deleted or edited.
- **GST**: CGST + SGST when the place of supply is Mitra's state, IGST otherwise; totals
  round to the rupee via a Round Off ledger. Invoice PDFs include the GST breakup by rate,
  amount in words (lakh/crore) and bank/UPI details.
- **Receipts** can be applied to one or more invoices, or held as an advance and applied later.
- **Expenses** (optionally with GST input credit, a vendor, an event and a bill photo/PDF).
  Unpaid vendor bills show under Payables; pay them with a Payment voucher.
- **Vouchers**: every document posts a balanced journal entry automatically; manual Payment,
  Receipt, Contra and Journal vouchers cover everything else. Unbalanced entries are refused.
- **Reports** (Owner/Accountant): Profit & loss, Balance sheet, Trial balance, GST summary
  (outward/inward, net payable), Receivables with ageing, Payables, Day book — all exportable
  to Excel. Ledger statements export too.
- **Event page → Billing** shows quoted / invoiced / received / spent, and margin
  (owner/accountant only).

| | Owner / Accountant | Manager | Staff |
|---|---|---|---|
| Quotations | full | full | — |
| Invoices, receipts, expenses, ledgers, vouchers | full | view | — |
| Reports, margins | yes | — | — |
| Settings | edit | view | — |

PDFs use WeasyPrint, which needs Pango on the server (`brew install pango` on macOS;
`apt install libpango-1.0-0 libpangoft2-1.0-0` on Debian/Ubuntu).

## Business analytics (Admin → Business analytics)

One page for how the business is doing, for any period (this month, last month, this
quarter — Indian FY quarters — this/last financial year, or custom dates), compared with the
**same period last year** by default (events are seasonal) or the immediately previous period.

- **Key figures:** revenue (excl. GST), profit & margin, expenses, collected, bookings
  (count, booked value, average) and lead conversion — each with its change.
- **Charts:** revenue vs expenses by month, bookings per month, where this period's leads
  are now, lead sources with conversion, top event types by booked value. Every chart has a
  "Show as table" view; the whole overview exports to Excel.
- **Tables:** top clients (with amounts still due), team performance, why leads were lost.

Revenue, expenses and profit come from the same journal as the P&L report, so the two
always agree. Owner sees everything; Manager sees everything except expenses, profit and
margins; Accountant sees the money and bookings sections; Staff has no access.

## Settings

`config/settings/{base,dev,prod}.py`. `manage.py` defaults to `dev`; production must set
`DJANGO_SETTINGS_MODULE=config.settings.prod`.
