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
import { after, describe, it } from "node:test";

import {
  ensureModuleInDevSession,
  resolveRegisterModuleIds,
  runModuleRegisterFlow,
} from "../dist/module-catalog-register.js";
import { createLogger } from "../dist/logger.js";
import { CatalogStore } from "../dist/catalog/store.js";

const fixtures: string[] = [];

after(() => {
  for (const dir of fixtures) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function shellRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), "rn-mcr-"));
  fixtures.push(root);
  writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "tiangong-host" }),
  );
  mkdirSync(path.join(root, ".rn"));
  writeFileSync(
    path.join(root, ".rn", "host-profile.jsonc"),
    `{\n  "schemaVersion": 1,\n  "profile": "greenfield",\n  "productApp": "tiangong"\n}\n`,
  );
  return root;
}

describe("resolveRegisterModuleIds", () => {
  it("infers module id from --from alone", () => {
    const root = mkdtempSync(path.join(tmpdir(), "rn-ext-"));
    fixtures.push(root);
    writeFileSync(
      path.join(root, "client-platform.module.jsonc"),
      `{\n  "schemaVersion": 1,\n  "business_module": "desk",\n  "preferredMetroPort": 8081\n}\n`,
    );
    const r = resolveRegisterModuleIds({ moduleIds: [], from: root });
    assert.deepEqual(r.moduleIds, ["desk"]);
    assert.equal(r.from, root);
  });

  it("rejects --from with multiple module ids", () => {
    assert.throws(() =>
      resolveRegisterModuleIds({
        moduleIds: ["a", "b"],
        from: "/tmp/x",
      }),
    );
  });
});

describe("ensureModuleInDevSession", () => {
  it("links external repo via --from without modules/<id> workspace", () => {
    const shell = shellRoot();
    const ext = mkdtempSync(path.join(tmpdir(), "rn-desk-"));
    fixtures.push(ext);
    writeFileSync(
      path.join(ext, "client-platform.module.jsonc"),
      `{\n  "schemaVersion": 1,\n  "business_module": "desk",\n  "preferredMetroPort": 8081\n}\n`,
    );
    const logger = createLogger({ json: false, verbose: false });
    const result = ensureModuleInDevSession({
      projectRoot: shell,
      moduleId: "desk",
      from: ext,
      logger,
    });
    assert.equal(result.action, "linked_from_descriptor");
    assert.equal(result.metroPort, 8081);
    const session = readFileSync(path.join(shell, ".rn/dev-session.jsonc"), "utf8");
    assert.match(session, /"desk"/);
    assert.match(session, /8081/);
  });

  it("is idempotent when module already linked", () => {
    const shell = shellRoot();
    const ext = mkdtempSync(path.join(tmpdir(), "rn-desk2-"));
    fixtures.push(ext);
    writeFileSync(
      path.join(ext, "client-platform.module.jsonc"),
      `{\n  "schemaVersion": 1,\n  "business_module": "desk"\n}\n`,
    );
    const logger = createLogger({ json: false, verbose: false });
    ensureModuleInDevSession({
      projectRoot: shell,
      moduleId: "desk",
      from: ext,
      logger,
    });
    const again = ensureModuleInDevSession({
      projectRoot: shell,
      moduleId: "desk",
      logger,
    });
    assert.equal(again.action, "already_linked");
  });
});

describe("runModuleRegisterFlow", () => {
  it("register --from publishes catalog in one step", async () => {
    const shell = shellRoot();
    const ext = mkdtempSync(path.join(tmpdir(), "rn-desk3-"));
    fixtures.push(ext);
    writeFileSync(
      path.join(ext, "client-platform.module.jsonc"),
      `{\n  "schemaVersion": 1,\n  "business_module": "desk",\n  "productApp": "tiangong",\n  "preferredMetroPort": 8081\n}\n`,
    );
    const catalogRoot = mkdtempSync(path.join(tmpdir(), "rn-cat-"));
    fixtures.push(catalogRoot);
    const logger = createLogger({ json: false, verbose: false });
    await runModuleRegisterFlow({
      cwd: shell,
      logger,
      from: ext,
      catalogRoot,
      noEmbed: true,
    });
    const store = new CatalogStore(catalogRoot);
    const doc = store.read("tiangong");
    assert.ok(doc);
    assert.equal(doc!.modules.length, 1);
    assert.equal(doc!.modules[0]?.business_module, "desk");
    assert.ok(existsSync(path.join(shell, ".rn/dev-session.jsonc")));
  });
});
