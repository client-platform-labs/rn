# Control Plane — one-click deploy (Docker → any host / ECS)

Containerize the platform's thin control plane (`@client-platform/ship` `cp-serve`)
and deploy it to local Docker or any SSH Docker host (ECS / VPS / bare metal).

The image contains **only the serve-side runtime** (ship + core + rn-engine dists).
The RN project's delivery state (`client-platform.manifest.jsonc` +
`.rn/delivery`: registry, artifacts, sidecars) is produced on your build machine
or CI (`ship build/update → sign → release → promote`) and **synced** to the host
as the CP's data mount. The CP is stateless — the artifact store is the durable
record (ADR-020 seam; cold-rebuild DR = re-sync the state and `up -d`).

## Layout

| file | purpose |
|------|---------|
| `deploy/Dockerfile` | two-stage image: `pnpm install` + `tsc -b` (core/rn-engine/ship) → slim runtime |
| `deploy/docker-compose.yml` | `cp-serve` service, port `CP_PORT`, bind-mounts `./project:/cp/project` |
| `deploy/deploy.sh` | one-click: build/reuse image → sync state → `compose up -d` → health check |
| `.dockerignore` | keeps the build context small (git, node_modules, dist, tsbuildinfo) |

## One click

From an `rn init` project with a built `.rn/delivery`:

```bash
# local docker
deploy/deploy.sh

# any ssh docker host (ECS / VPS)
CP_TARGET=root@1.2.3.4 deploy/deploy.sh

# registry push/pull instead of save/load (multi-host / CI)
CP_TARGET=root@1.2.3.4 CP_REGISTRY=registry.example.com/cp deploy/deploy.sh
```

After a successful run the script prints the healthy URL:

```
deploy: control plane healthy at http://127.0.0.1:7430
```

Point a device at it (`adb reverse tcp:7430 tcp:7430` + CP base URL) and it pulls
the same signed updates as the local CP.

## Env overrides

| var | default | meaning |
|-----|---------|---------|
| `CP_PROJECT_DIR` | cwd | rn project root holding `.rn/delivery` |
| `CP_TARGET` | `local` | `local` or `user@host` |
| `CP_SSH` | `ssh` | ssh binary/args, e.g. `ssh -p 2222` |
| `CP_REMOTE_DIR` | `/opt/client-platform/cp` | host dir for compose + project state |
| `CP_IMAGE` | `client-platform/cp:local` | image name:tag |
| `CP_REGISTRY` | _(empty)_ | push/pull via registry instead of save/load |
| `CP_PORT` | `7430` | host port |
| `RN_CP_TOKEN` | _(empty)_ | bearer token for CP write endpoints |
| `RN_CP_TENANTS` | _(empty)_ | comma-separated tenants |
| `RN_CP_REGISTRY` | `file` | CP storage backend: `file` or `sqlite` |
| `CP_PROXY` | _(empty)_ | proxy URL for the image build (China/corp egress) |

## ECS specifics

- Install Docker once on the instance: `curl -fsSL https://get.docker.com | sh`
  then add your user to the `docker` group and re-login.
- Open `CP_PORT` (7430 lab / 443 prod behind an HTTPS reverse proxy) in the
  security group.
- Set `RN_CP_TOKEN` before exposing the port (write endpoints are gated by it).
- China egress: build locally with `CP_PROXY=http://127.0.0.1:7897` (or point
  the daemon at a mirror) and ship the image with `docker save | ssh docker load`.

## Cold-rebuild DR (ADR-014 alignment)

The CP holds no build state. To rebuild a serving CP from scratch:

1. Produce the state on any machine: `ship update/sign/release/promote`
   (artifact bytes are content-addressed under `.rn/delivery/artifacts/`).
2. `CP_PROJECT_DIR=<that project> deploy/deploy.sh` — sync + `up -d` + health.
3. Devices resume pulling the same signed manifests (digest-verified, ADR-017).

## Rollout / rollback on a deployed CP

Identical to local: `ship promote --digest <new>` then re-sync
(`deploy/deploy.sh`) so the host serves the newest production candidate;
`ship block --digest <bad>` + re-sync falls back to the previous good candidate.
(`/v1/js-updates/check` serves the newest production entry — see serve.ts.)
