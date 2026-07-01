# Zario Complete API Testing Guide

Use this guide to manually test the backend from fresh setup to production
readiness.

Base URL:

```text
{{baseUrl}} = http://localhost:3000
```

Auth header:

```text
Authorization: Bearer {{zario_access_token}}
```

## 0. Health checks

### Live

```http
GET {{baseUrl}}/
```

### Health

```http
GET {{baseUrl}}/api/health
```

### Readiness

```http
GET {{baseUrl}}/api/ready
```

Expected:

```json
{
  "success": true,
  "data": {
    "status": "ready",
    "checks": {
      "mongo": "connected"
    }
  }
}
```

## 1. Auth workflow

### Register owner

```http
POST {{baseUrl}}/api/v1/auth/register
Content-Type: application/json
```

```json
{
  "name": "Farrukh Ali",
  "username": "farrukh_owner",
  "email": "owner@example.com",
  "password": "Password123!",
  "businessName": "Zario Test Salon",
  "businessType": "salon",
  "consentToDataProcessing": true
}
```

Save:

- `zario_access_token`
- `_devVerificationToken` if returned in development

### Verify email

```http
GET {{baseUrl}}/api/v1/auth/verify-email/{{verification_token}}
```

### Login

```http
POST {{baseUrl}}/api/v1/auth/login
Content-Type: application/json
```

```json
{
  "email": "owner@example.com",
  "password": "Password123!"
}
```

### Refresh token

```http
POST {{baseUrl}}/api/v1/auth/refresh
```

If cookie is not available in Postman:

```http
x-refresh-token: {{refresh_token}}
```

### Current user

```http
GET {{baseUrl}}/api/v1/auth/me
Authorization: Bearer {{zario_access_token}}
```

### Sessions

```http
GET {{baseUrl}}/api/v1/auth/sessions
Authorization: Bearer {{zario_access_token}}
```

### Forgot password

```http
POST {{baseUrl}}/api/v1/auth/forgot-password
Content-Type: application/json
```

```json
{
  "email": "owner@example.com"
}
```

### Reset password

```http
POST {{baseUrl}}/api/v1/auth/reset-password
Content-Type: application/json
```

```json
{
  "token": "{{reset_token}}",
  "password": "NewPassword123!"
}
```

### Change password

```http
POST {{baseUrl}}/api/v1/auth/change-password
Authorization: Bearer {{zario_access_token}}
Content-Type: application/json
```

```json
{
  "currentPassword": "Password123!",
  "newPassword": "NewPassword123!"
}
```

### Logout all

```http
POST {{baseUrl}}/api/v1/auth/logout-all
Authorization: Bearer {{zario_access_token}}
```

### Logout

```http
POST {{baseUrl}}/api/v1/auth/logout
```

## 2. Business onboarding

### Get onboarding status

```http
GET {{baseUrl}}/api/v1/business/onboarding/status
Authorization: Bearer {{zario_access_token}}
```

### Step 1 — basic info

```http
PATCH {{baseUrl}}/api/v1/business/onboarding/step-1
Authorization: Bearer {{zario_access_token}}
Content-Type: application/json
```

```json
{
  "name": "Zario Test Salon",
  "type": "salon",
  "phone": "03001234567",
  "email": "salon@example.com"
}
```

### Step 2 — location

```http
PATCH {{baseUrl}}/api/v1/business/onboarding/step-2
Authorization: Bearer {{zario_access_token}}
Content-Type: application/json
```

```json
{
  "city": "Lahore",
  "area": "Gulberg",
  "address": "Main Boulevard Gulberg",
  "coordinates": [74.3587, 31.5204],
  "serviceRadius": 10
}
```

### Step 3 — working hours

```http
PATCH {{baseUrl}}/api/v1/business/onboarding/step-3
Authorization: Bearer {{zario_access_token}}
Content-Type: application/json
```

```json
{
  "workingHours": [
    { "day": "mon", "isOpen": true, "openTime": "10:00", "closeTime": "20:00" },
    { "day": "tue", "isOpen": true, "openTime": "10:00", "closeTime": "20:00" },
    { "day": "wed", "isOpen": true, "openTime": "10:00", "closeTime": "20:00" },
    { "day": "thu", "isOpen": true, "openTime": "10:00", "closeTime": "20:00" },
    { "day": "fri", "isOpen": true, "openTime": "10:00", "closeTime": "17:00" },
    { "day": "sat", "isOpen": true, "openTime": "11:00", "closeTime": "17:00" },
    { "day": "sun", "isOpen": false }
  ],
  "timezone": "Asia/Karachi"
}
```

