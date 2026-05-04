// migracion_areas_lideres.js
// Sprint 1 / S1-A — establece las áreas operativas, sus líderes y renombra
// el estatus 'Listo' a 'Facturación' en el kanban.
//
// Idempotente: solo inserta usuarios si no existen, solo actualiza áreas si están vacías.
// El password temporal de los líderes nuevos se loggea para que el admin lo entregue
// y el propio usuario lo cambie en su primer login.

const db = require('./bd');
const { hashPassword } = require('./auth');

const PASSWORD_TEMPORAL = '***REDACTED-OLD-TEMP-PWD***';

// Nombre canónico del área operativa, el rol que le corresponde,
// y el nombre/email del encargado por defecto.
const LIDERES_AREA = [
    { nombre: 'Alejandra', email: 'alejandra@sicamet.mx', rol: 'recepcionista', area: 'Recepción' },
    { nombre: 'Agustín',   email: 'agustin@sicamet.mx',   rol: 'metrologo',     area: 'Laboratorio',   esJefeMetrologia: true },
    { nombre: 'Berenice',  email: 'berenice@sicamet.mx',  rol: 'aseguramiento', area: 'Aseguramiento' },
    { nombre: 'Julieta',   email: 'julieta@sicamet.mx',   rol: 'validacion',    area: 'Certificación' },
    { nombre: 'Ivón',      email: 'ivon@sicamet.mx',      rol: 'recepcionista', area: 'Facturación' },
    { nombre: 'Flor',      email: 'flor@sicamet.mx',      rol: 'recepcionista', area: 'Entrega' }
];

const AREAS_OPERATIVAS = [
    { nombre: 'Recepción',     descripcion: 'Recepción de equipos y registro de órdenes de servicio' },
    { nombre: 'Laboratorio',   descripcion: 'Calibración y operación metrológica' },
    { nombre: 'Aseguramiento', descripcion: 'Aseguramiento de calidad y validación de calibración' },
    { nombre: 'Certificación', descripcion: 'Generación y emisión de certificados' },
    { nombre: 'Facturación',   descripcion: 'Facturación previa a entrega' },
    { nombre: 'Entrega',       descripcion: 'Entrega final al cliente' }
];

async function asegurarAreasOperativas() {
    let creadas = 0;
    for (const a of AREAS_OPERATIVAS) {
        try {
            const [rows] = await db.query('SELECT id FROM laboratorio_areas WHERE nombre = ? LIMIT 1', [a.nombre]);
            if (rows.length === 0) {
                await db.query(
                    'INSERT INTO laboratorio_areas (nombre, descripcion, activa) VALUES (?, ?, 1)',
                    [a.nombre, a.descripcion]
                );
                creadas++;
            }
        } catch (e) {
            console.warn(`⚠️ migracion_areas_lideres area[${a.nombre}]:`, e.message);
        }
    }
    return creadas;
}

async function asegurarLideresArea() {
    const hashTemporal = await hashPassword(PASSWORD_TEMPORAL);
    let creados = 0;
    let actualizados = 0;
    let credencialesNuevas = [];

    for (const lider of LIDERES_AREA) {
        try {
            const [rows] = await db.query(
                'SELECT id, area, es_lider_area FROM usuarios WHERE email = ? LIMIT 1',
                [lider.email]
            );

            if (rows.length === 0) {
                // Usuario no existe: crearlo con password temporal
                await db.query(
                    `INSERT INTO usuarios (nombre, email, password_hash, rol, area, es_lider_area, activo)
                     VALUES (?, ?, ?, ?, ?, 1, 1)`,
                    [lider.nombre, lider.email, hashTemporal, lider.rol, lider.area]
                );
                creados++;
                credencialesNuevas.push(lider.email);
            } else {
                // Usuario existe: actualizar área y es_lider_area solo si están vacíos
                const u = rows[0];
                if (!u.area || u.es_lider_area !== 1) {
                    await db.query(
                        'UPDATE usuarios SET area = COALESCE(NULLIF(area,\'\'), ?), es_lider_area = 1 WHERE id = ?',
                        [lider.area, u.id]
                    );
                    actualizados++;
                }
            }
        } catch (e) {
            console.warn(`⚠️ migracion_areas_lideres lider[${lider.email}]:`, e.message);
        }
    }

    return { creados, actualizados, credencialesNuevas };
}

async function renombrarListoAFacturacion() {
    try {
        const [r] = await db.query(
            "UPDATE instrumentos_estatus SET estatus_actual = 'Facturación' WHERE estatus_actual = 'Listo'"
        );
        return r.affectedRows || 0;
    } catch (e) {
        console.warn('⚠️ migracion_areas_lideres rename Listo:', e.message);
        return 0;
    }
}

async function migrarAreasLideres() {
    try {
        const areasNuevas = await asegurarAreasOperativas();
        const { creados, actualizados, credencialesNuevas } = await asegurarLideresArea();
        const renombrados = await renombrarListoAFacturacion();

        if (areasNuevas > 0)   console.log(`🏷️  Áreas operativas creadas: ${areasNuevas}`);
        if (creados > 0)       console.log(`👤 Líderes nuevos creados: ${creados}`);
        if (actualizados > 0)  console.log(`👤 Líderes actualizados: ${actualizados}`);
        if (renombrados > 0)   console.log(`📦 Equipos renombrados Listo→Facturación: ${renombrados}`);

        if (credencialesNuevas.length > 0) {
            console.log('');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('🔑 USUARIOS NUEVOS CREADOS — PASSWORD TEMPORAL');
            console.log(`   Password: ${PASSWORD_TEMPORAL}`);
            console.log('   Cuentas:');
            for (const email of credencialesNuevas) {
                console.log(`     • ${email}`);
            }
            console.log('   Pídele a cada usuario que cambie su contraseña en su primer login');
            console.log('   desde Gestión de Usuarios.');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('');
        }
    } catch (e) {
        console.error('❌ Error en migracion_areas_lideres:', e.message);
    }
}

module.exports = { migrarAreasLideres };
