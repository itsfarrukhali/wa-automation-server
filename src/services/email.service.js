// services/email.service.js

import nodemailer from "nodemailer";
import { env } from "../lib/env.js";

// Transporter

let _transporter = null;
let _verified = false;

/**
 * Build and verify the Gmail transporter once, then cache it.
 * Returns null if credentials are missing or verification fails.
 */
const getTransporter = async () => {
  // Already verified and ready
  if (_transporter && _verified) return _transporter;

  if (!env.GMAIL_USER || !env.GMAIL_APP_PASSWORD) {
    console.error(
      "❌ Email service: GMAIL_USER or GMAIL_APP_PASSWORD missing in .env",
    );
    return null;
  }

  const t = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: env.GMAIL_USER,
      pass: env.GMAIL_APP_PASSWORD,
    },
  });

  // Await verification.
  // transporter.verify() is callback-based; we promisify it so we
  // know whether it works before trying to send.
  try {
    await new Promise((resolve, reject) => {
      t.verify((err, success) => {
        if (err) reject(err);
        else resolve(success);
      });
    });
    _transporter = t;
    _verified = true;
    console.log(`✅ Email transporter ready (${env.GMAIL_USER})`);
  } catch (err) {
    console.error("❌ Email transporter verification failed:", err.message);
    console.error(
      "   Check: (1) GMAIL_APP_PASSWORD is an App Password, not your Gmail password",
      "\n   (2) 2-Factor Authentication is enabled on your Google account",
      "\n   (3) The App Password was generated at myaccount.google.com/apppasswords",
    );
    return null;
  }

  return _transporter;
};

// Shared helpers

const FROM_ADDRESS =
  env.EMAIL_FROM || `"Zario" <${env.GMAIL_USER || "noreply@zario.app"}>`;

const YEAR = new Date().getFullYear();

/**
 * Shared email wrapper — one place for error handling and logging.
 */
const sendMail = async (options) => {
  const transporter = await getTransporter();

  if (!transporter) {
    console.error(
      `❌ Cannot send email to ${options.to}: transporter not ready`,
    );
    return {
      success: false,
      error: "Email service not configured or credentials invalid.",
    };
  }

  try {
    const info = await transporter.sendMail({ from: FROM_ADDRESS, ...options });
    console.log(`✉️  Email sent to ${options.to} [${info.messageId}]`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`❌ Email send failed to ${options.to}:`, err.message);
    return { success: false, error: err.message };
  }
};

// Shared template shell

/**
 * Wraps all emails in a consistent Zario-branded shell.
 * @param {string} headerColor - hex or gradient string for the header bg
 * @param {string} headerIcon  - emoji displayed large in header
 * @param {string} headerTitle - heading text inside header
 * @param {string} bodyHtml    - inner HTML for the white content area
 */