### Step 4 — engagement

```http
PATCH {{baseUrl}}/api/v1/business/onboarding/step-4
Authorization: Bearer {{zario_access_token}}
Content-Type: application/json
```

```json
{
  "reminderTime": 24,
  "followUpDays": 3,
  "winbackDays": 45,
  "reviewRequestEnabled": true,
  "reviewPlatform": "google"
}
```

### Step 5 — WhatsApp connection

```http
PATCH {{baseUrl}}/api/v1/business/onboarding/step-5
Authorization: Bearer {{zario_access_token}}
Content-Type: application/json
```

```json
{
  "phoneNumberId": "1222965920892386",
  "wabaId": "1629202128185801",
  "displayPhoneNumber": "+15556503577",
  "verifiedName": "Zario Test",
  "accessToken": "EAAG..."
}
```

### Business reads/updates

```http
GET   {{baseUrl}}/api/v1/business/me
GET   {{baseUrl}}/api/v1/business/dashboard
GET   {{baseUrl}}/api/v1/business/plan
PATCH {{baseUrl}}/api/v1/business/profile
PATCH {{baseUrl}}/api/v1/business/settings
PATCH {{baseUrl}}/api/v1/business/working-hours/mon
PATCH {{baseUrl}}/api/v1/business/engagement
```

## 3. Customers

### Create

```http
POST {{baseUrl}}/api/v1/customers
Authorization: Bearer {{zario_access_token}}
Content-Type: application/json
```

```json
{
  "name": "Ayesha Khan",
  "phone": "03001234567",
  "email": "ayesha@example.com",
  "tags": ["vip"],
  "whatsappOptIn": true,
  "consentGiven": true,
  "source": "manual"
}
```

Save `customer_id`.

### Other customer endpoints

```http
GET    {{baseUrl}}/api/v1/customers?page=1&limit=20
GET    {{baseUrl}}/api/v1/customers?search=ayesha
GET    {{baseUrl}}/api/v1/customers?tag=vip
GET    {{baseUrl}}/api/v1/customers/{{customer_id}}
PATCH  {{baseUrl}}/api/v1/customers/{{customer_id}}
DELETE {{baseUrl}}/api/v1/customers/{{customer_id}}
GET    {{baseUrl}}/api/v1/customers/{{customer_id}}/bookings
POST   {{baseUrl}}/api/v1/customers/import
```

Import example:

```json
{
  "customers": [
    {
      "name": "Sara Ali",
      "phone": "03007654321",
      "whatsappOptIn": true,
      "tags": ["regular"]
    }
  ]
}
```

## 4. Services

### Create

```http
POST {{baseUrl}}/api/v1/services
Authorization: Bearer {{zario_access_token}}
Content-Type: application/json
```

```json
{
  "name": "Premium Haircut",
  "description": "Consultation, wash and haircut",
  "price": 2500,
  "duration": 45,
  "bufferBefore": 5,
  "bufferAfter": 5,
  "category": "Hair"
}
```

Save `service_id`.

### Other service endpoints

```http
GET    {{baseUrl}}/api/v1/services
GET    {{baseUrl}}/api/v1/services/analytics
GET    {{baseUrl}}/api/v1/services/{{service_id}}
PATCH  {{baseUrl}}/api/v1/services/{{service_id}}
DELETE {{baseUrl}}/api/v1/services/{{service_id}}
POST   {{baseUrl}}/api/v1/services/import
```

## 5. Staff

Owner only.

### Create staff

```http
POST {{baseUrl}}/api/v1/staff
Authorization: Bearer {{zario_access_token}}
Content-Type: application/json
```

```json
{
  "name": "Sara Staff",
  "email": "sara.staff@example.com",
  "username": "sarastaff",
  "password": "Password123!",
  "phone": "03001234567"
}
```

Save `staff_id`.

### Other staff endpoints

