Type: grilling
Mode: HITL
Status: resolved
Triage: ready-for-human
Assignee: cursor-agent
Blocked by: 08

# MVP 之后的下一里程碑边界

## Question

MVP 验收通过后，下一张实施地图/里程碑应优先切哪一块（delivery 编排、控制面最小切片、Brownfield 示例、JS 列车信号），边界与非目标是什么？

## Answer

下一里程碑采用“**delivery 编排骨架优先 + init/adapter 轻量附带 + 本图结图**”。

1. **主切片（下一地图 Destination）**
   - **`rn-delivery` 编排骨架**：把 `validate → compile → sign → test → attest → promote → submit` 落成可跑阶段合同 + 可替换后端接口
   - 真商店提交、真实签名根、生产控制面 API **仍 stub / 不交付**

2. **同里程碑可附带（非主切片）**
   - `rn init` 生成更完整的 pure-rn 目录合同
   - 至少一个 adapter 插件空壳（如 `adapter-ios` / `adapter-android` 占位）
   - **不做** Metro / `rn dev`、不上控制面

3. **明确非目标（下一图 Out of scope）**
   - 真实商店提审与生产签名根
   - 生产控制面服务（灰度/审批 API）
   - 强制渠道书面取证
   - 金融/医疗认证档
   - JS 列车端到端（指纹匹配 + 更新通道）— 再下一里程碑
   - Brownfield 可运行宿主 — 再下一里程碑

4. **本实施地图终点**
   - 票 08 验收通过 + 本票关后 **结图**（Destination 达成）
   - 下一里程碑另开新实施地图（如 `wayfinding-impl-2` 或等价命名），不继续在本图扩 delivery 实现票
