# Local Development Setup Guide

## Prerequisites
- Node.js v18+ or v20+ (tested with v22.13.0)
- npm v10+
- MongoDB and Redis (or run via Docker Compose)

## 1. Quickstart Commands

```bash
# Clone and enter directory
cd RGS_PAY

# Copy environment template
cp .env.example .env

# Install dependencies across all monorepo packages and apps
npm install

# Build all shared packages and applications
npm run build

# Run unit and integration tests
npm test

# Seed initial admin, demo merchant, API keys, and transactions
npm run seed
```

## 2. Launching Services for Development

Open separate terminal tabs or use concurrently:

```bash
# 1. Start REST API (Port 4000)
npm run dev:api

# 2. Start Merchant Dashboard (Port 5173)
npm run dev:dashboard

# 3. Start Hosted Checkout (Port 5174)
npm run dev:checkout

# 4. Start Developer Portal (Port 5175)
npm run dev:docs

# 5. Start Super Admin Console (Port 5176)
npm run dev:admin
```

## 3. Seed Credentials

- **Super Admin Console**:
  - URL: `http://localhost:5176`
  - Email: `admin@rgsledger.com`
  - Password: `Admin@RGS1234!`
- **Demo Merchant Dashboard**:
  - URL: `http://localhost:5173`
  - Email: `merchant@acmestore.in`
  - Password: `Merchant@RGS1234!`
