// permisos_catalogo.js
// Catálogo único de permisos atómicos del sistema. Cada permiso protege un
// recurso o acción específica y se asigna por usuario via UI de admin.
//
// Reglas:
//  - El admin tiene acceso implícito a TODOS los permisos sin necesidad de
//    asignación explícita (ver middleware/permisos.js).
//  - El resto de roles arrancan con un set por defecto definido en
//    PERMISOS_DEFAULT_POR_ROL. Admin puede sobrescribirlos por usuario via
//    PUT /api/usuarios/:id/permisos.
//  - Las claves siguen el patrón <modulo>.<accion>. Las claves nuevas se
//    agregan aquí y aparecen automáticamente en la UI.

const PERMISOS = [
    // Dashboards
    { clave: 'dashboard.ver',                  grupo: 'Dashboards',     descripcion: 'Ver Dashboard general' },
    { clave: 'dashboard.aseguramiento.ver',    grupo: 'Dashboards',     descripcion: 'Ver Dashboard de Aseguramiento' },
    { clave: 'dashboard.metrologia.ver',       grupo: 'Dashboards',     descripcion: 'Ver Dashboard de Metrología' },

    // Operación — Recepción / Registro
    { clave: 'registro.ver',                   grupo: 'Recepción',      descripcion: 'Ver módulo de Registro Ágil' },
    { clave: 'registro.crear',                 grupo: 'Recepción',      descripcion: 'Crear nuevas órdenes de servicio' },

    // Lista General de Equipos
    { clave: 'equipos.ver',                    grupo: 'Equipos',        descripcion: 'Ver Lista General de Equipos' },
    { clave: 'equipos.editar',                 grupo: 'Equipos',        descripcion: 'Editar datos de equipos / OS' },
    { clave: 'equipos.eliminar',               grupo: 'Equipos',        descripcion: 'Eliminar equipos / OS' },

    // Kanban
    { clave: 'kanban.ver',                     grupo: 'Kanban',         descripcion: 'Ver Tablero Kanban' },
    { clave: 'kanban.mover',                   grupo: 'Kanban',         descripcion: 'Cambiar de fase un equipo en el kanban' },

    // Metrología
    { clave: 'metrologia.bandeja.ver',         grupo: 'Metrología',     descripcion: 'Ver Mi Bandeja (metrólogos)' },
    { clave: 'metrologia.centro.ver',          grupo: 'Metrología',     descripcion: 'Ver Centro de Metrología' },
    { clave: 'metrologia.asignar',             grupo: 'Metrología',     descripcion: 'Asignar metrólogos a equipos' },
    { clave: 'metrologia.bandeja_jefe',        grupo: 'Metrología',     descripcion: 'Acceder a la Bandeja del Jefe de Metrología' },
    { clave: 'metrologia.correcciones.ver',    grupo: 'Metrología',     descripcion: 'Ver módulo de Correcciones' },

    // Aseguramiento (validación)
    { clave: 'aseguramiento.ver',              grupo: 'Aseguramiento',  descripcion: 'Ver módulo de Validación / Aseguramiento' },
    { clave: 'aseguramiento.aprobar',          grupo: 'Aseguramiento',  descripcion: 'Aprobar equipos en aseguramiento' },
    { clave: 'aseguramiento.rechazar',         grupo: 'Aseguramiento',  descripcion: 'Rechazar equipos en aseguramiento' },

    // Certificación
    { clave: 'certificacion.ver',              grupo: 'Certificación',  descripcion: 'Ver módulo de Certificación' },
    { clave: 'certificacion.subir',            grupo: 'Certificación',  descripcion: 'Subir / asociar certificados PDF' },
    { clave: 'sin_certificado.ver',            grupo: 'Certificación',  descripcion: 'Ver listado Sin Certificado' },

    // Facturación
    { clave: 'facturacion.ver',                grupo: 'Facturación',    descripcion: 'Ver módulo de Facturación' },
    { clave: 'facturacion.confirmar_pago',     grupo: 'Facturación',    descripcion: 'Confirmar pago de factura por el cliente' },

    // Entregas
    { clave: 'entregas.ver',                   grupo: 'Entregas',       descripcion: 'Ver módulo de Entregas' },
    { clave: 'entregas.confirmar',             grupo: 'Entregas',       descripcion: 'Confirmar entregas al cliente' },

    // Catálogos
    { clave: 'clientes.ver',                   grupo: 'Catálogos',      descripcion: 'Ver Clientes' },
    { clave: 'clientes.editar',                grupo: 'Catálogos',      descripcion: 'Crear/editar/eliminar clientes' },
    { clave: 'catalogos.ver',                  grupo: 'Catálogos',      descripcion: 'Ver Catálogos (instrumentos, marcas, modelos)' },
    { clave: 'catalogos.editar',               grupo: 'Catálogos',      descripcion: 'Crear/editar catálogos' },

    // Bot WhatsApp
    { clave: 'bot.flujos.ver',                 grupo: 'Bot',            descripcion: 'Ver y editar Flujos del Bot' },
    { clave: 'bot.conversaciones.ver',         grupo: 'Bot',            descripcion: 'Ver Conversaciones del Bot' },
    { clave: 'bot.qr.ver',                     grupo: 'Bot',            descripcion: 'Ver QR de vinculación de WhatsApp' },
    { clave: 'bot.feedback.ver',               grupo: 'Bot',            descripcion: 'Ver Feedback del Bot' },
    { clave: 'leads.ver',                      grupo: 'Bot',            descripcion: 'Ver Posibles Clientes / Leads' },

    // Búsqueda
    { clave: 'busqueda.ver',                   grupo: 'Búsqueda',       descripcion: 'Usar búsqueda global' },

    // Administración
    { clave: 'usuarios.ver',                   grupo: 'Administración', descripcion: 'Ver Gestión de Usuarios' },
    { clave: 'usuarios.editar',                grupo: 'Administración', descripcion: 'Crear/editar usuarios y permisos' },
    { clave: 'auditoria.ver',                  grupo: 'Administración', descripcion: 'Ver auditoría de cambios' }
];

