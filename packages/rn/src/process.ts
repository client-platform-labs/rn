import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

export { envForIsolatedNpm } from "./npm-policy.js";

export function commandExists(command: string): boolean {
  const isWin = process.platform === "win32";
  const checker = isWin ? "where" : "which";
  const result = spawnSync(checker, [command], {
    encoding: "utf8",
    shell: false,
  });
  return result.status === 0;
}

export function spawnSyncCapture(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    /** When true, `env` replaces process.env instead of merging. */
    replaceEnv?: boolean;
  } = {},
): { status: number | null; stdout: string; stderr: string } {
  const env = options.replaceEnv
    ? options.env
    : options.env
      ? { ...process.env, ...options.env }
      : process.env;
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  return {
    status: result.status,
    stdout: result.stdout?.toString() ?? "",
    stderr: result.stderr?.toString() ?? "",
  };
}

export async function runStreaming(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    /** When true, `env` replaces process.env instead of merging. */
    replaceEnv?: boolean;
  } = {},
): Promise<number> {
  return new Promise((resolve, reject) => {
    const env = options.replaceEnv
      ? options.env
      : { ...process.env, ...options.env };
    const child = spawn(command, args, {
      cwd: options.cwd,
      env,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

export function resolveNpx(): string {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

export function findAndroidSdkRoot(): string | undefined {
  const fromEnv =
    process.env.ANDROID_HOME?.trim() || process.env.ANDROID_SDK_ROOT?.trim();
  if (fromEnv && existsSync(fromEnv)) {
    return fromEnv;
  }
  const home = process.env.HOME;
  if (!home) {
    return undefined;
  }
  const candidates = [
    path.join(home, "Library", "Android", "sdk"),
    path.join(home, "Android", "Sdk"),
    "/opt/homebrew/share/android-commandlinetools",
    "/usr/local/share/android-commandlinetools",
  ];
  return candidates.find((p) => existsSync(p));
}
