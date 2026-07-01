# Zario Backend — WhatsApp Automation SaaS

Zario is a multi-tenant WhatsApp automation backend for service businesses such
as salons, clinics, consultants, and appointment-based shops. It manages
customers, services, bookings, WhatsApp conversations, automations, reminders,
campaigns, staff, billing, reports, and platform administration.

The backend is built with:

- Node.js / Express
- MongoDB / Mongoose
- JWT auth with refresh-token rotation
- Meta WhatsApp Cloud API
- Winston structured logs
- Postman manual QA collections
- Mocha automated tests

## Current completion status

Approximate status as of this build:

| Area | Status |
|---|---:|
| Core backend APIs | 92–95% |
| WhatsApp automation backend | 82–88% |
| SaaS/admin/business backend | 85–90% |
| Deployment readiness | 85–90% |
| Real production SaaS readiness | 75–80% |

The remaining work mostly depends on external approval/credentials:

- Meta Embedded Signup / Tech Provider flow
- real payment gateway provider integration
- real provider billing webhooks
- live deployment smoke testing

## Completed backend modules

- Authentication and sessions
- Email verification and password reset
- Superadmin and admin management
- Business onboarding
- Business profile/settings/working hours/engagement
- Customer management and import
- Service catalog and import
- Booking lifecycle and payments
- Staff/team management
- WhatsApp Cloud API messaging
- WhatsApp webhooks for inbound messages and delivery statuses
- WhatsApp inbox/conversation APIs
- Automation rules and keyword replies
- Opt-out handling
- Scheduler APIs and background scheduler worker
- Campaign management
- WhatsApp template registry and Meta template sync
- Billing/subscription MVP
- Reports/analytics
- Audit logs
- Rate limiting
- Structured production logs
- MongoDB backup/restore scripts
- Deployment configs for Render/Docker

## API base paths

```text
GET  /
GET  /api/health
GET  /api/ready

/api/v1/auth
/api/v1/business
/api/v1/customers
/api/v1/services
/api/v1/bookings
/api/v1/staff
/api/v1/messages
/api/v1/webhooks
/api/v1/automation-rules
/api/v1/scheduler
/api/v1/campaigns
/api/v1/whatsapp/templates
/api/v1/reports
/api/v1/billing
/api/v1/admin
/api/v1/superadmin
```

Full endpoint testing guide:

- [docs/API_TESTING_GUIDE.md](docs/API_TESTING_GUIDE.md)

Production checklist:

- [docs/PRODUCTION_CHECKLIST.md](docs/PRODUCTION_CHECKLIST.md)

## Local setup

```powershell
npm install
copy .env.example .env
npm run dev
```

Health checks:

```text
GET http://localhost:3000/api/health
GET http://localhost:3000/api/ready
```

If your local port is `5000`, use:

```text
http://localhost:5000
```

## Required environment variables

Minimum local/dev:

```env
NODE_ENV=development
PORT=3000
MONGODB_URI=
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRY_DAYS=7
BCRYPT_SALT_ROUNDS=12
CLIENT_URL=http://localhost:3000
GMAIL_USER=
GMAIL_APP_PASSWORD=
```

WhatsApp:

```env
WA_TOKEN=
WA_PHONE_ID=
WHATSAPP_GRAPH_VERSION=v20.0
WEBHOOK_VERIFY_TOKEN=
WHATSAPP_ENCRYPTION_KEY=
```

Scheduler/rate limiting:

```env
ENABLE_SCHEDULER_WORKER=false
SCHEDULER_INTERVAL_SECONDS=60
SCHEDULER_BATCH_LIMIT=25
SCHEDULER_LOCK_SECONDS=120

RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=300
AUTH_RATE_LIMIT_MAX=20
WHATSAPP_RATE_LIMIT_MAX=60
```

Superadmin:

