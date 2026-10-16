# 嵌入既有壳相对新建工程还缺的证据与规程

GitHub: [#340](https://github.com/client-platform-labs/rn/issues/340)，父图 [#319](https://github.com/client-platform-labs/rn/issues/319)。对照 [#323](https://github.com/client-platform-labs/rn/issues/323) 的三条证据。本文只记账，不构成「企业闭环完成」。

## 证据条

[#323](https://github.com/client-platform-labs/rn/issues/323) 要求三条记录都齐，并且 Android 新建工程、Android 嵌入既有壳、iOS 都有，才能对外说「企业闭环完成」：

1. 两台设备（或两个队列）按百分比拿到不同候选，控制面日志对得上百分比。
2. 回滚回到上一生产候选，而不只是嵌入基线。
3. 可重复的真机记录：崩溃或质量信号挡住一次真实 `promote`。CI 单测不能代替。

## 新建工程已经有的

| 条 | 现状 | 出处 |
|----|------|------|
| 客户规程（首次接入，不含闭环） | `SOP-GF-STEEL-01` 已生效。范围写明不含灰度、密钥吊销演练、容灾冷重建、商店。成功标准是单模块热更新在真机生效。 | `docs/handbook/operations/sop-greenfield-steel-thread.md` §2.2、§1 |
| 质量信号挡住 promote | vivo `10CEC62C7R000E3` 的 release 包打出 `quality-signal kind=crash`，同一次 `ship promote` 退出码 1。宿主是验收工程，不是既有壳。该次没有上一生产包，回滚落到嵌入基线。 | `evidence/device-quality-promote/10CEC62C7R000E3-2026-10-16T14-33-46-777Z.json` |
| 灰度分档 | `check` 已按设备稳定分档。证据是进程内测试，不是两台真机。 | `packages/ship/test/gray-check.test.ts`，[#332](https://github.com/client-platform-labs/rn/issues/332) |
| 回到上一生产候选 | 崩溃环在有快照时恢复上一生产包。证据是 shell-core 测试，不是真机。 | [#329](https://github.com/client-platform-labs/rn/issues/329) |

新建工程自己也还缺：两台真机的灰度记录，以及一次真机回到上一生产候选的记录。客户规程停在首次接入，没有把这三条写成可执行步骤。

## 嵌入既有壳已经有的

这些记录证明「棕地宿主能走同一条交付管线」，不能充当 #323 的三条。

| 记录 | 实际证明了什么 | 出处 |
|------|----------------|------|
| BF L4 | 在 `rn init` 出来的 brownfield 脚手架上装了 release APK，并跑了 promote / `block`。设备是同一台 vivo。没有按百分比分档，没有崩溃环恢复上一生产包，质量门走的是脚本。 | `docs/hitl/bf-l4-bf-2026-08-26.md` |
| BF L5 | 要求 `.rn/host-profile.jsonc` 为 brownfield，然后调用 `scripts/verify-quality-gate.mjs`。该脚本在进程里构造质量信号并调用 `promote`，不读 logcat。 | `docs/hitl/bf-l5-quality-gate-2026-08-26.md`，`scripts/verify-bf-l5-quality-gate.mjs`，`scripts/verify-quality-gate.mjs` |
| BF consumer 真机 | 安装链接了 AAR 的 debug APK。文档写明不是完整 RN Surface。 | `docs/hitl/bf-consumer-device-2026-08-26.md` |
| 角色表 | 棕地宿主的交接停在 host-profile 与模块 link。没有客户规程编号。 | `docs/handbook/operations/roles-matrix.md` |

操作手册里没有与 `SOP-GF-STEEL-01` 对等的嵌入既有壳规程。`docs/handbook/operations/` 下唯一的 SOP 文件是新建工程那一篇。

## 相对缺口

只列出嵌入既有壳比新建工程少的部分。两边都缺的两台真机灰度、真机回到上一生产候选，不记成棕地专属。

1. **客户规程。** 没有一篇可交给壳运维的步骤，说明既有 Android 工程如何烤入信任根、接入 OTA、声明控制面地址，然后按 #323 做完三条记录。新建工程至少有首次接入规程。
2. **真机质量记录。** 挡住 promote 的那次 logcat 来自验收工程 `com.rnotaacceptance`，不是既有壳。BF L5 是同一条 M9 脚本换了 host-profile。
3. **宿主形态。** BF L4 的设备记录用的是本仓库脚手架（`apply-brownfield-host-stub` / `scaffold-bf-rct-host`），不是客户已经在维护的原生工程。

下一次可执行的工作是写这篇规程（步骤，不新造命令）。规程写完之后，才在一台既有壳真机上补质量信号记录；两台设备的灰度记录和真机回到上一生产候选仍然是新建工程与嵌入既有壳共用的缺口。
