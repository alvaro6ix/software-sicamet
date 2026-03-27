/**
 * Motor de Flujos Conversacionales — SICAMET Bot PRO
 * Maneja los estados de cotización, registro de equipos y escalado.
 */
const db = require('./bd');

// Estado en memoria de conversaciones activas (para flujos multi-paso)
// { "whatsapp_id": { flujo: "COTIZACION", paso: 1, datos: {} } }
const estadosConversacion = new Map();

// Mensajes de respuesta rápida con botones numerados
const MENU_PRINCIPAL = `¡Hola! 👋 Soy el asistente virtual de *SICAMET*.\n\n¿En qué te podemos ayudar hoy?\n\n*1️⃣* 📋 Solicitar cotización de calibración\n*2️⃣* 🔍 Consultar estatus de mi equipo\n*3️⃣* 📅 Mis equipos y recordatorios\n*4️⃣* 🎓 Servicios y acreditaciones\n*5️⃣* 📞 Contacto y ubicaciones\n*6️⃣* 🧑‍💼 Hablar con un asesor\n\n_Puedes tocar o escribir el número de tu opción_`;

const MENU_COTIZACION = `📋 *Cotización de Calibración*\n\nVamos a preparar tu solicitud. Primero dime:\n\n¿Qué tipo de equipo quieres calibrar?\n\n*1️⃣* 🌡️ Temperatura (termómetros, sensores RTD, termopares)\n*2️⃣* ⚡ Presión (manómetros, transmisores)\n*3️⃣* ⚖️ Masa / Fuerza (balanzas, dinamómetros)\n*4️⃣* 💡 Eléctrica (multímetros, calibradores)\n*5️⃣* 📏 Dimensional (calibradores, micrómetros)\n*6️⃣* 💧 Humedad / Flujo / Volumen\n*7️⃣* 🔧 Otro tipo de instrumento\n\n_O simplemente descríbelo con tus palabras_`;

const TIPOS_EQUIPO = {
    '1': 'Temperatura', '2': 'Presión', '3': 'Masa / Fuerza',
    '4': 'Eléctrica', '5': 'Dimensional', '6': 'Humedad / Flujo / Volumen', '7': 'Otro'
};

/**
 * Obtiene o crea el estado de la conversación de un usuario.
 */
function getEstado(whatsapp) {
    if (!estadosConversacion.has(whatsapp)) {
        estadosConversacion.set(whatsapp, { flujo: null, paso: 0, datos: {} });
    }
    return estadosConversacion.get(whatsapp);
}

function setEstado(whatsapp, estado) {
    estadosConversacion.set(whatsapp, estado);
}

function limpiarEstado(whatsapp) {
    estadosConversacion.delete(whatsapp);
}

/**
 * Obtiene el perfil del cliente desde la BD
 */
async function getPerfilCliente(whatsapp) {
    try {
        const [sesion] = await db.query('SELECT * FROM sesiones WHERE cliente_whatsapp = ?', [whatsapp]);
        const [equipos] = await db.query(
            'SELECT * FROM equipos_cliente WHERE cliente_whatsapp = ? AND activo = 1 ORDER BY proxima_calibracion ASC LIMIT 3',
            [whatsapp]
        );
        const [cotizaciones] = await db.query(
            'SELECT COUNT(*) as total FROM cotizaciones_bot WHERE cliente_whatsapp = ?', [whatsapp]
        );
        return {
            esConocido: sesion.length > 0,
            sesion: sesion[0] || null,
            equipos,
            totalCotizaciones: cotizaciones[0]?.total || 0
        };
    } catch (err) {
        return { esConocido: false, sesion: null, equipos: [], totalCotizaciones: 0 };
    }
}

/**
 * Procesador principal de mensajes del bot.
 * Devuelve el texto de respuesta (o array de respuestas).
 */
