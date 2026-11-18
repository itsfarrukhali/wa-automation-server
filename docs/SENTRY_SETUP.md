# Sentry monitoring setup

Zario uses separate Sentry projects for the backend and frontend so errors,
releases and performance data remain independently searchable.

## 1. Create the projects

Create one Sentry organization and these projects:

1. `zario-backend` using the Node.js / Express platform.
2. `zario-frontend` using the Next.js platform.

Copy the DSN shown in each project's settings. A DSN is a client routing
identifier, not an account password. The Sentry auth token used for source-map
uploads is secret and must never be committed or exposed to the browser.

## 2. Render backend variables

Add these variables to the backend service:

```text
SENTRY_DSN=<zario-backend DSN>
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.05
```

Deploy the backend after saving them. A 5% trace sample keeps startup usage low;
all uncaught 5xx exceptions are still eligible for error reporting.

## 3. Vercel frontend variables

Add these variables for the Production environment:

```text
NEXT_PUBLIC_SENTRY_DSN=<zario-frontend DSN>
NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
SENTRY_DSN=<zario-frontend DSN>
SENTRY_ENVIRONMENT=production
SENTRY_ORG=<Sentry organization slug>
SENTRY_PROJECT=zario-frontend
```

Redeploy the frontend after saving them.

`SENTRY_AUTH_TOKEN` is optional for the first deployment. Add it later as a
Vercel secret to upload source maps and get readable production stack traces.
The token must be created in Sentry with only the permissions needed for release
and source-map uploads.

## 4. Privacy defaults

The integration deliberately:

- does not attach the authenticated user;
- removes request bodies, cookies, query strings and authorization headers;
- removes URL query parameters;
- disables frontend session replay;
- redacts bearer and Meta-style tokens from backend exception messages;
- captures backend operational 4xx errors only in normal application logs, not
  as Sentry issues.

Never paste customer messages, access tokens or passwords into manual Sentry
events.

## 5. Acceptance test

After both deployments:

1. Confirm the production smoke workflow still passes.
2. In each Sentry project, use its setup page's built-in test-event method.
3. Confirm the event environment is `production`.
4. Confirm no password, cookie, authorization header, query string or WhatsApp
   token is present in the event details.
5. Enable a New Issue email alert for both projects.

Do not create a public endpoint that intentionally throws errors merely to test
Sentry; it would add avoidable production attack surface.
