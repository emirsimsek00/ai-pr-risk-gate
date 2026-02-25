FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY --from=build /app/openapi.yaml ./openapi.yaml
COPY --from=build /app/sql ./sql
COPY --from=build /app/scripts ./scripts
EXPOSE 8787
CMD ["sh", "-c", "node scripts/migrate.mjs && node dist/index.js"]