const shell = (headerColor, headerIcon, headerTitle, bodyHtml) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${headerTitle} — Zario</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Arial, sans-serif;
      background: #f0f2f5;
      color: #1a1a2e;
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper { padding: 40px 16px; }
    .card {
      max-width: 600px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
    }

    /* Header */
    .header {
      background: ${headerColor};
      padding: 40px 32px 32px;
      text-align: center;
    }
    .header-icon { font-size: 48px; display: block; margin-bottom: 12px; }
    .header h1 {
      color: #ffffff;
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.3px;
    }
    .header p {
      color: rgba(255,255,255,0.85);
      font-size: 14px;
      margin-top: 6px;
    }

    /* Body */
    .body { padding: 36px 32px; }
    .greeting {
      font-size: 18px;
      font-weight: 600;
      color: #1a1a2e;
      margin-bottom: 16px;
    }
    .body p {
      font-size: 15px;
      color: #444;
      margin-bottom: 16px;
    }

    /* CTA Button */
    .btn-wrap { text-align: center; margin: 28px 0; }
    .btn {
      display: inline-block;
      padding: 14px 36px;
      background: #25d366;
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 50px;
      font-weight: 700;
      font-size: 15px;
      letter-spacing: 0.2px;
      box-shadow: 0 4px 12px rgba(37,211,102,0.35);
    }
    .btn:hover { background: #1ebe5d; }

    /* Alert boxes */
    .alert {
      border-radius: 10px;
      padding: 14px 18px;
      font-size: 14px;
      margin: 20px 0;
    }
    .alert-warning {
      background: #fff8e7;
      border-left: 4px solid #f59e0b;
      color: #92400e;
    }
    .alert-danger {
      background: #fef2f2;
      border-left: 4px solid #ef4444;
      color: #7f1d1d;
    }
    .alert-info {
      background: #eff6ff;
      border-left: 4px solid #3b82f6;
      color: #1e3a5f;
    }

    /* URL display */
    .url-box {
      background: #f4f6f8;
      border-radius: 8px;
      padding: 12px 16px;
      word-break: break-all;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      color: #555;
      margin: 12px 0;
    }

    /* Divider */
    .divider {
      border: none;
      border-top: 1px solid #eee;
      margin: 24px 0;
    }

    /* Feature list */
    .feature-list { list-style: none; padding: 0; margin: 16px 0; }
    .feature-list li {
      padding: 8px 0;
      font-size: 15px;
      color: #444;
      border-bottom: 1px solid #f0f0f0;
    }
    .feature-list li:last-child { border-bottom: none; }

    /* Footer */
    .footer {
      background: #f8f9fa;
      border-top: 1px solid #eee;
      padding: 20px 32px;
      text-align: center;
    }
    .footer p { font-size: 12px; color: #999; margin-bottom: 4px; }
    .footer a { color: #25d366; text-decoration: none; }

    /* Logo text */
    .logo {
      font-size: 22px;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: -0.5px;
    }
    .logo span { color: #25d366; }

    @media (max-width: 600px) {
      .body, .header { padding: 24px 20px; }
      .footer { padding: 16px 20px; }
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">

      <div class="header">
        <span class="header-icon">${headerIcon}</span>
        <div class="logo">Zar<span>io</span></div>
        <h1>${headerTitle}</h1>
      </div>

      <div class="body">
        ${bodyHtml}
      </div>

      <div class="footer">
        <p>© ${YEAR} Zario. All rights reserved.</p>
        <p>WhatsApp automation for Pakistani SMEs &nbsp;·&nbsp; <a href="mailto:support@zario.app">support@zario.app</a></p>
        <p style="margin-top:8px;font-size:11px;color:#bbb;">
          You received this email because an account was created with this address.<br>
          If this wasn't you, you can safely ignore this email.
        </p>
      </div>

    </div>
  </div>
</body>
</html>
`;

// 1. Email Verification

/**
 * Sent immediately after registration.
 * @param {string} email
 * @param {string} fullName   - user.name from the User model
 * @param {string} rawToken   - raw (un-hashed) token returned by generateEmailVerificationToken()
 */
export const sendVerificationEmail = async (email, fullName, rawToken) => {
  const verificationUrl = `${env.FRONTEND_URL}/verify-email?token=${rawToken}`;

  const body = `
    <p class="greeting">Hello ${fullName}! 👋</p>
    <p>
      Thanks for signing up for <strong>Zario</strong> — WhatsApp automation built for
      Pakistani businesses. You're one step away from automating your customer communication.
    </p>
    <p>Click the button below to verify your email address and activate your account:</p>

    <div class="btn-wrap">
      <a href="${verificationUrl}" class="btn">Verify Email Address →</a>
    </div>

    <div class="alert alert-warning">
      ⏱️ <strong>This link expires in 24 hours.</strong>
      After that, request a new one from your account settings.
    </div>

    <p>Or paste this link into your browser:</p>
    <div class="url-box">${verificationUrl}</div>

    <hr class="divider" />
    <p style="font-size:13px;color:#999;">
      Didn't create a Zario account? You can safely ignore this email —
      no account will be created without verification.
    </p>
  `;

  return sendMail({
    to: email,
    subject: "Verify your email — Zario",
    html: shell(
      "linear-gradient(135deg, #25d366 0%, #128c7e 100%)",
      "📱",
      "Verify Your Email Address",
      body,
    ),
  });
};

// 2. Welcome Email (post-verification)

/**
 * Sent after the user clicks the verification link.
 * @param {string} email
 * @param {string} fullName
 * @param {string} username
 */
export const sendWelcomeEmail = async (email, fullName, username) => {
  const dashboardUrl = `${env.FRONTEND_URL}/dashboard`;

  const body = `
    <p class="greeting">Welcome aboard, ${fullName}! 🎉</p>
    <p>
      Your email is verified and your Zario account is fully activated.
      Your username is <strong>@${username}</strong>.
    </p>
    <p>Here's what you can do right now:</p>
    <ul class="feature-list">
      <li>📋 &nbsp;Complete your business onboarding (5 steps)</li>
      <li>📲 &nbsp;Connect your WhatsApp Business number</li>
      <li>🗓️ &nbsp;Add services and start taking bookings</li>
      <li>🔔 &nbsp;Send automated reminders to customers</li>
      <li>📣 &nbsp;Run win-back campaigns to inactive customers</li>
    </ul>

    <div class="btn-wrap">
      <a href="${dashboardUrl}" class="btn">Go to Dashboard →</a>
    </div>

    <div class="alert alert-info">
      💡 <strong>Tip:</strong> Connect your WhatsApp number in Step 5 of onboarding
      to start sending automated messages.
    </div>
  `;

  return sendMail({
    to: email,
    subject: "You're all set — Welcome to Zario! 🎉",
    html: shell(
      "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      "🎊",
      "Account Activated!",
      body,
    ),
  });
};

// 3. Password Reset

/**
 * Sent when user requests a password reset.
 
 *
 * @param {string} email
 * @param {string} fullName
 * @param {string} rawToken
 */
export const sendPasswordResetEmail = async (email, fullName, rawToken) => {
  const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${rawToken}`;
  const name = fullName || "there";

  const body = `
    <p class="greeting">Hi ${name},</p>
    <p>
      We received a request to reset the password for your Zario account
      associated with <strong>${email}</strong>.
    </p>
    <p>Click the button below to choose a new password:</p>

    <div class="btn-wrap">
      <a href="${resetUrl}" class="btn">Reset My Password →</a>
    </div>

    <div class="alert alert-danger">
      ⏱️ <strong>This link expires in 1 hour.</strong>
      After that, you'll need to request a new reset link.
    </div>

    <p>Or paste this link into your browser:</p>
    <div class="url-box">${resetUrl}</div>

    <hr class="divider" />
    <p style="font-size:13px;color:#999;">
      If you didn't request a password reset, you can safely ignore this email.
      Your password will not be changed unless you click the link above.
    </p>
  `;

  return sendMail({
    to: email,
    subject: "Reset your password — Zario",
    html: shell(
      "linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%)",
      "🔐",
      "Password Reset Request",
      body,
    ),
  });
};

// 4. Password Changed Confirmation

/**
 * Security notification sent after a successful password change/reset.
 * @param {string} email
 * @param {string} fullName
 */

export const sendPasswordChangedEmail = async (email, fullName) => {
  const loginUrl = `${env.FRONTEND_URL}/login`;
  const supportUrl = "mailto:support@zario.app";

  const body = `
    <p class="greeting">Hi ${fullName},</p>
    <p>
      This is a confirmation that the password for your Zario account
      (<strong>${email}</strong>) was successfully changed.
    </p>

    <div class="alert alert-warning">
      🔒 <strong>Was this you?</strong> If you didn't change your password,
      your account may be compromised. Please
      <a href="${supportUrl}" style="color:#92400e;font-weight:bold;">contact support immediately</a>.
    </div>

    <p>
      All active sessions have been logged out for your security.
      Log back in with your new password:
    </p>

    <div class="btn-wrap">
      <a href="${loginUrl}" class="btn">Log In to Zario →</a>
    </div>
  `;

  return sendMail({
    to: email,
    subject: "Your password was changed — Zario",
    html: shell(
      "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
      "🔒",
      "Password Changed Successfully",
      body,
    ),
  });
};
