FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json tsconfig.base.json tsconfig.json ./
COPY packages/ ./packages/
COPY apps/developer-portal/ ./apps/developer-portal/

RUN npm install
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=apps/developer-portal

FROM nginx:alpine AS runner
COPY --from=builder /app/apps/developer-portal/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
