/**
 * Motor de Intención IA — SICAMET Bot PRO v2
 * - Gemini 2.0 Flash (mejor comprensión)
 * - FAQ lookup antes de llamar a Gemini (ahorra ~70% de llamadas)
 * - Caché semántica (normalización de texto para agrupar variantes)
 * - Historial de conversación como contexto al prompt
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = require('./bd');
const crypto = require('crypto');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const CONTEXTO_SICAMET = `
Eres un asistente de ventas corporativo por WhatsApp para SICAMET (calibración de instrumentos).

OBJETIVO:
- Ayudar al cliente rápido, perfilar su necesidad y avanzar la conversación de forma amigable.
- NO forzar flujos ciegos ni inventar información.

REGLAS ESTRICTAS:
- Respuestas MUY cortas (máximo 2-3 líneas).
- NUNCA inventes precios. Explica que dependen del equipo y pide detalles.
- NO repitas opciones de menús largos textuales.
- Si no sabes la respuesta, pide aclaración.
- SIEMPRE termina tu respuesta con una pregunta corta para avanzar la venta o el soporte (Ej: "¿De qué equipo hablamos?", "¿Te interesa en tu empresa o en nuestro laboratorio?").

CAPACIDAD DE LA EMPRESA:
- Calibración In-Lab e In-situ (Sedes: Toluca, CDMX, Qro, GDL).
- Magnitudes: Presión, Temperatura, Fuerza, Masa, Dimensional, Eléctrica, Flujo, Humedad, Volumen.
- 12 acreditaciones ISO 17025 (EMA, PJLA). Partner oficial Vaisala.
- 722 270 1584 | sclientes@sicamet.net
`;

// Intenciones por keywords (sin llamada a API)
const INTENCIONES = {
    SALUDO:          { keywords: ['hola', 'buenos días', 'buenas tardes', 'buenas noches', 'good morning', 'hi', 'saludos', 'buen dia', 'que tal', 'qué tal'] },
    ESTATUS:         { keywords: ['ya está listo', 'ya termino', 'cuándo estará', 'estado de mi equipo', 'mi orden', 'mi equipo', 'avance', 'como va mi', 'cómo va mi', 'estatus', 'status', 'seguimiento'] },
    COTIZACION:      { keywords: ['cotizacion', 'cotización', 'precio', 'costo', 'cuanto cuesta', 'cuánto cuesta', 'calibrar', 'calibración', 'quiero calibrar', 'necesito calibrar', 'presupuesto'] },
    RECORDATORIO:    { keywords: ['vencimiento', 'vence', 'cuándo vence', 'fecha límite', 'mis equipos', 'renovar', 'recordatorio'] },
    ESCALAR:         { keywords: ['agente', 'persona', 'asesor', 'hablar con alguien', 'humano', 'representante', 'urgente', 'problema', 'queja', 'reclamacion', 'reclamación'] },
    NORMATIVO:       { keywords: ['iso', 'norma', 'certificacion', 'certificación', 'auditoría', 'auditoria', 'acreditación', 'reglamento', 'ema', 'pjla', 'fda', 'cofepris'] },
    SERVICIOS:       { keywords: ['servicio', 'que hacen', 'qué hacen', 'qué ofrecen', 'que ofrecen', 'al laboratorio', 'in-situ', 'in situ', 'insitu', 'qué calibran'] },
    CONTACTO:        { keywords: ['teléfono', 'telefono', 'dirección', 'direccion', 'horario', 'donde están', 'ubicación', 'ubicacion', 'correo', 'email', 'whatsapp'] },
    REGISTRO_EQUIPO: { keywords: ['registrar equipo', 'guardar equipo', 'agregar equipo', 'quiero recordatorio', 'avísame', 'avisame', 'notificame'] },
};

/**
 * Normaliza el texto para caché semántica:
 * elimina acentos, puntuación, múltiples espacios y lowercasea.
 */
