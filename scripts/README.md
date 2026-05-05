# SICAMET CRM — Scripts de mantenimiento

Scripts para correr **en el HOST del VPS** (Ubuntu Server). Todos asumen que
el proyecto está en `/opt/sicamet-app/` y que docker-compose ya está corriendo.

## Backup automático de la base de datos

### Setup (una sola vez)

```bash
# En el VPS, después de clonar el repo y arrancar docker compose:
sudo chmod +x /opt/sicamet-app/scripts/*.sh
sudo /opt/sicamet-app/scripts/install-cron.sh
```

Eso instala un cron que corre `backup.sh` todos los días a las **3:00 AM** del
servidor. Los backups quedan en `/var/backups/sicamet/` comprimidos con gzip.

### Backup manual

```bash
sudo /opt/sicamet-app/scripts/backup.sh
```

### Restauración

```bash
# Listar backups disponibles
ls -lh /var/backups/sicamet/

# Restaurar uno específico (pide confirmación: escribir literalmente "RESTAURAR")
sudo /opt/sicamet-app/scripts/restore.sh /var/backups/sicamet/sicamet_20260505_030001.sql.gz
```

`restore.sh` hace un **backup de seguridad del estado actual** antes de restaurar
(en `/var/backups/sicamet/pre-restore/`). Si la restauración salió mal, puedes
revertir con ese archivo.

### Configuración

Variables de entorno (opcionales, todas tienen defaults):

| Variable | Default | Descripción |
|---|---|---|
| `SICAMET_BACKUP_DIR` | `/var/backups/sicamet` | Carpeta de backups |
| `SICAMET_BACKUP_RETENTION_DAYS` | `7` | Días que se conservan los backups (los más viejos se borran) |
| `SICAMET_PROJECT_DIR` | `/opt/sicamet-app` | Donde está clonado el proyecto (para leer `.env`) |
| `SICAMET_DB_CONTAINER` | `sicamet_db` | Nombre del contenedor de MySQL |

### Logs

```bash
# Seguir el log en vivo
tail -f /var/log/sicamet-backup.log

# Ver últimas 50 líneas
tail -n 50 /var/log/sicamet-backup.log

# Ver cron instalado
sudo crontab -l
```

### Copiar backups fuera del VPS (recomendado)

Para protegerte de pérdida total del VPS, copia los backups periódicamente a
otra máquina o servicio cloud. Ejemplo con `rsync`:

```bash
# Desde tu PC local, cada noche (cron en tu PC):
rsync -avz user@vps-ip:/var/backups/sicamet/ ~/sicamet-backups-mirror/
```

O con `rclone` a Google Drive / Dropbox / S3 / Backblaze B2.

## Tamaño esperado de backups

Para una BD de SICAMET con 1000 OS y 10K mensajes WhatsApp, el dump comprimido
suele rondar los **5-15 MB**. Con 7 días de retención: ~100 MB en disco.
El VPS de 100GB tiene espacio de sobra.
