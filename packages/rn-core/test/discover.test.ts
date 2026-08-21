import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { rmSync } from "node:fs";

import { discoverPlugins } from "../dist/discover.js";

const fixtures: string[] = [];

after(() => {
  for (const dir of fixtures) {
    rmSync(dir, { recursive: true, force: true });
  }
});

async function writeWorkspace(options: {
  plugins: Array<{
    dir: string;
    name: string;
    clientPlatform?: unknown;
  }>;
}): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "rn-core-discover-"));
  fixtures.push(root);
  await writeFile(
    path.join(root, "pnpm-workspace.yaml"),
    `packages:\n  - "plugins/*"\n  - "packages/*"\n`,
  );
  await mkdir(path.join(root, "packages"), { recursive: true });
  for (const plugin of options.plugins) {
    const pkgRoot = path.join(root, plugin.dir);
    await mkdir(pkgRoot, { recursive: true });
    const pkg: Record<string, unknown> = { name: plugin.name, private: true };
    if (plugin.clientPlatform !== undefined) {
      pkg.clientPlatform = plugin.clientPlatform;
    }
    await writeFile(path.join(pkgRoot, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
  }
  return root;
}

describe("discoverPlugins", () => {
  it("returns records for workspace packages with clientPlatform, without importing export", async () => {
    const root = await writeWorkspace({
      plugins: [
        {
          dir: "plugins/hello",
          name: "@client-platform/rn-plugin-example-hello",
          clientPlatform: {
            id: "example-hello",
            kind: "cli-command",
            apiVersion: 1,
            export: "./dist/register.js",
          },
        },
        {
          dir: "packages/rn-core",
          name: "@client-platform/rn-core",
        },
      ],
    });

    const records = await discoverPlugins({ cwd: path.join(root, "plugins/hello") });

    assert.equal(records.length, 1);
    assert.deepEqual(records[0], {
      id: "example-hello",
      kind: "cli-command",
      apiVersion: 1,
      export: "./dist/register.js",
      packageName: "@client-platform/rn-plugin-example-hello",
      packageRoot: path.join(root, "plugins/hello"),
    });
  });

  it("skips apiVersion mismatch and warns instead of throwing", async () => {
    const root = await writeWorkspace({
      plugins: [
        {
          dir: "plugins/legacy",
          name: "@test/legacy",
          clientPlatform: {
            id: "legacy",
            kind: "cli-command",
            apiVersion: 99,
            export: "./dist/register.js",
          },
        },
      ],
    });
    const warnings: string[] = [];

    const records = await discoverPlugins({
      cwd: root,
      onWarn: (message) => warnings.push(message),
    });

    assert.deepEqual(records, []);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0] ?? "", /apiVersion/);
  });
});
