# Deployment Architecture & Production Setup

## 1. Zero-Budget V1 Beta Hosting Topography

The initial public beta targets a robust, zero-cost / low-cost deployment topology:

```
[Internet Traffic]
       |
       +------------------------------------+------------------------------------+
       | (Frontends)                        | (API Ingress)                      | (Scheduled Crons)
       v                                    v                                    v
+-----------------------------+   +-----------------------------+   +-----------------------------+
|      Cloudflare Pages       |   |       Render Web Service    |   |     Cloudflare Worker       |
|                             |   |                             |   |                             |
| - public-website            |   | - apps/api (Node.js 22)     |   | - infrastructure/scheduler  |
| - merchant-dashboard        |   | - Stateless Express app     |   | - Runs every minute (* * * *)
| - hosted-checkout           |   | - Automatic HTTPS           |   | - Dispatches to API         |
| - admin-dashboard           |   +-----------------------------+   +-----------------------------+
| - developer-portal          |                 |
+-----------------------------+                 v
                                  +-----------------------------+
                                  |     MongoDB Atlas (M0)      |
                                  |                             |
                                  | - 512 MB Free Tier Cluster  |
                                  | - Multi-Document Tx Ready   |
                                  +-----------------------------+
```

---

## 2. Cloudflare Pages Deployment (Frontends)

Each frontend is deployed independently as a static single-page application (SPA):

| Workspace | Root Directory | Build Command | Output Directory |
|---|---|---|---|
| `public-website` | `apps/public-website` | `npm run build` | `dist` |
| `merchant-dashboard` | `apps/merchant-dashboard` | `npm run build` | `dist` |
| `hosted-checkout` | `apps/hosted-checkout` | `npm run build` | `dist` |
| `admin-dashboard` | `apps/admin-dashboard` | `npm run build` | `dist` |
| `developer-portal` | `apps/developer-portal` | `npm run build` | `dist` |

---

## 3. Render Deployment (API)

The API is deployed on Render using the provided `infrastructure/deployment/render.yaml` or a native Node service:
- **Build Command**: `npm install && npm run build --workspace=@rgs-ledger/api`
- **Start Command**: `node apps/api/dist/server.js`
- **Health Check Path**: `/health`

---

## 4. Cloudflare Worker Scheduler

- Located in `infrastructure/scheduler/`.
- Deployed using `wrangler deploy`.
- Uses Cloudflare's free Cron Triggers (`* * * * *`) to ping `POST /api/v1/background-jobs/dispatch` with `x-scheduler-secret` header.
- Triggers durable lease acquisition, expiring overdue payment requests, and retrying pending webhooks.
