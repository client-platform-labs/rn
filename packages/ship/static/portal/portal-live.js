/**
 * Map E E-T10 — hydrate high-fidelity portal prototypes from Distribution API.
 */
(function (global) {
  /** dist-staging.tiangong.local → 预发；dist.tiangong.local → 生产 */
  function defaultLaneFromHost() {
    const h = (global.location?.hostname || "").toLowerCase();
    if (h.includes("staging") || h.includes("test") || h.includes("预发")) {
      return "staging";
    }
    return "production";
  }

  function defaultKindFromLane(lane) {
    return lane === "staging" ? "test" : "production";
  }

  function authHeaders() {
    ensureDefaultToken();
    const token = sessionStorage.getItem("rn_cp_token") || "";
    const headers = {};
    if (token) headers.authorization = `Bearer ${token}`;
    return headers;
  }

  /** 默认 token=dev，便于本机 portal 写操作；可用 ?token= 覆盖 */
  function ensureDefaultToken() {
    if (sessionStorage.getItem("rn_cp_token")) return;
    const q = new URLSearchParams(global.location?.search || "").get("token");
    sessionStorage.setItem("rn_cp_token", (q || "dev").trim());
  }

  async function fetchJson(path) {
    const res = await fetch(path, { headers: authHeaders() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || res.statusText || String(res.status));
    }
    return data;
  }

  function basename(p) {
    if (!p) return "artifact";
    const parts = String(p).split("/");
    return parts[parts.length - 1] || "artifact";
  }

  function mapHostCandidate(api, kind) {
    const file = basename(api.path);
    const label =
      api.release_id ||
      api.update_id ||
      file.replace(/\.(apk|ipa|aab)$/i, "") ||
      api.digest.slice(0, 12);
    return {
      installable: true,
      module: "app-host",
      downloads: 0,
      activeUsers: 0,
      digest: api.digest,
      platform: api.platform || "android",
      lane: kind === "test" ? "staging" : "production",
      kind,
      label,
      versionCode: 0,
      artifact: file,
      sizeMb: 0,
      blobUri: api.download_url || `/v1/artifacts/${encodeURIComponent(api.digest)}`,
      releaseId: api.release_id,
      fingerprint: (api.runtime_fingerprint_digest || "").slice(0, 16),
    };
  }

  function mapJsBundle(api, kind) {
    const mod = api.business_module || "module";
    const file = basename(api.path);
    const label = api.update_id || api.release_id || file || api.digest.slice(0, 12);
    return {
      module: mod,
      fingerprint: (api.runtime_fingerprint_digest || "fp").slice(0, 16),
      checks: 0,
      downloads: 0,
      activeUsers: 0,
      channel: kind === "test" ? "staging" : "production",
      digest: api.digest,
      kind,
      label,
      updateId: api.update_id,
      storageUri: api.download_url || `/v1/artifacts/${encodeURIComponent(api.digest)}`,
    };
  }

  async function fetchHostCandidates() {
    const [staging, production] = await Promise.all([
      fetchJson("/v1/candidates?lane=staging"),
      fetchJson("/v1/candidates?lane=production"),
    ]);
    const list = [
      ...(staging.candidates || []).map((c) => mapHostCandidate(c, "test")),
      ...(production.candidates || []).map((c) => mapHostCandidate(c, "production")),
    ];
    return list;
  }

  async function fetchJsBundles(moduleId) {
    const [staging, production] = await Promise.all([
      fetchJson(`/v1/js-updates?lane=staging${moduleId ? `&module=${encodeURIComponent(moduleId)}` : ""}`),
      fetchJson(`/v1/js-updates?lane=production${moduleId ? `&module=${encodeURIComponent(moduleId)}` : ""}`),
    ]);
    const list = [
      ...(staging.candidates || []).map((c) => mapJsBundle(c, "test")),
      ...(production.candidates || []).map((c) => mapJsBundle(c, "production")),
    ];
    return list;
  }

  async function fetchDependencyManifest() {
    const res = await fetch("/v1/dependency-manifest", { headers: authHeaders() });
    if (!res.ok) return { dependencies: [], version_labels: {} };
    return res.json();
  }

  function mapRelationShell(api, kind, platform) {
    const fp = (api.runtime_fingerprint_digest || "unknown").slice(0, 16);
    const file = basename(api.path);
    return {
      digest: api.digest,
      label: api.release_id || file.replace(/\.(apk|ipa|aab)$/i, "") || api.digest.slice(0, 12),
      runtimeLine: fp,
      kind: kind === "test" ? "test" : "production",
      provides: [],
      activeShare: 0,
      platform: api.platform || platform,
      updateId: api.update_id,
    };
  }

  function mapRelationBundle(api, kind) {
    const fp = (api.runtime_fingerprint_digest || "unknown").slice(0, 16);
    return {
      digest: api.digest,
      module: api.business_module || "module",
      label: api.update_id || api.release_id || api.digest.slice(0, 12),
      kind: kind === "test" ? "test" : "production",
      runtimeLine: fp,
      shellMin: "—",
      needs: [],
      activeUsers: 0,
      updateId: api.update_id,
    };
  }

  async function hydrateRelationWorld(platform = "android") {
    const [stagingHosts, prodHosts, stagingJs, prodJs, manifest] = await Promise.all([
      fetchJson("/v1/candidates?lane=staging"),
      fetchJson("/v1/candidates?lane=production"),
      fetchJson("/v1/js-updates?lane=staging"),
      fetchJson("/v1/js-updates?lane=production"),
      fetchDependencyManifest(),
    ]);

    const shells = [
      ...(stagingHosts.candidates || [])
        .filter((c) => (c.platform || "android") === platform)
        .map((c) => mapRelationShell(c, "test", platform)),
      ...(prodHosts.candidates || [])
        .filter((c) => (c.platform || "android") === platform)
        .map((c) => mapRelationShell(c, "production", platform)),
    ];

    const bundles = [
      ...(stagingJs.candidates || []).map((c) => mapRelationBundle(c, "test")),
      ...(prodJs.candidates || []).map((c) => mapRelationBundle(c, "production")),
    ];

    const idToDigest = {};
    for (const b of bundles) {
      if (b.updateId) idToDigest[b.updateId] = b.digest;
    }

    const bundleDeps = (manifest.dependencies || []).map((edge) => ({
      from: idToDigest[edge.from_update_id] || edge.from_update_id,
      to: edge.to_update_id ? idToDigest[edge.to_update_id] || edge.to_update_id : undefined,
      toModule: edge.to_module,
      toRange: edge.to_range,
      strength: edge.strength,
      kind: edge.kind,
      reason: edge.reason,
    }));

    const fleet = {};
    for (const s of shells) {
      fleet[s.digest] = {};
      for (const b of bundles) {
        if (b.runtimeLine === s.runtimeLine) {
          fleet[s.digest][b.module] = { embedded: b.digest, ota: b.digest };
        }
      }
    }

    return {
      platform,
      shells,
      bundles,
      bundleDeps,
      fleet,
      live: true,
      apiMsg: `分发 API 实数：${shells.length} 壳 · ${bundles.length} 包 · ${bundleDeps.length} 依赖边`,
    };
  }

  async function hydrateHostWorld(world, log) {
    const list = await fetchHostCandidates();
    world.cp.candidates = list;
    const lane = defaultLaneFromHost();
    const kind = defaultKindFromLane(lane);
    const pick =
      list.find((c) => c.kind === kind && c.platform === world.platform) ||
      list.find((c) => c.platform === world.platform) ||
      list[0];
    if (pick) world.console.selectedDigest = pick.digest;
    if (lane === "staging") {
      world.listFilter = "test";
      world.persona = "devqa";
    }
    const msg = `已接分发 API（${lane}）：${list.length} 个宿主装包候选`;
    if (typeof log === "function") log(world, msg);
    world.lastMsg = msg;
    return world;
  }

  async function hydrateJsWorld(world, log) {
    const list = await fetchJsBundles(world.moduleId);
    world.artifacts = list;
    const mods = {};
    for (const a of list) {
      if (!mods[a.module]) mods[a.module] = { name: a.module, fingerprint: a.fingerprint };
    }
    if (Object.keys(mods).length) world.modules = mods;
    const firstMod = list[0]?.module;
    if (firstMod && !list.some((a) => a.module === world.moduleId)) {
      world.moduleId = firstMod;
    }
    const lane = defaultLaneFromHost();
    const kind = defaultKindFromLane(lane);
    const pick =
      list.find((a) => a.module === world.moduleId && a.kind === kind) ||
      list.find((a) => a.module === world.moduleId) ||
      list[0];
    if (pick) {
      world.activeDigest = pick.digest;
      world.selectedDigest = pick.digest;
    }
    if (lane === "staging") {
      world.listFilter = "test";
      world.persona = "devqa";
    }
    const msg = `已接分发 API（${lane}）：${list.length} 个离线包（module=${world.moduleId}）`;
    if (typeof log === "function") log(world, msg);
    world.lastMsg = msg;
    return world;
  }

  global.PortalLive = {
    defaultLaneFromHost,
    ensureDefaultToken,
    fetchHostCandidates,
    fetchJsBundles,
    fetchDependencyManifest,
    hydrateHostWorld,
    hydrateJsWorld,
    hydrateRelationWorld,
  };
})(window);
