/**
 * Map B — optional SQLite backing for CP file registry (opt-in via RN_CP_REGISTRY=sqlite).
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { DeliveryRegistry } from "./candidate-store.js";
import type { CandidateMetadata } from "./types.js";

const DELIVERY_STATE_DIR = ".rn/delivery";
const REGISTRY_FILE = "registry.json";

export const REGISTRY_SQLITE_FILE = "registry.sqlite";

export function useSqliteRegistry(): boolean {
  return process.env.RN_CP_REGISTRY?.trim().toLowerCase() === "sqlite";
}

function sqlitePath(projectRoot: string): string {
  return path.join(projectRoot, DELIVERY_STATE_DIR, REGISTRY_SQLITE_FILE);
}

function openDb(projectRoot: string): DatabaseSync {
  const file = sqlitePath(projectRoot);
  mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE IF NOT EXISTS registry_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS candidates (
      lane TEXT NOT NULL CHECK (lane IN ('staging', 'production')),
      digest TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      PRIMARY KEY (lane, digest)
    );
    CREATE TABLE IF NOT EXISTS blocked (
      digest TEXT PRIMARY KEY,
      record_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS kills (
      business_module TEXT PRIMARY KEY,
      record_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pauses (
      business_module TEXT PRIMARY KEY,
      record_json TEXT NOT NULL
    );
  `);
  const row = db
    .prepare("SELECT value FROM registry_meta WHERE key = 'schemaVersion'")
    .get() as { value: string } | undefined;
  if (!row) {
    db.prepare(
      "INSERT INTO registry_meta (key, value) VALUES ('schemaVersion', '1')",
    ).run();
  }
  return db;
}

function importJsonIfPresent(projectRoot: string, db: DatabaseSync): void {
  const jsonPath = path.join(projectRoot, DELIVERY_STATE_DIR, REGISTRY_FILE);
  if (!existsSync(jsonPath)) return;
  const count = db.prepare("SELECT COUNT(*) AS n FROM candidates").get() as {
    n: number;
  };
  if (count.n > 0) return;
  const parsed = JSON.parse(readFileSync(jsonPath, "utf8")) as DeliveryRegistry;
  saveRegistrySqlite(projectRoot, parsed, db);
}

export function loadRegistrySqlite(projectRoot: string): DeliveryRegistry {
  const db = openDb(projectRoot);
  importJsonIfPresent(projectRoot, db);
  const staging = (
    db
      .prepare(
        "SELECT metadata_json FROM candidates WHERE lane = 'staging' ORDER BY rowid",
      )
      .all() as Array<{ metadata_json: string }>
  ).map((r) => JSON.parse(r.metadata_json) as CandidateMetadata);
  const production = (
    db
      .prepare(
        "SELECT metadata_json FROM candidates WHERE lane = 'production' ORDER BY rowid",
      )
      .all() as Array<{ metadata_json: string }>
  ).map((r) => JSON.parse(r.metadata_json) as CandidateMetadata);
  const blocked = (
    db
      .prepare("SELECT record_json FROM blocked ORDER BY rowid")
      .all() as Array<{ record_json: string }>
  ).map((r) => JSON.parse(r.record_json) as DeliveryRegistry["blocked"][number]);
  const kills = (
    db
      .prepare("SELECT record_json FROM kills ORDER BY rowid")
      .all() as Array<{ record_json: string }>
  ).map((r) => JSON.parse(r.record_json) as DeliveryRegistry["kills"][number]);
  const pauses = (
    db
      .prepare("SELECT record_json FROM pauses ORDER BY rowid")
      .all() as Array<{ record_json: string }>
  ).map((r) => JSON.parse(r.record_json) as DeliveryRegistry["pauses"][number]);
  return { schemaVersion: 1, staging, production, blocked, kills, pauses };
}

export function saveRegistrySqlite(
  projectRoot: string,
  registry: DeliveryRegistry,
  existingDb?: DatabaseSync,
): void {
  const db = existingDb ?? openDb(projectRoot);
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM candidates").run();
    db.prepare("DELETE FROM blocked").run();
    db.prepare("DELETE FROM kills").run();
    db.prepare("DELETE FROM pauses").run();
    const insertCandidate = db.prepare(
      "INSERT INTO candidates (lane, digest, metadata_json) VALUES (?, ?, ?)",
    );
    for (const c of registry.staging) {
      insertCandidate.run("staging", c.digest, JSON.stringify(c));
    }
    for (const c of registry.production) {
      insertCandidate.run("production", c.digest, JSON.stringify(c));
    }
    const insertBlocked = db.prepare(
      "INSERT INTO blocked (digest, record_json) VALUES (?, ?)",
    );
    for (const b of registry.blocked) {
      insertBlocked.run(b.digest, JSON.stringify(b));
    }
    const insertKill = db.prepare(
      "INSERT INTO kills (business_module, record_json) VALUES (?, ?)",
    );
    for (const k of registry.kills ?? []) {
      insertKill.run(k.business_module, JSON.stringify(k));
    }
    const insertPause = db.prepare(
      "INSERT INTO pauses (business_module, record_json) VALUES (?, ?)",
    );
    for (const p of registry.pauses ?? []) {
      insertPause.run(p.business_module, JSON.stringify(p));
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function registryStoragePath(projectRoot: string): string {
  return useSqliteRegistry()
    ? sqlitePath(projectRoot)
    : path.join(projectRoot, DELIVERY_STATE_DIR, REGISTRY_FILE);
}
