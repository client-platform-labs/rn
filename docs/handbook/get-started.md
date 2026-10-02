<!-- PROTOTYPE · wayfinder #312 · 大纲可反应 · 命令为占位摘要，定稿时对齐 SOP-GF-STEEL-01 -->

# Get Started · 绿地钢线短轨（GF · Android）

> **状态**：`可执行` 目标（定稿须零 TODO）  
> **工业规程全文**：[SOP-GF-STEEL-01](./operations/sop-greenfield-steel-thread.md)（RACI 总表 · 场地 · 证据模板 · 附录）  
> **钢线关闭后** → [日常再发 / 回滚](./daily.md)  
> **BF**：同级另轨，本版不写。

## 页首 · 谁做什么 / 在哪做

| 阶段 | 平台运维 | 壳运维 | 离线包运维 |
|------|:--------:|:------:|:----------:|
| A 信任与工程 | **R** | C | I |
| B 控制面 | **R** | I | I |
| C 宿主首发 | C | **R** | I |
| D 业务首更 | I | C | **R** |
| E 口径关闭 | I | I | **R** + 架构师 A |

**场地（POC 一行）**：工程机 ≈ 签名机 ≈ 控面主机 ≈ 装包台（可同一 Mac）+ USB 真机；生产须拆分密钥机/签名机（见 SOP §5）。

---

## 闭环闸门（何时算过）

真机从 baseline 热更到**已改业务可见态**的 `main`，进程稳定；CP 访问序 **CRL → check → artifacts**；**不**宣称 L5。

---

## 阶段 A · 信任与工程落地

### 平台运维

1. **目标**：产出 RCA 公钥 + leaf，可交给壳烤入 / 签名机使用  
2. **关键命令（摘要）**：`ship keygen` → 保管 leaf 私钥 → 导出 RCA pubkey hex  
3. **闸门**：pubkey 64 hex；私钥不进 git / 不进 APK  
4. **详情** → SOP §9 A1–A2

### 壳运维

1. **目标**：拓扑 B 工程 + 工业壳 + OTA；`cpBaseUrl` 已声明  
2. **关键命令（摘要）**：`rn init --rca-pubkey-hex …` → 声明 CP → doctor 绿  
3. **闸门**：doctor L3e；RCA 仅公钥进工程  
4. **详情** → SOP §9 A3+

<a id="平台运维"></a>
<a id="壳运维"></a>

---

## 阶段 B · 控制面最小可用

### 平台运维

1. **目标**：`ship cp-serve` 可访问；CRL / check 正向  
2. **关键命令（摘要）**：起 CP → 封 CRL（含 cert_chain）→ 探 `/health`  
3. **闸门**：设备侧可拉到 CRL；写路由有 token 策略  
4. **详情** → SOP §9 B

---

## 阶段 C · 宿主首发（低频列车）

### 壳运维

1. **目标**：release APK 真机可装、冷启冒烟  
2. **关键命令（摘要）**：`ship build --profile release` → 装包台安装 →（POC）`adb reverse`  
3. **闸门**：release 卫生（无 DevSession）；冷启稳定  
4. **详情** → SOP §9 C

---

## 阶段 D · 业务首更（高频列车）

### 离线包运维

<a id="离线包运维"></a>

1. **目标**：改 `main` **可见态** → 签名制品 → promote → 真机看到新态且稳定  
2. **关键命令（摘要）**：改 UI 可见字符串 → HBC → ingest/sign/validate → release → promote → 真机验收（OTA/baseline **消歧**）  
3. **闸门**：UI 证据来自 OTA 而非重装 APK；进程不 crash-loop；顺序 CRL→check→artifacts  
4. **详情** → SOP §9 D  
5. **注意**：「开发」= 改可见态；完整 multi-Metro 工业环 → [加深轨 · L1](./deepen/index.md)

---

## 阶段 E · 口径关闭

1. 勾选 SOP §10 验收清单  
2. 证据包最低集 → SOP §12  
3. **对外只说 L4**；L5 走加深轨 + gates  
4. 下一动作 → [日常运维](./daily.md)

---

## 本页不写什么

灰度 / SLO / DR / 吊销 / AB / 商店 submit → [加深轨](./deepen/index.md) 或出范围。
