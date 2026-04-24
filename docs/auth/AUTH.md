# Authentication Logic Documentation

This document explains the authentication and session architecture implemented in this project.

## Contents

- Auth goals
- Token model
- Data model details
- Route map
- End-to-end flows
- Security controls
- Error model
- Refresh token troubleshooting

## 1. Auth Goals

The auth layer is designed to:

- Support secure login/logout for web and API clients
- Use short-lived access tokens and long-lived refresh tokens
- Track multiple active sessions per user/device
- Detect refresh token misuse (replay/reuse)
- Enforce email verification and account activity checks
- Invalidate sessions globally when needed (logout-all, token version bump)

## 2. Token Model

### Access Token

- Signed with `JWT_ACCESS_SECRET`
- Lifetime controlled by `JWT_EXPIRES_IN` (default `15m`)
- Payload includes:
  - `userId`
  - `email`
  - `role`
  - `businessId`
  - `tokenVersion`

Used for protected route authorization through `Authorization: Bearer <token>`.

### Refresh Token

- Signed with `JWT_REFRESH_SECRET`
- Lifetime controlled by `REFRESH_TOKEN_EXPIRY_DAYS` (default `7` days)
- Payload includes:
  - `_id` (user id)
  - `type: "refresh"`
  - `tokenId`
  - `tokenVersion`

The raw refresh token is never stored in DB. The SHA-256 hash of token is stored in `user.refreshTokens`.

## 3. Storage and Session Tracking

Refresh tokens are represented in `User.refreshTokens[]` as:

- `tokenHash`
- `expiresAt`
- `deviceInfo` (`userAgent`, `platform`, `ip`, `lastUsed`)
- `usageCount`

Implementation characteristics:

- Expired refresh token entries are cleaned during issuance.
- Maximum active sessions per user is capped at 5.
- Oldest session is dropped once cap is reached.

## 4. Token Transport

### Access token

Client stores and sends in Authorization header.

### Refresh token

Primary transport:

- httpOnly cookie named `refreshToken`

Fallback transport in controller:

- `x-refresh-token` header
- `refreshToken` field in request body

Cookie settings:

- `path: /api/v1/auth`
- `httpOnly: true`
- `secure: NODE_ENV === "production"`
- `sameSite: strict` in production, `lax` otherwise

## 5. Route Map

Base path: `/api/v1/auth`

### Public routes

- `POST /register`
- `POST /login`
- `POST /refresh`
- `POST /logout`
- `GET /verify-email/:token`
- `POST /forgot-password`
- `POST /reset-password`

### Protected routes

- `GET /me`
- `POST /logout-all`
- `POST /resend-verification`
- `POST /change-password`
- `GET /sessions`

## 6. End-to-End Flows

### A. Register

1. Validate input.
2. Enforce email and username uniqueness.
3. Create user (`role: owner`) and linked business.
4. Generate email verification token.
5. Generate access token + refresh token.
6. Save refresh token hash record.
7. Return user profile and access token.
8. Set refresh cookie.
9. Send verification email asynchronously.

### B. Verify Email

1. Hash incoming token.
2. Find matching user by hash and non-expired verification token.
3. Mark `isEmailVerified = true`.
4. Clear verification token fields.

### C. Login

1. Load user with auth-sensitive fields.
2. Reject if user missing, inactive, unverified, or locked.
3. Compare password.
4. On failure:
   - increment login attempts
   - lock after threshold (5 attempts / 30 min)
5. On success:
   - reset login attempts
   - issue access + refresh tokens
   - persist refresh hash entry

### D. Refresh (Rotation)

1. Read refresh token from cookie/header/body.
2. Verify JWT signature and expiry.
3. Assert payload `type === "refresh"`.
4. Load user with refresh tokens and token version.
5. Validate token version.
6. Validate hashed token exists and not expired.
7. If invalid hash:
   - clear all refresh tokens
   - return security error (possible reuse attack)
8. Remove old refresh token hash (rotation).
9. Issue and store new refresh token hash.
10. Return new access token and set new refresh cookie.

### E. Logout (Single Device)

