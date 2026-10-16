# SOP-BF-EMBED-01 · 嵌入既有 Android 壳首次端到端接入

| 字段 | 内容 |
|------|------|
| **文档编号** | SOP-BF-EMBED-01 |
| **版本** | 1.0 |
| **状态** | 生效（壳运维按本版执行） |
| **密级** | 内部 · 可交企业运维（不含私钥） |
| **能力口径** | 既有壳的接入步骤与三条证据的取证方法。本文写完不等于记录已经齐，**不能**据此说「企业闭环完成」 |
| **读者** | 企业：平台运维 / 壳运维 / 离线包运维；我方：平台 BD |
| **执行原则** | 企业按 RACI 自执行；BD 交付本规程与答疑，不代跑、不代装机、不代保管私钥 |
| **关联** | [SOP-GF-STEEL-01](./sop-greenfield-steel-thread.md) · [brownfield-enterprise-loop-gap.md](../research/brownfield-enterprise-loop-gap.md) · [#323](https://github.com/client-platform-labs/rn/issues/323) · [#342](https://github.com/client-platform-labs/rn/issues/342) |
| **GitHub** | [#342](https://github.com/client-platform-labs/rn/issues/342) |

JS 列车（签名、晋升、控制面）与新建工程相同，见 SOP-GF-STEEL-01 的 B、D 节。本规程只写既有壳多出来的接法和三条证据怎么取。

---

## 1. 目的

让壳运维把**已经在维护的 Android 工程**接上同一套设备 OTA，并知道三条证据各自要留下什么记录：

1. 信任根烤进该工程打出的 APK，不从热更新载荷读取。
2. 该壳的 JS 表面在启动时向控制面要包。
3. 灰度、回滚、质量门按下面第 6 节留下可核对的记录。

**成功标准**：`rn doctor --profile brownfield` 通过；release APK 内能找到烤入的信任根；真机冷启访问顺序为 CRL → check → 制品。三条证据以第 6 节的「算数 / 不算」为准，缺任何一条都不算闭环。

---

## 2. 范围

### 2.1 在范围内

| 项 | 说明 |
|----|------|
| 宿主标记 | `.rn/host-profile.jsonc` 写 `profile: brownfield` |
| 信任根与原生适配 | `rn ota install --rca-pubkey-hex` |
| 控制面地址 | 启动时把 `controlPlaneBaseUrl` 交给 `bootReleaseOta` |
| JS 列车 | 与 SOP-GF-STEEL-01 相同的 `ship` 命令，不另写 |
| 三条证据 | 第 6 节的取证步骤 |

### 2.2 不在本规程

iOS · App Store · 国内商店提审 · 单地域主备 · AB 实验 · 新造 CLI 或包。`scripts/apply-brownfield-host-stub.mjs` 与 `scripts/scaffold-bf-rct-host.mjs` 只服务仓库内脚手架，**不要**拿来改客户已经在维护的工程。

---

## 3. 和新建工程差在哪

| | 新建工程（SOP-GF-STEEL-01） | 既有壳（本规程） |
|--|------------------------------|------------------|
| 工程从哪来 | `rn init --rca-pubkey-hex` 空目录 | 客户现有 Android 工程，init 会拒绝非空目录 |
| 宿主标记 | 可省略 | 必须 `profile: brownfield` |
| 谁拥有启动 | 工业壳 | 既有 Application / 既有 RN 表面 |
| JS 列车、验签、check | 相同 | 相同 |

---

## 4. 角色

三角色以 [`roles-matrix.md`](./roles-matrix.md) 为准。

| 步骤 | 平台运维 | 壳运维 | 离线包运维 |
|------|:--------:|:------:|:----------:|
| 交接 RCA hex 与控制面 URL | R/A | I | I |
| 标记宿主、烤信任根、接线、装机 | C | R/A | I |
| 签名热更新与三条取证 | C | C（设备） | R/A |

---

## 5. 接入步骤

### 5.1 标记为嵌入既有壳

在工程根写入 `.rn/host-profile.jsonc`：

```jsonc
{ "profile": "brownfield" }
```

这是 `rn doctor` 对既有壳的读法（`packages/rn/src/brownfield-doctor.ts`）。没有这个文件时，doctor 不会按既有壳检查。

验收：`rn doctor --profile brownfield` 退出码 0。`MainApplication.kt` 尚未接上时，`bf-native-ota` 可以是 NEED，不挡住本步；第 5.2 节做完后应消失。

### 5.2 烤入信任根并装上原生适配

平台运维交出 RCA 公钥（64 hex）。壳运维在工程根执行：

```bash
rn ota install --dry-run --rca-pubkey-hex <RCA>
rn ota install --rca-pubkey-hex <RCA>
```

命令会把 `ota-android` 模板拷进 `android/app/src/main/java/<applicationId>/ota/`，把信任根写进适配器，并在找到 `MainApplication.kt` 时注册 `OtaPackage`。可重跑。公钥格式不对时命令在写盘前失败。

**既有工程的 Application 不叫 `MainApplication.kt` 时**，命令在拷贝源文件之后以 `MainApplication.kt not found` 失败。这时不要改命令。按生成的 `ota-wiring.md`，以及模板 `packages/rn/templates/brownfield-android/ota/OtaWiringNotes.md.template`，在现有 Application 里注册 `OtaPackage`。验签仍走随 APK 的 shell-core，不用热更新下来的 JS 验包。

验收：源码中能找到这 64 hex；release APK 内也能找到。找不到则停止，不要发这包。

### 5.3 声明控制面地址

既有壳自己拥有启动。JS 表面调用 `bootReleaseOta` 时传入 `controlPlaneBaseUrl`（`packages/shell-core/src/release-boot.ts`）。POC 用 `http://127.0.0.1:4040` 配合 `adb reverse`；生产用平台运维给出的 HTTPS 地址。禁止手改 `shell/generated-runtime.ts`。

工程里如果已经有工业壳的 `shell/generated-runtime.ts`，控制面地址仍按 SOP-GF-STEEL-01 的 A4：写 `.rn/runtime.jsonc`，再 `rn shell refresh`。

本地明文 HTTP 只放行 127.0.0.1 / localhost（模板 README 第 5 条）。生产走 HTTPS。

验收：冷启 logcat 的访问顺序是 CRL，然后 check，然后制品。`check` 上带 `device=`（安装期稳定 id，模板 `getStableDeviceId`）。没有设备 id 的请求在部分放量时不会进入新切片。

### 5.4 第一次签名热更新

与新建工程同一条列车，命令见 SOP-GF-STEEL-01 D 节：`ship update` → 签名 → `ship release` → `ship promote`。写路由只用 `ship` 和带 `Authorization: Bearer` 的控制面，不用 `rn` 发布。

先让一台设备装上并稳定跑过一个生产候选，再做第 6 节。没有「上一生产候选」时，灰度和回滚都没有对照包。

---

## 6. 三条证据

三条都要留在**这一份既有壳**打出的 release 包上。验收工程 `com.rnotaacceptance` 的记录不能顶替。`scripts/verify-quality-gate.mjs` 与 `scripts/verify-bf-l5-quality-gate.mjs` 是进程内门禁，不算真机记录。

### 6.1 灰度：两台设备按百分比拿到不同包

前置：production 上已有上一候选，新候选已 `ship promote`，且**还没有**自动开 rollout（晋升不会自己开；默认第一步是 1%）。

离线包运维：

```bash
curl -sS -X POST "$CP/v1/rollout/start" \
  -H "Authorization: Bearer $RN_CP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"business_module":"main","digest":"<新候选 digest>","update_id":"<新 update_id>","gate":"js-standard"}'
```

端点见参考手册 `POST /v1/rollout/start`。当前步百分比小于 100 时，`check` 按设备 id 稳定分档。

两台设备冷启。控制面日志里每一条 `[cp] gray` 都要有 `percent=`、`device=`、`cohort=`、`digest=`。百分比内的设备 digest 是新候选，其余是上一生产候选。同一台设备连打两次，digest 不变。

**算数**：两台设备（或两个队列）的 digest 不同，且和日志里的 percent 一致。  
**不算**：只有一台设备；只看 rollout API 自己返回了百分比；请求里没有 `device`。

### 6.2 回滚：回到上一生产候选

前置：该设备已经装过上一生产包，原生侧留着该包的路径和 update_id（安装时的快照）。只有嵌入基线、没有这个快照时，崩溃环会回到基线，**这张记录不算**。

壳运维让该壳连续启动失败直到崩溃环触发（上限 3 次，`DEFAULT_CRASH_LOOP_MAX`）。设备应恢复快照里的上一生产包，并拒绝再装被回滚的 update_id。

**算数**：日志写明恢复的是上一生产包的 update_id，而不是只写回到嵌入基线。  
**不算**：shell-core 单测；没有上一包、因而落到基线的那次。

### 6.3 质量信号挡住一次真实晋升

前置：坏候选在 **staging**，update_id 与设备将要打出的信号一致。

真机在崩溃环回滚时打出字面量：

```text
quality-signal kind=crash business_module=<module> update_id=<被回滚的 id>
```

离线包运维把同一条写入质量门，再晋升这个 digest：

```bash
ship signal record --module <module> --update-id <id> --kind crash --detail crash-loop
ship promote --digest <digest>
```

**算数**：`promote` 退出码非 0，输出含 `quality gate`，候选仍留在 staging。留下 logcat、两条命令的输出和退出码。  
**不算**：只跑 `verify-quality-gate.mjs`；信号的 update_id 对不上暂存候选。

---

## 7. 交接检查

- [ ] `.rn/host-profile.jsonc` 为 `brownfield`，`rn doctor --profile brownfield` 退出码 0
- [ ] release APK 内有 RCA hex；私钥不在交给 BD 或写进仓库的材料里
- [ ] 冷启顺序 CRL → check → 制品，check 带 `device=`
- [ ] 第 6 节三条里，已齐的附上记录路径；未齐的写明缺哪一条

未齐的条保持未齐。不要用本规程的存在代替记录。