async function procesarMensaje(whatsapp, texto, detectarIntencion, respuestaIA) {
    const textoLower = texto.toLowerCase().trim();
    const estado = getEstado(whatsapp);

    // ── Si hay un flujo activo, continuarlo ─────────────────────────────────
    if (estado.flujo === 'COTIZACION') {
        return await flujosCotizacion(whatsapp, texto, estado);
    }
    if (estado.flujo === 'REGISTRO_EQUIPO') {
        return await flujosRegistroEquipo(whatsapp, texto, estado);
    }

    // ── Comandos directos (siempre disponibles) ──────────────────────────────
    if (['0', 'menu', 'menú', 'inicio', 'start', 'reiniciar'].includes(textoLower)) {
        limpiarEstado(whatsapp);
        return MENU_PRINCIPAL;
    }

    // ── Menú principal por número ─────────────────────────────────────────────
    if (textoLower === '1' || textoLower === '2' || textoLower === '3' ||
        textoLower === '4' || textoLower === '5' || textoLower === '6') {
        return await manejarMenuPrincipal(whatsapp, textoLower, estado);
    }

    // ── Detección de intención con IA ─────────────────────────────────────────
    const { accion } = await detectarIntencion(texto);
    
    // Saludo con contexto personalizado
    if (accion === 'SALUDO') {
        const perfil = await getPerfilCliente(whatsapp);
        if (perfil.esConocido && perfil.equipos.length > 0) {
            const empresa = perfil.sesion?.nombre_empresa || '';
            const equipo = perfil.equipos[0];
            return `¡Bienvenido de regreso${empresa ? `, *${empresa}*` : ''}! 👋\n\nRegistramos tu equipo *${equipo.nombre_equipo}* con vencimiento próximo. ¿Qué necesitas hoy?\n\n${MENU_PRINCIPAL.split('\n').slice(2).join('\n')}`;
        }
        return MENU_PRINCIPAL;
    }

    if (accion === 'COTIZACION') {
        setEstado(whatsapp, { flujo: 'COTIZACION', paso: 1, datos: { textoOriginal: texto } });
        return MENU_COTIZACION;
    }

    if (accion === 'ESTATUS') {
        return '🔍 Por favor escríbeme el *número de orden o cotización* para consultar el estatus de tu equipo.\n\n_Ejemplo: OC-2025-001_';
    }

    if (accion === 'RECORDATORIO' || accion === 'REGISTRO_EQUIPO') {
        const perfil = await getPerfilCliente(whatsapp);
        if (perfil.equipos.length > 0) {
            let msg = `📅 *Tus equipos registrados:*\n\n`;
            perfil.equipos.forEach((e, i) => {
                const fecha = e.proxima_calibracion ? new Date(e.proxima_calibracion).toLocaleDateString('es-MX') : 'No registrada';
                msg += `*${i+1}.* ${e.nombre_equipo}${e.marca ? ` (${e.marca})` : ''}\n   📅 Vence: ${fecha}\n\n`;
            });
            msg += `¿Deseas registrar un nuevo equipo?\n*1️⃣* Sí, registrar equipo  *2️⃣* Volver al menú`;
            setEstado(whatsapp, { flujo: 'REGISTRO_EQUIPO_CONFIRM', paso: 0, datos: {} });
            return msg;
        }
        setEstado(whatsapp, { flujo: 'REGISTRO_EQUIPO', paso: 1, datos: {} });
        return `📅 *Registro de Equipos para Recordatorios*\n\nAún no tienes equipos registrados. Puedo avisarte antes de que venza tu certificado de calibración. 🔔\n\n¿Cuál es el nombre de tu empresa o tu nombre?`;
    }

    if (accion === 'ESCALAR') {
        return await escalarAHumano(whatsapp, texto);
    }

    if (accion === 'NORMATIVO') {
        return await respuestaIA(texto, 'El cliente pregunta sobre normas, acreditaciones o requisitos de calibración para auditorías.');
    }

    if (accion === 'SERVICIOS') {
        return `🏆 *Servicios SICAMET*\n\n✅ *Calibración In-Lab* — Trae tus equipos al laboratorio\n✅ *Calibración In-situ* — Vamos a tus instalaciones\n✅ *Calibración personalizada* — Adaptada a tus puntos críticos\n✅ *Calificación de equipos* — DQ/IQ/OQ/PQ (ISO 17025)\n✅ *Consultoría y capacitación* — Metrología aplicada\n✅ *Partner Vaisala* — Servicio oficial en México\n\n📍 Sedes: Toluca · CDMX · Querétaro · Guadalajara\n✨ 12 acreditaciones internacionales · 21 años de experiencia\n\n_Escribe *1* para solicitar cotización_`;
    }

    if (accion === 'CONTACTO') {
        return `📞 *Contáctanos*\n\n🏢 *Officina Principal — Toluca*\nJuan Aldama Sur 1135, Col. Universidad, C.P. 50130\n\n📱 *Teléfonos:*\n722 270 1584\n722 212 0722\n\n📧 *Email:* sclientes@sicamet.net\n🌐 *Web:* sicamet.mx\n\n⏰ *Horario:* Lunes a Viernes 8:00–18:00\n\n_Escribe *1* para cotizar o *6* para hablar con un asesor_`;
    }

    // Fallback: respuesta de IA contextual
    return await respuestaIA(texto);
}

