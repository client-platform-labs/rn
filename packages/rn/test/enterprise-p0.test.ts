import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { evaluateEnterpriseDoctor } from "../dist/enterprise-doctor.js";
import {
  applyTopologyBAfterInit,
  linkModuleToDevSession,
  scaffoldModuleWorkspace,
} from "../dist/module-workspace.js";
import { parseInitStarter } from "../dist/commands/init.js";

describe("module workspace + enterprise doctor", () => {
  it("parses init starters", () => {
    assert.equal(parseInitStarter(undefined), "topology-b");
    assert.equal(parseInitStarter("inline-main"), "inline-main");
    assert.throws(() => parseInitStarter("nope"));
  });

  it("scaffolds and links a module workspace", () => {
    const root = mkdtempSync(path.join(tmpdir(), "rn-mod-"));
    try {
      writeFileSync(
        path.join(root, "package.json"),
        JSON.stringify({ name: "app", dependencies: { "react-native": "0.87.0" } }),
      );
      scaffoldModuleWorkspace({ projectRoot: root, moduleId: "checkout" });
      assert.ok(existsSync(path.join(root, "modules/checkout/index.js")));
      const config = linkModuleToDevSession({
        projectRoot: root,
        moduleId: "checkout",
      });
      assert.ok(config.modules.checkout?.metroPort);
      assert.match(
        config.modules.checkout!.entry!,
        /modules\/checkout/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("applyTopologyBAfterInit wires shell App + main module", () => {
    const root = mkdtempSync(path.join(tmpdir(), "rn-topo-"));
    try {
      writeFileSync(
        path.join(root, "package.json"),
        JSON.stringify({ name: "app", dependencies: { "react-native": "0.87.0" } }),
      );
      writeFileSync(
        path.join(root, "App.tsx"),
        `export default function App() { return null }\n`,
      );
      const applied = applyTopologyBAfterInit(root);
      assert.ok(existsSync(path.join(root, "modules/main/package.json")));
      assert.ok(existsSync(path.join(root, ".rn/dev-session.jsonc")));
      assert.ok(existsSync(path.join(root, ".rn/host-profile.jsonc")));
      const app = readFileSync(applied.appEntry, "utf8");
      assert.match(app, /modules\/main/);
      const profile = readFileSync(
        path.join(root, ".rn/host-profile.jsonc"),
        "utf8",
      );
      assert.match(profile, /shell-plus-modules/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("enterprise doctor passes topology B layout", () => {
    const root = mkdtempSync(path.join(tmpdir(), "rn-ent-"));
    try {
      writeFileSync(
        path.join(root, "package.json"),
        JSON.stringify({ name: "app", dependencies: { "react-native": "0.87.0" } }),
      );
      writeFileSync(path.join(root, "App.tsx"), "export default function App(){return null}\n");
      applyTopologyBAfterInit(root);
      const sessionRaw = readFileSync(
        path.join(root, ".rn/dev-session.jsonc"),
        "utf8",
      );
      const session = JSON.parse(
        sessionRaw
          .split("\n")
          .filter((l) => !l.trim().startsWith("//"))
          .join("\n"),
      );
      const checks = evaluateEnterpriseDoctor({
        projectRoot: root,
        session,
      });
      const failed = checks.filter((c) => !c.ok && c.blocking);
      assert.equal(
        failed.length,
        0,
        failed.map((f) => f.summary).join("; "),
      );
      assert.ok(checks.some((c) => c.id === "p0-topology-b-main" && c.ok));
      assert.ok(checks.some((c) => c.id === "p0-load-gate-api" && c.ok));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("enterprise doctor flags global pollution", () => {
    const root = mkdtempSync(path.join(tmpdir(), "rn-poll-"));
    try {
      mkdirSync(path.join(root, "modules/main/src"), { recursive: true });
      writeFileSync(
        path.join(root, "modules/main/src/bad.ts"),
        `globalThis.__hack = true;\n`,
      );
      const checks = evaluateEnterpriseDoctor({
        projectRoot: root,
        session: null,
      });
      const pollution = checks.find((c) => c.id === "p0-global-pollution");
      assert.ok(pollution);
      assert.equal(pollution?.ok, false);
      assert.equal(pollution?.blocking, true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
