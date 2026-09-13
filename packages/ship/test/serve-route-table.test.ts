/**
 * C3 (#258) — the CP policy seam, driven in-process.
 *
 * These probes exist because the previous shape could only be reached by
 * spawning `ship serve` from a script: the route table, the auth/role gate and
 * the audit trail are now all reachable through `createControlPlane`, so they
 * can be asserted directly. No child process is started here.
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  createControlPlane,
  matchCpRoute,
  type CpRoute,
  type ControlPlaneHandle,
} from "../dist/serve.js";

const SERVE_SRC = path.resolve(import.meta.dirname, "../src/serve.ts");

/** Route count before the table existed (one `req.method ===` per path). */
const ROUTES_BEFORE_C3 = 34;
/** Mutating (bearer + role) routes before the table existed (14 requireCpAuth sites). */
const MUTATE_ROUTES_BEFORE_C3 = 14;

function makeProject(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "cp-routes-"));
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "cp-seam-demo" }));
  mkdirSync(path.join(root, ".rn", "delivery"), { recursive: true });
  writeFileSync(
    path.join(root, ".rn", "delivery", "registry.json"),
    JSON.stringify({ staging: [], production: [], blocked: [] }),
  );
  return root;
}

/** An ephemeral port we know is free, so the CP identity check stays happy. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const addr = probe.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

/** CP env is read at construction time, so it must be set before createControlPlane. */
const CP_ENV_KEYS = ["RN_CP_TOKEN", "RN_CP_TENANTS", "RN_CP_ROLE", "RN_CP_REGISTRY", "RN_CP_DISABLE_CONSOLE"];

async function startCp(
  root: string,
  env: Record<string, string>,
): Promise<ControlPlaneHandle> {
  const saved = new Map<string, string | undefined>();
  for (const k of CP_ENV_KEYS) {
    saved.set(k, process.env[k]);
    delete process.env[k];
  }
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  const port = await freePort();
  const handle = createControlPlane({ cwd: root, port, host: "127.0.0.1" });
  await handle.listen();
  // Restore immediately; the handle captured what it needs.
  for (const [k, v] of saved) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return handle;
}

async function call(
  handle: ControlPlaneHandle,
  pathname: string,
  init?: RequestInit,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`http://127.0.0.1:${handle.port}${pathname}`, init);
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body };
}

