# Deployment & Infrastructure Guide

## Docker Compose Architecture

The platform provides a complete `docker-compose.yml` for unified local, staging, and production deployment:

```bash
# Start all containers in background
docker compose up -d --build

# View container logs
docker compose logs -f api
```

### Services & Port Mappings
| Service | Container Name | Port | Description |
|---|---|---|---|
| `mongodb` | `rgs-ledger-mongodb` | 27017 | MongoDB 7.0 database engine with persistent volume |
| `redis` | `rgs-ledger-redis` | 6379 | Redis 7.2 Alpine for BullMQ job queue |
| `api` | `rgs-ledger-api` | 4000 | Express REST API platform |
| `dashboard` | `rgs-ledger-dashboard` | 5173 | Nginx hosting React Merchant Dashboard |
| `checkout` | `rgs-ledger-checkout` | 5174 | Nginx hosting React Hosted Checkout |
| `developer-portal` | `rgs-ledger-developer-portal` | 5175 | Nginx hosting React Developer Portal |
| `admin` | `rgs-ledger-admin` | 5176 | Nginx hosting React Super Admin Panel |

## Database Backups & Persistence
- MongoDB data is stored in the `mongo-data` named Docker volume.
- Backup command:
  ```bash
  docker exec rgs-ledger-mongodb mongodump --out /data/db/backup_$(date +%Y%m%d)
  ```

## Production Domain & TLS Setup
In production, place a reverse proxy (e.g. AWS ALB, Cloudflare, or Traefik) in front of the services:
- `api.yourdomain.com` -> Port 4000
- `dashboard.yourdomain.com` -> Port 5173
- `checkout.yourdomain.com` -> Port 5174
- `docs.yourdomain.com` -> Port 5175
- `admin.yourdomain.com` -> Port 5176
