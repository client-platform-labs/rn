# scripts/e2e/ — 全链路 E2E 自动化测试套件

> 覆盖：9 大类 × 壳+离线包全生命周期（新建+维护）
> 设备：adb 设备（默认取 `adb devices` 第一台）
> 后台：CP (4040) + Caddy (80) + Nous (8000)
> 跑测：bash scripts/e2e/run-all.sh

## 9 个 Chain

| # | Chain | 文件 | 覆盖 |
|---|-------|------|------|
| 1 | CLI 工具链 | `chain-01-cli.sh` | `rn` / `rn-delivery` 公开面 · POLA · help 完整性 |
| 2 | Debug 包加载多离线包 | `chain-02-debug-multi-bundle.sh` | adb reverse 6 端口 · 多 Metro · 多 bundle · loadPolicy=permissive |
| 3 | Release 壳加载 | `chain-03-release-load.sh` | registry · APK 拉取 · JS bundle 拉取 · 装包启动 · 无 FATAL |
| 4 | 壳全生命周期 | `chain-04-shell-lifecycle.sh` | 新建 / 调试 / 部署（ingest→sign→release→promote）/ 运维（pause/kill/rollout） |
| 5 | **业务包全生命周期** ★ | `chain-05-biz-lifecycle.sh` | 新建 / 调试 / OTA / 灰度 / AB / 维护（重装）/ 卸载 |
| 6 | 壳发布平台 | `chain-06-host-portal.sh` | CP /health · /v1/service · /portal/host · 鉴权 401 · 七阶段 |
| 7 | 离线包管理平台 | `chain-07-biz-portal.sh` | /portal/js · 注册 · 检索 · sidecar · catalog 挂载 · dependency-manifest |
| 8 | 离线包更新策略 | `chain-08-update-strategy.sh` | staging/production lane · device 切片 · Kill Switch · 完整性 · digest 一致性 |
| 9 | 后台服务 | `chain-09-backend-services.sh` | CP / Distribution / Nous · 鉴权 / artifact 落地 / 跨服务 / device→host CP |

## 用法

```bash
# 1. 装配套前置（一次性）
pnpm -r build              # 平台包构建
bash scripts/setup-local-distribution-server.sh  # 起 CP + Caddy
# 起 Nous（独立项目）
cd ~/code/nous && /Users/xuwei/code/nous/.venv/bin/nous serve &

# 2. 装壳（链 3 装一次，后续链复用）
DIGEST=$(curl -s -H "Authorization: Bearer dev" http://127.0.0.1:4040/v1/candidates?lane=staging | jq -r '.candidates[0].digest')
curl -sf -o /tmp/host.apk http://127.0.0.1:4040/v1/artifacts/$DIGEST
adb install -r -t /tmp/host.apk

# 3. 跑全链路
bash scripts/e2e/run-all.sh

# 或跑单个
bash scripts/e2e/run-all.sh 1 5 9

# 报告
ls -t /tmp/e2e-out/report-*.md | head -1
```

## 输出位置

- `/tmp/e2e-out/chain-NN-name.log` — 每条 chain 详细日志
- `/tmp/e2e-out/report-YYYYMMDD-HHMMSS.md` — 跑测总报告（人读）

## 退出码

- 0 = 全部 PASS
- 1 = 有 FAIL（看 `chain-NN.log` 末尾红色 ✗）
- 2 = chain 内部 SKIP（前置缺失，单 chain 跳；run-all 视为 0）

## 与 7 大类 release-readiness 套件的关系

- `scripts/release-readiness/` = **上市前**质量门禁（10 阶段 · 静态 · 一次性）
- `scripts/e2e/` = **运行时**全链路验证（9 chain · 动态 · 设备 + 后台）

两套互补：发版前跑 release-readiness，运行时（CI/夜跑/手动）跑 e2e。

## 已知局限（v1）

- iOS 不在 v1（你说今天先不跑 iOS）
- Harmony shelved
- 7 渠道（中国 Android 市场）只在 release-readiness 06 验
- 一台设备（多设备矩阵化待 Map B P1）
- 真后端只能跑 Nous；data-service / stock-screener 等需独立启动
