const DEFAULT_FRONTEND_URL = "https://zario-web.vercel.app";
const DEFAULT_BACKEND_URL = "https://wa-automation-server-vyzg.onrender.com";
const REQUEST_TIMEOUT_MS = 30_000;
const BACKEND_WAKE_TIMEOUT_MS = 90_000;

const frontendUrl = normalizeBaseUrl(
  process.env.SMOKE_FRONTEND_URL || DEFAULT_FRONTEND_URL,
);
const backendUrl = normalizeBaseUrl(
  process.env.SMOKE_BACKEND_URL || DEFAULT_BACKEND_URL,
);
const apiUrl = `${backendUrl}/api/v1`;
const smokeEmail = process.env.SMOKE_EMAIL?.trim();
const smokePassword = process.env.SMOKE_PASSWORD;

const results = [];

const record = (name, status, durationMs, detail = "") => {
  results.push({ name, status, durationMs, detail });
};

const request = async (url, options = {}) => {
  const { timeoutMs = REQUEST_TIMEOUT_MS, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();

  try {
    const response = await fetch(url, {
      redirect: "follow",
      ...fetchOptions,
      headers: {
        "user-agent": "zario-production-smoke/1.0",
        ...fetchOptions.headers,
      },
      signal: controller.signal,
    });
    const durationMs = Math.round(performance.now() - startedAt);
    const text = await response.text();
    let json = null;
    if (text && response.headers.get("content-type")?.includes("application/json")) {
      try {
        json = JSON.parse(text);
      } catch {
        // The caller will report malformed JSON where JSON is required.
      }
    }
    return { response, durationMs, text, json };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

const runCheck = async (name, check) => {
  const startedAt = performance.now();
  try {
    const detail = await check();
    record(name, "PASS", Math.round(performance.now() - startedAt), detail);
  } catch (error) {
    const message = String(error?.message || error);
    record(name, "FAIL", Math.round(performance.now() - startedAt), message);
  }
};

const expectStatus = (actual, expected, label) => {
  const accepted = Array.isArray(expected) ? expected : [expected];
  if (!accepted.includes(actual)) {
    throw new Error(`${label} returned HTTP ${actual}; expected ${accepted.join("/")}`);
  }
};

const checkFrontendPage = async (path, expectedText) => {
  const { response, durationMs, text } = await request(`${frontendUrl}${path}`);
  expectStatus(response.status, 200, path || "/");
  if (!response.headers.get("content-type")?.includes("text/html")) {
    throw new Error(`${path || "/"} did not return HTML`);
  }
  if (expectedText && !text.toLowerCase().includes(expectedText.toLowerCase())) {
    throw new Error(`${path || "/"} is missing expected content: ${expectedText}`);
  }
  return `HTTP 200 (${durationMs}ms)`;
};

const checkFrontendAssets = async () => {
  const home = await request(frontendUrl);
  expectStatus(home.response.status, 200, "Frontend homepage");
  const assetPaths = [
    ...new Set(
      [...home.text.matchAll(/(?:src|href)="([^"]+)"/g)]
        .map((match) => match[1])
        .filter((value) => value.startsWith("/_next/static/")),
    ),
  ];
  if (assetPaths.length === 0) throw new Error("No Next.js assets found in homepage HTML");

  const assets = await Promise.all(
    assetPaths.map(async (path) => {
      const result = await request(new URL(path, frontendUrl));
      return { path, ...result };
    }),
  );
  const failed = assets.filter(({ response }) => response.status !== 200);
  if (failed.length > 0) {
    throw new Error(
      `${failed.length} frontend asset(s) failed: ${failed
        .slice(0, 3)
        .map(({ path, response }) => `${path} (${response.status})`)
        .join(", ")}`,
    );
  }
  return `${assets.length} Next.js assets returned HTTP 200`;
};

const publicChecks = async () => {
  await runCheck("Frontend homepage", () => checkFrontendPage("/", "Zario"));
  await runCheck("Frontend login", () => checkFrontendPage("/login", "Login"));
  await runCheck("Privacy policy", () => checkFrontendPage("/privacy", "Privacy"));
  await runCheck("Data deletion", () =>
    checkFrontendPage("/data-deletion", "Data Deletion"),
  );
  await runCheck("Frontend static assets", checkFrontendAssets);

  await runCheck("Backend wake-up", async () => {
    const result = await request(`${backendUrl}/api/health`, {
      timeoutMs: BACKEND_WAKE_TIMEOUT_MS,
    });
    expectStatus(result.response.status, 200, "Backend wake-up");
    return `service responded (${result.durationMs}ms)`;
  });

  await runCheck("Backend health", async () => {
    const result = await request(`${backendUrl}/api/health`);
    expectStatus(result.response.status, 200, "Backend health");
    if (result.json?.data?.status !== "healthy") {
      throw new Error("Backend health payload is not healthy");
    }
    return `healthy (${result.durationMs}ms)`;
  });

  await runCheck("Backend readiness", async () => {
    const result = await request(`${backendUrl}/api/ready`);
    expectStatus(result.response.status, 200, "Backend readiness");
    const checks = result.json?.data?.checks;
    if (checks?.mongo !== "connected" || checks?.redis !== "connected") {
      throw new Error(
        `Dependencies not ready: mongo=${checks?.mongo || "unknown"}, redis=${checks?.redis || "unknown"}`,
      );
    }
    return `mongo=connected, redis=connected (${result.durationMs}ms)`;
  });

  await runCheck("Production CORS", async () => {
    const result = await request(`${apiUrl}/auth/login`, {
      method: "OPTIONS",
      headers: {
        Origin: frontendUrl,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,authorization",
      },
    });
    expectStatus(result.response.status, [200, 204], "CORS preflight");
    const allowedOrigin = result.response.headers.get("access-control-allow-origin");
    if (allowedOrigin !== frontendUrl) {
      throw new Error(`CORS allowed origin is ${allowedOrigin || "missing"}`);
    }
    return `allows ${allowedOrigin}`;
  });

  await runCheck("Unauthenticated API guard", async () => {
    const result = await request(`${apiUrl}/auth/me`);
    expectStatus(result.response.status, 401, "Unauthenticated /auth/me");
    return "HTTP 401 as expected";
  });

  await runCheck("Unknown API route", async () => {
    const result = await request(`${apiUrl}/smoke-route-that-must-not-exist`);
    expectStatus(result.response.status, 404, "Unknown API route");
    return "HTTP 404 as expected";
  });
};

const authenticatedChecks = async () => {
  if (!smokeEmail && !smokePassword) {
    record(
      "Authenticated checks",
      "SKIP",
      0,
      "Set SMOKE_EMAIL and SMOKE_PASSWORD to enable read-only authenticated checks",
    );
    return;
  }
  if (!smokeEmail || !smokePassword) {
    record(
      "Authenticated checks",
      "FAIL",
      0,
      "SMOKE_EMAIL and SMOKE_PASSWORD must both be set",
    );
    return;
  }

  let accessToken;
  let refreshCookie;
  let authenticatedRole;

  await runCheck("Production login", async () => {
    const result = await request(`${apiUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: smokeEmail, password: smokePassword }),
    });
    expectStatus(result.response.status, 200, "Production login");
    accessToken = result.json?.data?.accessToken;
    if (!accessToken) throw new Error("Login response did not include an access token");
    refreshCookie = extractCookie(result.response.headers.get("set-cookie"));
    return `authenticated (${result.durationMs}ms)`;
  });

  if (!accessToken) return;
  const authHeaders = { Authorization: `Bearer ${accessToken}` };

  await runCheck("Authenticated user", async () => {
    const result = await request(`${apiUrl}/auth/me`, { headers: authHeaders });
    expectStatus(result.response.status, 200, "Authenticated /auth/me");
    if (!result.json?.data?.user) throw new Error("Authenticated user payload is missing");
    authenticatedRole = result.json.data.user.role;
    return `user session is valid (role=${authenticatedRole || "unknown"})`;
  });

  if (authenticatedRole === "owner") {
    await runCheck("WhatsApp connection", async () => {
      const result = await request(`${apiUrl}/business/whatsapp/status`, {
        headers: authHeaders,
      });
      expectStatus(result.response.status, 200, "WhatsApp connection status");
      const connection = result.json?.data;
      if (connection?.health !== "healthy" || connection?.tokenValid !== true) {
        throw new Error(
          `WhatsApp is not healthy: health=${connection?.health || "unknown"}, tokenValid=${String(connection?.tokenValid)}`,
        );
      }
      return "healthy and token valid";
    });
  } else {
    record(
      "WhatsApp connection",
      "SKIP",
      0,
      "Owner-only check; use a dedicated staff smoke account for least privilege",
    );
  }

  await runCheck("WhatsApp templates", async () => {
    const result = await request(`${apiUrl}/whatsapp/templates`, {
      headers: authHeaders,
    });
    expectStatus(result.response.status, 200, "WhatsApp templates");
    if (!Array.isArray(result.json?.data?.templates)) {
      throw new Error("Template list payload is missing");
    }
    return `${result.json.data.templates.length} template(s)`;
  });

  await runCheck("Inbox read", async () => {
    const result = await request(`${apiUrl}/messages/inbox?limit=1&status=all`, {
      headers: authHeaders,
    });
    expectStatus(result.response.status, 200, "Inbox");
    if (!Array.isArray(result.json?.data?.conversations)) {
      throw new Error("Inbox conversation list is missing");
    }
    return "inbox payload is valid";
  });

  await runCheck("Smoke session cleanup", async () => {
    const result = await request(`${apiUrl}/auth/logout`, {
      method: "POST",
      headers: {
        ...authHeaders,
        ...(refreshCookie ? { Cookie: refreshCookie } : {}),
      },
    });
    expectStatus(result.response.status, 200, "Logout");
    return "temporary login session removed";
  });
};

const printReport = () => {
  const width = Math.max(...results.map(({ name }) => name.length), 20);
  console.log(`\nZario production smoke test`);
  console.log(`Frontend: ${frontendUrl}`);
  console.log(`Backend:  ${backendUrl}\n`);
  for (const result of results) {
    console.log(
      `${result.status.padEnd(4)}  ${result.name.padEnd(width)}  ${String(result.durationMs).padStart(6)}ms  ${result.detail}`,
    );
  }

  const passed = results.filter(({ status }) => status === "PASS").length;
  const failed = results.filter(({ status }) => status === "FAIL").length;
  const skipped = results.filter(({ status }) => status === "SKIP").length;
  console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
  if (failed > 0) process.exitCode = 1;
};

function normalizeBaseUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Invalid smoke-test URL: ${value}`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Smoke-test URL must use HTTP or HTTPS: ${value}`);
  }
  return parsed.toString().replace(/\/$/, "");
}

function extractCookie(setCookie) {
  if (!setCookie) return "";
  return setCookie.split(";", 1)[0];
}

await publicChecks();
await authenticatedChecks();
printReport();
