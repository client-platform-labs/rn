#!/usr/bin/env node
/**
 * G4 — distribution service restore / 一键重建 (ADR-014).
 * 从 backup.mjs 产出的归档恢复到目标项目目录（任意装 Docker 的机器，含本地 Mac）。
 *
 * 用法：
 *   node deploy/distribution-service/restore.mjs <BACKUP_DIR> <PROJECT_ROOT> \
 *     --age-identity <path-to-age-private-key>
 *
 * 步骤：校验 manifest sha256 → age 解密 secrets → 复原 registry/artifacts → 健康检查提示。
 */
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : process.env[name];
}

const backupDir = path.resolve(process.argv[2]);
const projectRoot = path.resolve(process.argv[3]);
const ageIdentity = arg("age-identity");

if (!backupDir || !projectRoot) {
  console.error("restore: BACKUP_DIR and PROJECT_ROOT are required");
  process.exit(1);
}
if (!existsSync(backupDir)) {
  console.error(`restore: backup dir missing: ${backupDir}`);
  process.exit(1);
}

const manifestPath = path.join(backupDir, "manifest.json");
if (!existsSync(manifestPath)) {
  console.error(`restore: manifest.json missing in ${backupDir}`);
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

function sha256File(p) {
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}

function sh(cmd) {
  const r = spawnSync("bash", ["-lc", cmd], { encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error((r.stderr || r.stdout || `exit ${r.status}`).trim());
  }
}

const errors = [];

// 1) integrity check
for (const [rel, meta] of Object.entries(manifest.items ?? {})) {
  const p = path.join(backupDir, rel);
  if (!existsSync(p)) {
    errors.push(`${rel}: missing`);
    continue;
  }
  if (sha256File(p) !== meta.sha256) {
    errors.push(`${rel}: sha256 mismatch`);
  }
}

const registryDir = path.join(projectRoot, ".rn/delivery");
mkdirSync(registryDir, { recursive: true });

// 2) registry
try {
  if (manifest.items["registry.sqlite"]) {
    copySafe(path.join(backupDir, "registry.sqlite"), path.join(registryDir, "registry.sqlite"));
    const db = new DatabaseSync(path.join(registryDir, "registry.sqlite"));
    db.exec("PRAGMA journal_mode = WAL;");
    db.close();
  } else if (manifest.items["registry.json"]) {
    copySafe(path.join(backupDir, "registry.json"), path.join(registryDir, "registry.json"));
  }
} catch (e) {
  errors.push(`registry: ${e instanceof Error ? e.message : String(e)}`);
}

// 3) artifacts
try {
  if (manifest.items["artifacts.tar"]) {
    const dest = path.join(registryDir, "artifacts");
    mkdirSync(dest, { recursive: true });
    sh(`tar -xf ${JSON.stringify(path.join(backupDir, "artifacts.tar"))} -C ${JSON.stringify(dest)}`);
  }
} catch (e) {
  errors.push(`artifacts: ${e instanceof Error ? e.message : String(e)}`);
}

// 4) secrets (age decrypt) → signing key + .env
try {
  if (manifest.items["secrets.tar.age"]) {
    if (!ageIdentity) {
      errors.push("secrets: --age-identity required but not provided");
    } else {
      const dec = path.join(projectRoot, ".restore-staging");
      mkdirSync(dec, { recursive: true });
      const tar = path.join(dec, "secrets.tar");
      sh(
        `age -d -i ${JSON.stringify(ageIdentity)} -o ${JSON.stringify(tar)} ${JSON.stringify(path.join(backupDir, "secrets.tar.age"))}`,
      );
      sh(`tar -xf ${JSON.stringify(tar)} -C ${JSON.stringify(dec)}`);
      for (const f of ["delivery-sign.pem", ".env"]) {
        const src = path.join(dec, f);
        if (existsSync(src)) {
          copySafe(src, path.join(projectRoot, f));
        }
      }
      rmSync(dec, { recursive: true, force: true });
    }
  }
} catch (e) {
  errors.push(`secrets: ${e instanceof Error ? e.message : String(e)}`);
}

function copySafe(from, to) {
  // avoid copying onto itself when restoring into the same tree
  if (path.resolve(from) !== path.resolve(to)) {
    copyFileSync(from, to);
  }
}

if (errors.length > 0) {
  console.error(JSON.stringify({ ok: false, project_root: projectRoot, errors }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      project_root: projectRoot,
      restored: Object.keys(manifest.items ?? {}),
      next: [
        "cp deploy/distribution-service/.env.example deploy/distribution-service/.env (若未从备份恢复 .env)",
        "docker compose -f deploy/distribution-service/docker-compose.yml up -d --build",
        "curl http://127.0.0.1:4040/health  # 深检/可写磁盘/DB 见 runbook",
      ],
    },
    null,
    2,
  ),
);