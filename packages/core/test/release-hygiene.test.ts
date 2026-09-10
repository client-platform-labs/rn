import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  evaluateReleaseSourceHygiene,
  releaseSourceHygieneOk,
  scanApkReleaseHygiene,
} from "../dist/index.js";

describe("release source hygiene", () => {
  it("passes on a clean project tree", () => {
    const root = mkdtempSync(path.join(tmpdir(), "rn-release-hygiene-"));
    writeFileSync(
      path.join(root, "App.tsx"),
      "export default function App() { return null; }\n",
    );
    assert.equal(releaseSourceHygieneOk(root), true);
    assert.equal(
      evaluateReleaseSourceHygiene(root).every((c) => c.ok),
      true,
    );
  });

  it("fails when dev-support module dir exists", () => {
    const root = mkdtempSync(path.join(tmpdir(), "rn-release-hygiene-"));
    mkdirSync(path.join(root, "src", ".rn-dev-support"), { recursive: true });
    writeFileSync(
      path.join(root, "App.tsx"),
      "export default function App() {}\n",
    );
    const checks = evaluateReleaseSourceHygiene(root);
    const dirCheck = checks.find((c) => c.id === "release-dev-support-dir");
    assert.equal(dirCheck?.ok, false);
    assert.equal(dirCheck?.blocking, true);
  });

  it("fails when App.tsx wraps DevSupportRoot", () => {
    const root = mkdtempSync(path.join(tmpdir(), "rn-release-hygiene-"));
    writeFileSync(
      path.join(root, "App.tsx"),
      "import { DevSupportRoot } from './src/.rn-dev-support/DevSupportRoot';\nexport default function App() { return null; }\n",
    );
    const entry = evaluateReleaseSourceHygiene(root).find(
      (c) => c.id === "release-app-entry-clean",
    );
    assert.equal(entry?.ok, false);
  });
});

describe("scanApkReleaseHygiene", () => {
  it("flags dev markers in a fake APK buffer file", () => {
    const root = mkdtempSync(path.join(tmpdir(), "rn-release-apk-"));
    const apk = path.join(root, "fake.apk");
    writeFileSync(apk, "binary\x00DevSupportRoot\x00padding");
    const scan = scanApkReleaseHygiene(apk);
    assert.equal(scan[0]?.ok, false);
    assert.match(scan[0]?.summary ?? "", /DevSupportRoot/);
  });
});

describe("release debuggable-variants hygiene (F19/G8)", () => {
  function makeRoot(gradleBody: string | null): string {
    const root = mkdtempSync(path.join(tmpdir(), "rn-release-debug-"));
    mkdirSync(path.join(root, "android", "app"), { recursive: true });
    if (gradleBody !== null) {
      writeFileSync(
        path.join(root, "android", "app", "build.gradle"),
        gradleBody,
      );
    }
    return root;
  }

  it("flags missing debuggableVariants as ADVISORY (never blocking, N11)", () => {
    const root = makeRoot(null);
    const check = evaluateReleaseSourceHygiene(root).find(
      (c) => c.id === "release-debuggable-variants",
    );
    assert.ok(check);
    assert.equal(check?.ok, false);
    // N11: absence is the safe RN default — advisory only, must not block releases.
    assert.equal(check?.blocking, false);
  });

  it("non-Android project is N/A (not blocking)", () => {
    const root = mkdtempSync(path.join(tmpdir(), "rn-release-debug-"));
    const check = evaluateReleaseSourceHygiene(root).find(
      (c) => c.id === "release-debuggable-variants",
    );
    assert.ok(check);
    assert.equal(check?.ok, true);
    assert.equal(check?.blocking, false);
  });

  it("flags commented debuggableVariants (advisory)", () => {
    const root = makeRoot("react {\n    // debuggableVariants = []\n}\n");
    const check = evaluateReleaseSourceHygiene(root).find(
      (c) => c.id === "release-debuggable-variants",
    );
    assert.ok(check);
    assert.equal(check?.ok, false);
    assert.equal(check?.blocking, false);
  });

  it("passes on active debuggableVariants = []", () => {
    const root = makeRoot("android {\n    debuggableVariants = []\n}\n");
    const check = evaluateReleaseSourceHygiene(root).find(
      (c) => c.id === "release-debuggable-variants",
    );
    assert.ok(check);
    assert.equal(check?.ok, true);
  });
});
