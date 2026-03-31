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
    await guardarSesion(wa, null, estadoTrasEscalado(sesion.datos));
    const texto = `${mensajeUsuario}\n\n🧑‍💼 *Conectando con un asesor SICAMET…*\nUn representante se pondrá en contacto contigo pronto.\n\n📞 Si es urgente: *722 270 1584*\n\n_Escribe *0* para el menú principal._`;
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

/** Nombres visibles del menú (mismas reglas que construirTextoOpcionesMenu). */
async function obtenerEtiquetasMenuVisibles(datos) {
    const nodosAll = await getTodosNodos();
    const d = datos || {};
    const esCliente = !!d.nombre_empresa;
    const labels = [];
    nodosAll.forEach((n, i) => {
        const num = i + 1;
        if ((num === 3 || num === 4) && !esCliente) return;
        if (num === 1 && esCliente) return;
        labels.push(n.nombre);
    });
    return labels;
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

/** Devuelve índice de menú 1-based si el texto del usuario coincide con un ítem visible. */
async function resolverOpcionMenuPorTexto(textoCrudo, datos) {
    const nodosAll = await getTodosNodos();
    const d = datos || {};
    const esCliente = !!d.nombre_empresa;
    let mejorNum = null;
    let mejorScore = 0;
    nodosAll.forEach((n, i) => {
        const num = i + 1;
        if ((num === 3 || num === 4) && !esCliente) return;
        if (num === 1 && esCliente) return;
        const sc = scoreTextoVsEtiquetaMenu(textoCrudo, n.nombre || '');
        if (sc > mejorScore) {
            mejorScore = sc;
            mejorNum = num;
        }
    });
    if (mejorScore >= 0.82) return mejorNum;
    return null;
}

/** Líneas *1️⃣* … del menú (sin 3–4 si no hay sesión; sin 1 si ya identificado). */
async function construirTextoOpcionesMenu(datos) {
    const nodosAll = await getTodosNodos();
    const d = datos || {};
    const esCliente = !!d.nombre_empresa;
    let texto = '';
    nodosAll.forEach((n, i) => {
        const num = i + 1;
        if ((num === 3 || num === 4) && !esCliente) return;
        if (num === 1 && esCliente) return;
        texto += `\n*${num}️⃣* ${n.nombre}`;
    });
    return texto;
}

// ─── MENÚ RAÍZ (BIENVENIDA) ──────────────────────────────────────────────────

async function responderMenuPrincipal(wa, sesion) {
    try {
        const cfg = await getConfigHorario();
        const datos = sesion?.datos || {};
        const esCliente = !!datos.nombre_empresa;
        
        // Determinar saludo
        let msgBase = cfg.mensaje_bienvenida || '👋 ¡Hola! Soy el asistente virtual de *SICAMET*.';
        if (esCliente) {
            msgBase = `🌟 ¡Hola de nuevo, colaborador de *${datos.nombre_empresa}*! 👋\n\n¿En qué te podemos ayudar hoy?`;
        }

        let texto = msgBase + '\n';
        texto += await construirTextoOpcionesMenu(datos);

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
        const datosMenu = estadoTrasEscalado(sesion.datos);
        await guardarSesion(wa, null, datosMenu);
        return await responderMenuPrincipal(wa, { ...sesion, datos: datosMenu });
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
    console.log(`🤖 Bot procesando mensaje de [${wa}] | Texto: "${texto}"`);
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
    if (textoLower === 'reiniciar') {
        await guardarSesion(wa, null, {});
        return await responderMenuPrincipal(wa, { ...sesion, datos: {}, nodo_actual_id: null });
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
    const nodos = await getTodosNodos();

    // 1. Selección numérica
    const num = parseInt(textoLower);
    if (!isNaN(num) && num >= 1 && num <= nodos.length) {
        const d = sesion.datos || {};
        if ((num === 3 || num === 4) && !d.nombre_empresa) {
            return { 
                text: `🔒 *Acceso restringido*\n\nLa opción *${num}️⃣* es exclusiva para clientes registrados.\n\nPor favor, elige la opción *1️⃣ Soy Cliente* para identificarte primero.` 
            };
        }
        if (num === 1 && d.nombre_empresa) {
            const lineas = await construirTextoOpcionesMenu(d);
            return {
                text: `✅ Ya estás identificado como *${d.nombre_empresa}*. No hace falta elegir *Soy Cliente* de nuevo.\n\nElige una opción:${lineas}\n\n_Escribe *0* para el menú._`
            };
        }

        const destino = nodos[num - 1];
        const d0 = estadoTrasEscalado(sesion.datos || {});
        await guardarSesion(wa, destino.id, d0);
        return await responderNodo(wa, destino.id, await getSesion(wa));
    }

    // 1b. Misma lógica que el número pero escribiendo el nombre de la opción (con tolerancia a typos)
    const numPorTexto = await resolverOpcionMenuPorTexto(texto, sesion.datos || {});
    if (numPorTexto != null) {
        const d = sesion.datos || {};
        if ((numPorTexto === 3 || numPorTexto === 4) && !d.nombre_empresa) {
            return {
                text: `🔒 *Acceso restringido*\n\nLa opción *${numPorTexto}️⃣* es exclusiva para clientes registrados.\n\nPor favor, elige la opción *1️⃣ Soy Cliente* para identificarte primero.`
            };
        }
        if (numPorTexto === 1 && d.nombre_empresa) {
            const lineas = await construirTextoOpcionesMenu(d);
            return {
                text: `✅ Ya estás identificado como *${d.nombre_empresa}*. No hace falta elegir *Soy Cliente* de nuevo.\n\nElige una opción:${lineas}\n\n_Escribe *0* para el menú._`
            };
        }
        const destinoTxt = nodos[numPorTexto - 1];
        const d0 = estadoTrasEscalado(sesion.datos || {});
        await guardarSesion(wa, destinoTxt.id, d0);
        return await responderNodo(wa, destinoTxt.id, await getSesion(wa));
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

    // 4. Fallo: No entendido -> Strike
    return await manejarFalloIntento(wa, sesion, {
        reintento: 'No entendí tu opción. Por favor escribe un número del 1 al 7.',
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
    if (nodo.accion === 'identificar_cliente') return await identificarClienteLogic(wa, texto, sesion);
    if (nodo.accion === 'consultar_estatus') return await consultarEstatusLogic(wa, texto, sesion);
    if (nodo.accion === 'cotizacion') return await flujosCotizacionLogic(wa, texto, sesion);
    if (nodo.accion === 'registrar_equipo') return await flujosRegistroEquipoLogic(wa, texto, sesion);
    if (nodo.accion === 'escalar') return await escalarAHumanoLogic(wa, texto);
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
    '1': '5 días hábiles', '2': '10 días hábiles', '3': '10-15 días hábiles', '4': '15-20 días hábiles'
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

/** Mapea texto libre o número a clave '1'..'4' de TIEMPOS_ENTREGA. */
function interpretarOpcionTiempoEntrega(texto) {
    const raw = texto.trim();
    if (TIEMPOS_ENTREGA[raw]) return raw;
    const t = normalizarTexto(texto);
    const soloDig = raw.replace(/\D/g, '');
    if (soloDig === '1' || soloDig === '5') return '1';
    if (soloDig === '2' || soloDig === '10') return '2';
    if (soloDig === '3') return '3';
    if (soloDig === '4') return '4';
    if (t === '5' || t === 'cinco' || (t.includes('5') && t.includes('dia') && !t.includes('10'))) return '1';
    if (t === '10' || t === 'diez' || /\b10\b/.test(t) || (t.includes('diez') && t.includes('dia'))) return '2';
    if (t.includes('10-15') || t.includes('10 a 15') || t.includes('once') || t.includes('doce') || (t.includes('15') && t.includes('10'))) return '3';
    if (t.includes('15-20') || t.includes('15 a 20') || (t.includes('20') && t.includes('dia'))) return '4';
    return null;
}

async function flujosCotizacionLogic(wa, texto, sesion) {
    const datos = sesion.datos || {};
    const paso = datos.paso || 1;
    const items = datos.items || [];
    const currentItem = datos.currentItem || {};

    const textoTrim = texto.trim();
    const textoLower = textoTrim.toLowerCase();

    switch (paso) {
        case 1: { // Inicio: Tipo de equipo o descripción
            if (!textoTrim || textoTrim.length < 2) {
                return await manejarFalloIntento(wa, sesion, {
                    reintento: MSG_COTIZ_REINTENTO,
                    escala: MSG_COTIZ_ESCALA,
                    claveIntentos: I_COTIZ,
                    motivoEscalado: 'Cotización: paso 1 — respuesta vacía o inválida'
                });
            }
            const tipo = TIPOS_EQUIPO[textoTrim] || textoTrim;
            const updatedItem = { ...currentItem, tipoEquipo: tipo };
            await guardarSesion(wa, sesion.nodo_actual_id, limpiarIntentoCotiz({ ...datos, paso: 2, currentItem: updatedItem }));
            return {
                text: `✅ *${tipo}*\n\n¿Cuál es la *marca y modelo* del instrumento?\n\n_Ej: Fluke 726 | Vaisala HMT310 | WIKA P-30_\n_(Escribe "no sé" si no tienes el dato)_`
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
                    text: `⏳ *Tiempo de entrega preferido:*\n\n¿Qué rango de tiempo de entrega se ajusta a tus necesidades?\n\n*1️⃣* 5 días hábiles\n*2️⃣* 10 días hábiles\n*3️⃣* 10-15 días hábiles\n*4️⃣* 15-20 días hábiles\n\n_También puedes escribir *10*, *10 días* o el número de opción (1–4)._`
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
                    reintento: `${MSG_COTIZ_REINTENTO}\n\n_Escribe *1*, *2*, *3* o *4*, o algo como *10 días*, *5 días*, *10-15 días*._`,
                    escala: MSG_COTIZ_ESCALA,
                    claveIntentos: I_COTIZ,
                    motivoEscalado: 'Cotización: paso 7 — tiempo de entrega no reconocido'
                });
            }
            const tiempo = TIEMPOS_ENTREGA[claveT];
            await guardarSesion(wa, sesion.nodo_actual_id, limpiarIntentoCotiz({ ...datos, paso: 8, tiempoEntrega: tiempo }));
            return { text: `✅ *${tiempo}*\n\n¿Cuál es el nombre de tu *empresa* o razón social?` };
        }

        case 8: // Empresa y Guardado Final
            if (!textoTrim || textoTrim.length < 2) {
                return await manejarFalloIntento(wa, sesion, {
                    reintento: MSG_COTIZ_REINTENTO,
                    escala: MSG_COTIZ_ESCALA,
                    claveIntentos: I_COTIZ,
                    motivoEscalado: 'Cotización: paso 8 — razón social inválida'
                });
            }
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
                await guardarSesion(wa, null, estadoTrasEscalado(sesion.datos));
                
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
            await guardarSesion(wa, null, estadoTrasEscalado(sesion.datos));
            return await responderMenuPrincipal(wa, { ...sesion, datos: estadoTrasEscalado(sesion.datos) });
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

const ORDEN_ETAPAS_ESTATUS = ['Recepción', 'Laboratorio', 'Certificación', 'Listo', 'Entregado'];

function normalizarEtapaEstatus(est) {
    const e = (est || '').trim();
    if (!e) return '—';
    const lower = e.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const map = {
        recepcion: 'Recepción',
        laboratorio: 'Laboratorio',
        certificacion: 'Certificación',
        listo: 'Listo',
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
        Certificación: '📋 Emitiendo certificado',
        Listo: '✅ ¡Listo para entrega!',
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
    m += '_Escribe *0* para el menú principal._';
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
            return { text: formatearRespuestaEstatus(lista[0]) };
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
            return { text: `✅ *${tm}*\n\n¿Cuál es el nombre del instrumento?\n\n_Ej: Termómetro digital, Manómetro Bourdon, Balanza analítica_` };
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
            return { text: `✅ *${tm}*\n\n¿Cuál es la marca y modelo? (escribe "no sé" si no lo tienes)` };
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
            return { text: `✅ *${tm}*\n\n¿Cuándo fue su última calibración?\n\n_Escribe la fecha en formato DD/MM/AAAA_\n_Ej: 15/03/2024 — Escribe "no sé" si no tienes el dato_` };
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
                text: `✅ Fecha registrada\n\n¿Con qué frecuencia se calibra este equipo?\n\n*1️⃣* Cada 6 meses\n*2️⃣* Cada 1 año (recomendado)\n*3️⃣* Cada 2 años`
            };
        }
        case 5: {
            const periodos = { '1': 6, '2': 12, '3': 24 };
            const ms = periodos[texto.trim()];
            if (!ms) {
                return await manejarFalloIntento(wa, sesion, {
                    reintento: `${MSG_COTIZ_REINTENTO}\n\n_Elige *1*, *2* o *3*._`,
                    escala: MSG_COTIZ_ESCALA,
                    claveIntentos: I_REG_EQ,
                    motivoEscalado: 'Registro equipo: periodicidad no reconocida'
                });
            }
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
    try {
        await db.query(
            'INSERT INTO escalados (cliente_whatsapp, motivo, estatus) VALUES (?, ?, "pendiente")',
            [wa, (texto || '').substring(0, 400)]
        );
    } catch {}
    await guardarSesion(wa, null, estadoTrasEscalado(sesion.datos));
    return {
        text: '🧑‍💼 *Conectando con un asesor SICAMET...*\n\nUn representante se pondrá en contacto contigo muy pronto.\n\n📞 Si es urgente, llama directamente al *722 270 1584*\n\n_Escribe *0* cuando quieras volver al menú principal._'
    };
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
    esNodoConsultaEstatus,
    escalarAHumanoLogic,
    responderMenuPrincipal,
    getConfigHorario,
    invalidarCacheConfig,
    getEstado: getSesion,
    limpiarEstado: wa => guardarSesion(wa, null, {})
};
