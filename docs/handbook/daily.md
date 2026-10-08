# 日常运维 · 再发与回滚

> **状态**：`可执行` · 主路径零 TODO  
> **前置**：[Get Started](./get-started.md) 钢线已关闭（L4）  
> **主角色**：离线包运维（平台运维保 CP / CRL）  
> 命令旗标与 HTTP 字段 → [参考手册](./reference/index.md)；本页不搬整表。

## 再发一版 JS（同一 `main`）

1. 再改运行时可见态（或等价可观测变更）  
2. 与钢线 D2–D4 同构：

```bash
cd "$APP"
source <leaf-env>          # 同 SOP 附录 A
ship update --module main
# hermesc → HBC
ship ingest-pack --hbc <path-to.hbc>
ship sign && ship validate
ship release --kind js-update
ship promote --digest <digest>
```

3. 真机确认新可见态；保留 OTA/baseline 消歧习惯（不靠重打 APK 证明）  
4. 闸门：check 指向新 digest；进程稳定；序仍为 CRL → check → artifacts  

## 包级回滚（停投递坏包）

坏 JS 导致不稳定时（对齐 SOP §11）：

1. **止血**：对坏 digest 做包级 block（HTTP `POST /v1/block`，body 含 `digest`）  
   - **禁止**使用会误伤宿主列车的 `ship block --platform android`  
2. 需要设备立刻离坏包：装包台 `adb shell pm clear <pkg>` 回 baseline，再按需 re-promote **上一良好** digest  
3. 真机确认回到预期可见态  

决策树与 N-1 槽位细节 → [`multi-bundle-version.md` §5](./operations/multi-bundle-version.md) · [`ota.md` §5](./operations/ota.md)。

## 本页不写

灰度 tick / `paused_slo` / quality gate 挡 promote / 吊销演练 → [加深轨](./deepen/index.md)。  
出事定位 → [紧急通道](./operations/index.md#0-紧急通道出事先看哪)。
