/**
 * Motor de Flujos Conversacionales — SICAMET Bot PRO v3
 * ─────────────────────────────────────────────────────
 * - Nodos dinámicos desde BD (bot_nodos, bot_opciones)
 * - IA contextual: responde según el nodo activo (sin confusiones)
 * - Cache de IA por nodo (no se mezclan respuestas entre temas)
 * - Anti-loop: detecta y rompe ciclos de navegación
 * - Menú de bienvenida editable desde la BD
 * - Múltiples números de notificación
 * - Soporte de archivos adjuntos (URL directa o subida local)
 */

const db = require('./bd');
const { guardarEnHistorial } = require('./bot_ia');

// ─── CACHÉ EN MEMORIA (10 min) ────────────────────────────────────────────────
let cacheConfigHorario = null;

async function getConfigHorario() {
    if (!cacheConfigHorario || Date.now() - cacheConfigHorario._ts > 10 * 60 * 1000) {
        try {
            const [rows] = await db.query('SELECT clave, valor FROM bot_config');
            const cfg = {};
            rows.forEach(r => { cfg[r.clave] = r.valor; });
            cacheConfigHorario = { ...cfg, _ts: Date.now() };
        } catch {
            cacheConfigHorario = {
                horario_inicio: '08:00', horario_fin: '18:00',
                dias_atencion: '1,2,3,4,5', modo_fuera_horario: 'auto',
                _ts: Date.now()
            };
        }
    }
    return cacheConfigHorario;
}

// Invalida el cache de config (llamar después de actualizar bot_config)
function invalidarCacheConfig() { cacheConfigHorario = null; }

async function estaEnHorario() {
    const cfg = await getConfigHorario();
    const ahora = new Date();
    const dias = (cfg.dias_atencion || '1,2,3,4,5').split(',').map(Number);
    if (!dias.includes(ahora.getDay())) return false;
    const [hIni, mIni] = (cfg.horario_inicio || '08:00').split(':').map(Number);
    const [hFin, mFin] = (cfg.horario_fin || '18:00').split(':').map(Number);
    const ahMin = ahora.getHours() * 60 + ahora.getMinutes();
    return ahMin >= hIni * 60 + mIni && ahMin < hFin * 60 + mFin;
}

// ─── SESIONES ────────────────────────────────────────────────────────────────

async function getSesion(wa) {
    let [rows] = await db.query('SELECT * FROM sesiones WHERE cliente_whatsapp = ?', [wa]);
    if (rows.length === 0) {
        await db.query(
            'INSERT IGNORE INTO sesiones (cliente_whatsapp, nodo_actual_id, datos_temporales) VALUES (?, NULL, "{}")',
            [wa]
        );
        [rows] = await db.query('SELECT * FROM sesiones WHERE cliente_whatsapp = ?', [wa]);
    }
    const s = rows[0];
    let datos = {};
    try { datos = s.datos_temporales ? JSON.parse(s.datos_temporales) : {}; } catch {}
    return { ...s, datos };
}

async function guardarSesion(wa, nodo_id, datos) {
    // 0 y null significan "menú raíz" (FK compatible)
    const nodoGuardar = (!nodo_id && nodo_id !== false) ? null : nodo_id;
    await db.query(
        'UPDATE sesiones SET nodo_actual_id = ?, datos_temporales = ? WHERE cliente_whatsapp = ?',
        [nodoGuardar, JSON.stringify(datos ?? {}), wa]
    );
}

// ─── NODOS ────────────────────────────────────────────────────────────────────

async function getNodo(id) {
    if (!id) return null;
    try {
        const [n] = await db.query('SELECT * FROM bot_nodos WHERE id = ?', [id]);
        if (n.length === 0) return null;
        const [o] = await db.query('SELECT * FROM bot_opciones WHERE nodo_id = ? ORDER BY id ASC', [id]);
        return { ...n[0], opciones: o || [] };
    } catch { return null; }
}

async function getTodosNodos() {
    const [rows] = await db.query('SELECT * FROM bot_nodos ORDER BY orden ASC, id ASC');
    return rows || [];
}

