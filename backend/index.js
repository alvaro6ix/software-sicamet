// --- GLOBAL ERROR HANDLERS FOR STABILITY ---
process.on('unhandledRejection', (reason, promise) => {
    console.error('🔥 [Unhandled Rejection]:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('🔥 [Uncaught Exception]:', err.message);
    // Log complete error but don't exit unless it's fatal
    if (err.message.includes('EADDRINUSE')) {
        process.exit(1);
    }
});

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
const httpServer = require('http').createServer(app);
const { Server } = require('socket.io');
const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST", "PUT"] }
});

io.on('connection', (socket) => {
    console.log('🔗 Cliente conectado vía Socket:', socket.id);
    // Enviar estado actual del bot al nuevo cliente IPX
    socket.emit('bot_status', { connected: isClientConnected, qr: currentQR });
});

global.io = io;

const port = 3001;

// --- UTILS CRM ---
function limpiarID(wa) {
    if (!wa) return '';
    // Extraer parte antes del @ y limpiar todo lo que no sea dígito
    const numerico = wa.split('@')[0].replace(/[^\d]/g, '');
    return numerico;
}

async function ensureWhatsappChatsColumns() {
    const alters = [
        'ALTER TABLE whatsapp_chats ADD COLUMN telefono_display VARCHAR(45) NULL',
        'ALTER TABLE whatsapp_chats ADD COLUMN wa_jid VARCHAR(180) NULL'
    ];
    for (const sql of alters) {
        try {
            await db.query(sql);
        } catch (e) {
            if (!String(e.message).includes('Duplicate column name')) {
                console.warn('Migración whatsapp_chats:', e.message);
            }
        }
    }
}

/** Limpia sesión del motor del bot y memoria de conversación bot por número CRM (solo dígitos). */
async function limpiarEstadoBotPorNumero(numDigitos) {
    const [srows] = await db.query('SELECT cliente_whatsapp FROM sesiones');
    for (const { cliente_whatsapp } of srows) {
        if (limpiarID(cliente_whatsapp) === numDigitos) {
            await db.query('DELETE FROM sesiones WHERE cliente_whatsapp = ?', [cliente_whatsapp]);
        }
    }
    const [brows] = await db.query('SELECT DISTINCT cliente_whatsapp FROM bot_conversaciones');
    for (const { cliente_whatsapp } of brows) {
        if (limpiarID(cliente_whatsapp) === numDigitos) {
            await db.query('DELETE FROM bot_conversaciones WHERE cliente_whatsapp = ?', [cliente_whatsapp]);
        }
    }
}

/** Añade `cliente_whatsapp_display` (teléfono legible desde whatsapp_chats). */
async function adjuntarTelefonoVisible(rows, campoWa = 'cliente_whatsapp') {
    if (!rows || rows.length === 0) return rows;
    const nums = [...new Set(rows.map(r => limpiarID(r[campoWa])).filter(Boolean))];
    if (nums.length === 0) return rows;
    const [chats] = await db.query(
        'SELECT numero_wa, telefono_display FROM whatsapp_chats WHERE numero_wa IN (?)',
        [nums]
    );
    const map = {};
    for (const c of chats || []) {
        const digits = (c.telefono_display && String(c.telefono_display).replace(/\D/g, '').length >= 10)
            ? String(c.telefono_display).replace(/\D/g, '')
            : c.numero_wa;
        map[c.numero_wa] = digits || c.numero_wa;
    }
    return rows.map(r => {
        const n = limpiarID(r[campoWa]);
        return {
            ...r,
            cliente_whatsapp_display: map[n] || n,
            [campoWa]: n || r[campoWa]
        };
    });
}

async function registrarMensajeEnCRM(numero, cuerpo, tipo, direccion, url_media = null) {
    try {
        const numLimpio = limpiarID(numero);
        await db.query(
            'INSERT INTO whatsapp_mensajes (numero_wa, cuerpo, tipo, url_media, direccion) VALUES (?, ?, ?, ?, ?)',
            [numLimpio, cuerpo || '', tipo || 'texto', url_media, direccion]
        );
        await db.query(
            'INSERT INTO chat_mensajes (telefono, direccion, mensaje) VALUES (?, ?, ?)',
            [numLimpio, direccion === 'saliente' ? 'out' : 'in', cuerpo || '[Media]']
        ).catch(() => {});
        if (global.io) {
            global.io.emit('nuevo_mensaje_whatsapp', {
                numero_wa: numLimpio, cuerpo, tipo, url_media, direccion, fecha: new Date()
            });
            global.io.emit('actualizacion_chat_whatsapp'); 
        }
    } catch (err) { console.error('Error registrarMensajeEnCRM:', err.message); }
}

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

