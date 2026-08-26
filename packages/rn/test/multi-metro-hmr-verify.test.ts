import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  metroBundleUrl,
  metroStatusUrl,
  sampleDemoIsolationTargets,
  verifyDualBundleIsolation,
} from "../dist/multi-metro-hmr-verify.js";

describe("multi-metro HMR verify (unit)", () => {
  it("builds bundle + status URLs", () => {
    assert.equal(
      metroBundleUrl(8081, "index"),
      "http://127.0.0.1:8081/index.bundle?platform=android&dev=true&minify=false",
    );
    assert.equal(
      metroBundleUrl(8082, "index.support"),
      "http://127.0.0.1:8082/index.support.bundle?platform=android&dev=true&minify=false",
    );
    assert.equal(metroStatusUrl(8082), "http://127.0.0.1:8082/status");
  });

  it("sample demo targets point at dual entries", () => {
    const t = sampleDemoIsolationTargets("/tmp/app");
    assert.equal(t.modules[0].entry, "index");
    assert.equal(t.modules[1].entry, "index.support");
    assert.equal(t.modules[0].port, 8081);
    assert.equal(t.modules[1].port, 8082);
    assert.match(t.probes[1].filePath, /SupportModuleApp\.tsx$/);
  });
});

describe("multi-metro HMR verify (live)", () => {
  it("curl two bundles + mutate support without cross-contaminate", async (t) => {
    const projectRoot = process.env.RN_HMR_PROJECT;
    if (!projectRoot) {
      t.skip("set RN_HMR_PROJECT to a dual-module app with Metros on 8081/8082");
      return;
    }
    const { modules, probes } = sampleDemoIsolationTargets(projectRoot);
    const result = await verifyDualBundleIsolation({
      projectRoot,
      modules,
      probes,
      mutateIndex: 1,
    });
    assert.equal(
      result.ok,
      true,
      result.details.join("\n"),
    );
  });
});