```http
GET    {{baseUrl}}/api/v1/staff
GET    {{baseUrl}}/api/v1/staff/{{staff_id}}
PATCH  {{baseUrl}}/api/v1/staff/{{staff_id}}
PATCH  {{baseUrl}}/api/v1/staff/{{staff_id}}/status
POST   {{baseUrl}}/api/v1/staff/{{staff_id}}/reset-password
DELETE {{baseUrl}}/api/v1/staff/{{staff_id}}
```

Status body:

```json
{
  "isActive": false
}
```

Reset password:

```json
{
  "password": "NewPassword123!"
}
```

## 6. Bookings

### Create booking

Use a future time inside working hours.

```http
POST {{baseUrl}}/api/v1/bookings
Authorization: Bearer {{zario_access_token}}
Content-Type: application/json
```

```json
{
  "customerId": "{{customer_id}}",
  "serviceId": "{{service_id}}",
  "staffId": "{{owner_id}}",
  "scheduledAt": "2026-07-05T10:00:00+05:00",
  "source": "staff",
  "notes": "First visit"
}
```

Save `booking_id`.

### Booking endpoints

```http
GET    {{baseUrl}}/api/v1/bookings
GET    {{baseUrl}}/api/v1/bookings/schedule?date=2026-07-05
GET    {{baseUrl}}/api/v1/bookings/{{booking_id}}
PATCH  {{baseUrl}}/api/v1/bookings/{{booking_id}}
PATCH  {{baseUrl}}/api/v1/bookings/{{booking_id}}/status
POST   {{baseUrl}}/api/v1/bookings/{{booking_id}}/reschedule
POST   {{baseUrl}}/api/v1/bookings/{{booking_id}}/payments
DELETE {{baseUrl}}/api/v1/bookings/{{booking_id}}
```

Status:

```json
{
  "status": "confirmed"
}
```

Valid lifecycle:

```text
pending -> confirmed -> arrived -> in_progress -> completed
```

Payment:

```json
{
  "amount": 1000,
  "method": "jazzcash",
  "reference": "TX-001"
}
```

Reschedule:

```json
{
  "scheduledAt": "2026-07-06T12:00:00+05:00",
  "reason": "Customer requested new time"
}
```

## 7. WhatsApp templates

### Create local template

```http
POST {{baseUrl}}/api/v1/whatsapp/templates
Authorization: Bearer {{zario_access_token}}
Content-Type: application/json
```

```json
{
  "name": "Appointment Reminder",
  "language": "en",
  "category": "UTILITY",
  "status": "PENDING",
  "components": [
    {
      "type": "BODY",
      "text": "Assalam o alaikum {{1}}, reminder for your appointment at {{2}}."
    }
  ]
}
```

### Template endpoints

```http
GET    {{baseUrl}}/api/v1/whatsapp/templates
GET    {{baseUrl}}/api/v1/whatsapp/templates/stats
POST   {{baseUrl}}/api/v1/whatsapp/templates/sync
PATCH  {{baseUrl}}/api/v1/whatsapp/templates/{{template_id}}
DELETE {{baseUrl}}/api/v1/whatsapp/templates/{{template_id}}
POST   {{baseUrl}}/api/v1/whatsapp/templates/{{template_id}}/mark-used
```

## 8. WhatsApp messages and inbox

### Send text

```http
POST {{baseUrl}}/api/v1/messages/text
Authorization: Bearer {{zario_access_token}}
Content-Type: application/json
```

```json
{
  "customerId": "{{customer_id}}",
  "text": "Assalam o alaikum! This is a Zario WhatsApp Cloud API test.",
  "previewUrl": false
}
```

### Send template

```http
POST {{baseUrl}}/api/v1/messages/template
Authorization: Bearer {{zario_access_token}}
Content-Type: application/json
```

```json
{
  "customerId": "{{customer_id}}",
  "templateName": "appointment_reminder",
  "language": "en",
  "components": []
}
```

### Other message endpoints

```http
GET   {{baseUrl}}/api/v1/messages
GET   {{baseUrl}}/api/v1/messages?customerId={{customer_id}}
GET   {{baseUrl}}/api/v1/messages/inbox
GET   {{baseUrl}}/api/v1/messages/conversations/{{customer_id}}
GET   {{baseUrl}}/api/v1/messages/analytics?days=30
GET   {{baseUrl}}/api/v1/messages/{{message_id}}
PATCH {{baseUrl}}/api/v1/messages/{{message_id}}/read
```

