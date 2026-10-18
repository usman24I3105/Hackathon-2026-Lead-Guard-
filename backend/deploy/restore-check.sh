#!/usr/bin/env bash
# BE-17 / SEC-8: Backup Restore Verification Drill
# Restores the latest encrypted backup into a scratch database and compares row counts.
# Usage: ./restore-check.sh

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/leadguard}"
SCRATCH_DB="leadguard_scratch_$(date +%s)"
PASSPHRASE="${BACKUP_PASSPHRASE:-${APP_SECRET:-leadguard_secure_backup_passphrase_32}}"

LATEST_BACKUP=$(ls -t "${BACKUP_DIR}"/leadguard_*.sql.gz.enc 2>/dev/null | head -n 1 || true)

if [ -z "$LATEST_BACKUP" ]; then
  echo "⚠️ No backup found in ${BACKUP_DIR}. Creating a fresh backup first..."
  "$(dirname "$0")/backup.sh"
  LATEST_BACKUP=$(ls -t "${BACKUP_DIR}"/leadguard_*.sql.gz.enc | head -n 1)
fi

echo "🧪 Running restore check using: ${LATEST_BACKUP}"

echo "1. Creating scratch database ${SCRATCH_DB}..."
createdb -U lg_migrator "${SCRATCH_DB}"

cleanup() {
  echo "🧹 Dropping scratch database ${SCRATCH_DB}..."
  dropdb -U lg_migrator --if-exists "${SCRATCH_DB}"
}
trap cleanup EXIT

echo "2. Decrypting, decompressing, and restoring backup into scratch DB..."
openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -pass "pass:${PASSPHRASE}" -in "${LATEST_BACKUP}" \
  | gunzip \
  | psql -U lg_migrator -d "${SCRATCH_DB}" -q

echo "3. Comparing row counts between live DB and scratch DB..."
TABLES=("workspace" "user" "lead" "contact" "opportunity" "payment" "audit_log")

mismatch=0
for tbl in "${TABLES[@]}"; do
  COUNT_LIVE=$(psql -U lg_migrator -d leadguard -t -A -c "SELECT COUNT(*) FROM \"${tbl}\";")
  COUNT_SCRATCH=$(psql -U lg_migrator -d "${SCRATCH_DB}" -t -A -c "SELECT COUNT(*) FROM \"${tbl}\";")

  if [ "$COUNT_LIVE" = "$COUNT_SCRATCH" ]; then
    echo "  ✅ ${tbl}: ${COUNT_LIVE} rows match"
  else
    echo "  ❌ ${tbl} MISMATCH: live has ${COUNT_LIVE}, restored has ${COUNT_SCRATCH}"
    mismatch=1
  fi
done

if [ "$mismatch" -eq 0 ]; then
  echo "🎉 SUCCESS: Restore-check passed! Scratch database matches live data exactly."
  exit 0
else
  echo "❌ FAILURE: Row count discrepancies detected during restore check."
  exit 1
fi
