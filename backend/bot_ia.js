/**
 * Motor de Intención IA — SICAMET Bot PRO
 * Detecta la intención del usuario con Gemini y usa caché para optimizar costos.
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = require('./bd');
const crypto = require('crypto');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Contexto base de SICAMET embebido en el prompt
const CONTEXTO_SICAMET = `
Eres el asistente virtual de SICAMET (Sistemas Integrales de Calibración y Aseguramiento Metrológico S.A. de C.V.).
SICAMET es un laboratorio de metrología con 21 años de trayectoria, 12 acreditaciones ISO/IEC 17025 internacionales, 
avalado por la EMA (Entidad Mexicana de Acreditación) y PJLA. Es el único partner Vaisala certificado en México.

SEDES: Toluca (oficina principal), CDMX, Querétaro y Guadalajara.
CONTACTO: 722 270 1584 | sclientes@sicamet.net | sicamet.mx

SERVICIOS:
- Calibración In-Lab (equipos van al laboratorio)
- Calibración In-situ (técnicos van a las instalaciones del cliente)  
- Calibración personalizada a puntos de medición críticos
- Calificación de equipos (DQ/IQ/OQ/PQ) — ISO 17025
- Consultoría, asesoría y capacitación en metrología

MAGNITUDES DE CALIBRACIÓN ACREDITADAS:
Presión, Temperatura, Fuerza, Masa, Dimensional, Eléctrica, Flujo volumétrico, 
Humedad y punto de rocío, Óptica (iluminancia), Volumen, Analizadores específicos (dinamómetros vehiculares)

CERTIFICACIONES: EMA · PJLA · Vaisala Service Partner

Responde siempre de forma profesional, amable y técnicamente precisa. 
Usa emojis de forma moderada y coherente. Máximo 3 párrafos cortos por respuesta.
Si el tema no es de calibración/metrología, redirige amablemente al tema principal.
`;

// Intenciones predefinidas (para respuestas instantáneas sin IA)
const INTENCIONES = {
    SALUDO: { keywords: ['hola', 'buenos días', 'buenas tardes', 'buenas noches', 'good morning', 'hi', 'saludos', 'buen dia'], accion: 'SALUDO' },
    ESTATUS: { keywords: ['ya está listo', 'ya termino', 'cuándo estará', 'estado de mi equipo', 'mi orden', 'mi equipo', 'avance'], accion: 'ESTATUS' },
    COTIZACION: { keywords: ['cotizacion', 'cotización', 'precio', 'costo', 'cuanto cuesta', 'cuánto cuesta', 'calibrar', 'calibración', 'quiero calibrar', 'necesito calibrar'], accion: 'COTIZACION' },
    RECORDATORIO: { keywords: ['vencimiento', 'vence', 'cuándo vence', 'fecha límite', 'mis equipos', 'renovar'], accion: 'RECORDATORIO' },
    ESCALAR: { keywords: ['agente', 'persona', 'asesor', 'hablar con alguien', 'humano', 'representante', 'urgente', 'problema', 'queja'], accion: 'ESCALAR' },
    NORMATIVO: { keywords: ['iso', 'norma', 'certificacion', 'certificación', 'auditoría', 'auditoria', 'acreditación', 'reglamento', 'ema', 'pjla'], accion: 'NORMATIVO' },
    SERVICIOS: { keywords: ['servicio', 'que hacen', 'qué hacen', 'qué ofrecen', 'que ofrecen', 'al laboratorio', 'in-situ', 'in situ', 'insitu'], accion: 'SERVICIOS' },
    CONTACTO: { keywords: ['teléfono', 'telefono', 'dirección', 'direccion', 'horario', 'donde están', 'ubicación', 'ubicacion', 'correo', 'email'], accion: 'CONTACTO' },
    REGISTRO_EQUIPO: { keywords: ['registrar equipo', 'guardar equipo', 'agregar equipo', 'quiero recordatorio', 'avísame', 'avisame'], accion: 'REGISTRO_EQUIPO' },
};

/**
 * Detecta la intención del mensaje del usuario.
 * Primero busca por keywords (rápido, sin API),
 * si no encuentra, usa Gemini para entender el mensaje.
 */
