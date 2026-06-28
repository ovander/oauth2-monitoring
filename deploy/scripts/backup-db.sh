#!/usr/bin/env bash
# backup-db.sh — dump the Socrate Postgres database to /var/backups/socrate.
# Run on the VPS (as a user that can reach Postgres, e.g. postgres or via the
# DATABASE_URL credentials). Idempotent; keeps the last $KEEP dumps.
#
#   sudo -u postgres bash backup-db.sh
#   # or with explicit settings:
#   DB=socrate KEEP=14 bash backup-db.sh
#
# Schedule daily via cron or a systemd timer, e.g. /etc/cron.d/socrate-backup:
#   30 3 * * *  postgres  /usr/local/bin/socrate-backup-db.sh >> /var/log/socrate-backup.log 2>&1
set -euo pipefail

DB="${DB:-socrate}"
OUT_DIR="${OUT_DIR:-/var/backups/socrate}"
KEEP="${KEEP:-14}"          # how many dumps to retain
ts="$(date +%Y%m%d-%H%M%S)"
out="$OUT_DIR/${DB}-${ts}.sql.gz"

mkdir -p "$OUT_DIR"

echo "▶ dumping '$DB' → $out"
# -Fc would be smaller/parallel-restorable; plain SQL + gzip is the simplest
# portable format and restores with `gunzip -c … | psql`.
pg_dump "$DB" | gzip -c > "$out"
chmod 0600 "$out"

echo "▶ pruning: keeping the newest $KEEP dump(s)"
ls -1t "$OUT_DIR"/${DB}-*.sql.gz 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
  echo "  · removing $old"
  rm -f "$old"
done

echo "✔ backup complete: $out"
echo "  restore with:  gunzip -c $out | psql $DB"
