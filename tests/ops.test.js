import assert from "node:assert/strict";

import { redactSensitive } from "../src/services/audit.service.js";
import { redactSecretsFromText } from "../src/utils/security/redactSecrets.utils.js";

describe("Operations helpers", () => {
  it("redacts Meta and bearer tokens embedded inside error messages", () => {
    const metaToken = `EAA${"a".repeat(120)}`;
    const message = redactSecretsFromText(
      `Malformed access token ${metaToken}; Authorization: Bearer ${metaToken}`,
    );

    assert.equal(message.includes(metaToken), false);
    assert.match(message, /Malformed access token \[REDACTED\]/);
    assert.match(message, /Bearer \[REDACTED\]/);
  });

  it("redacts sensitive audit metadata recursively", () => {
    const result = redactSensitive({
      email: "user@test.com",
      password: "Secret123!",
      nested: {
        accessToken: "token-value",
        safe: "visible",
      },
      items: [{ refreshToken: "refresh-value" }],
    });

    assert.equal(result.email, "user@test.com");
    assert.equal(result.password, "[REDACTED]");
    assert.equal(result.nested.accessToken, "[REDACTED]");
    assert.equal(result.nested.safe, "visible");
    assert.equal(result.items[0].refreshToken, "[REDACTED]");
  });
});