// ─── MENÚ RAÍZ (BIENVENIDA) ──────────────────────────────────────────────────

async function responderMenuPrincipal(wa, sesion) {
    try {
        const cfg = await getConfigHorario();
        const nodos = await getTodosNodos();
        const msgBase = cfg.mensaje_bienvenida ||
            '👋 ¡Hola! Soy el asistente virtual de *SICAMET*.\n\n¿En qué te podemos ayudar hoy?';
        
        let texto = msgBase + '\n';
        nodos.forEach((n, i) => {
            texto += `\n*${i + 1}️⃣* ${n.nombre}`;
        });
        texto += '\n\n_Escribe el número de tu opción o cuéntame en qué te puedo ayudar._';

        await guardarEnHistorial(wa, 'bot', texto);
        return { text: texto };
    } catch (e) {
        console.error('Error responderMenuPrincipal:', e.message);
        return { text: '👋 ¡Hola! ¿En qué te puedo ayudar hoy?\n\n_Escribe tu consulta o llama al *722 270 1584*._' };
    }
}

// ─── RESPONDER NODO ──────────────────────────────────────────────────────────

async function responderNodo(wa, id, sesion) {
    const nodo = await getNodo(id);
    if (!nodo) {
        await guardarSesion(wa, null, {});
        return await responderMenuPrincipal(wa, sesion);
    }

    let texto = nodo.mensaje || '';
    // Reemplazar variables de plantilla
    texto = texto
        .replace(/\{nombre\}/g, sesion.nombre_cliente || '')
        .replace(/\{empresa\}/g, sesion.nombre_empresa || '');

    // Agregar opciones si las tiene
    if (nodo.opciones && nodo.opciones.length > 0) {
        texto += '\n\n' + nodo.opciones.map((o, i) => `*${i + 1}️⃣* ${o.texto_opcion}`).join('\n');
    }

    texto += '\n\n_Escribe *0* para volver al menú principal._';

    await guardarEnHistorial(wa, 'bot', texto);
    return { text: texto, mediaUrl: nodo.media_url || null, mediaTipo: nodo.media_tipo || null };
}

// ─── PROCESADOR PRINCIPAL ────────────────────────────────────────────────────

async function procesarMensaje(wa, texto, detectarIntencion, respuestaIA) {
    const textoLower = texto.toLowerCase().trim();
    const sesion = await getSesion(wa);
    await guardarEnHistorial(wa, 'user', texto);

    // Verificar horario — si está fuera y modo=silent, no respond
    const enHorario = await estaEnHorario();
    const cfg = await getConfigHorario();

    if (!enHorario && cfg.modo_fuera_horario === 'silent') return null;

    if (!enHorario && cfg.modo_fuera_horario !== 'silent') {
        const hFin = cfg.horario_fin || '18:00';
        const hIni = cfg.horario_inicio || '08:00';
        const txt = `⏰ Nuestro horario de atención es de *${hIni}* a *${hFin}* hrs (Lun-Vie).\n\nTu mensaje fue registrado. Te contactaremos en horario laboral. 🙏`;
        await guardarEnHistorial(wa, 'bot', txt);
        return { text: txt };
    }

    // ── Comandos especiales de navegación ────────────────────────────────────
    if (['0', 'menu', 'inicio', 'reiniciar', 'hola', 'hi', 'buenas', 'buenos dias', 'buenas tardes', 'buenas noches'].includes(textoLower)) {
        await guardarSesion(wa, null, {});
        return await responderMenuPrincipal(wa, sesion);
    }

    // ── Estado de sesión ──────────────────────────────────────────────────────
    const nodoActualId = sesion.nodo_actual_id || null;
    let nodoActual = nodoActualId ? await getNodo(nodoActualId) : null;

    // Si el nodo fue borrado o ya no existe, volver al menú
    if (nodoActualId && !nodoActual) {
        await guardarSesion(wa, null, {});
        return await responderMenuPrincipal(wa, sesion);
    }

    // ── MENÚ RAÍZ (sin nodo activo) ──────────────────────────────────────────
    if (!nodoActualId || !nodoActual) {
        return await manejarMenuRaiz(wa, texto, textoLower, sesion, detectarIntencion, respuestaIA, cfg);
    }

    // ── DENTRO DE UN NODO ────────────────────────────────────────────────────
    return await manejarNodoActivo(wa, texto, textoLower, sesion, nodoActual, nodoActualId, detectarIntencion, respuestaIA);
}

