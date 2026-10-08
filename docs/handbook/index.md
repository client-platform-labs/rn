# rn 平台 · 企业推广实施门户

> **你在哪**：统一入口（**编排层**）。架构 / 参考 / 操作三本是深层书架；出事走紧急通道。正文不搬家、不合并。  
> **首版范围**：GF · Android · 主路径可执行（L4 钢线 + 日常再发/回滚）。L5 灰度 / DR / 吊销见加深轨。  
> **原则**：企业三角色自跑；BD 交手册与答疑，不代跑、不持生产私钥。主路径 **零 TODO**。  
> **工业规程**：[SOP-GF-STEEL-01](./operations/sop-greenfield-steel-thread.md)

## 一条闭环

```text
改业务可见态 → 宿主 release 可装 → CP 可验签
    → 签名 OTA 真机生效且稳定 → 日常再发 / 回滚 → （出事）紧急四行
```

| 我要… | 去哪 |
|------|------|
| **第一次从 0 跑通** | → [Get Started（钢线短轨）](./get-started.md) |
| **再发一版 JS / 回滚** | → [日常运维](./daily.md) |
| **灰度 · DR · 吊销 · 开发工业环** | → [加深轨](./deepen/index.md)（含应然页，勿当今日 runbook） |
| **出事了** | → [紧急通道](./operations/index.md#0-紧急通道出事先看哪) |

---

## 按角色进

| 角色 | 主路径你负责的段 | 从这开始 |
|------|------------------|----------|
| **平台运维** | 信任根 / leaf · CP 起服 · CRL | [Get Started · 平台段](./get-started.md#平台运维) |
| **壳运维** | init / 烤 RCA · release APK · 装机 | [Get Started · 壳段](./get-started.md#壳运维) |
| **离线包运维** | 改可见态 · 签名发布 · 真机验收 · 日常再发/回滚 | [Get Started · 离线包段](./get-started.md#离线包运维) → [日常](./daily.md) |

职责深读 → [`roles-matrix.md`](./operations/roles-matrix.md)（书架，非短轨）。

---

## 书架

| 本 | 管什么 |
|----|--------|
| [架构手册](./architecture/index.md) | 是什么（五平面、信任、拓扑） |
| [参考手册](./reference/index.md) | 命令 / 字段 / API 事实表 |
| [操作手册](./operations/index.md) | 出事怎么办 + 运维加深 |
| [SOP-GF-STEEL-01](./operations/sop-greenfield-steel-thread.md) | 钢线工业规程全文（RACI / 场地 / 证据 / 附录） |

主路径只列最小命令序列；CLI / HTTP 整表见参考手册，禁止整表搬进 Get Started。

---

## 能力口径

| 可宣称 | 条件 |
|--------|------|
| 单 module 可企业推广 | 钢线关闭（L4），见 [Get Started · 阶段 E](./get-started.md#阶段-e--口径关闭) |
| 企业闭环 | L5 — 仅加深轨 + `enterprise-promotion-gates`；**勿**在钢线未关时宣称 |

BF / iOS / Harmony：同级另轨，本版不写（脚注即可）。
