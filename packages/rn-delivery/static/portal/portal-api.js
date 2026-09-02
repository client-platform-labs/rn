/**
 * Map E — portal mutating actions against Distribution API.
 */
(function (global) {
  const TOKEN_KEY = "rn_cp_token";

  function token() {
    return sessionStorage.getItem(TOKEN_KEY) || "";
  }

  function headers() {
    const h = { "content-type": "application/json" };
    const t = token();
    if (t) h.authorization = `Bearer ${t}`;
    return h;
  }

  function formatError(msg) {
    const text = String(msg || "");
    const soak = /min_soak not met — (\d+)ms remaining on ([\w-]+)/i.exec(text);
    if (soak) {
      const sec = Math.ceil(Number(soak[1]) / 1000);
      return `灰度浸泡未到：${soak[2]} 还需约 ${sec} 秒`;
    }
    if (text.includes("attach SBOM")) {
      return "晋级失败：需先 sign（SBOM 证据缺失）";
    }
    return text;
  }

  async function post(path, body) {
    const res = await fetch(path, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body ?? {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(formatError(data.error || res.statusText));
    return data;
  }

  global.PortalApi = {
    setToken(t) {
      sessionStorage.setItem(TOKEN_KEY, String(t || "").trim());
    },
    token,
    formatError,
    promote(digest) {
      return post("/v1/promote", { digest });
    },
    block(digest, reason) {
      return post("/v1/block", { digest, reason });
    },
    rolloutStart({ business_module, digest, update_id, gate }) {
      return post("/v1/rollout/start", {
        business_module,
        digest,
        update_id,
        gate: gate || "js-standard",
        min_soak_ms: 5000,
      });
    },
    rolloutAdvance(digest) {
      return post("/v1/rollout/advance", { digest });
    },
    rolloutPause(digest) {
      return post("/v1/rollout/pause", { digest });
    },
    rolloutResume(digest) {
      return post("/v1/rollout/resume", { digest });
    },
    kill(business_module, update_ids, reason) {
      return post("/v1/kill", { business_module, update_ids, reason });
    },
    pauseModule(business_module, reason) {
      return post("/v1/pause", { business_module, reason });
    },
    resumeModule(business_module) {
      return post("/v1/resume", { business_module });
    },
  };
})(window);
