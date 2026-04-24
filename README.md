# WA Automation Backend

Node.js/Express backend for a WhatsApp automation SaaS platform.

This service provides:

- Authentication and session management
- Business onboarding support
- Customer and campaign services
- WhatsApp webhook and messaging integrations

## Tech Stack

- Runtime: Node.js (ESM)
- Framework: Express 5
- Database: MongoDB + Mongoose
- Auth: JWT access/refresh token model
- Validation: express-validator
- Queue/Jobs: BullMQ (with Upstash Redis)
- Email: Nodemailer (Gmail App Password)
- Testing: Mocha + Chai + Supertest

## Project Structure

```text
app.js
server.js
src/
  config/
  controllers/
  lib/
  middlewares/
  models/
  routes/
  services/
  utils/
pm-collection/
seed/
tests/
```

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Create a `.env` file in project root.

Important: the code expects `JWT_ACCESS_SECRET` (not `JWT_SECRET`).

Example values:

```env
PORT=5000
NODE_ENV=development
ALLOW_LOCAL_ORIGINS=true

MONGODB_URI=mongodb://127.0.0.1:27017/wa_automation

JWT_ACCESS_SECRET=replace_with_strong_access_secret
JWT_REFRESH_SECRET=replace_with_strong_refresh_secret
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRY_DAYS=7
BCRYPT_SALT_ROUNDS=12

WA_TOKEN=replace_with_meta_token
WA_PHONE_ID=replace_with_phone_id
WEBHOOK_VERIFY_TOKEN=replace_with_webhook_verify_token

CLIENT_URL=http://localhost:5173

ANTHROPIC_API_KEY=

UPSTASH_REDIS_URL=
UPSTASH_REDIS_TOKEN=

GMAIL_USER=you@gmail.com
GMAIL_APP_PASSWORD=replace_with_gmail_app_password
EMAIL_FROM="WA Automation <you@gmail.com>"
```

### 3. Run the server

Development:

```bash
npm run dev
```

Production mode:

```bash
npm start
```

Health check:

- `GET /`
- `GET /api/health`

## Scripts

- `npm start` - start server
- `npm run dev` - start with nodemon
- `npm run seed` - seed categories
- `npm test` - run tests

## API Base Paths

Current mounted auth base path:

- `/api/v1/auth`

## Authentication Overview

- Access token: short-lived JWT, sent in `Authorization: Bearer <token>`
- Refresh token: long-lived JWT, stored hashed in DB
- Refresh token transport:
  - `refreshToken` httpOnly cookie
  - `x-refresh-token` header (fallback)
  - `refreshToken` request body field (fallback)

### Core Auth Endpoints

Public:

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/verify-email/:token`
- `POST /api/v1/auth/forgot-password`
- `POST /api/v1/auth/reset-password`

Protected:

- `GET /api/v1/auth/me`
- `POST /api/v1/auth/logout-all`
- `POST /api/v1/auth/resend-verification`
- `POST /api/v1/auth/change-password`
- `GET /api/v1/auth/sessions`

## CORS and Cookies

- CORS credentials are enabled.
- Refresh cookie is scoped to `/api/v1/auth`.
- In production:
  - `secure: true`
  - `sameSite: strict`
- In development:
  - `secure: false`
  - `sameSite: lax`

## Postman

A collection exists at:

- `pm-collection/auth.collection.json`

Suggested flow:

1. Register
2. Verify Email
3. Login
4. Refresh Token
5. Protected route tests (`/me`, `/sessions`)

## Detailed Auth Documentation

For complete auth logic and security behavior, see:

- `docs/auth/README.md`

## Troubleshooting

### Refresh token returns invalid/expired

Check in order:

1. `JWT_REFRESH_SECRET` matches the secret used when tokens were issued.
2. Request sends refresh token via cookie/header/body fallback.
3. Cookie path is `/api/v1/auth`.
4. Token not already rotated/reused.
5. User token version was not invalidated by logout-all/password changes.

### Startup fails with missing env var

`src/lib/env.js` enforces required variables and throws on missing keys. Ensure all required entries are present in `.env`.

## License

ISC
