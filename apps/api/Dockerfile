FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json tsconfig.base.json tsconfig.json ./
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

RUN npm install
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=packages/payment-core
RUN npm run build --workspace=apps/api

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/packages/payment-core/dist ./packages/payment-core/dist
COPY --from=builder /app/packages/payment-core/package.json ./packages/payment-core/package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json

EXPOSE 4000

CMD ["node", "apps/api/dist/server.js"]
