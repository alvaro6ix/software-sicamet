/**
 * Motor de Intención — SICAMET Bot PRO (Versión Estricta Sin IA Generativa)
 * - FAQ lookup basado en SQL LIKE
 * - Detección de intenciones por keywords locales
 * - Historial guardado en base de datos
 */
const db = require('./bd');
const crypto = require('crypto');

// Intenciones por keywords
const INTENCIONES = {
    SALUDO: { keywords: ['hola', 'buenos días', 'buenas tardes', 'buenas noches', 'good morning', 'hi', 'saludos', 'buen dia', 'que tal', 'qué tal'] },
    ESTATUS: { keywords: ['ya está listo', 'ya termino', 'cuándo estará', 'estado de mi equipo', 'mi orden', 'mi equipo', 'avance', 'como va mi', 'cómo va mi', 'estatus', 'status', 'seguimiento'] },
    COTIZACION: { keywords: ['cotizacion', 'cotización', 'precio', 'costo', 'cuanto cuesta', 'cuánto cuesta', 'calibrar', 'calibración', 'quiero calibrar', 'necesito calibrar', 'presupuesto'] },
    RECORDATORIO: { keywords: ['vencimiento', 'vence', 'cuándo vence', 'fecha límite', 'mis equipos', 'renovar', 'recordatorio'] },
    ESCALAR: { keywords: ['agente', 'persona', 'asesor', 'hablar con alguien', 'humano', 'representante', 'urgente', 'problema', 'queja', 'reclamacion', 'reclamación'] },
    NORMATIVO: { keywords: ['iso', 'norma', 'certificacion', 'certificación', 'auditoría', 'auditoria', 'acreditación', 'reglamento', 'ema', 'pjla', 'fda', 'cofepris'] },
    SERVICIOS: { keywords: ['servicio', 'que hacen', 'qué hacen', 'qué ofrecen', 'que ofrecen', 'al laboratorio', 'in-situ', 'in situ', 'insitu', 'qué calibran'] },
    CONTACTO: { keywords: ['teléfono', 'telefono', 'dirección', 'direccion', 'horario', 'donde están', 'ubicación', 'ubicacion', 'correo', 'email', 'whatsapp'] },
    REGISTRO_EQUIPO: { keywords: ['registrar equipo', 'guardar equipo', 'agregar equipo', 'quiero recordatorio', 'avísame', 'avisame', 'notificame'] },
};

function normalizarTexto(texto) {
    return texto
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') 
        .replace(/[¿?¡!.,;:()'"]/g, '')                   
        .replace(/\s+/g, ' ')                             
        .trim();
}

/**
 * Detecta intención con keywords estáticas.
 */
async function detectarIntencion(texto) {
    const textoLower = normalizarTexto(texto);
    for (const [nombre, config] of Object.entries(INTENCIONES)) {
        if (config.keywords.some(k => textoLower.includes(normalizarTexto(k)))) {
            return { accion: nombre, confianza: 'alta', metodo: 'keywords' };
        }
    }
    return { accion: 'OTRO', confianza: 'baja', metodo: 'keywords' };
}

/**
 * Responde consultando unicamente las FAQs de la BD.
 */
async function respuestaIA(pregunta, contextoCliente = '', whatsapp = null) {
    // Buscar en FAQ directamente
    const respuestaFAQ = await buscarEnFAQ(pregunta);
    if (respuestaFAQ) return respuestaFAQ;

    // Fallback estático (Menú forzoso)
    return 'No entiendo exactamente tu solicitud. Por favor, selecciona una opción válida del menú principal usando números, o escribe *ASESOR* para comunicarte con nuestro equipo. 🙏';
}

/**
 * Busca en la tabla bot_faq una respuesta a la pregunta.
 */
async function buscarEnFAQ(pregunta) {
    try {
        const palabras = normalizarTexto(pregunta).split(' ').filter(p => p.length > 3);
        if (palabras.length === 0) return null;
        
        const clauses = palabras.map(() => 'LOWER(pregunta) LIKE ?').join(' OR ');
        const params = palabras.map(p => `%${p}%`);
        const [rows] = await db.query(
            `SELECT * FROM bot_faq WHERE activo = 1 AND (${clauses}) ORDER BY hits DESC LIMIT 1`,
            params
        );
        if (rows.length > 0) {
            await db.query('UPDATE bot_faq SET hits = hits + 1 WHERE id = ?', [rows[0].id]).catch(() => { });
            return rows[0].respuesta;
        }
        return null;
    } catch {
        return null;
    }
}

// Stubs para compatibilidad de flujos antiguos que requieran modulos de memoria o caché
async function buscarEnCache() { return null; }
async function guardarEnCache() {}

async function guardarEnHistorial(whatsapp, rol, mensaje) {
    try {
        await db.query(
            'INSERT INTO bot_conversaciones (cliente_whatsapp, rol, mensaje) VALUES (?, ?, ?)',
            [whatsapp, rol, mensaje.substring(0, 1000)]
        );
    } catch { }
}

module.exports = { detectarIntencion, respuestaIA, buscarEnCache, guardarEnHistorial, CONTEXTO_SICAMET: '' };
