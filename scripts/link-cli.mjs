#!/usr/bin/env node
/**
 * Link `rn` / `rn-delivery` onto the user PATH so this works without monorepo cwd:
 *
 *   mkdir app && cd app && rn init
 *
 * Invoked by:
 *   - `pnpm run link:cli` (explicit)
 *   - postinstall (automatic after `pnpm install`)
 *   - `./scripts/install.sh` (one-shot product install)
 *
 * `pnpm exec rn` remains monorepo-only (pnpm workspace rule).
 */
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = new Set(process.argv.slice(2));
const postinstall = args.has("--postinstall");
const soft = postinstall || args.has("--soft") || process.env.CI === "true";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const marker = "# client-platform-rn-cli";
const bins = [
  {
    name: "rn",
    packageDir: path.join(repoRoot, "packages/rn"),
    target: path.join(repoRoot, "packages/rn/bin/rn.mjs"),
  },
  {
    name: "rn-delivery",
    packageDir: path.join(repoRoot, "packages/rn-delivery"),
    target: path.join(repoRoot, "packages/rn-delivery/bin/rn-delivery.mjs"),
  },
];

function run(cmd, argsList, cwd, inherit = true) {
  const r = spawnSync(cmd, argsList, {
    cwd,
    stdio: inherit ? "inherit" : "pipe",
    encoding: "utf8",
    shell: false,
  });
  return r.status ?? 1;
}

function ensureBuilt() {
  if (existsSync(path.join(repoRoot, "packages/rn/dist/cli.js"))) {
    return;
  }
  console.log("building workspace (tsc -b)…");
  const code = run("pnpm", ["exec", "tsc", "-b"], repoRoot);
  if (code !== 0) {
    if (soft) {
      console.warn("build failed; skipping CLI link");
      process.exit(0);
    }
    process.exit(code);
  }
}

function linkNpmGlobal() {
  for (const b of bins) {
    if (!existsSync(b.target)) {
      throw new Error(`missing bin: ${b.target}`);
    }
    if (!postinstall) {
      console.log(`npm link (${b.name})…`);
    }
    const code = run(
      "npm",
      ["link", "--no-fund", "--no-audit", "--silent"],
      b.packageDir,
      !postinstall,
    );
    if (code !== 0 && !soft) {
      process.exit(code);
    }
  }
}

function linkLocalBin() {
  const localBin = path.join(homedir(), ".local", "bin");
  mkdirSync(localBin, { recursive: true });
  for (const b of bins) {
    const dest = path.join(localBin, b.name);
    try {
      if (existsSync(dest)) {
        unlinkSync(dest);
      }
      symlinkSync(b.target, dest);
      if (!postinstall) {
        console.log(`symlinked ${dest}`);
      }
    } catch (err) {
      console.warn(`could not symlink ${dest}: ${err}`);
    }
  }
  return localBin;
}

function ensurePathInShellProfiles(localBin) {
  const npmPrefix = spawnSync("npm", ["config", "get", "prefix"], {
    encoding: "utf8",
  }).stdout?.trim();
  const npmBin = npmPrefix ? path.join(npmPrefix, "bin") : "";

  const exportLine = [
    marker,
    `# Added by client-platform rn install — do not remove marker line above`,
    `export PATH="${localBin}${npmBin ? `:${npmBin}` : ""}:$PATH"`,
    "",
  ].join("\n");

  const profiles = [
    path.join(homedir(), ".zshrc"),
    path.join(homedir(), ".zprofile"),
    path.join(homedir(), ".bashrc"),
    path.join(homedir(), ".bash_profile"),
  ];

  for (const profile of profiles) {
    try {
      const existing = existsSync(profile) ? readFileSync(profile, "utf8") : "";
      if (existing.includes(marker)) {
        continue;
      }
      appendFileSync(profile, `\n${exportLine}`);
      if (!postinstall) {
        console.log(`updated PATH in ${profile}`);
      }
    } catch (err) {
      console.warn(`could not update ${profile}: ${err}`);
    }
  }

  // Machine-local env snippet for scripts / new shells.
  const confDir = path.join(homedir(), ".config", "client-platform");
  mkdirSync(confDir, { recursive: true });
  writeFileSync(
    path.join(confDir, "rn-env.sh"),
    `${exportLine}\n`,
    "utf8",
  );
}

function main() {
  if (process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true") {
    // CI uses pnpm exec from the workspace; skip user-global linking.
    if (postinstall) {
      process.exit(0);
    }
  }

  try {
    ensureBuilt();
    linkNpmGlobal();
    const localBin = linkLocalBin();
    ensurePathInShellProfiles(localBin);

    if (!postinstall) {
      console.log(`
CLI ready. Open a new terminal (or: source ~/.config/client-platform/rn-env.sh), then:

  mkdir /tmp/pure-rn-app && cd /tmp/pure-rn-app
  rn init
`);
    } else {
      console.log(
        "rn CLI linked for this user (mkdir && cd && rn init). New shells pick up PATH automatically.",
      );
    }
  } catch (err) {
    console.warn(err);
    if (!soft) {
      process.exit(1);
    }
  }
}

main();
