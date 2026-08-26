# Shell team cheatsheet（壳团队一页纸）

**Audience:** 壳 / 宿主 / 平台原生工程师（GF 纯 RN 壳 或 BF 原生嵌 RN）。  
**Not for:** 业务 `modules/<id>` 开发者 → [module-developer.md](./module-developer.md)

**Rule:** 同一套 `rn` / `rn-delivery`，**无** `rn-brownfield` 子命令。BF 用 `--profile brownfield` + `host-profile.jsonc`。

Deep dive: [host-integration.md](./host-integration.md) · [gf-bf-unified-model.md](../agents/gf-bf-unified-model.md) · **回归操作：** [afk-hitl-ops.md](./afk-hitl-ops.md)

---

## 1. Install CLI（每台机一次）

```bash
curl -fsSL https://raw.githubusercontent.com/client-platform-labs/rn/main/scripts/get-rn.sh | bash
rn doctor
```

---

## 2. Bootstrap 宿主仓

| 场景 | 命令 |
|------|------|
| **GF 新壳**（工业默认 topology B） | `rn init [--demo]` → 生成壳 + `modules/main` + `.rn/*` |
| **GF 快捷**（单树 onboarding） | `rn init --starter inline-main` |
| **加业务 module** | `rn module init <id>` · `rn module link <id>` |
| **BF 已有原生仓** | 拷贝合同文件（见下）+ 实现 `SurfaceHostAdapter` · 参考 [examples/brownfield-host](../../examples/brownfield-host/README.md) |

### 壳仓必备机读文件

```text
.rn/host-profile.jsonc     # profile: greenfield | brownfield
.rn/dev-session.jsonc      # modules + metroPort + devSessionProtocolVersion
client-platform.manifest.jsonc
```

BF 示例 `host-profile.jsonc`:

```jsonc
{ "schemaVersion": 1, "profile": "brownfield", "devSessionProtocolVersion": 1 }
```

---

## 3. 日常开发（GF = BF 相同）

```bash
rn doctor                          # GF 默认
rn doctor --profile brownfield     # BF 宿主仓（+ L3b Surface 检查）
rn doctor --strict                 # CI / 真机前：SDK 缺失即 fail

rn dev                             # Metro 前台
rn dev --modules main,support      # 多 Metro 并行（一等能力）
rn dev --android --transport auto  # 装包 + reverse/LAN（DevTransport）
rn dev --android --device <serial>
```

| 可选 | 命令 |
|------|------|
| Debug FAB / Dev Menu 扩展 | `rn dev-support add` · `remove`（**Release 必须零残留** · #20） |
| 教学样板（非生产拓扑） | `rn demo add` · `remove` |

---

## 4. 工具链（本机 Android）

```bash
rn host android --check
rn host android --yes
```

Metro-only 不需 SDK；真机 / `rn-delivery build` 需要。

---

## 5. 交付（宿主 / 候选包）

```bash
rn-delivery build --platform android --profile release    # 商店候选宿主
rn-delivery update --module main --profile release   # js-update bundle (M5)
rn-delivery sign                                       # thin sign + stub SBOM
rn-delivery validate
rn-delivery release                                    # → staging
rn-delivery promote                                    # → production (M6)
rn-delivery signal record --module main --update-id <id> --kind crash   # M9
node scripts/verify-quality-gate.mjs .               # M9 HITL
rn-delivery build --platform android --profile debug-host # Debug Host（#13b）
```

- **不是** `rn module seal` / dev Metro 当 release  
- Module 级 JS OTA：`rn-delivery update …`（L4+，按 `business_module`）  
- 推广门禁：[enterprise-promotion-gates.md](../agents/enterprise-promotion-gates.md)

---

## 6. 验收串（按目标勾选）

| 目标 | 命令串 |
|------|--------|
| **L1 开发工业** | `doctor` → `dev --modules …` → 真机 HMR / dispose HITL |
| **L2 Release 洁净** | `rn-delivery build --profile release` → 包内无 DevSession/Dev Support（#20） |
| **L3 候选可装** | 上一步 + `adb install` → 打开无 debug 面（#21 GF · #22 BF） |
| **L4 全流程** | `verify-l4-steel-thread.mjs` · app-host + js-update + block（[M8](../hitl/m8-l4-gf-2026-08-26.md)） |
| **BF 分支** | `apply-brownfield-host-stub.mjs` + `doctor --profile brownfield`（[M3b](../hitl/m3b-bf-2026-08-26.md)） |
| **BF L4 主线** | `scaffold-bf-rct-host.mjs` → 同一 delivery 管道 → `verify-bf-l4-steel-thread.mjs`（[M8b](../hitl/bf-l4-bf-2026-08-26.md)） |
| **BF 协议** | `cd examples/brownfield-host && rn doctor --profile brownfield && pnpm demo` |

---

## 7. 禁止（评审打回）

- 为 BF 单独写 adb / Metro 脚本  
- 第二份 `dev-session` schema 或 `localhost:8081` 唯一模型  
- 把 `examples/brownfield-host` 当生产宿主（仅为参考桩，#22 前无真机）  
- 在 release 产物保留 dev-support / dev-session 符号  

---

## 8. 文档地图

| 文档 | 用途 |
|------|------|
| [host-integration.md](./host-integration.md) | GF/BF 对照 + 拓扑 B |
| [module-developer.md](./module-developer.md) | 转给业务 JS 同学 |
| [examples/README.md](../../examples/README.md) | monorepo 内示例说明 |
| ADR-005/006/008 | 合同权威 |

---

## 9. 平台团队职责边界（给壳团队的心智模型）

| 平台提供 | 壳团队自己做 |
|----------|----------------|
| `rn` / `rn-delivery` CLI | Gradle / Xcode 工程、商店提交 |
| 合同 + doctor 门禁 | `SurfaceHost` 原生 open/destroy |
| 参考宿主 `examples/brownfield-host` | BF 完整 App 集成（#22） |
| 指纹窗 / CP 规则（消费） | 宿主发版与 OTA 节奏协调 |

业务 module 同学 **不应** 出现在本 cheatsheet 的日常流程里。