function auditLog(handle: ControlPlaneHandle): string {
  const file = path.join(
    handle.projectRoot,
    ".rn",
    "distribution-lab",
    "logs",
    "cp-audit.log",
  );
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

describe("CP route table (C3 / #258)", () => {
  it("declares every route as data: 34 routes, 14 of them policy-gated", async () => {
    const root = makeProject();
    let handle: ControlPlaneHandle | undefined;
    try {
      handle = await startCp(root, {});
      const routes: readonly CpRoute[] = handle.routes;
      assert.equal(routes.length, ROUTES_BEFORE_C3, "no route may be dropped by the table");
      const mutate = routes.filter((r) => r.role === "mutate");
      assert.equal(
        mutate.length,
        MUTATE_ROUTES_BEFORE_C3,
        "every previously auth-gated route stays policy-gated",
      );
      assert.ok(
        routes.every(
          (r) =>
            typeof r.handler === "function" &&
            (r.role === "public" || r.role === "mutate"),
        ),
        "every route carries a handler and a declared role",
      );
      // The policy-gated set must be exactly the mutating verbs we expect.
      const mutatePaths = mutate.map((r) => `${r.method} ${String(r.path)}`).sort();
      assert.deepEqual(mutatePaths, [
        "POST /v1/block",
        "POST /v1/kill",
        "POST /v1/pause",
        "POST /v1/promote",
        "POST /v1/resume",
        "POST /v1/rollout/advance",
        "POST /v1/rollout/pause",
        "POST /v1/rollout/resume",
        "POST /v1/rollout/slo-breach",
        "POST /v1/rollout/start",
        "POST /v1/rollout/tick",
        "POST /v1/sli",
        "PUT /^\\/v1\\/devices\\/([^/]+)\\/lane$/",
        "PUT /v1/dependency-manifest",
      ]);
    } finally {
      await handle?.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("unauthenticated write route → 401 and the denial is audited", async () => {
    const root = makeProject();
    let handle: ControlPlaneHandle | undefined;
    try {
      handle = await startCp(root, { RN_CP_TOKEN: "c3-secret", RN_CP_ROLE: "admin" });
      const res = await call(handle, "/v1/dependency-manifest", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dependencies: [] }),
      });
      assert.equal(res.status, 401);
      assert.match(String(res.body.error), /Bearer/);
      assert.match(auditLog(handle), /"outcome":"denied"/);
      assert.match(auditLog(handle), /"actor":"anonymous"/);
    } finally {
      await handle?.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("viewer role → 403 on a write route, but reads stay open", async () => {
    const root = makeProject();
    let handle: ControlPlaneHandle | undefined;
    try {
      const auth = { authorization: "Bearer c3-secret" };
      handle = await startCp(root, { RN_CP_TOKEN: "c3-secret", RN_CP_ROLE: "viewer" });
      const denied = await call(handle, "/v1/dependency-manifest", {
        method: "PUT",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({ dependencies: [] }),
      });
      assert.equal(denied.status, 403);
      assert.match(auditLog(handle), /"outcome":"denied"/);
      // read routes are public by design (ADR/rbac: viewer is read-only, not blind)
      const read = await call(handle, "/v1/service");
      assert.equal(read.status, 200);
      const registry = await call(handle, "/v1/registry");
      assert.equal(registry.status, 200);
    } finally {
      await handle?.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("authorized write route → 200 and an ok audit entry lands on disk", async () => {
    const root = makeProject();
    let handle: ControlPlaneHandle | undefined;
    try {
      handle = await startCp(root, { RN_CP_TOKEN: "c3-secret", RN_CP_ROLE: "admin" });
      const res = await call(handle, "/v1/dependency-manifest", {
        method: "PUT",
        headers: {
          authorization: "Bearer c3-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ dependencies: [] }),
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      const log = auditLog(handle);
      assert.match(log, /"outcome":"ok"/);
      assert.match(log, /"path":"\/v1\/dependency-manifest"/);
      assert.match(log, /"actor":"admin"/);
    } finally {
      await handle?.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("unknown route → 404 (unmatched paths fall through to one place)", async () => {
    const root = makeProject();
    let handle: ControlPlaneHandle | undefined;
    try {
      handle = await startCp(root, {});
      const res = await call(handle, "/v1/does-not-exist");
      assert.equal(res.status, 404);
      assert.equal(res.body.error, "not_found");
    } finally {
      await handle?.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("matchCpRoute: exact paths, method mismatch, and decoded regex params", () => {
    const exact: CpRoute = {
      method: "GET",
      path: "/health",
      role: "public",
      handler: async () => {},
    };
    assert.deepEqual(matchCpRoute(exact, "GET", "/health"), { params: { id: "" } });
    assert.equal(matchCpRoute(exact, "POST", "/health"), null);
    assert.equal(matchCpRoute(exact, "GET", "/healthz"), null);

    const artifact: CpRoute = {
      method: "GET",
      path: /^\/v1\/artifacts\/([^/]+)$/,
      role: "public",
      handler: async () => {},
    };
    assert.deepEqual(matchCpRoute(artifact, "GET", "/v1/artifacts/abc%2Fdef"), {
      params: { id: "abc/def" },
    });
    assert.equal(matchCpRoute(artifact, "GET", "/v1/artifacts"), null);
  });
});

describe("CP policy locality (C3 / #258)", () => {
  it("keeps auth, role and audit in exactly one place", () => {
    const src = readFileSync(SERVE_SRC, "utf8");
    const count = (re: RegExp): number => (src.match(re) ?? []).length;
    // Before: 14 inline requireCpAuth() calls; the wrapper replaces them all.
    assert.equal(count(/requireCpAuth\(\)/g), 0, "no inline auth gate may remain");
    // Before: 18 / 14 direct calls scattered across handlers.
    assert.equal(
      count(/appendAudit\(projectRoot/g),
      1,
      "audit must be reached through one wrapper only",
    );
    assert.equal(
      count(/loadRegistry\(projectRoot\)/g),
      1,
      "the registry must be loaded in one accessor only",
    );
    // Handlers must no longer branch on transport concerns.
    assert.equal(count(/req\.method ===/g), 0, "dispatch belongs to the table, not handlers");
  });
});
