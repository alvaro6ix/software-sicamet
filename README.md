<p align="center">
  <img src="https://img.shields.io/badge/SICAMET-CRM%20%26%20BOT-C9EA63?style=for-the-badge&logo=whatsapp&logoColor=141f0b" alt="SICAMET CRM Banner" />
  <br/>
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-v24+-339933?style=flat-square&logo=nodedotjs" />
  <img alt="React" src="https://img.shields.io/badge/React-v19-61DAFB?style=flat-square&logo=react" />
  <img alt="MySQL" src="https://img.shields.io/badge/MySQL-8.0-4479A1?style=flat-square&logo=mysql&logoColor=white" />
  <img alt="Express" src="https://img.shields.io/badge/Express-v5-000000?style=flat-square&logo=express" />
  <img alt="Vite" src="https://img.shields.io/badge/Vite-v8-646CFF?style=flat-square&logo=vite" />
  <img alt="TailwindCSS" src="https://img.shields.io/badge/TailwindCSS-v4-38B2AC?style=flat-square&logo=tailwindcss" />
  <img alt="License" src="https://img.shields.io/badge/License-Privado-red?style=flat-square" />
</p>

<h1 align="center">SICAMET CRM & BOT — Sistema Integrado de Gestión y Automatización</h1>

<p align="center">
  Plataforma SaaS de gestión de laboratorio de calibración con automatización de comunicación vía WhatsApp Web, tablero Kanban de Órdenes de Servicio, pipeline de ventas, análisis de PDFs inteligente y directorio de clientes/catálogos.
</p>

---

## 🌟 Características Principales

| Módulo | Descripción |
|--------|-------------|
| 🏠 **Dashboard** | KPIs en tiempo real, gráficas de actividad mensual y mapa de calor de mensajes WhatsApp |
| 📋 **Pipeline de Ventas** | Tablero Kanban de cotizaciones (Pendiente → Aprobado → Rechazado) con drag & drop visual |
| 👥 **Directorio de Clientes** | Gestión de +2,000 clientes con importación/exportación masiva a Excel, paginado y búsqueda |
| 🔧 **Catálogo de Instrumentos** | CRUD completo con carga masiva Excel y exportación del 100% de los registros |
| 🏷️ **Catálogo de Marcas y Modelos** | Gestión de marcas y modelos homologados del laboratorio con carga y exportación |
| 💬 **Bot WhatsApp** | Bot conversacional con flujos de nodos configurables, consulta de estatus de O.S. en tiempo real |
| 📱 **Vincular WhatsApp** | Vinculación QR, reset de sesión automático, reconexión inteligente |
| 📄 **Lector de PDF** | Extracción automática de datos de cotizaciones PDF con IA (Python + pdfplumber) |
| 📊 **Análisis de Conversaciones** | Vista de chats activos, atajos de mensajes y envío de archivos multimedia |

---

## 🛠️ Stack Tecnológico

### Frontend
| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| **React** | ^19.2.4 | Framework UI principal |
| **Vite** | ^8.0.1 | Bundler y dev server ultrarrápido |
| **TailwindCSS** | ^4.2.2 | Sistema de diseño utility-first |
| **React Router DOM** | ^7.13.2 | Enrutamiento SPA |
| **Axios** | ^1.13.6 | Cliente HTTP |
| **Lucide React** | ^1.6.0 | Iconografía profesional |
| **Recharts** | ^3.8.1 | Gráficas y dashboards |
| **React Select** | ^5.10.2 | Selectores avanzados con búsqueda |
| **React Toastify** | ^11.0.5 | Notificaciones modernas elegantes |
| **XLSX** | ^0.18.5 | Importación y exportación de Excel |

### Backend
| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| **Node.js** | v20+ LTS | Runtime del servidor |
| **Express** | ^5.2.1 | Framework API REST |
| **MySQL2** | ^3.20.0 | ORM para base de datos relacional |
| **Multer** | ^2.1.1 | Gestión de carga de archivos |
| **XLSX** | ^0.18.5 | Parseo de Excel en backend |
| **pdf-parse** | ^1.1.1 | Extracción de texto en PDFs |
| **whatsapp-web.js** | ^1.34.6 | Driver para WhatsApp Web API |
| **Puppeteer** | (vía wwebjs) | Chromium headless para WhatsApp |
| **qrcode-terminal** | ^0.12.0 | Generación de QR en terminal |
| **dotenv** | ^17.3.1 | Gestión de variables de entorno |

### Infraestructura
| Herramienta | Propósito |
|-------------|-----------|
| **MySQL 8.0** | Base de datos principal |
| **Hostinger VPS KVM 1** | Servidor de producción (4 GB RAM, 50 GB NVMe) |
| **Docker** | Orquestación de contenedores (Base de Datos, Backend y Frontend) |
| **GitHub** | Control de versiones y repositorio |

