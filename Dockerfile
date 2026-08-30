FROM node:24.20.0-bookworm-slim AS base

WORKDIR /app

ENV CI=true

RUN npm install -g pnpm@11.19.0

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM deps AS build

COPY . .
RUN pnpm build

FROM base AS runtime

ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

COPY --from=build /app/dist ./dist
COPY --from=build /app/migrations ./migrations

EXPOSE 3000
CMD ["node", "dist/src/main.js"]
