#!/usr/bin/env node
/**
 * G4 — distribution service backup (ADR-014 冷重建契约).
 *
 * 产出一个带时间戳、可恢复的归档目录：
 *   manifest.json    — schemaVersion + 每项 sha256
 *   registry.sqlite  — 一致性快照（node:sqlite `VACUUM INTO`，等价 `sqlite3 .backup`）
 *   registry.json    — 当 RN_CP_REGISTRY=file 时的注册库（二选一）
 *   artifacts.tar    — .rn/delivery/artifacts/ 制品目录
 *   secrets.tar.age  — age 公钥加密（签名私钥 + .env），解密私钥人异地保管
 *
 * 用法（在项目根 / ECS 数据卷所在目录执行）：
 *   node deploy/distribution-service/backup.mjs <PROJECT_ROOT> \
 *     --backup-dir <dir> --age-recipient <age1...>
 *
 * 环境变量可替代参数：
 *   AGE_RECIPIENT  age 接收者公钥（必填，加密制品/私钥/.env）
 *   RN_CP_REGISTRY sqlite|file（默认 sqlite）
 *   RN_DELIVERY_SIGN_KEY_FILE 签名私钥文件路径（有则纳入加密备份）
 *   RN_DELIVERY_SIGN_KEY_PEM  内联 PEM（兜底，写入临时文件后纳入加密备份）
 *   ENV_FILE       部署 .env 路径（默认 deploy/distribution-service/.env；缺失则跳过）
 */
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const here = path.dirname(fileURLToPath(import.meta.url));

function arg(name, fallback = process.env[name]) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const projectRoot = path.resolve(process.argv[2] ?? process.cwd());
const ageRecipient = arg("age-recipient", process.env.AGE_RECIPIENT);
const backupRoot = path.resolve(arg("backup-dir", process.env.BACKUP_DIR ?? "./backups"));
const envFile = arg("env-file", process.env.ENV_FILE);

if (!ageRecipient?.trim()) {
  console.error("backup: AGE_RECIPIENT (or --age-recipient) is required");
  process.exit(1);
}

const registryDir = path.join(projectRoot, ".rn/delivery");
const artifactsDir = path.join(registryDir, "artifacts");
const signKeyFile = process.env.RN_DELIVERY_SIGN_KEY_FILE?.trim();
const signKeyPem = process.env.RN_DELIVERY_SIGN_KEY_PEM?.trim();
const useSqlite = (process.env.RN_CP_REGISTRY ?? "sqlite").trim().toLowerCase() === "sqlite";

const ts = new Date().toISOString().replace(/[:.]/g, "-");
const backupDir = path.join(backupRoot, `dist-${ts}`);
const workDir = path.join(backupDir, ".staging");
mkdirSync(workDir, { recursive: true });

const manifest = {
  schemaVersion: 1,
  created_at: new Date().toISOString(),
  project_root: projectRoot,
  items: {},
};

const failures = [];

function sha256File(p) {
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}

function sh(cmd) {
  const r = spawnSync("bash", ["-lc", cmd], { encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error((r.stderr || r.stdout || `exit ${r.status}`).trim());
  }
}

function record(rel, absPath) {
  manifest.items[rel] = {
    sha256: sha256File(absPath),
    bytes: statSync(absPath).size,
  };
}

// 1) registry: VACUUM INTO 一致性快照（等价 sqlite3 .backup），否则拷贝 registry.json
try {
  if (useSqlite) {
    const dbFile = path.join(registryDir, "registry.sqlite");
    if (existsSync(dbFile)) {
      const out = path.join(backupDir, "registry.sqlite");
      const db = new DatabaseSync(dbFile);
      db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
      db.close();
      record("registry.sqlite", out);
    }
  } else {
    const jsonFile = path.join(registryDir, "registry.json");
    if (existsSync(jsonFile)) {
      copyFileSync(jsonFile, path.join(backupDir, "registry.json"));
      record("registry.json", path.join(backupDir, "registry.json"));
    }
  }
} catch (e) {
  failures.push(`registry: ${e instanceof Error ? e.message : String(e)}`);
}

// 2) artifacts dir → tar
try {
  if (existsSync(artifactsDir)) {
    const out = path.join(backupDir, "artifacts.tar");
    sh(`tar -cf ${JSON.stringify(out)} -C ${JSON.stringify(artifactsDir)} .`);
    record("artifacts.tar", out);
  }
} catch (e) {
  failures.push(`artifacts: ${e instanceof Error ? e.message : String(e)}`);
}

// 3) sensitive: signing key (+ inline PEM fallback) + .env → tar → age encrypt
try {
  const secrets = path.join(workDir, "secrets");
  mkdirSync(secrets, { recursive: true });
  const resolveEnv = path.resolve(here, "..", "..", ".env");
  const envPaths = [envFile, resolveEnv, path.join(projectRoot, ".env")].filter(
    (p) => Boolean(p),
  );
  let collected = [];

  if (signKeyFile && existsSync(signKeyFile)) {
    copyFileSync(signKeyFile, path.join(secrets, "delivery-sign.pem"));
    collected.push("delivery-sign.pem");
  } else if (signKeyPem) {
    writeFileSync(path.join(secrets, "delivery-sign.pem"), signKeyPem, { mode: 0o600 });
    collected.push("delivery-sign.pem");
  }
  const env = envPaths.find((p) => existsSync(p));
  if (env) {
    copyFileSync(env, path.join(secrets, ".env"));
    collected.push(".env");
  }
  if (collected.length === 0) {
    console.warn("backup: no signing key / .env found — secrets archive skipped");
  } else {
    const tar = path.join(workDir, "secrets.tar");
    sh(`tar -cf ${JSON.stringify(tar)} -C ${JSON.stringify(secrets)} ${collected.join(" ")}`);
    const ageOut = path.join(backupDir, "secrets.tar.age");
    sh(
      `age -r ${JSON.stringify(ageRecipient)} -o ${JSON.stringify(ageOut)} ${JSON.stringify(tar)}`,
    );
    record("secrets.tar.age", ageOut);
  }
} catch (e) {
  failures.push(`secrets: ${e instanceof Error ? e.message : String(e)}`);
}

writeFileSync(
  path.join(backupDir, "manifest.json"),
  JSON.stringify({ ...manifest, failures }, null, 2) + "\n",
);
rmSync(workDir, { recursive: true, force: true });

console.log(JSON.stringify({ backup_dir: backupDir, items: Object.keys(manifest.items), failures }, null, 2));
if (failures.length > 0) process.exit(1);