---

## 🗂️ Estructura del Proyecto

```
sicamet-app/
├── backend/                     # API REST + Bot WhatsApp
│   ├── index.js                 # 🔑 Servidor principal, rutas API y bot
│   ├── bd.js                    # Configuración conexión MySQL
│   ├── pdf_parser.py            # Extractor de PDFs con pdfplumber (Python)
│   ├── .env.example             # Ejemplo de variables de entorno
│   └── package.json
├── frontend/                    # Aplicación React SPA
│   ├── src/
│   │   ├── components/
│   │   │   ├── Dashboard.jsx          # KPIs y gráficas principales
│   │   │   ├── Clientes.jsx           # Directorio de clientes paginado
│   │   │   ├── CatalogoInstrumentos.jsx  # Catálogo de instrumentos
│   │   │   ├── Marcas.jsx             # Catálogo de marcas
│   │   │   ├── Modelos.jsx            # Catálogo de modelos
│   │   │   ├── TableroKanban.jsx      # Pipeline Kanban de ventas
│   │   │   ├── Conversaciones.jsx     # Vista de chats WhatsApp
│   │   │   └── WhatsappQR.jsx         # Vinculación y reset del bot
│   │   ├── App.jsx                    # Router principal y navegación
│   │   └── index.css                  # Estilos globales (dark mode)
│   └── package.json
├── .gitignore
├── sicamet.sql                  # Esquema de base de datos MySQL
└── README.md
```

---

## 🗄️ Esquema de Base de Datos (`sicamet_crm`)

```sql
-- Tablas principales
cat_clientes        -- Directorio de empresas cliente
cat_instrumentos    -- Instrumentos acreditados
cat_marcas          -- Marcas homologadas
cat_modelos         -- Modelos de instrumentos

-- Órdenes de Servicio
instrumentos_estatus  -- Estatus de equipos en laboratorio

-- Bot WhatsApp
nodos               -- Flujos del bot (árbol de conversación)
opciones            -- Opciones de respuesta por nodo
sesiones            -- Estado de sesión por usuario WhatsApp
chat_mensajes       -- Historial de mensajes entrantes/salientes
```

---

## 🚀 Instalación y Configuración Local

