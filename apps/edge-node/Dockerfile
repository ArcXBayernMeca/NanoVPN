FROM node:22-slim
WORKDIR /app
RUN corepack enable
COPY pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/edge-node ./apps/edge-node
RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter @nanovpn/edge-node build:bundle
EXPOSE 8080
WORKDIR /app/apps/edge-node
CMD ["node", "dist/index.js"]
