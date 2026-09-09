# RN Enterprise Delivery Platform · One-Pager

**Positioning**: An enterprise-grade delivery platform covering the full RN app lifecycle — project initialization → parallel business-module development → signed release → on-device OTA delivery & rollback → gray rollout & quality gates → disaster recovery. Greenfield (new apps) and Brownfield (embedding into existing native hosts) share **one industrial standard on two paths** — one platform, not two products.

## Problems it solves

| Business pain | Platform answer |
|---|---|
| Slow iteration; releases gated by app stores | Business modules ship independently; on-device OTA in seconds, no store release |
| Parallel teams step on each other | Isolated module workspaces + generated registry; shell never depends on business code |
| Online incidents hard to roll back | One-click block of a bad version; devices auto-fall back to the last good one (**verified on real hardware**) |
| Releases untrusted, unauditable | Real Ed25519 verification on device (fail-closed) + content-addressed artifacts + audit log |
| No quality gate before ship | E2E failure signals block promotion; gray rollout auto-pauses on SLO breach |

## Deliverables at a glance

| Layer | Deliverable | One-line capability |
|---|---|---|
| Runtime SDK | Contract/gate library · engine adapter · device OTA SDK | Verification, compatibility window, crash-loop rollback; switching engines = swapping one adapter |
| Framework | Developer CLI + industrial shell scaffold + generated registry | One-command CLI install; minutes to a production-grade shell project |
| Platform services | Delivery CLI + control plane (Docker) | Sign/release/rollback/gray/artifact store/audit; one-click deploy to your own servers |
| Governance | Architecture decision records + principles + runbooks + release checklist | Rules hardened into contracts and executable gates |

## Why it is trustworthy (evidence)

- **Real-device E2E**: full loop verified on hardware — release → device signature verify → download → install + reload → run; and block → device rollback to the previous good version
- **Automated quality**: 300+ automated tests green; 60+ capability verification chains; 10 device E2E scenario chains
- **Architecture governance**: 13 formal ADRs; engineering-principles red lines enforced
- **GF/BF unified**: one protocol covers both greenfield apps and existing native hosts

## Security & reliability

- **Real Ed25519 verification on device** (fail-closed) + **dual-key rotation** (emergency revocation); production signing key held by release owner; isolated non-production keys for automation
- **Content-addressed artifact store**: sha256-addressed, re-verified on download, tamper-evident and auditable
- **Cold-rebuild DR**: daily encrypted offsite backup; rebuild and restore in ~minutes on any Docker host (no standby commitment — simple and cost-controlled)
- **Per-business isolation**: each business app gets its own Compose stack (data volume / domain / signing / database)

## How to adopt

1. **Develop** — install the CLI with one command → `init` a project → teams develop in isolated module workspaces
2. **Release** — delivery CLI builds/signs → pre-prod validation → controlled, auditable promote to production
3. **Deploy** — Docker image deploys to your own servers or cloud (ECS/VPS) with automated health checks
4. **Operate** — gray rollout / rollback / quality gates / audit out of the box; DR drill = rebuild on another machine

**In one sentence**: industrial-grade, end-to-end — from scaffolding to release to the device; verified on real hardware, secure and auditable, rollback with a safety net, deployed to your own infrastructure.
