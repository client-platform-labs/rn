import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildRoutePrefixTable } from "../dist/route-prefix.js";
import { createShellRouter } from "../dist/shell-router.js";
import type { ShellOpenOptions } from "../dist/shell-router.js";

function deskSecondTable() {
  const r = buildRoutePrefixTable([
    { moduleId: "desk", pathRouting: true, routePrefix: "/desk" },
    { moduleId: "fixture_second", pathRouting: true, routePrefix: "/second" },
    { moduleId: "internal", pathRouting: false },
  ]);
  assert.equal(r.ok, true);
  if (!r.ok) throw new Error(r.reason);
  return r.table;
}

describe("ShellRouter (R-T5–R-T8)", () => {
  it("R-T5 push ensures then opens and navigates remainder with params", async () => {
    const ensured: string[] = [];
    const opened: Array<{ moduleId: string; opts: ShellOpenOptions }> = [];
    const navigated: Array<{ remainder: string; params?: Record<string, unknown> }> =
      [];

    const router = createShellRouter({
      findTable: deskSecondTable,
      ensureBundleReady: async (moduleId) => {
        ensured.push(moduleId);
        return { ok: true };
      },
      openSurface: async (moduleId, opts) => {
        opened.push({ moduleId, opts });
      },
      onUnmatched: async () => ({ ui: "builtin_error", reason: "unmatched_route" }),
    });
    router.registerBundleNavigator({
      moduleId: "desk",
      navigate: (remainder, params) => {
        navigated.push({ remainder, params });
      },
    });

    await router.push("/desk/home", { tab: "mine" });

    assert.deepEqual(ensured, ["desk"]);
    assert.equal(opened.length, 1);
    assert.equal(opened[0]?.moduleId, "desk");
    assert.equal(opened[0]?.opts.path, "/home");
    assert.deepEqual(opened[0]?.opts.params, { tab: "mine" });
    assert.deepEqual(navigated, [{ remainder: "/home", params: { tab: "mine" } }]);
  });

  it("R-T6 replace does not stack a backable shell entry", async () => {
    const opened: string[] = [];
    const router = createShellRouter({
      findTable: deskSecondTable,
      ensureBundleReady: async () => ({ ok: true }),
      openSurface: async (moduleId) => {
        opened.push(moduleId);
      },
      onUnmatched: async () => ({ ui: "builtin_error", reason: "unmatched_route" }),
    });
    router.registerBundleNavigator({
      moduleId: "desk",
      navigate: () => {},
    });
    router.registerBundleNavigator({
      moduleId: "fixture_second",
      navigate: () => {},
    });

    await router.push("/desk/a");
    await router.replace("/second/b");
    await router.back();

    // replace swapped top; back with empty/prior stack → no-op (no reopen of desk)
    assert.deepEqual(opened, ["desk", "fixture_second"]);
  });

  it("R-T7 push twice then back reopens previous shell entry", async () => {
    const opened: Array<{ moduleId: string; path?: string }> = [];
    const router = createShellRouter({
      findTable: deskSecondTable,
      ensureBundleReady: async () => ({ ok: true }),
      openSurface: async (moduleId, opts) => {
        opened.push({ moduleId, path: opts.path });
      },
      onUnmatched: async () => ({ ui: "builtin_error", reason: "unmatched_route" }),
    });
    for (const id of ["desk", "fixture_second"] as const) {
      router.registerBundleNavigator({ moduleId: id, navigate: () => {} });
    }

    await router.push("/desk/one");
    await router.push("/second/two");
    await router.back();

    assert.deepEqual(opened, [
      { moduleId: "desk", path: "/one" },
      { moduleId: "fixture_second", path: "/two" },
      { moduleId: "desk", path: "/one" },
    ]);
  });

  it("R-T7 back on empty stack is no-op", async () => {
    const opened: string[] = [];
    const router = createShellRouter({
      findTable: deskSecondTable,
      ensureBundleReady: async () => ({ ok: true }),
      openSurface: async (moduleId) => {
        opened.push(moduleId);
      },
      onUnmatched: async () => ({ ui: "builtin_error", reason: "unmatched_route" }),
    });
    await router.back();
    assert.deepEqual(opened, []);
  });

  it("R-T8 unmatched path calls onUnmatched (builtin)", async () => {
    const unmatched: string[] = [];
    const opened: string[] = [];
    const router = createShellRouter({
      findTable: deskSecondTable,
      ensureBundleReady: async () => ({ ok: true }),
      openSurface: async (moduleId) => {
        opened.push(moduleId);
      },
      onUnmatched: async (path) => {
        unmatched.push(path);
        return { ui: "builtin_error", reason: "unmatched_route" };
      },
    });

    await router.push("/unknown/path");
    assert.deepEqual(unmatched, ["/unknown/path"]);
    assert.deepEqual(opened, []);
  });

  it("R-T4 push never hits moduleId-only packages", async () => {
    const ensured: string[] = [];
    const router = createShellRouter({
      findTable: deskSecondTable,
      ensureBundleReady: async (moduleId) => {
        ensured.push(moduleId);
        return { ok: true };
      },
      openSurface: async () => {},
      onUnmatched: async () => ({ ui: "builtin_error", reason: "unmatched_route" }),
    });
    await router.push("/internal");
    assert.deepEqual(ensured, []);
  });

  it("ensure failure does not open surface", async () => {
    const opened: string[] = [];
    const router = createShellRouter({
      findTable: deskSecondTable,
      ensureBundleReady: async () => ({
        ok: false,
        degrade: { ui: "builtin_error", reason: "base_unready" },
      }),
      openSurface: async (moduleId) => {
        opened.push(moduleId);
      },
      onUnmatched: async () => ({ ui: "builtin_error", reason: "unmatched_route" }),
    });
    await router.push("/desk/x");
    assert.deepEqual(opened, []);
  });
});