/**
 * Maneja las selecciones del menú principal (1-6).
 */
async function manejarMenuPrincipal(whatsapp, opcion, estado) {
    switch(opcion) {
        case '1':
            setEstado(whatsapp, { flujo: 'COTIZACION', paso: 1, datos: {} });
            return MENU_COTIZACION;
        case '2':
            return '🔍 Escribe el *número de orden o cotización* para consultar:\n\n_Ejemplo: OC-2025-001 o COT-2025-123_';
        case '3':
            setEstado(whatsapp, { flujo: 'REGISTRO_EQUIPO', paso: 1, datos: {} });
            return `📅 *Registro de Equipos*\n\nVoy a registrar tu equipo para enviarte recordatorios antes de que venza tu certificado. 🔔\n\n¿Cuál es el nombre de tu empresa o tu nombre?`;
        case '4':
            return `🏆 *Servicios SICAMET*\n\n✅ Calibración In-Lab / In-situ / Personalizada\n✅ Calificación DQ/IQ/OQ/PQ (ISO 17025)\n✅ Consultoría y Capacitación en Metrología\n✅ Partner Oficial Vaisala en México\n\n*Magnitudes acreditadas:*\nPresión · Temperatura · Fuerza · Masa · Eléctrica\nDimensional · Flujo · Humedad · Óptica · Volumen\n\n12 Acreditaciones Internacionales · EMA · PJLA\n21 años de trayectoria\n\n_Escribe *1* para cotizar_`;
        case '5':
            return `📞 *Información de Contacto*\n\n📍 Toluca · CDMX · Querétaro · Guadalajara\n\n📱 722 270 1584 | 722 212 0722\n📧 sclientes@sicamet.net\n🌐 sicamet.mx\n\n⏰ Lun–Vie 8:00–18:00`;
        case '6':
            return await escalarAHumano(whatsapp, 'Solicitud desde menú principal');
        default:
            return MENU_PRINCIPAL;
    }
}

/**
 * Flujo paso a paso de cotización automática.
 */
