import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function resolveDevSupportTemplateFile(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(here, "..", "templates", "dev-support", "DevSupportRoot.tsx"),
    path.join(here, "..", "..", "templates", "dev-support", "DevSupportRoot.tsx"),
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    throw new Error("dev-support template not found");
  }
  return found;
}