### Prerrequisitos
- **Node.js** v20 LTS o superior (recomendado) — [nodejs.org](https://nodejs.org)
- **MySQL** 8.0 — [mysql.com](https://www.mysql.com)
- **Python** 3.9+ con `pdfplumber` — `pip install pdfplumber`
- **Git**

### 1. Clonar el Repositorio

```bash
git clone https://github.com/alvaro6ix/CRM_BOT_SICAMET.git
cd CRM_BOT_SICAMET
```

### 2. Configurar Base de Datos MySQL

```sql
-- Crear la base de datos
CREATE DATABASE sicamet_crm;

-- Importar el esquema completo
mysql -u root -p sicamet_crm < sicamet.sql
```

### 3. Configurar el Backend

```bash
cd backend

# Copiar el archivo de ejemplo de entorno
cp .env.example .env

# Editar el archivo .env con tus credenciales MySQL (o dejar las de Docker por defecto)
# OJO: En entorno Docker, DB_HOST debe ser 'db'.
nano .env  # o utiliza tu editor de preferencia

# Instalar dependencias
npm install
```

**Contenido del archivo `.env`:**
```ini
DB_HOST=localhost
DB_USER=root
DB_PASS=tu_contraseña
DB_NAME=sicamet_crm
PORT=3001
```

### 4. Configurar el Frontend

```bash
cd frontend
npm install
```

### 5. Levantar el Sistema

**Terminal 1 — Backend:**
```bash
cd backend
node index.js
# ✅ API en http://localhost:3001
# ✅ Conexión exitosa a MySQL
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
# ✅ Frontend en http://localhost:5173
```

### 6. Vincular WhatsApp

1. Navega a la sección **"Vincular WhatsApp"** en el CRM.
2. Escanea el código QR con tu teléfono desde WhatsApp > Dispositivos Vinculados.
3. El bot quedará activado y listo para responder mensajes.

> **⚠️ Nota:** Si el bot falla al reconectarse, utiliza el botón **"Forzar Reinicio de Motor"** en la sección Vincular WhatsApp del CRM. Esto limpiará la sesión automáticamente sin necesidad de acceder al servidor.

---

## 📦 Scripts Disponibles

### Backend (`/backend`)

| Comando | Descripción |
|---------|-------------|
| `node index.js` | Inicia el servidor API + Bot WhatsApp |
| `node bd.js` | Verifica la conexión a la base de datos |

### Frontend (`/frontend`)

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Inicia el servidor de desarrollo Vite |
| `npm run build` | Genera el build de producción en `/dist` |
| `npm run preview` | Previsualiza el build de producción |

---

## 🔌 API REST — Referencia de Endpoints

### Catálogos
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/api/catalogo/clientes` | Lista todos los clientes |
| `POST` | `/api/catalogo/clientes` | Crea un cliente manual |
| `PUT` | `/api/catalogo/clientes/:id` | Edita un cliente |
| `DELETE` | `/api/catalogo/clientes/:id` | Elimina un cliente |
| `DELETE` | `/api/catalogo/clientes/all` | Vacía todos los clientes |
| `POST` | `/api/catalogo/clientes/upload` | Importa clientes desde Excel |
| `GET` | `/api/catalogo/instrumentos` | Lista instrumentos |
| `GET` | `/api/catalogo/marcas` | Lista marcas |
| `GET` | `/api/catalogo/modelos` | Lista modelos |

### WhatsApp
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/api/whatsapp/status` | Estado de conexión del bot |
| `POST` | `/api/whatsapp/reset` | Reinicia la sesión (borra auth) |
| `POST` | `/api/whatsapp/send-media` | Envía archivo multimedia |

### Dashboard
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/api/dashboard/stats` | KPIs principales |
| `GET` | `/api/heatmap` | Mapa de calor de mensajes |

### PDF e IA
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `POST` | `/api/leer-pdf` | Extrae datos de un PDF de cotización |

---

## 🚢 Despliegue en Producción (Hostinger VPS)

### Especificaciones del Servidor
- **Plan:** Hostinger VPS KVM 1
- **CPU:** 1 vCPU
- **RAM:** 4 GB
- **Almacenamiento:** 50 GB NVMe
- **Ancho de Banda:** 4 TB/mes
- **OS recomendado:** Ubuntu 22.04 LTS

### Despliegue con Docker (Nuevo Estándar)

El sistema ahora está completamente preparado para correr bajo **Docker**.

```bash
# 1. Clonar el repositorio
git clone https://github.com/alvaro6ix/CRM_BOT_SICAMET.git
cd CRM_BOT_SICAMET

# 2. Levantar la arquitectura completa
docker compose up --build -d

# 3. Restaurar la base de datos la primera vez
# Importar archivo respaldo_sicamet.sql en el host db por el puerto 3306.
```

Los contenedores aislarán el frontend (Vite en puerto 5173), el backend (Express/Bot en puerto 3001) y la Base de datos (MySQL). El bot de WhatsApp funcionará automáticamente instalando su propio Chromium interno vía Dockerfile.

---

## 🤖 Bot WhatsApp — Flujo de Conversación

```
Cliente envía mensaje
       │
       ▼
  ¿Sesión activa? ──No──► Nodo 1: Menú Principal
       │                          │
      Sí                    1. Consultar Equipo
       │                    2. Hablar con Agente
       ▼                    3. Información General
  Nodo actual
       │
  ¿Opción = "5"? ──────────► Consulta O.S./Cotización
       │                      Responde con: Equipo, Estatus, Fecha
      No
       │
       ▼
  Siguiente nodo según opción
```

---

## 🔐 Seguridad

- ✅ Variables de entorno en `.env` (excluido de Git)
- ✅ `.gitignore` configurado para `node_modules`, `.wwebjs_auth`, archivos de sesión
- ✅ Validaciones de input en endpoints críticos
- ⚠️ **Recomendado para producción:** Agregar JWT/Auth middleware, HTTPS con Certbot + Nginx

---

## 🗺️ Roadmap

- [x] Dashboard con KPIs y gráficas
- [x] Directorio de Clientes con importación masiva Excel
- [x] Exportación masiva a Excel en todos los catálogos
- [x] Bot WhatsApp con flujo conversacional multi-nodo
- [x] Reset de sesión WhatsApp desde la UI
- [x] Pipeline Kanban de ventas
- [x] Lector inteligente de PDFs
- [x] Autenticación JWT y roles de usuario
- [x] Despliegue Docker con docker-compose
- [ ] Integración bot ↔ estado real de instrumentos (consulta automática)
- [ ] Envío masivo de notificaciones WhatsApp
- [ ] Módulo responsive completo para móviles
- [ ] Panel de administración de usuarios internos

---

## 👨‍💻 Autor

**Álvaro** — Desarrollador de SICAMET CRM & BOT

---

## 📄 Licencia

Este proyecto es software **privado y propietario** de SICAMET. Todos los derechos reservados. No se permite su distribución, copia ni modificación sin autorización expresa.