async function flujosCotizacion(whatsapp, texto, estado) {
    const { paso, datos } = estado;
    let respuesta = '';

    switch(paso) {
        case 1: // Tipo de equipo
            const tipoSeleccionado = TIPOS_EQUIPO[texto.trim()] || texto;
            setEstado(whatsapp, { flujo: 'COTIZACION', paso: 2, datos: { ...datos, tipoEquipo: tipoSeleccionado } });
            respuesta = `✅ *${tipoSeleccionado}*\n\n¿Cuál es la *marca y modelo* del instrumento?\n\n_Ejemplo: Fluke 726 | Vaisala HMT310 | WIKA P-30_\n_(Escribe "no sé" si no tienes el dato)_`;
            break;
        case 2: // Marca y modelo
            setEstado(whatsapp, { flujo: 'COTIZACION', paso: 3, datos: { ...datos, marcaModelo: texto } });
            respuesta = `✅ *${texto}*\n\n¿Cuántos instrumentos necesitas calibrar?`;
            break;
        case 3: // Cantidad
            const cantidad = parseInt(texto) || 1;
            setEstado(whatsapp, { flujo: 'COTIZACION', paso: 4, datos: { ...datos, cantidad } });
            respuesta = `✅ *${cantidad} instrumento(s)*\n\n¿El servicio es?\n\n*1️⃣* 🔬 En el laboratorio SICAMET (In-Lab)\n*2️⃣* 🏭 En tus instalaciones (In-situ)\n*3️⃣* 💬 Aún no lo sé`;
            break;
        case 4: // Tipo de servicio
            const tiposServicio = { '1': 'In-Lab', '2': 'In-situ', '3': 'Por definir' };
            const tipoServicio = tiposServicio[texto.trim()] || texto;
            setEstado(whatsapp, { flujo: 'COTIZACION', paso: 5, datos: { ...datos, tipoServicio } });
            respuesta = `✅ *${tipoServicio}*\n\n¿Cuál es el nombre de tu empresa o razón social?`;
            break;
        case 5: // Empresa
            setEstado(whatsapp, { flujo: 'COTIZACION', paso: 6, datos: { ...datos, empresa: texto } });
            respuesta = `✅ *${texto}*\n\n¿Alguna nota adicional? (rango de medición, urgencia, ubicación, etc.)\n\n_Escribe "ninguna" para omitir_`;
            break;
        case 6: // Notas y guardar
            const notas = texto.toLowerCase() === 'ninguna' ? '' : texto;
            const datosFinales = { ...datos, notas };
            
            // Guardar en BD
            try {
                await db.query(
                    `INSERT INTO cotizaciones_bot (cliente_whatsapp, nombre_empresa, tipo_equipo, marca, cantidad, tipo_servicio, notas)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        whatsapp,
                        datosFinales.empresa || '',
                        datosFinales.tipoEquipo || '',
                        datosFinales.marcaModelo || '',
                        datosFinales.cantidad || 1,
                        datosFinales.tipoServicio === 'In-Lab' ? 'in-lab' : datosFinales.tipoServicio === 'In-situ' ? 'in-situ' : 'por-definir',
                        datosFinales.notas || ''
                    ]
                );
                console.log(`💰 Nueva cotización bot: ${whatsapp} — ${datosFinales.tipoEquipo}`);
            } catch (e) {
                console.error('Error guardando cotización:', e.message);
            }

            limpiarEstado(whatsapp);
            respuesta = `✅ *¡Solicitud de cotización recibida!*\n\n📋 *Resumen:*\n• Equipo: *${datosFinales.tipoEquipo}*\n• Marca/Modelo: *${datosFinales.marcaModelo || 'No especificado'}*\n• Cantidad: *${datosFinales.cantidad}*\n• Servicio: *${datosFinales.tipoServicio}*\n• Empresa: *${datosFinales.empresa}*\n\n🤝 Un asesor de SICAMET te contactará en breve con tu cotización personalizada.\n\n📞 *722 270 1584* | 📧 *sclientes@sicamet.net*\n\n_Escribe *0* para volver al menú_`;
            break;
        default:
            limpiarEstado(whatsapp);
            respuesta = MENU_PRINCIPAL;
    }
    return respuesta;
}

/**
 * Flujo de registro de equipos para recordatorios.
 */
async function flujosRegistroEquipo(whatsapp, texto, estado) {
    const { paso, datos } = estado;

    switch(paso) {
        case 1: // Empresa
            setEstado(whatsapp, { flujo: 'REGISTRO_EQUIPO', paso: 2, datos: { empresa: texto } });
            return `✅ *${texto}*\n\n¿Cuál es el nombre del instrumento?\n\n_Ejemplo: Termómetro digital | Manómetro diferencial | Balanza analítica_`;
        case 2: // Nombre del equipo
            setEstado(whatsapp, { flujo: 'REGISTRO_EQUIPO', paso: 3, datos: { ...datos, nombreEquipo: texto } });
            return `✅ *${texto}*\n\n¿Cuál es la marca y modelo? _(o escribe "no sé")_`;
        case 3: // Marca/Modelo
            setEstado(whatsapp, { flujo: 'REGISTRO_EQUIPO', paso: 4, datos: { ...datos, marcaModelo: texto } });
            return `✅ *${texto}*\n\n¿Cuándo fue su *última calibración*?\n\n_Formato: DD/MM/AAAA — o escribe "no sé"_`;
        case 4: // Última calibración
            let fechaUltima = null;
            if (texto.toLowerCase() !== 'no sé' && texto.toLowerCase() !== 'no se') {
                const partes = texto.split('/');
                if (partes.length === 3) {
                    fechaUltima = `${partes[2]}-${partes[1].padStart(2,'0')}-${partes[0].padStart(2,'0')}`;
                }
            }
            setEstado(whatsapp, { flujo: 'REGISTRO_EQUIPO', paso: 5, datos: { ...datos, fechaUltima } });
            return `✅ *${texto}*\n\n¿Cada cuánto debe calibrarse este instrumento?\n\n*1️⃣* 6 meses\n*2️⃣* 1 año _(más común)_\n*3️⃣* 2 años\n*4️⃣* Otro período`;
        case 5: // Periodicidad
            const periodos = { '1': 6, '2': 12, '3': 24 };
            const meses = periodos[texto.trim()] || 12;
            
            // Calcular próxima calibración
            let proximaFecha = null;
            if (datos.fechaUltima) {
                const ultima = new Date(datos.fechaUltima);
                ultima.setMonth(ultima.getMonth() + meses);
                proximaFecha = ultima.toISOString().split('T')[0];
            }

            try {
                await db.query(
                    `INSERT INTO equipos_cliente 
                     (cliente_whatsapp, nombre_empresa, nombre_equipo, marca, ultima_calibracion, periodicidad_meses, proxima_calibracion)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        whatsapp,
                        datos.empresa || '',
                        datos.nombreEquipo,
                        datos.marcaModelo || '',
                        datos.fechaUltima || null,
                        meses,
                        proximaFecha
                    ]
                );
            } catch (e) {
                console.error('Error registrando equipo:', e.message);
            }

            limpiarEstado(whatsapp);
            const fechaDisplay = proximaFecha ? new Date(proximaFecha).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }) : 'No calculada';
            return `✅ *¡Equipo registrado exitosamente!*\n\n📦 *${datos.nombreEquipo}*\n📅 Próxima calibración: *${fechaDisplay}*\n🔔 Te avisaré 30 y 7 días antes del vencimiento\n\n_Escribe *3* para ver todos tus equipos_\n_Escribe *0* para volver al menú_`;
        default:
            limpiarEstado(whatsapp);
            return MENU_PRINCIPAL;
    }
}

