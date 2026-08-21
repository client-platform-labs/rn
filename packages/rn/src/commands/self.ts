import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  unlinkSync,
  writeFileSync,
  rmSync,
  readFileSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import { CliError, EXIT_FAIL, EXIT_OK } from "../errors.js";
import type { CliLogger } from "../logger.js";
import {
  PROFILE_MARKER,
  defaultInstallHome,
  envFilePath,
  isManagedInstall,
  localBinDir,
  runningRepoRoot,
} from "../install-home.js";

function run(
  cmd: string,
  args: string[],
  cwd: string,
  logger: CliLogger,
): number {
  logger.info(`$ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: false });
  return r.status ?? 1;
}

function which(cmd: string): string | null {
  const r = spawnSync("which", [cmd], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() || null : null;
}

export async function runSelfUpdate(options: {
  logger: CliLogger;
}): Promise<void> {
  const home = defaultInstallHome();
  const repo = runningRepoRoot();

  if (!existsSync(path.join(repo, "package.json"))) {
    throw new CliError(`not a valid rn install at ${repo}`, EXIT_FAIL);
  }

  if (!isManagedInstall(home) && repo !== home) {
    options.logger.warn(
      `running from ${repo} (not ${home}). Updating this checkout; managed installs live under ~/.client-platform/rn`,
    );
  }

  const target = existsSync(path.join(home, ".git")) ? home : repo;

  if (existsSync(path.join(target, ".git"))) {
    const code = run("git", ["pull", "--ff-only"], target, options.logger);
    if (code !== 0) {
      throw new CliError("git pull failed", EXIT_FAIL);
    }
  } else {
    options.logger.warn("no .git directory — skip pull; rebuild only");
  }

  if (!which("pnpm")) {
    throw new CliError("pnpm required for update", EXIT_FAIL);
  }

  if (run("pnpm", ["install"], target, options.logger) !== 0) {
    throw new CliError("pnpm install failed", EXIT_FAIL);
  }
  if (run("pnpm", ["build"], target, options.logger) !== 0) {
    throw new CliError("pnpm build failed", EXIT_FAIL);
  }
  if (
    run("node", [path.join(target, "scripts/link-cli.mjs")], target, options.logger) !==
    0
  ) {
    throw new CliError("link-cli failed", EXIT_FAIL);
  }

  options.logger.writeHuman("rn self update: OK");
}

function removeProfileMarkers(): void {
  const profiles = [
    path.join(homedir(), ".zshrc"),
    path.join(homedir(), ".zprofile"),
    path.join(homedir(), ".bashrc"),
    path.join(homedir(), ".bash_profile"),
  ];
  for (const profile of profiles) {
    if (!existsSync(profile)) {
      continue;
    }
    const text = readFileSync(profile, "utf8");
    if (!text.includes(PROFILE_MARKER)) {
      continue;
    }
    const lines = text.split("\n");
    const out: string[] = [];
    let skipping = false;
    for (const line of lines) {
      if (line.trim() === PROFILE_MARKER) {
        skipping = true;
        continue;
      }
      if (skipping) {
        if (line.startsWith("export PATH=") || line.startsWith("# Added by client-platform")) {
          continue;
        }
        if (line.trim() === "") {
          skipping = false;
          continue;
        }
        skipping = false;
      }
      out.push(line);
    }
    writeFileSync(profile, out.join("\n"), "utf8");
  }
}

export async function runSelfUninstall(options: {
  logger: CliLogger;
  yes: boolean;
}): Promise<void> {
  if (!options.yes) {
    throw new CliError(
      "refusing to uninstall without --yes (destructive)",
      EXIT_FAIL,
    );
  }

  const home = defaultInstallHome();
  const binDir = localBinDir();

  for (const name of ["rn", "rn-delivery"] as const) {
    const link = path.join(binDir, name);
    try {
      if (existsSync(link)) {
        unlinkSync(link);
        options.logger.info(`removed ${link}`);
      }
    } catch (err) {
      options.logger.warn(`could not remove ${link}: ${err}`);
    }
  }

  // Best-effort npm unlink
  for (const pkg of ["@client-platform/rn", "@client-platform/rn-delivery"]) {
    spawnSync("npm", ["unlink", "-g", pkg], { stdio: "ignore" });
  }

  removeProfileMarkers();
  try {
    if (existsSync(envFilePath())) {
      unlinkSync(envFilePath());
    }
  } catch {
    /* ignore */
  }

  if (existsSync(home)) {
    options.logger.info(`removing install home ${home}`);
    rmSync(home, { recursive: true, force: true });
  }

  options.logger.writeHuman("rn self uninstall: OK");
  options.logger.writeHuman(
    "Open a new terminal (or unset PATH overrides). Reinstall: curl -fsSL https://raw.githubusercontent.com/client-platform-labs/rn/main/scripts/get-rn.sh | bash",
  );
}

export { EXIT_OK };
