# Reset completo del proyecto SICAMET en Docker.
# Detiene los contenedores, elimina mysql_data y reinicia desde cero
# para que init_fijo.sql se vuelva a aplicar.

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

Write-Host "==> Deteniendo contenedores..." -ForegroundColor Cyan
docker-compose down

Write-Host "==> Eliminando carpeta mysql_data..." -ForegroundColor Cyan
if (Test-Path ".\mysql_data") {
    Remove-Item -Recurse -Force -Confirm:$false ".\mysql_data"
    Write-Host "    mysql_data eliminada." -ForegroundColor Green
} else {
    Write-Host "    (no existia)" -ForegroundColor DarkGray
}

Write-Host "==> Eliminando sesion de WhatsApp (.wwebjs_auth)..." -ForegroundColor Cyan
if (Test-Path ".\backend\.wwebjs_auth") {
    Remove-Item -Recurse -Force -Confirm:$false ".\backend\.wwebjs_auth"
    Write-Host "    .wwebjs_auth eliminada (deberas escanear el QR de nuevo)." -ForegroundColor Green
} else {
    Write-Host "    (no existia)" -ForegroundColor DarkGray
}

Write-Host "==> Levantando contenedores con build..." -ForegroundColor Cyan
docker-compose up -d --build

Write-Host ""
Write-Host "==> Listo. Esperando ~15s a que MySQL termine de cargar el dump..." -ForegroundColor Cyan
Start-Sleep -Seconds 15

Write-Host ""
Write-Host "==> Estado de los contenedores:" -ForegroundColor Cyan
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

Write-Host ""
Write-Host "Frontend: http://localhost:5173" -ForegroundColor Yellow
Write-Host "Backend : http://localhost:3001" -ForegroundColor Yellow
Write-Host "DB      : localhost:3306 (root / sicamet)" -ForegroundColor Yellow
