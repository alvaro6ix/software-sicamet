#!/usr/bin/env bash
# SICAMET CRM — Restauración de la BD desde un backup (Sprint 14-F)
#
# DESTRUCTIVO: borra todas las tablas actuales y carga las del archivo .sql.gz
#
# Uso:
#   sudo /opt/sicamet-app/scripts/restore.sh /var/backups/sicamet/sicamet_20260505_030001.sql.gz
#
# Requiere doble confirmación. Pedirá escribir literalmente "RESTAURAR".

set -euo pipefail

# ─── Configuración ────────────────────────────────────────────────────────────
CONTAINER_DB="${SICAMET_DB_CONTAINER:-sicamet_db}"
DB_NAME="${SICAMET_DB_NAME:-sicamet_crm}"
DB_USER="${SICAMET_DB_USER:-root}"

PROJECT_DIR="${SICAMET_PROJECT_DIR:-/opt/sicamet-app}"
ENV_FILE="${PROJECT_DIR}/.env"

# ─── Validación de argumentos ─────────────────────────────────────────────────
if [[ $# -ne 1 ]]; then
    echo "Uso: $0 <archivo_backup.sql.gz>"
    echo ""
    echo "Backups disponibles en /var/backups/sicamet/:"
    ls -lh /var/backups/sicamet/sicamet_*.sql.gz 2>/dev/null || echo "  (ninguno)"
    exit 1
fi

BACKUP_FILE="$1"
if [[ ! -f "$BACKUP_FILE" ]]; then
    echo "ERROR: el archivo no existe: $BACKUP_FILE" >&2
    exit 2
fi

# ─── Lectura del password ─────────────────────────────────────────────────────
if [[ -z "${DB_PASSWORD:-}" && -f "$ENV_FILE" ]]; then
    # shellcheck disable=SC2046
    export $(grep -E '^DB_PASSWORD=' "$ENV_FILE" | xargs -d '\n')
fi
if [[ -z "${DB_PASSWORD:-}" ]]; then
    echo "ERROR: DB_PASSWORD no está definido." >&2
    exit 3
fi

# ─── Confirmación doble (evita accidentes) ────────────────────────────────────
echo ""
echo "⚠️  ATENCIÓN: vas a RESTAURAR la base de datos."
echo ""
echo "    Archivo:        $BACKUP_FILE"
echo "    Tamaño:         $(du -h "$BACKUP_FILE" | cut -f1)"
echo "    Base de datos:  $DB_NAME (en contenedor $CONTAINER_DB)"
echo ""
echo "    Esto BORRARÁ todos los datos actuales y los reemplazará por los del backup."
echo ""
read -r -p 'Para confirmar, escribe literalmente "RESTAURAR": ' CONFIRMACION
if [[ "$CONFIRMACION" != "RESTAURAR" ]]; then
    echo "Cancelado. No se hizo ningún cambio."
    exit 0
fi

# ─── Backup de seguridad antes de restaurar ───────────────────────────────────
echo ""
echo "[$(date)] Haciendo backup de seguridad del estado actual antes de restaurar..."
SAFETY_DIR="/var/backups/sicamet/pre-restore"
mkdir -p "$SAFETY_DIR"
SAFETY_FILE="${SAFETY_DIR}/pre_restore_$(date +%Y%m%d_%H%M%S).sql.gz"
docker exec "$CONTAINER_DB" mysqldump \
    --single-transaction --routines --triggers --events --set-gtid-purged=OFF \
    --default-character-set=utf8mb4 \
    -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
    | gzip -9 > "$SAFETY_FILE"
echo "[$(date)] ✅ Estado actual respaldado en: $SAFETY_FILE"

# ─── Restauración ─────────────────────────────────────────────────────────────
echo "[$(date)] === Iniciando restauración..."
gunzip -c "$BACKUP_FILE" | docker exec -i "$CONTAINER_DB" mysql \
    --default-character-set=utf8mb4 \
    -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME"

echo "[$(date)] ✅ Restauración completada."
echo ""
echo "Si todo se ve bien, todo OK. Si algo salió mal, puedes revertir con:"
echo "    sudo $0 $SAFETY_FILE"