1. Read refresh token.
2. If token decodes, remove matching hash record.
3. Clear refresh cookie.

### F. Logout All Devices

1. Protected route using access token.
2. Clear all refresh tokens.
3. Increment `tokenVersion`.
4. Clear refresh cookie.

Effect: all old access tokens fail on next protected request because tokenVersion mismatch.

### G. Forgot Password

1. Find user by email.
2. Always return success message, even if email not found (anti-enumeration).
3. For active user:
   - create random reset token
   - store hash + expiry (1 hour)
   - send reset email

### H. Reset Password

1. Hash incoming reset token.
2. Find user with valid non-expired token.
3. Set new password (pre-save hook handles hashing/history checks).
4. Clear reset token fields.
5. Clear all refresh sessions.
6. Return success.

### I. Change Password (Authenticated)

1. Protected and verified-email route.
2. Validate current password.
3. Set new password.
4. Save user (password hook applies).
5. Clear refresh cookie in response.

## 7. Middleware Enforcement

`verifyToken` performs:

1. Authorization header extraction (`Bearer` token)
2. Access token verification
3. User existence and active account check
4. `tokenVersion` comparison against DB value
5. `changedPasswordAfter(iat)` check
6. Attach `req.user`

Additional middleware:

- `requireRole(...roles)` for RBAC
- `requireVerifiedEmail` for email-gated operations
- `optionalAuth` for hybrid guest/auth endpoints

## 8. Password Security

User model pre-save hook:

- Hashes password with bcrypt
- Stores password history hashes
- Blocks reuse of last 3 passwords
- Maintains last 5 history entries
- Sets `passwordChangedAt` for non-new users

## 9. Account Lock Policy

On failed login:

- `loginAttempts` increments
- At 5 failed attempts, account locks for 30 minutes
- During lock period, login returns HTTP 423

On successful login:

- attempts reset to 0
- `lockUntil` cleared
- `lastLoginAt` updated

## 10. Security Controls Summary

Implemented controls include:

- Refresh token hashing at rest
- Refresh token rotation
- Refresh token replay defense (global token clear on invalid hash)
- Session cap per account
- Token version invalidation strategy
- Password history enforcement
- Account lock on brute force attempts
- Email verification gate for sensitive actions
- Anti-enumeration behavior on forgot-password

## 11. Common Status Codes

- `200`: success
- `201`: created (register)
- `400`: invalid/expired verification/reset token
- `401`: auth failures (invalid token, bad credentials)
- `403`: inactive account or unverified email restrictions
- `409`: duplicate email/username on register
- `422`: request validation errors
- `423`: account temporarily locked

## 12. Refresh Token Troubleshooting

If `/refresh` returns `Invalid or expired refresh token. Please login again.`:

1. Verify `JWT_REFRESH_SECRET` consistency across environments.
2. Confirm refresh token is being sent in one of:
   - cookie `refreshToken`
   - header `x-refresh-token`
   - body `refreshToken`
3. Confirm cookie path is `/api/v1/auth`.
4. Ensure token is not expired.
5. Ensure token was not already rotated and reused.
6. Check whether `logout-all` or token-version invalidation was triggered.
7. Verify DB `refreshTokens` hash entry exists for that user.

## 13. Recommended Postman Test Sequence

1. Register
2. Verify Email
3. Login
4. Refresh Token
5. Get Me
6. Get Sessions
7. Logout
8. Logout All Devices
9. Forgot Password
10. Reset Password
11. Change Password

## 14. Relevant Source Files

- `src/routes/api/v1/auth.routes.js`
- `src/controllers/auth.controller.js`
- `src/services/auth.service.js`
- `src/middlewares/auth.middleware.js`
- `src/models/user.model.js`
- `src/utils/auth/jwtHelper.utils.js`
- `src/utils/validators/auth.validator.js`

## 15. Notes for Maintainers

- Keep base route and refresh cookie path aligned.
- Keep env key names consistent (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`).
- If token payload fields change, update middleware and dependent services together.
- If password policy changes, reflect it in both validator and model hook.
