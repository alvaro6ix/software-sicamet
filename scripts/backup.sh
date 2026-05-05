#!/usr/bin/env bash
# SICAMET CRM — Backup diario de la base de datos (Sprint 14-F)
#
# Hace mysqldump del contenedor sicamet_db, comprime con gzip, lo deja en
# /var/backups/sicamet/ y rota (mantiene los últimos N días).
#
# Uso manual:
#   sudo /opt/sicamet-app/scripts/backup.sh
#
# Uso automático (cron del host VPS):
#   0 3 * * * /opt/sicamet-app/scripts/backup.sh >> /var/log/sicamet-backup.log 2>&1
#   (corre todos los días a las 3:00 AM hora del servidor)

set -euo pipefail

# ─── Configuración ────────────────────────────────────────────────────────────
BACKUP_DIR="${SICAMET_BACKUP_DIR:-/var/backups/sicamet}"
RETENTION_DAYS="${SICAMET_BACKUP_RETENTION_DAYS:-7}"
CONTAINER_DB="${SICAMET_DB_CONTAINER:-sicamet_db}"
DB_NAME="${SICAMET_DB_NAME:-sicamet_crm}"
DB_USER="${SICAMET_DB_USER:-root}"

# Ubicación del .env del proyecto (para leer DB_PASSWORD)
PROJECT_DIR="${SICAMET_PROJECT_DIR:-/opt/sicamet-app}"
ENV_FILE="${PROJECT_DIR}/.env"

# ─── Lectura del password ─────────────────────────────────────────────────────
if [[ -z "${DB_PASSWORD:-}" ]]; then
    if [[ -f "$ENV_FILE" ]]; then
        # shellcheck disable=SC2046
        export $(grep -E '^DB_PASSWORD=' "$ENV_FILE" | xargs -d '\n')
    fi
fi
if [[ -z "${DB_PASSWORD:-}" ]]; then
    echo "[$(date)] ERROR: DB_PASSWORD no está definido. Definir en .env o como env var." >&2
    exit 1
fi

# ─── Preparación ──────────────────────────────────────────────────────────────
mkdir -p "$BACKUP_DIR"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUTPUT="${BACKUP_DIR}/sicamet_${TIMESTAMP}.sql.gz"

echo "[$(date)] === Iniciando backup → ${OUTPUT}"

# ─── Verificar que el contenedor está corriendo ───────────────────────────────
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_DB}$"; then
    echo "[$(date)] ERROR: el contenedor '${CONTAINER_DB}' no está corriendo." >&2
    exit 2
fi

# ─── Dump + gzip en streaming (sin archivo temporal) ─────────────────────────
# --single-transaction: dump consistente sin lockear tablas (InnoDB)
# --routines --triggers --events: incluye procedures, triggers y eventos
# --set-gtid-purged=OFF: evita warnings sobre GTIDs
docker exec "$CONTAINER_DB" mysqldump \
    --single-transaction \
    --routines --triggers --events \
    --set-gtid-purged=OFF \
    --default-character-set=utf8mb4 \
    -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
    | gzip -9 > "$OUTPUT"

SIZE="$(du -h "$OUTPUT" | cut -f1)"
echo "[$(date)] ✅ Backup completado: ${OUTPUT} (${SIZE})"

# ─── Rotación ─────────────────────────────────────────────────────────────────
# Borra backups con más de RETENTION_DAYS días de antigüedad.
DELETED=$(find "$BACKUP_DIR" -name 'sicamet_*.sql.gz' -mtime +"$RETENTION_DAYS" -print -delete | wc -l)
if [[ "$DELETED" -gt 0 ]]; then
    echo "[$(date)] 🗑  Rotación: borrados ${DELETED} backup(s) con más de ${RETENTION_DAYS} días."
fi

# ─── Resumen ─────────────────────────────────────────────────────────────────
TOTAL=$(find "$BACKUP_DIR" -name 'sicamet_*.sql.gz' | wc -l)
USAGE=$(du -sh "$BACKUP_DIR" | cut -f1)
echo "[$(date)] 📊 Backups en disco: ${TOTAL} archivo(s), uso total: ${USAGE}"
