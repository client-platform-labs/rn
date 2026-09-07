# ADR-015: 每业务独立部署（先单栈，多栈延后），不做共享行级多租户

Status: **accepted** (2026-09-06)
Related: Map G #192（D2）、#198（G6）、#199（G7）、#201（G9）

## Context

D2 定「每业务一套独立部署」，G6 要在一台 ECS 跑多套栈。但当前只有 Greenfield 第一个业务，多栈机制属为不存在的租户造实体。

## Decision

- 长期边界：每业务独立 Compose 栈（独立卷/域名/签名密钥/反代 vhost/库），物理机可共宿主，不做共享行级多租户。
- 本期（Map G）只起 **一套栈** 把 G7 端到端跑通；G6 多栈参数化延后到第二个真实业务出现。
- 「拆栈即搬」作为升级接缝登记 G9（未来每业务独立 VM）。

## Consequences

- #198(G6) 降级为「延后」；本期交付一套栈 + 拆栈即搬接缝文档。
- 第二个业务出现前的返工风险被显式规避。

## Verification

- 一套栈端到端（G7）+ G9 接缝登记。

## Principles compliance

| Check | Answer |
|-------|--------|
| **Plane** | Deployment / Control Plane；隔离在容器/卷/库层，契约单一。 |
| **YAGNI** | 只建一套栈；多栈机制延后，不为空租户造实体。 |
| **Door** | 两向（拆栈即搬）；未来独立 VM 是搬移非重写。 |
| **Dev vs delivery** | 无。 |
| **GF/BF / topology** | 每业务同构一套栈，GF=BF 同标准。 |
| **Blast radius** | 单栈隔离，A 栈故障不串 B 栈（未来）。 |
| **Evidence** | G7 e2e + G9 接缝表。 |