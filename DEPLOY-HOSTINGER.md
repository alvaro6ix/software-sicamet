# SICAMET CRM — Guía de despliegue en Hostinger VPS

Esta guía asume **Hostinger VPS KVM 2** (2 vCPU, 8 GB RAM, 100 GB NVMe) con
plantilla **Aplicación → Docker** (Ubuntu 24.04 LTS + Docker preinstalado).

Si elegiste plantilla **Sistema Operativo Simple → Ubuntu 24.04 LTS** (sin Docker
preinstalado), salta al [Apéndice A](#apéndice-a-instalar-docker-manualmente).

---

## 1 · Acceso al VPS

Hostinger te dará en el panel:
- IP del VPS (ej. `89.117.xxx.xxx`)
- Usuario: `root`
- Password (o llave SSH si la generaste)

```bash
# Desde tu PC (PowerShell, WSL, Git Bash, o Mac/Linux Terminal)
ssh root@89.117.xxx.xxx
```

Aceptas el fingerprint, pones el password.

## 2 · Actualizar el sistema (5 min)

```bash
apt update && apt upgrade -y
apt install -y git ufw fail2ban
```

- `git` para clonar el repo
- `ufw` firewall simple
- `fail2ban` bloqueo automático de IPs con muchos intentos fallidos SSH

## 3 · Configurar firewall (2 min)

Solo abrir SSH (22), HTTP (80) y HTTPS (443). Cerrar todo lo demás.

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp   # HTTP/3 (QUIC) que usa Caddy
ufw --force enable
ufw status
```

> ⚠️ **NO abras 3306 (MySQL) ni 3001 (backend)** — el `docker-compose.prod.yml`
> los mantiene en la red interna de Docker. Caddy es el único punto de entrada.

## 4 · Habilitar fail2ban (1 min)

```bash
systemctl enable --now fail2ban
fail2ban-client status sshd   # verificar que está activo
```

## 5 · Clonar el proyecto (1 min)

```bash
mkdir -p /opt
cd /opt
git clone https://github.com/alvaro6ix/CRM_BOT_SICAMET.git sicamet-app
cd sicamet-app
```

## 6 · Configurar variables de entorno (5 min)

```bash
cp .env.production.example .env
nano .env
```

Rellena con valores REALES:

```ini
DB_PASSWORD=<genera-uno-fuerte>           # openssl rand -base64 32
JWT_SECRET=<genera-uno-fuerte-diferente>  # node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
GEMINI_API_KEY=tu-key-de-gemini           # opcional, dejar vacío si no tienes
DOMAIN=:80                                 # mientras no tengas dominio
APP_URL=http://89.117.xxx.xxx              # IP del VPS
AUTO_HTTPS=off                             # off mientras no tengas dominio
ADMIN_EMAIL=tu-email@gmail.com
CORS_ORIGINS=http://89.117.xxx.xxx
```

**Cuando tengas dominio:** edita `.env`:
```ini
DOMAIN=crm.sicamet.mx
APP_URL=https://crm.sicamet.mx
AUTO_HTTPS=on
CORS_ORIGINS=https://crm.sicamet.mx
```
Y reinicia con `docker compose -f docker-compose.prod.yml restart caddy`. Caddy
obtendrá el certificado SSL de Let's Encrypt en ~30 segundos automáticamente.

Ctrl+O para guardar, Ctrl+X para salir.

## 7 · Levantar el stack (10–15 min — primera vez es lo que tarda el build)

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Esperá a que termine. Verifica:

```bash
docker ps
# Debes ver 4 contenedores con (healthy):
#   sicamet_caddy      (healthy)   0.0.0.0:80,443->80,443/tcp
#   sicamet_frontend   (healthy)
#   sicamet_backend    (healthy)
#   sicamet_db         (healthy)
```

Si alguno está `(unhealthy)` o reiniciando, ver logs:

```bash
docker logs sicamet_backend --tail 50
docker logs sicamet_db --tail 50
docker logs sicamet_caddy --tail 50
```

## 8 · Verificar que responde

```bash
# Health check del backend (a través de Caddy)
curl http://localhost/api/health
# → {"status":"ok","uptime":...}

# Frontend
curl -I http://localhost/
# → HTTP/2 200 ... (Caddy responde con HTTP/2 si tienes SSL, HTTP/1.1 si no)
```

Desde tu PC, abre el navegador en `http://IP_DEL_VPS` — debería cargar el login del CRM.

## 9 · Primer login y crear usuarios

Por default existe el admin de las migraciones. Su password se generó al
arranque y aparece en los logs UNA SOLA VEZ:

```bash
docker logs sicamet_backend 2>&1 | grep -A1 "PASSWORDS TEMPORALES"
```

Loguéate como `admin@sicamet.mx` con el password que veas. **Cámbialo
inmediatamente** desde la UI (Gestión de Usuarios → editar admin).

## 10 · Configurar backups automáticos (2 min)

```bash
chmod +x /opt/sicamet-app/scripts/*.sh
/opt/sicamet-app/scripts/install-cron.sh
```

Eso instala un cron diario a las 3 AM. Los backups quedan en
`/var/backups/sicamet/` y se conservan 7 días.

Verificar:
```bash
crontab -l                                  # ver cron instalado
/opt/sicamet-app/scripts/backup.sh          # backup manual de prueba
ls -lh /var/backups/sicamet/                # confirmar archivo creado
```

## 11 · Vincular WhatsApp (5 min)

Desde el navegador, login admin → **Vincular WhatsApp**. Mostrará un QR.
Escanéalo desde la app de WhatsApp del número que será el bot.

> Esta es la **única vez** que tienes que escanear QR (gracias al volumen
> nombrado `wweb_auth`). Reinicios y rebuilds futuros mantienen la sesión.
> Solo si WhatsApp del lado del servidor invalida la sesión vas a tener
> que re-vincular (puede pasar después de muchos meses inactivos).

## 12 · Cuando tengas dominio (después)

1. En tu DNS provider, crea un record A:
   ```
   crm.sicamet.mx  A  89.117.xxx.xxx
   ```
2. Espera unos minutos a que propague (puedes verificar con `dig crm.sicamet.mx`)
3. En el VPS, edita `.env` (cambia `DOMAIN`, `APP_URL`, `AUTO_HTTPS`, `CORS_ORIGINS` como se indicó arriba)
4. Reinicia Caddy:
   ```bash
   cd /opt/sicamet-app
   docker compose -f docker-compose.prod.yml restart caddy
   ```
5. Caddy obtiene cert Let's Encrypt automáticamente. En ~30s ya tienes HTTPS válido.

---

## Operaciones día a día

### Actualizar el código

```bash
cd /opt/sicamet-app
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

### Ver logs en vivo

```bash
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f caddy
```

### Reiniciar un servicio

```bash
docker compose -f docker-compose.prod.yml restart backend
```

### Backup manual

```bash
/opt/sicamet-app/scripts/backup.sh
```

### Restaurar de un backup

```bash
ls -lh /var/backups/sicamet/
/opt/sicamet-app/scripts/restore.sh /var/backups/sicamet/sicamet_YYYYMMDD_HHMMSS.sql.gz
# Pide escribir literalmente "RESTAURAR"
```

### Reset operativo (vaciar OS de prueba sin perder usuarios/catálogos)

UI → Gestión de Usuarios → tab **Reset** → escribe `BORRAR TODO`.

### Detener todo

```bash
docker compose -f docker-compose.prod.yml down
# (NO uses `down -v` — borra los volúmenes de DB, sesión WhatsApp y backups)
```

---

## Apéndice A · Instalar Docker manualmente

Si elegiste **Sistema Operativo Simple → Ubuntu 24.04** (sin Docker preinstalado):

```bash
# Script oficial de Docker (Ubuntu/Debian)
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Plugin de docker compose v2
apt install -y docker-compose-plugin

# Verificar
docker --version
docker compose version
systemctl enable --now docker
```

Después continúa desde el paso 3 (firewall) de esta guía.

---

## Apéndice B · Recomendaciones de seguridad adicionales

### B.1 — Deshabilitar login SSH por password (usar solo llave)

```bash
# En tu PC local:
ssh-keygen -t ed25519 -C "tu-email@gmail.com"
ssh-copy-id root@89.117.xxx.xxx

# En el VPS:
nano /etc/ssh/sshd_config
# Cambiar/asegurar:
#   PasswordAuthentication no
#   PermitRootLogin prohibit-password
systemctl restart sshd
```

### B.2 — Usuario no-root para administrar

```bash
# En el VPS, como root:
adduser sicamet
usermod -aG sudo,docker sicamet
# Copiar tus llaves SSH al nuevo usuario
mkdir -p /home/sicamet/.ssh
cp /root/.ssh/authorized_keys /home/sicamet/.ssh/
chown -R sicamet:sicamet /home/sicamet/.ssh
chmod 700 /home/sicamet/.ssh
chmod 600 /home/sicamet/.ssh/authorized_keys

# Mover el proyecto
chown -R sicamet:docker /opt/sicamet-app

# Salir y entrar como sicamet
exit
ssh sicamet@89.117.xxx.xxx
```

### B.3 — Snapshots periódicos de Hostinger

Hostinger tiene snapshots del VPS en su panel. Activa snapshots automáticos
**semanales** como respaldo extra (independiente de los `backup.sh` de la BD).

### B.4 — Actualizaciones de seguridad automáticas

```bash
apt install -y unattended-upgrades
dpkg-reconfigure --priority=low unattended-upgrades
# Responde "Yes"
```

---

## Apéndice C · Troubleshooting común

| Síntoma | Causa probable | Fix |
|---|---|---|
| `docker compose up` falla con "permission denied" | Tu usuario no está en grupo docker | `usermod -aG docker $USER` y volver a loguearte |
| Caddy no consigue cert SSL | DNS no apunta al VPS aún o puerto 80 cerrado | `dig tu-dominio.com` debe devolver la IP del VPS. Verifica `ufw status` |
| Backend `unhealthy` | MySQL aún no termina de inicializar | Espera 60-90s después del primer `up -d`. Si persiste: `docker logs sicamet_backend` |
| Bot no muestra QR | Aún arrancando Chromium | Tomar 30-60s la primera vez. Refresh la página `/whatsapp-qr` |
| `503` al cargar el frontend | Backend caído o no healthy | `docker ps` para ver estado, `docker logs sicamet_backend` |
| Disk full | Logs y backups crecen | `docker system prune -a` (borra imágenes viejas), revisa `/var/backups/sicamet/` |
