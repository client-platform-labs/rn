# Control Plane on Alibaba Cloud ECS / any Docker host (one-click)

Deploy the platform's thin control plane (`ship cp-serve`) to ECS or any Docker
host with a single script. The image is serve-only; the delivery state
(`.rn/delivery`) is produced on your build machine or CI and synced to the host.

Legacy note: the older `deploy/distribution-service/` scheme targets the
pre-split `rn-delivery`/`rn-core` packages (dead in the current workspace). Use
`deploy/` (this doc) for the current `@client-platform/ship` control plane.

## Prerequisites

- ECS with **Ubuntu 22.04+** / **Alibaba Cloud Linux 3**
- Security group: open **7430** (lab) or **443** behind an HTTPS reverse proxy
- Docker + Compose plugin on the instance

## 1. Install Docker on ECS (once)

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"
# re-login, then:
docker compose version
```

## 2. Deploy (from your build machine / CI)

```bash
# from the platform repo, with the rn project that holds .rn/delivery:
CP_PROJECT_DIR=/path/to/app \
CP_TARGET=root@<ecs-ip> \
RN_CP_TOKEN='<strong-token>' \
deploy/deploy.sh
```

The script: builds/reuses the image → ships it to the host (registry push/pull
or `docker save | ssh docker load`) → rsyncs the delivery state → `docker
compose up -d` → health-checks `GET /health`.

China egress: build with `CP_PROXY=http://127.0.0.1:7897` (see deploy/README.md).

## 3. Verify

```bash
curl -s http://<ecs-ip>:7430/v1/registry | head
curl -s "http://<ecs-ip>:7430/v1/js-updates/check?module=main&lane=production" | head -c 300
```

Point a device at it (`adb reverse tcp:7430 tcp:7430` on a locally-reversed
port, or set the CP base URL to the public address) — the device pulls the same
signed manifests.

## 4. Promote / rollback a live CP

On the build machine, then re-run `deploy/deploy.sh` so the host serves it:

```bash
export RN_DELIVERY_SIGN_KEY_PEM="$(cat ~/.client-platform/rn/lab-sign-key.pem)"
ship update --module main && ship sign && ship release && ship promote --digest <new>
# forward:  re-run deploy.sh → devices get <new> (newest production wins)
ship block --digest <new> --reason "rollback"
# rollback: re-run deploy.sh → devices get the previous good candidate
```

The state is content-addressed (`.rn/delivery/artifacts/<digest>`), so
cold-rebuild DR = produce the state anywhere, sync it, `up -d` (ADR-014/020).

## Manual deploy on ECS (no build machine)

Rsync the platform repo + the project's `.rn/delivery` to the instance, then on
the instance:

```bash
cd /opt/cp && cp deploy/docker-compose.yml .
mkdir -p project && rsync -a <project>/.rn/delivery project/.rn/delivery
cp <project>/client-platform.manifest.jsonc project/
CP_PORT=7430 RN_CP_TOKEN='<token>' docker compose up -d
```
