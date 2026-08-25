# A1 深化：Dev Session 合同（超越 Expo 的本地开发环）

Type: task
Mode: AFK
Status: **in-progress** — W1 AFK：DevTransport + fail-fast + 单 ABI 已落地
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
- [ ] 真机验收：USB / Wi‑Fi / LAN 三模（用户环境）
- [ ] `dev.failfast.no_device` ≤3s 实测（`scripts/bench-dev-session.sh`）

## 辐射面

| 下游 | 影响 |
|------|------|
| **A2 Brownfield** | 宿主复用 `DevTransport`，禁止第二套 bridge |
| **A3 Delivery** | debug vs release 构建 profile 分离；dev 不污染候选包指纹 |
| **A5 Fallback** | dev session 与 runtime fingerprint 边界清晰 |
| **issue 07 L1** | 能力包 dev 探测与 Dev Menu 注册口 |
