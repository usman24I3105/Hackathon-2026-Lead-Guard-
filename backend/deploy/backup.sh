#!/usr/bin/env bash
# BE-17 / SEC-8: Automated Encrypted PostgreSQL Backup Script
# Usage: ./backup.sh

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/leadguard}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/leadguard_${TIMESTAMP}.sql.gz.enc"
PASSPHRASE="${BACKUP_PASSPHRASE:-${APP_SECRET:-leadguard_secure_backup_passphrase_32}}"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

echo "📦 Creating encrypted database backup at ${BACKUP_FILE}..."

# pg_dump -> gzip -> openssl enc (AES-256-CBC)
pg_dump -U lg_migrator -d leadguard --no-owner --clean --if-exists \
  | gzip -9 \
  | openssl enc -aes-256-cbc -salt -pbkdf2 -iter 100000 -pass "pass:${PASSPHRASE}" -out "${BACKUP_FILE}"

chmod 600 "${BACKUP_FILE}"

# Retention: purge backups older than 7 days
find "${BACKUP_DIR}" -type f -name "leadguard_*.sql.gz.enc" -mtime +7 -delete

echo "✅ Backup successfully created and encrypted: ${BACKUP_FILE}"