// ─── MENÚ RAÍZ ───────────────────────────────────────────────────────────────

async function manejarMenuRaiz(wa, texto, textoLower, sesion, detectarIntencion, respuestaIA, cfg) {
    const nodos = await getTodosNodos();

    // 1. Selección numérica
    const num = parseInt(textoLower);
    if (!isNaN(num) && num >= 1 && num <= nodos.length) {
        const destino = nodos[num - 1];
        await guardarSesion(wa, destino.id, sesion.datos || {});
        return await responderNodo(wa, destino.id, await getSesion(wa));
    }

    // 2. Detección de intención
    const { accion, metodo } = await detectarIntencion(texto);

    // Saludos → menú
    if (['SALUDO'].includes(accion)) {
        return await responderMenuPrincipal(wa, sesion);
    }

    // Mapa de intención a nodo (por accion guardada en bot_nodos)
    const accionANodo = await mapearAccionANodo(accion, nodos);
    if (accionANodo) {
        await guardarSesion(wa, accionANodo.id, sesion.datos || {});
        return await responderNodo(wa, accionANodo.id, await getSesion(wa));
    }

    // 3. Respuesta de IA con contexto de SICAMET (menú raíz = pregunta libre)
    try {
        const perfilStr = JSON.stringify(sesion.datos || {});
        const resp = await respuestaIA(texto, `Ubicación en el bot: Menú Principal.\nDatos de Sesión: ${perfilStr}`, wa);
        await guardarEnHistorial(wa, 'bot', resp);
        const nodos2 = await getTodosNodos();
        let sugerencia = '\n\n¿Puedo ayudarte en algo más? Escribe el número de una opción:';
        nodos2.forEach((n, i) => { sugerencia += `\n*${i + 1}️⃣* ${n.nombre}`; });
        return { text: resp + sugerencia };
    } catch {
        return await responderMenuPrincipal(wa, sesion);
    }
}

// ─── NODO ACTIVO ─────────────────────────────────────────────────────────────

