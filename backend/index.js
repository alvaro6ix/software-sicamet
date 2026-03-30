const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const db = require('./bd');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const pdf = require('pdf-parse');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

// Módulos del Bot PRO
const botIA = require('./bot_ia');
const botFlujos = require('./bot_flujos');
const { ejecutarRecordatorios } = require('./bot_recordatorios');

// Autenticación
const { generarToken, verificarToken, verificarPassword } = require('./auth');

const app = express();
const port = 3001;

// Multer en memoria (para PDFs/Excel) y en disco (para media del bot)
const upload = multer({ storage: multer.memoryStorage() });
const uploadsDir = path.join(__dirname, 'uploads', 'bot');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const uploadDisk = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadsDir),
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname);
            cb(null, `media_${Date.now()}${ext}`);
        }
    }),
    limits: { fileSize: 20 * 1024 * 1024 } // 20MB max
});

app.use(cors());
app.use(express.json());
// Servir archivos subidos públicamente
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- ESTADÍSTICAS ---
app.get('/api/stats', async (req, res) => {
    try {
        const [enCalibracion] = await db.query("SELECT COUNT(*) as total FROM instrumentos_estatus WHERE estatus_actual != 'Entregado'");
        const [proximosSLA] = await db.query("SELECT COUNT(*) as total FROM instrumentos_estatus WHERE sla <= 10 AND estatus_actual != 'Entregado'");
        
        // Obtenemos todos los registros para armar las métricas de ingresos vs entregas
        const [ingresosData] = await db.query("SELECT DAYNAME(fecha_ingreso) as dia, COUNT(*) as cantidad FROM instrumentos_estatus GROUP BY dia");
        const [entregasData] = await db.query("SELECT DAYNAME(fecha_entrega) as dia, COUNT(*) as cantidad FROM instrumentos_estatus WHERE estatus_actual = 'Entregado' AND fecha_entrega IS NOT NULL GROUP BY dia");

        const diasMapeados = { 'Monday': 'Lun', 'Tuesday': 'Mar', 'Wednesday': 'Mié', 'Thursday': 'Jue', 'Friday': 'Vie', 'Saturday': 'Sáb', 'Sunday': 'Dom' };
        
        const chartDataMapeada = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'].map(diaCorto => {
            return { name: diaCorto, ingresos: 0, entregados: 0 };
        });

        ingresosData.forEach(row => {
            const diac = diasMapeados[row.dia];
            const indice = chartDataMapeada.findIndex(d => d.name === diac);
            if (indice !== -1) chartDataMapeada[indice].ingresos = row.cantidad;
        });

        entregasData.forEach(row => {
            const diac = diasMapeados[row.dia];
            const indice = chartDataMapeada.findIndex(d => d.name === diac);
            if (indice !== -1) chartDataMapeada[indice].entregados = row.cantidad;
        });
        
        res.json({ 
            enCalibracion: enCalibracion[0].total || 0, 
            proximosSLA: proximosSLA[0].total || 0, 
            acreditaciones: 12,
            chartData: chartDataMapeada
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});


app.get('/api/heatmap', async (req, res) => {
    try {
        // Obtenemos distribución de mensajes entrantes por Día y Hora
        const [rows] = await db.query(`
            SELECT DAYNAME(fecha) as dia, HOUR(fecha) as hora, COUNT(*) as cantidad 
            FROM chat_mensajes 
            WHERE direccion = 'in' 
            GROUP BY dia, hora
        `);
        res.json(rows);
    } catch(err) { res.status(500).json({error: err.message}); }
});

app.get('/api/kpis_negocio', async (req, res) => {
    try {
        // Métricas Core del Laboratorio y CRM
        const [leads] = await db.query(`SELECT COUNT(*) as total FROM chat_leads WHERE estado='Pendiente'`);
        const [detenidos] = await db.query(`SELECT COUNT(*) as total FROM instrumentos_estatus WHERE estatus_actual='Laboratorio' AND fecha_ingreso < NOW() - INTERVAL 2 DAY`);
        const [listosSinNotificar] = await db.query(`SELECT COUNT(*) as total FROM instrumentos_estatus WHERE estatus_actual='Listo'`);
        const [esperando] = await db.query(`SELECT COUNT(DISTINCT telefono) as total FROM chat_mensajes WHERE direccion='in' AND fecha > NOW() - INTERVAL 12 HOUR`);
        
        // Pipeline counts
        const [qRecep] = await db.query(`SELECT COUNT(*) as total FROM instrumentos_estatus WHERE estatus_actual='Recepción'`);
        const [qLab] = await db.query(`SELECT COUNT(*) as total FROM instrumentos_estatus WHERE estatus_actual='Laboratorio'`);
        const [qCert] = await db.query(`SELECT COUNT(*) as total FROM instrumentos_estatus WHERE estatus_actual LIKE '%Certificación%'`);
        const [qEnt] = await db.query(`SELECT COUNT(*) as total FROM instrumentos_estatus WHERE estatus_actual='Entregado'`);

        // Tiempo Promedio Real (en minutos)
        const [avgTime] = await db.query(`SELECT AVG(tiempo_respuesta_seg) as avg_sec FROM chat_mensajes WHERE tiempo_respuesta_seg IS NOT NULL`);
        let avgMin = 0;
        if (avgTime.length > 0 && avgTime[0].avg_sec) {
            avgMin = Math.round(avgTime[0].avg_sec / 60);
        }

        res.json({
            clientes_esperando: esperando[0].total || 0,
            nuevos_leads: leads[0].total || 0,
            detenidos_laboratorio: detenidos[0].total || 0,
            listos_sin_notificar: listosSinNotificar[0].total || 0,
            conversaciones_activas: esperando[0].total || 0,
            tiempo_promedio_min: avgMin,
            pipeline: {
                recepcion: qRecep[0].total || 0,
                laboratorio: qLab[0].total || 0,
                certificacion: qCert[0].total || 0,
                listo: listosSinNotificar[0].total || 0,
                entregado: qEnt[0].total || 0
            }
        });
    } catch(err) { res.status(500).json({error: err.message}); }
});

// --- OPERACIONES DE INSTRUMENTOS (CRUD MULTIRREGISTRO) ---
app.post('/api/instrumentos-multiple', async (req, res) => {
    const { instrumentos } = req.body; 
    if (!instrumentos || instrumentos.length === 0) return res.status(400).json({error: "No hay datos"});

    try {
        const query = `INSERT INTO instrumentos_estatus 
            (orden_cotizacion, empresa, persona, tipo_servicio, nombre_instrumento, marca, modelo, no_serie, sla, estatus_actual) 
            VALUES ?`; 
        
        const valores = instrumentos.map(ins => [
            ins.orden_cotizacion, ins.empresa, ins.persona, ins.tipo_servicio, ins.nombre_instrumento, 
            ins.marca, ins.modelo, ins.no_serie, ins.sla, 'Recepción'
        ]);

        await db.query(query, [valores]);
        console.log(`✅ Registradas ${instrumentos.length} partidas de la orden ${instrumentos[0].orden_cotizacion}`);
        res.json({ success: true, count: instrumentos.length });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/instrumentos', async (req, res) => {
    try {
        const [equipos] = await db.query('SELECT * FROM instrumentos_estatus ORDER BY fecha_ingreso DESC');
        res.json(equipos);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/instrumentos/:id/estatus', async (req, res) => {
    try {
        const estatus = req.body.estatus;
        if (estatus === 'Entregado') {
            await db.query('UPDATE instrumentos_estatus SET estatus_actual = ?, fecha_entrega = CURRENT_TIMESTAMP WHERE id = ?', [estatus, req.params.id]);
        } else {
            await db.query('UPDATE instrumentos_estatus SET estatus_actual = ? WHERE id = ?', [estatus, req.params.id]);
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/instrumentos/:id', async (req, res) => {
    try {
        const { orden_cotizacion, nombre_instrumento, marca, no_serie, empresa } = req.body;
        await db.query(
            'UPDATE instrumentos_estatus SET orden_cotizacion=?, nombre_instrumento=?, marca=?, no_serie=?, empresa=? WHERE id=?', 
            [orden_cotizacion, nombre_instrumento, marca, no_serie, empresa, req.params.id]
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/instrumentos/:id/estatus', async (req, res) => {
    try {
        const { estatus } = req.body;
        await db.query('UPDATE instrumentos_estatus SET estatus_actual=? WHERE id=?', [estatus, req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/instrumentos/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM instrumentos_estatus WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- RUTAS DE CATÁLOGOS ---
const tablasCatalogos = {
    'clientes': 'cat_clientes',
    'instrumentos': 'cat_instrumentos',
    'marcas': 'cat_marcas',
    'modelos': 'cat_modelos'
};

app.get('/api/catalogo/:tipo', async (req, res) => {
    const tabla = tablasCatalogos[req.params.tipo];
    if (!tabla) return res.status(400).json({ error: 'Catálogo inválido' });
    try {
        const [rows] = await db.query(`SELECT * FROM ${tabla} ORDER BY id DESC`);
        res.json(rows);
    } catch(err) { res.status(500).json({error: err.message}); }
});

app.post('/api/catalogo/:tipo', async (req, res) => {
    const tabla = tablasCatalogos[req.params.tipo];
    if (!tabla) return res.status(400).json({ error: 'Catálogo inválido' });
    try {
        const body = req.body;
        if (req.params.tipo === 'clientes') {
            const empresa = body.empresa || body.contacto;
            const contacto = body.contacto || '';
            const email = body.email || '';
            await db.query(`INSERT INTO ${tabla} (nombre, contacto, email) VALUES (?, ?, ?)`, [empresa, contacto, email]);
        } else if (req.params.tipo === 'modelos') {
            await db.query(`INSERT INTO ${tabla} (nombre, marca) VALUES (?, ?)`, [body.nombre, body.marca]);
        } else {
            // para marcas o instrumentos
            await db.query(`INSERT INTO ${tabla} (nombre) VALUES (?)`, [body.nombre]);
        }
        res.json({ success: true, message: 'Guardado correctamente' });
    } catch(err) { res.status(500).json({error: err.message}); }
});

app.put('/api/catalogo/:tipo/:id', async (req, res) => {
    const tabla = tablasCatalogos[req.params.tipo];
    if (!tabla) return res.status(400).json({ error: 'Catálogo inválido' });
    try {
        const body = req.body;
        if (req.params.tipo === 'clientes') {
            const empresa = body.empresa || body.contacto;
            const contacto = body.contacto || '';
            const email = body.email || '';
            await db.query(`UPDATE ${tabla} SET nombre=?, contacto=?, email=? WHERE id=?`, [empresa, contacto, email, req.params.id]);
        } else if (req.params.tipo === 'modelos') {
            await db.query(`UPDATE ${tabla} SET nombre=?, marca=? WHERE id=?`, [body.nombre, body.marca, req.params.id]);
        } else {
            // para marcas o instrumentos
            await db.query(`UPDATE ${tabla} SET nombre=? WHERE id=?`, [body.nombre, req.params.id]);
        }
        res.json({ success: true, message: 'Actualizado correctamente' });
    } catch(err) { res.status(500).json({error: err.message}); }
});

// --- LEADS ---
app.get('/api/leads', async (req, res) => {
    try {
        const [rows] = await db.query("SELECT * FROM chat_leads ORDER BY id DESC");
        res.json(rows);
    } catch(err) { res.status(500).json({error: err.message}); }
});

app.post('/api/leads', async (req, res) => {
    try {
        const { telefono, nombre, interes } = req.body;
        await db.query("INSERT INTO chat_leads (telefono, nombre, interes, estado) VALUES (?, ?, ?, 'Pendiente')", [telefono, nombre, interes]);
        res.json({success: true});
    } catch(err) { res.status(500).json({error: err.message}); }
});

app.put('/api/leads/:id', async (req, res) => {
    try {
        const { estado } = req.body;
        await db.query("UPDATE chat_leads SET estado = ? WHERE id = ?", [estado, req.params.id]);
        res.json({success: true});
    } catch(err) { res.status(500).json({error: err.message}); }
});

app.delete('/api/catalogo/:tipo/all', async (req, res) => {
    const tabla = tablasCatalogos[req.params.tipo];
    if (!tabla) return res.status(400).json({ error: 'Catálogo inválido' });
    try {
        await db.query(`DELETE FROM ${tabla}`);
        await db.query(`ALTER TABLE ${tabla} AUTO_INCREMENT = 1`);
        res.json({ success: true, message: 'Todos los registros eliminados masivamente' });
    } catch(err) { res.status(500).json({error: err.message}); }
});

app.delete('/api/catalogo/:tipo/:id', async (req, res) => {
    const tabla = tablasCatalogos[req.params.tipo];
    if (!tabla) return res.status(400).json({ error: 'Catálogo inválido' });
    try {
        await db.query(`DELETE FROM ${tabla} WHERE id = ?`, [req.params.id]);
        res.json({ success: true });
    } catch(err) { res.status(500).json({error: err.message}); }
});

app.post('/api/importar-catalogo', upload.single('archivoExcel'), async (req, res) => {
    const { tipo } = req.body; 
    try {
        if (!req.file) return res.status(400).json({ error: 'No se subió ningún archivo' });
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const datos = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
        const tabla = tablasCatalogos[tipo];
        if (!tabla) return res.status(400).json({ error: 'Tipo inválido' });
        
        let agregados = 0;
        for (let fila of datos) {
            // Normalizar llaves para evitar fallos por espacios o acentos ("Teléfono" -> "telefono", "Nombre (Empresa)" -> "nombreempresa")
            const filaNorm = {};
            for (let k in fila) {
                const cleanKey = k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
                filaNorm[cleanKey] = fila[k];
            }

            // Use fallback mechanism safely
            const getStr = (val) => val != null ? String(val).trim() : '';

            const nombreOriginal = getStr(filaNorm.nombre || filaNorm.nombreempresa || filaNorm.empresa || filaNorm.cliente || filaNorm.modelo || filaNorm.razonsocial || filaNorm.marca || filaNorm.descripcion);
            const marca = getStr(filaNorm.marca || 'Desconocida');
            const contactoOriginal = getStr(filaNorm.contacto || filaNorm.contactoprincipal || filaNorm.telefono || filaNorm.tel || filaNorm.celular || filaNorm.numero);
            const emailOriginal = getStr(filaNorm.email || filaNorm.correo || filaNorm.correoelectronico || filaNorm.mailempresa);
            
            if (nombreOriginal) {
                if (tipo === 'modelos') {
                    await db.query(`INSERT INTO ${tabla} (nombre, marca) VALUES (?, ?) ON DUPLICATE KEY UPDATE marca=VALUES(marca)`, [nombreOriginal, marca]);
                } else if (tipo === 'clientes') {
                    await db.query(`INSERT INTO ${tabla} (nombre, contacto, email) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE contacto=VALUES(contacto), email=VALUES(email)`, [nombreOriginal, contactoOriginal, emailOriginal]);
                } else {
                    await db.query(`INSERT IGNORE INTO ${tabla} (nombre) VALUES (?)`, [nombreOriginal]);
                }
                agregados++;
            }
        }
        res.json({ success: true, message: `Catálogo de ${tipo} actualizado con ${agregados} registros.` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- INTELIGENCIA PDF v19 (PYTHON + PDFPLUMBER PARA TABLAS COMPLEJAS) ---
const { execFile } = require('child_process');

app.post('/api/leer-pdf', upload.single('archivoPdf'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Sin archivo' });

        // Guardar temporalmente el PDF para que lo lea Python
        const tempPath = path.join(__dirname, `temp_${Date.now()}.pdf`);
        fs.writeFileSync(tempPath, req.file.buffer);

        // Llamar al script de Python
        execFile('python', [path.join(__dirname, 'pdf_parser.py'), tempPath], { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
            // Borramos el PDF sin importar si falló
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

            if (error) {
                console.error('❌ Error ejecutando Python:', error, stderr);
                return res.status(500).json({ error: 'Fallo al procesar el PDF.' });
            }

            try {
                // Stdout contiene el JSON de resultado
                const resultado = JSON.parse(stdout.trim());
                if (resultado.error) {
                    return res.status(500).json({ error: resultado.error });
                }

                console.log(`✅ EXTRACCIÓN MAESTRA EN PYTHON -> FOLIO: "${resultado.orden_cotizacion}" | PARTIDAS: ${resultado.partidas.length}`);
                
                res.json({
                    success: true,
                    cabecera: { 
                        orden_cotizacion: resultado.orden_cotizacion, 
                        empresa: resultado.empresa, 
                        persona: resultado.persona, 
                        sla: resultado.sla 
                    },
                    partidas: resultado.partidas
                });
            } catch (err) {
                console.error('❌ Error parseando respuesta de Python:', err, stdout);
                res.status(500).json({ error: 'El parser no generó un JSON válido.' });
            }
        });
    } catch (err) {
        console.error('❌ Error /api/leer-pdf:', err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(port, () => console.log(`🚀 API en http://localhost:${port}`));

// ============================================================
// BOT WHATSAPP — Sistema de Auto-Recuperación Inteligente
// ============================================================
const { MessageMedia } = require('whatsapp-web.js');

let botClient = null;
let isClientConnected = false;
let currentQR = '';
let intentosReinicio = 0;
const MAX_INTENTOS = 3;

/**
 * Limpia todas las carpetas de sesión de WhatsApp Web
 */
function limpiarSesion() {
    const authPath = path.join(__dirname, '.wwebjs_auth');
    const cachePath = path.join(__dirname, '.wwebjs_cache');
    try {
        if (fs.existsSync(authPath)) { fs.rmSync(authPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 1000 }); console.log('🧹 .wwebjs_auth eliminado'); }
        if (fs.existsSync(cachePath)) { fs.rmSync(cachePath, { recursive: true, force: true, maxRetries: 5, retryDelay: 1000 }); }
    } catch (e) { console.error('Error al limpiar sesión:', e.message); }
}

/**
 * Crea e inicializa el cliente de WhatsApp.
 * Si falla por sesión corrupta, limpia y reintenta automáticamente.
 * @param {boolean} sesionLimpia - Si true, ya se limpió la sesión previamente
 */
function iniciarBot(sesionLimpia = false) {
    console.log(`🤖 Iniciando bot WhatsApp${sesionLimpia ? ' (sesión limpia)' : ''}... Intento ${intentosReinicio + 1}/${MAX_INTENTOS}`);

    // Si ya existe un cliente anterior, destruirlo silenciosamente
    if (botClient) {
        try { botClient.destroy(); } catch (e) { /* ignorar */ }
        botClient = null;
    }

    botClient = new Client({
        authStrategy: new LocalAuth({ clientId: 'sicamet-v10-final' }),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--no-first-run',
                '--no-default-browser-check',
                '--disable-infobars',
                '--disable-web-security'
            ],
            handleSIGINT: false,
            executablePath: fs.existsSync('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe') 
                ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' 
                : undefined
        }
    });

    botClient.on('qr', qr => {
        currentQR = qr;
        isClientConnected = false;
        intentosReinicio = 0; // Reset del contador al recibir QR (arrancó bien)
        qrcode.generate(qr, { small: true });
        console.log('📱 QR generado — escanear en WhatsApp > Dispositivos vinculados');
    });

    botClient.on('ready', () => {
        console.log('✅ Bot WhatsApp ACTIVO');
        currentQR = '';
        isClientConnected = true;
        intentosReinicio = 0;
        global.botClient = botClient; // Acceso global para notificaciones
    });

    botClient.on('disconnected', (reason) => {
        console.log('❌ Bot desconectado:', reason);
        currentQR = '';
        isClientConnected = false;
        // Reconexión con sesión existente (desconexión normal, no corrupta)
        setTimeout(() => {
            if (intentosReinicio < MAX_INTENTOS) {
                intentosReinicio++;
                iniciarBot(false);
            } else {
                console.log('⚠️ Reintentos agotados. Limpiando sesión y reintentando una última vez...');
                limpiarSesion();
                intentosReinicio = 0;
                setTimeout(() => iniciarBot(true), 3000);
            }
        }, 5000);
    });

    botClient.on('message', async msg => {
        // Ignorar mensajes de grupos y estados
        if (msg.from.includes('@g.us') || msg.from === 'status@broadcast') return;
        
        const numeroUser = msg.from;
        const textoRecibido = msg.body ? msg.body.trim() : '';
        if (!textoRecibido) return;

        try {
            // Registrar mensaje en historial
            await db.query(
                'INSERT INTO chat_mensajes (cliente_whatsapp, mensaje, tipo) VALUES (?, ?, "entrante") ON DUPLICATE KEY UPDATE message = message',
                [numeroUser, textoRecibido]
            ).catch(() => {}); // No interrumpir si la tabla no existe

            // Verificar si la sesión del usuario necesita número de OC (flujo legacy)
            const [sesion] = await db.query('SELECT * FROM sesiones WHERE cliente_whatsapp = ?', [numeroUser]);
            const nodoActual = sesion[0]?.nodo_actual_id;

            // Consulta de estatus por OC (compatibilidad con flujo anterior)
            if (nodoActual === 5 || /^OC-|^COT-/i.test(textoRecibido)) {
                const resp = await botFlujos.consultarEstatusLogic(numeroUser, textoRecibido);
                await botClient.sendMessage(numeroUser, resp.text);
                if (nodoActual === 5) {
                    await db.query('UPDATE sesiones SET nodo_actual_id = NULL WHERE cliente_whatsapp = ?', [numeroUser]);
                }
                return;
            }

            // Motor PRO: procesar mensaje con IA y flujos
            const respuesta = await botFlujos.procesarMensaje(
                numeroUser, 
                textoRecibido, 
                botIA.detectarIntencion, 
                botIA.respuestaIA
            );

            if (respuesta) {
                await botClient.sendMessage(numeroUser, respuesta);
            }

        } catch (err) { 
            console.error('Error en mensaje bot:', err.message);
            try {
                await botClient.sendMessage(numeroUser, '⚠️ Ocurrió un error temporal. Por favor intenta de nuevo o escribe *0* para el menú.');
            } catch (e2) { /* silenciar */ }
        }
    });

    // Inicializar y capturar fallo de sesión corrupta
    botClient.initialize().catch(err => {
        console.error('💥 Error al inicializar bot:', err.message);
        isClientConnected = false;
        currentQR = '';

        if (intentosReinicio < MAX_INTENTOS) {
            intentosReinicio++;
            const esSesionCorrupta = err.message?.includes('Target closed') ||
                                     err.message?.includes('TargetCloseError') ||
                                     err.message?.includes('Execution context') ||
                                     err.message?.includes('Session closed');
            if (esSesionCorrupta) {
                console.log('🧹 Sesión corrupta detectada — limpiando y reintentando en 5s...');
                limpiarSesion();
                setTimeout(() => iniciarBot(true), 5000);
            } else {
                console.log(`⏳ Reintentando en 10s (intento ${intentosReinicio}/${MAX_INTENTOS})...`);
                setTimeout(() => iniciarBot(false), 10000);
            }
        } else {
            console.log('🛑 Máximo de reintentos alcanzado. El bot permanecerá inactivo hasta un reset manual desde el CRM.');
            intentosReinicio = 0;
        }
    });
}

// ─── API de control del bot ───────────────────────────────────────────────────

app.get('/api/whatsapp/status', (req, res) => {
    res.json({ connected: isClientConnected, qr: currentQR });
});

app.post('/api/whatsapp/reset', async (req, res) => {
    try {
        console.log('♻️ Reset manual solicitado desde CRM...');
        isClientConnected = false;
        currentQR = '';
        intentosReinicio = 0;
        if (botClient) {
            try { await botClient.destroy(); } catch (e) { /* ignorar */ }
            botClient = null;
        }
        limpiarSesion();
        setTimeout(() => iniciarBot(true), 2000);
        res.json({ success: true, message: 'Sesión reiniciada. Generando nuevo QR...' });
    } catch (err) {
        console.error('Error en reset:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/whatsapp/send-media', upload.single('archivo'), async (req, res) => {
    try {
        if (!isClientConnected) return res.status(400).json({ error: 'Bot no conectado' });
        if (!req.file) return res.status(400).json({ error: 'No se incluyó archivo' });
        const numero = req.body.numero;
        if (!numero) return res.status(400).json({ error: 'Número requerido' });
        const media = new MessageMedia(req.file.mimetype, req.file.buffer.toString('base64'), req.file.originalname);
        await botClient.sendMessage(numero, media);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── ENDPOINTS BOT PRO ────────────────────────────────────────────────────────

// Equipos del cliente
app.get('/api/equipos-cliente', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM equipos_cliente WHERE activo = 1 ORDER BY proxima_calibracion ASC');
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/equipos-cliente', async (req, res) => {
    try {
        const { cliente_whatsapp, nombre_empresa, nombre_equipo, marca, modelo, rango, ultima_calibracion, periodicidad_meses } = req.body;
        if (!cliente_whatsapp || !nombre_equipo) return res.status(400).json({ error: 'Faltan datos obligatorios' });
        
        let proximaFecha = null;
        if (ultima_calibracion && periodicidad_meses) {
            const ultima = new Date(ultima_calibracion);
            ultima.setMonth(ultima.getMonth() + parseInt(periodicidad_meses));
            proximaFecha = ultima.toISOString().split('T')[0];
        }
        
        const [result] = await db.query(
            'INSERT INTO equipos_cliente (cliente_whatsapp, nombre_empresa, nombre_equipo, marca, modelo, rango, ultima_calibracion, periodicidad_meses, proxima_calibracion) VALUES (?,?,?,?,?,?,?,?,?)',
            [cliente_whatsapp, nombre_empresa || '', nombre_equipo, marca || '', modelo || '', rango || '', ultima_calibracion || null, periodicidad_meses || 12, proximaFecha]
        );
        res.json({ success: true, id: result.insertId });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/equipos-cliente/:id', async (req, res) => {
    try {
        await db.query('UPDATE equipos_cliente SET activo = 0 WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Cotizaciones generadas por el bot
app.get('/api/cotizaciones-bot', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM cotizaciones_bot ORDER BY created_at DESC LIMIT 100');
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/cotizaciones-bot/:id/estatus', async (req, res) => {
    try {
        const { estatus } = req.body;
        await db.query('UPDATE cotizaciones_bot SET estatus = ? WHERE id = ?', [estatus, req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Escalados a agente humano
app.get('/api/escalados', async (req, res) => {
    try {
        const [rows] = await db.query("SELECT * FROM escalados ORDER BY created_at DESC LIMIT 50");
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/escalados/:id/resolver', async (req, res) => {
    try {
        const { agente } = req.body;
        await db.query(
            "UPDATE escalados SET estatus = 'resuelto', agente_asignado = ?, resuelto_at = NOW() WHERE id = ?",
            [agente || 'CRM', req.params.id]
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Recordatorios manuales / cron
app.post('/api/bot/ejecutar-recordatorios', async (req, res) => {
    try {
        const resultado = await ejecutarRecordatorios(botClient, isClientConnected);
        res.json(resultado);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Estadísticas del bot PRO para Dashboard
app.get('/api/bot/stats', async (req, res) => {
    try {
        const [[cots]] = await db.query("SELECT COUNT(*) as total FROM cotizaciones_bot WHERE DATE(created_at) = CURDATE()");
        const [[escalados]] = await db.query("SELECT COUNT(*) as total FROM escalados WHERE estatus = 'pendiente'");
        const [[equipos]] = await db.query("SELECT COUNT(*) as total FROM equipos_cliente WHERE activo = 1");
        const [[cacheHits]] = await db.query("SELECT SUM(hits) as total FROM cache_ia WHERE expires_at > NOW()");
        const [[proximosVencer]] = await db.query("SELECT COUNT(*) as total FROM equipos_cliente WHERE activo = 1 AND proxima_calibracion BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)");
        res.json({
            cotizacionesHoy: cots.total || 0,
            escaladosPendientes: escalados.total || 0,
            equiposRegistrados: equipos.total || 0,
            cacheHitsTotal: cacheHits.total || 0,
            proximosVencer30d: proximosVencer.total || 0
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Caché IA — administración
app.get('/api/bot/cache', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT id, pregunta_texto, hits, created_at, expires_at FROM cache_ia WHERE expires_at > NOW() ORDER BY hits DESC LIMIT 50');
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/bot/cache', async (req, res) => {
    try {
        await db.query('DELETE FROM cache_ia WHERE expires_at <= NOW()');
        res.json({ success: true, message: 'Caché expirado eliminado' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── CRON: Recordatorios diarios (cada día a las 9:00 AM) ────────────────────
function programarRecordatoriosDiarios() {
    const ahora = new Date();
    const maniana = new Date(ahora);
    maniana.setDate(maniana.getDate() + 1);
    maniana.setHours(9, 0, 0, 0);
    const msHasta9AM = maniana - ahora;

    setTimeout(() => {
        ejecutarRecordatorios(botClient, isClientConnected);
        setInterval(() => {
            ejecutarRecordatorios(botClient, isClientConnected);
        }, 24 * 60 * 60 * 1000);
    }, msHasta9AM);

    console.log(`🔔 Recordatorios automáticos programados para las 9:00 AM (en ${Math.round(msHasta9AM / 3600000)}h)`);
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });

        const [rows] = await db.query('SELECT * FROM usuarios WHERE email = ? AND activo = 1', [email.trim().toLowerCase()]);
        if (rows.length === 0) return res.status(401).json({ error: 'Credenciales incorrectas' });

        const usuario = rows[0];
        const ok = await verificarPassword(password, usuario.password_hash);
        if (!ok) return res.status(401).json({ error: 'Credenciales incorrectas' });

        const token = generarToken(usuario);
        res.json({
            token,
            usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol }
        });
    } catch (err) {
        console.error('Error en login:', err.message);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.get('/api/auth/me', verificarToken(), (req, res) => {
    res.json({ usuario: req.usuario });
});

// Gestión de usuarios (solo admin)
app.get('/api/usuarios', verificarToken(['admin']), async (req, res) => {
    try {
        const [rows] = await db.query('SELECT id, nombre, email, rol, activo, created_at FROM usuarios ORDER BY created_at DESC');
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/usuarios', verificarToken(['admin']), async (req, res) => {
    try {
        const { nombre, email, password, rol } = req.body;
        if (!nombre || !email || !password) return res.status(400).json({ error: 'Faltan datos' });
        const bcrypt = require('bcryptjs');
        const hash = await bcrypt.hash(password, 12);
        const [r] = await db.query(
            'INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, ?)',
            [nombre, email.toLowerCase(), hash, rol || 'recepcionista']
        );
        res.json({ success: true, id: r.insertId });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/usuarios/:id/activo', verificarToken(['admin']), async (req, res) => {
    try {
        const { activo } = req.body;
        await db.query('UPDATE usuarios SET activo = ? WHERE id = ?', [activo ? 1 : 0, req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── BOT: MENSAJES EDITABLES ──────────────────────────────────────────────────

app.get('/api/bot/mensajes', verificarToken(), async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM bot_mensajes ORDER BY clave ASC');
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/bot/mensajes/:clave', verificarToken(['admin']), async (req, res) => {
    try {
        const { texto } = req.body;
        await db.query('UPDATE bot_mensajes SET texto = ? WHERE clave = ?', [texto, req.params.clave]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── BOT: FAQ ────────────────────────────────────────────────────────────────

app.get('/api/bot/faq', verificarToken(), async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM bot_faq ORDER BY hits DESC, id ASC');
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/bot/faq', verificarToken(['admin']), async (req, res) => {
    try {
        const { pregunta, respuesta } = req.body;
        if (!pregunta || !respuesta) return res.status(400).json({ error: 'Pregunta y respuesta requeridas' });
        const [r] = await db.query('INSERT INTO bot_faq (pregunta, respuesta) VALUES (?, ?)', [pregunta, respuesta]);
        res.json({ success: true, id: r.insertId });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/bot/faq/:id', verificarToken(['admin']), async (req, res) => {
    try {
        const { pregunta, respuesta, activo } = req.body;
        await db.query('UPDATE bot_faq SET pregunta = ?, respuesta = ?, activo = ? WHERE id = ?',
            [pregunta, respuesta, activo !== undefined ? activo : 1, req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/bot/faq/:id', verificarToken(['admin']), async (req, res) => {
    try {
        await db.query('DELETE FROM bot_faq WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── BOT: CONFIG ──────────────────────────────────────────────────────────────

app.get('/api/bot/config', verificarToken(), async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM bot_config');
        // Convertir array a objeto { clave: valor }
        const config = {};
        rows.forEach(r => { config[r.clave] = { valor: r.valor, descripcion: r.descripcion }; });
        res.json(config);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/bot/config', verificarToken(['admin']), async (req, res) => {
    try {
        const cambios = req.body;
        for (const [clave, valor] of Object.entries(cambios)) {
            await db.query(
                'INSERT INTO bot_config (clave, valor) VALUES (?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)',
                [clave, valor]
            );
        }
        botFlujos.invalidarCacheConfig(); // Invalida cache en memoria
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── BOT: UPLOAD MEDIA ─────────────────────────────────────────────────────
app.post('/api/bot/upload-media', verificarToken(['admin']), uploadDisk.single('archivo'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No se subio ningún archivo' });
        const url = `http://localhost:${port}/uploads/bot/${req.file.filename}`;
        res.json({ success: true, url, filename: req.file.filename, size: req.file.size });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── BOT: NODO RAIZ (Mensaje de bienvenida) ───────────────────────────────────
app.get('/api/bot/nodo-raiz', verificarToken(), async (req, res) => {
    try {
        const [rows] = await db.query("SELECT valor FROM bot_config WHERE clave = 'mensaje_bienvenida'");
        const nodos = (await db.query('SELECT * FROM bot_nodos ORDER BY orden ASC, id ASC'))[0];
        res.json({
            mensaje_bienvenida: rows[0]?.valor || '',
            nodos
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/bot/nodo-raiz', verificarToken(['admin']), async (req, res) => {
    try {
        const { mensaje_bienvenida } = req.body;
        await db.query(
            "INSERT INTO bot_config (clave, valor) VALUES ('mensaje_bienvenida', ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)",
            [mensaje_bienvenida]
        );
        botFlujos.invalidarCacheConfig();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── BOT: CONVERSACIONES ──────────────────────────────────────────────────────
app.get('/api/bot/conversaciones', verificarToken(), async (req, res) => {
    try {
        const { wa } = req.query;
        if (wa) {
            const [rows] = await db.query(
                'SELECT * FROM bot_conversaciones WHERE cliente_whatsapp = ? ORDER BY created_at ASC LIMIT 50',
                [wa]
            );
            return res.json(rows);
        }
        // Lista de chats únicos
        const [rows] = await db.query(`
            SELECT cliente_whatsapp, MAX(created_at) as ultimo_mensaje,
                   COUNT(*) as total_mensajes,
                   (SELECT mensaje FROM bot_conversaciones bc2 WHERE bc2.cliente_whatsapp = bc.cliente_whatsapp ORDER BY created_at DESC LIMIT 1) as ultimo_texto
            FROM bot_conversaciones bc
            GROUP BY cliente_whatsapp
            ORDER BY ultimo_mensaje DESC
            LIMIT 50
        `);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── BOT: NODOS Y FLUJOS (DINÁMICO) ──────────────────────────────────────────

app.get('/api/bot/nodos', verificarToken(), async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM bot_nodos ORDER BY orden ASC, id ASC');
        for (let node of rows) {
            const [opts] = await db.query('SELECT * FROM bot_opciones WHERE nodo_id = ?', [node.id]);
            node.opciones = opts;
        }
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/bot/nodos', verificarToken(['admin']), async (req, res) => {
    try {
        const { nombre, mensaje, tipo, accion, orden, media_url, media_tipo } = req.body;
        const [r] = await db.query(
            'INSERT INTO bot_nodos (nombre, mensaje, tipo, accion, orden, media_url, media_tipo) VALUES (?,?,?,?,?,?,?)',
            [nombre, mensaje, tipo || 'mensaje', accion || null, orden || 0, media_url || null, media_tipo || null]
        );
        res.json({ success: true, id: r.insertId });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/bot/nodos/:id', verificarToken(['admin']), async (req, res) => {
    try {
        const { nombre, mensaje, tipo, accion, orden, media_url, media_tipo } = req.body;
        await db.query(
            'UPDATE bot_nodos SET nombre=?, mensaje=?, tipo=?, accion=?, orden=?, media_url=?, media_tipo=? WHERE id=?',
            [nombre, mensaje, tipo, accion, orden, media_url, media_tipo, req.params.id]
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/bot/nodos/:id', verificarToken(['admin']), async (req, res) => {
    try {
        if (req.params.id === '0') return res.status(400).json({ error: 'No se puede eliminar el nodo principal' });
        await db.query('DELETE FROM bot_nodos WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/bot/nodos/:id/opciones', verificarToken(['admin']), async (req, res) => {
    try {
        const { opciones } = req.body; // Array de { texto_opcion, nodo_destino_id }
        await db.query('DELETE FROM bot_opciones WHERE nodo_id = ?', [req.params.id]);
        for (let opt of opciones) {
            await db.query('INSERT INTO bot_opciones (nodo_id, texto_opcion, nodo_destino_id) VALUES (?,?,?)',
                [req.params.id, opt.texto_opcion, opt.nodo_destino_id]);
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── BOT: SIMULADOR REAL ───────────────────────────────────────────────────

app.post('/api/bot/chat', verificarToken(), async (req, res) => {
    try {
        const { wa, texto } = req.body;
        if (!wa || !texto) return res.status(400).json({ error: 'WhatsApp y texto requeridos' });

        // Usamos la misma lógica que el bot real
        try {
            const respuesta = await botFlujos.procesarMensaje(
                wa, 
                texto, 
                botIA.detectarIntencion, 
                botIA.respuestaIA
            );
            res.json({ respuesta });
        } catch (innerErr) {
            console.error('Error procesarMensaje en simulador:', innerErr.message);
            res.status(200).json({ respuesta: '⚠️ El motor del bot está procesando tu mensaje pero hubo un detalle interno. Por favor intenta de nuevo.' });
        }
    } catch (err) {
        console.error('Error en endpoint simulador:', err.message);
        res.status(503).json({ error: 'Servicio temporalmente no disponible. El bot se está reiniciando.' });
    }
});

// ─── ARRANCAR ─────────────────────────────────────────────────────────────────
iniciarBot();
programarRecordatoriosDiarios();
