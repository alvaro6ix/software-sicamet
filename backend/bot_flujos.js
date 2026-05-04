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
const { guardarEnHistorial, normalizarTexto, buscarEnFAQ } = require('./bot_ia');
const path = require('path');

// ─── DOMINIO DINÁMICO ────────────────────────────────────────────────────────
const DOMINIO_PUBLICO = process.env.APP_URL || 'https://crm.sicamet.com';

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

// ─── GESTOR DE FALLOS Y REINTENTOS (3 intentos por contexto) ─────────────────
const I_MENU = 'intentos_menu';
const I_ID = 'intentos_identificacion';
const I_ESTATUS = 'intentos_estatus';
const I_COTIZ = 'intentos_cotizacion';
const I_REG_EQ = 'intentos_registro_equipo';

const LEGACY_I = 'intentos'; // compat sesiones viejas

function perfilSesionLimpio(datos) {
    const d = datos || {};
    const perfil = {};
    if (d.nombre_empresa) perfil.nombre_empresa = d.nombre_empresa;
    if (d.cliente_id != null) perfil.cliente_id = d.cliente_id;
    return perfil;
}

function datosSinContadoresIntento(datos) {
    const d = { ...(datos || {}) };
    delete d[I_MENU];
    delete d[I_ID];
    delete d[I_ESTATUS];
    delete d[I_COTIZ];
    delete d[I_REG_EQ];
    delete d[LEGACY_I];
    return d;
}

/** Tras escalar a humano: conserva solo identificación del cliente, sin pasos ni contadores. */
function estadoTrasEscalado(datos) {
    return perfilSesionLimpio(datos);
}

function limpiarIntentoCotiz(datos) {
    const d = { ...(datos || {}) };
    delete d[I_COTIZ];
    delete d[LEGACY_I];
    return d;
}

function limpiarIntentoRegEq(datos) {
    const d = { ...(datos || {}) };
    delete d[I_REG_EQ];
    delete d[LEGACY_I];
    return d;
}

const MSG_COTIZ_REINTENTO = 'No entendí tu respuesta. Intenta de nuevo.';
const MSG_COTIZ_ESCALA = 'Parece que algo no está saliendo bien. Te conectamos con un asesor.';

/**
 * @param {string} wa
 * @param {object} sesion
 * @param {string|object} reintentoOrOpts  Texto reintento 1–2, o { reintento, escala, claveIntentos, motivoEscalado }
 * @param {string} [claveLegacy]
 */
async function manejarFalloIntento(wa, sesion, reintentoOrOpts, claveLegacy = I_MENU) {
    let reintento;
    let escala;
    let claveIntentos = claveLegacy;
    let motivoEscalado = 'Reintentos agotados en flujo del bot';

    if (typeof reintentoOrOpts === 'object' && reintentoOrOpts !== null) {
        reintento = reintentoOrOpts.reintento;
        escala = reintentoOrOpts.escala;
        if (reintentoOrOpts.claveIntentos) claveIntentos = reintentoOrOpts.claveIntentos;
        if (reintentoOrOpts.motivoEscalado) motivoEscalado = reintentoOrOpts.motivoEscalado;
    } else {
        reintento = reintentoOrOpts;
        escala = null;
    }

    let datos = sesion.datos || {};
    const prev = datos[claveIntentos] ?? datos[LEGACY_I] ?? 0;
    const intentos = Number(prev) + 1;
    const nodoActual = sesion.nodo_actual_id;

    if (intentos >= 3) {
        console.log(`⚠️ Escalando ${wa} a asesor tras 3 intentos (${claveIntentos}).`);
        const msgFinal = escala || 'Te conectamos con un asesor.';
        return await escalarPorIntentosFallidos(wa, sesion, msgFinal, motivoEscalado);
    }

    const datosNext = { ...datos, [claveIntentos]: intentos };
    delete datosNext[LEGACY_I];
    await guardarSesion(wa, nodoActual, datosNext);
    await guardarEnHistorial(wa, 'bot', reintento);
    return {
        text: `${reintento}\n\n_Escribe *0* para volver al menú principal._`
    };
}

async function escalarPorIntentosFallidos(wa, sesion, mensajeUsuario, motivoRegistro) {
    try {
        await db.query(
            'INSERT INTO escalados (cliente_whatsapp, motivo, estatus) VALUES (?, ?, "pendiente")',
            [wa, (motivoRegistro || '').substring(0, 400)]
        );
    } catch {}
    
    const enHorario = await estaEnHorario();
    const cfg = await getConfigHorario();

    // ✅ Notificar por WhatsApp a los números configurados
    await notificarNuevoAsesor(wa, motivoRegistro).catch(() => {});
    await guardarSesion(wa, null, estadoTrasEscalado(sesion.datos));

    let avisoHorario = '🧑‍💼 *Conectando con un asesor SICAMET…*\nUn representante se pondrá en contacto contigo pronto.';
    if (!enHorario) {
        avisoHorario = `⏰ *Fuera de Horario Laboral*\nHemos registrado tu solicitud. Un asesor se pondrá en contacto contigo al iniciar el turno laboral (${cfg.horario_inicio || '08:00'} - ${cfg.horario_fin || '18:00'} hrs). 🙏`;
    }

    const texto = `${mensajeUsuario}\n\n${avisoHorario}\n\n_Escribe *0* para el menú principal._`;
    await guardarEnHistorial(wa, 'bot', texto);
    return { text: texto };
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

function normalizaRazonNombre(s) {
    return (s || '').toString().trim().replace(/\s+/g, ' ').toUpperCase();
}

/**
 * Comprueba si la orden pertenece a la razón social de la sesión.
 * Nunca considera coincidencia con campos vacíos (evita .includes('') === true en JS).
 */
function ordenPerteneceARazonSocial(nombreEmpresaSesion, inst) {
    const razon = normalizaRazonNombre(nombreEmpresaSesion);
    if (razon.length < 2) return false;
    const camposRaw = [inst.cliente, inst.empresa, inst.persona];
    const campos = [...new Set(camposRaw.map(normalizaRazonNombre).filter(c => c.length >= 2))];
    if (campos.length === 0) return false;
    for (const c of campos) {
        if (razon === c) return true;
        const corto = razon.length <= c.length ? razon : c;
        const largo = razon.length <= c.length ? c : razon;
        if (corto.length >= 6 && largo.includes(corto)) return true;
    }
    return false;
}

/** Filtra y devuelve los nodos que deben mostrarse según el estado del cliente. */
async function getNodosVisibles(datos) {
    const nodosAll = await getTodosNodos();
    const d = datos || {};
    const esCliente = !!d.nombre_empresa;
    
    // Acciones que requieren ser cliente identificado
    const accionesSoloCliente = ['consultar_estatus', 'consultar_certificado', 'registrar_equipo'];
    
    return nodosAll.filter((n) => {
        // Ocultar sub-menús del menú principal
        if (['calificacion', 'verificentro', 'ventas'].includes(n.accion)) return false;

        // Ocultar identificación si ya es cliente
        if (n.accion === 'identificar_cliente' && esCliente) return false;
        
        // Ocultar opciones de cliente si no está identificado
        if (accionesSoloCliente.includes(n.accion) && !esCliente) return false;
        
        return true;
    });
}

/** Nombres visibles del menú. */
async function obtenerEtiquetasMenuVisibles(datos) {
    const visibles = await getNodosVisibles(datos);
    return visibles.map(n => n.nombre);
}

function distanciaLevenshtein(a, b) {
    const m = a.length;
    const n = b.length;
    if (!m) return n;
    if (!n) return m;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const c = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + c);
        }
    }
    return dp[m][n];
}

function scoreTextoVsEtiquetaMenu(textoUsuario, etiquetaNodo) {
    const nu = normalizarTexto(textoUsuario);
    const ne = normalizarTexto(etiquetaNodo);
    if (!nu || !ne) return 0;
    if (nu === ne) return 1;
    if (nu.includes(ne) || ne.includes(nu)) return 0.93;
    const palEt = ne.split(' ').filter(w => w.length > 2);
    for (const w of palEt) {
        if (nu.includes(w)) return 0.9;
        for (const part of nu.split(' ')) {
            if (part.length < 4 || w.length < 4) continue;
            const d = distanciaLevenshtein(part, w);
            const mx = Math.max(part.length, w.length);
            if (d <= 2 && d / mx <= 0.38) return 0.88;
        }
    }
    const d = distanciaLevenshtein(nu, ne);
    const mx = Math.max(nu.length, ne.length) || 1;
    if (mx >= 6 && d / mx <= 0.36) return 0.82;
    return 0;
}

/** Devuelve el nodo si el texto del usuario coincide con un ítem visible. */
async function resolverOpcionMenuPorTexto(textoCrudo, datos) {
    const visibles = await getNodosVisibles(datos);
    let mejorNodo = null;
    let mejorScore = 0;

    visibles.forEach(n => {
        const sc = scoreTextoVsEtiquetaMenu(textoCrudo, n.nombre || '');
        if (sc > mejorScore) {
            mejorScore = sc;
            mejorNodo = n;
        }
    });

    if (mejorScore >= 0.82) return mejorNodo;
    return null;
}

/** Líneas *1️⃣* … del menú numeradas secuencialmente del 1 al N. */
async function construirTextoOpcionesMenu(datos) {
    const visibles = await getNodosVisibles(datos);
    let texto = '';
    visibles.forEach((n, i) => {
        const idx = i + 1;
        const emoji = idx <= 9 ? `${idx}️⃣` : `${idx}.`;
        texto += `\n*${emoji}* ${n.nombre}`;
    });
    return texto;
}

// ─── MENÚ RAÍZ (BIENVENIDA) ──────────────────────────────────────────────────

async function responderMenuPrincipal(wa, sesion) {
    try {
        const cfg = await getConfigHorario();
        const enHorario = await estaEnHorario();
        const datos = sesion?.datos || {};
        const esCliente = !!datos.nombre_empresa;
        
        // Determinar saludo
        let msgBase = cfg.mensaje_bienvenida || '👋 ¡Hola! Soy el asistente virtual de *SICAMET*.';
        if (esCliente) {
            msgBase = `🌟 ¡Hola de nuevo, colaborador de *${datos.nombre_empresa}*! 👋\n\n¿En qué te podemos ayudar hoy?`;
        }

        let texto = '';
        
        // Agregar nota de horario si está fuera de rango
        if (!enHorario && cfg.modo_fuera_horario !== 'silent') {
            texto += `⏰ *Nota:* Estamos fuera de horario laboral (${cfg.horario_inicio || '08:00'} - ${cfg.horario_fin || '18:00'}). Puedes usar mis funciones automáticas y mañana te contactará un asesor si lo requieres.\n\n`;
        }

        texto += msgBase + '\n';
        texto += await construirTextoOpcionesMenu(datos);

        texto += '\n\n_Escribe el número de tu opción, cuéntame en qué me necesitas, o escribe *Finalizar* para terminar el chat._';

        await guardarEnHistorial(wa, 'bot', texto);
        return { text: texto };
    } catch (e) {
        console.error('Error responderMenuPrincipal:', e.message);
        return { text: '👋 ¡Hola! ¿En qué te puedo ayudar hoy?\n\n_Escribe tu consulta para que podamos ayudarte._' };
    }
}

// ─── RESPONDER NODO ──────────────────────────────────────────────────────────

