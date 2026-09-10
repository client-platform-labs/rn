# Map E L1 — Distribution Service (Node reference impl)
# Build: docker build -f deploy/distribution-service/Dockerfile .
# Context: repository root
#
# N12: package layout follows ADR-022 (core / rn-engine / shell-core) and the
# rn-delivery → ship rename. The CP is `ship cp-serve`, which needs core +
# rn-engine (ship's workspace deps). Keep this list in sync when packages move.

FROM node:22-bookworm-slim AS build

WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@11.22.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/tsconfig.json packages/core/
COPY packages/rn-engine/package.json packages/rn-engine/tsconfig.json packages/rn-engine/
COPY packages/ship/package.json packages/ship/tsconfig.json packages/ship/

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY packages/core/src packages/core/src
COPY packages/rn-engine/src packages/rn-engine/src
COPY packages/ship/src packages/ship/src
COPY packages/ship/bin packages/ship/bin
COPY packages/ship/static packages/ship/static

RUN pnpm exec tsc -b packages/core packages/rn-engine packages/ship

FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production \
    RN_CP_PROJECT=/data/project \
    PORT=4040

RUN corepack enable && corepack prepare pnpm@11.22.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/
COPY packages/rn-engine/package.json packages/rn-engine/
COPY packages/ship/package.json packages/ship/

RUN pnpm install --frozen-lockfile --ignore-scripts --filter @client-platform/ship...

COPY --from=build /repo/packages/core/dist packages/core/dist
COPY --from=build /repo/packages/rn-engine/dist packages/rn-engine/dist
COPY --from=build /repo/packages/ship/dist packages/ship/dist
COPY --from=build /repo/packages/ship/bin packages/ship/bin
COPY --from=build /repo/packages/ship/static packages/ship/static
COPY deploy/distribution-service/entrypoint.sh /entrypoint.sh
COPY deploy/distribution-service/normalize-registry-paths.mjs /app/deploy/distribution-service/normalize-registry-paths.mjs

RUN chmod +x /entrypoint.sh

VOLUME ["/data/project"]
EXPOSE 4040

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4040)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/entrypoint.sh"]
