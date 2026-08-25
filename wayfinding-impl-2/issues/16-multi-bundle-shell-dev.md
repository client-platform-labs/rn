# 一壳多 Bundle + 统一多 Metro 调试（**A1+A2 深化票**，非新切片）

Type: task / product
Mode: HITL → AFK
Status: open
GitHub: #17
Triage: ready-for-human
Blocked by: [13-a1-dev-session-contract](./13-a1-dev-session-contract.md)
Priority: **P1**
Map: **wayfinding-impl-2（地图 A）only** — 融入 [A1](./04-a1-greenfield-device.md) + [A2](./05-a2-brownfield.md)；字段辐射 [A4](./07-a4-control-plane.md) / [A5](./08-a5-client-fallback.md)
Related: [ADR-005](../docs/adr/005-multi-bundle-shell.md), [ADR-006](../docs/adr/006-unified-multi-metro-debug.md), [map Goals G1](../map.md)

## Question

在 **一壳多离线 JS Bundle** 且 **多 Metro 并行 + 壳内切换 bundler** 前提下，如何用 **同一套 Dev Session 协议** 覆盖 Greenfield 与 Brownfield，只在 Surface 打开方式上分叉——并在 **不新开实施图/切片** 的前提下，把验收并入 A1/A2？

## 归属（强制）

| 交付物 | 计入切片 Done |
|--------|----------------|
| 端口表、并行 Metro、CLI `--modules`、GF Dev Menu、`dev-session` ABI | **A1** |
| 同一 `DevSessionController` 嵌入参考宿主 | **A2** |
| `modules[]` / `release_unit` 含 module | A1 manifest + **A4/A5** 合同字段 |

**禁止**将本票解释为地图 A 第七切片或「调试专图」。

## HITL 锁定（2026-08-25）

1. **必须**多 Metro 端口表；**必须**支持多 bundler **同时**调试  
2. **必须**壳内切换焦点 / override bundler URL  
3. **GF/BF 调试架构同构**：统一 `RuntimeHost` + `DevSessionController`；差异仅 Surface 宿主适配  
4. Greenfield 默认可单 module，合同按多 module 设计  
5. **插件化**：Dev Menu / resolver / transport 扩展走 `dev-session`（及可选 `dev-transport`）ABI；Release 零残留（research/04 §14）

## 工业 DoD（产品级，非仅 ADR）

- [ ] `devSessionProtocolVersion` 协商  
- [ ] 双 module 并行 HMR 不串包（自动化）  
- [ ] GF 与 BF 同一协议测试套件  
- [ ] Release 构建无 DevSession 符号/菜单  
- [ ] `rn doctor` 输出端口表与连接态  
- [ ] 至少一个第三方 `dev-session` 插件可注册 Dev Menu 项（热插拔证明）

## Architecture（验收用）

```text
DevSessionController ── BundlerResolver(module → url|slot|baseline)
        │
 RuntimeHost.load(module)
        │
   ┌────┴────┐
   GF Surface   BF Surface (native push)
```

### CLI / 配置

- `.rn/dev-session.jsonc`：`modules.{id}.metroPort`
- `rn dev --modules a,b` 并行 Metro
- DevTransport：多端口 `adb reverse`
- Dev Menu（Dev Support）：列表 / 切换 / override

## Out of scope

- Module 间 shared chunk RFC  
- 单 Metro 多 projectRoot 冒充多 module（禁止默认）  
- 新实施地图 / 新业务切片  

## Acceptance（合同）

- [x] ADR-005 / ADR-006 起草  
- [x] 地图 A Goals G1 + 六切片归属表（map.md）  
- [ ] Human 签核 ADR-006 + Goals G1  
- [ ] A1/A2/A4/A5 票正文交叉引用本票 DoD  
- [ ] manifest `modules[]` + port 字段草案  

## Acceptance（实现）

- [ ] 端口表 + 并行 `rn dev --modules`（A1）  
- [ ] 壳内 Dev Menu + 双 Metro 真机（A1）  
- [ ] BF 参考宿主同协议（A2）  
- [ ] 多端口 adb reverse（A1，扩票 13）  
