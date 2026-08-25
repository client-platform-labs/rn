# ADR-001: DevTransport（设备 ↔ Metro 传输）

Status: **accepted** (HITL 2026-08-25)  
Deciders: product + platform  
Related: 票 [13](../../issues/13-a1-dev-session-contract.md), [research/04 §5](../../research/04-industrial-full-lifecycle-scheme.md)

## Context

`rn dev --android` 不能只依赖 USB `adb reverse`。Expo 默认 LAN；企业内测需 Wi‑Fi adb。A2 Brownfield 须复用同一抽象，禁止各切片各写 bridge。

## Decision

引入 **DevTransport** 合同，模式：

| mode | 机制 | 优先级（auto） |
|------|------|----------------|
| `usb` | `adb reverse tcp:<port>` | 有 authorized USB 时首选 |
| `wifi-adb` | `adb connect <ip>:5555` + reverse 或 LAN URL | USB 不可用时 |
| `lan` | 设备访问 `http://<host.lan>:<port>`（Dev Settings / Debug Host） | 同网、无 adb 或显式指定 |

- CLI：`rn dev --android --transport auto|usb|wifi|lan`；`--device <serial|ip:port>`
- API：`probe()` → `setup()` → `verify(port)` → `teardown()`
- 实现替换 `packages/rn/src/android-dev-bridge.ts` 的 USB-only 假设；iOS 后续对称扩展

**不纳入 v1**：Expo tunnel / ngrok（defer 至企业内网穿透 ADR）

## Consequences

- 票 13 实现 DevTransport；doctor L2 输出传输状态
- A2 宿主 **必须** import DevTransport，不得 fork adb 逻辑
- 指标：`dev.transport.setup` ≤5s；`dev.transport.modes` = 3

## Verification

```bash
pnpm test  # android-dev-bridge + dev + doctor
rn dev --android --transport lan --dry-run  # 票 13 后
```