function normalizarTexto(texto) {
    return texto
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quitar acentos
        .replace(/[¿?¡!.,;:()'"]/g, '')                   // quitar puntuación
        .replace(/\s+/g, ' ')                              // colapsar espacios
        .trim();
}

function hashTexto(texto) {
    return crypto.createHash('sha256').update(normalizarTexto(texto)).digest('hex');
}

/**
 * Detecta intención con keywords primero (gratis), luego Gemini 2.0 Flash.
 */
async function detectarIntencion(texto) {
    const textoLower = texto.toLowerCase();
    for (const [nombre, config] of Object.entries(INTENCIONES)) {
        if (config.keywords.some(k => textoLower.includes(k))) {
            return { accion: nombre, confianza: 'alta', metodo: 'keywords' };
        }
    }

    try {
        const prompt = `Clasifica este mensaje de cliente de laboratorio de calibración en UNA categoría:
COTIZACION | ESTATUS | RECORDATORIO | ESCALAR | NORMATIVO | SERVICIOS | CONTACTO | REGISTRO_EQUIPO | OTRO

Mensaje: "${texto}"

Responde SOLO con la categoría.`;

        const cached = await buscarEnCache(prompt);
        if (cached) return { accion: cached.trim().toUpperCase(), confianza: 'media', metodo: 'cache' };

        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        const result = await model.generateContent(prompt);
        const accion = result.response.text().trim().toUpperCase();
        await guardarEnCache(prompt, accion, 24 * 60 * 60);

        const validas = ['COTIZACION', 'ESTATUS', 'RECORDATORIO', 'ESCALAR', 'NORMATIVO', 'SERVICIOS', 'CONTACTO', 'REGISTRO_EQUIPO'];
        return { accion: validas.includes(accion) ? accion : 'OTRO', confianza: 'media', metodo: 'gemini' };
    } catch (err) {
        console.error('Error detectarIntencion:', err.message);
        return { accion: 'OTRO', confianza: 'baja', metodo: 'fallback' };
    }
}

/**
 * Genera respuesta IA:
 * 1) Busca en FAQ (LIKE por similitud básica)
 * 2) Busca en caché semántica
 * 3) Llama a Gemini 2.0 Flash con historial de conversación
 */
async function respuestaIA(pregunta, contextoCliente = '', whatsapp = null) {
    // Paso 1: FAQ lookup
    const respuestaFAQ = await buscarEnFAQ(pregunta);
    if (respuestaFAQ) return respuestaFAQ;

    // Paso 2: caché semántica
    const cacheKey = `resp_${normalizarTexto(pregunta)}`;
    const cached = await buscarEnCache(cacheKey);
    if (cached) {
        await db.query('UPDATE cache_ia SET hits = hits + 1 WHERE pregunta_hash = ?', [hashTexto(cacheKey)]).catch(() => {});
        return `${cached} ✨`;
    }

    // Paso 3: Gemini con historial
    try {
        let historial = '';
        if (whatsapp) {
            const [msgs] = await db.query(
                'SELECT rol, mensaje FROM bot_conversaciones WHERE cliente_whatsapp = ? ORDER BY created_at DESC LIMIT 5',
                [whatsapp]
            ).catch(() => [[]]);
            if (msgs.length > 0) {
                historial = '\nHistorial reciente:\n' + msgs.reverse()
                    .map(m => `${m.rol === 'user' ? 'Cliente' : 'Bot'}: ${m.mensaje}`)
                    .join('\n');
            }
        }

        const prompt = `${CONTEXTO_SICAMET}
${historial}
Contexto Inteligente (Perfil temporal del cliente):
${contextoCliente || 'No definido'}

Pregunta del cliente: "${pregunta}"

Responde:`;

        try {
            const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
            const result = await model.generateContent(prompt);
            const respuesta = result.response.text().trim();
            await guardarEnCache(cacheKey, respuesta, 7 * 24 * 60 * 60);
            return respuesta;
        } catch (genErr) {
            console.error('Error Google API:', genErr.message);
            return 'Disculpa, ¿me puedes repetir tu mensaje? 🙏';
        }
    } catch (err) {
        console.error('Error interno respuestaIA:', err.message);
        return '🙏 En este momento no puedo procesar tu consulta. Escribe *ASESOR* o llámanos al *722 270 1584*.';
    }
}

/**
 * Busca en la tabla bot_faq una respuesta a la pregunta.
 */
async function buscarEnFAQ(pregunta) {
    try {
        const palabras = normalizarTexto(pregunta).split(' ').filter(p => p.length > 3);
        if (palabras.length === 0) return null;
        // Buscar FAQ con al menos una palabra clave en la pregunta
        const clauses = palabras.map(() => 'LOWER(pregunta) LIKE ?').join(' OR ');
        const params = palabras.map(p => `%${p}%`);
        const [rows] = await db.query(
            `SELECT * FROM bot_faq WHERE activo = 1 AND (${clauses}) ORDER BY hits DESC LIMIT 1`,
            params
        );
        if (rows.length > 0) {
            await db.query('UPDATE bot_faq SET hits = hits + 1 WHERE id = ?', [rows[0].id]).catch(() => {});
            return rows[0].respuesta;
        }
        return null;
    } catch {
        return null;
    }
}

async function buscarEnCache(texto) {
    try {
        const hash = hashTexto(texto);
        const [rows] = await db.query(
            'SELECT respuesta FROM cache_ia WHERE pregunta_hash = ? AND expires_at > NOW()', [hash]
        );
        return rows.length > 0 ? rows[0].respuesta : null;
    } catch { return null; }
}

async function guardarEnCache(texto, respuesta, ttlSegundos = 604800) {
    try {
        const hash = hashTexto(texto);
        await db.query(
            `INSERT INTO cache_ia (pregunta_hash, pregunta_texto, respuesta, expires_at)
             VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))
             ON DUPLICATE KEY UPDATE respuesta = VALUES(respuesta), hits = hits + 1, expires_at = VALUES(expires_at)`,
            [hash, normalizarTexto(texto).substring(0, 500), respuesta, ttlSegundos]
        );
    } catch {}
}

/**
 * Guarda un mensaje del bot/cliente en el historial de conversaciones.
 */
async function guardarEnHistorial(whatsapp, rol, mensaje) {
    try {
        await db.query(
            'INSERT INTO bot_conversaciones (cliente_whatsapp, rol, mensaje) VALUES (?, ?, ?)',
            [whatsapp, rol, mensaje.substring(0, 1000)]
        );
    } catch {}
}

module.exports = { detectarIntencion, respuestaIA, buscarEnCache, guardarEnHistorial, CONTEXTO_SICAMET };