const uploadsDirComentarios = path.join(__dirname, 'uploads', 'comentarios');
if (!fs.existsSync(uploadsDirComentarios)) fs.mkdirSync(uploadsDirComentarios, { recursive: true });
const uploadComentarios = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadsDirComentarios),
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname);
            cb(null, `comentario_${Date.now()}${ext}`);
        }
    }),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
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
        
        // --- TENDENCIA REAL DE 7 DÍAS (Terminando en Hoy) ---
        // 1. Generar los últimos 7 días como base
        const diasSemanaRel = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        const chartDataMapeada = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const fechaStr = d.toISOString().split('T')[0];
            chartDataMapeada.push({ 
                name: diasSemanaRel[d.getDay()], 
                fecha: fechaStr,
                ingresos: 0, 
                entregados: 0 
            });
        }

        // 2. Consultar ingresos filtrados por fecha real
        const [ingresosData] = await db.query(`
            SELECT DATE_FORMAT(fecha_ingreso, '%Y-%m-%d') as fecha, COUNT(*) as cantidad 
            FROM instrumentos_estatus 
            WHERE fecha_ingreso >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
            GROUP BY fecha
        `);

        // 3. Consultar entregas filtradas por fecha real
        const [entregasData] = await db.query(`
            SELECT DATE_FORMAT(fecha_entrega, '%Y-%m-%d') as fecha, COUNT(*) as cantidad 
            FROM instrumentos_estatus 
            WHERE estatus_actual = 'Entregado' AND fecha_entrega >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
            GROUP BY fecha
        `);

        // 4. Mapear datos a los últimos 7 días generados
        ingresosData.forEach(row => {
            const d = chartDataMapeada.find(item => item.fecha === row.fecha);
            if (d) d.ingresos = row.cantidad;
        });

        entregasData.forEach(row => {
            const d = chartDataMapeada.find(item => item.fecha === row.fecha);
            if (d) d.entregados = row.cantidad;
        });
        
        const [botStats] = await db.query(`
            SELECT 
                (SELECT COUNT(*) FROM cotizaciones_bot WHERE DATE(created_at) = CURDATE()) as cotizacionesHoy,
                (SELECT COUNT(*) FROM cotizaciones_bot WHERE estatus != 'completada' AND estatus != 'cerrada') as pendientesCotizacion,
                (SELECT COUNT(*) FROM escalados WHERE estatus = 'pendiente') as escaladosPendientes,
                (SELECT COUNT(*) FROM equipos_cliente) as equiposRegistrados,
                (SELECT COUNT(*) FROM cache_ia) as cacheHitsTotal
        `);

        res.json({ 
            enCalibracion: enCalibracion[0].total || 0, 
            proximosSLA: proximosSLA[0].total || 0, 
            acreditaciones: 12,
            chartData: chartDataMapeada,
            bot: botStats[0]
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});


