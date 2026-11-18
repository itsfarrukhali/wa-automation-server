# Production smoke tests

The smoke suite checks the deployed Zario frontend and backend without changing
business data. Public checks always run. Read-only authenticated checks run only
when dedicated smoke-account credentials are provided.

## Run locally

The production URLs are configured as safe public defaults:

```powershell
npm run smoke:prod
```

To test another deployment:

```powershell
$env:SMOKE_FRONTEND_URL="https://example.vercel.app"
$env:SMOKE_BACKEND_URL="https://example.onrender.com"
npm run smoke:prod
```

## Authenticated checks

Use a dedicated verified owner account with no privileged admin role. Never put
its password in the repository or a committed `.env` file.

```powershell
$env:SMOKE_EMAIL="smoke@example.com"
$env:SMOKE_PASSWORD="use-a-password-manager"
npm run smoke:prod
```

Authenticated checks log in, verify the current user, WhatsApp connection,
templates and inbox, then log out to remove the temporary refresh session. They
do not send WhatsApp messages or modify customer/business records.

## GitHub Actions

The `Production smoke tests` workflow runs every six hours and can also be run
manually from the repository Actions tab. Public checks need no secrets.

To enable authenticated checks, add these repository Actions secrets:

- `SMOKE_EMAIL`
- `SMOKE_PASSWORD`

If both secrets are absent, authenticated checks are reported as skipped. If
only one is configured, the workflow fails because the configuration is
incomplete.
