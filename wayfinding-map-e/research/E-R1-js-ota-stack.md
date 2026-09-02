# E-R1 — JS/OTA 开源栈对照（Hot Updater · Expo Updates · Ethern）

Part of [#95](https://github.com/client-platform-labs/rn/issues/95) · Map [#94](https://github.com/client-platform-labs/rn/issues/94)

**Question:** 哪些能力必须进入本平台「JS/离线包发布面」合同？哪些可替换执行后端？如何映射现有 CP，避免第二真相源？

## Sources (primary)

| Source | URL |
|--------|-----|
| Hot Updater README / features | https://github.com/gronxb/hot-updater |
| Hot Updater docs (managed / plugins) | https://hot-updater.dev/ |
| Hot Updater v0.32 CAS | https://github.com/gronxb/hot-updater/releases/tag/v0.32.0 |
| Expo Updates (protocol shape) | https://docs.expo.dev/versions/latest/sdk/updates/ |
| This repo CP surface | `packages/rn-delivery/src/serve.ts` · Map C P10/P11 |

## Industry split (post-CodePush)

CodePush/App Center 停服后，自托管主路径不是「再建一个 App」，而是：

1. **Build** — Metro / Re.Pack / Expo 产出 Hermes bundle
2. **Storage** — S3 / R2 / Supabase 等放 ZIP / patch / assets
3. **Database / policy** — channel · rollout % · active/rollback · app-version 或 fingerprint 匹配
4. **Device runtime** — check → download → apply → crash rollback

**Hot Updater** 把 1–3 做成插件三层；Web Console 管发布；runtime 支持 New Arch + Hermes；近期加了 **bundle diff / content-addressed assets**（部署去重、下载变小）。策略可选 **appVersion** 或 **fingerprint**（常借 `@expo/fingerprint`）。

**Expo Updates** 提供成熟的 **更新协议形态**（manifest · channel · runtimeVersion）与托管/自托管选项；工业上常被当作「设备侧对话形状」参考，不宜当作本平台的**唯一真相源**（与 ADR：不把 EAS/Firebase 当真相一致）。

**Ethern / 同类** — 多属自托管 OTA 变体；能力面与 Hot Updater 重叠（存储+元数据+客户端），成熟度/插件生态通常弱于 Hot Updater 当前主线。

## Must-have 合同（进 `rn-core` / CP，不可外包给插件当真相）

| 能力 | 业界对应 | 本仓已有/缺口 |
|------|----------|--------------|
| 制品身份（digest · fingerprint · module） | update id / fingerprint | ✅ rn-core · A5 槽位 |
| 渠道 / channel_profile | channel | ✅ C3 合同 |
| 灰度阶梯 · soak · SLO breach→pause | rollout % | ✅ P10 tick · C5 |
| Kill / Pause by module | force inactive | ✅ B9 |
| 计划回滚（同宿主公式） | rollback flag / previous | ✅ P11 planJsRollback |
| 签名 / promote 门禁 | — | ✅ HMAC · promote gates |
| 设备侧 gateBundleLoad | apply gate | ✅ Runtime thin |

这些是**策略与身份**；插件只能执行「存哪 / 怎么传」，不能另立版本语义。

## Replaceable 执行后端（可插件化）

| 层 | Hot Updater | 本平台建议 |
|----|-------------|------------|
| Build | Metro / Re.Pack / Expo plugin | 继续 `rn-delivery` pack；不新造公开 CLI |
| Storage | S3 / R2 / Supabase | 对象存储适配器；URI 进 registry |
| Metadata DB | Postgres / D1 / Supabase | 对齐 B8 Postgres 合同；file registry 可过渡 |
| Diff / CAS | bsdiff · content-addressed assets | **后期性能优化**，非 Map E v1 硬门槛 |
| Web Console | Hot Updater console | CP Web **投影**；或适配器 UI，不双写策略 |

## 映射原则（防第二真相源）

```text
Device / Agent
    │ check/update
    ▼
CP (`rn-delivery serve` / replaceable backend)
    │ 唯一：rollout · kill · channel · digest · promote
    ▼
Storage (blob only)
```

- Hot Updater **Database plugin 语义**（active channel、rollout%）应对齐/投影到本仓 CP 字段，**禁止**设备直连第三方 DB 当权威。
- 若采用 **Adapt 路径**：实现「Hot Updater-compatible check API」作执行面，背后读 CP；或写 Hot Updater DB plugin 读写本仓 registry。
- 若采用 **Build 路径**：只借鉴概念（三层插件、fingerprint、rollback），API 仍是现有 `/v1/*` + 扩展离线包发布端点。

## 建议（喂给 grilling #98）

**推荐 C 混合：** check/update **协议形状**可对齐 Hot Updater / Expo Updates；**策略/灰度/Kill 只走本平台 CP**。v1 不强制嵌入整棵 Hot Updater monorepo。

## Out

- 把 Firebase App Distribution / EAS Updates 当作发布真相
- Shorebird 式改引擎
- 宣称已具备生产级 CAS/diff（研究对照 ≠ 已实现）