async function manejarNodoActivo(wa, texto, textoLower, sesion, nodoActual, nodoActualId, detectarIntencion, respuestaIA) {
    // NUEVA LÓGICA V4: Prioridad Global de Intención (Salida de emergencia del flujo ciego)
    if (texto.length > 3) {
        const { accion, confianza } = await detectarIntencion(texto);
        if (confianza === 'alta' && ['ESCALAR', 'ESTATUS', 'CONTACTO'].includes(accion) && nodoActual.accion !== accion.toLowerCase() && nodoActual.accion !== 'escalar') {
            const nodos = await getTodosNodos();
            const accionANodo = await mapearAccionANodo(accion, nodos);
            if (accionANodo) {
                await guardarSesion(wa, accionANodo.id, {});
                return await responderNodo(wa, accionANodo.id, await getSesion(wa));
            }
        }
    }

    // 1. Acciones especiales con su propia lógica de flujo conversacional (backend motor interno)
    if (nodoActual.accion) {
        const r = await ejecutarAccionEspecial(wa, texto, nodoActual, sesion);
        if (r) return r;
    }

    // 2. Nodo tipo OPCIONES: el usuario elige un botón
    if (nodoActual.tipo === 'opciones') {
        // Buscar por número
        const num = parseInt(textoLower);
        if (!isNaN(num) && num >= 1 && num <= nodoActual.opciones.length) {
            const opt = nodoActual.opciones[num - 1];
            await guardarSesion(wa, opt.nodo_destino_id, sesion.datos || {});
            return await responderNodo(wa, opt.nodo_destino_id, await getSesion(wa));
        }
        // Buscar por texto del botón
        const optTexto = nodoActual.opciones.find(o =>
            o.texto_opcion.toLowerCase().includes(textoLower) ||
            textoLower.includes(o.texto_opcion.toLowerCase().substring(0, 6))
        );
        if (optTexto) {
            await guardarSesion(wa, optTexto.nodo_destino_id, sesion.datos || {});
            return await responderNodo(wa, optTexto.nodo_destino_id, await getSesion(wa));
        }
        // No coincide → reiterar el menú del nodo
        return await responderNodo(wa, nodoActualId, sesion);
    }

    // 3. Nodo tipo MENSAJE (informativo) — responder con IA contextual al tema del nodo
    if (nodoActual.tipo === 'mensaje') {
        // Detectar si el usuario quiere ir a otro flujo
        const { accion } = await detectarIntencion(texto);

        // ANTI-LOOP: si la intención mapea al mismo nodo actual, no redirigir
        const nodos = await getTodosNodos();
        const accionANodo = await mapearAccionANodo(accion, nodos);
        const mismoNodo = accionANodo && accionANodo.id === nodoActualId;

        if (accionANodo && !mismoNodo && !['SALUDO', 'OTRO', 'NORMATIVO'].includes(accion)) {
            await guardarSesion(wa, accionANodo.id, sesion.datos || {});
            return await responderNodo(wa, accionANodo.id, await getSesion(wa));
        }

        // Escalar si pide asesor
        if (accion === 'ESCALAR') {
            return await escalarAHumanoLogic(wa, texto);
        }

        // NORMATIVO, pregunta libre o MISMO NODO → IA con contexto del nodo
        const contextoNodo = `El cliente está leyendo información sobre: "${nodoActual.nombre}".
Contenido mostrado al cliente:
${nodoActual.mensaje}

Responde la pregunta del cliente en el contexto de SICAMET y de este tema específico. 
Si el cliente pregunta sobre magnitudes, calibración, servicios o similar, responde con precisión técnica.
Al final, ofrece opciones relevantes del menú si aplica.`;

        try {
            // Cache segmentado por nodo para evitar mezclar respuestas
            const { buscarEnCache, guardarEnHistorial: _gh } = require('./bot_ia');
            const cacheKeyNodo = `nodo_${nodoActualId}_${texto.toLowerCase().trim().substring(0, 80)}`;

            const pw = JSON.stringify(sesion.datos || {});
            const resp = await respuestaIA(texto, `${contextoNodo}\nDatos perfil cliente: ${pw}`, wa);
            await guardarEnHistorial(wa, 'bot', resp);
            return { text: resp + '\n\n_Escribe *0* para volver al menú principal._' };
        } catch {
            // Si IA falla, mostrar el nodo de nuevo con un hint
            return { text: nodoActual.mensaje + '\n\n_¿Tienes más preguntas? Escribe *0* para más opciones._' };
        }
    }

    // 4. Nodo tipo INPUT: esperar dato del usuario (manejado por accion especial)
    return await responderNodo(wa, nodoActualId, sesion);
}

// ─── MAPEO DE INTENCIÓN A NODO ───────────────────────────────────────────────

async function mapearAccionANodo(accion, nodos) {
    // Mapa directo por accion registrada en bot_nodos
    const accionMap = {
        'COTIZACION': 'cotizacion',
        'ESTATUS': 'consultar_estatus',
        'RECORDATORIO': 'registrar_equipo',
        'ESCALAR': 'escalar',
        'SERVICIOS': null, // No tiene accion propia, buscar por nombre
        'CONTACTO': null,
        'NORMATIVO': null,
    };

    if (!(accion in accionMap)) return null;

    const accionBD = accionMap[accion];
    if (accionBD) {
        return nodos.find(n => n.accion === accionBD) || null;
    }

    // Buscar por nombre aproximado
    const nombreMap = { 'SERVICIOS': 'Servicios', 'CONTACTO': 'Contacto', 'NORMATIVO': 'Servicios' };
    const nombreBuscar = nombreMap[accion];
    if (nombreBuscar) {
        return nodos.find(n => n.nombre.toLowerCase().includes(nombreBuscar.toLowerCase())) || null;
    }

    return null;
}

