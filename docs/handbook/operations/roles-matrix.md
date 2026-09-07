# ops 角色矩阵

Map G **G8** · parent [#200](https://github.com/client-platform-labs/rn/issues/200) · 本票 [#210](https://github.com/client-platform-labs/rn/issues/210)（w14 = a 角色细分）

三分类 ops 子角色：**壳运维**（壳发布与宿主交付）、**离线包运维**（JS 离线包 / OTA 钢线）、**平台运维**（CP / 分发服务 / 信任根 / DR）。每角色统一五段式：职责边界 · 日常任务与命令 · 监控阈值 · 升级路径 · 交接点。文末附 角色×平面矩阵、角色×命令矩阵、典型交接场景、行业 oncall 对照。

**原则红线（全程适用）：**

- 所有写路由（promote / block / kill / pause / resume / rollout）走 **rn-delivery + CP**，绝不用 `rn` 命令行发布（ADR-008 · engineering-principles）。
- 生产注册库 **SQLite**（`RN_CP_REGISTRY=sqlite`），不建 PG（[ADR-013](../../adr/013-sqlite-registry-no-postgres.md)）；DR = **冷重建**，无「温备」（[ADR-014](../../adr/014-dr-cold-rebuild.md)）。
- 设备验签 **fail-closed**：release 拒绝 digest-stub / HMAC，只收 `pem:ed25519:`（[ADR-017](../../adr/017-device-ota-trust-model.md)）；信任根只进 APK，走 OTA 应急轮换有且仅有一次（[ADR-018](../../adr/018-dual-key-rotation.md)）。
- 对外口径只允许 L0–L5 五句话（[enterprise-promotion-gates](../agents/enterprise-promotion-gates.md)），见 §1.4 速查。

---

## 0. 三角色总览

| 角色 | 职责一句话 | 主平面 | 对应 runbook / 文档 |
|------|-----------|--------|---------------------|
| **壳运维** | 宿主 APK/IPA 的候选构建、发布到 staging、装包台真机验证；Dev/release 卫生 | Local + RT | `afk-hitl-ops.md` §2–§4 · `afk-hitl-loop.md` M2/M3 |
| **离线包运维** | 单 module JS 离线包（js-update）的 update/sign/release/promote、quality signal 门禁、灰度 tick 与回滚 | CI + CP | `afk-hitl-ops.md` §3 · `cp-oncall.md` P7–P10 · `verify-quality-gate.mjs` |
| **平台运维** | CP/分发服务起停与部署、注册库与制品备份、审计与密钥/信任根、设备泳道与吊销、DR 演练 | CP + Governance | `distribution-service-*.md` · `cp-oncall.md` · ADR-013/014/017/018 |

---

## 1. 壳运维

### 职责边界

- **own**：宿主 App（`app-host` / `app-host-debug` 制品）的候选构建、staging 发布与真机安装；release 卫生（无 DevSession / 无 Dev Support / 无 `.rn` dev config）；`rn doctor`（L3e）+ doctor 门禁；装包台验证（安装 + 记录 quality signal + 审计）。
- **hand off**：宿主在 staging 稳定后，把业务 JS 的构建/发布交 **离线包运维**（§2）；把 APK 产物、签名密钥、设备泳道与吊销交 **平台运维**（§3）。
- **不 own**：不发布 JS 离线包、不做 promote 到 production、不碰注册库备份与信任根。

### 日常任务与命令

```bash
# 本机前置（Node 必须 22–24；26 会被 doctor/loop 拒绝或自动 re-exec）
nvm use 24
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
export PATH="$ANDROID_HOME/platform-tools:$PATH"
adb devices   # 必须出现 xxxx	device

# 体检（BF 宿主加 --profile brownfield；--strict 时 L1 缺包即失败）
rn doctor
rn doctor --profile brownfield

# 开发验证（多 Metro：main :8081 · support :8082；另开终端装 debug-host）
rn dev --modules main,support
rn-delivery build --platform android --profile debug-host
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb reverse tcp:8081 tcp:8081 && adb reverse tcp:8082 tcp:8082

# Release 前清掉 Dev Support（release 卫生，L2 门禁）
rn dev-support remove

# 宿主 release 候选 → staging（→ 可选真装）
rn-delivery build --platform android --profile release
rn-delivery validate
rn-delivery release --install          # → staging；--install 仅 app-host APK
```

装包台（Map E · 门禁 `verify-distribution-console.mjs`）：

```bash
node scripts/distribution-console-agent.mjs ~/Work/my-rn-app --lane=production --dry-run
node scripts/distribution-console-agent.mjs ~/Work/my-rn-app --lane=production --record-signal   # 真装 + 审计 + quality signal
cat ~/Work/my-rn-app/.rn/delivery/install-audit.jsonl
```

自动化回归（壳侧门禁，全部 AFK/AUTO）：

```bash
node scripts/verify-release-hygiene.mjs      # M2：release 卫生
node scripts/verify-steel-thread.mjs         # M3：L3 钢线
node scripts/verify-debug-host.mjs           # M4c：debug-host 契约
node scripts/verify-m3b-brownfield.mjs       # M3b：BF 宿主
```

### 监控阈值

| 看什么 | 触发动作 | 依据 |
|--------|---------|------|
| `rn doctor` L3e 非绿 | 阻断后续步（AFK 硬失败） | `afk-hitl-loop.md` L0/M2/M3 · `verify-debug-host.mjs` |
| release 包含 DevSession/Dev Support/`.rn` dev config | L2 门禁 FAIL，重新 build | `enterprise-promotion-gates.md` Phase 1 · `verify-release-hygiene.mjs` |
| `profile is debug-host` 出现在 steel-thread 记录 | 以 registry 里 **release app-host** 为准，或重 `build --profile release` | `afk-hitl-ops.md` §7 |
| `EADDRINUSE :8081` | 已有 Metro，复用；勿起第二个 | `afk-hitl-ops.md` §7 |
| H-dist-install 后日常调试异常 | release APK 盖掉 debug-host → 重 `build --profile debug-host` + `adb install -r` | `afk-hitl-ops.md` §7 |
| 宿主 APK 的验签失败风暴 | 见 §3.3 K1/K2 吊销流（交接平台运维） | ADR-017/018 |
| staging 宿主 soak 时长 / SLI | 由离线包运维 promote 阶段的 SLI 门禁覆盖；壳侧不重复定义 | — |

### 升级路径

- L1 **壳/宿主侧问题**（构建失败、release 卫生、装包台）：先自检 §1.2 命令与 `afk-hitl-ops.md` §7 常见失败表；不行找 **宿主代码 owner**（构建链 / Gradle / Metro）。
- L2 **CP/注册库/签名问题**：转 **平台运维**（§3）；壳只保证制品与安装，不修 CP。
- L3 **设备验签失败（release 拒载 stub/篡改包）**：立即报 **平台运维**（§3.3 吊销/轮换流），壳配合出「上一个已知良好 APK」。
- 对外口径：只允许说「开发环可用」(L1) / 「候选宿主可装」(L2–L3) / 「可企业推广（单 module）」(L4)；L5 前不得说「企业闭环完成」（`enterprise-promotion-gates.md` PR/comms 表）。

### 交接点

| 节点 | 交出 | 接方 | 触发 |
|------|------|------|------|
| **宿主发布** | 新 APK/IPA 候选 + digest | 离线包运维 | 壳发新宿主 → 离线包运维对该宿主 re-baseline 业务模块（§6 S1） |
| **产物/密钥** | APK 制品、签名上下文、device-manifest | 平台运维 | 上线前；平台运维据此维护制品库与吊销 |
| **装包台证据** | `install-audit.jsonl` + 安装 quality signal | 离线包运维 | 内测真装后，作为该宿主质量基线 |
| **BF 宿主** | brownfield host-profile + 模块 link 状态 | 离线包运维 | BF 宿主可装后，模块 JS 按同协议交接 |

---

## 2. 离线包运维

### 职责边界

- **own**：单 `business_module` 的 JS 离线包（js-update）候选：`update` → `sign` → `validate` → `release`(→staging) → `promote`(→production)；quality signal 门禁（crash/js_error/anr/perf/custom/e2e_fail）；灰度 tick / SLO 暂停 / kill-pause；`channel_profile` 证据时效。
- **hand off**：promote 上线后的灰度 SLI 盯梢与吊销事件交 **平台运维**（§3）；宿主包本身交 **壳运维**。
- **不 own**：不构建宿主 APK（那是壳运维）、不维护 CP 进程与备份、不碰签名私钥与吊销（平台运维）、不做 store 提交（`submit` 未实现，永远不可用）。

### 日常任务与命令

```bash
# 单 module js-update 钢线（在应用仓，已有 modules/main）
rn-delivery update --module main --profile release
rn-delivery sign                        # 可选：RN_DELIVERY_SIGN_KEY=… 走 HMAC（dev）；release 要求 pem:ed25519:
rn-delivery validate
rn-delivery release                     # → staging
rn-delivery promote                     # → production

# 质量挡板（L5）：crash 信号应挡住 promote
rn-delivery signal record --module main --update-id <update_id> --kind crash
rn-delivery promote                     # 应失败
rn-delivery signal clear

# 自动化等价（L4/L5 门禁）
node ~/Work/client-platform-labs/rn/scripts/verify-l4-steel-thread.mjs .
node ~/Work/client-platform-labs/rn/scripts/verify-quality-gate.mjs .
node ~/Work/client-platform-labs/rn/scripts/verify-bf-l5-quality-gate.mjs .   # 需 host-profile=brownfield
```

灰度 / 暂停（HTTP CP，另开终端 `rn-delivery serve --port 4040`；`RN_CP_TOKEN` + `RN_CP_ROLE=admin` 可写）：

```bash
curl -s http://127.0.0.1:4040/v1/candidates?lane=production
curl -s http://127.0.0.1:4040/v1/registry
# SLO breach → pause（P10）
curl -X POST http://127.0.0.1:4040/v1/rollout/slo-breach \
  -H "Authorization: Bearer $RN_CP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"digest":"<sha256>","reason":"error_budget_breach"}'
# kill 疑似坏 JS（按 business_module 隔离）
curl -X POST http://127.0.0.1:4040/v1/kill \
  -H "Authorization: Bearer $RN_CP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"business_module":"<mod>","update_ids":["<id>"],"reason":"oncall"}'
```

门禁脚本（`cp-oncall.md` Quick reference）：

```bash
node scripts/verify-cp-kill-pause.mjs             # kill/pause 隔离
node scripts/verify-cp-e2e-promote-gate.mjs       # e2e_fail 挡 promote
node scripts/verify-consistency-gate.mjs          # consistency_fail
node scripts/verify-cp-sbom-promote-gate.mjs      # SBOM 双轨
node scripts/verify-cp-governance-promote-gate.mjs# 治理（异常台账）
node scripts/verify-cp-rollout-tick.mjs           # tick / SLO 暂停
node scripts/verify-channel-profile.mjs           # channel pending-rules
```

### 监控阈值

| 看什么 | 触发动作 | 依据 |
|--------|---------|------|
| **quality signal**（任意 kind，含 `e2e_fail` / `crash` / `consistency_fail`）存在且指向候选 | promote **fail-closed 阻断**，先消信号或修因再 promote | `cp-oncall.md` P7/P8 · `verify-quality-gate.mjs`（`evaluateQualityPromoteGate`） |
| **SLO 违约**（P13 默认 profile） | tick `should_pause` → rollout 暂停；修好 `rn-delivery promote` | `rn-slo-budget.ts` `defaultRnSloProfile()`：crash_free<**0.995** / js_error_rate>**0.01** / update_apply_success<**0.98** / critical_journey_ok<**0.99** / cold_start_ms>**3000ms** / hbc_load_ms>**2000ms** / jsi_p95_ms>**50ms** / hermes_gc_long_pause_count>**5** |
| **tick body 内 `error_rate`** | > `sli_thresholds.error_rate`（drill 用 **0.01**）→ `paused_slo` | `verify-cp-rollout-tick.mjs`（`sli_thresholds: { error_rate: 0.01 }`，高 0.09 → pause） |
| **`e2e_fail` 信号** | 挡 promote 但**不挡 compile**（fail-closed 在 promote 而非 build） | `cp-oncall.md` P7 |
| **`channel_profile` pending_rules** / `expiresAt` 过期 | 该 channel JS train 被 block，证据续期后再 promote | `cp-oncall.md` P-`channel_profile` · `verify-channel-profile.mjs` |
| **exception ledger `expires_at` 过期** | promote 被治理门禁挡（fail-closed）；续期需 ticket + owner | `cp-oncall.md` P16/P17 · `verify-cp-governance-promote-gate.mjs` |
| 生产候选 `stage` 非 promote/非生产 | 按 registry 为准；`profile is debug-host` 属正常（§1.3） | `afk-hitl-ops.md` §7 |
| 灰度 **crash 率 vs 基线** 回归 | 触发动作阈值待定：**TODO(定义阈值)**（industry 基线 crash > 2× baseline / 装包成功率 <99% / 验签失败率 >0.1% 见 `research/operations.md`，未落 rn 门禁数值） | `research/operations.md` · 未落地 |

### 升级路径

- L1 **单 module 质量问题**（crash 信号、SLO pause、e2e_fail）：按 `cp-oncall.md` P7–P10 清单处理；修因 → 消信号 → 重 promote。双 pause 返回 400、resume 需 admin（viewer → 403）——角色鉴权是边界，不是 bug。
- L2 **CP 服务/注册库异常**（registry 疑似损坏、rollout 不 tick、tick 与 promote 状态不一致）：转 **平台运维**（§3）。
- L3 **验签失败风暴 / K1 疑失陷**：转 **平台运维** 吊销流（§3.3），离线包运维停 promote 并配合回滚到上一个已知良好包。
- 对外口径：同 §1.4 —— promote 上线只对应「可企业推广（单 module）」L4；灰度+回滚+质量门禁齐了才可称「企业闭环」L5。

### 交接点

| 节点 | 交出 | 接方 | 触发 |
|------|------|------|------|
| **模块 promote 上线** | 灰度中的 `digest` + SLI 数据 | 平台运维 | promote 成功进入 production lane 后，灰度盯梢交平台运维（§6 S3） |
| **kill / pause 事件** | `kills` / `pauses` 记录 + reason | 平台运维 | 事件进入 registry，平台运维审计盯 log |
| **re-baseline** | 业务模块 digest 对宿主的新映射 | 壳运维（反向） | 壳发新宿主 APK 后，离线包运维 re-baseline（§6 S1） |
| **灰度验收** | allowlist 设备切片结果 | 平台运维 | `verify-cp-device-lane.mjs` 后设备泳道归平台运维管 |

---

## 3. 平台运维

### 职责边界

- **own**：CP（`serve` / `cp-serve`）与分发服务（distribution-service / data-service）的部署、起停、升级；注册库（SQLite `registry.sqlite` / `registry.json`）与制品库的备份（ADR-013/014）；`RN_CP_TOKEN` / `RN_CP_TENANTS` 与签名私钥管理；设备泳道（`/v1/devices/:serial/lane`）；**信任根 K1/K2 吊销与轮换**（ADR-017/018 状态机）；审计日志 `cp-audit.log`；DR 冷重建演练（ADR-014）；多租户接缝（G9）。
- **hand off**：宿主制品构建/发布交 **壳运维**；业务 JS 钢线交 **离线包运维**；平台只保证「CP 能 serve、注册库能读写、验签能过、备份能还原」。
- **不 own**：不替业务侧 promote/kill（离线包运维）、不构建宿主包（壳运维）、不做 store 提交。

### 日常任务与命令

```bash
# 全量回归（平台健康）：AFK + 有手机则 AUTO-HITL
node scripts/run-afk-hitl-loop.mjs ~/Work/my-rn-app
node scripts/run-afk-hitl-loop.mjs --plan       # 只看依赖图
node scripts/run-afk-hitl-loop.mjs --mode afk   # 无手机 / CI

# CP 薄 HTTP（写路由需 RN_CP_TOKEN + RN_CP_ROLE=admin）
cd ~/Work/my-rn-app
rn-delivery serve --port 4040
#   GET  /v1/health · /v1/service · /v1/candidates?lane=production · /v1/registry
#   POST /v1/promote {"digest":"..."} · /v1/block {"digest":"...","reason":"..."}

# 本机分发服务（与 ECS 同构）：起 / 停 / 验证
./scripts/setup-local-distribution-server.sh
./scripts/stop-local-distribution-server.sh
node scripts/verify-local-distribution-chain.mjs

# ECS 部署 + 同步 + 验证（47.93.214.189）
./scripts/deploy-distribution-ecs.sh
node scripts/sync-distribution-registry-to-ecs.mjs
node scripts/verify-distribution-ecs.mjs
```

备份 / 审计 / 密钥（ADR-013/014/017/018）：

```bash
# 备份：sqlite .backup + 制品 tar + 签名私钥加密（age），每日异地
# 审计：写路由全部落结构化行 {ts,method,path,actor,outcome,tenant?}
tail -5 ~/code/tiangong-host/.rn/distribution-lab/logs/cp-audit.log | jq -c '{ts,method,path,actor,outcome,tenant}'
cat ~/Work/my-rn-app/.rn/delivery/install-audit.jsonl

# 薄观测（可替换）
curl -s http://127.0.0.1:4040/v1/metrics
```

门禁/验证（CP 侧）：

```bash
node scripts/verify-cp-stub-api.mjs            # CP #7
node scripts/verify-distribution-console.mjs   # Dist #15
node scripts/verify-cp-service.mjs             # /v1/service · cp-serve 面
node scripts/verify-cp-rbac.mjs                # viewer/admin 权限边界
node scripts/verify-cp-auth.mjs                # RN_CP_TOKEN / RN_CP_TENANTS 薄鉴权
node scripts/verify-cp-device-lane.mjs         # 设备泳道 gray/staging/production
node scripts/verify-cp-registry-sqlite.mjs     # ADR-013 SQLite 原子写
node scripts/verify-compliance-profile.mjs     # 合规 profile + 异常台账
node scripts/verify-rn-slo-budget.mjs          # P13 RN SLO 契约
```

### 监控阈值

| 看什么 | 触发动作 | 依据 |
|--------|---------|------|
| `GET /health` 非 `service: control-plane` | CP 进程/服务异常，查 `cp-serve.log` 与容器 | `cp-oncall.md` P10 · `verify-cp-service.mjs` |
| `GET /v1/service` 非 `mode: cp-serve` / `replaceable_backend: true` | 服务身份面异常，重启或核对 `RN_CP_PROJECT` | `cp-oncall.md` P10 |
| 401/403 写路由 `denied` 审计行 | 核对 `RN_CP_TOKEN` / `RN_CP_TENANTS` / `RN_CP_ROLE`；`resume` 非 admin 必 403 | `cp-oncall.md` · `verify-cp-rbac.mjs` |
| **双 pause** 返回 400 / resume 未暂停返回 400 | registry 可能损坏 → 按 ADR-013 SQLite 校验/还原 | `cp-oncall.md` P-`kill/pause` |
| `exception-ledger.json` 过期条目（`expires_at` < now） | 视为债务，promote 必须 fail；走治理续期（ticket+owner） | `cp-oncall.md` P17 · ADR 治理门禁 |
| **备份缺口**（每日加密异地备份未成） | RPO 漂移（ADR-014 约定 RPO ≈ 每日），当日补跑 | ADR-014 |
| **DR 演练** | 每季度至少一次完整恢复演练，证据进 `docs/hitl/`（RTO ≈ 分钟级手动重建） | ADR-014 · `research/operations.md`（季度 drill） |
| **验签失败风暴**（设备侧 release 拒载） | 按 §3.3 流程：K1 疑失陷 → K2 签「K1 吊销」+ 切 K2；双失陷 → 全量重装 | ADR-017/018 |
| 多租户 / Postgres 迁移就绪（`RN_CP_DATABASE_URL`） | 单栈不够再启用；拆栈即搬接缝登记 G9 | ADR-015 · `distribution-service-production.md` §3 |

### 升级路径

- L1 **CP/服务自身问题**：按 `cp-oncall.md` 各段清单 + `verify-cp-*.mjs` 定位；能自愈的（重启、token、卷）现场处理。
- L2 **备份损坏 / 恢复失败 / 密钥疑似泄露**：转 **负责人（人工）**——age 解密私钥、签名私钥由人异地保管，不上机；密钥类事件永远上人。
- L3 **信任根双失陷**：全量重装为兜底方案，需产品负责人决策；ADR-018 状态机写入 G8 runbook。
- 对外口径：平台运维不对外宣称产品等级；L0–L5 口径由壳/离线包运维在各自交付节点使用。

### 交接点

| 节点 | 交出 | 接方 | 触发 |
|------|------|------|------|
| **K1 吊销 / 轮换** | 「K1 吊销」清单（K2 签名）+ K2 生效说明 | 壳运维 | 平台运维吊销 K1 → 壳运维重打 APK 重分发（§6 S4） |
| **设备泳道** | `gray`/`staging`/`production` 设备切片与 allowlist | 离线包运维 | 灰度设备分配结果供 promote 验证使用 |
| **审计与监控面** | `cp-audit.log`、`/v1/metrics`、`/v1/sli` 状态 | 离线包运维 | 灰度期 SLI 数据回填 tick 判定 |
| **部署状态** | ECS/本机分发服务版本与卷状态 | 全体 | 发布/回滚时需知当前 serve 面 |

---

## 4. 角色×平面矩阵

平面：**Local**（本机开发/验证）· **CI**（平台仓 verify-* 与 loop）· **CP**（rn-delivery + 分发服务写路由）· **RT**（Runtime：设备/宿主/验签）· **Governance**（L0–L5 口径 · ADR 门禁 · 审计）。

| 平面 | 壳运维 | 离线包运维 | 平台运维 |
|------|--------|-----------|---------|
| **Local** | ● `rn dev` / debug-host / doctor / 装包台 dry-run | ● `rn-delivery update/sign/validate` 本地钢线 | ○ `serve` 本机起停（不 own 业务 JS） |
| **CI** | ○ `verify-release-hygiene` / `verify-steel-thread`（AFK） | ● `verify-l4-steel-thread` / `verify-quality-gate`（AFK） | ○ `verify-cp-*.mjs` 全量归平台侧跑 |
| **CP** | —（不碰写路由） | ● `release` → `promote` → `block` / kill-pause / rollout tick | ● 部署、备份、审计、泳道、吊销 |
| **RT** | ● 宿主安装与验签基线（装包台真装） | ○ 模块 JS 加载与 fallback 验证 | ● 信任根 K1/K2 · fail-closed 验签 |
| **Governance** | ○ L1–L3 口径（开发环可用 / 候选宿主可装） | ● L4–L5 口径（可企业推广 / 企业闭环）· 异常台账 | ● 审计日志 · ADR-013/014/017/018 执行 · DR |

`●` 主责 · `○` 参与/验证 · `—` 不碰（工程原则：Dev 与 delivery 分离）。

---

## 5. 角色×命令矩阵

### 5.1 `rn` CLI（`packages/rn/src/cli.ts`）

| 命令 | 壳运维 | 离线包运维 | 平台运维 |
|------|:---:|:---:|:---:|
| `rn doctor` / `--profile brownfield` / `--strict` | ● | ○ 体检前置 | — |
| `rn dev --modules <ids>` / `--android` | ● | — | — |
| `rn dev-support remove`（release 卫生） | ● | — | — |
| `rn host android` / `rn self update` / `rn init` | ●（装环境/起项目） | — | — |
| `rn module init/link` · `rn config validate` · `rn migrate` | ○ | ○ | — |

### 5.2 `rn-delivery` CLI（`packages/rn-delivery/src/cli.ts`）

| 命令 | 壳运维 | 离线包运维 | 平台运维 |
|------|:---:|:---:|:---:|
| `rn-delivery build --platform <p> --profile <debug-host\|release>` | ● | — | — |
| `rn-delivery ingest-host --apk <path>` | ● | — | — |
| `rn-delivery ingest-pack --module <id>` | — | ● | — |
| `rn-delivery update --module <id> --profile release` | — | ● | — |
| `rn-delivery sign [--candidate <path>]` | ○（宿主候选） | ●（js-update） | ○（密钥上下文） |
| `rn-delivery validate [--candidate]` | ● | ● | ○ |
| `rn-delivery release [--platform] [--install]` | ●（host） | ●（js-update） | — |
| `rn-delivery promote [--digest] [--candidate]` | — | ● | — |
| `rn-delivery block [--candidate] [--reason]` | — | ● | — |
| `rn-delivery signal record/list/clear` | ○（装包台 `--record-signal`） | ●（门禁） | — |
| `rn-delivery serve / cp-serve [--port] [--host]` | ○（自测） | ○（HTTP 灰度面） | ●（运维起停） |
| `rn-delivery test / submit` | 永不使用（未实现；禁止 store 提交） | 同左 | 同左 |

### 5.3 scripts/ 自动化（ops 运维面）

| 脚本 | 壳运维 | 离线包运维 | 平台运维 |
|------|:---:|:---:|:---:|
| `run-afk-hitl-loop.mjs [project] [--mode afk\|auto]` | ● 日常回归 | ● | ● 平台健康 |
| `verify-release-hygiene / verify-steel-thread / verify-debug-host / verify-m3b-brownfield` | ● | — | — |
| `verify-l4-steel-thread / verify-quality-gate / verify-bf-l5-quality-gate` | — | ● | — |
| `verify-cp-kill-pause / verify-cp-rollout-tick / verify-channel-profile / verify-compliance-profile / verify-consistency-gate / verify-cp-sbom-promote-gate / verify-cp-e2e-promote-gate / verify-cp-governance-promote-gate` | — | ● | ○ |
| `verify-cp-stub-api / verify-cp-service / verify-cp-auth / verify-cp-rbac / verify-cp-device-lane / verify-cp-registry-sqlite / verify-rn-slo-budget / verify-distribution-console` | — | — | ● |
| `setup/stop-local-distribution-server.sh / deploy-distribution-ecs.sh / sync-distribution-registry-to-ecs.mjs / verify-distribution-ecs.mjs` | — | — | ● |
| `distribution-console-agent.mjs [--lane] [--dry-run\|--record-signal]` | ● 装包台 | ○ 内测验收 | — |
| `verify-ops-runbook.mjs` | — | — | ● 文档契约自检 |

---

## 6. 典型交接场景

**S1 · 壳发布新 APK → 离线包运维 re-baseline**

1. 壳运维：`rn-delivery build --profile release` → `validate` → `release --install`（真机装包台验证）→ 产出宿主 digest。
2. 交接：把宿主 digest + 装包台 `install-audit.jsonl` 交给离线包运维。
3. 离线包运维：对受影响 `business_module` 执行 `rn-delivery update --module <id>` → `sign` → `validate` → `release` → `promote`，确认模块在新宿主上 re-baseline。
4. 越界检查：宿主发布不得直接进 production lane；模块 JS 单独 promote（GF=BF 同管道）。

**S2 · 灰度验证失败 / SLO pause**

1. 离线包运维：`POST /v1/rollout/tick` 观察到高 `error_rate`（drill 阈值 0.01）→ rollout `paused_slo`；或 `e2e_fail`/`crash` 信号挡 promote（`verify-quality-gate.mjs`）。
2. 处置：按 `cp-oncall.md` P7/P10 清单消信号、修因；必要时 `POST /v1/kill` 按 `business_module` 隔离坏 JS，并核对兄弟模块 `update_id` 不被误伤。
3. 交接：kill/pause 事件与 reason 落 registry → 平台运维审计盯 `cp-audit.log`。

**S3 · promote 上线后 → 灰度盯梢交给平台运维**

1. 离线包运维：`rn-delivery promote --digest <sha256>` 进入 production lane。
2. 交接：把灰度 `digest`、SLI 快照、allowlist 设备切片结果交给平台运维。
3. 平台运维：盯 `/v1/metrics`、`/v1/sli`、`/v1/devices/:serial/lane`；SLI 回填 tick 判定；异常走 §3.3/§3.4。
4. 归口：promote 之后的在线状态归平台运维，离线包运维只在需要操作时介入。

**S4 · 设备验签失败风暴 → 平台运维吊销 K1**

1. 现象：设备侧 release 拒载（`signature === digest` stub / 篡改包被 fail-closed 拒绝），或线上签名大面积验证失败（ADR-017）。
2. 平台运维判定 K1 疑失陷 → 用 K2 私钥签「K1 吊销」清单 + 改用 K2 签名（ADR-018 状态机）；无需全量重装（1 次 OTA 应急轮换）。
3. 交接：K2 生效后把吊销说明交壳运维 → 壳运维重打 APK（新信任根只进 APK）+ MDM/sideload 重分发。
4. 兜底：K1、K2 都用完或双失陷 → 重打 APK + 全量重装（需产品负责人决策）。

**S5 · 每日备份 / 季度 DR 演练**

1. 平台运维：每日 `sqlite3 .backup` + 制品 tar + 签名私钥 age 加密异地备份（ADR-013/014）。
2. 季度演练：冷重建（任意装 Docker 的机器十几分钟重建恢复），证据进 `docs/hitl/`（RTO ≈ 分钟级手动重建，RPO ≈ 每日）。
3. 交接：演练发现的缺口（如恢复脚本缺索引、age 密钥口令未入 1Password）→ 转负责人修 + 更新 G8 runbook。

---

## 7. 与行业 oncall 实践对照（`research/operations.md` 摘要）

| 行业实践 | 本矩阵落点 | 差异 / 待办 |
|---------|-----------|------------|
| **SRE 轮班 ≥8 人 / 25% 规则**（Google SRE Ch.11） | 三角色=职能分工而非独立轮班；3 人平台组按「交付/平台相邻团队 peer cross-fallback」 | 轮班规模待定：**TODO(定义阈值)**（platform 团队扩员后再立专属 secondary） |
| **primary/secondary 交接仪式**（PagerDuty「上周 primary 当本周 secondary」） | §0 交接主轴 + §6 S1–S5 场景即交接仪式 | 周交接文档模板未建：**TODO(定义阈值)** |
| **事件 = 一次 issue / 聊天室 + 状态文档**（Atlassian） | 事件走 GitHub issue + runbook 状态文档（`cp-oncall.md`） | 已对齐 |
| **无责复盘（SEV-1/2 必做，≥1 条 P0/P1 行动项）** | 复盘要求未写死进矩阵 | **TODO(定义阈值)**（建议：SEV-1/2 必复盘，行动项进 backlog） |
| **1-5-10 / 1-5-30 升级阶梯**（阿里） | §1.4 / §2.4 / §3.4 三级升级路径 | SLA 分钟数未定义：**TODO(定义阈值)** |
| **灰度：白名单 → 设备队列 → 百分比 1→5→20→50→100%**（美团/LaunchDarkly） | §2.3 tick/SLI + `verify-cp-rollout-tick.mjs` | 百分比梯度未实现（单栈小用户基数，见 research 结论）；allowlist 已落地 |
| **无人值守灰度 + 回滚 SOP（crash>2×基线 / 成功率<99% 自动 kill）** | §2.3 灰度 crash 回归行 | 自动化 kill 阈值未落地：**TODO(定义阈值)**（research 建议值 2×基线 / 99% / 0.1%） |
| **DR：冷重建 = AWS backup-and-restore 档**（ADR-014 已定） | §3.3 备份 + 季度演练 | RPO≈日 / RTO≈分钟 与行业档一致；实际 RTO 演练后回写 ADR |
| **混沌/GameDay 季度演练**（Netflix/Intuit） | §3.3 DR 季度演练 + `docs/hitl/` 证据 | 已对齐 |

**待定义阈值汇总（不臆造数值）：**

- `TODO(定义阈值)` — 轮班规模与专属 secondary（SRE 25% 规则落地）。
- `TODO(定义阈值)` — 周交接仪式文档模板（primary/secondary 交接清单）。
- `TODO(定义阈值)` — SEV-1/2 复盘门槛与行动项追踪。
- `TODO(定义阈值)` — 升级 SLA 分钟数（1-5-10/1-5-30 本地化）。
- `TODO(定义阈值)` — 灰度自动化 kill：crash>2×基线 / 装包成功率<99% / 验签失败率>0.1%（research 建议值，未落门禁数值）。

---

## 附 · 来源索引

- `packages/rn/src/cli.ts` — `rn` CLI 全命令与 flag。
- `packages/rn-delivery/src/cli.ts` — `rn-delivery` 全命令与 flag（build/update/ingest-*/sign/validate/release/promote/block/signal/serve/cp-serve；`test`/`submit` 未实现）。
- `docs/runbooks/cp-oncall.md` — CP oncall 清单（P7–P10、kill/pause、exception ledger、channel_profile）。
- `docs/runbooks/distribution-service-*.md` — 生产 / ECS / 本机分发服务 runbook。
- `docs/agents/afk-hitl-loop.md` · `docs/guides/afk-hitl-ops.md` — loop 与 ops 操作指南。
- `docs/agents/enterprise-promotion-gates.md` — L0–L5 阶梯与 comms 规则。
- `docs/adr/013-sqlite-registry-no-postgres.md` · `014-dr-cold-rebuild.md` · `015-per-business-stack.md` · `017-device-ota-trust-model.md` · `018-dual-key-rotation.md`。
- `docs/handbook/research/operations.md` — 行业 oncall / 灰度 / DR 调研（2026-09-07）。
- `packages/rn-core/src/rn-slo-budget.ts` — P13 默认 SLO profile（阈值数值来源）。
- `scripts/verify-*.mjs` / `run-*.mjs` — ops 自动化清单（`verify-ops-runbook.mjs` 做文档契约自检）。


