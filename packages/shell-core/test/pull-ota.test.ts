import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { pullOtaUpdate } from "../dist/pull-ota.js";
import type {
  OtaNativeAdapter,
  OtaSidecar,
} from "../dist/ota-native.js";
import type { PullOtaClient } from "../dist/pull-ota.js";

function native(overrides: Partial<OtaNativeAdapter> = {}): OtaNativeAdapter {
  return {
    getOtaPublicKeys: () => [],
    ensureModuleSlots: async () => {},
    writeFileBase64: async (p) => p,
    writeFileUtf8: async (p) => p,
    setActiveBundlePathForModule: async () => {},
    clearActiveBundlePathForModule: async () => {},
    setRootModuleId: async () => {},
    reload: async () => {},
    ...overrides,
  };
}

function manifest(updateId = "u1"): OtaSidecar {
  return { update_id: updateId, business_module: "desk", channel: "default" };
}

describe("pullOtaUpdate orchestration (ADR-014)", () => {
  it("skips the already-installed update (no re-pull loop)", async () => {
    let fetchCalls = 0;
    let installCalls = 0;
    const client: PullOtaClient = {
      verifySidecar: () => ({ ok: true, updateId: "u1" }),
      async fetchUpdate() {
        fetchCalls += 1;
        return { hbcPath: "/t", sidecarPath: "/t", sidecar: {} };
      },
      async installAndReload() {
        installCalls += 1;
      },
    };
    const r = await pullOtaUpdate(
      client,
      native({ getInstalledUpdateId: async () => "u1" }),
      "desk",
      { fetchManifest: async () => manifest("u1") },
    );
    assert.equal(r.status, "already_installed");
    assert.equal(fetchCalls, 0);
    assert.equal(installCalls, 0);
  });

  it("installs a new update and persists update_id before reload", async () => {
    const persisted: string[] = [];
    const order: string[] = [];
    const client: PullOtaClient = {
      verifySidecar: () => ({ ok: true, updateId: "u2" }),
      async fetchUpdate() {
        return { hbcPath: "/t.hbc", sidecarPath: "/t.json", sidecar: manifest("u2") };
      },
      async installAndReload() {
        order.push("reload");
      },
    };
    const r = await pullOtaUpdate(
      client,
      native({
        getInstalledUpdateId: async () => null,
        setInstalledUpdateId: async (_m, id) => {
          persisted.push(id);
          order.push("persist");
        },
      }),
      "desk",
      { fetchManifest: async () => manifest("u2") },
    );
    assert.equal(r.status, "installed");
    assert.deepEqual(persisted, ["u2"]);
    assert.deepEqual(order, ["persist", "reload"]); // persist BEFORE reload
  });

  it("fails closed on verify failure and never fetches", async () => {
    let fetchCalls = 0;
    const client: PullOtaClient = {
      verifySidecar: () => ({ ok: false, reason: "bad signature" }),
      async fetchUpdate() {
        fetchCalls += 1;
        return { hbcPath: "/t", sidecarPath: "/t", sidecar: {} };
      },
      async installAndReload() {},
    };
    const r = await pullOtaUpdate(
      client,
      native(),
      "desk",
      { fetchManifest: async () => manifest("u9") },
    );
    assert.equal(r.status, "failed");
    if (r.status === "failed") assert.match(r.reason, /bad signature/);
    assert.equal(fetchCalls, 0);
  });

  it("returns no_update when the CP has nothing and failed on manifest fetch error", async () => {
    const client: PullOtaClient = {
      verifySidecar: () => ({ ok: true }),
      async fetchUpdate() {
        return { hbcPath: "/t", sidecarPath: "/t", sidecar: {} };
      },
      async installAndReload() {},
    };
    const none = await pullOtaUpdate(client, native(), "desk", {
      fetchManifest: async () => null,
    });
    assert.equal(none.status, "no_update");

    const err = await pullOtaUpdate(client, native(), "desk", {
      fetchManifest: async () => {
        throw new Error("CP down");
      },
    });
    assert.equal(err.status, "failed");
  });

  it("ADR-018: fails closed when the signing key is revoked", async () => {
    let fetchCalls = 0;
    let seenRevoked: readonly string[] | undefined;
    const client: PullOtaClient = {
      verifySidecar: (sidecar, revoked) => {
        seenRevoked = revoked;
        // the client would reject here — assert the revoked set reached it
        if (revoked && revoked.includes("k1hex")) {
          return { ok: false, reason: "signing key revoked" };
        }
        return { ok: true, updateId: "u1" };
      },
      async fetchUpdate() {
        fetchCalls += 1;
        return { hbcPath: "/t", sidecarPath: "/t", sidecar: {} };
      },
      async installAndReload() {},
    };
    const r = await pullOtaUpdate(client, native(), "desk", {
      fetchManifest: async () => manifest("u9"),
      fetchRevocations: async () => ["k1hex"],
    });
    assert.equal(r.status, "failed");
    if (r.status === "failed") assert.match(r.reason, /revoked/);
    assert.deepEqual(seenRevoked, ["k1hex"]);
    assert.equal(fetchCalls, 0); // revoked → never fetches
  });
});