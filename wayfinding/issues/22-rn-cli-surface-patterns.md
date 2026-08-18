Type: research
Mode: AFK
Status: resolved
Triage: ready-for-agent
Assignee: cursor-agent
Blocked by: 03, 04
Unblocks: 08

# 企业 RN 薄 CLI 命令面与插件协议对照

## Question

Expo CLI / EAS、官方 React Native CLI、以及可比的企业多产品 CLI（含本家族 `@client-platform/kernel` 模式）在命令信息架构、配置优先级、插件发现、非交互/CI 模式、dry-run、退出码、凭证边界与版本协商上，有哪些可核实的现成合同与反模式？

产出对照表与一手来源，供 [薄 CLI 的产品与扩展合同](./08-cli-product-contract.md) HITL 决策使用；不替人选定最终命令表。

## Answer

上游“薄 CLI”是切开的宿主而非万能二进制：`npx expo` 随 SDK 管开发/生成，`eas` 独立管交付并用 `cli.version` 约束、禁止塞进 app dependencies；Community CLI 自 0.76 与 RN 解耦，必须按兼容表锁定。插件至少三类（CLI 命令 / config plugin / autolinking），不可混 ABI。CI 合同是 `CI`/`--non-interactive`/`EXPO_TOKEN` 与 `--json`→stderr；全局 dry-run 与细分退出码表在 RN/Expo/EAS 上不存在，需自建。kernel 仅有章程，尚非可执行合同。

完整研究：[企业 RN 薄 CLI：命令面、配置、插件与 CI 合同对照](../research/22-rn-cli-surface-patterns.md)。