async function detectarIntencion(texto) {
    const textoLower = texto.toLowerCase();

    // Fase 1: Detección por keywords (instantánea)
    for (const [nombre, config] of Object.entries(INTENCIONES)) {
        if (config.keywords.some(k => textoLower.includes(k))) {
            return { accion: config.accion, confianza: 'alta', metodo: 'keywords' };
        }
    }

    // Fase 2: Clasificación con Gemini (solo si no hubo match)
    try {
        const prompt = `
Clasifica el siguiente mensaje de un cliente de un laboratorio de calibración en UNA SOLA categoría:
COTIZACION | ESTATUS | RECORDATORIO | ESCALAR | NORMATIVO | SERVICIOS | CONTACTO | REGISTRO_EQUIPO | OTRO

Mensaje: "${texto}"

Responde SOLO con la categoría, sin explicación.`;

        const cached = await buscarEnCache(prompt);
        if (cached) return { accion: cached.trim(), confianza: 'media', metodo: 'cache' };

        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const result = await model.generateContent(prompt);
        const accion = result.response.text().trim().toUpperCase();
        
        await guardarEnCache(prompt, accion, 24 * 60 * 60); // caché 24h para clasificaciones
        
        const accionesValidas = ['COTIZACION', 'ESTATUS', 'RECORDATORIO', 'ESCALAR', 'NORMATIVO', 'SERVICIOS', 'CONTACTO', 'REGISTRO_EQUIPO'];
        return { 
            accion: accionesValidas.includes(accion) ? accion : 'OTRO', 
            confianza: 'media',
            metodo: 'gemini'
        };
    } catch (err) {
        console.error('Error en detectarIntencion con Gemini:', err.message);
        return { accion: 'OTRO', confianza: 'baja', metodo: 'fallback' };
    }
}

/**
 * Genera una respuesta contextual de SICAMET usando Gemini.
 * Usa caché agresiva para reducir costos (TTL: 7 días para preguntas técnicas).
 */
async function respuestaIA(pregunta, contextoCliente = '') {
    const cacheKey = `resp_${pregunta.toLowerCase().trim()}`;
    
    // Verificar caché primero
    const cached = await buscarEnCache(cacheKey);
    if (cached) {
        await db.query('UPDATE cache_ia SET hits = hits + 1 WHERE pregunta_hash = ?', [hashTexto(cacheKey)]);
        return `${cached} ✨`;
    }

    try {
        const prompt = `${CONTEXTO_SICAMET}

${contextoCliente ? `Contexto del cliente: ${contextoCliente}\n` : ''}
Pregunta del cliente: "${pregunta}"

Responde de forma breve, profesional y útil:`;

        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const result = await model.generateContent(prompt);
        const respuesta = result.response.text().trim();
        
        // Caché de 7 días para respuestas técnicas
        await guardarEnCache(cacheKey, respuesta, 7 * 24 * 60 * 60);
        
        return respuesta;
    } catch (err) {
        console.error('Error en respuestaIA:', err.message);
        return '🙏 En este momento no puedo procesar tu consulta técnica. Por favor escribe *ASESOR* para hablar con un especialista de SICAMET o llámanos al *722 270 1584*.';
    }
}

/**
 * Busca una respuesta en el caché de la base de datos.
 */
async function buscarEnCache(texto) {
    try {
        const hash = hashTexto(texto);
        const [rows] = await db.query(
            'SELECT respuesta FROM cache_ia WHERE pregunta_hash = ? AND expires_at > NOW()',
            [hash]
        );
        return rows.length > 0 ? rows[0].respuesta : null;
    } catch (err) {
        return null; // Si falla el caché, continuar sin error
    }
}

/**
 * Guarda una respuesta en caché.
 * @param {string} texto - Pregunta/clave
 * @param {string} respuesta - Respuesta a cachear
 * @param {number} ttlSegundos - Tiempo de vida en segundos
 */
async function guardarEnCache(texto, respuesta, ttlSegundos = 604800) {
    try {
        const hash = hashTexto(texto);
        await db.query(
            `INSERT INTO cache_ia (pregunta_hash, pregunta_texto, respuesta, expires_at)
             VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))
             ON DUPLICATE KEY UPDATE 
               respuesta = VALUES(respuesta),
               hits = hits + 1,
               expires_at = VALUES(expires_at)`,
            [hash, texto.substring(0, 500), respuesta, ttlSegundos]
        );
    } catch (err) {
        // Si falla el guardado de caché, no interrumpir el flujo
    }
}

function hashTexto(texto) {
    return crypto.createHash('sha256').update(texto.toLowerCase().trim()).digest('hex');
}

module.exports = { detectarIntencion, respuestaIA, buscarEnCache, CONTEXTO_SICAMET };