app.get('/api/heatmap', async (req, res) => {
    try {
        // Obtenemos distribución de mensajes entrantes de los últimos 30 días
        const [rows] = await db.query(`
            SELECT DAYNAME(fecha) as dia, HOUR(fecha) as hora, COUNT(*) as cantidad 
            FROM chat_mensajes 
            WHERE direccion = 'in' AND fecha >= DATE_SUB(NOW(), INTERVAL 30 DAY)
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
        const [[botCots]] = await db.query("SELECT COUNT(*) as total FROM cotizaciones_bot WHERE estatus = 'nueva'");
        
        // Obtener últimos escalados formateados para la lista
        const [lastEsc] = await db.query("SELECT id, cliente_whatsapp, motivo, created_at FROM escalados WHERE estatus = 'pendiente' ORDER BY id DESC LIMIT 5");
        const formattedEsc = lastEsc.map(e => ({
            ...e,
            id_profesional: `ESC-${String(e.id).padStart(4, '0')}`,
            cliente_whatsapp: limpiarID(e.cliente_whatsapp)
        }));

        // Conteos individuales por etapa
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
            cotizaciones_bot_pendientes: botCots.total || 0,
            escalados_bot: formattedEsc, // Lista profesional
            escalados_bot_pendientes: formattedEsc.length,
            escalados_count: formattedEsc.length,
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

// --- ELIMINAR/VACIAR CONVERSACIÓN ---
app.delete('/api/whatsapp/chats/:numero/mensajes', verificarToken(), async (req, res) => {
    try {
        const num = limpiarID(req.params.numero);
        await db.query('DELETE FROM whatsapp_mensajes WHERE numero_wa = ?', [num]);
        await db.query('DELETE FROM chat_mensajes WHERE telefono = ?', [num]).catch(() => {});
        await limpiarEstadoBotPorNumero(num);
        await db.query(
            `UPDATE whatsapp_chats SET nombre_contacto = COALESCE(telefono_display, ?) WHERE numero_wa = ?`,
            [num, num]
        ).catch(() => {});
        if (global.io) global.io.emit('actualizacion_chat_whatsapp');
        res.json({ success: true, message: 'Conversación vaciada y sesión del bot reiniciada' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- ELIMINAR CHAT COMPLETO (CRM) ---
app.delete('/api/whatsapp/chats/:numero', verificarToken(), async (req, res) => {
    try {
        const num = limpiarID(req.params.numero);
        await db.query('DELETE FROM whatsapp_mensajes WHERE numero_wa = ?', [num]);
        await db.query('DELETE FROM chat_mensajes WHERE telefono = ?', [num]).catch(() => {});
        await limpiarEstadoBotPorNumero(num);
        await db.query('DELETE FROM whatsapp_chats WHERE numero_wa = ?', [num]);
        if (global.io) global.io.emit('actualizacion_chat_whatsapp');
        res.json({ success: true, message: 'Chat eliminado' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- OPERACIONES DE INSTRUMENTOS (CRUD MULTIRREGISTRO) ---
app.post('/api/instrumentos-multiple', async (req, res) => {
    const { instrumentos } = req.body; 
    if (!instrumentos || instrumentos.length === 0) return res.status(400).json({error: "No hay datos"});

    try {
        const query = `INSERT INTO instrumentos_estatus 
            (orden_cotizacion, empresa, persona, tipo_servicio, nombre_instrumento, marca, modelo, no_serie, identificacion, ubicacion, requerimientos_especiales, puntos_calibrar, sla, estatus_actual) 
            VALUES ?`; 
        
        const valores = instrumentos.map(ins => [
            ins.orden_cotizacion, ins.empresa, ins.persona, ins.tipo_servicio, ins.nombre_instrumento, 
            ins.marca, ins.modelo, ins.no_serie, ins.identificacion, ins.ubicacion, ins.requerimientos_especiales, ins.puntos_calibrar, ins.sla, 'Recepción'
        ]);

        await db.query(query, [valores]);
        console.log(`✅ Registradas ${instrumentos.length} partidas de la orden ${instrumentos[0].orden_cotizacion}`);
        
        if (global.io) global.io.emit('actualizacion_operativa', { tipo: 'registro_multiple' });
        
        res.json({ success: true, count: instrumentos.length });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/instrumentos', async (req, res) => {
    try {
        const [equipos] = await db.query('SELECT * FROM instrumentos_estatus ORDER BY fecha_ingreso DESC');
        res.json(equipos);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/instrumentos/:id/estatus', verificarToken(), async (req, res) => {
    try {
        const { estatus, comentario } = req.body;
        const id = req.params.id;
        const [oldest] = await db.query('SELECT estatus_actual FROM instrumentos_estatus WHERE id = ?', [id]);
        const oldStatus = oldest[0]?.estatus_actual;

        if (estatus === 'Entregado') {
            await db.query('UPDATE instrumentos_estatus SET estatus_actual = ?, fecha_entrega = CURRENT_TIMESTAMP WHERE id = ?', [estatus, id]);
        } else {
            await db.query('UPDATE instrumentos_estatus SET estatus_actual = ? WHERE id = ?', [estatus, id]);
        }
        
        await db.query(
            'INSERT INTO instrumentos_historial (instrumento_id, usuario_id, estatus_anterior, estatus_nuevo) VALUES (?, ?, ?, ?)',
            [id, req.usuario?.id || null, oldStatus, estatus]
        );
        
        if (comentario) {
            await db.query(
                `INSERT INTO instrumentos_comentarios (instrumento_id, usuario_id, mensaje, tipo) VALUES (?, ?, ?, ?)`,
                [id, req.usuario?.id || null, comentario, 'cambio_estatus']
            );
        }
        
        if (global.io) global.io.emit('actualizacion_operativa', { tipo: 'estatus_instrumento', id: req.params.id });
        
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// NUEVO: BULK UPDATE ESTATUS
app.post('/api/instrumentos/bulk-status', verificarToken(), async (req, res) => {
    try {
        const { ids, estatus, comentario } = req.body;
        if (!ids || ids.length === 0) return res.status(400).json({ error: "No hay IDs" });

        for (const id of ids) {
            const [oldest] = await db.query('SELECT estatus_actual FROM instrumentos_estatus WHERE id = ?', [id]);
            const oldStatus = oldest[0]?.estatus_actual;

            let query = 'UPDATE instrumentos_estatus SET estatus_actual = ?';
            if (estatus === 'Entregado') query += ', fecha_entrega = CURRENT_TIMESTAMP';
            query += ' WHERE id = ?';
            
            await db.query(query, [estatus, id]);
            
            await db.query(
                'INSERT INTO instrumentos_historial (instrumento_id, usuario_id, estatus_anterior, estatus_nuevo) VALUES (?, ?, ?, ?)',
                [id, req.usuario?.id || null, oldStatus, estatus]
            );

            if (comentario) {
                await db.query(
                    `INSERT INTO instrumentos_comentarios (instrumento_id, usuario_id, mensaje, tipo) VALUES (?, ?, ?, ?)`,
                    [id, req.usuario?.id || null, comentario, 'cambio_estatus_masivo']
                );
            }
        }
        if (global.io) global.io.emit('actualizacion_operativa', { tipo: 'estatus_masivo' });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// COMENTARIOS
app.get('/api/instrumentos/:id/comentarios', verificarToken(), async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT c.*, u.nombre as usuario_nombre 
            FROM instrumentos_comentarios c 
            LEFT JOIN usuarios u ON c.usuario_id = u.id 
            WHERE c.instrumento_id = ? 
            ORDER BY c.fecha DESC
        `, [req.params.id]);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/instrumentos/:id/comentarios', verificarToken(), uploadComentarios.single('archivo'), async (req, res) => {
    try {
        const { mensaje } = req.body;
        const archivoUrl = req.file ? `/uploads/comentarios/${req.file.filename}` : null;
        await db.query(
            `INSERT INTO instrumentos_comentarios (instrumento_id, usuario_id, mensaje, archivo_url) VALUES (?, ?, ?, ?)`,
            [req.params.id, req.usuario?.id || null, mensaje, archivoUrl]
        );
        res.json({ success: true, archivo_url: archivoUrl });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/instrumentos/:id', async (req, res) => {
    try {
        const { 
            orden_cotizacion, nombre_instrumento, marca, modelo, no_serie, empresa, 
            identificacion, ubicacion, requerimientos_especiales, puntos_calibrar 
        } = req.body;
        await db.query(
            `UPDATE instrumentos_estatus SET 
                orden_cotizacion=?, nombre_instrumento=?, marca=?, modelo=?, no_serie=?, empresa=?,
                identificacion=?, ubicacion=?, requerimientos_especiales=?, puntos_calibrar=?
             WHERE id=?`, 
            [
                orden_cotizacion, nombre_instrumento, marca, modelo, no_serie, empresa, 
                identificacion, ubicacion, requerimientos_especiales, puntos_calibrar,
                req.params.id
            ]
        );
        
        if (global.io) global.io.emit('actualizacion_operativa', { tipo: 'edicion_instrumento', id: req.params.id });
        
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
        
        if (global.io) global.io.emit('actualizacion_operativa', { tipo: 'eliminacion_instrumento' });
        
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

                console.log(`✅ EXTRACCIÓN MAESTRA EN PYTHON -> FOLIO: "${resultado.cabecera.orden_cotizacion}" | PARTIDAS: ${resultado.partidas.length}`);
                
                res.json({
                    success: true,
                    cabecera: { 
                        orden_cotizacion: resultado.cabecera.orden_cotizacion, 
                        empresa: resultado.cabecera.empresa, 
                        persona: resultado.cabecera.persona, 
                        sla: resultado.cabecera.sla 
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
        intentosReinicio = 0;
        qrcode.generate(qr, { small: true });
        console.log('📱 QR generado — escanear en WhatsApp > Dispositivos vinculados');
        if (global.io) global.io.emit('qr', qr);
    });

    botClient.on('ready', () => {
        console.log('✅ Bot WhatsApp ACTIVO');
        currentQR = '';
        isClientConnected = true;
        intentosReinicio = 0;
        global.botClient = botClient;
        if (global.io) global.io.emit('bot_status', { connected: true });
    });

    botClient.on('disconnected', (reason) => {
        console.log('❌ Bot desconectado:', reason);
        currentQR = '';
        isClientConnected = false;
        if (global.io) global.io.emit('bot_status', { connected: false });
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
        
        const idWhatsApp = msg.from; // ID original (@c.us o @lid) para el bot
        const numeroUser = limpiarID(idWhatsApp); // Número limpio (dígitos) para el CRM
        const textoRecibido = msg.body ? msg.body.trim() : '';
        
        let mediaUrl = null;
        let tipoMsg = 'texto';
        
        if (msg.hasMedia) {
            try {
                const media = await msg.downloadMedia();
                if (media) {
                    const ext = media.mimetype.split('/')[1].split(';')[0];
                    const filename = `media_${Date.now()}.${ext}`;
                    const fullPath = path.join(__dirname, 'uploads', 'bot', filename);
                    fs.writeFileSync(fullPath, Buffer.from(media.data, 'base64'));
                    mediaUrl = `/uploads/bot/${filename}`;
                    tipoMsg = media.mimetype.startsWith('image/') ? 'imagen' : 'archivo';
                }
            } catch (e) { console.error('Error descargando media:', e.message); }
        }

        const esPropio = msg.fromMe;
        const direccion = esPropio ? 'saliente' : 'entrante';
        const idParaWhatsApp = esPropio ? msg.to : idWhatsApp;
        const numeroParaRegistro = limpiarID(idParaWhatsApp);

        // Registrar entrada/propio
        await registrarMensajeEnCRM(numeroParaRegistro, textoRecibido || (msg.hasMedia ? '[Media]' : ''), tipoMsg, direccion, mediaUrl);

        // Actualizar chat metadata
        const contact = await msg.getContact().catch(() => null);
        const push = contact?.pushname || contact?.name || '';
        const telRaw = (contact?.number || '').replace(/\D/g, '');
        const telefonoDisplay = (telRaw.length >= 10 ? telRaw : null) || numeroParaRegistro || null;
        await db.query(
            `INSERT INTO whatsapp_chats (numero_wa, telefono_display, wa_jid, nombre_contacto, ultima_actividad)
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
             ON DUPLICATE KEY UPDATE
                ultima_actividad = CURRENT_TIMESTAMP,
                nombre_contacto = VALUES(nombre_contacto),
                wa_jid = VALUES(wa_jid),
                telefono_display = COALESCE(NULLIF(VALUES(telefono_display), ''), telefono_display)`,
            [numeroParaRegistro, telefonoDisplay, idParaWhatsApp, push || telefonoDisplay || numeroParaRegistro]
        ).catch(async () => {
            await db.query(
                'INSERT INTO whatsapp_chats (numero_wa, nombre_contacto, ultima_actividad) VALUES (?, ?, CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE ultima_actividad = CURRENT_TIMESTAMP, nombre_contacto = VALUES(nombre_contacto)',
                [numeroParaRegistro, push || numeroParaRegistro]
            ).catch(() => {});
        });

        if (esPropio) return;

        const [chatCfg] = await db.query('SELECT bot_desactivado FROM whatsapp_chats WHERE numero_wa = ?', [numeroUser]);
        if (chatCfg[0] && chatCfg[0].bot_desactivado) return;

        if (!textoRecibido && !msg.hasMedia) return;

        try {
            const sesion = await botFlujos.getEstado(idWhatsApp);
            const nodoActual = sesion.nodo_actual_id;

            // Blindaje: solo consultar estatus aquí si el nodo activo es consultar_estatus (id en BD puede no ser 5)
            const esPrefijoOC = /^OC-|^COT-/i.test(textoRecibido);
            const esComandoSalida = /^0$|^volver|^menu|^atras/i.test(textoRecibido);
            const enNodoEstatus = await botFlujos.esNodoConsultaEstatus(nodoActual);

            if ((enNodoEstatus || esPrefijoOC) && !esComandoSalida && textoRecibido.length >= 3) {
                const resp = await botFlujos.consultarEstatusLogic(idWhatsApp, textoRecibido, sesion);
                const textoAEnviar = typeof resp === 'object' ? resp.text : resp;
                console.log(`📤 Enviando respuesta (Status) a ${idWhatsApp}...`);
                if (botClient.pupPage) {
                    await botClient.sendMessage(idWhatsApp, textoAEnviar);
                    await registrarMensajeEnCRM(numeroUser, textoAEnviar, 'texto', 'saliente');
                } else {
                    console.error('❌ Error crítico: botClient.pupPage es null. El navegador podría haber crasheado.');
                }
                return;
            }

            const respuesta = await botFlujos.procesarMensaje(
                idWhatsApp, 
                textoRecibido, 
                botIA.detectarIntencion, 
                botIA.respuestaIA
            );

            if (respuesta) {
                const textoAEnviar = typeof respuesta === 'object' ? respuesta.text : respuesta;
                if (textoAEnviar) {
                    console.log(`📤 Enviando respuesta (Flujo) a ${idWhatsApp}...`);
                    if (botClient.pupPage) {
                        await botClient.sendMessage(idWhatsApp, textoAEnviar);
                        await registrarMensajeEnCRM(numeroUser, textoAEnviar, 'texto', 'saliente');
                    } else {
                        console.error('❌ Error crítico: botClient.pupPage es null al procesar flujo.');
                    }
                }
            }

        } catch (err) { 
            console.error('Error en mensaje bot:', err);
            try {
                const errMsg = '⚠️ Ocurrió un error temporal en el motor del bot. Por favor intenta de nuevo o escribe *0* para el menú.';
                console.log(`✉️ Enviando notificación de error a ${idWhatsApp}...`);
                if (botClient.pupPage) {
                    await botClient.sendMessage(idWhatsApp, errMsg);
                    await registrarMensajeEnCRM(numeroUser, errMsg, 'texto', 'saliente');
                }
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
        const sent = await botClient.sendMessage(numero, media);
        
        // Guardar en historial de salida si el envío fue exitoso
        await db.query(
            'INSERT INTO whatsapp_mensajes (numero_wa, cuerpo, tipo, url_media, direccion) VALUES (?, ?, ?, ?, "saliente")',
            [numero, req.file.originalname, 'archivo', `/uploads/bot/${req.file.filename}`] 
        ).catch(e => console.error('Error guardando media saliente:', e.message));

        res.json({ success: true, message: sent });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// NUEVOS ENDPOINTS CRM WHATSAPP

app.get('/api/whatsapp/chats', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT * FROM whatsapp_chats 
            ORDER BY es_favorito DESC, ultima_actividad DESC
        `);
        const cleanedOut = (c) => {
            const nw = limpiarID(c.numero_wa);
            const td = (c.telefono_display && String(c.telefono_display).replace(/\D/g, '').length >= 10)
                ? String(c.telefono_display).replace(/\D/g, '')
                : nw;
            return {
                ...c,
                numero_wa: nw,
                numero_visible: td,
                nombre_contacto: c.nombre_contacto?.includes('@') ? limpiarID(c.nombre_contacto) : (c.nombre_contacto || td)
            };
        };
        const cleanedRows = rows.map(cleanedOut);
        res.json(cleanedRows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/whatsapp/chats/:numero/mensajes', async (req, res) => {
    try {
        const num = limpiarID(req.params.numero);
        const [rows] = await db.query(
            'SELECT * FROM whatsapp_mensajes WHERE numero_wa = ? ORDER BY fecha ASC', 
            [num]
        );
        const cleanedMsgs = rows.map(m => ({ ...m, numero_wa: limpiarID(m.numero_wa) }));
        res.json(cleanedMsgs);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/whatsapp/enviar', upload.single('archivo'), async (req, res) => {
    try {
        const { numero, texto } = req.body; // El numero viene limpio (ej: 521...)
        if (!isClientConnected) return res.status(400).json({ error: 'Bot no conectado' });
        
        let idDestino = numero.includes('@') ? numero : `${numero}@c.us`; 

        let media = null;
        let tipo = 'texto';
        let cuerpo = texto;
        let url_media = null;

        if (req.file) {
            media = new MessageMedia(req.file.mimetype, req.file.buffer.toString('base64'), req.file.originalname);
            tipo = req.file.mimetype.startsWith('image/') ? 'imagen' : 'archivo';
            url_media = `/uploads/bot/${req.file.filename}`;
            cuerpo = req.file.originalname;
        }

        const msgSent = media 
            ? await botClient.sendMessage(idDestino, media, { caption: texto })
            : await botClient.sendMessage(idDestino, texto);

        await registrarMensajeEnCRM(numero, cuerpo, tipo, 'saliente', url_media);
        await db.query('UPDATE whatsapp_chats SET ultima_actividad = CURRENT_TIMESTAMP WHERE numero_wa = ?', [numero]);

        res.json({ success: true });
    } catch (err) { 
        console.error('Error al enviar mensaje manual:', err.message);
        res.status(500).json({ error: err.message }); 
    }
});

app.put('/api/whatsapp/chats/:numero/config', async (req, res) => {
    try {
        const { es_favorito, bot_desactivado } = req.body;
        const updates = [];
        const params = [];
        if (es_favorito !== undefined) { updates.push('es_favorito = ?'); params.push(es_favorito); }
        if (bot_desactivado !== undefined) { updates.push('bot_desactivado = ?'); params.push(bot_desactivado); }
        
        if (updates.length > 0) {
            params.push(limpiarID(req.params.numero));
            await db.query(`UPDATE whatsapp_chats SET ${updates.join(', ')} WHERE numero_wa = ?`, params);
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── ENDPOINTS BOT PRO ────────────────────────────────────────────────────────

// Equipos del cliente
app.get('/api/equipos-cliente', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM equipos_cliente WHERE activo = 1 ORDER BY proxima_calibracion ASC');
        res.json(await adjuntarTelefonoVisible(rows, 'cliente_whatsapp'));
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
        res.json(await adjuntarTelefonoVisible(rows, 'cliente_whatsapp'));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/cotizaciones-bot/:id/estatus', async (req, res) => {
    try {
        const { estatus } = req.body;
        await db.query('UPDATE cotizaciones_bot SET estatus = ? WHERE id = ?', [estatus, req.params.id]);
        if (global.io) global.io.emit('actualizacion_cotizacion', { id: req.params.id, estatus });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/cotizaciones-bot/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM cotizaciones_bot WHERE id = ?', [req.params.id]);
        if (global.io) global.io.emit('actualizacion_cotizacion', { tipo: 'eliminacion_cotizacion', id: req.params.id });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Escalados a agente humano
app.get('/api/escalados', async (req, res) => {
    try {
        const [rows] = await db.query("SELECT * FROM escalados ORDER BY created_at DESC LIMIT 50");
        const conTel = await adjuntarTelefonoVisible(rows, 'cliente_whatsapp');
        const rowsFormateadas = conTel.map(r => ({
            ...r,
            folio: `ESC-${String(r.id).padStart(4, '0')}`
        }));
        res.json(rowsFormateadas);
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

app.delete('/api/escalados/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM escalados WHERE id = ?', [req.params.id]);
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
        const [[pendientes]] = await db.query("SELECT COUNT(*) as total FROM cotizaciones_bot WHERE estatus = 'nueva'");
        const [[escalados]] = await db.query("SELECT COUNT(*) as total FROM escalados WHERE estatus = 'pendiente'");
        const [[equipos]] = await db.query("SELECT COUNT(*) as total FROM equipos_cliente WHERE activo = 1");
        const [[cacheHits]] = await db.query("SELECT SUM(hits) as total FROM cache_ia WHERE expires_at > NOW()");
        const [[proximosVencer]] = await db.query("SELECT COUNT(*) as total FROM equipos_cliente WHERE activo = 1 AND proxima_calibracion BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)");
        
        res.json({
            cotizacionesHoy: cots.total || 0,
            pendientesCotizacion: pendientes.total || 0,
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

// ─── BÚSQUEDA GLOBAL ──────────────────────────────────────────────────────────
app.get('/api/busqueda-global', verificarToken(), async (req, res) => {
    const q = (req.query.q || '').trim();
    if (q.length < 1) return res.json({ equipos: [], clientes: [], conversaciones: [] });
    const like = `%${q}%`;
    try {
        // Busca en folio_rastreo Y orden_cotizacion (ambas pueden estar pobladas)
        const [equipos] = await db.query(
            `SELECT id, nombre_instrumento,
                    COALESCE(folio_rastreo, orden_cotizacion) AS orden_cotizacion,
                    empresa, estatus_actual, no_serie
             FROM instrumentos_estatus
             WHERE nombre_instrumento LIKE ?
                OR folio_rastreo       LIKE ?
                OR orden_cotizacion    LIKE ?
                OR no_serie            LIKE ?
                OR empresa             LIKE ?
                OR persona             LIKE ?
             ORDER BY created_at DESC LIMIT 6`,
            [like, like, like, like, like, like]
        );
        const [clientes] = await db.query(
            `SELECT id, nombre, contacto FROM cat_clientes
             WHERE nombre LIKE ? OR contacto LIKE ? LIMIT 4`,
            [like, like]
        );
        const [conversaciones] = await db.query(
            `SELECT id, numero_wa, nombre_contacto FROM whatsapp_chats
             WHERE nombre_contacto LIKE ? OR numero_wa LIKE ? LIMIT 4`,
            [like, like]
        );
        res.json({ equipos, clientes, conversaciones });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── NOTIFICACIONES INTERNAS ──────────────────────────────────────────────────
app.get('/api/notificaciones', verificarToken(), async (req, res) => {
    try {
        const notifs = [];

        // 1. Equipos con SLA crítico (0 o negativo = vencido, 1 = urgente)
        const [vencidos] = await db.query(
            `SELECT id, nombre_instrumento, orden_cotizacion, empresa, sla, estatus_actual
             FROM instrumentos_estatus
             WHERE sla <= 1 AND estatus_actual NOT IN ('Listo','Entregado','Validación','Aseguramiento')
             ORDER BY sla ASC LIMIT 10`
        );
        vencidos.forEach(e => {
            const vencido = e.sla <= 0;
            notifs.push({
                tipo: 'sla',
                id: `sla_${e.id}`,
                titulo: vencido ? `⏰ SLA vencido: ${e.nombre_instrumento}` : `⚠️ SLA crítico: ${e.nombre_instrumento}`,
                detalle: `OC ${e.orden_cotizacion || '—'} · ${e.empresa || '—'} · Etapa: ${e.estatus_actual}`,
                ruta: '/equipos',
                urgencia: vencido ? 'alta' : 'media',
                ts: new Date().toISOString()
            });
        });

        // 2. Cotizaciones bot pendientes sin atender
        const [[cots]] = await db.query(`SELECT COUNT(*) as total FROM cotizaciones_bot WHERE estatus = 'nueva'`);
        if (cots.total > 0) {
            notifs.push({
                tipo: 'cotizacion',
                id: 'cots_pendientes',
                titulo: `📋 ${cots.total} cotización${cots.total > 1 ? 'es' : ''} sin atender`,
                detalle: 'Solicitudes recibidas por WhatsApp esperando respuesta del equipo',
                ruta: '/flujos-whatsapp',
                urgencia: 'media',
                ts: new Date().toISOString()
            });
        }

        // 3. Equipos rechazados en Aseguramiento (últimas 48h)
        try {
            const [rechazados] = await db.query(
                `SELECT ct.instrumento_id, ct.created_at, ie.nombre_instrumento, ie.orden_cotizacion
                 FROM comentarios_tecnicos ct
                 JOIN instrumentos_estatus ie ON ie.id = ct.instrumento_id
                 WHERE (ct.comentario LIKE '%rechaz%' OR ct.comentario LIKE '%regresado%' OR ct.comentario LIKE '%regresa%')
                 AND ct.created_at >= DATE_SUB(NOW(), INTERVAL 48 HOUR)
                 ORDER BY ct.created_at DESC LIMIT 5`
            );
            rechazados.forEach(r => {
                notifs.push({
                    tipo: 'rechazo',
                    id: `rechazo_${r.instrumento_id}_${new Date(r.created_at).getTime()}`,
                    titulo: `🔁 Equipo rechazado en Aseguramiento`,
                    detalle: `${r.nombre_instrumento} · OC ${r.orden_cotizacion || '—'} · Regresó a Laboratorio`,
                    ruta: '/metrologia',
                    urgencia: 'media',
                    ts: r.created_at
                });
            });
        } catch (_) { /* tabla puede no existir aún */ }

        res.json(notifs);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
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
            usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol, permisos: usuario.permisos }
        });
    } catch (err) {
        console.error('Error en login:', err.message);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.get('/api/auth/me', verificarToken(), async (req, res) => {
    try {
        const [rows] = await db.query('SELECT id, nombre, email, rol, permisos FROM usuarios WHERE id = ?', [req.usuario.id]);
        if (rows.length === 0) return res.status(401).json({ error: 'Usuario no encontrado' });
        res.json({ usuario: rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Error del servidor al obtener usuario' });
    }
});

// Gestión de usuarios (solo admin)
app.get('/api/usuarios', verificarToken(['admin']), async (req, res) => {
    try {
        const [rows] = await db.query('SELECT id, nombre, email, rol, activo, permisos, created_at FROM usuarios ORDER BY created_at DESC');
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/usuarios', verificarToken(['admin']), async (req, res) => {
    try {
        const { nombre, email, password, rol, permisos } = req.body;
        if (!nombre || !email || !password) return res.status(400).json({ error: 'Faltan datos' });
        const bcrypt = require('bcryptjs');
        const hash = await bcrypt.hash(password, 12);
        const [r] = await db.query(
            'INSERT INTO usuarios (nombre, email, password_hash, rol, permisos) VALUES (?, ?, ?, ?, ?)',
            [nombre, email.toLowerCase(), hash, rol || 'recepcionista', permisos ? JSON.stringify(permisos) : null]
        );
        res.json({ success: true, id: r.insertId });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/usuarios/:id', verificarToken(['admin']), async (req, res) => {
    try {
        const { nombre, email, password, rol, permisos } = req.body;
        const id = req.params.id;

        let query = 'UPDATE usuarios SET nombre = ?, email = ?, rol = ?, permisos = ?';
        let params = [nombre, email.toLowerCase(), rol, permisos ? JSON.stringify(permisos) : null];

        if (password && password.trim() !== "") {
            const bcrypt = require('bcryptjs');
            const hash = await bcrypt.hash(password, 12);
            query += ', password_hash = ?';
            params.push(hash);
        }

        query += ' WHERE id = ?';
        params.push(id);

        await db.query(query, params);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/usuarios/:id/activo', verificarToken(['admin']), async (req, res) => {
    try {
        const { activo } = req.body;
        await db.query('UPDATE usuarios SET activo = ? WHERE id = ?', [activo ? 1 : 0, req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/usuarios/:id', verificarToken(['admin']), async (req, res) => {
    try {
        await db.query('DELETE FROM usuarios WHERE id = ?', [req.params.id]);
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

// --- INICIO DEL SERVIDOR ---
httpServer.listen(port, '0.0.0.0', async () => {
    await ensureWhatsappChatsColumns();
    console.log(`🚀 API + RealTime en http://localhost:${port}`);
    if (process.send) process.send('ready');
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ El puerto ${port} ya está ocupado por otra instancia del sistema.`);
        console.error('💡 Si estás bajo PM2, esto se resolverá automáticamente al reiniciar. Si es manual, cierra el proceso anterior.');
        process.exit(1);
    } else {
        console.error('💥 Error crítico al iniciar servidor:', err.message);
        process.exit(1);
    }
});

// ─── ARRANCAR SERVICIOS ───────────────────────────────────────────────────────
iniciarBot();
programarRecordatoriosDiarios();

