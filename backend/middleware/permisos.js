// middleware/permisos.js
// Middleware unificado para proteger endpoints según permisos atómicos.
// Use case típico:
//
//   const { requirePermiso } = require('./middleware/permisos');
//   app.put('/api/instrumentos/:id', requirePermiso('equipos.editar'), handler);
//
// Reglas:
//  - Admin tiene acceso implícito a todo.
//  - Si el usuario no tiene `permisos` (NULL), se usan los defaults del rol.
//  - Si el endpoint requiere un permiso que el usuario no tiene, 403.
//  - Si no hay token, 401 (heredado de verificarToken).

const { verificarToken } = require('../auth');
const { permisosPorDefectoParaRol } = require('../permisos_catalogo');
const db = require('../bd');

// Cache simple en memoria para evitar consultar BD en cada request.
// Invalidación: cuando admin actualiza permisos de un usuario via la API.
const cache = new Map(); // user_id -> { permisos: Set, expira: timestamp }
const CACHE_TTL_MS = 60 * 1000; // 1 minuto

function invalidarCachePermisos(userId) {
    if (userId == null) cache.clear();
    else cache.delete(userId);
}

async function permisosDelUsuario(userId, rol) {
    const ahora = Date.now();
    const cacheado = cache.get(userId);
    if (cacheado && cacheado.expira > ahora) return cacheado.permisos;

    let lista = null;
    try {
        const [rows] = await db.query('SELECT permisos FROM usuarios WHERE id = ? LIMIT 1', [userId]);
        if (rows[0]?.permisos) {
            const raw = rows[0].permisos;
            lista = typeof raw === 'string' ? JSON.parse(raw) : raw;
        }
    } catch (e) {
        // Si falla el JSON, fallback a defaults para no quedar sin permisos
        console.warn('permisosDelUsuario: fallo parse permisos:', e.message);
    }

    if (!Array.isArray(lista) || lista.length === 0) {
        lista = permisosPorDefectoParaRol(rol);
    }

    const set = new Set(lista);
    cache.set(userId, { permisos: set, expira: ahora + CACHE_TTL_MS });
    return set;
}

function requirePermiso(permiso) {
    return [
        verificarToken(),
        async (req, res, next) => {
            try {
                if (req.usuario?.rol === 'admin') return next(); // admin: acceso total
                const set = await permisosDelUsuario(req.usuario.id, req.usuario.rol);
                if (set.has(permiso)) return next();
                return res.status(403).json({ error: `Permiso requerido: ${permiso}` });
            } catch (err) {
                console.error('requirePermiso error:', err.message);
                return res.status(500).json({ error: 'Error verificando permisos' });
            }
        }
    ];
}

// Útil cuando el handler quiere verificar permiso dinámicamente sin
// montarlo como middleware (por ejemplo, condicionar campos de respuesta).
async function tienePermiso(usuario, permiso) {
    if (!usuario) return false;
    if (usuario.rol === 'admin') return true;
    const set = await permisosDelUsuario(usuario.id, usuario.rol);
    return set.has(permiso);
}

// Sprint 11-E — jerarquía de visibilidad para metrología.
// Tres niveles:
//   - global: ve TODOS los equipos (admin o permiso `metrologia.ver_todos`).
//   - area:   ve los equipos de TODOS los metrólogos de su área (es_lider_area + area).
//   - propio: solo ve los equipos asignados a sí mismo.
//
// Devuelve también arrays de userIds visibles, útiles para queries con `IN (...)`.
async function obtenerScopeMetrologia(usuario) {
    const userId = usuario?.id;
    if (!userId) return { tipo: 'propio', userId: null, userIdsVisibles: [] };

    if (usuario.rol === 'admin' || await tienePermiso(usuario, 'metrologia.ver_todos')) {
        const [todos] = await db.query("SELECT id FROM usuarios WHERE rol IN ('metrologo','operador') OR es_lider_area = 1");
        return { tipo: 'global', userId, userIdsVisibles: todos.map(r => r.id) };
    }

    const [filas] = await db.query('SELECT es_lider_area, area FROM usuarios WHERE id = ? LIMIT 1', [userId]);
    const u = filas[0];
    if (u?.es_lider_area && u.area) {
        const [enArea] = await db.query("SELECT id FROM usuarios WHERE area = ? AND (rol IN ('metrologo','operador') OR es_lider_area = 1)", [u.area]);
        const ids = enArea.map(r => r.id);
        if (!ids.includes(userId)) ids.push(userId);
        return { tipo: 'area', area: u.area, userId, userIdsVisibles: ids };
    }

    return { tipo: 'propio', userId, userIdsVisibles: [userId] };
}

module.exports = { requirePermiso, tienePermiso, invalidarCachePermisos, obtenerScopeMetrologia };
