/**
 * Motor de Intención — SICAMET Bot PRO (Versión Estricta Sin IA Generativa)
 * - FAQ lookup basado en SQL LIKE
 * - Detección de intenciones por keywords locales
 * - Historial guardado en base de datos
 */
const db = require('./bd');

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
/**
 * @param {object} [opts]
 * @param {boolean} [opts.omitirFAQ] — no consultar bot_faq
 * @param {string[]} [opts.etiquetasMenu] — si el texto solapa una opción del menú, no usar FAQ
 */
async function respuestaIA(pregunta, contextoCliente = '', whatsapp = null, opts = {}) {
    const tn = normalizarTexto(pregunta);

    if (opts.etiquetasMenu?.length) {
        for (const et of opts.etiquetasMenu) {
            const e = normalizarTexto(et);
            if (e.length < 3) continue;
            if (tn === e || tn.includes(e) || e.includes(tn)) {
                return null;
            }
            const palEt = e.split(' ').filter(x => x.length > 3);
            for (const p of palEt) {
                if (tn.includes(p)) return null;
            }
        }
    }

    if (!opts.omitirFAQ) {
        try {
            const respuestaFAQ = await buscarEnFAQ(pregunta);
            if (respuestaFAQ) return respuestaFAQ;
        } catch (e) {
            console.error('buscarEnFAQ en respuestaIA:', e.message);
        }
    }

    // Sprint 5 / S5-B: registramos el mensaje no entendido para que admin lo apruebe como FAQ.
    try {
        const { registrarMensajeNoEntendido } = require('./aprendizaje_bot');
        registrarMensajeNoEntendido(pregunta, 'menu_principal');
    } catch (_) {}

    return 'No entiendo exactamente tu solicitud. Por favor, selecciona una opción válida del menú principal usando números, o escribe *ASESOR* para comunicarte con nuestro equipo. 🙏';
}

/**
 * Biblioteca FAQ: la columna `pregunta` suele ser lista de sinónimos separados por comas.
 * Se puntúa por solapamiento usuario ↔ fragmentos y palabras clave.
 */
async function buscarEnFAQ(pregunta) {
    try {
        const userNorm = normalizarTexto(pregunta);
        if (userNorm.length < 2) return null;

        const [rows] = await db.query('SELECT * FROM bot_faq WHERE activo = 1 ORDER BY hits DESC');
        let mejor = null;
        let mejorScore = 0;

        for (const row of rows) {
            const textoPregunta = row.pregunta || '';
            const fullNorm = normalizarTexto(textoPregunta);
            const fragmentos = textoPregunta
                .split(/[,;\n]+/)
                .map(s => normalizarTexto(s.trim()))
                .filter(s => s.length >= 2);

            let score = 0;

            for (const frag of fragmentos) {
                if (frag.length < 2) continue;
                if (userNorm === frag) {
                    score += 50 + frag.length;
                    continue;
                }
                if (frag.length >= 4 && (userNorm.includes(frag) || frag.includes(userNorm))) {
                    score += 40 + Math.min(frag.length, userNorm.length);
                    continue;
                }
                if (frag.length >= 3 && userNorm.length <= 24 && frag.includes(userNorm)) {
                    score += 25 + userNorm.length;
                }
            }

            const palabrasUser = userNorm.split(/\s+/).filter(w => w.length >= 2);
            for (const w of palabrasUser) {
                if (w.length < 2) continue;
                if (fullNorm.includes(w)) {
                    score += w.length >= 4 ? w.length : w.length * 0.6;
                }
                for (const frag of fragmentos) {
                    if (frag.length >= 3 && (frag.includes(w) || w.includes(frag))) {
                        score += 3;
                    }
                }
            }

            if (score > mejorScore) {
                mejorScore = score;
                mejor = row;
            }
        }

        const umbral = 6;
        if (mejor && mejorScore >= umbral && mejor.respuesta != null) {
            await db.query('UPDATE bot_faq SET hits = hits + 1 WHERE id = ?', [mejor.id]).catch(() => { });
            return String(mejor.respuesta);
        }

        const words = userNorm.split(/\s+/).filter(w => w.length >= 3);
        if (words.length > 0) {
            const clauses = words.map(() => 'LOWER(pregunta) LIKE ?').join(' OR ');
            const params = words.map(w => `%${w}%`);
            const [rows2] = await db.query(
                `SELECT * FROM bot_faq WHERE activo = 1 AND (${clauses}) ORDER BY hits DESC LIMIT 1`,
                params
            );
            if (rows2.length > 0 && rows2[0].respuesta != null) {
                await db.query('UPDATE bot_faq SET hits = hits + 1 WHERE id = ?', [rows2[0].id]).catch(() => { });
                return String(rows2[0].respuesta);
            }
        }
        return null;
    } catch (e) {
        console.error('buscarEnFAQ:', e.message);
        return null;
    }
}

// Stubs para compatibilidad de flujos antiguos que requieran modulos de memoria o caché
async function buscarEnCache() { return null; }
async function guardarEnCache() {}

async function guardarEnHistorial(whatsapp, rol, mensaje) {
    try {
        const s = String(mensaje ?? '');
        await db.query(
            'INSERT INTO bot_conversaciones (cliente_whatsapp, rol, mensaje) VALUES (?, ?, ?)',
            [whatsapp, rol, s.substring(0, 1000)]
        );
    } catch { }
}

module.exports = {
    detectarIntencion,
    respuestaIA,
    buscarEnCache,
    guardarEnHistorial,
    buscarEnFAQ,
    CONTEXTO_SICAMET: '',
    normalizarTexto
};
