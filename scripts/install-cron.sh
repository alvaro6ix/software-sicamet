#!/usr/bin/env bash
# SICAMET CRM — Instalador del cron de backups (Sprint 14-F)
#
# Configura cron del HOST del VPS para que ejecute backup.sh cada noche a las 3 AM.
# Idempotente: corre múltiples veces sin duplicar entradas.
#
# Uso (en el VPS, una sola vez):
#   sudo /opt/sicamet-app/scripts/install-cron.sh

set -euo pipefail

PROJECT_DIR="${SICAMET_PROJECT_DIR:-/opt/sicamet-app}"
BACKUP_SCRIPT="${PROJECT_DIR}/scripts/backup.sh"
LOG_FILE="/var/log/sicamet-backup.log"

# Verificación
if [[ ! -x "$BACKUP_SCRIPT" ]]; then
    echo "ERROR: $BACKUP_SCRIPT no existe o no es ejecutable." >&2
    echo "Ejecuta: chmod +x ${PROJECT_DIR}/scripts/*.sh" >&2
    exit 1
fi

# Crear el archivo de log con permisos correctos
touch "$LOG_FILE"
chmod 644 "$LOG_FILE"

# Línea del cron — el comentario MARK_SICAMET_BACKUP nos sirve para detectar
# si ya está instalado (idempotencia).
CRON_LINE="0 3 * * * ${BACKUP_SCRIPT} >> ${LOG_FILE} 2>&1 # MARK_SICAMET_BACKUP"

# crontab actual del usuario root
CURRENT="$(crontab -l 2>/dev/null || true)"

if echo "$CURRENT" | grep -q 'MARK_SICAMET_BACKUP'; then
    echo "✅ Cron ya está instalado. Editando para asegurar versión actual..."
    NEW=$(echo "$CURRENT" | grep -v 'MARK_SICAMET_BACKUP')
    NEW="${NEW}"$'\n'"${CRON_LINE}"
else
    echo "📅 Instalando cron de backup diario a las 3:00 AM..."
    NEW="${CURRENT}"$'\n'"${CRON_LINE}"
fi

echo "$NEW" | crontab -
echo "✅ Cron instalado correctamente."
echo ""
echo "Comandos útiles:"
echo "  Ver cron actual:        sudo crontab -l"
echo "  Ver log de backups:     tail -f $LOG_FILE"
echo "  Probar backup manual:   sudo $BACKUP_SCRIPT"
echo "  Listar backups:         ls -lh /var/backups/sicamet/"
echo "  Restaurar:              sudo ${PROJECT_DIR}/scripts/restore.sh /var/backups/sicamet/<archivo.sql.gz>"