// ─── ACCIONES ESPECIALES ──────────────────────────────────────────────────────

async function ejecutarAccionEspecial(wa, texto, nodo, sesion) {
    if (nodo.accion === 'consultar_estatus') return await consultarEstatusLogic(wa, texto);
    if (nodo.accion === 'cotizacion') return await flujosCotizacionLogic(wa, texto, sesion);
    if (nodo.accion === 'registrar_equipo') return await flujosRegistroEquipoLogic(wa, texto, sesion);
    if (nodo.accion === 'escalar') return await escalarAHumanoLogic(wa, texto);
    return null;
}

// ─── FLUJO COTIZACIÓN ────────────────────────────────────────────────────────

const TIPOS_EQUIPO = {
    '1': '🌡️ Temperatura', '2': '🔩 Presión', '3': '⚖️ Masa / Fuerza',
    '4': '⚡ Eléctrica', '5': '📏 Dimensional', '6': '💧 Humedad / Flujo / Volumen', '7': '🔬 Otro'
};

const TIEMPOS_ENTREGA = {
    '1': '5 días hábiles', '2': '10 días hábiles', '3': '10-15 días hábiles', '4': '15-20 días hábiles'
};

async function flujosCotizacionLogic(wa, texto, sesion) {
    const datos = sesion.datos || {};
    const paso = datos.paso || 1;
    const items = datos.items || [];
    const currentItem = datos.currentItem || {};

    const textoTrim = texto.trim();
    const textoLower = textoTrim.toLowerCase();

    switch (paso) {
        case 1: { // Inicio: Tipo de equipo o descripción
            const tipo = TIPOS_EQUIPO[textoTrim] || textoTrim;
            const updatedItem = { ...currentItem, tipoEquipo: tipo };
            await guardarSesion(wa, sesion.nodo_actual_id, { ...datos, paso: 2, currentItem: updatedItem });
            return {
                text: `✅ *${tipo}*\n\n¿Cuál es la *marca y modelo* del instrumento?\n\n_Ej: Fluke 726 | Vaisala HMT310 | WIKA P-30_\n_(Escribe "no sé" si no tienes el dato)_`
            };
        }
        case 2: // Marca y Modelo
            await guardarSesion(wa, sesion.nodo_actual_id, { 
                ...datos, 
                paso: 3, 
                currentItem: { ...currentItem, marcaModelo: textoTrim } 
            });
            return { text: `✅ *${textoTrim}*\n\n¿Cuál es la *Identificación / ID / Tag* del equipo?\n\n_Ej: LQ-M06, Caldera-01, etc._` };
            
        case 3: // ID / Tag
            await guardarSesion(wa, sesion.nodo_actual_id, { 
                ...datos, 
                paso: 4, 
                currentItem: { ...currentItem, identificacion: textoTrim } 
            });
            return { text: `✅ *ID: ${textoTrim}*\n\n¿En qué *ubicación* se encuentra físicamente?\n\n_Ej: Etiquetadora LQ-09, Almacén, Planta 2..._` };

        case 4: // Ubicación
            await guardarSesion(wa, sesion.nodo_actual_id, { 
                ...datos, 
                paso: 5, 
                currentItem: { ...currentItem, ubicacion: textoTrim } 
            });
            return { text: `✅ *Ubicación: ${textoTrim}*\n\n¿Tienes *requerimientos especiales* para este equipo? (Puntos específicos, rango, acreditación especial, etc.)\n\n_Escribe "ninguno" para continuar_` };

        case 5: // Requerimientos y ¿Añadir otro?
            const notas = (textoLower === 'ninguno' || textoLower === 'ninguna') ? '' : textoTrim;
            const itemFinalizado = { ...currentItem, requerimientos: notas };
            const nuevosItems = [...items, itemFinalizado];
            
            await guardarSesion(wa, sesion.nodo_actual_id, { 
                ...datos, 
                paso: 6, 
                items: nuevosItems, 
                currentItem: {} 
            });

            return {
                text: `📦 *Instrumento registrado (${nuevosItems.length})*\n\n¿Deseas agregar *otro instrumento* a esta misma cotización?\n\n*1️⃣* Sí, añadir otro\n*2️⃣* No, finalizar y enviar solicitud`
            };

        case 6: // Lógica de bucle o pasar a generales
            if (textoTrim === '1') {
                await guardarSesion(wa, sesion.nodo_actual_id, { ...datos, paso: 1, currentItem: {} });
                return {
                    text: `✍️ *Registro de instrumento #${items.length + 1}*\n\nDime qué equipo es o elige una categoría:\n\n` +
                        Object.entries(TIPOS_EQUIPO).map(([k, v]) => `*${k}️⃣* ${v}`).join('\n')
                };
            } else {
                await guardarSesion(wa, sesion.nodo_actual_id, { ...datos, paso: 7 });
                return {
                    text: `⏳ *Tiempo de entrega preferido:*\n\n¿Qué rango de tiempo de entrega se ajusta a tus necesidades?\n\n*1️⃣* 5 días hábiles\n*2️⃣* 10 días hábiles\n*3️⃣* 10-15 días hábiles\n*4️⃣* 15-20 días hábiles`
                };
            }

        case 7: // Tiempo de entrega
            const tiempo = TIEMPOS_ENTREGA[textoTrim] || textoTrim;
            await guardarSesion(wa, sesion.nodo_actual_id, { ...datos, paso: 8, tiempoEntrega: tiempo });
            return { text: `✅ *${tiempo}*\n\n¿Cuál es el nombre de tu *empresa* o razón social?` };

        case 8: // Empresa y Guardado Final
            const empresa = textoTrim;
            const dFinal = { ...datos, empresa, items };
            
            try {
                // Tomamos el primer equipo como referencia para los campos principales de la tabla
                const primer = items[0] || {};
                await db.query(
                    'INSERT INTO cotizaciones_bot (cliente_whatsapp, nombre_empresa, tipo_equipo, marca, cantidad, tiempo_entrega, detalle_instrumentos, estatus) VALUES (?,?,?,?,?,?,?,?)',
                    [
                        wa, 
                        empresa, 
                        primer.tipoEquipo || 'Múltiples', 
                        primer.marcaModelo || 'Varios', 
                        items.length,
                        dFinal.tiempoEntrega,
                        JSON.stringify(items),
                        'nueva'
                    ]
                );
                
                // Emitir alerta en tiempo real
                if (global.io) {
                    global.io.emit('nueva_cotizacion', { 
                        id: (await db.query('SELECT LAST_INSERT_ID() as id'))[0][0].id,
                        empresa,
                        cantidad: items.length 
                    });
                }
                
                await notificarNuevaCotizacion(dFinal);
                await guardarSesion(wa, null, {});
                
                let resumen = `🎉 ¡Solicitud registrada exitosamente!\n\n📋 *Resumen:*\n• Empresa: *${empresa}*\n• Ítems: *${items.length} equipos*\n• Entrega: *${dFinal.tiempoEntrega}*\n\nListado:`;
                items.forEach((it, i) => {
                    resumen += `\n${i+1}. ${it.tipoEquipo} (${it.marcaModelo || 'S/M'})`;
                });
                resumen += `\n\nEn breve un especialista SICAMET se pondrá en contacto. ¡Gracias! 📧\n\n_Escribe *0* para volver al menú._`;

                return { text: resumen };
            } catch (err) {
                console.error('Error al guardar cotización:', err);
                return { text: '❌ Hubo un error al guardar tu solicitud. Por favor intenta de nuevo o contacta a un asesor.' };
            }

        default:
            await guardarSesion(wa, null, {});
            return await responderMenuPrincipal(wa, sesion);
    }
}