```env
SUPERADMIN_EMAIL=
SUPERADMIN_PASSWORD=
SUPERADMIN_NAME=Zario Super Admin
SUPERADMIN_USERNAME=superadmin
```

Validate production env:

```powershell
npm run validate:prod-env
```

## Scripts

```powershell
npm run dev
npm start
npm test
npm run validate:prod-env
npm run reset:superadmin
npm run repair:message-index
npm run backup:mongo
npm run restore:mongo -- backups/<backup-folder>
```

## Postman collections

Import from `pm-collection/`:

- `auth.collection.json`
- `business.collection.json`
- `admin.collection.json`
- `core-workflow.collection.json`
- `whatsapp-flow.collection.json`
- `automation-inbox-flow.collection.json`
- `scheduler-workflow.collection.json`
- `campaign-workflow.collection.json`
- `template-workflow.collection.json`
- `staff-workflow.collection.json`
- `report-workflow.collection.json`
- `billing-workflow.collection.json`

Recommended variables:

```text
baseUrl=http://localhost:3000
zario_access_token=<login access token>
```

## Deployment recommendation

Recommended architecture:

```text
Frontend: Next.js on Vercel
Backend: Render / Railway / Fly.io / DigitalOcean
Database: MongoDB Atlas
```

Do not deploy this Express backend as Vercel Functions for production because it
has:

- long-running Express server
- WhatsApp webhooks
- background scheduler worker
- MongoDB persistent connection

For Render, this repo includes:

- `render.yaml`
- `Dockerfile`
- `.dockerignore`

Use:

```text
Health check path: /api/ready
Build command: npm ci
Start command: npm start
```

Recommended Render instance:

- Minimum pilot: Starter `$7/mo`, 512 MB RAM, 0.5 CPU
- Better production pilot: Standard `$25/mo`, 2 GB RAM, 1 CPU

For this backend, Standard is the safer first production choice because of
MongoDB connection, WhatsApp webhooks, scheduler worker, logs, and API traffic.
Starter can work for a very small pilot, but 512 MB may become tight.

## WhatsApp production path

Current backend supports manual WhatsApp connection:

- WABA ID
- phone number ID
- display phone number
- encrypted access token
- templates
- webhook events

For scalable SaaS, each customer business should eventually connect its own
WABA/phone number through Embedded Signup. That depends on Meta readiness and
business verification/approval.

Production webhook URL:

```text
https://api.yourdomain.com/api/v1/webhooks/whatsapp
```

Verify token:

```text
same value as WEBHOOK_VERIFY_TOKEN
```

## Billing path

Current billing is MVP/manual:

- plan catalog
- checkout intent
- manual payment confirmation
- subscription status
- cancellation/downgrade

Real payment gateway integration is intentionally pending until merchant/API
credentials are available.

Recommended Pakistan path:

1. Use manual billing for pilot customers.
2. Apply for PayFast/Safepay/bSecure/JazzCash/Easypaisa merchant access.
3. Add provider module after credentials and webhook docs are available.

## Production operations

Available now:

- audit logs: `GET /api/v1/admin/audit-logs`
- log files: `GET /api/v1/admin/logs`
- log tail: `GET /api/v1/admin/logs/tail?file=app.log&lines=200`
- rate limiting
- request IDs
- structured logs in `logs/app.log` and `logs/error.log`
- MongoDB backup/restore scripts

## Testing status

Recent checks performed:

```text
focused regression: 29 passing
full npm test: passed
app import check: passed
git diff --check: passed
production env validation: passed with placeholder env
```

## Still pending for 100% real-world SaaS

Blocked by external approvals/credentials:

- Meta Embedded Signup / Tech Provider onboarding
- real payment gateway API integration
- provider payment webhooks
- real WhatsApp registered number testing
- production deployment smoke test

Can be added after deployment:

- Redis-backed distributed rate limits
- external log shipping
- uptime monitoring
- cloud backup automation
- frontend dashboard in Next.js
