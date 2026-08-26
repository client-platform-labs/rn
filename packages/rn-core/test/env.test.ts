import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertModulesIsolated,
  defaultDualModuleDevSession,
  negotiateDevSessionProtocol,
  resolveDevSessionProtocolVersion,
  resolveEnv,
  DEV_SESSION_PROTOCOL_VERSION,
} from "../src/env.ts";

describe("resolveEnv cascade", () => {
  const config = defaultDualModuleDevSession();

  it("applies platform ← shell ← module overlay", () => {
    const main = resolveEnv({ config, businessModule: "main" });
    assert.equal(main.effective.apiBaseUrl, "http://192.168.2.2:3000");
    assert.equal(main.effective.tenantId, "local-tenant");
    assert.equal(main.effective.featureFlags?.tickets, true);
    assert.equal(main.provenance.apiBaseUrl, "shellProfile");
    assert.equal(main.provenance.featureFlags, "moduleOverlay");
  });

  it("module overlay overrides shell apiBaseUrl for support", () => {
    const support = resolveEnv({ config, businessModule: "support" });
    assert.equal(support.effective.apiBaseUrl, "http://127.0.0.1:3001");
    assert.equal(support.provenance.apiBaseUrl, "moduleOverlay");
    assert.equal(support.effective.featureFlags?.supportChat, true);
  });

  it("runtimeOverride wins (C5)", () => {
    const main = resolveEnv({
      config,
      businessModule: "main",
      runtimeOverride: { apiBaseUrl: "http://override.test" },
    });
    assert.equal(main.effective.apiBaseUrl, "http://override.test");
    assert.equal(main.provenance.apiBaseUrl, "runtimeOverride");
  });

  it("isolates dual module apiBaseUrl (C4)", () => {
    const check = assertModulesIsolated(config, "main", "support");
    assert.equal(check.ok, true);
    const a = resolveEnv({ config, businessModule: "main" });
    const b = resolveEnv({ config, businessModule: "support" });
    assert.notEqual(a.effective.apiBaseUrl, b.effective.apiBaseUrl);
  });

  it("throws on unknown module", () => {
    assert.throws(() => resolveEnv({ config, businessModule: "nope" }));
  });

  it("writes current protocol version on default dual session", () => {
    assert.equal(config.devSessionProtocolVersion, DEV_SESSION_PROTOCOL_VERSION);
  });
});

describe("negotiateDevSessionProtocol", () => {
  it("accepts current protocol", () => {
    const r = negotiateDevSessionProtocol({ peer: DEV_SESSION_PROTOCOL_VERSION });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.version, DEV_SESSION_PROTOCOL_VERSION);
  });

  it("rejects unsupported peer", () => {
    const r = negotiateDevSessionProtocol({ peer: 99 });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /unsupported/);
  });

  it("defaults omitted config field to current", () => {
    assert.equal(
      resolveDevSessionProtocolVersion({ schemaVersion: 1 }),
      DEV_SESSION_PROTOCOL_VERSION,
    );
  });
});