// ─── NOTIFICAR COTIZACIÓN (múltiples números) ─────────────────────────────────

async function notificarNuevaCotizacion(d) {
    try {
        const cfg = await getConfigHorario();
        const numeros = [
            ...(cfg.notif_numeros || '').split(','),
            ...(cfg.notif_cotizacion_wa ? [cfg.notif_cotizacion_wa] : [])
        ].map(n => n.trim()).filter(n => n.length > 5);

        if (numeros.length === 0 || !global.botClient) return;
        const msg = `🔔 *Nueva cotización recibida*\n\n🏢 Empresa: *${d.empresa}*\n🔧 Equipo: *${d.tipoEquipo}*\n🏷️ Marca: *${d.marcaModelo || 'N/E'}*\n📦 Cantidad: *${d.cantidad}*\n🔬 Servicio: *${d.tipoServicio}*`;
        for (const num of numeros) {
            await global.botClient.sendMessage(num, msg).catch(() => {});
        }
    } catch {}
}

// ─── FLUJO ESTATUS ────────────────────────────────────────────────────────────

async function consultarEstatusLogic(wa, texto) {
    const busqueda = texto.trim().toUpperCase();
    const esOC = /^(OC|COT|COTI|ORDEN|ORD)[\s\-]?\d+/i.test(texto) || /\-\d{4}/.test(texto);

    if (esOC) {
        const [info] = await db.query(
            'SELECT * FROM instrumentos_estatus WHERE UPPER(orden_cotizacion) LIKE ?',
            [`%${busqueda}%`]
        );
        if (info.length > 0) return { text: formatearRespuestaEstatus(info[0]) };
        return { text: `❌ No encontré la orden *${busqueda}*.\n\nVerifica que el número sea correcto, o escribe el nombre de tu empresa para buscar por nombre.\n\n_Escribe *0* para el menú principal._` };
    }

    const [info] = await db.query(
        `SELECT * FROM instrumentos_estatus
         WHERE LOWER(persona) LIKE ? OR LOWER(empresa) LIKE ? OR LOWER(nombre_instrumento) LIKE ?
         ORDER BY fecha_ingreso DESC LIMIT 5`,
        [`%${texto.toLowerCase()}%`, `%${texto.toLowerCase()}%`, `%${texto.toLowerCase()}%`]
    );

    if (info.length === 0) {
        return { text: `❌ No encontré equipos para *"${texto}"*.\n\nIntenta con el número de OC exacto (ej: *OC-2025-001*) o escribe *0* para el menú.` };
    }
    if (info.length === 1) {
        return { text: formatearRespuestaEstatus(info[0]) };
    }

    let m = `🔍 Encontré *${info.length}* equipos para *"${texto}"*:\n\n`;
    info.forEach((eq, i) => {
        const etap = { 'Recepción': '📥', 'Laboratorio': '🔬', 'Certificación': '📋', 'Listo': '✅', 'Entregado': '📦' };
        m += `*${i + 1}.* ${etap[eq.estatus_actual] || '🔷'} ${eq.nombre_instrumento} (OC: ${eq.orden_cotizacion || '—'})\n`;
    });
    m += `\nEscribe el número de OC exacto para ver el detalle completo.`;
    return { text: m };
}

