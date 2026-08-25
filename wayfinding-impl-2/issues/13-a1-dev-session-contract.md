# A1 深化：Dev Session 合同（超越 Expo 的本地开发环）

Type: task
Mode: AFK
Status: **resolved** — 2026-08-25 HITL：fail-fast 222ms + USB/Wi‑Fi/LAN PASS
GitHub: #13
Triage: ready-for-agent
Blocked by: none（票 12 研究 sufficient）
Blocks: A2 brownfield dev 桥接复用
Related: [04-a1-greenfield-device](./04-a1-greenfield-device.md), [packages/rn/src/android-dev-bridge.ts](../../packages/rn/src/android-dev-bridge.ts), [ADR-001](../docs/adr/001-dev-transport.md), [ADR-002](../docs/adr/002-debug-host.md), [scripts/bench-dev-session.sh](../../scripts/bench-dev-session.sh)

## Question

在 **不绑定 Expo 运行时** 前提下，实现可验收的 **Dev Session 合同**，使 greenfield `rn dev` 在传输、失败速度、温启动与可观测性上 **对齐并优于 Expo**？

## Scope（AFK 实现清单）

### 1. DevTransport 抽象

- 模式：`usb` | `wifi-adb` | `lan`（见票 12 研究定论）
- API：`probe()` → `setup()` → `verify(metroPort)` → `teardown()`
- 替换 `android-dev-bridge.ts` 中 USB-only 假设

### 2. CLI / doctor

- `rn dev --android`：Gradle **前** 无 authorized device → fail-fast（≤3s）
- `rn dev --android --device <serial|ip:port>`：显式选择
- `rn dev --android --transport auto|usb|wifi|lan`
- `rn doctor` L2：dev-session 探测（传输可达、Metro、reverse/LAN URL）
- 分阶段 UX：`Metro ready` / `Native build (cold|warm, N ABIs)` / `Install` / `Session ready`

### 3. 构建策略

- USB/Wi‑Fi 已连接单台 arm64 设备 → `-PreactNativeArchitectures=arm64-v8a` 或 `--active-arch-only`
- JS-only 变更路径：文档 + 检测提示，避免无意义 `run-android`

### 4. Metro 会话

- foreground 模式 Metro 生命周期（已有）；回归测试覆盖
- LAN 模式：输出设备应配置的 bundler URL（或自动 via debug host 远期）

### 5. 指标与测试

- 落实票 12 指标注册表中 A1 相关项
- 集成测试：无设备 fail-fast、USB reverse、Wi‑Fi adb connect mock、LAN URL 生成

## Out of scope（本票不做）

- 自有 Debug Host APK 构建流水线 → 票 **13b** / [ADR-002](../docs/adr/002-debug-host.md)
- EAS 类 OTA（A3）
- Brownfield 宿主嵌入（A2，但须消费 DevTransport 接口）

## Acceptance

- [x] DevTransport 模块 + 单测（`packages/rn/src/dev-transport.ts`）
- [x] `rn dev --android` Gradle **前** 无 authorized device → fail-fast
- [x] `--transport auto|usb|wifi|lan`、`--device`、`--no-active-arch-only`
- [x] 单设备默认 `--active-arch-only` + `reactNativeArchitectures` 探测
- [x] 分阶段 UX（device gate / Metro / cold|warm native / session）
- [x] `rn doctor` L2：dev-session 探测（传输可达、Metro、reverse/LAN URL）+ 单测
- [x] `scripts/bench-dev-session.sh` 硬化（ms 精度、Gradle 哨兵、budget PASS/FAIL → `dev.failfast.no_device`）
- [x] 真机验收：**USB**（2026-08-25 my-rn-app：gate→单 ABI→reverse→warm ~7s→install Success）
- [x] 真机验收：Wi‑Fi adb（2026-08-25：`192.168.2.10:5555`，warm ~1s → install Success）
- [x] 真机验收：LAN（2026-08-25：`http://192.168.2.2:8081`，reverse skipped → install Success）
- [x] `dev.failfast.no_device` ≤3s 实测（2026-08-25：**222ms**，`docs/bench/dev-session-no-device-20260825T074843Z.log`）


## Scope boundary（收口后补记）

本票 **只验收 Greenfield · L-N**（壳/传输/装包连调）。**不**包含：

| 层 | 缺口 | 跟踪 |
|----|------|------|
| L-J | 多 module / 多 Metro / 业务 JS 热更环 | #17 |
| L-C | API 基址 / 开关 / 租户 env overlay 连调 | #17 `dev-session` ABI 或后续深化票 |
| BF | 棕地同协议 DevSession | #5 + #17 BF |
| L-O / L-P | OTA 槽位 / 发布态复现 | #8 / #7 |
| 业务场景 | 真实多业务 module 日更工作流 | A1+A2 DoD 联合 |

## 辐射面

| 下游 | 影响 |
|------|------|
| **A2 Brownfield** | 宿主复用 `DevTransport`，禁止第二套 bridge |
| **A3 Delivery** | debug vs release 构建 profile 分离；dev 不污染候选包指纹 |
| **A5 Fallback** | dev session 与 runtime fingerprint 边界清晰 |
| **issue 07 L1** | 能力包 dev 探测与 Dev Menu 注册口 |


## Answer

（2026-08-25）Dev Session 合同在 greenfield Android 路径验收通过：

1. DevTransport：`usb` | `wifi-adb` | `lan` + fail-fast 设备门禁（Gradle 前）
2. 单 ABI / 分阶段 UX / doctor L2 / bench 脚本
3. 真机：USB、Wi‑Fi adb（`192.168.2.10:5555`）、LAN bundler URL；fail-fast **222ms**
4. 非本票：Debug Host → #14；多 Metro → #17；`deviceId` 上游警告另跟

