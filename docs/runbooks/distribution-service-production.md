# Distribution Service — 生产形态（Production Shape）

> 定位：从「单机 demo / L1 self-host」到「企业推广可部署」之间的差距与演进路径。
> 不是替代现有 runbook，而是给出**生产部署的拓扑、多租户演进、灰度/审计落地**的统一视图。

## 1. 拓扑

```mermaid
flowchart TB
    subgraph Edge["边缘 / 设备"]
        Phone["Android 真机 / iOS 设备"]
    end
    subgraph K8s["Kubernetes (or ECS + Compose)"]
        CP["distribution-service\n(CP :4040)\n写路由鉴权 + 灰度 + 审计日志"]
        DS["data-service\n(FastAPI :8001)\n只读业务后端"]
        Nous["nous :8000\n(可选)"]
        PVC[("PVC\nregistry + artifacts")]
    end
    subgraph Back["后端存储"]
        PG[("Postgres\n(cp_registry 多租户)")]
        S3[("OSS / S3\nblob 存储")]
        SQLite[("screener.db / reports.db\n(data-service 只读)")]
    end

    Phone -->|"https (Caddy/Ingress)"| CP
    Phone -->|"/v1/js-updates/check"| CP
    CP --> PVC
    CP -.->|"RN_CP_DATABASE_URL (L2 演进)"| PG
    CP -.->|"artifact blob (L2 演进)"| S3
    DS --> SQLite
```

- **distribution-service**：host 安装门户 + JS/离线包 train + 共享 CP API。写路由（promote/block/kill/pause/resume/rollout/dependency-manifest/device-lane）落**统一审计日志**。
- **data-service**：独立的、只读的 Python FastAPI 后端（`/v1/health`、`/v1/global/latest`、`/v1/macro/indicators`、`/v1/benchmark`、SSE 等），供业务离线包消费。
- **Nous**：现有业务 API 后端，`/v1/health`、`/openapi.json` 等。

## 2. 两条部署路径

| 路径 | 工具 | 适用 |
|------|------|------|
| **ECS + Compose** | `deploy/distribution-service/docker-compose.yml` | 单机起步、私有化交付 |
| **Kubernetes** | `deploy/distribution-service/helm/` | 企业推广、多副本、多租户 |

### 2.1 ECS + Compose（沿用 L1）

```bash
cp deploy/distribution-service/.env.example deploy/distribution-service/.env
# 设 RN_CP_TOKEN + DATA_SERVICE_API_KEY
docker compose -f deploy/distribution-service/docker-compose.yml up -d --build
```

- data-service 现在与 distribution 并行编排（`DATA_SERVICE_CONTEXT` 指向 `~/code/data-service`）。
- 两个服务都带 healthcheck；`curl http://127.0.0.1:4040/health` 与 `curl http://127.0.0.1:8001/v1/health`。

### 2.2 Kubernetes（Helm）

```bash
helm install distribution-service deploy/distribution-service/helm \
  --set distribution.env.cpToken='<strong-secret>' \
  --set dataService.enabled=true
```

- distribution 与 data-service 各自 Deployment + Service 端口；
- `distribution.persistence.enabled`（默认 true）挂 PVC；（可选）data-service 用 hostPath 只读挂载源 SQLite；
- Ingress 双域名 `dist.tiangong.local` / `dist-staging.tiangong.local`。

## 3. 多租户演进路径

| 阶段 | 鉴权 / 隔离 | 存储 | 说明 |
|------|------------|------|------|
| **L1 单租户** | `RN_CP_TOKEN` | file / sqlite | 私有化单租户 |
| **L1.5 多 token** | `RN_CP_TENANTS='{"acme":"…"}'` + `X-RN-Tenant` | file / sqlite | **已落地**（`verify-cp-enterprise`） |
| **L2 存储隔离** | 同上 + Postgres row scope | `RN_CP_DATABASE_URL` | 契约就位；行按 `(tenant_id, product_app)` |

```bash
# Multi-tenant thin auth
export RN_CP_TENANTS='{"acme":"tok-acme","beta":"tok-beta"}'
curl -X POST "$CP/v1/promote" \
  -H "Authorization: Bearer tok-acme" \
  -H "X-RN-Tenant: acme" \
  -H "Content-Type: application/json" \
  -d '{"digest":"..."}'
```

## 4. 灰度 + 审计落地

### 4.1 灰度设备切片（C6.3）

- 每个设备可被 PUT 到 `staging` / `production` / `gray` lane：

```bash
curl -X PUT "$CP/v1/devices/$SERIAL/lane" \
  -H "Authorization: Bearer $RN_CP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"serial":"'$SERIAL'","lane":"gray"}'

curl "$CP/v1/devices/$SERIAL/lane"   # → {"serial":..., "lane":"gray"}
```

- registry 结构含 `gray` 数组 + `devices` 路由表；`/v1/candidates?lane=gray` 和 `/v1/js-updates?lane=gray` 过滤生效。
- `device-manifest.json`（`.rn/` 下）是设备切片配置（`allow` 列表 + `default_lane`），首次 seed 自动生成。

### 4.2 七阶段审计日志（C6.4）

- 所有 CP **写路由**落结构化审计行：`<projectRoot>/.rn/distribution-lab/logs/cp-audit.log`。
- 每行 JSON：`{ ts, method, path, actor, outcome, detail, tenant? }`，`outcome ∈ {ok, denied, error}`。
- 鉴权失败（401/403）也落 `denied` 条目——企业合规审计可据此追查。

```bash
tail -5 .rn/distribution-lab/logs/cp-audit.log | jq -c '{ts,method,path,actor,outcome,tenant}'
```

### 4.3 薄观测（可替换）

```bash
curl -s "$CP/v1/metrics"          # Prometheus text
curl -X POST "$CP/v1/sli" \
  -H "Authorization: Bearer $RN_CP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"digest":"...","sli":{"crash_rate":0.01},"tick":true}'
```

## 5. 上市前高质量交付产物核对

| 产物 | 位置 | 状态 |
|------|------|------|
| 签名 | `RN_DELIVERY_SIGN_KEY_PEM`（Ed25519/RSA） / HMAC / digest-stub | ✅ 路径就位；工业 CA/HSM 仍是替换点 |
| SBOM（CycloneDX） | `rn-delivery sign` stub slot | 🟡 真 CycloneDX = #90 |
| 审计日志 | `cp-audit.log` | ✅ |
| 灰度设备切片 | `/v1/devices/:serial/lane` + `gray` | ✅ |
| 鉴权 | `RN_CP_TOKEN` 或 `RN_CP_TENANTS` | ✅ |
| 观测 | `/v1/metrics` + `/v1/sli` | ✅ 薄；外部后端是替换点 |
| Postgres 存储 | `RN_CP_DATABASE_URL` | 🟡 契约就位 |
| Helm chart | `deploy/distribution-service/helm/` | ✅ |
| 真机门禁 | `.github/workflows/device-gate.yml` | ✅ workflow；需注册 runner |

## 6. 相关文档

- 本地服务：`distribution-service-local-server.md`
- ECS：`distribution-service-aliyun-ecs.md`
- OpenAPI：`../specs/distribution-service.openapi.yaml`
- 存储规范：`../specs/distribution-service-storage.md`
- 架构自测手册：`../architecture/arch-onboarding.md`