# Map E L1 — Distribution Service (Node reference impl)
# Build: docker build -f deploy/distribution-service/Dockerfile .
# Context: repository root

FROM node:22-bookworm-slim AS build

WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@11.22.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.base.json ./
COPY packages/rn-core/package.json packages/rn-core/tsconfig.json packages/rn-core/
COPY packages/rn-delivery/package.json packages/rn-delivery/tsconfig.json packages/rn-delivery/

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY packages/rn-core/src packages/rn-core/src
COPY packages/rn-delivery/src packages/rn-delivery/src
COPY packages/rn-delivery/bin packages/rn-delivery/bin
COPY packages/rn-delivery/static packages/rn-delivery/static

RUN pnpm exec tsc -b packages/rn-core packages/rn-delivery

FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production \
    RN_CP_PROJECT=/data/project \
    PORT=4040

RUN corepack enable && corepack prepare pnpm@11.22.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/rn-core/package.json packages/rn-core/
COPY packages/rn-delivery/package.json packages/rn-delivery/

RUN pnpm install --frozen-lockfile --ignore-scripts --filter @client-platform/rn-delivery...

COPY --from=build /repo/packages/rn-core/dist packages/rn-core/dist
COPY --from=build /repo/packages/rn-delivery/dist packages/rn-delivery/dist
COPY --from=build /repo/packages/rn-delivery/bin packages/rn-delivery/bin
COPY --from=build /repo/packages/rn-delivery/static packages/rn-delivery/static
COPY deploy/distribution-service/entrypoint.sh /entrypoint.sh
COPY deploy/distribution-service/normalize-registry-paths.mjs /app/deploy/distribution-service/normalize-registry-paths.mjs

RUN chmod +x /entrypoint.sh

VOLUME ["/data/project"]
EXPOSE 4040

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4040)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/entrypoint.sh"]