async function responderNodo(wa, id, sesion) {
    const nodo = await getNodo(id);
    if (!nodo) {
        const datosMenu = estadoTrasEscalado(sesion.datos);
        await guardarSesion(wa, null, datosMenu);
        return await responderMenuPrincipal(wa, { ...sesion, datos: datosMenu });
    }

    // ====== INTERCEPTAR NODO DE REGISTRO DE EQUIPOS SI YA ESTÁ IDENTIFICADO ======
    if (nodo.accion === 'registrar_equipo' && sesion.datos && sesion.datos.nombre_empresa) {
        await guardarSesion(wa, id, { ...sesion.datos, paso: 2, empresa: sesion.datos.nombre_empresa });
        const texto = `📅 *Registro de Instrumentos*\n✅ Empresa confirmada: *${sesion.datos.nombre_empresa}*\n\n¿Cuál es el nombre del instrumento?\n\n_Ej: Termómetro digital, Manómetro Bourdon, Balanza analítica_\n\n_Escribe *0* para menú o *Finalizar* para salir._`;
        await guardarEnHistorial(wa, 'bot', texto);
        return { text: texto };
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

    texto += '\n\n_Escribe *0* para volver al menú principal, o *Finalizar* para salir._';

    await guardarEnHistorial(wa, 'bot', texto);
    return { text: texto, mediaUrl: nodo.media_url || null, mediaTipo: nodo.media_tipo || null };
}

// ─── PROCESADOR PRINCIPAL ────────────────────────────────────────────────────

async function procesarMensaje(wa, texto, detectarIntencion, respuestaIA, nrReal) {
    console.log(`🤖 Bot procesando mensaje de [${wa}] | Texto: "${texto}"`);
    const textoLower = texto.toLowerCase().trim();
    const sesion = await getSesion(wa);
    sesion.numeroUserReal = nrReal;
    await guardarEnHistorial(wa, 'user', texto);

    // Verificar horario — si está fuera y modo=silent, no respond
    const enHorario = await estaEnHorario();
    const cfg = await getConfigHorario();

    if (!enHorario && cfg.modo_fuera_horario === 'silent') return null;

    // El bot es 24/7: No bloqueamos la ejecución aquí, solo informamos en el menú o escalados.

    // ── Comandos especiales de navegación ────────────────────────────────────
    if (textoLower === 'reiniciar') {
        await guardarSesion(wa, null, {});
        return await responderMenuPrincipal(wa, { ...sesion, datos: {}, nodo_actual_id: null });
    }
    if (['finalizar', 'salir', 'cerrar', 'terminar', 'adios', 'adiós', 'bye'].includes(textoLower)) {
        await guardarSesion(wa, null, {});
        const txt = 'Has finalizado la conversación. Ha sido un placer atenderte en SICAMET. ¡Vuelve pronto! 👋';
        await guardarEnHistorial(wa, 'bot', txt);
        return { text: txt };
    }
    if (['0', 'menu', 'inicio', 'hola', 'hi', 'buenas', 'buenos dias', 'buenas tardes', 'buenas noches'].includes(textoLower)) {
        const datosMenu = estadoTrasEscalado(sesion.datos);
        await guardarSesion(wa, null, datosMenu);
        return await responderMenuPrincipal(wa, { ...sesion, datos: datosMenu, nodo_actual_id: null });
    }

    // ── Estado de sesión ──────────────────────────────────────────────────────
    const nodoActualId = sesion.nodo_actual_id || null;
    let nodoActual = nodoActualId ? await getNodo(nodoActualId) : null;

    // Si el nodo fue borrado o ya no existe, volver al menú
    if (nodoActualId && !nodoActual) {
        const datosMenu = estadoTrasEscalado(sesion.datos);
        await guardarSesion(wa, null, datosMenu);
        return await responderMenuPrincipal(wa, { ...sesion, datos: datosMenu, nodo_actual_id: null });
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
    const visibles = await getNodosVisibles(sesion.datos);

    // 1. Selección numérica secuencial
    const num = parseInt(textoLower);
    if (!isNaN(num) && num >= 1 && num <= visibles.length) {
        const destino = visibles[num - 1];
        const d0 = estadoTrasEscalado(sesion.datos || {});
        // Si el usuario ya es cliente pero somehow elige una opción que requiere identificación (seguridad extra)
        // Pero getNodosVisibles ya se encarga de esto.
        
        await guardarSesion(wa, destino.id, d0);
        return await responderNodo(wa, destino.id, await getSesion(wa));
    }

    // 1b. Resolución por texto descriptivo
    const nodoPorTexto = await resolverOpcionMenuPorTexto(texto, sesion.datos || {});
    if (nodoPorTexto) {
        const d0 = estadoTrasEscalado(sesion.datos || {});
        await guardarSesion(wa, nodoPorTexto.id, d0);
        return await responderNodo(wa, nodoPorTexto.id, await getSesion(wa));
    }

    // 1c. Biblioteca FAQ antes que intenciones (evita que "costo/costo" abra cotización en lugar de la FAQ de precios)
    try {
        const faqDirecta = await buscarEnFAQ(texto);
        if (faqDirecta && String(faqDirecta).trim().length > 0) {
            await guardarEnHistorial(wa, 'bot', String(faqDirecta));
            const dOk = estadoTrasEscalado(sesion.datos || {});
            await guardarSesion(wa, null, dOk);
            const sugerencia = '\n\n¿Puedo ayudarte en algo más? Escribe el número de una opción:' + await construirTextoOpcionesMenu(dOk);
            return { text: String(faqDirecta) + sugerencia };
        }
    } catch (e) {
        console.error('FAQ menú raíz:', e.message);
    }

    // 1d. Número de orden/cotización desde el menú (evita que la IA o COTIZACION capturen "C26-0411")
    const tmOrd = texto.trim();
    if (pareceNumeroOrden(tmOrd)) {
        return await consultarEstatusLogic(wa, tmOrd, sesion);
    }

    // 2. Detección de intención
    const { accion, metodo } = await detectarIntencion(texto);

    // Saludos → menú
    if (['SALUDO'].includes(accion)) {
        return await responderMenuPrincipal(wa, sesion);
    }

    // Mapa de intención a nodo (por accion guardada en bot_nodos)
    const nodos = await getTodosNodos();
    const accionANodo = await mapearAccionANodo(accion, nodos);
    if (accionANodo) {
        const d0 = estadoTrasEscalado(sesion.datos || {});
        await guardarSesion(wa, accionANodo.id, d0);
        return await responderNodo(wa, accionANodo.id, await getSesion(wa));
    }

    // 3. FAQ / fallback (después de menú por texto e intención; no pisar opciones del menú)
    try {
        const perfilStr = JSON.stringify(sesion.datos || {});
        const etiquetasMenu = await obtenerEtiquetasMenuVisibles(sesion.datos || {});
        const resp = await respuestaIA(
            texto,
            `Ubicación en el bot: Menú Principal.\nDatos de Sesión: ${perfilStr}`,
            wa,
            { etiquetasMenu, omitirFAQ: true }
        );

        if (resp && resp.length > 10 && !resp.includes('No entendí') && !resp.includes('disculpa')) {
            await guardarEnHistorial(wa, 'bot', resp);
            const dOk = estadoTrasEscalado(sesion.datos || {});
            await guardarSesion(wa, null, dOk);
            const sugerencia = '\n\n¿Puedo ayudarte en algo más? Escribe el número de una opción:' + await construirTextoOpcionesMenu(dOk);
            return { text: resp + sugerencia };
        }
    } catch (e) {
        console.error('Error IA en menú raíz:', e);
    }

    // 4. Fallo: No entendido -> Strike. Registramos para que admin lo apruebe como FAQ.
    try {
        const { registrarMensajeNoEntendido } = require('./aprendizaje_bot');
        registrarMensajeNoEntendido(texto, 'menu_principal');
    } catch (_) {}
    return await manejarFalloIntento(wa, sesion, {
        reintento: 'No entendí tu opción. Por favor escribe el número de una de las opciones del menú.',
        escala: 'Te conectamos con un asesor.',
        claveIntentos: I_MENU,
        motivoEscalado: 'Menú principal: 3 opciones no reconocidas'
    });
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
                const dRedir = estadoTrasEscalado(sesion.datos);
                await guardarSesion(wa, accionANodo.id, dRedir);
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

    // 3. Nodo tipo MENSAJE (informativo) — FAQ primero, luego intención / IA
    if (nodoActual.tipo === 'mensaje') {
        try {
            const faqNodo = await buscarEnFAQ(texto);
            if (faqNodo && String(faqNodo).trim().length > 0) {
                await guardarEnHistorial(wa, 'bot', String(faqNodo));
                return { text: `${String(faqNodo)}\n\n_Escribe *0* para volver al menú principal._` };
            }
        } catch (e) {
            console.error('FAQ nodo mensaje:', e.message);
        }

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
            const etiquetasMenu = await obtenerEtiquetasMenuVisibles(sesion.datos || {});
            const resp = await respuestaIA(texto, `${contextoNodo}\nDatos perfil cliente: ${pw}`, wa, { etiquetasMenu, omitirFAQ: true });
            if (!resp) {
                return { text: `${nodoActual.mensaje}\n\n_Para navegar escribe una opción del menú (número o nombre) o *0* para salir._` };
            }
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
    const accionMap = {
        'COTIZACION': 'cotizacion',
        'CALIFICACION': 'calificacion',
        'VERIFICENTRO': 'verificentro',
        'VENTAS': 'ventas',
        'ESTATUS': 'consultar_estatus',
        'RECORDATORIO': 'registrar_equipo',
        'ESCALAR': 'escalar',
        'SERVICIOS': 'servicios',
        'CONTACTO': 'contacto',
        'NORMATIVO': null,
    };

    if (!(accion in accionMap)) return null;

    const accionBD = accionMap[accion];
    if (accionBD) {
        return nodos.find(n => n.accion === accionBD) || null;
    }

    const nombreMap = { 'SERVICIOS': 'Servicios', 'CONTACTO': 'Contacto', 'NORMATIVO': 'Servicios' };
    const nombreBuscar = nombreMap[accion];
    if (nombreBuscar) {
        return nodos.find(n => n.nombre.toLowerCase().includes(nombreBuscar.toLowerCase())) || null;
    }

    return null;
}

// ─── ACCIONES ESPECIALES ──────────────────────────────────────────────────────

async function ejecutarAccionEspecial(wa, texto, nodo, sesion) {
    if (nodo.accion === 'identificar_cliente') return await identificarClienteLogic(wa, texto, sesion);
    if (nodo.accion === 'consultar_estatus') return await consultarEstatusLogic(wa, texto, sesion);
    if (nodo.accion === 'consultar_certificado') return await consultarCertificadoLogic(wa, texto, sesion);
    if (nodo.accion === 'cotizacion') return await flujosCotizacionLogic(wa, texto, sesion);
    if (nodo.accion === 'calificacion') return await flujosCalificacionLogic(wa, texto, sesion);
    if (nodo.accion === 'verificentro') return await flujosVerificentroLogic(wa, texto, sesion);
    if (nodo.accion === 'ventas') return await flujosVentasLogic(wa, texto, sesion);
    if (nodo.accion === 'registrar_equipo') return await flujosRegistroEquipoLogic(wa, texto, sesion);
    if (nodo.accion === 'escalar') return await escalarAHumanoLogic(wa, texto);
    if (nodo.accion === 'feedback') return await feedbackLogic(wa, texto, sesion);
    return null;
}

// ─── FLUJO IDENTIFICACIÓN DE CLIENTE ──────────────────────────────────────────

async function identificarClienteLogic(wa, texto, sesion) {
    const datos = sesion.datos || {};
    const empresaInput = texto.trim().toUpperCase();

    // Comandos de salida rápida
    if (empresaInput === '0' || empresaInput === 'MENU') {
        const nuevosDatos = datosSinContadoresIntento(datos);
        await guardarSesion(wa, null, nuevosDatos);
        return await responderMenuPrincipal(wa, { ...sesion, datos: nuevosDatos });
    }

    // 1. Buscar en BD (cat_clientes)
    const [clientes] = await db.query(
        'SELECT * FROM cat_clientes WHERE UPPER(nombre) = ? OR UPPER(nombre) LIKE ?',
        [empresaInput, `%${empresaInput}%`]
    );

    if (clientes.length > 0) {
        const c = clientes[0];
        const tieneEmail = c.email && c.email !== '—' && c.email.includes('@');
        const tieneTel = c.contacto && c.contacto !== '—' && (c.contacto.length > 5);
        
        const numLimpio = wa.split('@')[0].replace(/[^\d]/g, '');
        await db.query(
            'UPDATE whatsapp_chats SET nombre_contacto = ? WHERE numero_wa = ?',
            [c.nombre, numLimpio]
        ).catch(() => {});

        let msg = `🌟 *¡Bienvenido de nuevo!*\n\nEs un gusto saludarte, colaborador de *${c.nombre}*.\n\nConfirmamos tus datos registrados en SICAMET:\n`;
        if (tieneTel) msg += `📞 *Teléfono:* ${c.contacto}\n`;
        if (tieneEmail) msg += `📧 *Email:* ${c.email}\n`;
        if (!tieneTel && !tieneEmail) msg += `_(Solo tenemos registrado tu nombre de empresa)_\n`;

        const nuevosDatosExito = { nombre_empresa: c.nombre, cliente_id: c.id };
        msg += '\n\n¿En qué podemos apoyarte hoy?';
        msg += await construirTextoOpcionesMenu(nuevosDatosExito);
        msg += '\n\n_Escribe el número de tu opción o cuéntame en qué te puedo ayudar._';

        await guardarSesion(wa, null, nuevosDatosExito);
        await guardarEnHistorial(wa, 'bot', msg);
        return { text: msg };
    }

    return await manejarFalloIntento(wa, sesion, {
        reintento: 'No encontramos esa razón social. Verifica e intenta de nuevo.',
        escala: 'No pudimos identificarte. Te conectamos con un asesor.',
        claveIntentos: I_ID,
        motivoEscalado: 'Identificación: 3 intentos sin coincidencia en cat_clientes'
    });
}

// ─── FLUJO COTIZACIÓN ────────────────────────────────────────────────────────

const TIPOS_EQUIPO = {
    '1': '🌡️ Temperatura', '2': '🔩 Presión', '3': '⚖️ Masa / Fuerza',
    '4': '⚡ Eléctrica', '5': '📏 Dimensional', '6': '💧 Humedad / Flujo / Volumen', '7': '🔬 Otro'
};

const TIEMPOS_ENTREGA = {
    '1': '5 días hábiles ⚡ (urgente)',
    '2': '10 días hábiles (estándar)'
};

function interpretarOtroOFinalizarCotizacion(texto) {
    const t = normalizarTexto(texto);
    if (!t) return null;
    const tr = texto.trim();
    if (tr === '1' || /^1\b/.test(tr)) return 'otro';
    if (tr === '2' || /^2\b/.test(tr)) return 'final';
    const finales = ['finalizar', 'final', 'listo', 'enviar', 'terminar', 'termino', 'terminó', 'no', 'no gracias', 'eso es todo', 'enviar solicitud'];
    if (finales.some(k => t === k || t.startsWith(k + ' ') || (k.length >= 5 && t.includes(k)))) return 'final';
    const otros = ['si', 'sí', 'sip', 'claro', 'añadir', 'agregar', 'añade', 'otro', 'mas', 'más', 'uno mas', 'uno más', 'otro instrumento'];
    if (otros.some(k => t === k || t.startsWith(k + ' ') || (k.length >= 3 && t.includes(k)))) return 'otro';
    return null;
}

/** Mapea texto libre o número a clave '1' o '2' de TIEMPOS_ENTREGA. */
function interpretarOpcionTiempoEntrega(texto) {
    const raw = texto.trim();
    if (TIEMPOS_ENTREGA[raw]) return raw;
    const t = normalizarTexto(texto);
    const soloDig = raw.replace(/\D/g, '');
    if (soloDig === '1' || soloDig === '5') return '1';
    if (soloDig === '2' || soloDig === '10') return '2';
    if (t === '5' || t === 'cinco' || t === 'urgente' || (t.includes('5') && t.includes('dia'))) return '1';
    if (t === '10' || t === 'diez' || /\b10\b/.test(t) || t.includes('estandar') || t.includes('normal')) return '2';
    return null;
}

async function flujosCotizacionLogic(wa, texto, sesion) {
    const datos = sesion.datos || {};
    const subcotizacion = datos.subcotizacion || null;
    const paso = datos.paso || 0;
    const items = datos.items || [];
    const currentItem = datos.currentItem || {};

    const textoTrim = texto.trim();
    const textoLower = textoTrim.toLowerCase();

    // Paso 0: Submenú de tipo de cotización
    if (paso === 0 && !subcotizacion) {
        const opcion = textoTrim;
        if (opcion === '1' || textoLower.includes('calibracion') || textoLower.includes('calibración')) {
            await guardarSesion(wa, sesion.nodo_actual_id, { ...datos, subcotizacion: 'calibracion', paso: 1 });
            return {
                text: `🔬 *Cotización de Calibración*\n\n¿Qué tipo de equipo o instrumento deseas calibrar?\n\n` +
                    Object.entries(TIPOS_EQUIPO).map(([k, v]) => `*${k}️⃣* ${v}`).join('\n') +
                    `\n\n_O escribe directamente la descripción del equipo. Ej: Termómetro digital Fluke 52._`
            };
        }
        if (opcion === '2' || textoLower.includes('calificacion') || textoLower.includes('calificación')) {
            // Redirigir al flujo de calificación
            const nodos = await getTodosNodos();
            const nodoCalif = nodos.find(n => n.accion === 'calificacion');
            if (nodoCalif) {
                await guardarSesion(wa, nodoCalif.id, {});
                return await responderNodo(wa, nodoCalif.id, await getSesion(wa));
            }
            // Si no existe el nodo, ejecutar directamente
            await guardarSesion(wa, sesion.nodo_actual_id, { subcotizacion: 'calificacion', paso: 1 });
            return await flujosCalificacionLogic(wa, 'inicio', { ...sesion, datos: { subcotizacion: 'calificacion', paso: 1 } });
        }
        if (opcion === '3' || textoLower.includes('verificentro')) {
            const nodos = await getTodosNodos();
            const nodoVerif = nodos.find(n => n.accion === 'verificentro');
            if (nodoVerif) {
                await guardarSesion(wa, nodoVerif.id, {});
                return await responderNodo(wa, nodoVerif.id, await getSesion(wa));
            }
            await guardarSesion(wa, sesion.nodo_actual_id, { subcotizacion: 'verificentro', paso: 1 });
            return await flujosVerificentroLogic(wa, 'inicio', { ...sesion, datos: { subcotizacion: 'verificentro', paso: 1 } });
        }
        // Ventas: solo dispara con palabras explícitas (comprar, vender, adquirir, ventas).
        // "instrumento" es demasiado genérica y choca con "calibración de instrumentos".
        const palabrasVenta = ['ventas', 'venta', 'comprar', 'compra', 'vender', 'adquirir', 'cotizar instrumento', 'precio de instrumento'];
        if (opcion === '4' || palabrasVenta.some(p => textoLower.includes(p))) {
            const nodos = await getTodosNodos();
            const nodoVentas = nodos.find(n => n.accion === 'ventas');
            if (nodoVentas) {
                await guardarSesion(wa, nodoVentas.id, {});
                return await responderNodo(wa, nodoVentas.id, await getSesion(wa));
            }
        }
        // Mostrar submenú
        await guardarSesion(wa, sesion.nodo_actual_id, { ...datos, paso: 0 });
        return {
            text: `📋 *Menú de Cotizaciones*\n\n¿Qué tipo de cotización deseas solicitar?\n\n*1️⃣* Calibración de Instrumentos\n*2️⃣* Calificación de Equipos/Áreas\n*3️⃣* Verificentro (Masa/Volumen)\n*4️⃣* Ventas de Instrumentos\n\n_Escribe el número de tu opción._`
        };
    }

    // Flujo de calibración (subcotizacion === 'calibracion' o paso >= 1 por compatibilidad)
    const pasoCalib = datos.paso || 1;
    switch (pasoCalib) {
        case 1: { // Inicio: Tipo de equipo o descripción
            // Aceptar opción 1-7 del menú aunque sea un solo dígito O por palabra clave
            const esOpcionMenu = !!TIPOS_EQUIPO[textoTrim];
            const textoNorm = normalizarTexto(textoTrim);
            // Mapeo palabra → categoría. Si el usuario escribe "temperatura" o "presion" sola,
            // la tratamos como elección del menú y pedimos el tipo específico (case 12).
            const PALABRA_A_CATEGORIA = {
                temperatura: '1', termometr: '1', termopar: '1', termohigr: '1', rtd: '1',
                presion: '2', manometr: '2',
                masa: '3', balanza: '3', fuerza: '3', dinamometr: '3', peso: '3',
                electric: '4', voltaje: '4', corriente: '4', multimetr: '4', pinza: '4',
                dimensional: '5', vernier: '5', calibrador: '5', micrometr: '5',
                humedad: '6', flujo: '6', volumen: '6'
            };
            let categoriaPorPalabra = null;
            // Solo consideramos palabra-categoria si el mensaje es CORTO (1-3 palabras), para
            // evitar que "necesito calibrar un termometro Fluke 726 modelo X" caiga aquí.
            if (textoNorm.split(/\s+/).length <= 3) {
                for (const [k, v] of Object.entries(PALABRA_A_CATEGORIA)) {
                    if (textoNorm.includes(k)) { categoriaPorPalabra = v; break; }
                }
            }
            if (!textoTrim || (textoTrim.length < 2 && !esOpcionMenu)) {
                return await manejarFalloIntento(wa, sesion, {
                    reintento: MSG_COTIZ_REINTENTO,
                    escala: MSG_COTIZ_ESCALA,
                    claveIntentos: I_COTIZ,
                    motivoEscalado: 'Cotización: paso 1 — respuesta vacía o inválida'
                });
            }
            const claveCat = esOpcionMenu ? textoTrim : categoriaPorPalabra;
            if (claveCat) {
                // Eligió categoría (por número o por palabra): pedir el nombre específico
                const categoria = TIPOS_EQUIPO[claveCat];
                const updatedItem = { ...currentItem, tipoEquipo: categoria };
                await guardarSesion(wa, sesion.nodo_actual_id, limpiarIntentoCotiz({ ...datos, paso: 12, currentItem: updatedItem }));
                return {
                    text: `✅ *${categoria}*\n\n¿Qué *tipo específico* de instrumento es?\n\n_Ej: Termómetro digital, RTD PT100, Termohigrómetro, Termopar tipo K..._`
                };
            }
            // Descripción libre extensa: la usamos como nombre del equipo, categoría queda como "Otro"
            const updatedItem = { ...currentItem, tipoEquipo: '🔬 Otro', nombreEquipo: textoTrim };
            await guardarSesion(wa, sesion.nodo_actual_id, limpiarIntentoCotiz({ ...datos, paso: 2, currentItem: updatedItem }));
            return {
                text: `✅ *${textoTrim}*\n\n¿Cuál es la *marca y modelo* del instrumento?\n\n_Ej: Fluke 726 | Vaisala HMT310 | WIKA P-30_\n_(Escribe "no sé" si no tienes el dato)_`
            };
        }
        case 12: { // Nombre específico del instrumento (cuando se eligió categoría del menú)
            if (!textoTrim || textoTrim.length < 2) {
                return await manejarFalloIntento(wa, sesion, {
                    reintento: 'Por favor indica el tipo específico del instrumento. Ej: Termómetro digital, RTD PT100, Manómetro Bourdon...',
                    escala: MSG_COTIZ_ESCALA,
                    claveIntentos: I_COTIZ,
                    motivoEscalado: 'Cotización: paso 12 — nombre del instrumento inválido'
                });
            }
            await guardarSesion(wa, sesion.nodo_actual_id, limpiarIntentoCotiz({
                ...datos,
                paso: 2,
                currentItem: { ...currentItem, nombreEquipo: textoTrim }
            }));
            return {
                text: `✅ *${textoTrim}*\n\n¿Cuál es la *marca y modelo* del instrumento?\n\n_Ej: Fluke 726 | Vaisala HMT310 | WIKA P-30_\n_(Escribe "no sé" si no tienes el dato)_`
            };
        }
        case 2: // Marca y Modelo
            if (!textoTrim) {
                return await manejarFalloIntento(wa, sesion, {
                    reintento: MSG_COTIZ_REINTENTO,
                    escala: MSG_COTIZ_ESCALA,
                    claveIntentos: I_COTIZ,
                    motivoEscalado: 'Cotización: paso 2 — dato vacío'
                });
            }
            await guardarSesion(wa, sesion.nodo_actual_id, limpiarIntentoCotiz({
                ...datos,
                paso: 3,
                currentItem: { ...currentItem, marcaModelo: textoTrim }
            }));
            return { text: `✅ *${textoTrim}*\n\n¿Cuál es la *Identificación / ID / Tag* del equipo?\n\n_Ej: LQ-M06, Caldera-01, etc._` };

        case 3: // ID / Tag
            if (!textoTrim) {
                return await manejarFalloIntento(wa, sesion, {
                    reintento: MSG_COTIZ_REINTENTO,
                    escala: MSG_COTIZ_ESCALA,
                    claveIntentos: I_COTIZ,
                    motivoEscalado: 'Cotización: paso 3 — dato vacío'
                });
            }
            await guardarSesion(wa, sesion.nodo_actual_id, limpiarIntentoCotiz({
                ...datos,
                paso: 4,
                currentItem: { ...currentItem, identificacion: textoTrim }
            }));
            return { text: `✅ *ID: ${textoTrim}*\n\n¿En qué *ubicación* se encuentra físicamente?\n\n_Ej: Etiquetadora LQ-09, Almacén, Planta 2..._` };

        case 4: // Ubicación
            if (!textoTrim) {
                return await manejarFalloIntento(wa, sesion, {
                    reintento: MSG_COTIZ_REINTENTO,
                    escala: MSG_COTIZ_ESCALA,
                    claveIntentos: I_COTIZ,
                    motivoEscalado: 'Cotización: paso 4 — dato vacío'
                });
            }
            await guardarSesion(wa, sesion.nodo_actual_id, limpiarIntentoCotiz({
                ...datos,
                paso: 5,
                currentItem: { ...currentItem, ubicacion: textoTrim }
            }));
            return { text: `✅ *Ubicación: ${textoTrim}*\n\n¿Tienes *requerimientos especiales* para este equipo? (Puntos específicos, rango, acreditación especial, etc.)\n\n_Escribe "ninguno" para continuar_` };

        case 5: // Requerimientos y ¿Añadir otro?
            if (!textoTrim && textoLower !== 'ninguno' && textoLower !== 'ninguna') {
                return await manejarFalloIntento(wa, sesion, {
                    reintento: MSG_COTIZ_REINTENTO,
                    escala: MSG_COTIZ_ESCALA,
                    claveIntentos: I_COTIZ,
                    motivoEscalado: 'Cotización: paso 5 — respuesta vacía'
                });
            }
            const notas = (textoLower === 'ninguno' || textoLower === 'ninguna') ? '' : textoTrim;
            const itemFinalizado = { ...currentItem, requerimientos: notas };
            const nuevosItems = [...items, itemFinalizado];

            await guardarSesion(wa, sesion.nodo_actual_id, limpiarIntentoCotiz({
                ...datos,
                paso: 6,
                items: nuevosItems,
                currentItem: {}
            }));

            return {
                text: `📦 *Instrumento registrado (${nuevosItems.length})*\n\n¿Deseas agregar *otro instrumento* a esta misma cotización?\n\n*1️⃣* Sí, añadir otro\n*2️⃣* No, finalizar y enviar solicitud`
            };

        case 6: { // Lógica de bucle o pasar a generales
            const dec = interpretarOtroOFinalizarCotizacion(texto);
            if (dec === 'otro') {
                await guardarSesion(wa, sesion.nodo_actual_id, limpiarIntentoCotiz({ ...datos, paso: 1, currentItem: {} }));
                return {
                    text: `✍️ *Registro de instrumento #${items.length + 1}*\n\nDime qué equipo es o elige una categoría:\n\n` +
                        Object.entries(TIPOS_EQUIPO).map(([k, v]) => `*${k}️⃣* ${v}`).join('\n')
                };
            }
            if (dec === 'final') {
                await guardarSesion(wa, sesion.nodo_actual_id, limpiarIntentoCotiz({ ...datos, paso: 7 }));
                return {
                    text: `⏳ *Tiempo de entrega:*\n\n¿Cuándo necesitas tu(s) equipo(s)?\n\n*1️⃣* 5 días hábiles ⚡ _(urgente, tiene costo adicional)_\n*2️⃣* 10 días hábiles _(tiempo estándar)_\n\n_Escribe *1* o *2*._`
                };
            }
            return await manejarFalloIntento(wa, sesion, {
                reintento: `${MSG_COTIZ_REINTENTO}\n\n_Elige *1* para añadir otro instrumento o *2* para finalizar._`,
                escala: MSG_COTIZ_ESCALA,
                claveIntentos: I_COTIZ,
                motivoEscalado: 'Cotización: paso 6 — opción no reconocida'
            });
        }

        case 7: { // Tiempo de entrega
            const claveT = interpretarOpcionTiempoEntrega(texto);
            if (!claveT || !TIEMPOS_ENTREGA[claveT]) {
                return await manejarFalloIntento(wa, sesion, {
                    reintento: `${MSG_COTIZ_REINTENTO}\n\n_Escribe *1* para 5 días hábiles (urgente) o *2* para 10 días hábiles (estándar)._`,
                    escala: MSG_COTIZ_ESCALA,
                    claveIntentos: I_COTIZ,
                    motivoEscalado: 'Cotización: paso 7 — tiempo de entrega no reconocido'
                });
            }
            const tiempo = TIEMPOS_ENTREGA[claveT];
            const esClienteId = !!(datos.nombre_empresa || datos.cliente_id);
            if (esClienteId) {
                await guardarSesion(wa, sesion.nodo_actual_id, limpiarIntentoCotiz({ ...datos, paso: 9, tiempoEntrega: tiempo, empresa: datos.nombre_empresa }));
                const numWa = wa.split('@')[0].replace(/\D/g, '');
                return { text: `✅ *${tiempo}*\n\nTu cotización es para *${datos.nombre_empresa}*.\n\n¿Deseas que te contactemos al *${numWa}* o tienes otro número? Escribe el número (10 dígitos) o escribe *mismo* para usar el número actual.` };
            }
            await guardarSesion(wa, sesion.nodo_actual_id, limpiarIntentoCotiz({ ...datos, paso: 8, tiempoEntrega: tiempo }));
            return { text: `✅ *${tiempo}*\n\n¿Cuál es el nombre de tu *empresa* o razón social?` };
        }

        case 8: { // Razón social (solo si no está identificado)
            if (!textoTrim || textoTrim.length < 2) {
                return await manejarFalloIntento(wa, sesion, {
                    reintento: MSG_COTIZ_REINTENTO,
                    escala: MSG_COTIZ_ESCALA,
                    claveIntentos: I_COTIZ,
                    motivoEscalado: 'Cotización: paso 8 — razón social inválida'
                });
            }
            await guardarSesion(wa, sesion.nodo_actual_id, limpiarIntentoCotiz({ ...datos, paso: 9, empresa: textoTrim }));
            return { text: `✅ *${textoTrim}*\n\n¿Cuál es tu número de teléfono de contacto? (10 dígitos)\n\n_Ej: 7221234567_` };
        }

        case 9: { // Teléfono y Guardado Final
            const numWa = wa.split('@')[0].replace(/\D/g, '');
            let telefono = textoTrim.toLowerCase() === 'mismo' ? numWa : textoTrim.replace(/\D/g, '');
            if (telefono.length < 7) {
                return await manejarFalloIntento(wa, sesion, {
                    reintento: 'Número inválido. Por favor escribe tu teléfono de 10 dígitos o escribe *mismo* para usar este número.',
                    escala: MSG_COTIZ_ESCALA,
                    claveIntentos: I_COTIZ,
                    motivoEscalado: 'Cotización: paso 9 — teléfono inválido'
                });
            }
            const empresa = datos.empresa || datos.nombre_empresa || '';
            const dFinal = { ...datos, empresa, telefono, items };
            try {
                const primer = items[0] || {};
                await db.query(
                    'INSERT INTO cotizaciones_bot (cliente_whatsapp, nombre_empresa, tipo_equipo, marca, cantidad, tiempo_entrega, detalle_instrumentos, estatus) VALUES (?,?,?,?,?,?,?,?)',
                    [wa, empresa, primer.tipoEquipo || 'Múltiples', primer.marcaModelo || 'Varios', items.length, dFinal.tiempoEntrega, JSON.stringify(items), 'nueva']
                );
                if (global.io) {
                    global.io.emit('nueva_cotizacion', { empresa, cantidad: items.length });
                }
                await notificarNuevaCotizacion(dFinal);
                await guardarSesion(wa, null, estadoTrasEscalado(sesion.datos));
                let resumen = `🎉 *¡Solicitud de Calibración registrada!*\n\n📋 *Resumen:*\n• Empresa: *${empresa}*\n• Teléfono: *${telefono}*\n• Ít. equipos: *${items.length}*\n• Entrega: *${dFinal.tiempoEntrega}*\n\nListado:`;
                items.forEach((it, i) => {
                    const nombre = it.nombreEquipo ? ` — ${it.nombreEquipo}` : '';
                    resumen += `\n${i+1}. ${it.tipoEquipo}${nombre} (${it.marcaModelo || 'S/M'})`;
                });
                resumen += `\n\nEn breve un especialista SICAMET se pondrá en contacto. ¡Gracias! 📧\n\n_Escribe *0* para volver al menú._`;
                return { text: resumen };
            } catch (err) {
                console.error('Error al guardar cotización:', err);
                return { text: '❌ Hubo un error al guardar tu solicitud. Por favor intenta de nuevo o contacta a un asesor.' };
            }
        }

        default:
            await guardarSesion(wa, null, estadoTrasEscalado(sesion.datos));
            return await responderMenuPrincipal(wa, { ...sesion, datos: estadoTrasEscalado(sesion.datos) });
    }
}

// ─── NOTIFICAR COTIZACIÓN (múltiples números) ─────────────────────────────────
/** Convierte numero limpio al formato JID de WhatsApp */
function numToWaJid(num) {
    const limpio = String(num).replace(/[^\d]/g, "");
    if (!limpio || limpio.length < 8) return null;
    if (String(num).includes("@")) return String(num);
    return `${limpio}@c.us`;
}

async function notificarNuevaCotizacion(d) {
    const empresa = d.empresa || "N/E";
    const tipo = d.tipoEquipo || (d.items && d.items[0] ? d.items[0].tipoEquipo : "N/E");
    const marca = d.marcaModelo || (d.items && d.items[0] ? d.items[0].marcaModelo : "N/E");
    const cantidad = d.items ? d.items.length : (d.cantidad || 1);
    const entrega = d.tiempoEntrega || "N/E";

    // Notificación in-app: independiente de que el bot WA esté conectado.
    try {
        const { emitirNotificacion } = require('./notificaciones');
        await emitirNotificacion({
            tipo: 'cotizacion_nueva',
            titulo: `Nueva cotización: ${empresa}`,
            detalle: `${cantidad} equipo(s) · ${tipo}${marca && marca !== 'N/E' ? ' · ' + marca : ''} · Entrega ${entrega}`,
            audiencia: 'rol:recepcionista',
            urgencia: 'media',
            ruta: '/flujos-whatsapp'
        });
    } catch (_) {}

    try {
        const cfg = await getConfigHorario();
        const numeros = [
            ...(cfg.notif_numeros || "").split(","),
            ...(cfg.notif_cotizacion_wa ? [cfg.notif_cotizacion_wa] : [])
        ].map(n => n.trim()).filter(n => n.replace(/\D/g, "").length >= 8);

        if (numeros.length === 0 || !global.botClient) {
            console.log("Advertencia notificarCotizacion: sin numeros WA o bot no conectado (la notif in-app sí se emitió)");
            return;
        }
        const msg = `Nueva cotizacion recibida\n\nEmpresa: *${empresa}*\nEquipo: *${tipo}*\nMarca: *${marca}*\nCantidad: *${cantidad} equipo(s)*\nEntrega: *${entrega}*\n\nRevisa el sistema CRM!`;
        for (const num of numeros) {
            const jid = numToWaJid(num);
            if (!jid) continue;
            await global.botClient.sendMessage(jid, msg).catch(e => console.warn("Error notif cotizacion a", jid, ":", e.message));
        }
    } catch(e) { console.error("Error notificarNuevaCotizacion:", e.message); }
}

async function notificarNuevoAsesor(wa, motivo, nrReal) {
    try {
        let numCliente = nrReal || wa.split("@")[0].replace(/[^\d]/g, "");
        if (numCliente.length > 15) numCliente = "Oculto por privacidad WA";

        // Notificación in-app para que recepción la vea en su campana, sin depender
        // de que el bot WhatsApp esté conectado.
        try {
            const { emitirNotificacion } = require('./notificaciones');
            emitirNotificacion({
                tipo: 'esperando_asesor',
                titulo: `Cliente esperando asesor: ${numCliente}`,
                detalle: `Motivo: ${(motivo || 'Sin especificar').substring(0, 200)}`,
                audiencia: 'rol:recepcionista',
                urgencia: 'alta',
                ruta: '/conversaciones'
            });
        } catch (_) {}

        const cfg = await getConfigHorario();
        const numeros = [
            ...(cfg.notif_numeros || "").split(","),
            ...(cfg.notif_asesor_wa ? [cfg.notif_asesor_wa] : [])
        ].map(n => n.trim()).filter(n => n.replace(/\D/g, "").length >= 8);

        if (numeros.length === 0 || !global.botClient) {
            console.log("Advertencia notificarAsesor: sin numeros o bot no conectado (la notif in-app sí se emitió)");
            return;
        }
        try {
            const contact = await global.botClient.getContactById(wa);
            if (contact && contact.number) numCliente = contact.number;
        } catch(e) {}

        const msg = `ALERTA: Cliente solicita ASESOR\n\nNumero: *${numCliente}*\nMotivo: ${(motivo || "Sin especificar").substring(0, 200)}\n\nAtiende al cliente en el CRM!`;
        for (const num of numeros) {
            let jid = numToWaJid(num);
            if (!jid) continue;
            
            // Intento principal
            let sent = false;
            try {
                await global.botClient.sendMessage(jid, msg);
                sent = true;
            } catch (e) { console.warn("Fallo envio principal a", jid); }

            // Si es de Mexico (empieza con 52) e intentó sin el 1, intentar con el 1
            if (!sent && jid.startsWith('52@') === false && jid.startsWith('52') && !jid.startsWith('521')) {
                const jidAlternativo = `521${jid.substring(2)}`;
                await global.botClient.sendMessage(jidAlternativo, msg).catch(e => console.warn("Error notif asesor alternativo", jidAlternativo, ":", e.message));
            } else if (!sent && jid.startsWith('521')) {
                const jidAlternativo = `52${jid.substring(3)}`;
                await global.botClient.sendMessage(jidAlternativo, msg).catch(e => console.warn("Error notif asesor alternativo", jidAlternativo, ":", e.message));
            }
        }
    } catch(e) { console.error("Error notificarNuevoAsesor:", e.message); }
}

// ─── FLUJO ESTATUS ────────────────────────────────────────────────────────────

/** Acepta órdenes tipo C26-04XX, OC-123, alfanuméricos con guion, etc. */
function pareceNumeroOrden(raw) {
    const t = (raw || '').trim();
    if (t.length < 3 || t.length > 48) return false;
    if (/^(OC|COT|COTI|ORDEN|ORD)[\s\-]?\d+/i.test(t)) return true;
    if (/^C\d{2}\s*[\-\s]\s*[A-Z0-9]+$/i.test(t)) return true;
    if (/^[A-Z]{1,3}\d+[\-\s]?[A-Z0-9]+$/i.test(t)) return true;
    if (/^[A-Z0-9]{2,}[\-\s][A-Z0-9]{2,}/i.test(t)) return true;
    if (/^\d+[\-\s]\d{2,}[A-Z0-9\-]*$/i.test(t)) return true;
    return false;
}

const ORDEN_ETAPAS_ESTATUS = ['Recepción', 'Laboratorio', 'Aseguramiento', 'Certificación', 'Facturación', 'Entregado'];

function normalizarEtapaEstatus(est) {
    const e = (est || '').trim();
    if (!e) return '—';
    const lower = e.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const map = {
        recepcion: 'Recepción',
        laboratorio: 'Laboratorio',
        certificacion: 'Certificación',
        facturacion: 'Facturación',
        // Compat: estatus 'Listo' anterior queda mapeado a 'Facturación'
        listo: 'Facturación',
        entregado: 'Entregado'
    };
    return map[lower] || e;
}

function formatearOrdenAgrupada(lista) {
    if (!lista?.length) return '';
    const orden = lista[0].orden_cotizacion || '—';
    const etapLabel = {
        Recepción: '📥 Recibido en SICAMET',
        Laboratorio: '🔬 En proceso de calibración',
        Aseguramiento: '🛡️ En aseguramiento de calidad',
        Certificación: '📋 Emitiendo certificado',
        Facturación: '🧾 En facturación',
        Entregado: '📦 Entregado al cliente'
    };
    const byE = {};
    for (const e of ORDEN_ETAPAS_ESTATUS) byE[e] = [];
    const otros = [];
    for (const inst of lista) {
        const rawE = (inst.estatus_actual || '').trim();
        const e = normalizarEtapaEstatus(rawE);
        if (ORDEN_ETAPAS_ESTATUS.includes(e)) byE[e].push(inst);
        else otros.push(inst);
    }
    let m = `🔍 *Estatus de la orden:* ${orden}\n📦 *Total equipos:* ${lista.length}\n\n`;
    for (const e of ORDEN_ETAPAS_ESTATUS) {
        const items = byE[e];
        if (!items.length) continue;
        const label = etapLabel[e] || e;
        m += `${label} (${items.length})\n`;
        items.forEach(it => {
            m += `  • ${it.nombre_instrumento || '—'}\n`;
        });
        m += '\n';
    }
    if (otros.length) {
        m += `*Otros estados:*\n`;
        otros.forEach(it => {
            m += `  • ${it.nombre_instrumento || '—'} → ${it.estatus_actual || '—'}\n`;
        });
        m += '\n';
    }
    m += '_¿Tienes otra orden que consultar? Escríbela directamente o escribe *0* para el menú._';
    return m;
}

async function consultarEstatusLogic(wa, texto, sesion) {
    if (!sesion) sesion = await getSesion(wa);
    const raw = texto.trim();
    const busqueda = raw.toUpperCase();
    const esOC = pareceNumeroOrden(raw);
    const nombreEmpresaSesion = (sesion.datos?.nombre_empresa || '').toUpperCase();

    if (!nombreEmpresaSesion) {
        return { text: '⚠️ *Identificación requerida*\n\nPara consultar el estatus de un equipo, primero debes identificarte en la opción *1️⃣ Soy Cliente* del menú principal.' };
    }

    if (!esOC || raw.length < 3) {
        return await manejarFalloIntento(wa, sesion, {
            reintento: 'No entendí tu respuesta. Intenta de nuevo.\n\n_Escribe tu número de orden. Ejemplo: *C26-04XX*_',
            escala: 'Parece que algo no está saliendo bien. Te conectamos con un asesor.',
            claveIntentos: I_ESTATUS,
            motivoEscalado: 'Estatus: formato de orden no reconocido (3 intentos)'
        });
    }

    const [rows] = await db.query(
        'SELECT * FROM instrumentos_estatus WHERE UPPER(orden_cotizacion) LIKE ?',
        [`%${busqueda}%`]
    );

    const propias = (rows || []).filter(r => ordenPerteneceARazonSocial(nombreEmpresaSesion, r));

    if (propias.length === 0) {
        if ((rows || []).length > 0) {
            console.log(`🚫 Privacidad estatus: ${wa} (${nombreEmpresaSesion}) consulta orden ajena`);
            return await manejarFalloIntento(wa, sesion, {
                reintento: '🔒 Por políticas de privacidad no podemos mostrar el estatus de esa orden.',
                escala: 'No pudimos validar tu consulta. Te conectamos con un asesor.',
                claveIntentos: I_ESTATUS,
                motivoEscalado: 'Estatus: intento de consulta de orden de otro cliente (3 intentos)'
            });
        }
        return await manejarFalloIntento(wa, sesion, {
            reintento: 'No encontramos ese número. Verifica e intenta de nuevo.',
            escala: 'No logramos encontrar tu orden. Te conectamos con un asesor.',
            claveIntentos: I_ESTATUS,
            motivoEscalado: 'Estatus: orden inexistente (3 intentos)'
        });
    }

    const dOk = datosSinContadoresIntento(sesion.datos || {});
    await guardarSesion(wa, sesion.nodo_actual_id, dOk);

    const porOrden = {};
    for (const p of propias) {
        const k = (p.orden_cotizacion || '').toString().trim().toUpperCase() || '—';
        if (!porOrden[k]) porOrden[k] = [];
        porOrden[k].push(p);
    }
    const keys = Object.keys(porOrden);

    if (keys.length === 1) {
        const lista = porOrden[keys[0]];
        if (lista.length === 1) {
            const el = lista[0];
            let resp = { text: formatearRespuestaEstatus(el) };
            if (el.estatus_recepcion?.toLowerCase() === 'entregado' && el.certificado_url) {
                const fullUrl = `${DOMINIO_PUBLICO}${el.certificado_url}`;
                resp.text += `\n\n📄 *Certificado Digital*\nAquí tienes tu certificado en PDF y QR. ¿Deseas consultar otro equipo?\n_Escribe *0* para el menú principal o *Finalizar*._`;
                resp.media_pdf = fullUrl;
                resp.media_image = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(fullUrl)}`;
            }
            return resp;
        }
        return { text: formatearOrdenAgrupada(lista) };
    }

    let out = '';
    keys.forEach((k, i) => {
        out += formatearOrdenAgrupada(porOrden[k]);
        if (i < keys.length - 1) out += '\n\n──────────────\n\n';
    });
    return { text: out };
}

async function consultarCertificadoLogic(wa, texto, sesion) {
    if (!sesion) sesion = await getSesion(wa);
    const raw = texto.trim();
    const busqueda = raw.toUpperCase();
    const nombreEmpresaSesion = (sesion.datos?.nombre_empresa || '').toUpperCase();

    // === VALIDACIÓN ESTRICTA DE PRIVACIDAD ===
    if (!nombreEmpresaSesion || nombreEmpresaSesion.length < 2) {
        return { text: '⚠️ *Identificación requerida*\n\nPara consultar certificados, primero debes identificarte en la opción *1️⃣ Soy Cliente* del menú principal.\n\n_Por seguridad, solo podemos mostrar certificados vinculados a tu razón social._' };
    }

    if (busqueda.length < 3) {
        return await manejarFalloIntento(wa, sesion, {
            reintento: 'Escribe el número de informe, orden (OS) o certificado que deseas consultar. Mínimo 3 caracteres.',
            escala: 'No logramos procesar tu consulta. Te conectamos con un asesor.',
            claveIntentos: I_ESTATUS
        });
    }

    // 1. ¿Es una consulta por Orden (OS)?
    const esOS = pareceNumeroOrden(raw);

    if (esOS) {
        const [rows] = await db.query(
            'SELECT * FROM instrumentos_estatus WHERE UPPER(orden_cotizacion) LIKE ?',
            [`%${busqueda}%`]
        );
        // VALIDACIÓN DE PRIVACIDAD: solo mostrar los que pertenecen a la empresa del cliente
        const propias = (rows || []).filter(r => ordenPerteneceARazonSocial(nombreEmpresaSesion, r));
        const ajenas = rows.length - propias.length;

        // Si hay resultados pero ninguno del cliente → RECHAZAR por privacidad
        if (rows.length > 0 && propias.length === 0) {
            return { text: `🔒 *Acceso Restringido*\n\nExisten registros con la orden *${busqueda}* pero *no están asociados a tu empresa* (${sesion.datos.nombre_empresa}).\n\n_Por políticas de privacidad, solo puedes consultar certificados de tu propia empresa._\n\nSi crees que esto es un error, escribe *ASESOR* para comunicarte con un humano.` };
        }

        if (propias.length === 0) {
            return await manejarFalloIntento(wa, sesion, {
                reintento: `❌ No encontramos certificados de tu empresa asociados a la orden "${busqueda}".`,
                escala: 'Te pondremos en contacto con un asesor para ayudarte.',
                claveIntentos: I_ESTATUS
            });
        }

        const listos = propias.filter(p => p.certificado_url);
        const pendientesCount = propias.length - listos.length;

        let msg = `🔍 *Certificados de la Orden:* ${busqueda}\n`;
        msg += `📦 *Total equipos de tu empresa:* ${propias.length}\n`;
        msg += `✅ *Con certificado:* ${listos.length}\n`;

        if (pendientesCount > 0) {
            msg += `⏳ *En proceso:* ${pendientesCount}\n`;
            msg += `_Estamos trabajando en tus certificados restantes. Te notificaremos cuando estén listos._\n\n`;
        } else {
            msg += `\n`;
        }

        if (listos.length === 0) {
            msg += `_Por el momento ningún equipo de esta orden tiene su certificado digital cargado._\n\n`;
            msg += `_Te enviaremos un mensaje cuando estén disponibles._`;
        } else if (listos.length === 1) {
            const l = listos[0];
            const fullUrl = `${DOMINIO_PUBLICO}${l.certificado_url}`;
            msg += `\n📄 *Tu Certificado Digital:*\n`;
            msg += `📋 Instrumento: ${l.nombre_instrumento} (Informe: ${l.numero_informe || 'N/A'})\n`;
            msg += `🔗 ${fullUrl}\n\n`;
            msg += `Aquí tienes tu certificado en PDF y QR. ¿Deseas consultar algo más?\n_Escribe *0* para el menú principal o *Finalizar*._`;
            
            // Clean up node state 
            await guardarSesion(wa, sesion.nodo_actual_id, { ...sesion.datos, modo_cert: null, os_id: null, listos_ids: null });
            
            return {
                text: msg,
                media_pdf: fullUrl,
                media_image: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(fullUrl)}`
            };
        } else {
            msg += `*¿Qué deseas hacer?*\n`;
            msg += `*1️⃣* Descargar todos los certificados listos\n`;
            msg += `*2️⃣* Ver uno específico (escribe el No. de Informe)\n\n`;
            msg += `_Si eliges *1*, te enviaré todos los enlaces directos._`;

            // Guardar en sesión que estamos en modo OS para esperar la respuesta 1 o 2 (o el informe)
            await guardarSesion(wa, sesion.nodo_actual_id, { ...sesion.datos, modo_cert: 'OS', os_id: busqueda, listos_ids: listos.map(l => l.id) });
        }
        return { text: msg };
    }

    // 2. ¿Es una respuesta a la selección de "Descargar Todos" (1) o "Específico" (2)?
    if (sesion.datos?.modo_cert === 'OS') {
        if (raw === '1') {
            const [listosRows] = await db.query(
                'SELECT * FROM instrumentos_estatus WHERE id IN (?)',
                [sesion.datos.listos_ids]
            );
            
            // Doble verificación de privacidad
            const listosPropios = listosRows.filter(r => ordenPerteneceARazonSocial(nombreEmpresaSesion, r));
            
            if (listosPropios.length === 0) {
                return { text: '⚠️ Ocurrió un error al validar los certificados. Por seguridad, contacta a un asesor.' };
            }

            let response = `📄 *Tus certificados listos (${listosPropios.length}):*\n\n`;
            listosPropios.forEach((l, i) => {
                const fullUrl = `${DOMINIO_PUBLICO}${l.certificado_url}`;
                response += `${i+1}. *${l.nombre_instrumento}*\n`;
                response += `   📋 Informe: ${l.numero_informe || 'N/A'}\n`;
                response += `   🔗 ${fullUrl}\n\n`;
            });
            response += `━━━━━━━━━━━━━━━━━━\n`;
            response += `💡 _¿Necesitas algo más?_\n`;
            response += `Escribe *0* para el menú principal.`;
            
            await guardarSesion(wa, sesion.nodo_actual_id, datosSinContadoresIntento(sesion.datos));
            
            // Enviar también los QRs si son pocos
            if (listosPropios.length <= 3) {
                return { 
                    text: response,
                    // El primer certificado envía QR y PDF
                    media_pdf: `${DOMINIO_PUBLICO}${listosPropios[0].certificado_url}`,
                    media_image: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(`${DOMINIO_PUBLICO}${listosPropios[0].certificado_url}`)}`
                };
            }
            return { text: response };
        }
        if (raw === '2') {
             return { text: '📋 Perfecto, escribe el *Número de Informe* exacto que deseas descargar.\n\n_Ejemplo: ICM.0010.26_' };
        }
    }

    // 3. Consulta por Informe Específico (Fallback o búsqueda directa)
    const [certRows] = await db.query(
        'SELECT * FROM instrumentos_estatus WHERE UPPER(numero_informe) = ? OR (UPPER(numero_informe) LIKE ? AND LENGTH(?) > 5)',
        [busqueda, `%${busqueda}%`, busqueda]
    );

    // VALIDACIÓN DE PRIVACIDAD ESTRICTA
    const matchPropio = (certRows || []).filter(r => ordenPerteneceARazonSocial(nombreEmpresaSesion, r));
    const matchAjenos = certRows.length - matchPropio.length;

    // Si existe el informe pero es de otra empresa → RECHAZAR
    if (certRows.length > 0 && matchPropio.length === 0) {
        return { text: `🔒 *Acceso Restringido*\n\nEl informe *${busqueda}* existe en nuestro sistema pero *no está registrado a nombre de tu empresa* (${sesion.datos.nombre_empresa}).\n\n_Por políticas de privacidad y protección de datos, no podemos compartir certificados de terceros._\n\nSi necesitas este documento, escribe *ASESOR* para solicitarlo.` };
    }

    if (matchPropio.length === 0) {
        return await manejarFalloIntento(wa, sesion, {
            reintento: `❌ No encontramos el informe "${busqueda}" para tu empresa. Verifica el número e intenta de nuevo.`,
            escala: 'Te conectamos con un asesor para localizar tu documento.',
            claveIntentos: I_ESTATUS
        });
    }

    const eq = matchPropio[0];
    if (!eq.certificado_url) {
        return { text: `📍 *Informe ${eq.numero_informe}*\n\n*Equipo:* ${eq.nombre_instrumento}\n*Orden:* ${eq.orden_cotizacion}\n\nEl equipo ya fue procesado pero el certificado digital *aún no ha sido cargado*.\n\n_Te notificaremos cuando esté disponible. Vuelve a consultar en unas horas._` };
    }

    await guardarSesion(wa, sesion.nodo_actual_id, datosSinContadoresIntento(sesion.datos));
    const fullUrl = `https://crm.sicamet.com${eq.certificado_url}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(fullUrl)}`;

    return {
        text: `📄 *¡Certificado Localizado!*\n\n*Equipo:* ${eq.nombre_instrumento}\n*Orden:* ${eq.orden_cotizacion}\n*Informe:* ${eq.numero_informe}\n*Empresa:* ${eq.empresa}\n\n━━━━━━━━━━━━━━━━━━\n📱 *Escanea el QR* o descarga aquí:\n🔗 ${fullUrl}`,
        media: qrUrl,
        media_tipo: 'image'
    };
}


function formatearRespuestaEstatus(eq) {
    const etap = {
        'Recepción': '📥 Recibido en SICAMET',
        'Laboratorio': '🔬 En proceso de calibración',
        'Aseguramiento': '🛡️ En aseguramiento de calidad',
        'Certificación': '📋 Emitiendo certificado',
        'Facturación': '🧾 En facturación',
        'Entregado': '📦 Entregado al cliente'
    };
    const fechaEntrega = eq.fecha_entrega
        ? new Date(eq.fecha_entrega).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })
        : 'Pendiente de confirmar';

    return `🔍 *Estatus de Equipo*\n\n📦 *Instrumento:* ${eq.nombre_instrumento}\n🏭 *Cliente:* ${eq.empresa || eq.persona || '—'}\n🏷️ *Orden:* ${eq.orden_cotizacion || '—'}\n🚩 *Etapa actual:* ${etap[eq.estatus_actual] || eq.estatus_actual}\n📅 *Entrega:* ${fechaEntrega}\n\n_¿Consultas otra orden? Escríbela directamente o escribe *0* para el menú._`;
}

// ─── FLUJO REGISTRO EQUIPO ────────────────────────────────────────────────────

async function flujosRegistroEquipoLogic(wa, texto, sesion) {
    const datos = sesion.datos || {};
    const paso = datos.paso || 1;
    const tm = texto.trim();

    switch (paso) {
        case 1:
            if (!tm) {
                return await manejarFalloIntento(wa, sesion, {
                    reintento: MSG_COTIZ_REINTENTO,
                    escala: MSG_COTIZ_ESCALA,
                    claveIntentos: I_REG_EQ,
                    motivoEscalado: 'Registro equipo: empresa vacía'
                });
            }
            await guardarSesion(wa, sesion.nodo_actual_id, limpiarIntentoRegEq({ ...datos, paso: 2, empresa: tm }));
            return { text: `✅ *${tm}*\n\n¿Cuál es el nombre del instrumento?\n\n_Ej: Termómetro digital, Manómetro Bourdon, Balanza analítica_\n\n_Escribe *0* para menú o *Finalizar* para salir._` };
        case 2:
            if (!tm) {
                return await manejarFalloIntento(wa, sesion, {
                    reintento: MSG_COTIZ_REINTENTO,
                    escala: MSG_COTIZ_ESCALA,
                    claveIntentos: I_REG_EQ,
                    motivoEscalado: 'Registro equipo: nombre instrumento vacío'
                });
            }
            await guardarSesion(wa, sesion.nodo_actual_id, limpiarIntentoRegEq({ ...datos, paso: 3, nombreEquipo: tm }));
            return { text: `✅ *${tm}*\n\n¿Cuál es la marca y modelo? (escribe "no sé" si no lo tienes)\n\n_Escribe *0* para menú o *Finalizar* para salir._` };
        case 3:
            if (!tm) {
                return await manejarFalloIntento(wa, sesion, {
                    reintento: MSG_COTIZ_REINTENTO,
                    escala: MSG_COTIZ_ESCALA,
                    claveIntentos: I_REG_EQ,
                    motivoEscalado: 'Registro equipo: marca vacía'
                });
            }
            await guardarSesion(wa, sesion.nodo_actual_id, limpiarIntentoRegEq({ ...datos, paso: 4, marcaModelo: tm }));
            return { text: `✅ *${tm}*\n\n¿Cuándo fue su última calibración?\n\n_Escribe la fecha en formato DD/MM/AAAA_\n_Ej: 15/03/2024 — Escribe "no sé" si no tienes el dato_\n\n_Escribe *0* para menú o *Finalizar* para salir._` };
        case 4: {
            let f = null;
            const t = texto.trim().toLowerCase();
            if (t !== 'no sé' && t !== 'no se') {
                const p = texto.trim().split('/');
                if (p.length === 3 && p[0].length <= 2 && p[1].length <= 2 && p[2].length === 4) {
                    f = `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
                } else {
                    return await manejarFalloIntento(wa, sesion, {
                        reintento: 'Formato de fecha inválido. Por favor escribe la fecha como *DD/MM/AAAA* (ej: 15/03/2024).',
                        escala: MSG_COTIZ_ESCALA,
                        claveIntentos: I_REG_EQ,
                        motivoEscalado: 'Registro equipo: fecha inválida (3 intentos)'
                    });
                }
            }
            await guardarSesion(wa, sesion.nodo_actual_id, limpiarIntentoRegEq({ ...datos, paso: 5, fechaUltima: f }));
            return {
                text: `✅ Fecha registrada\n\n¿Con qué frecuencia se calibra este equipo?\n\n*1️⃣* Cada 6 meses\n*2️⃣* Cada 1 año (recomendado)\n*3️⃣* Cada 2 años\n\n_Escribe *0* para menú o *Finalizar* para salir._`
            };
        }
        case 5: {
            const txt = texto.trim().toLowerCase();
            let ms = null;
            if (txt === '1' || txt.includes('6') || txt.includes('seis')) ms = 6;
            else if (txt === '3' || txt.includes('2 a') || txt.includes('dos a')) ms = 24;
            else if (txt === '2' || txt.includes('1') || txt.includes('un') || txt.includes('año') || txt.includes('ano')) ms = 12;

            if (!ms) {
                return await manejarFalloIntento(wa, sesion, {
                    reintento: `${MSG_COTIZ_REINTENTO}\n\n_Elige *1*, *2* o *3*._`,
                    escala: MSG_COTIZ_ESCALA,
                    claveIntentos: I_REG_EQ,
                    motivoEscalado: 'Registro equipo: periodicidad no reconocida'
                });
            }
            let prox = null;
            const fechaBase = datos.fechaUltima ? new Date(datos.fechaUltima) : new Date(); // Si no sabe, usamos hoy
            fechaBase.setMonth(fechaBase.getMonth() + ms);
            prox = fechaBase.toISOString().split('T')[0];
            await db.query(
                'INSERT INTO equipos_cliente (cliente_whatsapp, nombre_empresa, nombre_equipo, marca, ultima_calibracion, periodicidad_meses, proxima_calibracion) VALUES (?,?,?,?,?,?,?)',
                [wa, datos.empresa, datos.nombreEquipo, datos.marcaModelo, datos.fechaUltima, ms, prox]
            );
            await guardarSesion(wa, null, estadoTrasEscalado(sesion.datos));
            const proxFmt = prox ? new Date(prox).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }) : 'No definida';
            return {
                text: `✅ *¡Equipo registrado exitosamente!*\n\n📋 *${datos.nombreEquipo}* (${datos.marcaModelo})\n🏢 Empresa: *${datos.empresa}*\n📅 Próxima calibración: *${proxFmt}*\n\nTe enviaré un recordatorio antes del vencimiento. 🔔\n\n_Escribe *0* para el menú principal._`
            };
        }
        default:
            await guardarSesion(wa, null, estadoTrasEscalado(sesion.datos));
            return await responderMenuPrincipal(wa, sesion);
    }
}

// ─── ESCALAR A HUMANO ─────────────────────────────────────────────────────────

async function escalarAHumanoLogic(wa, texto) {
    const sesion = await getSesion(wa);
    const enHorario = await estaEnHorario();
    const cfg = await getConfigHorario();
    try {
        await db.query(
            'INSERT INTO escalados (cliente_whatsapp, motivo, estatus) VALUES (?, ?, "pendiente")',
            [wa, (texto || '').substring(0, 400)]
        );
    } catch {}
    // ✅ Notificar por WhatsApp a los números de alertas configurados
    await notificarNuevoAsesor(wa, texto, sesion.numeroUserReal).catch(() => {});
    await guardarSesion(wa, null, estadoTrasEscalado(sesion.datos));

    let mensaje = '🧑‍💼 *Conectando con un asesor SICAMET...*\n\nUn representante se pondrá en contacto contigo muy pronto.';
    if (!enHorario) {
        mensaje = `⏰ *Fuera de Horario Laboral*\nNuestro horario de atención humana es de ${cfg.horario_inicio || '08:00'} a ${cfg.horario_fin || '18:00'} hrs.\n\nHemos registrado tu solicitud y un asesor se pondrá en contacto contigo al iniciar el siguiente turno laboral. 🙏`;
    }

    return {
        text: mensaje + '\n\n_Escribe *0* cuando quieras volver al menú principal._'
    };
}

// ─── FEEDBACK / SUGERENCIAS DEL CLIENTE ───────────────────────────────────────

async function feedbackLogic(wa, texto, sesion) {
    if (!sesion) sesion = await getSesion(wa);
    const raw = texto.trim();

    // Si el usuario escribe "0" o "menu" → volver al menú
    if (['0', 'menu', 'inicio'].includes(raw.toLowerCase())) {
        return await responderMenuPrincipal(wa, sesion);
    }

    // Si el texto es muy corto → pedir más detalle
    if (raw.length < 10) {
        return { text: '💡 Tu sugerencia es muy corta. Por favor, escribe con más detalle qué te gustaría que mejoremos.\n\n_Escribe *0* para el menú principal._' };
    }

    // Guardar feedback en BD
    try {
        await db.query(
            'INSERT INTO feedback_bot (cliente_wa, empresa, mensaje) VALUES (?, ?, ?)',
            [wa.replace('@c.us', ''), sesion.datos?.nombre_empresa || null, raw]
        );

        // Notificar al admin via socket
        if (global.io) {
            global.io.emit('nuevo_feedback', {
                cliente_wa: wa.replace('@c.us', ''),
                empresa: sesion.datos?.nombre_empresa || 'No identificado',
                mensaje: raw,
                fecha: new Date().toISOString()
            });
        }

        await guardarSesion(wa, null, datosSinContadoresIntento(sesion.datos));

        return {
            text: `✅ *¡Gracias por tu opinión!*\n\nTu sugerencia ha sido registrada y nuestro equipo la revisará para mejorar el servicio.\n\n_Escribe *0* para volver al menú principal, o *Finalizar* para cerrar el chat._`
        };
    } catch (err) {
        console.error('Error al guardar feedback:', err.message);
        return { text: '⚠️ Ocurrió un error al registrar tu sugerencia. Intenta de nuevo o contacta a un asesor.' };
    }
}

// ─── MANEJO DE RESPUESTA POST-CERTIFICADO (consultar otro o finalizar) ───────

async function postCertificadoLogic(wa, texto, sesion) {
    if (!sesion) sesion = await getSesion(wa);
    const raw = texto.trim();

    if (raw === '1' || raw.toLowerCase().includes('certificado')) {
        return { text: '📋 Escribe el *Número de Informe* o *Orden de Servicio* que deseas consultar.\n\n_Ejemplo: ICM.0010.26 o P26-0461_' };
    }
    if (raw === '2' || raw.toLowerCase().includes('estatus')) {
        return { text: '🔍 Escribe tu número de *Orden de Servicio* para consultar el estatus.\n\n_Ejemplo: P26-0461_' };
    }
    if (raw === '3' || raw.toLowerCase().includes('asesor')) {
        return await escalarAHumanoLogic(wa, 'Cliente solicitó asesor después de consultar certificado');
    }
    if (raw === '0' || raw.toLowerCase() === 'menu') {
        return await responderMenuPrincipal(wa, sesion);
    }

    // Si escribe algo más → tratar como feedback
    return await feedbackLogic(wa, texto, sesion);
}

// ─── HELPER: RAZÓN SOCIAL + TELÉFONO ─────────────────────────────────────────
/**
 * Retorna la empresa y teléfono de la sesión actual o pide los datos faltantes.
 * Uso: const result = await pedirEmpresaTelefono(wa, textoTrim, sesion, datosFlujo, pasoEmpresa, pasoTelefono, callbackGuardar);
 * Si result.done === true, result.empresa y result.telefono están listos.
 * Si result.done === false, result.respuesta es el mensaje a enviar.
 */
async function pedirEmpresaTelefono(wa, textoTrim, sesion, datos, pasoEmpresa, pasoTelefono, paso) {
    const esClienteId = !!(datos.nombre_empresa || datos.cliente_id);
    const numWa = wa.split('@')[0].replace(/\D/g, '');

    if (paso === pasoEmpresa) {
        if (esClienteId) {
            // Cliente identificado: saltamos empresa, pedimos teléfono
            const empresa = datos.nombre_empresa || datos.empresa || '';
            await guardarSesion(wa, sesion.nodo_actual_id, { ...datos, paso: pasoTelefono, empresa });
            return {
                done: false,
                respuesta: { text: `✅ Registrando para *${empresa}*.\n\n¿Deseas que te contactemos al *${numWa}* o tienes otro número? Escribe el número (10 dígitos) o escribe *mismo*.` }
            };
        }
        if (!textoTrim || textoTrim.length < 2) {
            return { done: false, respuesta: { text: '⚠️ Por favor escribe el nombre de tu empresa o razón social.' } };
        }
        await guardarSesion(wa, sesion.nodo_actual_id, { ...datos, paso: pasoTelefono, empresa: textoTrim });
        return { done: false, respuesta: { text: `✅ *${textoTrim}*\n\n¿Cuál es tu número de teléfono de contacto? (10 dígitos)\n\n_Ej: 7221234567_` } };
    }

    if (paso === pasoTelefono) {
        let telefono = textoTrim.toLowerCase() === 'mismo' ? numWa : textoTrim.replace(/\D/g, '');
        if (telefono.length < 7) {
            return { done: false, respuesta: { text: 'Número inválido. Por favor escribe tu teléfono de 10 dígitos o escribe *mismo* para usar este número.' } };
        }
        return { done: true, empresa: datos.empresa || datos.nombre_empresa || '', telefono };
    }

    return { done: false, respuesta: { text: '⚠️ Error interno de flujo. Escribe *0* para volver al menú.' } };
}

// ─── FLUJO CALIFICACIÓN ───────────────────────────────────────────────────────
const ETAPAS_CALIF = {
    '1': 'DQ — Calificación de Diseño',
    '2': 'IQ — Calificación de Instalación',
    '3': 'OQ — Calificación de Operación',
    '4': 'PQ — Calificación de Performance'
};

async function flujosCalificacionLogic(wa, texto, sesion) {
    const datos = sesion.datos || {};
    const paso = datos.paso || 1;
    const textoTrim = (texto || '').trim();
    const textoLower = textoTrim.toLowerCase();

    switch (paso) {
        case 1: { // Capturar rama (Equipos vs Mapeo)
            const isEquipos = textoTrim === '1' || textoLower.includes('equipo') || textoLower.includes('estufa');
            const isMapeo = textoTrim === '2' || textoLower.includes('mapeo') || textoLower.includes('almacen') || textoLower.includes('recinto');
            if (!isEquipos && !isMapeo) {
                return { text: `⚠️ Por favor elige una opción:\n*1️⃣* Equipos (Estufa, Baños, etc)\n*2️⃣* Mapeo Térmico (Almacén, Recintos)` };
            }
            const rama = isEquipos ? 'equipos' : 'mapeo';
            await guardarSesion(wa, sesion.nodo_actual_id, { ...datos, paso: 15, rama });
            if (rama === 'equipos') {
                return { text: `🏷️ *Calificación de Equipos*\n\nDescribe el equipo que deseas calificar.\n_Ejemplo: Estufa de vacío, Autoclave, Baño María, etc._` };
            } else {
                return { text: `🏷️ *Mapeo Térmico*\n\nDescribe el área que deseas mapear.\n_Ejemplo: Almacén de materia prima, Cámara fría, etc._` };
            }
        }

        case 15: { // Capturar descripción y preguntar etapas
            if (!textoTrim || textoTrim.length < 2) {
                return { text: `⚠️ Por favor describe brevemente el ${datos.rama === 'equipos' ? 'equipo' : 'área'}.` };
            }
            await guardarSesion(wa, sesion.nodo_actual_id, { ...datos, paso: 2, equipo_calif: textoTrim });
            return {
                text: `✅ Entendido.\n\n¿Qué etapas deseas calificar?\n\n` +
                    Object.entries(ETAPAS_CALIF).map(([k, v]) => `*${k}️⃣* ${v}`).join('\n') +
                    `\n\n_Puedes elegir una o varias. Ej: "1", "1 y 3", "DQ y OQ", o "todas"._\n_Contexto rápido:_\n` +
                    `• *DQ* ¿Está bien concebido desde el papel?\n• *IQ* ¿Está bien instalado?\n• *OQ* ¿Funciona como debería en condiciones controladas?\n• *PQ* ¿Sirve para lo que fue comprado en la práctica?`
            };
        }

        case 2: { // Capturar selección de etapas
            let etapasSeleccionadas = [];
            const txt = textoLower;
            if (txt === 'todas' || txt === 'all' || txt === 'las 4' || txt.includes('todas')) {
                etapasSeleccionadas = Object.values(ETAPAS_CALIF);
            } else {
                let recog = [];
                if (txt.includes('1') || txt.includes('dq') || txt.includes('diseño')) recog.push(ETAPAS_CALIF['1']);
                if (txt.includes('2') || txt.includes('iq') || txt.includes('instalacion') || txt.includes('instalación')) recog.push(ETAPAS_CALIF['2']);
                if (txt.includes('3') || txt.includes('oq') || txt.includes('operacion') || txt.includes('operación')) recog.push(ETAPAS_CALIF['3']);
                if (txt.includes('4') || txt.includes('pq') || txt.includes('performance') || txt.includes('desempeño')) recog.push(ETAPAS_CALIF['4']);
                etapasSeleccionadas = recog;
            }
            if (etapasSeleccionadas.length === 0) {
                return { text: `⚠️ No reconocí tu selección. Por favor escribe los números o siglas (ej: "1 y 3" o "DQ y OQ").` };
            }
            
            if (datos.rama === 'equipos') {
                await guardarSesion(wa, sesion.nodo_actual_id, { ...datos, paso: 3, etapas: etapasSeleccionadas.join(', ') });
                return { text: `✅ *Etapas seleccionadas:* ${etapasSeleccionadas.join(', ')}\n\n¿El proceso requiere *Autoclave*?\n\n*1️⃣* Sí\n*2️⃣* No` };
            } else {
                await guardarSesion(wa, sesion.nodo_actual_id, { ...datos, paso: 6, etapas: etapasSeleccionadas.join(', ') });
                return { text: `✅ *Etapas seleccionadas:* ${etapasSeleccionadas.join(', ')}\n\n¿El espacio es *Almacén* o *Recinto*?\n\n*1️⃣* Almacén\n*2️⃣* Recinto` };
            }
        }

        case 3: { // Autoclave
            const siNo = textoTrim === '1' || textoLower.startsWith('si') || textoLower === 'sí';
            const noResp = textoTrim === '2' || textoLower.startsWith('no');
            if (!siNo && !noResp) return { text: `Por favor responde *1* (Sí) o *2* (No) para el Autoclave.` };
            await guardarSesion(wa, sesion.nodo_actual_id, { ...datos, paso: 4, autoclave: siNo ? 1 : 0 });
            return { text: `✅ ${siNo ? 'Con Autoclave' : 'Sin Autoclave'}\n\n¿Requiere *Horno de Despirogenización*?\n\n*1️⃣* Sí\n*2️⃣* No` };
        }

        case 4: { // Horno despirogenización
            const siNo = textoTrim === '1' || textoLower.startsWith('si') || textoLower === 'sí';
            const noResp = textoTrim === '2' || textoLower.startsWith('no');
            if (!siNo && !noResp) return { text: `Por favor responde *1* (Sí) o *2* (No) para el Horno de Despirogenización.` };
            await guardarSesion(wa, sesion.nodo_actual_id, { ...datos, paso: 5, horno: siNo ? 1 : 0 });
            return { text: `✅ ${siNo ? 'Con Horno de Despirogenización' : 'Sin Horno'}\n\n¿Cuántos *patrones de carga* se requieren?\n\n_Escribe el número. Ej: 3_` };
        }

        case 5: { // Patrones de carga
            const n = parseInt(textoTrim);
            if (isNaN(n) || n < 0) return { text: `Por favor escribe un número válido de patrones de carga. Ej: 3` };
            await guardarSesion(wa, sesion.nodo_actual_id, { ...datos, paso: 90, patrones_carga: n });
            return await pedirEmpresaTelefonoCalif(wa, '', sesion, { ...datos, paso: 90, patrones_carga: n }, 90, 91);
        }

        case 6: { // Tipo de espacio
            const esAlmacen = textoTrim === '1' || textoLower.includes('almacen') || textoLower.includes('almacén');
            const esRecinto = textoTrim === '2' || textoLower.includes('recinto');
            if (!esAlmacen && !esRecinto) return { text: `Por favor responde *1* (Almacén) o *2* (Recinto).` };
            const tipoEspacio = esAlmacen ? 'Almacén' : 'Recinto';
            await guardarSesion(wa, sesion.nodo_actual_id, { ...datos, paso: 7, tipo_espacio: tipoEspacio });
            return { text: `✅ *${tipoEspacio}*\n\n¿Cuáles son las *medidas* del espacio?\n\nPuedes escribir en un solo mensaje: *Largo x Ancho x Alto* en metros\n_Ej: 5x3x2.5 — o bien escríbelas por separado y te las voy pidiendo._` };
        }

        case 7: { // Medidas (acepta formato "LxAxH" o empieza con largo)
            const partes = textoTrim.split(/[x×\/\s,]+/i).map(p => parseFloat(p.replace(',', '.')));
            if (partes.length === 3 && partes.every(p => !isNaN(p) && p > 0)) {
                const [largo, ancho, alto] = partes;
                await guardarSesion(wa, sesion.nodo_actual_id, { ...datos, paso: 90, largo, ancho, alto });
                return await pedirEmpresaTelefonoCalif(wa, '', sesion, { ...datos, paso: 90, largo, ancho, alto }, 90, 91);
            }
            const largo = parseFloat(textoTrim.replace(',', '.'));
            if (!isNaN(largo) && largo > 0) {
                await guardarSesion(wa, sesion.nodo_actual_id, { ...datos, paso: 8, largo });
                return { text: `✅ *Largo: ${largo}m*\n\n¿Cuál es el *Ancho* en metros?` };
            }
            return { text: `No reconocí las medidas. Escribe en formato *LargoXAnchoXAlto* (ej: 5x3x2.5) o empieza con el largo.` };
        }

        case 8: { // Ancho
            const ancho = parseFloat(textoTrim.replace(',', '.'));
            if (isNaN(ancho) || ancho <= 0) return { text: `Por favor escribe el *Ancho* en metros. Ej: 3` };
            await guardarSesion(wa, sesion.nodo_actual_id, { ...datos, paso: 9, ancho });
            return { text: `✅ *Ancho: ${ancho}m*\n\n¿Cuál es el *Alto* en metros?` };
        }

        case 9: { // Alto
            const alto = parseFloat(textoTrim.replace(',', '.'));
            if (isNaN(alto) || alto <= 0) return { text: `Por favor escribe el *Alto* en metros. Ej: 2.5` };
            await guardarSesion(wa, sesion.nodo_actual_id, { ...datos, paso: 90, alto });
            return await pedirEmpresaTelefonoCalif(wa, '', sesion, { ...datos, paso: 90, alto }, 90, 91);
        }

        case 90: { // Pedir empresa/confirmar
            return await pedirEmpresaTelefonoCalif(wa, textoTrim, sesion, datos, 90, 91);
        }
        case 91: { // Pedir teléfono
            return await pedirEmpresaTelefonoCalif(wa, textoTrim, sesion, datos, 90, 91);
        }

        default:
            await guardarSesion(wa, null, estadoTrasEscalado(sesion.datos));
            return await responderMenuPrincipal(wa, sesion);
    }
}

/** Helper interno para calificación: gestiona empresa+teléfono y guarda en BD */
async function pedirEmpresaTelefonoCalif(wa, textoTrim, sesion, datos, pasoEmpresa, pasoTelefono) {
    const paso = datos.paso;
    const result = await pedirEmpresaTelefono(wa, textoTrim, sesion, datos, pasoEmpresa, pasoTelefono, paso);
    if (!result.done) return result.respuesta;

    const { empresa, telefono } = result;
    try {
        await db.query(
            'INSERT INTO calificaciones_bot (cliente_whatsapp, nombre_empresa, telefono_contacto, etapas, autoclave, horno_despirogenizacion, patrones_carga, tipo_espacio, largo, ancho, alto, estatus, detalle_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [wa, empresa, telefono, datos.etapas || '', datos.autoclave || 0, datos.horno || 0, datos.patrones_carga || 0, datos.tipo_espacio || '', datos.largo || 0, datos.ancho || 0, datos.alto || 0, 'nueva', JSON.stringify({ rama: datos.rama, equipo: datos.equipo_calif || '' })]
        );
        if (global.io) global.io.emit('nueva_calificacion', { empresa });
        await notificarGenerico('nueva_calificacion_bot', empresa, 'Calificación');
        await guardarSesion(wa, null, estadoTrasEscalado(sesion.datos));
        
        const detalles = datos.rama === 'equipos'
            ? `• Autoclave: *${datos.autoclave ? 'Sí' : 'No'}*\n• Horno Despirogenización: *${datos.horno ? 'Sí' : 'No'}*\n• Patrones de carga: *${datos.patrones_carga}*`
            : `• Espacio: *${datos.tipo_espacio}* (${datos.largo}m × ${datos.ancho}m × ${datos.alto}m)`;

        return {
            text: `🎉 *¡Solicitud de Calificación registrada!*\n\n📋 *Resumen:*\n• Empresa: *${empresa}*\n• Teléfono: *${telefono}*\n• Área: *${datos.rama === 'equipos' ? 'Equipos' : 'Mapeo Térmico'}*\n• Equipo/Área a calificar: *${datos.equipo_calif}*\n• Etapas: *${datos.etapas}*\n${detalles}\n\n⏱️ *Tiempo de entrega estimado: 20 a 35 días hábiles* a partir de la generación de la Orden de Servicio (O.S.).\n_(Este plazo inicia una vez enviada la cotización, negociada y aceptada por el cliente, generando el estudio y la O.S.)_\n\nEn breve un especialista SICAMET se pondrá en contacto. ¡Gracias! 🙏\n\n_Escribe *0* para volver al menú._`
        };
    } catch (err) {
        console.error('Error al guardar calificación:', err);
        return { text: '❌ Hubo un error al registrar. Intenta de nuevo o contacta a un asesor.' };
    }
}

// ─── FLUJO VERIFICENTRO ───────────────────────────────────────────────────────
async function flujosVerificentroLogic(wa, texto, sesion) {
    const datos = sesion.datos || {};
    const paso = datos.paso || 1;
    const textoTrim = (texto || '').trim();
    const textoLower = textoTrim.toLowerCase();

    switch (paso) {
        case 1: { // Líneas
            const n = parseInt(textoTrim);
            if (isNaN(n) || n < 1) return { text: `✅ *Cotización de Verificentro*\n\n¿Cuántas *líneas* tiene el verificentro?\n\n_Escribe el número de líneas. Ej: 4_` };
            await guardarSesion(wa, sesion.nodo_actual_id, { ...datos, paso: 2, num_lineas: n });
            return { text: `✅ *${n} línea(s)*\n\n¿Requiere medición de *Fuerza*?\n\n*1️⃣* Sí\n*2️⃣* No` };
        }

        case 2: { // Fuerza
            const si = textoTrim === '1' || textoLower.startsWith('si') || textoLower === 'sí';
            const no = textoTrim === '2' || textoLower.startsWith('no');
            if (!si && !no) return { text: `Responde *1* (Sí) o *2* (No) para Fuerza.` };
            await guardarSesion(wa, sesion.nodo_actual_id, { ...datos, paso: 3, fuerza: si ? 1 : 0 });
            return { text: `✅ *Fuerza: ${si ? 'Sí' : 'No'}*\n\n¿Requiere medición de *Dimensión*?\n\n*1️⃣* Sí\n*2️⃣* No` };
        }

        case 3: { // Dimensión
            const si = textoTrim === '1' || textoLower.startsWith('si') || textoLower === 'sí';
            const no = textoTrim === '2' || textoLower.startsWith('no');
            if (!si && !no) return { text: `Responde *1* (Sí) o *2* (No) para Dimensión.` };
            await guardarSesion(wa, sesion.nodo_actual_id, { ...datos, paso: 4, dimension: si ? 1 : 0 });
            return { text: `✅ *Dimensión: ${si ? 'Sí' : 'No'}*\n\n¿Requiere medición de *Velocidad*?\n\n*1️⃣* Sí\n*2️⃣* No` };
        }

        case 4: { // Velocidad
            const si = textoTrim === '1' || textoLower.startsWith('si') || textoLower === 'sí';
            const no = textoTrim === '2' || textoLower.startsWith('no');
            if (!si && !no) return { text: `Responde *1* (Sí) o *2* (No) para Velocidad.` };
            await guardarSesion(wa, sesion.nodo_actual_id, { ...datos, paso: 90, velocidad: si ? 1 : 0 });
            return await pedirEmpresaTelefonoVerif(wa, '', sesion, { ...datos, paso: 90, velocidad: si ? 1 : 0 }, 90, 91);
        }

        case 90: return await pedirEmpresaTelefonoVerif(wa, textoTrim, sesion, datos, 90, 91);
        case 91: return await pedirEmpresaTelefonoVerif(wa, textoTrim, sesion, datos, 90, 91);

        default:
            await guardarSesion(wa, null, estadoTrasEscalado(sesion.datos));
            return await responderMenuPrincipal(wa, sesion);
    }
}

async function pedirEmpresaTelefonoVerif(wa, textoTrim, sesion, datos, pasoEmpresa, pasoTelefono) {
    const paso = datos.paso;
    const result = await pedirEmpresaTelefono(wa, textoTrim, sesion, datos, pasoEmpresa, pasoTelefono, paso);
    if (!result.done) return result.respuesta;

    const { empresa, telefono } = result;
    try {
        await db.query(
            'INSERT INTO verificentros_bot (cliente_whatsapp, nombre_empresa, telefono_contacto, num_lineas, fuerza, dimension_req, velocidad, estatus) VALUES (?,?,?,?,?,?,?,?)',
            [wa, empresa, telefono, datos.num_lineas || 0, datos.fuerza || 0, datos.dimension || 0, datos.velocidad || 0, 'nueva']
        );
        if (global.io) global.io.emit('nueva_verificentro', { empresa });
        await notificarGenerico('nueva_verificentro_bot', empresa, 'Verificentro');
        await guardarSesion(wa, null, estadoTrasEscalado(sesion.datos));
        return {
            text: `🎉 *¡Solicitud de Verificentro registrada!*\n\n📋 *Resumen:*\n• Empresa: *${empresa}*\n• Teléfono: *${telefono}*\n• Líneas: *${datos.num_lineas}*\n• Fuerza: *${datos.fuerza ? 'Sí' : 'No'}*\n• Dimensión: *${datos.dimension ? 'Sí' : 'No'}*\n• Velocidad: *${datos.velocidad ? 'Sí' : 'No'}*\n\n⏱️ *Tiempo de entrega estimado: 5 a 7 días hábiles.*\n\nEn breve un especialista SICAMET se pondrá en contacto. ¡Gracias! 🙏\n\n_Escribe *0* para volver al menú._`
        };
    } catch (err) {
        console.error('Error al guardar verificentro:', err);
        return { text: '❌ Hubo un error al registrar. Intenta de nuevo o contacta a un asesor.' };
    }
}

// ─── FLUJO VENTAS ─────────────────────────────────────────────────────────────
async function flujosVentasLogic(wa, texto, sesion) {
    const datos = sesion.datos || {};
    const paso = datos.paso || 1;
    const textoTrim = (texto || '').trim();

    switch (paso) {
        case 1: { // Capturar descripción
            if (!textoTrim || textoTrim.length < 3) {
                return { text: `Por favor describe el instrumento que necesitas con un poco más de detalle. Ej: _"Termómetro digital certificado por ema iso 17025"_` };
            }
            await guardarSesion(wa, sesion.nodo_actual_id, { ...datos, paso: 90, descripcion: textoTrim });
            return await pedirEmpresaTelefonoVentas(wa, '', sesion, { ...datos, paso: 90, descripcion: textoTrim }, 90, 91);
        }

        case 90: return await pedirEmpresaTelefonoVentas(wa, textoTrim, sesion, datos, 90, 91);
        case 91: return await pedirEmpresaTelefonoVentas(wa, textoTrim, sesion, datos, 90, 91);

        default:
            await guardarSesion(wa, null, estadoTrasEscalado(sesion.datos));
            return await responderMenuPrincipal(wa, sesion);
    }
}

async function pedirEmpresaTelefonoVentas(wa, textoTrim, sesion, datos, pasoEmpresa, pasoTelefono) {
    const paso = datos.paso;
    const result = await pedirEmpresaTelefono(wa, textoTrim, sesion, datos, pasoEmpresa, pasoTelefono, paso);
    if (!result.done) return result.respuesta;

    const { empresa, telefono } = result;
    try {
        await db.query(
            'INSERT INTO ventas_bot (cliente_whatsapp, nombre_empresa, telefono_contacto, descripcion_instrumento, estatus) VALUES (?,?,?,?,?)',
            [wa, empresa, telefono, datos.descripcion || '', 'nueva']
        );
        if (global.io) global.io.emit('nueva_venta', { empresa });
        await notificarGenerico('nueva_venta_bot', empresa, 'Venta');
        await guardarSesion(wa, null, estadoTrasEscalado(sesion.datos));
        return {
            text: `🎉 *¡Solicitud de Venta registrada!*\n\n📋 *Resumen:*\n• Empresa: *${empresa}*\n• Teléfono: *${telefono}*\n• Instrumento solicitado:\n  _"${datos.descripcion}"_\n\nℹ️ Todos nuestros instrumentos son *fabricados bajo pedido* con las especificaciones exactas que requieres.\n\nEn breve un especialista SICAMET se pondrá en contacto con disponibilidad y precios. ¡Gracias! 🙏\n\n_Escribe *0* para volver al menú._`
        };
    } catch (err) {
        console.error('Error al guardar venta:', err);
        return { text: '❌ Hubo un error al registrar. Intenta de nuevo o contacta a un asesor.' };
    }
}

// ─── NOTIFICACIÓN GENÉRICA ────────────────────────────────────────────────────
async function notificarGenerico(tipo, empresa, labelTipo) {
    try {
        const cfg = await getConfigHorario();
        const numeros = [...(cfg.notif_numeros || '').split(',')]
            .map(n => n.trim()).filter(n => n.replace(/\D/g, '').length >= 8);
        if (!numeros.length || !global.botClient) return;
        const msg = `🔔 Nueva solicitud de *${labelTipo}*\n\nEmpresa: *${empresa}*\n\nRevisa el sistema CRM!`;
        for (const num of numeros) {
            const jid = numToWaJid(num);
            if (jid) await global.botClient.sendMessage(jid, msg).catch(() => {});
        }
    } catch (e) { console.error('Error notificarGenerico:', e.message); }
}

// ─── EXPORTS ──────────────────────────────────────────────────────────────────

/** Para el handler de WhatsApp: solo interceptar estatus cuando el nodo activo es el de consulta (no hardcodear id=5). */
async function esNodoConsultaEstatus(nodoId) {
    if (!nodoId) return false;
    const n = await getNodo(nodoId);
    return !!(n && n.accion === 'consultar_estatus');
}

module.exports = {
    procesarMensaje,
    consultarEstatusLogic,
    consultarCertificadoLogic,
    esNodoConsultaEstatus,
    escalarAHumanoLogic,
    responderMenuPrincipal,
    feedbackLogic,
    postCertificadoLogic,
    getConfigHorario,
    invalidarCacheConfig,
    notificarNuevaCotizacion,
    notificarNuevoAsesor,
    getEstado: getSesion,
    limpiarEstado: wa => guardarSesion(wa, null, {})
};