function formatearRespuestaEstatus(eq) {
    const etap = {
        'Recepción': '📥 Recibido en SICAMET',
        'Laboratorio': '🔬 En proceso de calibración',
        'Certificación': '📋 Emitiendo certificado',
        'Listo': '✅ ¡Listo para entrega!',
        'Entregado': '📦 Entregado al cliente'
    };
    const fechaEntrega = eq.fecha_entrega
        ? new Date(eq.fecha_entrega).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })
        : 'Pendiente de confirmar';

    return `🔍 *Estatus de Equipo*\n\n📦 *Instrumento:* ${eq.nombre_instrumento}\n🏭 *Cliente:* ${eq.empresa || eq.persona || '—'}\n🏷️ *Orden:* ${eq.orden_cotizacion || '—'}\n🚩 *Etapa actual:* ${etap[eq.estatus_actual] || eq.estatus_actual}\n📅 *Entrega:* ${fechaEntrega}\n\n_Escribe *0* para el menú principal._`;
}

// ─── FLUJO REGISTRO EQUIPO ────────────────────────────────────────────────────

async function flujosRegistroEquipoLogic(wa, texto, sesion) {
    const datos = sesion.datos || {};
    const paso = datos.paso || 1;

    switch (paso) {
        case 1:
            await guardarSesion(wa, sesion.nodo_actual_id, { ...datos, paso: 2, empresa: texto.trim() });
            return { text: `✅ *${texto.trim()}*\n\n¿Cuál es el nombre del instrumento?\n\n_Ej: Termómetro digital, Manómetro Bourdon, Balanza analítica_` };
        case 2:
            await guardarSesion(wa, sesion.nodo_actual_id, { ...datos, paso: 3, nombreEquipo: texto.trim() });
            return { text: `✅ *${texto.trim()}*\n\n¿Cuál es la marca y modelo? (escribe "no sé" si no lo tienes)` };
        case 3:
            await guardarSesion(wa, sesion.nodo_actual_id, { ...datos, paso: 4, marcaModelo: texto.trim() });
            return { text: `✅ *${texto.trim()}*\n\n¿Cuándo fue su última calibración?\n\n_Escribe la fecha en formato DD/MM/AAAA_\n_Ej: 15/03/2024 — Escribe "no sé" si no tienes el dato_` };
        case 4: {
            let f = null;
            if (texto.trim().toLowerCase() !== 'no sé' && texto.trim().toLowerCase() !== 'no se') {
                const p = texto.trim().split('/');
                if (p.length === 3) f = `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
            }
            await guardarSesion(wa, sesion.nodo_actual_id, { ...datos, paso: 5, fechaUltima: f });
            return {
                text: `✅ Fecha registrada\n\n¿Con qué frecuencia se calibra este equipo?\n\n*1️⃣* Cada 6 meses\n*2️⃣* Cada 1 año (recomendado)\n*3️⃣* Cada 2 años`
            };
        }
        case 5: {
            const periodos = { '1': 6, '2': 12, '3': 24 };
            const ms = periodos[texto.trim()] || 12;
            let prox = null;
            if (datos.fechaUltima) {
                const u = new Date(datos.fechaUltima);
                u.setMonth(u.getMonth() + ms);
                prox = u.toISOString().split('T')[0];
            }
            await db.query(
                'INSERT INTO equipos_cliente (cliente_whatsapp, nombre_empresa, nombre_equipo, marca, ultima_calibracion, periodicidad_meses, proxima_calibracion) VALUES (?,?,?,?,?,?,?)',
                [wa, datos.empresa, datos.nombreEquipo, datos.marcaModelo, datos.fechaUltima, ms, prox]
            );
            await guardarSesion(wa, null, {});
            const proxFmt = prox ? new Date(prox).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }) : 'No definida';
            return {
                text: `✅ *¡Equipo registrado exitosamente!*\n\n📋 *${datos.nombreEquipo}* (${datos.marcaModelo})\n🏢 Empresa: *${datos.empresa}*\n📅 Próxima calibración: *${proxFmt}*\n\nTe enviaré un recordatorio antes del vencimiento. 🔔\n\n_Escribe *0* para el menú principal._`
            };
        }
        default:
            await guardarSesion(wa, null, {});
            return await responderMenuPrincipal(wa, sesion);
    }
}

// ─── ESCALAR A HUMANO ─────────────────────────────────────────────────────────

async function escalarAHumanoLogic(wa, texto) {
    try {
        await db.query(
            'INSERT INTO escalados (cliente_whatsapp, motivo, estatus) VALUES (?, ?, "pendiente")',
            [wa, texto.substring(0, 400)]
        );
    } catch {}
    await guardarSesion(wa, null, {});
    return {
        text: '🧑‍💼 *Conectando con un asesor SICAMET...*\n\nUn representante se pondrá en contacto contigo muy pronto.\n\n📞 Si es urgente, llama directamente al *722 270 1584*\n\n_Escribe *0* cuando quieras volver al menú principal._'
    };
}

// ─── EXPORTS ──────────────────────────────────────────────────────────────────

module.exports = {
    procesarMensaje,
    consultarEstatusLogic,
    escalarAHumanoLogic,
    responderMenuPrincipal,
    getConfigHorario,
    invalidarCacheConfig,
    getEstado: getSesion,
    limpiarEstado: wa => guardarSesion(wa, null, {})
};