/**
 * Escala la conversación a un agente humano.
 */
async function escalarAHumano(whatsapp, motivoTexto) {
    try {
        // Registrar escalado en BD
        await db.query(
            'INSERT INTO escalados (cliente_whatsapp, motivo, estatus) VALUES (?, ?, "pendiente")',
            [whatsapp, motivoTexto.substring(0, 499)]
        );
    } catch (e) { /* no interrumpir */ }

    return `🧑‍💼 *Transferiendo con un asesor SICAMET...*\n\nUn especialista revisará tu consulta y te contactará en breve.\n\n📞 También puedes llamarnos directamente:\n*722 270 1584 | 722 212 0722*\n\n📧 *sclientes@sicamet.net*\n⏰ Lun–Vie 8:00–18:00\n\n_Escribe *0* para volver al menú_`;
}

/**
 * Maneja la consulta de estatus de equipo por número de O.S.
 */
async function consultarEstatus(whatsapp, texto) {
    try {
        const busqueda = texto.trim().toUpperCase();
        const [info] = await db.query(
            'SELECT * FROM instrumentos_estatus WHERE orden_cotizacion = ?',
            [busqueda]
        );
        if (info.length > 0) {
            const eq = info[0];
            const fechaIngreso = new Date(eq.fecha_ingreso).toLocaleDateString('es-MX');
            const fechaEntrega = eq.fecha_entrega ? new Date(eq.fecha_entrega).toLocaleDateString('es-MX') : 'Por confirmar';
            return `🔍 *Estatus de Equipo — SICAMET*\n\n📦 *Equipo:* ${eq.nombre_instrumento}\n🚩 *Estatus:* ${eq.estatus_actual}\n📅 *Ingreso:* ${fechaIngreso}\n📦 *Entrega estimada:* ${fechaEntrega}\n\n_¿Más dudas? Escribe *6* para hablar con un asesor_`;
        }
        return `❌ No encontramos la orden *${busqueda}* en nuestro sistema.\n\nVerifica el número o escribe *6* para que un asesor te ayude.\n\n📞 722 270 1584`;
    } catch (e) {
        return '❌ Error consultando el estatus. Por favor contacta directamente al 722 270 1584.';
    }
}

module.exports = { 
    procesarMensaje, 
    consultarEstatus, 
    getEstado, 
    limpiarEstado, 
    MENU_PRINCIPAL,
    estadosConversacion
};
