#!/usr/bin/env bash
# 本机 Distribution 完整服务：双域名 + cp-serve +（可选）Caddy
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${TIANGONG_HOST:-$HOME/code/tiangong-host}"
NODE="${NODE:-$HOME/.nvm/versions/node/v24.19.0/bin/node}"
RD="$REPO/packages/rn-delivery/bin/rn-delivery.mjs"
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo 127.0.0.1)"
PROD_DOMAIN="${DIST_PROD_DOMAIN:-dist.tiangong.local}"
STAGING_DOMAIN="${DIST_STAGING_DOMAIN:-dist-staging.tiangong.local}"
CP_PORT="${DISTRIBUTION_PORT:-4040}"
CADDY_PORT="${CADDY_HTTP_PORT:-80}"
LOG_DIR="${HOST}/.rn/distribution-lab/logs"
PID_CP="${HOST}/.rn/distribution-lab/cp-serve.pid"
PID_CADDY="${HOST}/.rn/distribution-lab/caddy.pid"

mkdir -p "$LOG_DIR" "${HOST}/.rn/distribution-lab"

echo "=== Map E 本机分发服务 ==="
echo "  壳工程 (registry): $HOST"
echo "  生产域名: http://${PROD_DOMAIN}"
echo "  测试域名: http://${STAGING_DOMAIN}"
echo "  局域网 IP: ${LAN_IP}（真机 /etc/hosts 或 DNS 可指向此 IP）"
echo ""

# --- /etc/hosts 提示 ---
need_hosts=0
for d in "$PROD_DOMAIN" "$STAGING_DOMAIN"; do
  if ! grep -q "$d" /etc/hosts 2>/dev/null; then
    need_hosts=1
  fi
done
if [ "$need_hosts" = 1 ]; then
  echo "→ 需要 sudo 写入 /etc/hosts（本机 + 可选局域网）："
  echo "  sudo sh -c 'grep -q ${PROD_DOMAIN} /etc/hosts || echo \"127.0.0.1 ${PROD_DOMAIN} ${STAGING_DOMAIN}\" >> /etc/hosts'"
  echo "  # 真机同 WiFi 时，在手机/另一台电脑 hosts 填: ${LAN_IP} ${PROD_DOMAIN} ${STAGING_DOMAIN}"
  echo ""
fi

# --- 停旧进程 ---
if [ -f "$PID_CP" ]; then
  old=$(cat "$PID_CP" 2>/dev/null || true)
  if [ -n "$old" ] && kill -0 "$old" 2>/dev/null; then
    echo "→ 停止旧 cp-serve (pid $old)"
    kill "$old" 2>/dev/null || true
    sleep 0.5
  fi
fi
if lsof -nP -iTCP:"$CP_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "→ 释放端口 $CP_PORT"
  lsof -tiTCP:"$CP_PORT" -sTCP:LISTEN | xargs kill 2>/dev/null || true
  sleep 0.5
fi

# --- 种子数据（无 registry 时跑钢线）---
if [ ! -f "${HOST}/.rn/delivery/registry.json" ] || \
   [ "$(wc -c < "${HOST}/.rn/delivery/registry.json" | tr -d ' ')" -lt 80 ]; then
  echo "→ 初始化 registry（tiangong 钢线）"
  "$NODE" "$REPO/scripts/verify-map-e-tiangong-steel-thread.mjs" || true
fi

# --- 启动 cp-serve ---
export RN_CP_TOKEN="${RN_CP_TOKEN:-dev}"
export RN_CP_MIN_SOAK_MS="${RN_CP_MIN_SOAK_MS:-5000}"
echo "→ 启动 cp-serve :${CP_PORT} (RN_CP_TOKEN=${RN_CP_TOKEN})"
cd "$HOST"
nohup "$NODE" "$RD" cp-serve --port "$CP_PORT" --host 0.0.0.0 \
  >>"$LOG_DIR/cp-serve.log" 2>&1 &
CP_PID=$!
disown "$CP_PID" 2>/dev/null || true
echo "$CP_PID" >"$PID_CP"
# 等 CP_PID 真正 listen 在 $CP_PORT（避免老进程残留导致 EADDRINUSE 后悄悄死掉）
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  if ! kill -0 "$CP_PID" 2>/dev/null; then
    echo "cp-serve 进程已退出（pid $CP_PID），见 $LOG_DIR/cp-serve.log"
    tail -30 "$LOG_DIR/cp-serve.log"
    exit 1
  fi
  if lsof -nP -iTCP:"$CP_PORT" -sTCP:LISTEN -p "$CP_PID" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done
curl -sf "http://127.0.0.1:${CP_PORT}/health" >/dev/null || {
  echo "cp-serve 启动失败，见 $LOG_DIR/cp-serve.log"
  tail -20 "$LOG_DIR/cp-serve.log"
  exit 1
}

# --- Caddy（可选，需 brew install caddy）---
if command -v caddy >/dev/null 2>&1; then
  if [ -f "$PID_CADDY" ]; then
    oldc=$(cat "$PID_CADDY" 2>/dev/null || true)
    kill "$oldc" 2>/dev/null || true
  fi
  if lsof -nP -iTCP:"$CADDY_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "→ 端口 ${CADDY_PORT} 已被占用，跳过 Caddy（可直接用 :${CP_PORT}）"
  else
    echo "→ 启动 Caddy :${CADDY_PORT}（双域名反代）"
    nohup caddy run --config "$REPO/deploy/distribution-service/local/Caddyfile" \
      >"$LOG_DIR/caddy.log" 2>&1 &
    echo $! >"$PID_CADDY"
    sleep 0.5
  fi
else
  echo "→ 未安装 Caddy，跳过域名反代。安装: brew install caddy"
  echo "  暂用 http://127.0.0.1:${CP_PORT}/ 与 http://${LAN_IP}:${CP_PORT}/"
fi

echo ""
echo "=== 就绪 ==="
echo "  运维验证:  http://${PROD_DOMAIN}/  或  http://127.0.0.1:${CP_PORT}/"
echo "  装包台:    http://${PROD_DOMAIN}/portal/host"
echo "  JS 发版台: http://${PROD_DOMAIN}/portal/js"
echo "  测试面:    http://${STAGING_DOMAIN}/portal/js  （默认预发 lane）"
echo "  管理令牌:  ${RN_CP_TOKEN}"
echo "  日志:      $LOG_DIR/"
echo ""
echo "全链路验证:"
echo "  node $REPO/scripts/verify-local-distribution-chain.mjs"
echo ""
echo "停止:"
echo "  kill \$(cat $PID_CP) \$(cat $PID_CADDY 2>/dev/null) 2>/dev/null"
