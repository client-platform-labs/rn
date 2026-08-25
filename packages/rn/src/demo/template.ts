import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runningRepoRoot } from "../install-home.js";

export function resolveSampleDemoTemplateDir(): string {
  const fromRepo = path.join(
    runningRepoRoot(),
    "packages",
    "rn",
    "templates",
    "sample-demo",
  );
  if (existsSync(fromRepo)) {
    return fromRepo;
  }
  const fromPackage = path.resolve(
    fileURLToPath(new URL("../../templates/sample-demo", import.meta.url)),
  );
  if (existsSync(fromPackage)) {
    return fromPackage;
  }
  throw new Error(`sample-demo template not found (tried ${fromRepo})`);
}
