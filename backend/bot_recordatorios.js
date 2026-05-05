/**
 * Cron Job — Recordatorios de Calibración
 * SICAMET Bot PRO
 * 
 * Se puede invocar desde el endpoint /api/bot/ejecutar-recordatorios
 * o programar con PM2 / node-cron en producción.
 */
const db = require('./bd');

/**
 * Envía recordatorios de calibración próxima a los clientes.
 * @param {object} botClient - El cliente de WhatsApp instanciado
 * @param {boolean} isClientConnected - Estado de conexión
 */
async function ejecutarRecordatorios(botClient, isClientConnected) {
    if (!isClientConnected || !botClient) {
        console.log('⚠️ Recordatorios: bot no conectado, omitiendo ejecución');
        return { enviados: 0, omitidos: 0, error: 'Bot no conectado' };
    }

    console.log('🔔 Ejecutando check de recordatorios de calibración...');
    let enviados = 0;
    let omitidos = 0;

    try {
        // Equipos que vencen en los próximos 30 días
        const [equipos30] = await db.query(`
            SELECT ec.*, re.id as recordatorio_id
            FROM equipos_cliente ec
            LEFT JOIN recordatorios_enviados re ON re.equipo_id = ec.id AND re.tipo = '30dias'
            WHERE ec.activo = 1 
              AND ec.proxima_calibracion BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
              AND re.id IS NULL
        `);

        // Equipos que vencen en los próximos 7 días
        const [equipos7] = await db.query(`
            SELECT ec.*, re.id as recordatorio_id
            FROM equipos_cliente ec
            LEFT JOIN recordatorios_enviados re ON re.equipo_id = ec.id AND re.tipo = '7dias'
            WHERE ec.activo = 1 
              AND ec.proxima_calibracion BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)
              AND re.id IS NULL
        `);

        // Enviar recordatorios de 30 días
        for (const equipo of equipos30) {
            try {
                const fechaFormateada = new Date(equipo.proxima_calibracion).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
                const mensaje = `🔔 *Recordatorio de Calibración — SICAMET*\n\nHola${equipo.nombre_empresa ? ` *${equipo.nombre_empresa}*` : ''}, te recordamos que el certificado de calibración de tu:\n\n📦 *${equipo.nombre_equipo}*${equipo.marca ? ` | Marca: ${equipo.marca}` : ''}${equipo.rango ? ` | Rango: ${equipo.rango}` : ''}\n\nvence el *${fechaFormateada}* (en aprox. 30 días).\n\n¿Deseas agendar tu próxima calibración?\n\n*1️⃣* Sí, contactarme con un asesor\n*2️⃣* Solicitar cotización express\n*3️⃣* Recordármelo más tarde\n\nSICAMET · *sicamet.mx*`;

                await botClient.sendMessage(equipo.cliente_whatsapp, mensaje);
                await db.query('INSERT INTO recordatorios_enviados (equipo_id, tipo) VALUES (?, ?)', [equipo.id, '30dias']);
                enviados++;
                await sleep(2000); // Pausa entre mensajes para evitar spam
            } catch (e) {
                console.error(`Error enviando recordatorio 30d a ${equipo.cliente_whatsapp}:`, e.message);
                omitidos++;
            }
        }

        // Enviar recordatorios de 7 días (más urgente)
        for (const equipo of equipos7) {
            try {
                const fechaFormateada = new Date(equipo.proxima_calibracion).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
                const mensaje = `⚠️ *Aviso Urgente — SICAMET*\n\nHola${equipo.nombre_empresa ? ` *${equipo.nombre_empresa}*` : ''}, el certificado de:\n\n📦 *${equipo.nombre_equipo}*\n\nvence en *menos de 7 días* (${fechaFormateada}).\n\nPara evitar incumplimientos con tus auditorías, agenda tu calibración hoy:\n\n🌐 *sicamet.mx*\n\n¿Quieres que un asesor te contacte ahora?\n*1️⃣* Sí, llamarme / WhatsApp\n*2️⃣* Enviar cotización urgente`;

                await botClient.sendMessage(equipo.cliente_whatsapp, mensaje);
                await db.query('INSERT INTO recordatorios_enviados (equipo_id, tipo) VALUES (?, ?) ON DUPLICATE KEY UPDATE enviado_at = NOW()', [equipo.id, '7dias']);
                enviados++;
                await sleep(2000);
            } catch (e) {
                console.error(`Error enviando recordatorio 7d a ${equipo.cliente_whatsapp}:`, e.message);
                omitidos++;
            }
        }

        console.log(`✅ Recordatorios: ${enviados} enviados, ${omitidos} omitidos`);
        return { enviados, omitidos };
    } catch (err) {
        console.error('Error en ejecutarRecordatorios:', err.message);
        return { enviados, omitidos, error: err.message };
    }
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Sprint 13-B2 — Verifica sesiones con cotización a medio capturar que llevan
 * más de 30 min sin actividad y le manda recordatorio al cliente.
 * Marca recordatorio_cotiz_at para no spamear. Pensado para correr cada 5 min.
 */
async function verificarSesionesAbandonadas(botClient, isClientConnected) {
    if (!isClientConnected || !botClient) return { enviados: 0 };
    let enviados = 0;
    try {
        // Sesiones inactivas > 30 min con items capturados y sin recordatorio enviado
        const [sesiones] = await db.query(
            `SELECT cliente_whatsapp, datos_temporales, ultima_interaccion
             FROM sesiones
             WHERE bot_activo = 1
               AND ultima_interaccion < DATE_SUB(NOW(), INTERVAL 30 MINUTE)
               AND ultima_interaccion > DATE_SUB(NOW(), INTERVAL 24 HOUR)
               AND recordatorio_cotiz_at IS NULL
               AND datos_temporales IS NOT NULL`
        );
        for (const s of sesiones) {
            try {
                const datos = JSON.parse(s.datos_temporales || '{}');
                const items = datos.items || datos.items_calif || datos.items_verif || datos.items_ventas || [];
                const cantidad = datos.cantidad_equipos || datos.cantidad_items;
                // Solo si está capturando equipos en algún flujo de cotización
                if (!cantidad || items.length === 0) continue;
                const tipoFlujo = datos.subcotizacion === 'calibracion' ? 'cotización de calibración'
                    : datos.rama === 'mapeo' ? 'mapeo térmico'
                    : datos.rama === 'equipos' ? 'calificación de equipos'
                    : datos.subcotizacion === 'verificentro' ? 'verificentro'
                    : datos.subcotizacion === 'ventas' ? 'venta'
                    : 'cotización';
                const msg = `⏰ *Cotización pendiente*\n\nVeo que dejaste tu *${tipoFlujo}* a medio capturar (${items.length}/${cantidad} equipo(s) registrados).\n\n¿Quieres continuar o cancelar?\n\n• *continuar* — sigue desde donde te quedaste\n• *cancelar* — descarta lo capturado\n\n_Responde con la palabra._`;
                await botClient.sendMessage(s.cliente_whatsapp, msg);
                await db.query('UPDATE sesiones SET recordatorio_cotiz_at = NOW() WHERE cliente_whatsapp = ?', [s.cliente_whatsapp]);
                enviados++;
                await sleep(2000);
            } catch (e) {
                console.error(`Error recordatorio cotiz a ${s.cliente_whatsapp}:`, e.message);
            }
        }
        if (enviados > 0) console.log(`⏰ Recordatorios cotización abandonada: ${enviados}`);
        return { enviados };
    } catch (err) {
        console.error('Error verificarSesionesAbandonadas:', err.message);
        return { enviados, error: err.message };
    }
}

module.exports = { ejecutarRecordatorios, verificarSesionesAbandonadas };
