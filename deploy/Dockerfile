# Client-platform control plane image (ship cp-serve).
#
# Runtime: Node 22 (engine >=22 <25). Serves an rn project's delivery state
# (.rn/delivery: registry + artifacts + sidecars) mounted at /cp/project over
# the thin CP HTTP API. Storage: file registry (default) or sqlite
# (RN_CP_REGISTRY=sqlite). Build is two-stage: compile the workspace (tsc -b),
# then copy dist + node_modules into the slim runtime.
#
# Build (from repo root):
#   docker build -f deploy/Dockerfile -t client-platform/cp:local .
#
# Proxy (China network / corporate egress): pass HTTP_PROXY/HTTPS_PROXY build
# args — buildkit injects them into RUN automatically:
#   docker build --build-arg HTTP_PROXY=http://127.0.0.1:7897 \
#     --build-arg HTTPS_PROXY=http://127.0.0.1:7897 -f deploy/Dockerfile -t client-platform/cp:local .
FROM node:22-bookworm-slim AS build
# Optional proxy (China/corp egress): pass --build-arg HTTP_PROXY=... HTTPS_PROXY=...
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY
ENV HTTP_PROXY=${HTTP_PROXY} HTTPS_PROXY=${HTTPS_PROXY} NO_PROXY=${NO_PROXY}
WORKDIR /src
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json tsconfig.base.json ./
COPY packages ./packages
RUN corepack enable \
  && pnpm install --frozen-lockfile --ignore-scripts \
  && pnpm exec tsc -b packages/core packages/rn-engine packages/ship

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /opt/cp
COPY --from=build /src/node_modules ./node_modules
COPY --from=build /src/packages ./packages
# Project root served by the CP (manifest + .rn/delivery). Mount a volume here.
ENV RN_CP_PROJECT=/cp/project
EXPOSE 7430
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:7430/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["node", "packages/ship/bin/ship.mjs", "cp-serve", "--port", "7430", "--host", "0.0.0.0"]