// Defaults por rol — solo se aplican si la columna `permisos` está NULL en BD.
// Una vez que admin asigna permisos a un usuario, esos defaults dejan de aplicar.
const PERMISOS_DEFAULT_POR_ROL = {
    admin: PERMISOS.map(p => p.clave), // todos
    recepcionista: [
        'dashboard.ver',
        'registro.ver', 'registro.crear',
        'equipos.ver', 'equipos.editar',
        'kanban.ver', 'kanban.mover',
        'entregas.ver', 'entregas.confirmar',
        'clientes.ver', 'clientes.editar',
        'catalogos.ver', 'catalogos.editar',
        'bot.flujos.ver', 'bot.conversaciones.ver', 'bot.qr.ver', 'bot.feedback.ver', 'leads.ver',
        'busqueda.ver',
        'sin_certificado.ver'
    ],
    aseguramiento: [
        'dashboard.aseguramiento.ver',
        'aseguramiento.ver', 'aseguramiento.aprobar', 'aseguramiento.rechazar',
        'kanban.ver',                  // SOLO LECTURA, sin .mover
        'metrologia.correcciones.ver', // ver historial de rechazos/correcciones
        'busqueda.ver'
        // NO equipos.ver — su lista está dentro de Validación/Aseguramiento
        // NO certificacion.subir — Aseguramiento no emite certificados
    ],
    validacion: [
        // Certificación (Julieta)
        'dashboard.aseguramiento.ver',
        'certificacion.ver', 'certificacion.subir',
        'sin_certificado.ver',
        'kanban.ver',
        'busqueda.ver'
    ],
    facturacion: [
        // Ivón
        'facturacion.ver', 'facturacion.confirmar_pago',
        'kanban.ver',
        'busqueda.ver'
    ],
    entrega: [
        // Flor
        'entregas.ver', 'entregas.confirmar',
        'kanban.ver',
        'busqueda.ver'
    ],
    metrologo: [
        'dashboard.metrologia.ver',
        'metrologia.bandeja.ver', 'metrologia.centro.ver',
        'metrologia.correcciones.ver',
        'kanban.ver',
        'busqueda.ver'
    ],
    operador: [
        'dashboard.metrologia.ver',
        'metrologia.bandeja.ver', 'metrologia.centro.ver',
        'metrologia.correcciones.ver',
        'kanban.ver',
        'busqueda.ver'
    ]
};

function permisosPorDefectoParaRol(rol) {
    return PERMISOS_DEFAULT_POR_ROL[rol] || [];
}

function permisosValidos(lista) {
    if (!Array.isArray(lista)) return [];
    const validos = new Set(PERMISOS.map(p => p.clave));
    return lista.filter(c => validos.has(c));
}

module.exports = { PERMISOS, PERMISOS_DEFAULT_POR_ROL, permisosPorDefectoParaRol, permisosValidos };
