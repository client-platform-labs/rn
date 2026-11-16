#!/usr/bin/env bash
# Two-machine same-region HA drill helper for #372 / SOP-CP-HA-02.
#
# Refuses to write kind=two-machine when ACTIVE_HOST and STANDBY_HOST are
# missing or normalize to the same value. Same-host two-process drills stay
# under evidence/cp-ha-failover-local/ and do not close #372.
#
# Usage (on the standby host, after snapshot/artifacts have been syncing):
#   ACTIVE_HOST=cp-a STANDBY_HOST=cp-b \
#   ACTIVE_PROJECT=/data/a STANDBY_PROJECT=/data/b \
#   SHARED_SNAPSHOTS=/mnt/ha-snapshots \
#   ACTIVE_READY_URL=http://cp-a:4040/ready \
#   DIGEST=<sha256> \
#   ./deploy/distribution-service/ha-two-machine-drill.sh record
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HA="$ROOT/deploy/distribution-service/ha-failover.mjs"
CMD="${1:-}"

die() {
  echo "ha-two-machine-drill: $*" >&2
  exit 2
}

norm_host() {
  # lowercase, strip trailing dots; empty stays empty
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed 's/\.$//'
}

require_two_hosts() {
  local a b
  a="$(norm_host "${ACTIVE_HOST:-}")"
  b="$(norm_host "${STANDBY_HOST:-}")"
  [[ -n "$a" && -n "$b" ]] || die "set distinct ACTIVE_HOST and STANDBY_HOST"
  [[ "$a" != "$b" ]] || die "ACTIVE_HOST and STANDBY_HOST normalize to the same value ($a); this is not a two-machine drill"
}

case "$CMD" in
  check-hosts)
    require_two_hosts
    echo "{\"ok\":true,\"active\":\"$(norm_host "$ACTIVE_HOST")\",\"standby\":\"$(norm_host "$STANDBY_HOST")\"}"
    ;;
  snapshot)
    require_two_hosts
    [[ -n "${ACTIVE_PROJECT:-}" && -n "${SHARED_SNAPSHOTS:-}" ]] || die "need ACTIVE_PROJECT and SHARED_SNAPSHOTS"
    node "$HA" snapshot --active "$ACTIVE_PROJECT" --snapshots "$SHARED_SNAPSHOTS"
    ;;
  artifacts)
    require_two_hosts
    [[ -n "${ACTIVE_PROJECT:-}" && -n "${STANDBY_PROJECT:-}" ]] || die "need ACTIVE_PROJECT and STANDBY_PROJECT"
    node "$HA" artifacts --active "$ACTIVE_PROJECT" --standby "$STANDBY_PROJECT"
    ;;
  failover)
    require_two_hosts
    [[ -n "${ACTIVE_READY_URL:-}" && -n "${SHARED_SNAPSHOTS:-}" && -n "${STANDBY_PROJECT:-}" ]] ||
      die "need ACTIVE_READY_URL, SHARED_SNAPSHOTS, STANDBY_PROJECT"
    # shellcheck disable=SC2086
    node "$HA" failover --ready-url "$ACTIVE_READY_URL" --snapshots "$SHARED_SNAPSHOTS" --standby "$STANDBY_PROJECT" ${FAILOVER_EXTRA:-}
    ;;
  record)
    require_two_hosts
    [[ -n "${STANDBY_PROJECT:-}" ]] || die "need STANDBY_PROJECT"
    local_bound="$STANDBY_PROJECT/.rn/delivery/ha-bound.json"
    [[ -f "$local_bound" ]] || die "missing $local_bound (run failover on standby first)"
    digest="${DIGEST:-}"
    [[ -n "$digest" ]] || die "set DIGEST to a known artifact sha256"
    art="$STANDBY_PROJECT/.rn/delivery/artifacts/$digest"
    [[ -f "$art" ]] || die "standby missing artifact $digest"

    standby_ready_url="${STANDBY_READY_URL:-}"
    ready_http="skipped"
    art_http="skipped"
    if [[ -n "$standby_ready_url" ]]; then
      ready_http="$(curl -sS -o /dev/null -w '%{http_code}' "$standby_ready_url" || true)"
      base="${standby_ready_url%/ready}"
      art_http="$(curl -sS -o /dev/null -w '%{http_code}' "$base/v1/artifacts/$digest" || true)"
    fi

    bound="$(cat "$local_bound")"
    taken_at="$(node -e "const b=JSON.parse(process.argv[1]); process.stdout.write(b.taken_at||'')" "$bound")"
    bound_at="$(node -e "const b=JSON.parse(process.argv[1]); process.stdout.write(b.bound_at||'')" "$bound")"
    age_s=""
    if [[ -n "$taken_at" && -n "$bound_at" ]]; then
      age_s="$(node -e "const t=Date.parse(process.argv[1]); const b=Date.parse(process.argv[2]); process.stdout.write(String(Math.round((b-t)/1000)))" "$taken_at" "$bound_at")"
    fi

    out_dir="${EVIDENCE_OUT:-$ROOT/evidence/cp-ha-failover-two-machine}"
    mkdir -p "$out_dir"
    stamp="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
    out="$out_dir/${stamp}.json"
    node -e '
      const fs = require("fs");
      const [out, active, standby, readyUrl, boundRaw, digest, age, readyHttp, artHttp] = process.argv.slice(1);
      const bound = JSON.parse(boundRaw);
      const ageSec = age === "" ? null : Number(age);
      if (ageSec != null && (ageSec < 0 || ageSec > 120)) {
        console.error("ha-two-machine-drill: snapshotAgeSeconds=" + ageSec + " (must be 0..120)");
        process.exit(2);
      }
      const rec = {
        ok: true,
        kind: "two-machine",
        note: "两台不同主机的同地域主备切换。同机两进程不得使用本文件。",
        active: { host: active, readyUrl },
        standby: { host: standby, haBound: bound },
        snapshotAgeSeconds: ageSec,
        digest,
        standbyReadyHttp: readyHttp,
        standbyArtifactHttp: artHttp,
        recordedAt: new Date().toISOString(),
      };
      fs.writeFileSync(out, JSON.stringify(rec, null, 2) + "\n");
      process.stdout.write(out + "\n");
    ' "$out" "$(norm_host "$ACTIVE_HOST")" "$(norm_host "$STANDBY_HOST")" \
      "${ACTIVE_READY_URL:-}" "$bound" "$digest" "$age_s" "$ready_http" "$art_http"
    ;;
  *)
    cat <<'EOF' >&2
usage:
  ha-two-machine-drill.sh check-hosts
  ha-two-machine-drill.sh snapshot|artifacts|failover
  ha-two-machine-drill.sh record

required env for two-machine:
  ACTIVE_HOST  STANDBY_HOST   (must differ after normalize)
  ACTIVE_PROJECT  STANDBY_PROJECT  SHARED_SNAPSHOTS  ACTIVE_READY_URL
  DIGEST   (for record)
optional:
  STANDBY_READY_URL  FAILOVER_EXTRA=--start  EVIDENCE_OUT
EOF
    exit 2
    ;;
esac
