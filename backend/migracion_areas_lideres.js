// migracion_areas_lideres.js
// Sprint 1 / S1-A — establece las áreas operativas, sus líderes y renombra
// el estatus 'Listo' a 'Facturación' en el kanban.
//
// Idempotente: solo inserta usuarios si no existen, solo actualiza áreas si están vacías.
// El password temporal se genera ALEATORIAMENTE por usuario en cada ejecución y se
// imprime en logs UNA SOLA VEZ. El admin debe entregarlo de inmediato y forzar a
// que cada usuario lo cambie en su primer login.

const db = require('./bd');
const { hashPassword, generarPasswordRobusto } = require('./auth');
const { permisosPorDefectoParaRol } = require('./permisos_catalogo');

// Sprint 14-A — usamos el generador centralizado que cumple política
// (12+ chars, may/min/núm/símbolo, sin caracteres confusos).
function generarPasswordTemporal() {
    return generarPasswordRobusto(16);
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

// Fases del flujo operativo. NO son áreas de laboratorio; viven como `estatus_actual`
// del equipo. Antes se insertaban en laboratorio_areas por error y aparecían en la
// UI mezcladas con áreas reales (Temperatura, Presión, etc.). Sprint 10-A las purga.
const FASES_OPERATIVAS = ['Recepción', 'Laboratorio', 'Aseguramiento', 'Certificación', 'Facturación', 'Entrega'];

async function purgarFasesDeLaboratorioAreas() {
    let removidas = 0;
    let usuariosLimpios = 0;
    try {
        const placeholders = FASES_OPERATIVAS.map(() => '?').join(',');
        const [r] = await db.query(`DELETE FROM laboratorio_areas WHERE nombre IN (${placeholders})`, FASES_OPERATIVAS);
        removidas = r.affectedRows || 0;
        // Vaciamos `usuarios.area` para quien tenía una fase como área. El rol y los
        // permisos identifican su función; el área es solo para metrólogos.
        const [r2] = await db.query(`UPDATE usuarios SET area = NULL WHERE area IN (${placeholders})`, FASES_OPERATIVAS);
        usuariosLimpios = r2.affectedRows || 0;
    } catch (e) {
        console.warn('⚠️ purgarFasesDeLaboratorioAreas:', e.message);
    }
    return { removidas, usuariosLimpios };
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
                // `area` queda NULL salvo que sea un metrólogo de área real.
                const passwordTemporal = generarPasswordTemporal();
                const hashTemporal = await hashPassword(passwordTemporal);
                const permisosDefault = JSON.stringify(permisosPorDefectoParaRol(lider.rol));
                await db.query(
                    `INSERT INTO usuarios (nombre, email, password_hash, rol, es_lider_area, activo, permisos)
                     VALUES (?, ?, ?, ?, 1, 1, ?)`,
                    [lider.nombre, lider.email, hashTemporal, lider.rol, permisosDefault]
                );
                creados++;
                credencialesNuevas.push({ email: lider.email, passwordTemporal });
            } else {
                // Usuario existe: solo aseguramos el flag de líder. No tocamos `area`
                // porque ya se purga en purgarFasesDeLaboratorioAreas si era una fase.
                const u = rows[0];
                if (u.es_lider_area !== 1) {
                    await db.query('UPDATE usuarios SET es_lider_area = 1 WHERE id = ?', [u.id]);
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
        const { removidas, usuariosLimpios } = await purgarFasesDeLaboratorioAreas();
        const { creados, actualizados, credencialesNuevas } = await asegurarLideresArea();
        const renombrados = await renombrarListoAFacturacion();

        if (removidas > 0)       console.log(`🧹 Fases removidas de laboratorio_areas: ${removidas}`);
        if (usuariosLimpios > 0) console.log(`🧹 Usuarios con fase como área limpiados: ${usuariosLimpios}`);
        if (creados > 0)         console.log(`👤 Líderes nuevos creados: ${creados}`);
        if (actualizados > 0)    console.log(`👤 Líderes actualizados: ${actualizados}`);
        if (renombrados > 0)     console.log(`📦 Equipos renombrados Listo→Facturación: ${renombrados}`);

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
