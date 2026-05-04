// migracion_areas_lideres.js
// Sprint 1 / S1-A — establece las áreas operativas, sus líderes y renombra
// el estatus 'Listo' a 'Facturación' en el kanban.
//
// Idempotente: solo inserta usuarios si no existen, solo actualiza áreas si están vacías.
// El password temporal se genera ALEATORIAMENTE por usuario en cada ejecución y se
// imprime en logs UNA SOLA VEZ. El admin debe entregarlo de inmediato y forzar a
// que cada usuario lo cambie en su primer login.

const crypto = require('crypto');
const db = require('./bd');
const { hashPassword } = require('./auth');
const { permisosPorDefectoParaRol } = require('./permisos_catalogo');

function generarPasswordTemporal() {
    // 16 chars URL-safe: suficientemente fuerte y fácil de comunicar verbalmente.
    return crypto.randomBytes(12).toString('base64url') + '!';
}

// Nombre canónico del área operativa, el rol que le corresponde,
// y el nombre/email del encargado por defecto.
const LIDERES_AREA = [
    { nombre: 'Alejandra', email: 'alejandra@sicamet.mx', rol: 'recepcionista', area: 'Recepción' },
    { nombre: 'Agustín',   email: 'agustin@sicamet.mx',   rol: 'metrologo',     area: 'Laboratorio',   esJefeMetrologia: true },
    { nombre: 'Berenice',  email: 'berenice@sicamet.mx',  rol: 'aseguramiento', area: 'Aseguramiento' },
    { nombre: 'Julieta',   email: 'julieta@sicamet.mx',   rol: 'validacion',    area: 'Certificación' },
    { nombre: 'Ivón',      email: 'ivon@sicamet.mx',      rol: 'facturacion',   area: 'Facturación' },
    { nombre: 'Flor',      email: 'flor@sicamet.mx',      rol: 'entrega',       area: 'Entrega' }
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
    let creados = 0;
    let actualizados = 0;
    let credencialesNuevas = []; // [{email, passwordTemporal}]

    for (const lider of LIDERES_AREA) {
        try {
            const [rows] = await db.query(
                'SELECT id, area, es_lider_area FROM usuarios WHERE email = ? LIMIT 1',
                [lider.email]
            );

            if (rows.length === 0) {
                // Usuario no existe: crearlo con un password temporal único e irrepetible
                // y poblar `permisos` con los defaults del rol para que la UI funcione
                // de inmediato sin que admin tenga que tocarle nada.
                const passwordTemporal = generarPasswordTemporal();
                const hashTemporal = await hashPassword(passwordTemporal);
                const permisosDefault = JSON.stringify(permisosPorDefectoParaRol(lider.rol));
                await db.query(
                    `INSERT INTO usuarios (nombre, email, password_hash, rol, area, es_lider_area, activo, permisos)
                     VALUES (?, ?, ?, ?, ?, 1, 1, ?)`,
                    [lider.nombre, lider.email, hashTemporal, lider.rol, lider.area, permisosDefault]
                );
                creados++;
                credencialesNuevas.push({ email: lider.email, passwordTemporal });
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
            console.log('🔑 USUARIOS NUEVOS CREADOS — PASSWORDS TEMPORALES');
            console.log('   (cada uno es único, NO se imprimirán de nuevo)');
            console.log('');
            for (const { email, passwordTemporal } of credencialesNuevas) {
                console.log(`     • ${email}  →  ${passwordTemporal}`);
            }
            console.log('');
            console.log('   Entrega cada password al usuario correspondiente y pídele que');
            console.log('   la cambie inmediatamente en su primer login.');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('');
        }
    } catch (e) {
        console.error('❌ Error en migracion_areas_lideres:', e.message);
    }
}

module.exports = { migrarAreasLideres };
