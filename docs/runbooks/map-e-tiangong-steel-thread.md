# Map E — tiangong-host + desk 端到端钢线

业务 [`desk`](/Users/xuwei/code/desk) · 壳 [`tiangong-host`](/Users/xuwei/code/tiangong-host)

## 一条命令验证

```bash
cd /Users/xuwei/Work/client-platform-labs/rn
node scripts/verify-map-e-tiangong-steel-thread.mjs
```

## 日常：本机运维验证页（有数据）

```bash
export NODE="$HOME/.nvm/versions/node/v24.19.0/bin/node"
export RD="/Users/xuwei/Work/client-platform-labs/rn/packages/rn-delivery/bin/rn-delivery.mjs"
export HOST="/Users/xuwei/code/tiangong-host"

cd "$HOST"
$NODE scripts/pack-business.mjs --plugin host-embed --module desk

$NODE "$RD" ingest-pack --module desk
$NODE "$RD" sign && $NODE "$RD" release

$NODE "$RD" ingest-host --apk android/app/build/outputs/apk/release/app-release.apk --profile release
$NODE "$RD" sign && $NODE "$RD" release --platform android

$NODE "$RD" cp-serve --port 4040 --host 0.0.0.0
# 浏览器 http://127.0.0.1:4040/
# 产品门户：/portal/host · /portal/js（晋级/灰度按钮直调 API，需填 token dev）
# 设备 OTA：Release 包设 global __TIANGONG_CP_BASE_URL__ 或 adb reverse 后指向本机
#   例：adb reverse tcp:4040 tcp:4040  +  http://127.0.0.1:4040
#   check URL: GET /v1/js-updates/check?module=desk&lane=production
# 本地灰度浸泡可缩短：RN_CP_MIN_SOAK_MS=5000（默认每步 60s）
```

## 新增 CLI

| 命令 | 用途 |
|------|------|
| `ingest-pack --module desk` | `pack-business` 的 HBC → js-update 候选 |
| `ingest-host --apk <path>` | 已有 APK → app-host 候选（跳过 Gradle） |

desk 在壳外 sibling 目录，用 D2 插件链 + ingest，不用 `update --module`（后者要求 `modules/<id>/`）。

## 注意

- Node **24.x**（引擎要求 `>=22 <25`）
- 优先用本仓库 `packages/rn-delivery/bin/rn-delivery.mjs`，全局 homebrew 可能过旧
- 钢线脚本会清空 `$HOST/.rn/delivery/registry.json` 后重写 staging