## 9. WhatsApp webhooks

### Verify webhook

```http
GET {{baseUrl}}/api/v1/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token={{WEBHOOK_VERIFY_TOKEN}}&hub.challenge=test123
```

Expected raw response:

```text
test123
```

### Simulate inbound message

```http
POST {{baseUrl}}/api/v1/webhooks/whatsapp
Content-Type: application/json
```

```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "{{waba_id}}",
      "changes": [
        {
          "field": "messages",
          "value": {
            "messaging_product": "whatsapp",
            "metadata": {
              "display_phone_number": "15556503577",
              "phone_number_id": "{{phone_number_id}}"
            },
            "contacts": [
              {
                "profile": { "name": "Daaji" },
                "wa_id": "923468224143"
              }
            ],
            "messages": [
              {
                "from": "923468224143",
                "id": "wamid.test.inbound.1",
                "timestamp": "1782809020",
                "type": "text",
                "text": { "body": "What are your timings?" }
              }
            ]
          }
        }
      ]
    }
  ]
}
```

### Simulate delivery status

```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "{{waba_id}}",
      "changes": [
        {
          "field": "messages",
          "value": {
            "messaging_product": "whatsapp",
            "metadata": {
              "display_phone_number": "15556503577",
              "phone_number_id": "{{phone_number_id}}"
            },
            "statuses": [
              {
                "id": "{{wa_message_id}}",
                "status": "read",
                "timestamp": "1782809006",
                "recipient_id": "923468224143"
              }
            ]
          }
        }
      ]
    }
  ]
}
```

## 10. Automation rules

### Create rule

```http
POST {{baseUrl}}/api/v1/automation-rules
Authorization: Bearer {{zario_access_token}}
Content-Type: application/json
```

```json
{
  "name": "Business Hours Reply",
  "priority": 1,
  "trigger": {
    "type": "contains_any",
    "keywords": ["timing", "hours", "open"]
  },
  "response": {
    "text": "Assalam o alaikum! We are open from 10 AM to 8 PM."
  },
  "stopProcessing": true
}
```

Endpoints:

```http
GET    {{baseUrl}}/api/v1/automation-rules
POST   {{baseUrl}}/api/v1/automation-rules
GET    {{baseUrl}}/api/v1/automation-rules/{{rule_id}}
PATCH  {{baseUrl}}/api/v1/automation-rules/{{rule_id}}
DELETE {{baseUrl}}/api/v1/automation-rules/{{rule_id}}
```

## 11. Scheduler

```http
GET  {{baseUrl}}/api/v1/scheduler/worker/status
GET  {{baseUrl}}/api/v1/scheduler/due?type=all&limit=25
POST {{baseUrl}}/api/v1/scheduler/run
```

Dry run:

```json
{
  "type": "all",
  "limit": 25,
  "dryRun": true
}
```

Real run:

```json
{
  "type": "reminder",
  "limit": 10,
  "dryRun": false
}
```

## 12. Campaigns

### Create campaign

```http
POST {{baseUrl}}/api/v1/campaigns
Authorization: Bearer {{zario_access_token}}
Content-Type: application/json
```

```json
{
  "name": "VIP Eid Offer",
  "description": "Promo campaign for opted-in VIP customers",
  "type": "promo",
  "target": {
    "tags": ["vip"]
  },
  "message": "Assalam o alaikum {{name}}! {{business}} has a special VIP Eid offer for you.",
  "whatsappTemplate": {
    "templateName": "vip_eid_offer",
    "language": "en",
    "category": "MARKETING"
  },
  "tags": ["eid", "vip"]
}
```

Endpoints:

```http
GET   {{baseUrl}}/api/v1/campaigns
POST  {{baseUrl}}/api/v1/campaigns
GET   {{baseUrl}}/api/v1/campaigns/analytics?days=30
POST  {{baseUrl}}/api/v1/campaigns/preview
GET   {{baseUrl}}/api/v1/campaigns/{{campaign_id}}
PATCH {{baseUrl}}/api/v1/campaigns/{{campaign_id}}
POST  {{baseUrl}}/api/v1/campaigns/{{campaign_id}}/launch
POST  {{baseUrl}}/api/v1/campaigns/{{campaign_id}}/pause
POST  {{baseUrl}}/api/v1/campaigns/{{campaign_id}}/resume
POST  {{baseUrl}}/api/v1/campaigns/{{campaign_id}}/cancel
POST  {{baseUrl}}/api/v1/campaigns/{{campaign_id}}/clone
```

