FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json tsconfig.base.json tsconfig.json ./
COPY packages/ ./packages/
COPY apps/dashboard/ ./apps/dashboard/

RUN npm install
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=apps/dashboard

FROM nginx:alpine AS runner
COPY --from=builder /app/apps/dashboard/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
