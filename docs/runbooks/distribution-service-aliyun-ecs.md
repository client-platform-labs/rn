# Distribution Service on Alibaba Cloud ECS (Map E L1)

Deploy the **single Node Distribution Service** on an ECS instance for host install portal + JS/offline train practice.

Specs: [`distribution-service.openapi.yaml`](../specs/distribution-service.openapi.yaml) · Compose: [`deploy/distribution-service/`](../../deploy/distribution-service/).

## Prerequisites

- ECS with **Ubuntu 22.04+** or **Alibaba Cloud Linux 3**
- Security group: open **4040** (lab) or **443** (production behind HTTPS reverse proxy)
- Docker + Docker Compose plugin installed on the instance

## 1. Install Docker (ECS)

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"
# re-login, then:
docker compose version
```

## 2. Deploy from Mac (recommended)

```bash
# From platform repo — rsync + docker compose on 47.93.214.189
./scripts/deploy-distribution-ecs.sh

# Verify (public :4040 or SSH fallback)
node scripts/verify-distribution-ecs.mjs
```

Set `RN_CP_TOKEN` on ECS before exposing the port:

```bash
ssh -i ~/.ssh/hermes-ecs root@47.93.214.189 \
  'nano /opt/rn/deploy/distribution-service/.env'
```

Push tiangong-host registry + artifacts after local steel thread:

```bash
node scripts/verify-map-e-tiangong-steel-thread.mjs
node scripts/sync-distribution-registry-to-ecs.mjs
```

Device checkUpdate manifest:

```bash
node scripts/verify-map-e-device-checkupdate.mjs /Users/xuwei/code/tiangong-host
```

## 3. Manual deploy on ECS

On ECS (clone or rsync the repo):

```bash
cd /opt/rn   # your clone path
cp deploy/distribution-service/.env.example deploy/distribution-service/.env
# Edit .env — set a strong RN_CP_TOKEN
nano deploy/distribution-service/.env

docker compose -f deploy/distribution-service/docker-compose.yml up -d --build
docker compose -f deploy/distribution-service/docker-compose.yml ps
curl -s http://127.0.0.1:4040/health | jq .
curl -s http://127.0.0.1:4040/v1/service | jq .
```

Open in browser (replace with ECS public IP):

```text
http://<ECS_PUBLIC_IP>:4040/
```

Enter the same `RN_CP_TOKEN` in the console for Promote/Block actions.

## 3. Security (required for public ECS)

1. **Always set `RN_CP_TOKEN`** in `.env` — never leave mutating routes open on the public internet.
2. Prefer **HTTPS** via Nginx/Caddy on 443 → proxy to `127.0.0.1:4040` (iOS `itms-services` requires HTTPS for real devices).
3. Restrict security group to office VPN / bastion IP when possible.
4. Data persists in Docker volume `distribution-data` — back up before rebuild:

```bash
docker volume inspect distribution-service_distribution-data
```

## 4. Seed a test host build (optional)

From your dev machine, after `rn-delivery release` on an app project, copy artifact + registry row to ECS volume, **or** use API + manual registry edit for smoke:

```bash
# On ECS — inject fake APK for portal smoke (lab only)
docker compose -f deploy/distribution-service/docker-compose.yml exec distribution sh -c '
  echo PKfake > /data/project/demo.apk
  cat > /data/project/.rn/delivery/registry.json <<EOF
{"schemaVersion":1,"staging":[{"release_id":"lab-1","artifact_kind":"app-host-debug","platform":"android","profile":"debug-host","digest":"'"$(printf a%.0s {1..64})"'","stage":"promote","path":"/data/project/demo.apk","configuration":"debug"}],"production":[],"blocked":[],"kills":[],"pauses":[],"rollouts":[]}
EOF
'
curl -s "http://127.0.0.1:4040/v1/candidates" | jq .
```

Download: `http://<ECS_IP>:4040/v1/artifacts/<digest>`.

## 5. API-only mode (enterprise custom UI)

In `.env`:

```env
RN_CP_DISABLE_CONSOLE=1
```

Restart compose. Integrate your portal against OpenAPI paths only.

## 6. CI push workflow (conceptual)

```text
GitLab/Jenkins → rn-delivery build/update/sign/release (app repo)
              → rsync .rn/delivery/ to ECS volume OR future S3+Postgres (L2)
              → candidates appear in GET /v1/candidates | /v1/js-updates
```

Truth stays in registry — install portal never invents build numbers.

## 7. Verify locally before ECS

```bash
node scripts/verify-distribution-compose.mjs
```

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Connection refused | Security group · `docker ps` · `RN_CP_HOST=0.0.0.0` |
| 401 on promote | Bearer token matches `RN_CP_TOKEN` |
| Empty candidates | `registry.json` has android host rows with valid `path` |
| iOS install fails | Need HTTPS + valid plist (v1 documents constraint; auto plist is later) |

## Next (L2)

- Helm chart + Postgres + OSS (Aliyun Object Storage) for blobs
- Same OpenAPI contract — only topology changes
