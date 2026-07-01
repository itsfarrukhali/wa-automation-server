import assert from "node:assert/strict";

import { redactSensitive } from "../src/services/audit.service.js";

describe("Operations helpers", () => {
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
