// aprendizaje_bot.js
// Sprint 5 / S5-B — Registro best-effort de mensajes que el bot no supo responder.
// Admin revisa los repetidos y los convierte en FAQ desde el panel de Feedback.

const db = require('./bd');

function normalizar(texto) {
    if (!texto) return '';
    return String(texto)
        .normalize('NFD').replace(/[̀-ͯ]/g, '')   // sin acentos
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200);
}

/**
 * Registra un mensaje no entendido. Idempotente por (mensaje_normalizado, contexto):
 * incrementa count si ya existe, inserta si no.
 *
 * @param {string} texto    Mensaje original tal como lo envió el usuario.
 * @param {string} contexto Etiqueta del estado del bot ("menu_principal", "cotiza_paso5", etc).
 *                          Para que admin pueda saber dónde se confunde más.
 */
async function registrarMensajeNoEntendido(texto, contexto = null) {
    try {
        const original = String(texto || '').slice(0, 500);
        const norm = normalizar(original);
        // Filtros de ruido: muy corto, solo dígitos, comandos del menú
        if (!norm || norm.length < 3) return;
        if (/^\d{1,3}$/.test(norm.trim())) return;
        if (['si', 'no', 'ok', 'okay', 'gracias', 'hola', 'menu', 'finalizar', 'salir'].includes(norm)) return;

        const ctx = contexto ? String(contexto).slice(0, 120) : null;

        await db.query(
            `INSERT INTO bot_aprendizaje_pendiente (mensaje_original, mensaje_normalizado, contexto, count)
             VALUES (?, ?, ?, 1)
             ON DUPLICATE KEY UPDATE count = count + 1, ultimo_visto = NOW(),
                                     mensaje_original = IF(LENGTH(mensaje_original) >= LENGTH(VALUES(mensaje_original)), mensaje_original, VALUES(mensaje_original))`,
            [original, norm, ctx]
        );
    } catch (e) {
        console.warn('aprendizaje_bot.registrarMensajeNoEntendido:', e.message);
    }
}

module.exports = { registrarMensajeNoEntendido, normalizar };
