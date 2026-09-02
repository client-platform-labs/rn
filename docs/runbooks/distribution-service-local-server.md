# 本机 Distribution 完整服务（双域名）

在 Mac 上搭好**与 ECS 同构**的分发服务，全链路验证通过后再 `sync-distribution-registry-to-ecs.mjs` 同步到 `47.93.214.189`。

## 架构

```text
dist.tiangong.local          ─┐
dist-staging.tiangong.local  ─┼─ Caddy :80（可选）─→ cp-serve :4040
127.0.0.1:4040               ─┘         registry = tiangong-host/.rn/delivery/
```

| 域名 | 用途 | 门户默认 |
|------|------|----------|
| `dist.tiangong.local` | **生产面** | production lane |
| `dist-staging.tiangong.local` | **测试面** | staging lane |

同一 `cp-serve` 进程、同一份 `registry.json`；域名只影响门户默认泳道与设备 `checkUpdate` 的 `lane` 参数。

## 一次性准备

### 1. /etc/hosts（本机）

```bash
sudo sh -c 'grep -q dist.tiangong.local /etc/hosts || echo "127.0.0.1 dist.tiangong.local dist-staging.tiangong.local" >> /etc/hosts'
```

### 2. Caddy（推荐，域名反代）

```bash
brew install caddy
```

不装 Caddy 也可直接用 `http://127.0.0.1:4040/` 或局域网 `http://192.168.x.x:4040/`。

### 3. 业务数据（desk + tiangong 钢线）

```bash
cd /Users/xuwei/Work/client-platform-labs/rn
node scripts/verify-map-e-tiangong-steel-thread.mjs
```

## 启动 / 停止

```bash
# 启动（自动释放 4040、写日志、可选 Caddy）
./scripts/setup-local-distribution-server.sh

# 停止
./scripts/stop-local-distribution-server.sh
```

环境变量（可选）：

| 变量 | 默认 |
|------|------|
| `TIANGONG_HOST` | `~/code/tiangong-host` |
| `RN_CP_TOKEN` | `dev` |
| `DIST_PROD_DOMAIN` | `dist.tiangong.local` |
| `DIST_STAGING_DOMAIN` | `dist-staging.tiangong.local` |

## 入口

| 页面 | URL |
|------|-----|
| 运维验证 | http://dist.tiangong.local/ |
| 装包台 | http://dist.tiangong.local/portal/host |
| JS 发版台（生产） | http://dist.tiangong.local/portal/js |
| JS 发版台（测试） | http://dist-staging.tiangong.local/portal/js |

管理令牌：`dev`（与 `RN_CP_TOKEN` 一致）。

## 全链路验证

```bash
node scripts/verify-local-distribution-chain.mjs
```

覆盖：health · registry · portal · `GET /v1/js-updates/check` · artifact 下载 · `POST /v1/promote`。

分项：

```bash
node scripts/verify-map-e-tiangong-steel-thread.mjs
node scripts/verify-map-e-portal-prototypes.mjs ~/code/tiangong-host
node scripts/verify-map-e-device-checkupdate.mjs ~/code/tiangong-host
```

## 真机 / 同 WiFi 设备

1. 本机 hosts 不够，需在**手机或另一台电脑** hosts 填局域网 IP：

   ```text
   192.168.2.3  dist.tiangong.local dist-staging.tiangong.local
   ```

2. Android 调试：

   ```bash
   adb reverse tcp:4040 tcp:4040
   # 或设 CP base: http://dist.tiangong.local（需手机能解析域名）
   ```

3. Release 包 OTA：`global.__TIANGONG_CP_BASE_URL__ = 'http://dist.tiangong.local'`

## 日常发布流（本机）

```bash
cd ~/code/tiangong-host
node scripts/pack-business.mjs --plugin host-embed --module desk
node …/rn-delivery.mjs ingest-pack --module desk
node …/rn-delivery.mjs sign && node …/rn-delivery.mjs release

# 浏览器 dist-staging → 验证 → 晋级
# 或 API: curl -X POST http://dist.tiangong.local/v1/promote -H "Authorization: Bearer dev" …
```

宿主 APK：`ingest-host` → sign → release → 装包台下载。

## 验证通过后同步 ECS

```bash
./scripts/deploy-distribution-ecs.sh          # ECS 需已装 Docker
node scripts/sync-distribution-registry-to-ecs.mjs
node scripts/verify-distribution-ecs.mjs
```

详见 [`distribution-service-aliyun-ecs.md`](./distribution-service-aliyun-ecs.md)。

## 日志

`~/code/tiangong-host/.rn/distribution-lab/logs/cp-serve.log`  
`~/code/tiangong-host/.rn/distribution-lab/logs/caddy.log`
