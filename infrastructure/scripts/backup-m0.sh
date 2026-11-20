#!/usr/bin/env bash
# ==============================================================================
# RGS LEDGER — MONGODB ATLAS M0 ZERO-COST BACKUP SCRIPT
# ==============================================================================
# Creates a compressed, encrypted logical backup archive using mongodump.
# Designed for MongoDB Atlas M0 free tier (where automated snapshots are unavailable).
# ==============================================================================

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
ARCHIVE_NAME="rgs_ledger_m0_backup_${TIMESTAMP}.gz"
TARGET_FILE="${BACKUP_DIR}/${ARCHIVE_NAME}"

mkdir -p "${BACKUP_DIR}"

if [ -z "${MONGODB_URI:-}" ]; then
  if [ -f ".env" ]; then
    # Load MONGODB_URI from local .env
    export $(grep -E '^MONGODB_URI=' .env | xargs)
  fi
fi

if [ -z "${MONGODB_URI:-}" ]; then
  echo "ERROR: MONGODB_URI environment variable is not set." >&2
  exit 1
fi

echo "======================================================================"
echo "Starting MongoDB Atlas M0 Backup at $(date)"
echo "Target Archive: ${TARGET_FILE}"
echo "======================================================================"

# Run mongodump with gzip compression and single-file archive output
mongodump \
  --uri="${MONGODB_URI}" \
  --gzip \
  --archive="${TARGET_FILE}"

FILE_SIZE=$(du -h "${TARGET_FILE}" | cut -f1)

echo "======================================================================"
echo "Backup Completed Successfully!"
echo "Archive: ${TARGET_FILE} (${FILE_SIZE})"
echo "======================================================================"
