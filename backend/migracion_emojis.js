// migracion_emojis.js
// Repara emojis perdidos por dumps mysqldump hechos con --default-character-set=utf8 (3 bytes).
// Los emojis (4 bytes) quedaron como '?' literales. Esta migración detecta el patrón y restaura
// los textos canónicos. Es idempotente: solo actualiza filas que aún tienen '?' al inicio.

const db = require('./bd');

const NODOS_CANONICOS = {
    cotizacion: `📋 *Menú de Cotizaciones*\\n\\n¿Qué tipo de cotización deseas solicitar?\\n\\n*1️⃣* Calibración de Instrumentos\\n*2️⃣* Calificación de Equipos/Áreas\\n*3️⃣* Verificentro (Masa/Volumen)\\n*4️⃣* Ventas de Instrumentos\\n\\n_Escribe el número de tu opción._`,
    consultar_estatus: `🔎 Escribe el *número de orden de servicio*:\\n\\n_Ejemplo: O26-04XX_`,
    registrar_equipo: `📅 *Registro de Instrumentos*\\n\\nTe avisaré antes de que venza tu certificado. 🔔\\n\\n¿Cuál es el nombre de tu empresa?`,
    servicios: `🛠️ *Servicios SICAMET*\\n\\n✅ Calibración In-Lab / In-situ\\n✅ Alta Tecnología y Acreditaciones:  Presión · Temperatura · Fuerza · Masa · Eléctrica · Dimensional · Flujo · Humedad · Óptica · Volumen · Analizadores específicos (dinamómetros vehiculares) · Mediciones Especiales.`,
    contacto: `📞 *Contacto SICAMET*\\n\\n⌚ Lunes a Viernes de 8:00am a 18:00p\\n📧 sclientes@sicamet.net\\n📍 C. Juan Aldama 1135, Universidad, 50130 Toluca de Lerdo, Méx.\\n🌐 Sitio Web: https://www.sicamet.mx/\\n\\n_Escribe ASESOR para conectar con nuestro equipo_.`,
    escalar: `👨‍💼 Por favor, escribe en un solo mensaje el motivo por el cual deseas contactar a un asesor:`,
    identificar_cliente: `🏢 *Identificación de Cliente*\\n\\nPor favor, escribe el nombre de tu EMPRESA o RAZÓN SOCIAL en MAYÚSCULAS para darte una bienvenida personalizada.\\n\\nEjemplo: *MEXICANA PRO*`,
    feedback: `💬 *Buzón de Quejas y Sugerencias*\\n\\nNos interesa mucho tu opinión para seguir mejorando.\\n\\nPor favor, *escribe tu sugerencia o queja* en un solo mensaje:\\n\\n_Escribe *0* para cancelar y volver._`,
    consultar_certificado: `📄 Escribe el *Número de Orden* o el *Número de Informe* que deseas consultar.`,
    calificacion: `🛠️ *Cotización de Calificación*\\n\\n¿Qué área de calificación requieres?\\n\\n*1️⃣* Equipos (Estufa, Baños, Autoclaves, etc.)\\n*2️⃣* Mapeo Térmico (Almacén, Recintos, etc.)\\n\\n_Escribe 1 o 2_`,
    ventas: `🛒 *Ventas de Instrumentos*\\n\\nDescribe el instrumento que requieres:\\n\\n_Ej: Termohigrómetro certificado por ema iso 17025, puntos 20/50/75% HR_`
};

const MENSAJES_CANONICOS = {
    bienvenida_conocido: `¡Hola de nuevo, *{nombre}*! 👋 ¿En qué te podemos ayudar hoy?`,
    bienvenida_nuevo: `¡Hola! 👋 Bienvenido a *SICAMET*, laboratorio de calibración con 21 años de experiencia.\\n\\nAntes de continuar, ¿me podrías compartir el nombre de tu empresa o razón social?`,
    cotizacion_recibida: `✅ *¡Solicitud de cotización recibida!*\\n\\n📋 Resumen:\\n• Equipo: *{equipo}*\\n• Cantidad: *{cantidad}*\\n• Servicio: *{servicio}*\\n\\nUn asesor te contactará en breve para enviarte la propuesta formal.`,
    escalado_humano: `👨‍💼 *Transfiriendo con un asesor de SICAMET...*\\n\\nUn especialista revisará tu consulta y te contactará en breve.\\n\\n📞 *722 200 0001* | sclientes@sicamet.net`,
    fuera_horario: `🕒 Gracias por contactar a *SICAMET*.\\n\\nNuestro horario de atención es *Lunes a Viernes 8:00–18:00 hrs*.\\n\\nTu mensaje quedó registrado y te responderemos en cuanto reabramos. ¡Gracias por tu paciencia!`,
    menu_principal: `¡Hola! 🤖 Soy el asistente virtual de *SICAMET*.\\n\\n¿En qué te podemos ayudar hoy?\\n\\n*1️⃣* 📋 Solicitar cotización\\n*2️⃣* 🔎 Consultar estatus de equipo\\n*3️⃣* 📅 Registrar equipo (próxima calibración)\\n*4️⃣* 🛠️ Servicios\\n*5️⃣* 📞 Contacto\\n*6️⃣* 👨‍💼 Hablar con asesor\\n\\n_Escribe el número de tu opción o cuéntame en qué te puedo ayudar._`
};

