import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertSharedDevSessionProtocol,
  createBrownfieldReferenceHost,
  createGreenfieldReferenceHost,
  defaultDualModuleDevSession,
  DEV_SESSION_PROTOCOL_VERSION,
} from "../dist/index.js";

describe("GF ↔ BF Dev Session protocol", () => {
  it("shares protocol version + multi-port table", async () => {
    const config = defaultDualModuleDevSession();
    const opened: Array<{ surface: string; moduleId: string; url: string }> =
      [];

    const gf = createGreenfieldReferenceHost({
      config,
      openSurface: async (moduleId, binding) => {
        opened.push({
          surface: "greenfield",
          moduleId,
          url: binding.bundlerUrl,
        });
      },
    });
    const bf = createBrownfieldReferenceHost({
      config,
      openSurface: async (moduleId, binding) => {
        opened.push({
          surface: "brownfield",
          moduleId,
          url: binding.bundlerUrl,
        });
      },
    });

    assert.equal(gf.protocolVersion, DEV_SESSION_PROTOCOL_VERSION);
    assert.equal(bf.protocolVersion, DEV_SESSION_PROTOCOL_VERSION);
    assert.equal(gf.surfaceKind, "greenfield");
    assert.equal(bf.surfaceKind, "brownfield");

    const check = assertSharedDevSessionProtocol(gf, bf);
    assert.equal(check.ok, true, check.ok ? "" : check.detail);

    const ports = bf.bundler.listPortTable();
    assert.equal(ports.main, 8081);
    assert.equal(ports.support, 8082);
    assert.notEqual(ports.main, ports.support);

    await gf.surfaceHost.open("main");
    await bf.surfaceHost.open("support");
    assert.equal(gf.bundler.getFocusedModule(), "main");
    assert.equal(bf.bundler.getFocusedModule(), "support");
    assert.deepEqual(
      opened.map((o) => `${o.surface}:${o.moduleId}`),
      ["greenfield:main", "brownfield:support"],
    );
  });

  it("BF supports bundler URL override without collapsing ports", () => {
    const config = defaultDualModuleDevSession();
    const bf = createBrownfieldReferenceHost({
      config,
      openSurface: async () => {},
    });
    bf.bundler.setBundlerUrlOverride("support", "http://10.0.0.2:8082");
    assert.equal(
      bf.bundler.resolve("support").bundlerUrl,
      "http://10.0.0.2:8082",
    );
    assert.equal(bf.bundler.resolve("main").metroPort, 8081);
    assert.equal(bf.bundler.resolve("support").metroPort, 8082);
  });

  it("rejects incompatible peer protocol", () => {
    const config = defaultDualModuleDevSession();
    assert.throws(
      () =>
        createBrownfieldReferenceHost({
          config,
          peerProtocolVersion: 99,
          openSurface: async () => {},
        }),
      /unsupported/,
    );
  });

  it("applies the same L-C override semantics on BF controller", () => {
    const config = defaultDualModuleDevSession();
    const bf = createBrownfieldReferenceHost({
      config,
      openSurface: async () => {},
    });
    bf.controller.setRuntimeOverride("main", {
      apiBaseUrl: "http://bf-override.test",
    });
    assert.equal(
      bf.controller.getEffective("main").effective.apiBaseUrl,
      "http://bf-override.test",
    );
    assert.equal(
      bf.controller.getEffective("support").effective.apiBaseUrl,
      "http://127.0.0.1:3001",
    );
  });
});
