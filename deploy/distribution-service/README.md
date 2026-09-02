# Distribution Service — L1 self-host

Single Node process: host install portal + JS/offline train + shared CP API.

**本机完整服务（推荐先做）：** [`docs/runbooks/distribution-service-local-server.md`](../../docs/runbooks/distribution-service-local-server.md)

```bash
./scripts/setup-local-distribution-server.sh
node scripts/verify-local-distribution-chain.mjs
```

Docker（可选）:

```bash
# From repository root
cp deploy/distribution-service/.env.example deploy/distribution-service/.env
# edit RN_CP_TOKEN

# 挂载 tiangong-host registry（本机全链路）
docker compose -f deploy/distribution-service/docker-compose.yml \
  -f deploy/distribution-service/docker-compose.local.yml up -d --build

curl http://127.0.0.1:4040/health
```

若 `docker pull` / 构建时 `connection reset`，先设代理再构建：

```bash
export HTTP_PROXY=http://127.0.0.1:7897 HTTPS_PROXY=http://127.0.0.1:7897
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
```

- OpenAPI: `docs/specs/distribution-service.openapi.yaml`
- Storage: `docs/specs/distribution-service-storage.md`
- Aliyun ECS: `docs/runbooks/distribution-service-aliyun-ecs.md`
- Verify: `node scripts/verify-distribution-compose.mjs`