const FAQ_PREFIJOS_CANONICOS = {
    2: '💰',  // costo / precio
    6: '📐',  // magnitudes
    7: '📍'   // ubicación
};

// Heurística de detección: '?' suelto al inicio, '?‍?' (asesor), '?️' (variation selector roto).
function tieneEmojiRoto(texto) {
    if (!texto) return false;
    return /^\?\s/.test(texto) ||
        / \?\s+\*/.test(texto) ||
        /\?‍\?/.test(texto) ||
        /\?️/.test(texto) ||
        /\\n\?\s+/.test(texto);
}

async function arreglarBotNodos() {
    let actualizados = 0;
    for (const [accion, mensajeCanonico] of Object.entries(NODOS_CANONICOS)) {
        try {
            const [rows] = await db.query('SELECT id, mensaje FROM bot_nodos WHERE accion = ? LIMIT 1', [accion]);
            if (!rows.length) continue;
            const actual = rows[0].mensaje || '';
            if (tieneEmojiRoto(actual)) {
                // El mensaje canónico usa \\n literal en JS — convertir a \n real para guardar
                const mensajeReal = mensajeCanonico.replace(/\\n/g, '\n');
                await db.query('UPDATE bot_nodos SET mensaje = ? WHERE id = ?', [mensajeReal, rows[0].id]);
                actualizados++;
            }
        } catch (e) {
            console.warn(`⚠️ migracion_emojis bot_nodos[${accion}]:`, e.message);
        }
    }
    return actualizados;
}

async function arreglarBotMensajes() {
    let actualizados = 0;
    for (const [clave, textoCanonico] of Object.entries(MENSAJES_CANONICOS)) {
        try {
            const [rows] = await db.query('SELECT clave, texto FROM bot_mensajes WHERE clave = ? LIMIT 1', [clave]);
            if (!rows.length) continue;
            if (tieneEmojiRoto(rows[0].texto || '')) {
                const textoReal = textoCanonico.replace(/\\n/g, '\n');
                await db.query('UPDATE bot_mensajes SET texto = ? WHERE clave = ?', [textoReal, clave]);
                actualizados++;
            }
        } catch (e) {
            console.warn(`⚠️ migracion_emojis bot_mensajes[${clave}]:`, e.message);
        }
    }
    return actualizados;
}

async function arreglarBotFaq() {
    let actualizados = 0;
    for (const [id, prefijo] of Object.entries(FAQ_PREFIJOS_CANONICOS)) {
        try {
            const [rows] = await db.query('SELECT id, respuesta FROM bot_faq WHERE id = ? LIMIT 1', [id]);
            if (!rows.length) continue;
            const actual = rows[0].respuesta || '';
            if (/^\?\s/.test(actual)) {
                const nueva = actual.replace(/^\?\s/, `${prefijo} `);
                await db.query('UPDATE bot_faq SET respuesta = ? WHERE id = ?', [nueva, id]);
                actualizados++;
            }
        } catch (e) {
            console.warn(`⚠️ migracion_emojis bot_faq[${id}]:`, e.message);
        }
    }
    return actualizados;
}

async function migrarEmojis() {
    try {
        const a = await arreglarBotNodos();
        const b = await arreglarBotMensajes();
        const c = await arreglarBotFaq();
        const total = a + b + c;
        if (total > 0) {
            console.log(`🧩 Emojis restaurados: ${a} nodos, ${b} mensajes, ${c} FAQs`);
        } else {
            console.log('✅ Emojis del bot OK (no requirieron reparación)');
        }
    } catch (e) {
        console.error('❌ Error en migracion_emojis:', e.message);
    }
}

module.exports = { migrarEmojis };
