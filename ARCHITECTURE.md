# SICAMET — Arquitectura

Documento vivo. Lo actualizamos cuando una decisión cambie.

## Visión

Sistema CRM operativo para SICAMET con frontend React (SPA), backend Node/Express, MySQL como
fuente de verdad y un bot de WhatsApp integrado. La meta a mediano plazo es migrar el backend
a Laravel manteniendo el contrato de la API REST. **Todo cambio que se haga ahora debe respetar
este contrato** — la UI no debe importar qué motor sirve los endpoints.

## Stack actual

| Capa     | Tecnología              | Notas |
|----------|-------------------------|-------|
| Frontend | React 19 + Vite + Tailwind 4 | SPA. No SSR. lucide-react v1.6 (a actualizar en sprint futuro) |
| Backend  | Node 20 + Express 5 + mysql2 + socket.io | Monolito modularizándose por dominios |
| DB       | MySQL 8.0 (utf8mb4)      | Schema vive en `database/init_fijo.sql` + migraciones idempotentes en runtime |
| Bot WA   | whatsapp-web.js + Puppeteer | Sesión persistida vía LocalAuth |
| PDF/IA   | pdfplumber (Python)      | Invocado vía exec desde Node |
| Infra    | Docker Compose           | 3 servicios: db, backend, frontend |

## Reglas duras (no negociables)

1. **Lógica de negocio NUNCA en frontend.** El cliente solo presenta. Si necesitas calcular SLA,
   permisos, o cualquier validación, vive en el backend y se expone via endpoint.
2. **Permisos atómicos vía middleware.** Todo endpoint que muta estado o expone datos sensibles
   pasa por `requirePermiso('modulo.accion')`. Sin excepciones.
3. **Migraciones idempotentes.** Cada cambio de schema se materializa en un archivo
   `backend/migracion_*.js` y se registra en el ciclo de migraciones de `index.js`. Re-ejecutar
   no debe romper nada.
4. **Secretos solo en `.env`.** Nada de fallbacks hardcoded en código. El backend falla rápido
   si falta una env var crítica (`JWT_SECRET`, `DB_PASS`).
5. **Versionado de OS = manual.** El usuario elige el número de versión cuando crea una. El
   sistema nunca incrementa silenciosamente.
6. **utf8mb4 end-to-end.** Server, BD, dump, conexión: todo utf8mb4. Los dumps con
   `--default-character-set=utf8` están prohibidos (rompen emojis 4-byte).

## Estructura de carpetas

```
sicamet-app/
├─ backend/
│  ├─ index.js                    ← entrypoint (en proceso de adelgazar)
│  ├─ auth.js                     ← JWT + bcrypt
│  ├─ bd.js                       ← pool MySQL
│  ├─ permisos_catalogo.js        ← permisos atómicos del sistema
│  ├─ migracion_*.js              ← migraciones idempotentes
│  ├─ middleware/
│  │  └─ permisos.js              ← requirePermiso, tienePermiso
│  ├─ routes/                     ← (futuro) routers por dominio
│  └─ bot_*.js                    ← bot WhatsApp
├─ frontend/
│  └─ src/
│     ├─ App.jsx                  ← layout + router
│     ├─ hooks/
│     │  └─ usePermisos.jsx       ← contexto de permisos del usuario
│     └─ components/              ← una vista por archivo
├─ database/
│  └─ init_fijo.sql               ← seed inicial (utf8mb4)
├─ docker-compose.yml
├─ .env                           ← NUNCA commitear (en .gitignore)
└─ .env.example                   ← template público
```

## Flujo de permisos

1. **Catálogo** vive en `backend/permisos_catalogo.js`. Cada permiso es `<modulo>.<accion>`.
2. **Defaults por rol** en el mismo archivo. Se aplican solo si el usuario tiene
   `permisos = NULL` en BD.
3. **Asignación granular** vía `PUT /api/usuarios/:id/permisos` (solo admin). Esto guarda
   un array JSON en `usuarios.permisos` que sobreescribe los defaults.
4. **Verificación backend**: `requirePermiso('clave')` se aplica como middleware. Admin tiene
   acceso implícito.
5. **Hidratación frontend**: el hook `usePermisos()` consume `/api/permisos/yo` al login y
   provee `tiene(clave)` a cualquier componente. El sidebar usa esto para filtrar items.

## Modularización del backend (en progreso)

`backend/index.js` tiene ~3700 líneas. La meta es bajarlo a ~200 (solo bootstrap + montaje de
routers). El plan, una sesión a la vez:

| Etapa | Mover a | Archivos resultantes |
|-------|---------|----------------------|
| ✅ E0 | `middleware/permisos.js` | `requirePermiso`, `tienePermiso` |
| ✅ E0 | `permisos_catalogo.js`   | catálogo + defaults por rol |
| ⏳ E1 | `routes/auth.js`         | login, /auth/me, gestión de password |
| ⏳ E2 | `routes/usuarios.js`     | CRUD de usuarios, asignación de permisos |
| ⏳ E3 | `routes/instrumentos.js` | CRUD, estatus, certificado, comentarios |
| ⏳ E4 | `routes/cotizaciones.js` | endpoints de cotizaciones |
| ⏳ E5 | `routes/dashboard.js`    | KPIs, stats, heatmap |
| ⏳ E6 | `routes/bot.js`          | flujos, FAQ, conversaciones |
| ⏳ E7 | `services/`              | lógica de negocio reutilizable |

Cada etapa: extraer al archivo, mantener compatibilidad de rutas, probar manualmente, commit.

## Migración futura a Laravel

Cuando llegue el momento (no es ahora), el camino será:
- Recrear cada router como Controller en Laravel manteniendo URLs y payloads idénticos.
- Migraciones JS → archivos en `database/migrations/` de Laravel.
- Permisos: el catálogo se traduce 1:1 a Spatie Permission o equivalente.
- Frontend: ningún cambio. Solo apuntar `VITE_BACKEND_URL` al nuevo backend.

Por eso **es clave** que ahora respetemos el contrato REST. Cada endpoint que se cree pensado
para ser portable.

## Convenciones

- **Nombres de endpoints**: `/api/<recurso>` para colecciones, `/api/<recurso>/:id` para items,
  `/api/<recurso>/:id/<sub>` para acciones específicas. No `/api/getEquipo`.
- **Errores**: `res.status(40X).json({ error: 'mensaje legible' })`. Nada de tirar 500 con texto crudo.
- **Auth header**: `Authorization: Bearer <jwt>` sin excepciones.
- **Logging**: `console.log` con prefijo emoji para que el usuario lo encuentre rápido en docker logs.

## Referencias rápidas

- Cambiar password temporal de un usuario nuevo: ver `migracion_areas_lideres.js`.
- Agregar un permiso nuevo: editar `permisos_catalogo.js`, asignarlo a `requirePermiso(...)` en
  los endpoints relevantes, y actualizar defaults por rol si aplica. La UI lo recoge sola.
- Reset completo de la BD local: `reset.bat` o `reset.ps1` en la raíz.
