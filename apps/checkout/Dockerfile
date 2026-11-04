FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json tsconfig.base.json tsconfig.json ./
COPY packages/ ./packages/
COPY apps/checkout/ ./apps/checkout/

RUN npm install
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=packages/payment-core
RUN npm run build --workspace=apps/checkout

FROM nginx:alpine AS runner
COPY --from=builder /app/apps/checkout/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