Preview:

```json
{
  "campaignId": "{{campaign_id}}",
  "limit": 25
}
```

Dry launch:

```json
{
  "dryRun": true,
  "sendMode": "text",
  "allowPartial": false
}
```

Real launch:

```json
{
  "dryRun": false,
  "sendMode": "template",
  "allowPartial": false
}
```

## 13. Billing

```http
GET  {{baseUrl}}/api/v1/billing/plans
GET  {{baseUrl}}/api/v1/billing/subscription
POST {{baseUrl}}/api/v1/billing/checkout-intent
POST {{baseUrl}}/api/v1/billing/manual-payment
POST {{baseUrl}}/api/v1/billing/cancel
POST {{baseUrl}}/api/v1/billing/downgrade-free
```

Checkout intent:

```json
{
  "plan": "starter",
  "paymentMethod": "jazzcash"
}
```

Manual payment:

```json
{
  "plan": "starter",
  "paymentMethod": "manual",
  "amount": 3000,
  "reference": "MANUAL-QA-001"
}
```

## 14. Reports

```http
GET {{baseUrl}}/api/v1/reports/overview?days=30
GET {{baseUrl}}/api/v1/reports/revenue?days=30
GET {{baseUrl}}/api/v1/reports/bookings?days=30
GET {{baseUrl}}/api/v1/reports/customers
```

## 15. Admin

Admin/superadmin token required.

```http
GET   {{baseUrl}}/api/v1/admin/stats
GET   {{baseUrl}}/api/v1/admin/audit-logs
GET   {{baseUrl}}/api/v1/admin/logs
GET   {{baseUrl}}/api/v1/admin/logs/tail?file=app.log&lines=200
GET   {{baseUrl}}/api/v1/admin/users
GET   {{baseUrl}}/api/v1/admin/users/{{user_id}}
PATCH {{baseUrl}}/api/v1/admin/users/{{user_id}}/status
PATCH {{baseUrl}}/api/v1/admin/users/{{user_id}}/role
POST  {{baseUrl}}/api/v1/admin/users/{{user_id}}/verify-email
POST  {{baseUrl}}/api/v1/admin/users/{{user_id}}/reset-password
GET   {{baseUrl}}/api/v1/admin/businesses
GET   {{baseUrl}}/api/v1/admin/businesses/{{business_id}}
PATCH {{baseUrl}}/api/v1/admin/businesses/{{business_id}}/status
PATCH {{baseUrl}}/api/v1/admin/businesses/{{business_id}}/verify
POST  {{baseUrl}}/api/v1/admin/businesses/{{business_id}}/upgrade-plan
PATCH {{baseUrl}}/api/v1/admin/businesses/{{business_id}}/onboarding
```

Set user status:

```json
{
  "isActive": false
}
```

Change role:

```json
{
  "role": "staff"
}
```

Upgrade plan:

```json
{
  "newPlan": "growth",
  "paymentMethod": "manual"
}
```

## 16. Superadmin

```http
POST   {{baseUrl}}/api/v1/superadmin/admins
GET    {{baseUrl}}/api/v1/superadmin/admins
DELETE {{baseUrl}}/api/v1/superadmin/users/{{user_id}}
```

Create admin:

```json
{
  "name": "Platform Admin",
  "username": "platformadmin",
  "email": "admin@example.com",
  "password": "Password123!"
}
```

## Recommended complete test order

1. Health/readiness
2. Register owner
3. Verify email
4. Login
5. Business onboarding step 1–5
6. Create customer
7. Create service
8. Create booking
9. Confirm booking
10. Add booking payment
11. Send WhatsApp text
12. Verify webhook
13. Simulate inbound webhook
14. Create automation rule
15. Simulate keyword inbound webhook
16. Preview scheduler due messages
17. Scheduler dry-run
18. Create template
19. Sync templates from Meta
20. Create campaign
21. Campaign dry-run
22. Staff create/update/deactivate
23. Billing checkout/manual payment
24. Reports overview
25. Admin stats/audit/logs
