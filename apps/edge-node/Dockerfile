FROM node:22-slim
WORKDIR /app
RUN corepack enable
COPY pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/edge-node ./apps/edge-node
RUN pnpm install --frozen-lockfile=false
EXPOSE 8080
CMD ["pnpm", "--filter", "@nanovpn/edge-node", "start"]
