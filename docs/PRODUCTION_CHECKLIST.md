# Zario Production Checklist

This is the final checklist before deploying and selling Zario as a SaaS
platform.

## 1. Current project status

| Area | Status |
|---|---:|
| Backend core modules | 92–95% done |
| WhatsApp backend | 82–88% done |
| SaaS/backend platform readiness | 85–90% done |
| Deployment readiness | 85–90% done |
| Real-world SaaS readiness | 75–80% done |

## 2. What is completed

- Auth/session system
- Owner/staff/admin/superadmin roles
- Business onboarding
- Customer, service, booking modules
- Booking payments
- Staff/team management
- WhatsApp Cloud API messaging
- WhatsApp webhooks
- Inbox/conversation APIs
- Automation rules
- Reminder/follow-up scheduler
- Background worker with MongoDB lock
- Campaigns
- WhatsApp templates and Meta sync
- Billing MVP
- Reports
- Audit logs
- Rate limiting
- Structured logs
- Backup/restore scripts
- Dockerfile
- Render deployment config
- Postman collections
- Full test suite passing

## 3. What is still pending

Blocked by external paperwork/credentials:

- Real payment gateway integration
- Payment provider webhooks
- Meta Embedded Signup / Tech Provider flow
- Business verification / app review if required by Meta
- Production WhatsApp registered number testing

Can be done after deployment:

- external monitoring dashboard
- Redis-backed distributed rate limiting
- cloud backup automation
- frontend dashboard in Next.js

## 4. Required production environment variables

```env
NODE_ENV=production
PORT=5000
MONGODB_URI=
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRY_DAYS=7
BCRYPT_SALT_ROUNDS=12
CLIENT_URL=https://app.yourdomain.com
GMAIL_USER=
GMAIL_APP_PASSWORD=
EMAIL_FROM=
```

Security:

```env
RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=300
AUTH_RATE_LIMIT_MAX=20
WHATSAPP_RATE_LIMIT_MAX=60
```

WhatsApp:

```env
WA_TOKEN=
WA_PHONE_ID=
WHATSAPP_GRAPH_VERSION=v20.0
WEBHOOK_VERIFY_TOKEN=
WHATSAPP_ENCRYPTION_KEY=
```

Scheduler:

```env
ENABLE_SCHEDULER_WORKER=true
SCHEDULER_INTERVAL_SECONDS=60
SCHEDULER_BATCH_LIMIT=25
SCHEDULER_LOCK_SECONDS=120
```

Superadmin:

```env
SUPERADMIN_EMAIL=
SUPERADMIN_PASSWORD=
SUPERADMIN_NAME=Zario Super Admin
SUPERADMIN_USERNAME=superadmin
```

Validate:

```powershell
npm run validate:prod-env
```

## 5. Meta WhatsApp checklist

Development:

- Meta developer app created
- WhatsApp product added
- Test number claimed
- Test recipient added
- Test message sent
- Test webhook payloads checked

Production:

- HTTPS backend deployed
- Callback URL configured:

```text
https://api.yourdomain.com/api/v1/webhooks/whatsapp
```

- Verify token configured:

```text
same value as WEBHOOK_VERIFY_TOKEN
```

- Subscribe to `messages`
- Register real WhatsApp business phone number
- Generate permanent/system-user access token
- Add payment method in Meta
- Create approved templates
- Test from real registered number
- Publish/live app if Meta requires it

Later SaaS scaling:

- Embedded Signup
- per-business WABA connection
- per-business phone number selection
- per-business template sync
- webhook routing by `phone_number_id`

## 6. Payment checklist

Ready now:

- manual billing
- checkout intent
- manual payment confirmation
- plan activation
- cancellation/downgrade

Before real payment integration:

- choose provider
- get merchant ID
- get secret/integrity key
- get sandbox credentials
- get production credentials
- get webhook/IPN docs
- confirm signature verification method
- confirm refund/settlement process

Recommended Pakistan path:

1. Start with manual billing for pilots.
2. Apply for PayFast/Safepay/bSecure/JazzCash/Easypaisa.
3. Integrate whichever gives working API credentials fastest.

## 7. Deployment recommendation

Frontend:

```text
Next.js on Vercel
```

Backend:

```text
Render / Railway / Fly.io / DigitalOcean
```

Do not use Vercel Functions for this Express backend because it needs an
always-on process for webhooks, scheduler worker, and MongoDB connection reuse.

Render recommendation:

| Instance | Use |
|---|---|
| Free 512 MB / 0.1 CPU | only temporary testing |
| Starter 512 MB / 0.5 CPU | very small pilot |
| Standard 2 GB / 1 CPU | recommended production pilot |
| Pro 4 GB / 2 CPU | when traffic grows |

For your project, choose Standard if budget allows. Starter can work for early
private pilot, but Standard is safer for WhatsApp webhooks, scheduler, logs, and
future frontend traffic.

## 8. Production deployment steps

1. Push code to GitHub.
2. Create MongoDB Atlas production cluster.
3. Create Render backend service.
4. Add environment variables.
5. Set health check path:

```text
/api/ready
```

6. Deploy backend.
7. Confirm:

```text
GET /api/health
GET /api/ready
```

8. Deploy Next.js frontend to Vercel.
9. Set backend `CLIENT_URL` to frontend URL.
10. Configure Meta webhook callback URL.
11. Test webhook verification.
12. Connect real WhatsApp number.
13. Run Postman smoke tests.
14. Enable scheduler worker.

## 9. Backup/restore

Install MongoDB Database Tools.

Backup:

```powershell
$env:MONGODB_URI="mongodb+srv://..."
npm run backup:mongo
```

Restore:

```powershell
$env:MONGODB_URI="mongodb+srv://..."
npm run restore:mongo -- backups/<backup-folder>
```

Restore with drop:

```powershell
npm run restore:mongo -- backups/<backup-folder> --drop
```

## 10. Final smoke test before selling

Run these manually:

- Register owner
- Verify email
- Business onboarding
- Create customer
- Create service
- Create booking
- Confirm booking
- Send WhatsApp message
- Receive WhatsApp reply webhook
- Create automation rule
- Create template
- Create campaign dry-run
- Create staff account
- Activate paid plan manually
- Check reports
- Check audit logs
- Check scheduler worker status

## 11. GitHub/deployment rule

Before every push/deploy:

```powershell
npm test
npm run validate:prod-env
git diff --check
```
