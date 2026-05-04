// notificaciones.js
// Sprint 2 / S2-B — sistema unificado para emitir y consumir notificaciones internas.
//
// Diseño:
//  - Una notificación se guarda en `notificaciones_globales` con `audiencia` que define
//    quién la verá: 'todos' | 'rol:<rol>' | 'permiso:<clave>' | 'usuario:<id>'.
//  - Cada usuario marca como leída individualmente en `notificaciones_leidas`.
//  - Para emitir, llama a `emitirNotificacion({...})` desde cualquier endpoint backend.
//  - El frontend consulta `/api/notificaciones` y recibe SOLO las que le aplican según
//    su rol/permisos/usuario_id, ya filtradas en SQL.
//
// Catálogo de tipos canónicos (estables, son las claves que los frontend pueden usar
// para iconografía o agrupación):
//   cotizacion_nueva     · cotización del bot recibida
//   esperando_asesor     · cliente espera atención humana
//   os_modificada        · admin/recepción editó una OS
//   sla_extension        · admin/recepción amplió SLA
//   os_versionada        · admin/recepción creó nueva versión de OS
//   equipo_rechazado     · aseguramiento rechazó un equipo
//   sistema              · uso general (banner, mensaje admin, etc.)

const db = require('./bd');
const { permisosPorDefectoParaRol } = require('./permisos_catalogo');

const TIPOS_VALIDOS = new Set([
    'cotizacion_nueva', 'esperando_asesor', 'os_modificada', 'sla_extension',
    'os_versionada', 'equipo_rechazado', 'sistema'
]);

const URGENCIAS_VALIDAS = new Set(['baja', 'media', 'alta', 'critica']);

/**
 * Crea una notificación. Llamar desde cualquier endpoint backend, no esperar a su
 * resolución (es best-effort, no debe bloquear la respuesta principal).
 *
 * @param {Object}        opts
 * @param {string}        opts.titulo      Línea principal (max 255 chars).
 * @param {string}        [opts.detalle]   Texto secundario.
 * @param {string}        opts.tipo        Uno de TIPOS_VALIDOS.
 * @param {string}        [opts.audiencia] 'todos' | 'rol:X' | 'permiso:X' | 'usuario:N'
 * @param {string}        [opts.urgencia]  'baja' | 'media' | 'alta' | 'critica'
 * @param {string}        [opts.ruta]      Ruta interna a la que dirige el click.
 * @param {Object}        [opts.metadata]  JSON serializable adicional.
 * @param {number}        [opts.creadorId] id del usuario que originó.
 * @returns {Promise<number|null>} id de la notificación creada o null si falla.
 */
async function emitirNotificacion(opts) {
    try {
        const tipo = TIPOS_VALIDOS.has(opts.tipo) ? opts.tipo : 'sistema';
        const urgencia = URGENCIAS_VALIDAS.has(opts.urgencia) ? opts.urgencia : 'media';
        const audiencia = (opts.audiencia || 'todos').slice(0, 120);
        const titulo = String(opts.titulo || '').slice(0, 255);
        const detalle = opts.detalle != null ? String(opts.detalle) : null;
        const ruta = opts.ruta != null ? String(opts.ruta).slice(0, 255) : null;
        const metadata = opts.metadata ? JSON.stringify(opts.metadata) : null;
        const creadorId = Number.isFinite(Number(opts.creadorId)) ? Number(opts.creadorId) : null;

        const [r] = await db.query(
            `INSERT INTO notificaciones_globales (titulo, detalle, tipo, ruta, urgencia, creador_id, metadata, audiencia)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [titulo, detalle, tipo, ruta, urgencia, creadorId, metadata, audiencia]
        );

        // Emisión por socket para que frontend abierto reciba en vivo.
        if (global.io) {
            global.io.emit('notificacion_nueva', {
                id: r.insertId, tipo, urgencia, titulo, audiencia, ruta, ts: new Date().toISOString()
            });
        }
        return r.insertId;
    } catch (e) {
        // No bloqueamos el flow principal por una notificación fallida.
        console.warn('emitirNotificacion: ', e.message);
        return null;
    }
}

/**
 * Verifica si un usuario está en la audiencia de una notificación.
 * Se usa para validar visibilidad en /api/notificaciones.
 */
function usuarioEnAudiencia(audiencia, usuario) {
    if (!audiencia || audiencia === 'todos') return true;
    if (usuario.rol === 'admin') return true;
    const [tipo, valor] = audiencia.split(':');
    if (tipo === 'rol') return usuario.rol === valor;
    if (tipo === 'usuario') return Number(valor) === Number(usuario.id);
    if (tipo === 'permiso') {
        // Si el usuario tiene custom permisos, los respetamos; si no, fallback al rol.
        const lista = Array.isArray(usuario.permisos) ? usuario.permisos
                    : permisosPorDefectoParaRol(usuario.rol);
        return lista.includes(valor);
    }
    return false;
}

/**
 * Construye una cláusula SQL que filtra notificaciones a nivel de DB en base a la
 * audiencia del usuario. Más eficiente que traer todo y filtrar en JS.
 *
 * Devuelve { whereClause, params } para concatenar a una query de notificaciones.
 */
function clausulaSqlPorAudiencia(usuario, permisosUsuario) {
    if (usuario.rol === 'admin') {
        return { whereClause: '1=1', params: [] };
    }
    // El usuario ve la notificación si:
    // - audiencia = 'todos'
    // - audiencia = 'rol:<su rol>'
    // - audiencia = 'usuario:<su id>'
    // - audiencia = 'permiso:<algún permiso que tiene>'
    const conds = [
        "audiencia = 'todos'",
        "audiencia = ?",
        "audiencia = ?"
    ];
    const params = [`rol:${usuario.rol}`, `usuario:${usuario.id}`];

    if (Array.isArray(permisosUsuario) && permisosUsuario.length > 0) {
        const placeholders = permisosUsuario.map(() => '?').join(',');
        conds.push(`audiencia IN (${placeholders})`);
        permisosUsuario.forEach(p => params.push(`permiso:${p}`));
    }

    return { whereClause: '(' + conds.join(' OR ') + ')', params };
}

module.exports = { emitirNotificacion, usuarioEnAudiencia, clausulaSqlPorAudiencia, TIPOS_VALIDOS };
