# 嵌入既有壳相对新建工程还缺的证据与规程

GitHub: [#340](https://github.com/client-platform-labs/rn/issues/340)，取证票 [#370](https://github.com/client-platform-labs/rn/issues/370)，父图 [#319](https://github.com/client-platform-labs/rn/issues/319)。对照 [#323](https://github.com/client-platform-labs/rn/issues/323) 的三条证据。本文只记账，不构成「企业闭环完成」。

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
| 灰度分档 | vivo `10CEC62C7R000E3` 与模拟器 `emulator-5554` 在 percent=28 下冷启。bucket 25 拿到最新候选，bucket 30 拿到上一生产候选，同一 device 再请求 digest 不变。第二台运行时是模拟器 `sdk_gphone64_arm64`。宿主是验收工程。 | `evidence/device-gray/`，[#358](https://github.com/client-platform-labs/rn/issues/358) |
| 回到上一生产候选 | vivo `10CEC62C7R000E3` 在装稳 `main-631e0d976f50` 后再装 `main-a0d130f489bc`，崩溃环日志写明恢复的是上一包 `main-631e0d976f50`，不是嵌入基线。宿主是验收工程。模块入口挂了 `ShellHost`，否则安装后的包不再跑启动序列。 | `evidence/device-previous-production/10CEC62C7R000E3-2026-10-16T16-06-46-449Z.json` |

新建工程的三条里，质量信号、回到上一生产候选、以及这一次两运行时灰度都有记录。灰度的第二台运行时是模拟器。客户规程停在首次接入，没有把这三条写成可执行步骤。

## 嵌入既有壳已经有的

这些记录证明「棕地宿主能走同一条交付管线」，不能充当 #323 的三条。

| 记录 | 实际证明了什么 | 出处 |
|------|----------------|------|
| 客户规程（接入 + 三条取证方法） | `SOP-BF-EMBED-01` 已生效。写清烤信任根、接线、控制面，以及第 6 节三条证据的算数 / 不算。本文写完不等于记录已经齐。 | `docs/handbook/operations/sop-embed-existing-shell.md` |
| BF L4 | 在 `rn init` 出来的 brownfield 脚手架上装了 release APK，并跑了 promote / `block`。设备是同一台 vivo。没有按百分比分档，没有崩溃环恢复上一生产包，质量门走的是脚本。 | `docs/hitl/bf-l4-bf-2026-08-26.md` |
| BF L5 | 要求 `.rn/host-profile.jsonc` 为 brownfield，然后调用 `scripts/verify-quality-gate.mjs`。该脚本在进程里构造质量信号并调用 `promote`，不读 logcat。 | `docs/hitl/bf-l5-quality-gate-2026-08-26.md`，`scripts/verify-bf-l5-quality-gate.mjs`，`scripts/verify-quality-gate.mjs` |
| BF consumer 真机 | 安装链接了 AAR 的 debug APK。文档写明不是完整 RN Surface。 | `docs/hitl/bf-consumer-device-2026-08-26.md` |
| 角色表 | 棕地宿主交接指向 host-profile 与模块 link；规程编号见 SOP-BF-EMBED-01。 | `docs/handbook/operations/roles-matrix.md` |

## 相对缺口

只列出嵌入既有壳比新建工程少的部分。规程已齐；缺的是**客户正在维护的既有壳**上的真机三条。新建工程有一次两运行时灰度（第二台是模拟器）；嵌入既有壳还没有自己的灰度 / 上一生产回滚 / 真机质量门记录。

1. **真机质量记录。** 挡住 promote 的那次 logcat 来自验收工程 `com.rnotaacceptance`，不是既有壳。BF L5 是同一条 M9 脚本换了 host-profile。
2. **宿主形态。** BF L4 的设备记录用的是本仓库脚手架（`apply-brownfield-host-stub` / `scaffold-bf-rct-host`），不是客户已经在维护的原生工程。
3. **本机无既有壳（2026-11-16 再扫）。** 见下一节。取证票 [#370](https://github.com/client-platform-labs/rn/issues/370) 在拿到壳之前不能开装机。

## 本机宿主盘点（2026-11-16）

再扫 `/Users/xuwei/Work/code` 与本仓库：没有找到**真正**客户维护、且 `host-profile=brownfield` 的既有 Android 壳。不算 `examples/brownfield-host`、`apply-brownfield-host-stub` / `scaffold-bf-rct-host`，也不把 greenfield 改写成 brownfield。

| 路径 | applicationId | host-profile | 判定 |
|------|---------------|--------------|------|
| `/Users/xuwei/Work/code/rn-ota-acceptance` | `com.rnotaacceptance` | greenfield | 验收工程，#370 不算 |
| `/Users/xuwei/Work/code/tiangong-host` | `com.tiangong.host` | greenfield | 新建工业壳，#370 不算 |
| `/Users/xuwei/Work/code/chatroom/chatroom-app` | `com.chatroomapp` | greenfield | 新建工程，#370 不算 |
| `/Users/xuwei/Work/code/rn-steel-demo/app` | `com.app` | greenfield | 新建工程，#370 不算 |
| `examples/brownfield-host`（本仓库） | （脚手架 stub） | brownfield | 仓库内 stub，#370 不算 |
| `/Users/xuwei/Work/code/.scratch/**/examples/brownfield-host` | （脚手架副本） | — | scratch / 脚手架，#370 不算 |

`/Users/xuwei/Work/code` 下其余目录（desk、kai、dashboard、nous、pi、stock-* 等）无独立 Android 壳工程、无 `.rn/host-profile.jsonc`。

**壳运维要提供**：非空既有 Android 工程（`rn init` 会拒）、根目录 `.rn/host-profile.jsonc` 为 `profile: brownfield`、可按 SOP-BF-EMBED-01 烤 RCA / 接线 / 声明控制面，并接上至少两台（或两批）真机。拿到后按该规程第 6 节取三条证据；在此之前设备 agent 无候选可装。
