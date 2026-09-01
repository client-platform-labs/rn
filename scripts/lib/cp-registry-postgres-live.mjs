/**
 * Optional live Postgres roundtrip for Map B B8 verify (not imported by rn-delivery build).
 */
import { pathToFileURL } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const dist = path.join(repoRoot, "packages/rn-delivery/dist");

export async function tryPostgresRoundtrip(connectionUrl, tenant, registry) {
  let pg;
  try {
    pg = await import("pg");
  } catch {
    return { ok: false, skip: "pg not installed" };
  }

  const { CP_REGISTRY_POSTGRES_DDL } = await import(
    pathToFileURL(path.join(dist, "registry-postgres.js")).href
  );

  const client = new pg.Client({ connectionString: connectionUrl });
  await client.connect();
  try {
    await client.query(CP_REGISTRY_POSTGRES_DDL);
    await client.query(
      `INSERT INTO cp_registry_meta (tenant_id, product_app, key, value)
       VALUES ($1, $2, 'schemaVersion', '1')
       ON CONFLICT (tenant_id, product_app, key) DO NOTHING`,
      ["_bootstrap", "_bootstrap"],
    );

    const scope = [tenant.tenant_id, tenant.product_app];
    await client.query("BEGIN");
    try {
      await client.query(
        `DELETE FROM cp_candidates WHERE tenant_id = $1 AND product_app = $2`,
        scope,
      );
      for (const c of registry.staging) {
        await client.query(
          `INSERT INTO cp_candidates (tenant_id, product_app, lane, digest, metadata_json)
           VALUES ($1, $2, 'staging', $3, $4)`,
          [...scope, c.digest, JSON.stringify(c)],
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }

    const loaded = await client.query(
      `SELECT metadata_json FROM cp_candidates
       WHERE tenant_id = $1 AND product_app = $2 AND lane = 'staging'`,
      scope,
    );
    const digests = loaded.rows.map((r) => JSON.parse(r.metadata_json).digest);
    const expected = registry.staging.map((c) => c.digest);
    const ok =
      digests.length === expected.length &&
      expected.every((d) => digests.includes(d));
    return { ok, skip: null };
  } finally {
    await client.end();
  }
}
