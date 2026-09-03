import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  evaluateReleaseSourceHygiene,
  releaseSourceHygieneOk,
  scanApkReleaseHygiene,
} from "../dist/release-hygiene.js";

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
    writeFileSync(path.join(root, "App.tsx"), "export default function App() {}\n");
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

  it("fails on static shell/debug import in App.tsx", () => {
    const root = mkdtempSync(path.join(tmpdir(), "rn-release-hygiene-"));
    writeFileSync(
      path.join(root, "App.tsx"),
      "import { DevSessionDebugPanel } from './shell/debug/DevSessionDebugPanel';\nexport default function App() { return null; }\n",
    );
    const check = evaluateReleaseSourceHygiene(root).find(
      (c) => c.id === "release-no-static-dev-session-panel",
    );
    assert.equal(check?.ok, false);
    assert.equal(check?.blocking, true);
  });

  it("passes when ShellHost gates DevSessionDebugPanel with __DEV__", () => {
    const root = mkdtempSync(path.join(tmpdir(), "rn-release-hygiene-"));
    writeFileSync(
      path.join(root, "App.tsx"),
      "import { ShellHost } from './shell/ShellHost';\nexport default function App() { return null; }\n",
    );
    mkdirSync(path.join(root, "shell"), { recursive: true });
    writeFileSync(
      path.join(root, "shell", "ShellHost.tsx"),
      `let Panel = null;\nif (__DEV__) {\n  Panel = require("./debug/DevSessionDebugPanel").DevSessionDebugPanel;\n}\nexport function ShellHost() { return null; }\n`,
    );
    const check = evaluateReleaseSourceHygiene(root).find(
      (c) => c.id === "release-shellhost-devsession-gated",
    );
    assert.equal(check?.ok, true);
    assert.equal(releaseSourceHygieneOk(root), true);
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
