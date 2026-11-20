# RGS Ledger — MongoDB Atlas M0 Backup & Disaster Recovery Guide

## 1. Zero-Cost Infrastructure Context & Limitations

RGS Ledger targets a zero-monthly-cost public beta using:
- **API Runtime**: Render Free Tier (Node.js 22 modular monolith)
- **Frontends**: Cloudflare Pages (Merchant Dashboard, Public Website, Admin, Developer Portal, Hosted Checkout)
- **Scheduler**: Cloudflare Workers cron trigger
- **Database**: MongoDB Atlas M0 Free Tier (Shared Cluster)

### MongoDB Atlas M0 Free-Tier Backup Limitations:
1. **No Automated Managed Snapshots**: Atlas Continuous Cloud Backups and point-in-time restore (PITR) are exclusive to dedicated tiers (M10+). M0 does NOT include automated backup snapshots.
2. **Storage Cap**: 512 MB maximum storage quota.
3. **Connection Limits**: 100 maximum concurrent connections.
4. **Maintenance Windows**: Upgrades and maintenance are scheduled automatically by Atlas without custom maintenance windows.

> **Operational Standard**: For M0 public beta, logical backups are created via scheduled `mongodump` execution. Backups produce single-file compressed archives (`.gz`) stored securely in private object storage or local encrypted archives.

---

## 2. Critical Collections Manifest

The following collections constitute the source of truth and must be included in all backups:

| Collection Name | Purpose | Retention / Recovery Importance |
| :--- | :--- | :--- |
| `merchants` | Merchant profiles, business names, default VPAs, status | Critical (Tenants) |
| `users` | Merchant admins, operators, system admins, password hashes | Critical (Authentication) |
| `merchant_bank_accounts` | Configured bank accounts, account suffixes, UPI VPAs | Critical (Settlement targets) |
| `merchant_integrations` | Encrypted Gmail OAuth tokens, sync state | High (Integrations) |
| `payment_requests` | Payment orders, amount in paise, statuses, QR metadata | Critical (Financial intent) |
| `payment_evidence` | Ingested bank emails & companion notifications | Critical (Financial evidence) |
| `evidence_templates` | Approved bank SMS/email regex patterns & history | High (Matching engine) |
| `payment_evidence_associations` | 1-to-1 evidence-to-payment bindings with UTRs | Critical (Audit & dual-source) |
| `android_devices` | Paired companion device tokens, fingerprints, status | High (Evidence channels) |
| `api_credentials` | Merchant API keys, secret hashes, environment scopes | High (Developer integrations) |
| `webhook_endpoints` | Registered merchant webhook URLs and secrets | High (Event delivery) |
| `webhook_events` | Outbox webhook events and dispatch history | Medium (Delivery audit) |
| `reconciliation_cases` | Disputes, late evidence, and mismatch cases | Critical (Exceptions) |
| `audit_logs` | Immutable security audit entries | Critical (Compliance & security) |
| `platform_configs` | System configuration thresholds and admin lock | Critical (Operations) |

---

## 3. Creating a Backup

### Using the Automated Script
Run the provided backup script:
```bash
# Linux / macOS
./infrastructure/scripts/backup-m0.sh

# Windows PowerShell
./infrastructure/scripts/backup-m0.ps1
```

### Manual Command Line (mongodump)
```bash
mongodump \
  --uri="mongodb+srv://<username>:<password>@cluster0.example.mongodb.net/rgs_ledger?retryWrites=true&w=majority" \
  --gzip \
  --archive="./backups/rgs_ledger_backup_$(date +%Y%m%d_%H%M%S).gz"
```

---

## 4. Restoring into a Test / Disaster Recovery Database

To test restore procedures or recover after database loss:

### 1. Restore into an Isolated Staging or Local Test Database:
```bash
# Restore to local MongoDB test instance
mongorestore \
  --uri="mongodb://localhost:27017/rgs_ledger_restore_test" \
  --gzip \
  --archive="./backups/rgs_ledger_backup_20261119_120000.gz" \
  --nsDrop
```

> **IMPORTANT**: The `--nsDrop` flag drops existing collections in the target database before restoring them from the archive. Never run `--nsDrop` against production without deliberate intent.

---

## 5. Post-Restore Data Validation Checklist

After restoring into the test database, verify database integrity:

1. **Collection Count Validation**:
   ```javascript
   db.getCollectionNames();
   // Confirm all 15 critical collections exist
   ```

2. **Index Rebuilding & Uniqueness**:
   ```javascript
   db.merchants.getIndexes();
   db.payment_requests.getIndexes();
   db.payment_evidence.getIndexes();
   db.payment_evidence_associations.getIndexes();
   // Verify unique indexes on (merchantId, orderId), (merchantId, deduplicationHash), etc.
   ```

3. **Record Count Reconciliation**:
   ```javascript
   const merchants = db.merchants.countDocuments();
   const payments = db.payment_requests.countDocuments();
   const evidence = db.payment_evidence.countDocuments();
   const assocs = db.payment_evidence_associations.countDocuments();
   print(`Merchants: ${merchants}, Payments: ${payments}, Evidence: ${evidence}, Assocs: ${assocs}`);
   ```

4. **Dual-Source SUCCESS Invariant Check**:
   Every payment with status `SUCCESS` must have exactly 2 associated evidence records (1 EMAIL, 1 ANDROID):
   ```javascript
   db.payment_requests.find({ status: "SUCCESS" }).forEach(p => {
     const count = db.payment_evidence_associations.countDocuments({ paymentRequestId: p._id });
     if (count !== 2) {
       print(`INVARIANT VIOLATION: Payment ${p._id} has status SUCCESS but ${count} associations!`);
     }
   });
   ```

---

## 6. Accidental Deletion Recovery Runbook

If an accidental drop or corruption occurs:
1. **Halt Incoming Writes**: Put the API server in maintenance mode or temporarily suspend public access on Cloudflare / Render.
2. **Identify Latest Known Clean Backup**: Locate the most recent archive from `./backups`.
3. **Execute Restore**:
   ```bash
   mongorestore --uri="$MONGODB_URI" --gzip --archive="./backups/clean_backup.gz" --nsDrop
   ```
4. **Run Verification**: Execute the Section 5 validation queries.
5. **Re-sync Email / Companion Evidence**:
   - Merchants can trigger `/v1/integrations/gmail/sync` with `lookbackDays: 3` to re-ingest any recent credit emails received during the downtime.
   - Paired Android companion devices automatically flush their local offline SQLite queue upon re-establishing connection with the API.
6. **Resume API Services**: Remove maintenance mode.
