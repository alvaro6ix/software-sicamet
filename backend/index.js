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
const { exec, execFile } = require('child_process');

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

// === FUNCION CRITICA: Calcular SLA real desde fecha_recepcion del PDF ===
function calcularSLAReal(fechaRecepcionParsed, fechaRecepcionStr, fechaIngreso, slaDias) {
    let fechaBase;
    if (fechaRecepcionParsed) {
        fechaBase = new Date(fechaRecepcionParsed);
    } else if (fechaRecepcionStr) {
        // Intentar parsear formatos: DD/MM/YYYY, YYYY.MM.DD, YYYY-MM-DD
        let parsed = null;
        const limpia = fechaRecepcionStr.trim();
        // Formato DD/MM/YYYY
        const m1 = limpia.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (m1) parsed = new Date(`${m1[3]}-${m1[2]}-${m1[1]}`);
        // Formato YYYY.MM.DD
        if (!parsed) {
            const m2 = limpia.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})/);
            if (m2) parsed = new Date(`${m2[1]}-${m2[2]}-${m2[3]}`);
        }
        // Formato YYYY-MM-DD
        if (!parsed) {
            const m3 = limpia.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
            if (m3) parsed = new Date(limpia);
        }
        fechaBase = parsed && !isNaN(parsed.getTime()) ? parsed : new Date(fechaIngreso);
    } else {
        fechaBase = new Date(fechaIngreso);
    }
    const hoy = new Date();
    const diasPasados = Math.floor((hoy - fechaBase) / (1000 * 60 * 60 * 24));
    const slaRestante = (slaDias || 10) - diasPasados;
    return { diasPasados, slaRestante, fechaBase: fechaBase.toISOString().split('T')[0] };
}

async function ensureBasicSchema() {
    try {
        // Tabla usuarios
        await db.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nombre VARCHAR(150) NOT NULL,
                email VARCHAR(150) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                rol ENUM('admin', 'recepcionista', 'metrologo', 'aseguramiento') DEFAULT 'recepcionista',
                area VARCHAR(100) NULL,
                notif_wa TINYINT DEFAULT 0,
                activo TINYINT DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                permisos JSON NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Insertar admin por defecto si no hay usuarios (solo si la tabla está vacía)
        const [users] = await db.query('SELECT id FROM usuarios LIMIT 1');
        if (users.length === 0) {
            const bcrypt = require('bcrypt');
            const hashed = await bcrypt.hash('sicamet', 12);
            await db.query('INSERT INTO usuarios (nombre, email, password, rol) VALUES (?, ?, ?, ?)', 
                ['Administrador', 'admin@sicamet.mx', hashed, 'admin']);
            console.log("✅ Usuario administrador creado por defecto (pass: sicamet)");
        }

        // Tabla instrumentos_estatus
        await db.query(`
            CREATE TABLE IF NOT EXISTS instrumentos_estatus (
                id INT AUTO_INCREMENT PRIMARY KEY,
                orden_servicio VARCHAR(50) NOT NULL,
                identificacion TEXT NULL,
                nombre_instrumento TEXT NULL,
                no_serie VARCHAR(100) NULL,
                numero_informe VARCHAR(100) NULL,
                estatus VARCHAR(100) DEFAULT 'recepcion',
                fecha_ingreso DATETIME DEFAULT CURRENT_TIMESTAMP,
                sla INT DEFAULT 10,
                area_laboratorio VARCHAR(100) NULL,
                metrologo_asignado_id INT NULL,
                no_certificado VARCHAR(100) NULL,
                rechazos_aseguramiento INT DEFAULT 0,
                cliente_whatsapp VARCHAR(50) NULL,
                ubicacion TEXT NULL,
                fecha_recepcion VARCHAR(100) NULL,
                fecha_recepcion_parsed DATE NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Tabla whatsapp_chats
        await db.query(`
            CREATE TABLE IF NOT EXISTS whatsapp_chats (
                numero_wa VARCHAR(50) NOT NULL PRIMARY KEY,
                nombre_wa VARCHAR(200) NULL,
                estatus VARCHAR(50) DEFAULT 'nuevo',
                ultima_interaccion DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                bot_activo TINYINT DEFAULT 1,
                telefono_display VARCHAR(45) NULL,
                wa_jid VARCHAR(180) NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Tabla bot_config
        await db.query(`
            CREATE TABLE IF NOT EXISTS bot_config (
                clave VARCHAR(50) PRIMARY KEY,
                valor VARCHAR(500) NOT NULL,
                descripcion VARCHAR(200) NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Insertar config por defecto si está vacía
        const [configs] = await db.query('SELECT clave FROM bot_config LIMIT 1');
        if (configs.length === 0) {
            await db.query(`
                INSERT INTO bot_config (clave, valor, descripcion) VALUES 
                ('horario_inicio', '08:00', 'Inicio jornada'),
                ('horario_fin', '18:00', 'Fin jornada'),
                ('mensaje_bienvenida', '¡Hola! Soy el asistente de SICAMET.', 'Bienvenida'),
                ('modo_fuera_horario', 'auto', 'auto|silent')
            `);
        }

        // Tabla bot_nodos (para los flujos)
        await db.query(`
            CREATE TABLE IF NOT EXISTS bot_nodos (
                id VARCHAR(50) PRIMARY KEY,
                mensaje TEXT NOT NULL,
                tipo VARCHAR(50) DEFAULT 'menu',
                parent_id VARCHAR(50) NULL,
                opcion_numero INT NULL,
                accion VARCHAR(100) NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        console.log("✅ Esquema básico SICAMET verificado");
    } catch (e) {
        console.error("❌ Error en ensureBasicSchema:", e.message);
    }
}

async function ensureMetrologiaSchema() {
    await ensureBasicSchema(); // Primero asegurar que existen las tablas
    try {
        // Asegurar columna numero_informe
        const [cols] = await db.query('SHOW COLUMNS FROM instrumentos_estatus LIKE "numero_informe"');
        if (cols.length === 0) {
            await db.query('ALTER TABLE instrumentos_estatus ADD COLUMN numero_informe VARCHAR(100) DEFAULT NULL');
            console.log("✅ Columna numero_informe añadida");
        }

        // Asegurar columna fecha_recepcion_parsed (para SLA real)
        const [colsFecha] = await db.query('SHOW COLUMNS FROM instrumentos_estatus LIKE "fecha_recepcion_parsed"');
        if (colsFecha.length === 0) {
            await db.query('ALTER TABLE instrumentos_estatus ADD COLUMN fecha_recepcion_parsed DATE NULL AFTER fecha_recepcion');
            console.log("✅ Columna fecha_recepcion_parsed añadida");
        }

        // Asegurar columna rechazos_aseguramiento
        const [colsRechazos] = await db.query('SHOW COLUMNS FROM instrumentos_estatus LIKE "rechazos_aseguramiento"');
        if (colsRechazos.length === 0) {
            await db.query('ALTER TABLE instrumentos_estatus ADD COLUMN rechazos_aseguramiento INT DEFAULT 0 AFTER no_certificado');
            console.log("✅ Columna rechazos_aseguramiento añadida");
        }

        // Asegurar tabla rechazos_aseguramiento (historial de auditoria)
        await db.query(`
            CREATE TABLE IF NOT EXISTS rechazos_aseguramiento (
                id INT AUTO_INCREMENT PRIMARY KEY,
                instrumento_id INT NOT NULL,
                usuario_rechaza_id INT NOT NULL,
                usuario_destino_id INT NULL,
                motivo TEXT NOT NULL,
                fecha_rechazo DATETIME DEFAULT CURRENT_TIMESTAMP,
                fecha_correccion DATETIME NULL,
                estatus VARCHAR(50) DEFAULT 'pendiente',
                estatus_previo VARCHAR(50),
                INDEX (instrumento_id),
                INDEX (usuario_rechaza_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        console.log("✅ Tabla rechazos_aseguramiento verificada");

        // Asegurar tabla feedback_bot
        await db.query(`
            CREATE TABLE IF NOT EXISTS feedback_bot (
                id INT AUTO_INCREMENT PRIMARY KEY,
                cliente_wa VARCHAR(50) NOT NULL,
                empresa VARCHAR(255) NULL,
                mensaje TEXT NOT NULL,
                fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
                leido_admin TINYINT DEFAULT 0,
                INDEX (cliente_wa),
                INDEX (leido_admin)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        console.log("✅ Tabla feedback_bot verificada");

        // Asegurar tabla auditoria_instrumentos
        await db.query(`
            CREATE TABLE IF NOT EXISTS auditoria_instrumentos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                instrumento_id INT NOT NULL,
                accion VARCHAR(100) NOT NULL,
                usuario_id INT NULL,
                detalles JSON NULL,
                fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX (instrumento_id),
                INDEX (accion),
                INDEX (usuario_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        console.log("✅ Tabla auditoria_instrumentos verificada");

        // Asegurar tabla instrumento_metrologos
        await db.query(`
            CREATE TABLE IF NOT EXISTS instrumento_metrologos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                instrumento_id INT NOT NULL,
                usuario_id INT NOT NULL,
                estatus ENUM('asignado', 'terminado', 'correccion') DEFAULT 'asignado',
                fecha_asignacion DATETIME DEFAULT CURRENT_TIMESTAMP,
                fecha_fin DATETIME DEFAULT NULL,
                INDEX (instrumento_id),
                INDEX (usuario_id)
            )
        `);
        console.log("✅ Tabla instrumento_metrologos verificada (ensureMetrologiaSchema)");

        // ✅ FIX: Asegurar tabla instrumentos_historial (era la causa del error 500)
        await db.query(`
            CREATE TABLE IF NOT EXISTS instrumentos_historial (
                id INT AUTO_INCREMENT PRIMARY KEY,
                instrumento_id INT NOT NULL,
                usuario_id INT NULL,
                estatus_anterior VARCHAR(100) NULL,
                estatus_nuevo VARCHAR(100) NULL,
                comentario TEXT NULL,
                fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX (instrumento_id),
                INDEX (usuario_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        console.log("✅ Tabla instrumentos_historial verificada");

        // Asegurar tabla chat_assignments (para control de conversaciones entre recepcionistas)
        await db.query(`
            CREATE TABLE IF NOT EXISTS chat_assignments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                numero_wa VARCHAR(50) NOT NULL UNIQUE,
                usuario_id INT NOT NULL,
                usuario_nombre VARCHAR(150) NOT NULL,
                asignado_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX (numero_wa),
                INDEX (usuario_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        console.log("✅ Tabla chat_assignments verificada");

        // Asegurar tabla notificaciones_globales y leídas
        await db.query(`
            CREATE TABLE IF NOT EXISTS notificaciones_globales (
                id INT AUTO_INCREMENT PRIMARY KEY,
                titulo VARCHAR(255),
                detalle TEXT,
                tipo VARCHAR(50),
                ruta VARCHAR(255),
                urgencia ENUM('baja', 'media', 'alta') DEFAULT 'media',
                metadata JSON,
                creado_por_id INT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await db.query(`
            CREATE TABLE IF NOT EXISTS notificaciones_leidas (
                id INT AUTO_INCREMENT PRIMARY KEY,
                notificacion_global_id INT,
                usuario_id INT,
                visto_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY (notificacion_global_id, usuario_id)
            )
        `);

        // Asegurar columnas en rechazos_aseguramiento
        const [colsEstatus] = await db.query('SHOW COLUMNS FROM rechazos_aseguramiento LIKE "estatus"');
        if (colsEstatus.length === 0) {
            await db.query('ALTER TABLE rechazos_aseguramiento ADD COLUMN estatus VARCHAR(50) DEFAULT "pendiente"');
            await db.query('ALTER TABLE rechazos_aseguramiento ADD COLUMN fecha_correccion DATETIME NULL AFTER fecha_rechazo');
            console.log("✅ Columnas estatus y fecha_correccion añadidas a rechazos_aseguramiento");
        }

        // --- MIGRACIÓN SICAMET 2026: Ampliar capacidad de columnas críticas ---
        await db.query('ALTER TABLE instrumentos_estatus MODIFY COLUMN ubicacion TEXT NULL');
        await db.query('ALTER TABLE instrumentos_estatus MODIFY COLUMN identificacion TEXT NULL');
        await db.query('ALTER TABLE instrumentos_estatus MODIFY COLUMN nombre_instrumento TEXT NULL');
        console.log("✅ Columnas ubicacion, identificacion y nombre_instrumento ampliadas a TEXT");

    } catch (e) { console.error("❌ Error en ensureMetrologiaSchema:", e.message); }
}

async function ensureWhatsappChatsColumns() {
    await ensureMetrologiaSchema(); // Integrar aquí
    // ... rest of the existing function
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
    // Migración de nuevas columnas SICAMET 2026
    const nuevasMigraciones = [
        "ALTER TABLE usuarios ADD COLUMN area VARCHAR(100) NULL AFTER rol",
        "ALTER TABLE instrumentos_estatus ADD COLUMN area_laboratorio VARCHAR(100) NULL AFTER sla",
        "ALTER TABLE instrumentos_estatus ADD COLUMN metrologo_asignado_id INT NULL AFTER area_laboratorio",
        "ALTER TABLE instrumentos_estatus ADD COLUMN numero_informe VARCHAR(100) NULL AFTER no_serie",
        "ALTER TABLE usuarios ADD COLUMN es_lider_area TINYINT(1) DEFAULT 0 AFTER area",
        `CREATE TABLE IF NOT EXISTS laboratorio_areas (id INT AUTO_INCREMENT PRIMARY KEY, nombre VARCHAR(100) NOT NULL UNIQUE, descripcion TEXT NULL, activa TINYINT DEFAULT 1, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS instrumento_metrologos (
            id INT AUTO_INCREMENT PRIMARY KEY, 
            instrumento_id INT NOT NULL, 
            usuario_id INT NOT NULL, 
            estatus ENUM('asignado', 'terminado', 'correccion') DEFAULT 'asignado', 
            fecha_fin DATETIME NULL, 
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS notificaciones_globales (
            id INT AUTO_INCREMENT PRIMARY KEY, 
            titulo VARCHAR(255) NOT NULL, 
            detalle TEXT NULL, 
            tipo VARCHAR(50) NULL, 
            ruta VARCHAR(255) NULL, 
            urgencia VARCHAR(20) DEFAULT 'media', 
            creador_id INT NULL, 
            metadata JSON NULL, 
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS notificaciones_leidas (
            id INT AUTO_INCREMENT PRIMARY KEY, 
            notificacion_id INT NOT NULL, 
            usuario_id INT NOT NULL, 
            leido_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, 
            UNIQUE KEY user_notif (notificacion_id, usuario_id)
        )`
    ];
    for (const sql of nuevasMigraciones) {
        try { await db.query(sql); } catch (e) { /* columna ya existe o tabla ya existe */ }
    }
    console.log('✅ Migraciones SICAMET 2026 verificadas.');
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

// Configuración para Certificados (Aseguramiento)
const certsDir = path.join(__dirname, 'uploads', 'certificados');
if (!fs.existsSync(certsDir)) fs.mkdirSync(certsDir, { recursive: true });
const uploadCert = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, certsDir),
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname);
            cb(null, `certificado_${req.params.id}_${Date.now()}${ext}`);
        }
    }),
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') cb(null, true);
        else cb(new Error('Solo se permiten archivos PDF'), false);
    },
    limits: { fileSize: 20 * 1024 * 1024 } // 20MB max
});

app.use(cors());
app.use(express.json());
// Servir archivos subidos públicamente
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── ENDPOINT PÚBLICO: Ver certificado desde QR (sin auth) ───
app.get('/api/public/certificado/:numeroInforme', async (req, res) => {
    try {
        const { numeroInforme } = req.params;
        const [equipos] = await db.query(
            `SELECT id, nombre_instrumento, orden_cotizacion, empresa, numero_informe, 
                    no_certificado, marca, modelo, no_serie, fecha_ingreso, 
                    estatus_actual, certificado_url, fecha_entrega
             FROM instrumentos_estatus 
             WHERE UPPER(numero_informe) = UPPER(?) OR UPPER(no_certificado) = UPPER(?)`,
            [numeroInforme, numeroInforme]
        );

        if (equipos.length === 0) {
            return res.status(404).json({ error: 'Certificado no encontrado' });
        }

        const eq = equipos[0];

        res.json({
            encontrado: true,
            datos: {
                equipo: eq.nombre_instrumento,
                empresa: eq.empresa,
                orden: eq.orden_cotizacion,
                informe: eq.numero_informe,
                certificado: eq.no_certificado,
                marca: eq.marca,
                modelo: eq.modelo,
                serie: eq.no_serie,
                estatus: eq.estatus_actual,
                fecha_entrega: eq.fecha_entrega,
                tiene_pdf: !!eq.certificado_url,
                url_pdf: eq.certificado_url ? `https://crm.sicamet.com${eq.certificado_url}` : null
            }
        });
    } catch (err) {
        console.error('Error en /api/public/certificado:', err);
        res.status(500).json({ error: err.message });
    }
});

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
        const [esperando] = await db.query(`SELECT COUNT(*) as total FROM whatsapp_chats WHERE bot_desactivado = 1`);
        const [[botCots]] = await db.query("SELECT COUNT(*) as total FROM cotizaciones_bot WHERE estatus = 'nueva'");
        const [[botCalif]] = await db.query("SELECT COUNT(*) as total FROM calificaciones_bot WHERE estatus = 'nueva'");
        const [[botVerif]] = await db.query("SELECT COUNT(*) as total FROM verificentros_bot WHERE estatus = 'nueva'");
        const [[botVentas]] = await db.query("SELECT COUNT(*) as total FROM ventas_bot WHERE estatus = 'nueva'");
        const totalBotLeads = botCots.total + botCalif.total + botVerif.total + botVentas.total;
        
        // Obtener últimos escalados formateados para la lista
        const [lastEsc] = await db.query("SELECT id, cliente_whatsapp, motivo, created_at FROM escalados WHERE estatus = 'pendiente' ORDER BY id DESC");
        const formattedEsc = lastEsc.slice(0, 5).map(e => ({
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
            clientes_esperando: lastEsc.length,
            nuevos_leads: totalBotLeads,
            detenidos_laboratorio: qLab[0].total || 0,
            listos_sin_notificar: listosSinNotificar[0].total || 0,
            cotizaciones_bot_pendientes: botCots.total || 0,
            escalados_bot: formattedEsc, // Lista profesional
            escalados_bot_pendientes: lastEsc.length,
            escalados_count: lastEsc.length,
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

app.get('/api/kpis_aseguramiento', async (req, res) => {
    try {
        const [[qAseg]] = await db.query(`SELECT COUNT(*) as total FROM instrumentos_estatus WHERE estatus_actual='Aseguramiento'`);
        const [[qCert]] = await db.query(`SELECT COUNT(*) as total FROM instrumentos_estatus WHERE estatus_actual='Certificación'`);
        const [[qListos]] = await db.query(`SELECT COUNT(*) as total FROM instrumentos_estatus WHERE estatus_actual='Listo'`);
        
        // SLA Crítico (<= 1 día)
        const [equiposSLA] = await db.query(`SELECT fecha_ingreso, sla FROM instrumentos_estatus WHERE estatus_actual NOT IN ('Entregado', 'Cancelado')`);
        const criticos = equiposSLA.filter(e => {
            const dIng = e.fecha_ingreso ? new Date(e.fecha_ingreso) : new Date();
            const diasPasados = Math.floor((new Date() - dIng) / (1000 * 60 * 60 * 24));
            return (e.sla - diasPasados) <= 1;
        }).length;

        const [[sinPdf]] = await db.query(`SELECT COUNT(*) as total FROM instrumentos_estatus WHERE estatus_actual IN ('Certificación', 'Listo', 'Entregado') AND certificado_url IS NULL`);
        
        const [enCorreccion] = await db.query(`
            SELECT 
                ie.id, 
                ie.orden_cotizacion, 
                ie.nombre_instrumento, 
                ie.empresa,
                ie.rechazos_aseguramiento,
                (SELECT MAX(fecha_rechazo) FROM rechazos_aseguramiento WHERE instrumento_id = ie.id) as fecha_rechazo,
                (SELECT motivo FROM rechazos_aseguramiento WHERE instrumento_id = ie.id ORDER BY id DESC LIMIT 1) as motivo,
                (SELECT estatus FROM instrumento_metrologos WHERE instrumento_id = ie.id ORDER BY id DESC LIMIT 1) as metrologo_estatus,
                (SELECT COUNT(*) FROM instrumentos_comentarios WHERE instrumento_id = ie.id) as msg_count
            FROM instrumentos_estatus ie
            WHERE ie.estatus_actual = 'Laboratorio'
              AND EXISTS (SELECT 1 FROM rechazos_aseguramiento r WHERE r.instrumento_id = ie.id AND r.estatus = 'pendiente')
            ORDER BY fecha_rechazo DESC
            LIMIT 50
        `);

        const [corregidos] = await db.query(`
            SELECT 
                ie.id, 
                ie.orden_cotizacion, 
                ie.nombre_instrumento, 
                ie.empresa,
                r.fecha_rechazo,
                r.motivo as motivo_rechazo,
                r.fecha_correccion
            FROM instrumentos_estatus ie
            JOIN rechazos_aseguramiento r ON r.instrumento_id = ie.id
            WHERE r.estatus = 'corregido'
            ORDER BY r.fecha_correccion DESC
            LIMIT 50
        `);
        
        res.json({
            pendientes_aseguramiento: qAseg.total || 0,
            en_certificacion: qCert.total || 0,
            listos_hoy: qListos.total || 0,
            sla_critico: criticos,
            sin_pdf: sinPdf.total || 0,
            en_correccion: enCorreccion,
            corregidos: corregidos
        });
    } catch(err) { 
        console.error("Error en KPI Aseguramiento:", err.message);
        res.status(500).json({error: err.message}); 
    }
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
app.post('/api/instrumentos-multiple', verificarToken(), async (req, res) => {
    const { instrumentos, metrologos_ids } = req.body;
    if (!instrumentos || instrumentos.length === 0) return res.status(400).json({error: "No hay datos"});

    try {
        const query = `INSERT INTO instrumentos_estatus
            (orden_cotizacion, cotizacion_referencia, fecha_recepcion, fecha_recepcion_parsed, servicio_solicitado, empresa, nombre_certificados, direccion, persona, contacto_email, tipo_servicio, nombre_instrumento, marca, modelo, no_serie, numero_informe, no_certificado, clave, identificacion, ubicacion, requerimientos_especiales, puntos_calibrar, intervalo_calibracion, sla, estatus_actual, area_laboratorio, metrologo_asignado_id)
            VALUES ?`;

        const primerMetrologo = Array.isArray(metrologos_ids) && metrologos_ids.length > 0 ? metrologos_ids[0] : null;

        const valores = instrumentos.map(ins => {
            // Parsear fecha_recepcion a DATE para SLA real
            let fechaParsed = null;
            if (ins.fecha_recepcion) {
                const limpia = ins.fecha_recepcion.trim();
                const m1 = limpia.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
                if (m1) fechaParsed = `${m1[3]}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`;
                else {
                    const m2 = limpia.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})/);
                    if (m2) fechaParsed = `${m2[1]}-${m2[2].padStart(2,'0')}-${m2[3].padStart(2,'0')}`;
                    else {
                        const m3 = limpia.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
                        if (m3) fechaParsed = limpia;
                    }
                }
            }
            return [
                ins.orden_cotizacion, ins.cotizacion_referencia || null, ins.fecha_recepcion || null, fechaParsed,
                ins.servicio_solicitado || null,
                ins.empresa, ins.nombre_certificados || null, ins.direccion || null, ins.persona, ins.contacto_email || null,
                ins.tipo_servicio, ins.nombre_instrumento,
                ins.marca, ins.modelo, ins.no_serie, ins.no_certificado || null, ins.no_certificado || null,
                ins.clave || null, ins.identificacion, ins.ubicacion, ins.requerimientos_especiales, ins.puntos_calibrar,
                ins.intervalo_calibracion || null, ins.sla, 'Laboratorio',
                ins.area_laboratorio || null, primerMetrologo
            ];
        });

        const [r] = await db.query(query, [valores]);
        const firstId = r.insertId;
        const count = r.affectedRows;

        // Asignación múltiple en la nueva tabla
        if (Array.isArray(metrologos_ids) && metrologos_ids.length > 0) {
            const imValues = [];
            for (let i = 0; i < count; i++) {
                const instId = firstId + i;
                metrologos_ids.forEach(mid => {
                    imValues.push([instId, mid, 'asignado']);
                });
            }
            if (imValues.length > 0) {
                await db.query('INSERT INTO instrumento_metrologos (instrumento_id, usuario_id, estatus) VALUES ?', [imValues]);
            }
        }

        // Auditoría
        const auditoriaValues = Array.from({length: count}, (_, i) => [
            firstId + i, 'registro_multiple', req.usuario.id,
            JSON.stringify({orden: instrumentos[0]?.orden_cotizacion, instrumento: instrumentos[i]?.nombre_instrumento})
        ]);
        for (const row of auditoriaValues) {
            await db.query(
                `INSERT INTO auditoria_instrumentos (instrumento_id, accion, usuario_id, detalles) VALUES (?, ?, ?, ?)`,
                [row[0], row[1], row[2], row[3]]
            );
        }

        console.log(`✅ Registradas ${instrumentos.length} partidas de la orden ${instrumentos[0].orden_cotizacion} → área: ${instrumentos[0].area_laboratorio}, SLA desde: ${valores[0][3] || 'fecha_ingreso'}`);

        if (global.io) global.io.emit('actualizacion_operativa', { tipo: 'registro_multiple' });

        res.json({ success: true, count: instrumentos.length });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/instrumentos', verificarToken(), async (req, res) => {
    try {
        const { rol, area, id: userId } = req.usuario;
        const { folio } = req.query;
        
        let query = `
            SELECT ie.*, 
                   (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', u.id, 'nombre', u.nombre, 'estatus', im.estatus))
                    FROM instrumento_metrologos im
                    JOIN usuarios u ON u.id = im.usuario_id
                    WHERE im.instrumento_id = ie.id) as metrologos_asignados
            FROM instrumentos_estatus ie
            WHERE 1=1
        `;
        let params = [];

        if (folio) {
            query += " AND ie.orden_cotizacion = ?";
            params.push(folio);
        }

        if (rol === 'admin') {
            query += ' ORDER BY ie.fecha_ingreso DESC';
        } else if (rol === 'aseguramiento' || rol === 'validacion') {
            query += " AND ie.estatus_actual IN ('Aseguramiento','Certificación','Listo','Entregado') ORDER BY ie.fecha_ingreso DESC";
        } else if (rol === 'metrologo' || rol === 'operador') {
            const [userRow] = await db.query('SELECT permisos, es_lider_area FROM usuarios WHERE id = ?', [userId]);
            let permisos = [];
            try { permisos = JSON.parse(userRow[0]?.permisos || '[]'); } catch(_) {}
            const esLider = !!(userRow[0]?.es_lider_area);
            
            if (area && (permisos.includes('supervisor_area') || esLider)) {
                // Líder de área o supervisor: ve TODO su área O lo que tenga asignado específicamente
                query += ` 
                    AND (
                        ie.area_laboratorio = ? 
                        OR ie.metrologo_asignado_id = ? 
                        OR EXISTS (SELECT 1 FROM instrumento_metrologos im WHERE im.instrumento_id = ie.id AND im.usuario_id = ?)
                    ) 
                    ORDER BY ie.fecha_ingreso DESC
                `;
                params.push(area, userId, userId);
            } else {
                // Metrología normal: ve únicamente lo que tiene asignado (de cualquier área)
                query += ` 
                    AND (
                        ie.metrologo_asignado_id = ? 
                        OR EXISTS (SELECT 1 FROM instrumento_metrologos im WHERE im.instrumento_id = ie.id AND im.usuario_id = ?)
                    ) 
                    ORDER BY ie.fecha_ingreso DESC
                `;
                params.push(userId, userId);
            }
        } else {
            query += ' ORDER BY ie.fecha_ingreso DESC';
        }

        const [equipos] = await db.query(query, params);
        // Parsear JSON de metrologos_asignados y calcular SLA real
        const finalEquipos = equipos.map(e => {
            const metrologosParsed = typeof e.metrologos_asignados === 'string' ? JSON.parse(e.metrologos_asignados) : (e.metrologos_asignados || []);
            
            // Calcular SLA real desde fecha_recepcion_parsed (no fecha_ingreso)
            const slaInfo = calcularSLAReal(
                e.fecha_recepcion_parsed,
                e.fecha_recepcion,
                e.fecha_ingreso,
                e.sla
            );

            return {
                ...e,
                metrologos_asignados: metrologosParsed,
                dias_pasados: slaInfo.diasPasados,
                sla_restante: slaInfo.slaRestante,
                sla_fecha_base: slaInfo.fechaBase
            };
        });
        res.json(finalEquipos);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── ÁREAS DE LABORATORIO ────────────────────────────────────────────────────
app.get('/api/areas', verificarToken(), async (req, res) => {
    try {
        const [areas] = await db.query('SELECT * FROM laboratorio_areas ORDER BY nombre ASC');
        res.json(areas);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/areas', verificarToken(['admin']), async (req, res) => {
    try {
        const { nombre, descripcion } = req.body;
        if (!nombre) return res.status(400).json({ error: 'Nombre del área requerido' });
        const [r] = await db.query('INSERT INTO laboratorio_areas (nombre, descripcion) VALUES (?, ?)', [nombre.trim(), descripcion || '']);
        res.json({ success: true, id: r.insertId });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/areas/:id', verificarToken(['admin']), async (req, res) => {
    try {
        const { nombre, descripcion, activa } = req.body;
        await db.query('UPDATE laboratorio_areas SET nombre = ?, descripcion = ?, activa = ? WHERE id = ?', [nombre, descripcion || '', activa !== undefined ? activa : 1, req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/areas/:id', verificarToken(['admin']), async (req, res) => {
    try {
        await db.query('DELETE FROM laboratorio_areas WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Metrólogos de un área específica o todos los metrólogos si no hay área
app.get('/api/usuarios/metrologos', verificarToken(), async (req, res) => {
    try {
        const { area } = req.query;
        let query = "SELECT id, nombre, email, rol, area FROM usuarios WHERE activo = 1 AND rol IN ('metrologo','operador','admin')";
        let params = [];
        if (area) {
            query += " AND area = ?";
            params.push(area);
        }
        query += " ORDER BY nombre ASC";
        const [rows] = await db.query(query, params);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/areas/:area/metrologos', verificarToken(), async (req, res) => {
    try {
        const [rows] = await db.query(
            "SELECT id, nombre, email, rol FROM usuarios WHERE area = ? AND activo = 1 AND rol IN ('metrologo','operador') ORDER BY nombre ASC",
            [req.params.area]
        );
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── ASIGNACIÓN MÚLTIPLE Y FLUJO TÉCNICO ───
app.post('/api/instrumentos/:id/asignar_metrologos', verificarToken(['admin', 'recepcionista']), async (req, res) => {
    try {
        const { id } = req.params;
        const { metrologos_ids } = req.body; // Array de IDs
        if (!Array.isArray(metrologos_ids)) return res.status(400).json({ error: 'Se requiere un array de IDs' });

        // Limpiar asignaciones anteriores
        await db.query('DELETE FROM instrumento_metrologos WHERE instrumento_id = ?', [id]);

        if (metrologos_ids.length > 0) {
            const values = metrologos_ids.map(mid => [id, mid, 'asignado']);
            await db.query('INSERT INTO instrumento_metrologos (instrumento_id, usuario_id, estatus) VALUES ?', [values]);
            
            // Notificar a cada metrólogo
            for (const mid of metrologos_ids) {
                await crearNotificacionGlobal({
                    titulo: 'Nuevo equipo asignado',
                    detalle: `Se te ha asignado un nuevo instrumento para calibración.`,
                    tipo: 'asignacion',
                    ruta: '/metrologia',
                    urgencia: 'media',
                    metadata: { instrumento_id: id },
                    usuario_destino_id: mid 
                });
            }
        }
        
        if (global.io) global.io.emit('actualizacion_operativa', { tipo: 'asignacion_metrologos', id });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/instrumentos/bulk-update-header', verificarToken(['admin', 'recepcionista']), async (req, res) => {
    try {
        const { orden_cotizacion, empresa, persona, sla } = req.body;
        if (!orden_cotizacion) return res.status(400).json({ error: 'Falta orden_cotizacion' });

        await db.query(
            'UPDATE instrumentos_estatus SET empresa = ?, persona = ?, sla = ? WHERE orden_cotizacion = ? OR folio_rastreo = ?',
            [empresa, persona, sla, orden_cotizacion, orden_cotizacion]
        );

        res.json({ success: true, message: 'Orden actualizada globalmente' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/instrumentos/:id/finalizar_metrologo', verificarToken(), async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.usuario.id;
        const body = req.body || {}; // ✅ Protección: req.body puede ser undefined si no hay Content-Type
        const { enviar_a_aseguramiento } = body; // Flag para forzar envío individual

        // 1. Marcar mi parte como terminada
        await db.query(
            'UPDATE instrumento_metrologos SET estatus = "terminado", fecha_fin = NOW() WHERE instrumento_id = ? AND usuario_id = ?',
            [id, userId]
        );

        // 2. Verificar si TODOS los metrologos asignados terminaron
        const [pendientes] = await db.query(
            'SELECT COUNT(*) as total FROM instrumento_metrologos WHERE instrumento_id = ? AND estatus != "terminado"',
            [id]
        );

        // 3. Obtener info del instrumento para auditoria
        const [infoInstrumento] = await db.query(
            'SELECT orden_cotizacion, nombre_instrumento, estatus_actual FROM instrumentos_estatus WHERE id = ?',
            [id]
        );

        const todosTerminaron = pendientes[0].total === 0;
        const esEnvioForzado = enviar_a_aseguramiento === true;

        // 4. Mover a Aseguramiento si:
        //    a) Todos los metrologos terminaron, O
        //    b) El metrologo fuerza el envío individual (quiere enviar su parte aunque otros no terminen)
        if (todosTerminaron || esEnvioForzado) {
            if (todosTerminaron) {
                // Caso normal: todos terminaron → mover a Aseguramiento
                await db.query('UPDATE instrumentos_estatus SET estatus_actual = "Aseguramiento" WHERE id = ?', [id]);
                await db.query(
                    'INSERT INTO instrumentos_historial (instrumento_id, usuario_id, estatus_anterior, estatus_nuevo, comentario) VALUES (?, ?, ?, ?, ?)',
                    [id, userId, 'Laboratorio', 'Aseguramiento', 'Todos los metrólogos terminaron su parte.']
                );
                // Marcar como corregido en la tabla de rechazos si aplica
                await db.query(
                    "UPDATE rechazos_aseguramiento SET estatus = 'corregido', fecha_correccion = NOW() WHERE instrumento_id = ? AND estatus = 'pendiente'",
                    [id]
                );
            } else {
                // Envio individual: este metrologo terminó pero otros aún trabajan
                await db.query('UPDATE instrumentos_estatus SET estatus_actual = "Aseguramiento" WHERE id = ?', [id]);
                await db.query(
                    'INSERT INTO instrumentos_historial (instrumento_id, usuario_id, estatus_anterior, estatus_nuevo, comentario) VALUES (?, ?, ?, ?, ?)',
                    [id, userId, 'Laboratorio', 'Aseguramiento', `Metrólogo ${req.usuario.nombre} finalizó su parte. Aún hay metrologos pendientes.`]
                );

                // Marcar como corregido en la tabla de rechazos si aplica
                await db.query(
                    "UPDATE rechazos_aseguramiento SET estatus = 'corregido', fecha_correccion = NOW() WHERE instrumento_id = ? AND estatus = 'pendiente'",
                    [id]
                );

                // Notificar a los metrologos pendientes (opcional, puede fallar sin romper el flujo)
                try {
                    const [pendientesInfo] = await db.query(
                        `SELECT im.usuario_id, u.nombre FROM instrumento_metrologos im 
                         JOIN usuarios u ON u.id = im.usuario_id 
                         WHERE im.instrumento_id = ? AND im.estatus != 'terminado'`,
                        [id]
                    );

                    for (const p of pendientesInfo) {
                        await db.query(
                            `INSERT INTO notificaciones_globales (titulo, detalle, tipo, ruta, urgencia, metadata, creado_por_id) 
                             VALUES (?, ?, ?, ?, ?, ?, ?)`,
                            ['Equipo enviado a Aseguramiento sin tu parte', 
                             `El instrumento "${infoInstrumento[0]?.nombre_instrumento}" (${infoInstrumento[0]?.orden_cotizacion}) fue enviado a Aseguramiento por ${req.usuario.nombre} mientras aún tenías trabajo pendiente.`,
                             'envio_individual', '/metrologia', 'alta',
                             JSON.stringify({instrumento_id: id}), userId]
                        );
                    }
                } catch (notifErr) {
                    console.warn('⚠️ No se pudo enviar notificación a metrólogos pendientes:', notifErr.message);
                }
            }

            // Log de auditoría (opcional, puede fallar sin romper el flujo)
            try {
                await db.query(
                    `INSERT INTO auditoria_instrumentos (instrumento_id, accion, usuario_id, detalles) 
                     VALUES (?, ?, ?, ?)`,
                    [id, 'envio_a_aseguramiento', userId,
                     JSON.stringify({
                         todos_terminaron: todosTerminaron,
                         envio_forzado: esEnvioForzado,
                         orden: infoInstrumento[0]?.orden_cotizacion
                     })]
                );
            } catch (auditErr) {
                console.warn('⚠️ No se pudo escribir auditoria_instrumentos:', auditErr.message);
            }
        } else {
            // Solo marqué mi parte como terminada, el equipo sigue en Laboratorio
            try {
                await db.query(
                    `INSERT INTO auditoria_instrumentos (instrumento_id, accion, usuario_id, detalles) 
                     VALUES (?, ?, ?, ?)`,
                    [id, 'parte_terminada', userId,
                     JSON.stringify({
                         pendientes: pendientes[0].total,
                         orden: infoInstrumento[0]?.orden_cotizacion
                     })]
                );
            } catch (auditErr) {
                console.warn('⚠️ No se pudo escribir auditoria_instrumentos:', auditErr.message);
            }
        }

        if (global.io) global.io.emit('actualizacion_operativa', { tipo: 'tecnico_termino', id });
        res.json({ success: true, todos_terminaron: todosTerminaron, enviado_a_aseguramiento: todosTerminaron || esEnvioForzado });
    } catch (err) {
        console.error('❌ Error en finalizar_metrologo (instrumento_id=' + req.params.id + '):', err.message);
        console.error(err.stack);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/instrumentos/:id/solicitar_correccion', verificarToken(), async (req, res) => {
    try {
        const { id } = req.params;
        const { usuario_destino_id, motivo } = req.body;
        const userId = req.usuario.id;

        // 1. Obtener info previa
        const [info] = await db.query('SELECT estatus_actual, orden_cotizacion, nombre_instrumento FROM instrumentos_estatus WHERE id = ?', [id]);
        
        // 2. Registrar rechazo oficial para que aparezca en reportes y Dashboard
        await db.query(
            `INSERT INTO rechazos_aseguramiento (instrumento_id, usuario_rechaza_id, usuario_destino_id, motivo, estatus_previo) 
             VALUES (?, ?, ?, ?, ?)`,
            [id, userId, usuario_destino_id || null, motivo, info[0]?.estatus_actual || 'Laboratorio']
        );

        // 3. Incrementar contador
        await db.query('UPDATE instrumentos_estatus SET rechazos_aseguramiento = rechazos_aseguramiento + 1 WHERE id = ?', [id]);

        // 4. Regresar a Laboratorio en la tabla de metrólogos
        if (usuario_destino_id) {
            await db.query(
                'UPDATE instrumento_metrologos SET estatus = "correccion", fecha_fin = NULL WHERE instrumento_id = ? AND usuario_id = ?',
                [id, usuario_destino_id]
            );
        } else {
            // Si no hay destino, marcar todos como corrección
            await db.query(
                'UPDATE instrumento_metrologos SET estatus = "correccion", fecha_fin = NULL WHERE instrumento_id = ?',
                [id]
            );
        }

        // 5. Regresar estatus global
        await db.query('UPDATE instrumentos_estatus SET estatus_actual = "Laboratorio" WHERE id = ?', [id]);

        // 6. Historial
        await db.query(
            'INSERT INTO instrumentos_historial (instrumento_id, usuario_id, estatus_anterior, estatus_nuevo, comentario) VALUES (?, ?, ?, ?, ?)',
            [id, userId, info[0]?.estatus_actual || 'Desconocido', 'Laboratorio', `Corrección: ${motivo}`]
        );

        // 7. Notificación
        await crearNotificacionGlobal({
            titulo: 'Corrección solicitada',
            detalle: `Se requiere corregir el equipo: ${info[0]?.nombre_instrumento}. Motivo: ${motivo}`,
            tipo: 'correccion',
            ruta: '/metrologia',
            urgencia: 'alta',
            metadata: { instrumento_id: id },
            usuario_destino_id: usuario_destino_id
        });

        if (global.io) global.io.emit('actualizacion_operativa', { tipo: 'correccion_solicitada', id });
        res.json({ success: true });
    } catch (err) { 
        console.error("Error en solicitar_correccion:", err);
        res.status(500).json({ error: err.message }); 
    }
});

// ═══════════════════════════════════════════════════════════
// NUEVOS ENDPOINTS FASE 2: Rechazos, Validación, Metrología
// ═══════════════════════════════════════════════════════════

// --- RECHAZO DE ASEGURAMIENTO (con trazabilidad completa) ---
app.post('/api/instrumentos/:id/rechazar_aseguramiento', verificarToken(), async (req, res) => {
    try {
        const { id } = req.params;
        const { motivo, metrologo_destino_id } = req.body;
        const userId = req.usuario.id;

        // 1. Registrar en tabla de rechazos
        const [infoInstrumento] = await db.query(
            'SELECT orden_cotizacion, nombre_instrumento, estatus_actual FROM instrumentos_estatus WHERE id = ?', [id]
        );

        await db.query(
            `INSERT INTO rechazos_aseguramiento (instrumento_id, usuario_rechaza_id, usuario_destino_id, motivo, estatus_previo) 
             VALUES (?, ?, ?, ?, ?)`,
            [id, userId, metrologo_destino_id || null, motivo, infoInstrumento[0]?.estatus_actual]
        );

        // 2. Incrementar contador de rechazos
        await db.query(
            'UPDATE instrumentos_estatus SET rechazos_aseguramiento = rechazos_aseguramiento + 1 WHERE id = ?',
            [id]
        );

        // 3. Regresar a Laboratorio
        await db.query('UPDATE instrumentos_estatus SET estatus_actual = "Laboratorio" WHERE id = ?', [id]);

        // 4. Resetear estatus de metrologos para que puedan trabajar la corrección
        await db.query(
            'UPDATE instrumento_metrologos SET estatus = "correccion", fecha_fin = NULL WHERE instrumento_id = ?',
            [id]
        );

        // Si hay un metrólogo destino específico, crearle una nueva asignación de corrección
        if (metrologo_destino_id) {
            const [exists] = await db.query(
                'SELECT id FROM instrumento_metrologos WHERE instrumento_id = ? AND usuario_id = ?',
                [id, metrologo_destino_id]
            );
            if (exists.length === 0) {
                await db.query(
                    'INSERT INTO instrumento_metrologos (instrumento_id, usuario_id, estatus) VALUES (?, ?, ?)',
                    [id, metrologo_destino_id, 'correccion']
                );
            }
        }

        // 5. Historial
        await db.query(
            'INSERT INTO instrumentos_historial (instrumento_id, usuario_id, estatus_anterior, estatus_nuevo, comentario) VALUES (?, ?, ?, ?, ?)',
            [id, userId, infoInstrumento[0]?.estatus_actual, 'Laboratorio', `RECHAZO #${(infoInstrumento[0]?.rechazos_aseguramiento || 0) + 1}: ${motivo}`]
        );

        // 6. Auditoría
        await db.query(
            `INSERT INTO auditoria_instrumentos (instrumento_id, accion, usuario_id, detalles) VALUES (?, ?, ?, ?)`,
            [id, 'rechazo_aseguramiento', userId, JSON.stringify({
                motivo,
                rechazos: (infoInstrumento[0]?.rechazos_aseguramiento || 0) + 1,
                orden: infoInstrumento[0]?.orden_cotizacion,
                instrumento: infoInstrumento[0]?.nombre_instrumento
            })]
        );

        // 7. Notificación al metrólogo
        await crearNotificacionGlobal({
            titulo: `Equipo rechazado (Rechazo #${(infoInstrumento[0]?.rechazos_aseguramiento || 0) + 1})`,
            detalle: `${req.usuario.nombre} rechazó "${infoInstrumento[0]?.nombre_instrumento}" (${infoInstrumento[0]?.orden_cotizacion}). Motivo: ${motivo}`,
            tipo: 'rechazo',
            ruta: '/metrologia',
            urgencia: 'alta',
            metadata: { instrumento_id: id },
            usuario_destino_id: metrologo_destino_id
        });

        if (global.io) global.io.emit('actualizacion_operativa', { tipo: 'rechazo_aseguramiento', id });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- OBTENER HISTORIAL DE RECHAZOS DE UN INSTRUMENTO ---
app.get('/api/instrumentos/:id/rechazos', verificarToken(), async (req, res) => {
    try {
        const [rechazos] = await db.query(
            `SELECT r.*, 
                    ur.nombre as rechaza_nombre,
                    ud.nombre as destino_nombre
             FROM rechazos_aseguramiento r
             LEFT JOIN usuarios ur ON ur.id = r.usuario_rechaza_id
             LEFT JOIN usuarios ud ON ud.id = r.usuario_destino_id
             WHERE r.instrumento_id = ?
             ORDER BY r.fecha_rechazo DESC`,
            [req.params.id]
        );
        res.json(rechazos);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- VALIDACIÓN DE CERTIFICADO POR IA ---
app.post('/api/instrumentos/:id/validar-certificado', verificarToken(), uploadCert.single('archivo'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No se subió archivo PDF' });

        const [equipo] = await db.query(
            'SELECT * FROM instrumentos_estatus WHERE id = ?',
            [req.params.id]
        );
        if (equipo.length === 0) {
            if (req.file.path) fs.unlinkSync(req.file.path);
            return res.status(404).json({ error: 'Equipo no encontrado' });
        }

        const fullFilePath = path.join(__dirname, 'uploads', 'certificados', req.file.filename);

        // Ejecutar parser del certificado
        execFile('python3', [path.join(__dirname, 'pdf_parser.py'), '--certificado', fullFilePath], 
            { maxBuffer: 1024 * 1024 * 10 }, 
            async (error, stdout, stderr) => {
                if (error) {
                    console.error("Error validación certificado:", stderr);
                    if (fs.existsSync(fullFilePath)) fs.unlinkSync(fullFilePath);
                    return res.status(500).json({ error: 'Error al procesar el certificado con IA.' });
                }

                try {
                    const certDatos = JSON.parse(stdout);
                    if (certDatos.error) {
                        return res.status(400).json({ error: certDatos.error });
                    }

                    // Preparar la "partida" del equipo para comparar
                    const partida = {
                        no_certificado: equipo[0].no_certificado || equipo[0].numero_informe,
                        marca: equipo[0].marca,
                        modelo: equipo[0].modelo,
                        no_serie: equipo[0].no_serie,
                        identificacion: equipo[0].identificacion
                    };

                    // Validar usando la función del parser
                    const validacion = require('./pdf_parser.py'); // No se puede directamente, replicar lógica
                    // Replicar la validación aquí
                    const validacionResult = validarCertificadoContraOrden(certDatos.datos || {}, partida);

                    res.json({
                        validacion: validacionResult,
                        datos_certificado: certDatos.datos,
                        archivo_ruta: req.file.filename
                    });
                } catch (parseErr) {
                    res.status(500).json({ error: 'Error al parsear resultado de IA: ' + parseErr.message });
                }
            }
        );
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Función auxiliar de validación (replica la lógica del parser)
function validarCertificadoContraOrden(certDatos, partida) {
    function n(s) { return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
    function vacio(s) { return ['', 'no indicado', 'no indicada', 'no especificado'].includes(n(s)); }
    
    const comparaciones = [
        ("no_certificado", certDatos.no_certificado || "", partida.no_certificado || ""),
        ("marca",          certDatos.marca || "",          partida.marca || ""),
        ("modelo",         certDatos.modelo || "",         partida.modelo || ""),
        ("serie",          certDatos.serie || "",          partida.no_serie || ""),
        ("identificacion", certDatos.identificacion || "", partida.identificacion || ""),
    ];

    const ok = [], fail = [];
    for (const [campo, vc, vo] of comparaciones) {
        if (vacio(vc) || vacio(vo)) continue;
        const c = n(vc), o = n(vo);
        if (c === o || c.includes(o) || o.includes(c)) ok.push(campo);
        else fail.push({ campo, en_certificado: vc, en_orden: vo });
    }

    const total = ok.length + fail.length;
    return {
        coincide: fail.length === 0 && ok.length > 0,
        confianza: total > 0 ? Math.round(ok.length / total * 100) : 0,
        campos_ok: ok,
        campos_fail: fail
    };
}

// --- EQUIPOS LISTOS SIN CERTIFICADO (alerta persistente) ---
app.get('/api/instrumentos/sin-certificado', verificarToken(), async (req, res) => {
    try {
        const [equipos] = await db.query(
            `SELECT ie.*,
                    (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', u.id, 'nombre', u.nombre, 'estatus', im.estatus))
                     FROM instrumento_metrologos im
                     JOIN usuarios u ON u.id = im.usuario_id
                     WHERE im.instrumento_id = ie.id) as metrologos_asignados,
                    ie.rechazos_aseguramiento
             FROM instrumentos_estatus ie
             WHERE (ie.estatus_actual = 'Listo' OR ie.estatus_actual = 'Entregado')
               AND (ie.no_certificado IS NULL OR ie.no_certificado = '')
               AND (ie.numero_informe IS NULL OR ie.numero_informe = '')
             ORDER BY 
                CASE ie.estatus_actual WHEN 'Listo' THEN 0 ELSE 1 END,
                ie.fecha_ingreso DESC`,
            []
        );

        const finalEquipos = equipos.map(e => ({
            ...e,
            metrologos_asignados: typeof e.metrologos_asignados === 'string' ? JSON.parse(e.metrologos_asignados) : []
        }));

        res.json(finalEquipos);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- MI BANDEJA (solo instrumentos asignados a este metrólogo) ---
app.get('/api/metrologia/mi-bandeja', verificarToken(), async (req, res) => {
    try {
        const userId = req.usuario.id;
        const [equipos] = await db.query(
            `SELECT ie.*, im.estatus as mi_estatus, im.fecha_asignacion, im.fecha_fin,
                    ie.rechazos_aseguramiento,
                    (SELECT COUNT(*) FROM rechazos_aseguramiento WHERE instrumento_id = ie.id) as total_rechazos
             FROM instrumentos_estatus ie
             JOIN instrumento_metrologos im ON im.instrumento_id = ie.id
             WHERE im.usuario_id = ? AND ie.estatus_actual = 'Laboratorio'
             ORDER BY ie.fecha_recepcion_parsed ASC, ie.fecha_ingreso ASC`,
            [userId]
        );

        // Calcular SLA real para cada equipo
        const conSLA = equipos.map(e => ({
            ...e,
            ...calcularSLAReal(e.fecha_recepcion_parsed, e.fecha_recepcion, e.fecha_ingreso, e.sla)
        }));

        res.json(conSLA);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- LABORATORIO GENERAL (todos los instrumentos del área, para supervisores) ---
app.get('/api/metrologia/laboratorio-general', verificarToken(), async (req, res) => {
    try {
        const { area } = req.query;
        let query = `
            SELECT ie.*,
                   (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', u.id, 'nombre', u.nombre, 'estatus', im.estatus, 'fecha_fin', im.fecha_fin))
                    FROM instrumento_metrologos im
                    JOIN usuarios u ON u.id = im.usuario_id
                    WHERE im.instrumento_id = ie.id) as metrologos_asignados,
                   (SELECT COUNT(*) FROM rechazos_aseguramiento WHERE instrumento_id = ie.id) as total_rechazos
            FROM instrumentos_estatus ie
            WHERE ie.estatus_actual = 'Laboratorio'
        `;
        let params = [];

        if (area) {
            query += ' AND ie.area_laboratorio = ?';
            params.push(area);
        }

        query += ' ORDER BY ie.fecha_recepcion_parsed ASC, ie.fecha_ingreso ASC';

        const [equipos] = await db.query(query, params);
        const finalEquipos = equipos.map(e => ({
            ...e,
            metrologos_asignados: typeof e.metrologos_asignados === 'string' ? JSON.parse(e.metrologos_asignados) : [],
            ...calcularSLAReal(e.fecha_recepcion_parsed, e.fecha_recepcion, e.fecha_ingreso, e.sla)
        }));

        res.json(finalEquipos);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- CORRECCIONES PENDIENTES ---
app.get('/api/metrologia/correcciones', verificarToken(), async (req, res) => {
    try {
        const userId = req.usuario.id;
        const [equipos] = await db.query(
            `SELECT ie.*, im.estatus as mi_estatus, 
                    COALESCE(r.motivo, 'Revisar chat de corrección') as ultimo_motivo, 
                    r.fecha_rechazo,
                    ie.rechazos_aseguramiento,
                    (SELECT COUNT(*) FROM instrumentos_comentarios ic WHERE ic.instrumento_id = ie.id) as comentarios_count
             FROM instrumentos_estatus ie
             JOIN instrumento_metrologos im ON im.instrumento_id = ie.id
             LEFT JOIN (
                 SELECT instrumento_id, motivo, fecha_rechazo
                 FROM rechazos_aseguramiento
                 WHERE id IN (SELECT MAX(id) FROM rechazos_aseguramiento GROUP BY instrumento_id)
             ) r ON r.instrumento_id = ie.id
             WHERE im.usuario_id = ? AND im.estatus = 'correccion' AND ie.estatus_actual = 'Laboratorio'
             ORDER BY ie.fecha_ingreso DESC`,
            [userId]
        );

        const conSLA = equipos.map(e => ({
            ...e,
            ...calcularSLAReal(e.fecha_recepcion_parsed, e.fecha_recepcion, e.fecha_ingreso, e.sla)
        }));

        res.json(conSLA);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- AUDITORÍA COMPLETA DE UN INSTRUMENTO ---
app.get('/api/instrumentos/:id/auditoria', verificarToken(), async (req, res) => {
    try {
        const [auditoria] = await db.query(
            `SELECT a.*, u.nombre as usuario_nombre
             FROM auditoria_instrumentos a
             LEFT JOIN usuarios u ON u.id = a.usuario_id
             WHERE a.instrumento_id = ?
             ORDER BY a.fecha DESC`,
            [req.params.id]
        );

        const [historial] = await db.query(
            `SELECT h.*, u.nombre as usuario_nombre
             FROM instrumentos_historial h
             LEFT JOIN usuarios u ON u.id = h.usuario_id
             WHERE h.instrumento_id = ?
             ORDER BY h.fecha DESC`,
            [req.params.id]
        );

        const [rechazos] = await db.query(
            `SELECT r.*, ur.nombre as rechaza_nombre
             FROM rechazos_aseguramiento r
             LEFT JOIN usuarios ur ON ur.id = r.usuario_rechaza_id
             WHERE r.instrumento_id = ?
             ORDER BY r.fecha_rechazo DESC`,
            [req.params.id]
        );

        res.json({ auditoria, historial, rechazos });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- FEEDBACK DEL BOT ---
app.post('/api/bot/feedback', async (req, res) => {
    try {
        const { cliente_wa, empresa, mensaje } = req.body;
        if (!cliente_wa || !mensaje) return res.status(400).json({ error: 'Faltan datos' });

        await db.query(
            'INSERT INTO feedback_bot (cliente_wa, empresa, mensaje) VALUES (?, ?, ?)',
            [limpiarID(cliente_wa), empresa || null, mensaje]
        );

        // Notificar al admin
        if (global.io) global.io.emit('nuevo_feedback', { cliente_wa, empresa, mensaje });

        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/bot/feedback', verificarToken(['admin']), async (req, res) => {
    try {
        const [feedbacks] = await db.query(
            `SELECT * FROM feedback_bot ORDER BY fecha DESC`
        );
        res.json(feedbacks);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/bot/feedback/:id/leido', verificarToken(['admin']), async (req, res) => {
    try {
        await db.query('UPDATE feedback_bot SET leido_admin = 1 WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/bot/feedback/:id/implementado', verificarToken(['admin']), async (req, res) => {
    try {
        await db.query('UPDATE feedback_bot SET implementado = 1, leido_admin = 1 WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/bot/feedback/:id', verificarToken(['admin']), async (req, res) => {
    try {
        await db.query('DELETE FROM feedback_bot WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- KPI ACTUALIZADO CON SLA REAL ---
app.get('/api/metrologia/kpis', verificarToken(), async (req, res) => {
    try {
        const { rol, id: userId, area } = req.usuario;

        // Equipos en Laboratorio con SLA real
        let labQuery = `
            SELECT fecha_recepcion_parsed, fecha_recepcion, fecha_ingreso, sla,
                   area_laboratorio, metrologo_asignado_id, id
            FROM instrumentos_estatus WHERE estatus_actual = 'Laboratorio'
        `;
        let params = [];

        if (rol !== 'admin') {
            labQuery += ` AND (metrologo_asignado_id = ? OR EXISTS (
                SELECT 1 FROM instrumento_metrologos im WHERE im.instrumento_id = instrumentos_estatus.id AND im.usuario_id = ?
            ))`;
            params = [userId, userId];
        }

        const [equiposLab] = await db.query(labQuery, params);

        // Calcular SLA real para cada uno
        const conSLA = equiposLab.map(e => ({
            ...e,
            ...calcularSLAReal(e.fecha_recepcion_parsed, e.fecha_recepcion, e.fecha_ingreso, e.sla)
        }));

        const countTotal = conSLA.length;
        const countRojo = conSLA.filter(e => e.slaRestante <= 1).length;
        const countAmarillo = conSLA.filter(e => e.slaRestante > 1 && e.slaRestante <= 3).length;
        const countVerde = conSLA.filter(e => e.slaRestante > 3).length;

        // Correcciones pendientes
        const [[corrCount]] = await db.query(
            `SELECT COUNT(*) as total FROM instrumento_metrologos im 
             JOIN instrumentos_estatus ie ON ie.id = im.instrumento_id
             WHERE im.usuario_id = ? AND im.estatus = 'correccion' AND ie.estatus_actual = 'Laboratorio'`,
            [userId]
        );

        // Equipos sin certificado (persistente)
        const [[sinCert]] = await db.query(
            `SELECT COUNT(*) as total FROM instrumentos_estatus 
             WHERE estatus_actual IN ('Listo', 'Entregado') 
             AND (no_certificado IS NULL OR no_certificado = '')`
        );

        // Conteo por áreas
        const [porAreas] = await db.query(
            `SELECT area_laboratorio, COUNT(*) as total 
             FROM instrumentos_estatus WHERE estatus_actual = 'Laboratorio' AND area_laboratorio IS NOT NULL 
             GROUP BY area_laboratorio`
        );

        res.json({
            total: countTotal,
            rojo: countRojo,
            amarillo: countAmarillo,
            verde: countVerde,
            correcciones: corrCount.total || 0,
            sin_certificado: sinCert.total || 0,
            por_areas: porAreas
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});


// SUBIR CERTIFICADO (PDF) POR ASEGURAMIENTO
app.post('/api/instrumentos/:id/certificado', verificarToken(['admin', 'aseguramiento', 'validacion', 'validacin']), uploadCert.single('archivo'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No se subió ningún archivo o no es PDF' });
        
        const [rows] = await db.query('SELECT orden_cotizacion, estatus_actual, numero_informe FROM instrumentos_estatus WHERE id = ?', [req.params.id]);
        if (rows.length === 0) {
            if (req.file.path) fs.unlinkSync(req.file.path);
            return res.status(404).json({ error: 'Equipo no encontrado.' });
        }

        const fullFilePath = path.join(__dirname, 'uploads', 'certificados', req.file.filename);
        
        // --- PROCESAMIENTO CON IA (PYTHON) ---
        const pythonCommand = `python3 pdf_parser.py --certificado "${fullFilePath}"`;
        
        exec(pythonCommand, async (error, stdout, stderr) => {
            let nInforme = rows[0].numero_informe || 'PENDIENTE';
            let dataExtraida = {};

            if (!error) {
                try {
                    const aiResult = JSON.parse(stdout);
                    if (!aiResult.error) {
                        dataExtraida = aiResult.datos || {};
                        if (dataExtraida.no_certificado) nInforme = dataExtraida.no_certificado;
                    } else {
                        console.warn("⚠️ IA indicó error (informativo):", aiResult.error);
                    }
                } catch (e) {
                    console.warn("⚠️ Resultado IA no es JSON válido:", stdout);
                }
            } else {
                console.warn("⚠️ Error en ejecución de IA Parser:", stderr);
            }

            // Guardamos el certificado de todas formas, según solicitud del usuario
            const dbPath = `/uploads/certificados/${req.file.filename}`;
            try {
                await db.query('UPDATE instrumentos_estatus SET certificado_url = ?, numero_informe = ? WHERE id = ?', 
                    [dbPath, nInforme, req.params.id]);
                
                if (global.io) {
                    global.io.emit('actualizacion_equipo', { id: req.params.id, certificado_url: dbPath, numero_informe: nInforme });
                }

                res.json({ 
                    success: true, 
                    url: dbPath, 
                    numero_informe: nInforme,
                    ai_data: dataExtraida,
                    message: "Certificado cargado correctamente." + (Object.keys(dataExtraida).length === 0 ? " (Procesamiento automático omitido)" : "")
                });
            } catch (dbErr) {
                console.error("❌ Error DB al guardar certificado:", dbErr.message);
                res.status(500).json({ error: 'Error al guardar el certificado en la base de datos.' });
            }
        });

    } catch (err) { res.status(500).json({ error: err.message }); }
});

// NUEVO: Obtener instrumentos de una orden específica
app.get('/api/ordenes/:orden/instrumentos', verificarToken(), async (req, res) => {
    try {
        const { orden } = req.params;
        const [rows] = await db.query('SELECT * FROM instrumentos_estatus WHERE orden_cotizacion = ? OR orden_cotizacion LIKE ?', [orden, `%${orden}%`]);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// NUEVO: Guardado múltiple de certificados (Certificación Ágil)
app.post('/api/instrumentos-multiple-certificados', verificarToken(['admin', 'aseguramiento']), async (req, res) => {
    try {
        const { vinculaciones } = req.body; // Array de { id, numero_informe, certificado_url }
        if (!vinculaciones || !Array.isArray(vinculaciones)) return res.status(400).json({ error: 'Datos de vinculación inválidos' });

        for (const v of vinculaciones) {
            await db.query('UPDATE instrumentos_estatus SET certificado_url = ?, numero_informe = ? WHERE id = ?', 
                [v.certificado_url, v.numero_informe, v.id]);
        }

        res.json({ success: true, message: `Se vincularon ${vinculaciones.length} certificados.` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});


app.put('/api/instrumentos/:id/estatus', verificarToken(), async (req, res) => {
    try {
        const { estatus, comentario } = req.body;
        const id = req.params.id;
        const { rol } = req.usuario;

        // Solo aseguramiento y admin pueden cambiar estatus
        const rolesPermitidos = ['admin', 'aseguramiento', 'validacion'];
        if (!rolesPermitidos.includes(rol)) {
            return res.status(403).json({ error: 'No tienes permisos para cambiar el estatus de los equipos. Solo Aseguramiento puede hacerlo.' });
        }

        const [oldest] = await db.query('SELECT estatus_actual FROM instrumentos_estatus WHERE id = ?', [id]);
        const oldStatus = oldest[0]?.estatus_actual;

        if (estatus === 'Entregado') {
            await db.query('UPDATE instrumentos_estatus SET estatus_actual = ?, fecha_entrega = CURRENT_TIMESTAMP WHERE id = ?', [estatus, id]);
        } else {
            await db.query('UPDATE instrumentos_estatus SET estatus_actual = ? WHERE id = ?', [estatus, id]);
        }

        // Si se regresa a laboratorio, reactivar asignacion y notificar a TODO el equipo metrologico
        if (estatus === 'Laboratorio') {
            await db.query(`UPDATE instrumento_metrologos SET estatus = 'correccion', fecha_fin = NULL WHERE instrumento_id = ?`, [id]);
            
            // Loguear rechazo oficial para trazabilidad
            if (comentario || oldStatus !== 'Laboratorio') {
                await db.query(
                    `INSERT INTO rechazos_aseguramiento (instrumento_id, usuario_rechaza_id, motivo, estatus_previo) 
                     VALUES (?, ?, ?, ?)`,
                    [id, req.usuario?.id || null, comentario || 'Cambio manual a Laboratorio', oldStatus]
                );
                await db.query('UPDATE instrumentos_estatus SET rechazos_aseguramiento = rechazos_aseguramiento + 1 WHERE id = ?', [id]);
            }

            // Garantizar que si hay un metrologo legado...
            const [eqInfo] = await db.query('SELECT metrologo_asignado_id, orden_cotizacion, nombre_instrumento FROM instrumentos_estatus WHERE id = ?', [id]);
            if (eqInfo.length > 0 && eqInfo[0].metrologo_asignado_id) {
                const [exists] = await db.query('SELECT id FROM instrumento_metrologos WHERE instrumento_id = ? AND usuario_id = ?', [id, eqInfo[0].metrologo_asignado_id]);
                if (exists.length === 0) {
                    await db.query('INSERT INTO instrumento_metrologos (instrumento_id, usuario_id, estatus) VALUES (?, ?, ?)', [id, eqInfo[0].metrologo_asignado_id, 'correccion']);
                }
            }

            if (eqInfo.length > 0) {
                await crearNotificacionGlobal({
                    titulo: `Retornado a Laboratorio: ${eqInfo[0].orden_cotizacion}`,
                    detalle: `El equipo ${eqInfo[0].nombre_instrumento} ha sido regresado a Laboratorio para revisión.`,
                    tipo: 'alerta',
                    ruta: '/metrologia',
                    urgencia: 'alta',
                    creador_id: req.usuario?.id || null,
                    metadata: { instrumento_id: id }
                });
            }
        }
        
        await db.query(
            'INSERT INTO instrumentos_historial (instrumento_id, usuario_id, estatus_anterior, estatus_nuevo) VALUES (?, ?, ?, ?)',
            [id, req.usuario?.id || null, oldStatus, estatus]
        );
        
        if (comentario) {
            await db.query(
                `INSERT INTO instrumentos_comentarios (instrumento_id, usuario_id, mensaje, tipo) VALUES (?, ?, ?, ?)`,
                [id, req.usuario?.id || null, comentario, 'chat']
            );
        }
        
        if (global.io) global.io.emit('actualizacion_operativa', { tipo: 'estatus_instrumento', id: req.params.id });
        
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// NUEVO: BULK UPDATE ESTATUS
app.post('/api/instrumentos/bulk-status', verificarToken(), async (req, res) => {
    // Verificar permisos - admin, aseguramiento, validación, metrología y RECEPCIONISTA (para entregas)
    const { rol } = req.usuario;
    if (!['admin', 'aseguramiento', 'validacion', 'metrologo', 'operador', 'recepcionista'].includes(rol)) {
        return res.status(403).json({ error: 'No tienes permisos para esta acción.' });
    }
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
                    [id, req.usuario?.id || null, comentario, 'chat']
                );
            }

            // --- REINICIO DE METRÓLOGOS SI REGRESA A LABORATORIO ---
            if (estatus === 'Laboratorio') {
                await db.query('UPDATE instrumento_metrologos SET estatus = "correccion", fecha_fin = NULL WHERE instrumento_id = ?', [id]);
                
                // Loguear rechazo oficial
                await db.query(
                    `INSERT INTO rechazos_aseguramiento (instrumento_id, usuario_rechaza_id, motivo, estatus_previo) 
                     VALUES (?, ?, ?, ?)`,
                    [id, req.usuario?.id || null, comentario || 'Rechazo masivo', oldStatus]
                );
                await db.query('UPDATE instrumentos_estatus SET rechazos_aseguramiento = rechazos_aseguramiento + 1 WHERE id = ?', [id]);

                // Fallback legado
                const [fallback] = await db.query('SELECT metrologo_asignado_id FROM instrumentos_estatus WHERE id = ?', [id]);
                if (fallback.length > 0 && fallback[0].metrologo_asignado_id) {
                    const [exists] = await db.query('SELECT id FROM instrumento_metrologos WHERE instrumento_id = ? AND usuario_id = ?', [id, fallback[0].metrologo_asignado_id]);
                    if (exists.length === 0) {
                        await db.query('INSERT INTO instrumento_metrologos (instrumento_id, usuario_id, estatus) VALUES (?, ?, ?)', [id, fallback[0].metrologo_asignado_id, 'correccion']);
                    }
                }
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

app.put('/api/instrumentos/:id', verificarToken(), async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const { id } = req.params;
        const { 
            orden_cotizacion, nombre_instrumento, marca, modelo, no_serie, empresa, 
            identificacion, ubicacion, requerimientos_especiales, puntos_calibrar,
            tipo_servicio, area_laboratorio, persona, sla, metrologos_asignados 
        } = req.body;

        await connection.query(
            `UPDATE instrumentos_estatus SET 
                orden_cotizacion=?, nombre_instrumento=?, marca=?, modelo=?, no_serie=?, empresa=?,
                identificacion=?, ubicacion=?, requerimientos_especiales=?, puntos_calibrar=?,
                tipo_servicio=?, area_laboratorio=?, persona=?, sla=?
             WHERE id=?`, 
            [
                orden_cotizacion, nombre_instrumento, marca, modelo, no_serie, empresa, 
                identificacion, ubicacion, requerimientos_especiales, puntos_calibrar,
                tipo_servicio, area_laboratorio, persona, sla,
                id
            ]
        );

        // Sincronizar metrólogos para este instrumento
        if (Array.isArray(metrologos_asignados)) {
            await connection.query('DELETE FROM instrumento_metrologos WHERE instrumento_id = ?', [id]);
            if (metrologos_asignados.length > 0) {
                const metValues = metrologos_asignados.map(mid => [id, mid, 'asignado']);
                await connection.query('INSERT INTO instrumento_metrologos (instrumento_id, usuario_id, estatus) VALUES ?', [metValues]);
                
                // Mantenemos el primero en la columna legacy por compatibilidad
                await connection.query('UPDATE instrumentos_estatus SET metrologo_asignado_id = ? WHERE id = ?', [metrologos_asignados[0], id]);
            }
        }
        
        await connection.commit();
        if (global.io) global.io.emit('actualizacion_operativa', { tipo: 'edicion_instrumento', id: id });
        res.json({ success: true, message: 'Instrumento actualizado correctamente' });
    } catch (err) { 
        await connection.rollback();
        console.error("Error actualizando instrumento:", err);
        res.status(500).json({ error: err.message }); 
    } finally {
        connection.release();
    }
});

// Endpoint interno (sin token) eliminado - usar el verificado de arriba

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

app.post('/api/leer-pdf', upload.single('archivoPdf'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Sin archivo' });

        const tempPath = path.join(__dirname, `temp_${Date.now()}.pdf`);
        fs.writeFileSync(tempPath, req.file.buffer);

        execFile('python3', [path.join(__dirname, 'pdf_parser.py'), tempPath], { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            if (error) return res.status(500).json({ error: 'Fallo al procesar el PDF.' });

            try {
                const resultado = JSON.parse(stdout.trim());
                if (resultado.error) return res.status(500).json({ error: resultado.error });

                // Normalizar campos del parser nuevo (parser_ia.py)
                if (resultado.cabecera) {
                    const cab = resultado.cabecera;
                    // Mapear nombres de campos del nuevo parser al formato del frontend
                    cab.orden_cotizacion = cab.orden_numero || cab.orden_cotizacion || '';
                    cab.persona = cab.contacto_nombre || cab.persona || '';
                    cab.contacto_email = cab.contacto_email || '';
                    cab.nombre_certificados = cab.nombre_certificados || '';
                    cab.direccion = cab.direccion || '';
                    cab.cotizacion_referencia = cab.cotizacion_referencia || '';
                    cab.fecha_recepcion = cab.fecha_recepcion || '';
                    cab.servicio_solicitado = cab.servicio_solicitado || '';
                }
                // Asegurar que cada partida tenga todos los campos nuevos
                if (resultado.partidas) {
                    resultado.partidas.forEach(p => {
                        p.clave = p.clave || '';
                        p.no_certificado = p.no_certificado || '';
                        p.intervalo_calibracion = p.intervalo_calibracion || 'No especificado';
                    });
                }

                res.json({ success: true, ...resultado });
            } catch (err) { res.status(500).json({ error: 'El parser no generó un JSON válido.' }); }
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/leer-certificado', upload.single('archivoCert'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Sin archivo' });

        // NOTA: Para certificados, guardamos el archivo en la carpeta oficial de una vez si es posible
        // Pero para la IA, usamos el buffer temporal o el archivo ya movido
        const fileName = `certificado_${req.usuario?.id || 0}_${Date.now()}.pdf`;
        const finalPath = path.join(__dirname, 'uploads', 'certificados', fileName);
        fs.writeFileSync(finalPath, req.file.buffer);

        execFile('python3', [path.join(__dirname, 'pdf_parser.py'), '--certificado', finalPath], { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
            if (error) {
                if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
                return res.status(500).json({ error: 'Error al procesar certificado con IA.' });
            }

            try {
                const result = JSON.parse(stdout.trim());
                if (result.error) {
                    if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
                    return res.status(500).json({ error: result.error });
                }
                res.json({ success: true, datos: result.datos, url: `/uploads/certificados/${fileName}` });
            } catch (err) {
                if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
                res.status(500).json({ error: 'Error parseando respuesta de IA.' });
            }
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
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
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || (fs.existsSync('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe') 
                ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' 
                : undefined)
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
        
        let contactoResuelto;
        try { contactoResuelto = await msg.getContact(); } catch(e){}
        const numeroUser = (contactoResuelto && contactoResuelto.number) ? contactoResuelto.number : limpiarID(idWhatsApp); // Nmero real para la BD
        const textoRecibido = msg.body ? msg.body.trim() : '';
        
        let mediaUrl = null;
        let tipoMsg = 'texto';
        
        if (msg.hasMedia) {
            try {
                const media = await msg.downloadMedia();
                if (media) {
                    const ext = (media.mimetype.split('/')[1] || 'bin').split(';')[0];
                    const filename = `media_${Date.now()}.${ext}`;
                    const fullPath = path.join(__dirname, 'uploads', 'bot', filename);
                    fs.writeFileSync(fullPath, Buffer.from(media.data, 'base64'));
                    mediaUrl = `/uploads/bot/${filename}`;
                    // Stickers se guardan como imagen para visualizarse en el CRM
                    if (msg.type === 'sticker') {
                        tipoMsg = 'sticker';
                    } else {
                        tipoMsg = media.mimetype.startsWith('image/') ? 'imagen' : 'archivo';
                    }
                }
            } catch (e) { console.error('Error descargando media:', e.message); }
        }

        // Ignorar logs de sistema vacíos que crashean o ensucian DB
        const typesIgnore = ['vcard', 'location', 'contact_card_multi', 'image', 'document', 'video', 'audio', 'e2e_notification'];
        if (!textoRecibido && !msg.hasMedia && typesIgnore.includes(msg.type)) {
            return;
        }

        const esPropio = msg.fromMe;
        const direccion = esPropio ? 'saliente' : 'entrante';
        const idParaWhatsApp = esPropio ? msg.to : idWhatsApp;
        const numeroParaRegistro = esPropio ? limpiarID(msg.to) : numeroUser;

        // Registrar entrada/propio — NUNCA guardar base64 crudo como cuerpo
        const etiquetaMedia = tipoMsg === 'sticker' ? '[Sticker]' : '[Media]';
        const contenidoLimpio = textoRecibido || (msg.hasMedia ? etiquetaMedia : (msg.type !== 'chat' ? `[${msg.type}]` : ''));
        if (!contenidoLimpio) return;

        await registrarMensajeEnCRM(numeroParaRegistro, contenidoLimpio, tipoMsg, direccion, mediaUrl);

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
                botIA.respuestaIA,
                numeroUser // Pasar el número limpio al motor central
            );

            if (respuesta) {
                const textoAEnviar = typeof respuesta === 'object' ? respuesta.text : respuesta;
                if (textoAEnviar) {
                    console.log(`📤 Enviando respuesta (Flujo) a ${idWhatsApp}...`);
                    if (botClient.pupPage) {
                        if (typeof respuesta === 'object') {
                            if (respuesta.media_image) {
                                try {
                                    const { MessageMedia } = require('whatsapp-web.js');
                                    const mediaImg = await MessageMedia.fromUrl(respuesta.media_image, { unsafeMime: true });
                                    await botClient.sendMessage(idWhatsApp, mediaImg); // QR Primero sin texto
                                } catch (e) { console.error("Error enviando media_image QR:", e.message); }
                            }
                            if (respuesta.media_pdf) {
                                try {
                                    const { MessageMedia } = require('whatsapp-web.js');
                                    const mediaPdf = await MessageMedia.fromUrl(respuesta.media_pdf, { unsafeMime: true, filename: 'Certificado_SICAMET.pdf' });
                                    await botClient.sendMessage(idWhatsApp, mediaPdf); // PDF Segundo sin texto
                                } catch (e) { console.error("Error enviando media_pdf PDF:", e.message); }
                            }
                            if (respuesta.media) {
                                try {
                                    const { MessageMedia } = require('whatsapp-web.js');
                                    const mediaG = await MessageMedia.fromUrl(respuesta.media, { unsafeMime: true });
                                    await botClient.sendMessage(idWhatsApp, mediaG, { caption: textoAEnviar });
                                } catch (e) {
                                    await botClient.sendMessage(idWhatsApp, textoAEnviar);
                                }
                            } else {
                                await botClient.sendMessage(idWhatsApp, textoAEnviar);
                            }
                        } else {
                            await botClient.sendMessage(idWhatsApp, textoAEnviar);
                        }
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

// ─── ASIGNACIÓN DE CONVERSACIONES (Sistema de Ownership) ────────────────────────────
// Permite que una recepcionista "tome" una conversación para evitar colisiones

// GET: Ver quién atiende una conversación
app.get('/api/whatsapp/chats/:numero/asignacion', verificarToken(), async (req, res) => {
    try {
        const num = limpiarID(req.params.numero);
        const [rows] = await db.query(
            'SELECT ca.*, u.nombre as nombreUsuario FROM chat_assignments ca LEFT JOIN usuarios u ON u.id = ca.usuario_id WHERE ca.numero_wa = ?',
            [num]
        );
        res.json(rows[0] || null);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST: Tomar/asignar una conversación
app.post('/api/whatsapp/chats/:numero/asignar', verificarToken(), async (req, res) => {
    try {
        const num = limpiarID(req.params.numero);
        const { id: userId, nombre: nombreUsuario } = req.usuario;
        await db.query(
            'INSERT INTO chat_assignments (numero_wa, usuario_id, usuario_nombre) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE usuario_id = VALUES(usuario_id), usuario_nombre = VALUES(usuario_nombre), asignado_at = NOW()',
            [num, userId, nombreUsuario]
        );
        if (global.io) {
            global.io.emit('chat_asignado', { numero_wa: num, usuario_id: userId, usuario_nombre: nombreUsuario });
        }
        res.json({ success: true, numero_wa: num, usuario_nombre: nombreUsuario });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE: Liberar una conversación
app.delete('/api/whatsapp/chats/:numero/asignar', verificarToken(), async (req, res) => {
    try {
        const num = limpiarID(req.params.numero);
        await db.query('DELETE FROM chat_assignments WHERE numero_wa = ?', [num]);
        if (global.io) global.io.emit('chat_liberado', { numero_wa: num });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET: Lista de todas las asignaciones activas (para saber qué conversaciones están tomadas)
app.get('/api/whatsapp/asignaciones', verificarToken(), async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT ca.numero_wa, ca.usuario_id, ca.usuario_nombre, ca.asignado_at FROM chat_assignments ca'
        );
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── MODIFICACIÓN DE ÓRDENES (RECEPCIÓN / ADMIN) ───────────────────────────────────
app.post('/api/instrumentos/orden/:folio/modificar', verificarToken(['admin', 'recepcion', 'recepcionista']), async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const { folio } = req.params;
        const { instrumentos, eliminados_ids, motivo } = req.body;

        // 1. Eliminar instrumentos marcados
        if (Array.isArray(eliminados_ids) && eliminados_ids.length > 0) {
            await connection.query('DELETE FROM instrumento_metrologos WHERE instrumento_id IN (?)', [eliminados_ids]);
            await connection.query('DELETE FROM instrumentos_estatus WHERE id IN (?) AND orden_cotizacion = ?', [eliminados_ids, folio]);
        }

        // 2. Procesar instrumentos (Actualizaciones y Nuevos)
        if (Array.isArray(instrumentos)) {
            for (const ins of instrumentos) {
                const isUpdate = !!ins.id;
                
                if (isUpdate) {
                    // Actualizar registro principal
                    await connection.query(
                        `UPDATE instrumentos_estatus SET 
                            nombre_instrumento = ?, marca = ?, modelo = ?, no_serie = ?, 
                            identificacion = ?, ubicacion = ?, requerimientos_especiales = ?, 
                            puntos_calibrar = ?, numero_informe = ?, tipo_servicio = ?, 
                            area_laboratorio = ?, empresa = ?, persona = ?, sla = ?
                        WHERE id = ? AND orden_cotizacion = ?`,
                        [
                            ins.nombre_instrumento, ins.marca, ins.modelo, ins.no_serie, 
                            ins.identificacion, ins.ubicacion, ins.requerimientos_especiales, 
                            ins.puntos_calibrar, ins.numero_informe, ins.tipo_servicio, 
                            ins.area_laboratorio, ins.empresa, ins.persona, ins.sla,
                            ins.id, folio
                        ]
                    );

                    // Sincronizar metrólogos (Múltiples)
                    await connection.query('DELETE FROM instrumento_metrologos WHERE instrumento_id = ?', [ins.id]);
                } else {
                    // Insertar nuevo registro
                    const [resIns] = await connection.query(
                        `INSERT INTO instrumentos_estatus 
                            (orden_cotizacion, empresa, persona, tipo_servicio, nombre_instrumento, marca, modelo, no_serie, identificacion, ubicacion, requerimientos_especiales, puntos_calibrar, sla, estatus_actual, area_laboratorio) 
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            folio, ins.empresa, ins.persona, ins.tipo_servicio, ins.nombre_instrumento, 
                            ins.marca, ins.modelo, ins.no_serie, ins.identificacion, ins.ubicacion, 
                            ins.requerimientos_especiales, ins.puntos_calibrar, ins.sla || 10, 'Recepción', ins.area_laboratorio
                        ]
                    );
                    ins.id = resIns.insertId;
                }

                // Insertar nuevas asignaciones de metrólogos
                if (Array.isArray(ins.metrologos_asignados) && ins.metrologos_asignados.length > 0) {
                    const metValues = ins.metrologos_asignados.map(mid => [ins.id, mid, 'asignado']);
                    await connection.query('INSERT INTO instrumento_metrologos (instrumento_id, usuario_id, estatus) VALUES ?', [metValues]);
                    
                    // Asegurar consistencia con columna legacy metrologo_asignado_id (opcional, para reportes viejos)
                    await connection.query('UPDATE instrumentos_estatus SET metrologo_asignado_id = ? WHERE id = ?', [ins.metrologos_asignados[0], ins.id]);
                }
            }
        }

        // 3. Notificación Global de Auditoría
        await connection.query(
            `INSERT INTO notificaciones_globales (titulo, detalle, tipo, urgencia, creador_id) 
            VALUES (?, ?, ?, ?, ?)`,
            [
                `Modificación en Orden: ${folio}`,
                `Se actualizaron/modificaron los equipos de la orden ${folio}. Motivo: ${motivo || 'Actualización técnica de instrumentos'}.`,
                'MODIFICACION_ORDEN',
                'media',
                req.usuario.id
            ]
        );

        await connection.commit();
        res.json({ success: true, message: 'Orden sincronizada correctamente.' });
    } catch (err) {
        await connection.rollback();
        console.error("Error en bulk modify:", err);
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
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

// ─── CALIFICACIONES BOT ───────────────────────────────────────────────────────
app.get('/api/calificaciones-bot', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM calificaciones_bot ORDER BY created_at DESC LIMIT 100');
        res.json(await adjuntarTelefonoVisible(rows, 'cliente_whatsapp'));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/calificaciones-bot/:id/estatus', async (req, res) => {
    try {
        const { estatus } = req.body;
        await db.query('UPDATE calificaciones_bot SET estatus = ? WHERE id = ?', [estatus, req.params.id]);
        if (global.io) global.io.emit('actualizacion_calificacion', { id: req.params.id, estatus });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/calificaciones-bot/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM calificaciones_bot WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── VERIFICENTROS BOT ────────────────────────────────────────────────────────
app.get('/api/verificentros-bot', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM verificentros_bot ORDER BY created_at DESC LIMIT 100');
        res.json(await adjuntarTelefonoVisible(rows, 'cliente_whatsapp'));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/verificentros-bot/:id/estatus', async (req, res) => {
    try {
        const { estatus } = req.body;
        await db.query('UPDATE verificentros_bot SET estatus = ? WHERE id = ?', [estatus, req.params.id]);
        if (global.io) global.io.emit('actualizacion_verificentro', { id: req.params.id, estatus });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/verificentros-bot/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM verificentros_bot WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── VENTAS BOT ───────────────────────────────────────────────────────────────
app.get('/api/ventas-bot', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM ventas_bot ORDER BY created_at DESC LIMIT 100');
        res.json(await adjuntarTelefonoVisible(rows, 'cliente_whatsapp'));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/ventas-bot/:id/estatus', async (req, res) => {
    try {
        const { estatus } = req.body;
        await db.query('UPDATE ventas_bot SET estatus = ? WHERE id = ?', [estatus, req.params.id]);
        if (global.io) global.io.emit('actualizacion_venta', { id: req.params.id, estatus });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/ventas-bot/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM ventas_bot WHERE id = ?', [req.params.id]);
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

// Estadísticas operativas y del bot para Dashboard/Badges
app.get('/api/bot/stats', async (req, res) => {
    try {
        const [[cots]] = await db.query("SELECT COUNT(*) as total FROM cotizaciones_bot WHERE DATE(created_at) = CURDATE()");
        const [[pendientes]] = await db.query("SELECT COUNT(*) as total FROM cotizaciones_bot WHERE estatus = 'nueva'");
        const [[escalados]] = await db.query("SELECT COUNT(*) as total FROM escalados WHERE estatus = 'pendiente'");
        const [[califNuevas]] = await db.query("SELECT COUNT(*) as total FROM calificaciones_bot WHERE estatus = 'nueva'");
        const [[verifNuevas]] = await db.query("SELECT COUNT(*) as total FROM verificentros_bot WHERE estatus = 'nueva'");
        const [[ventasNuevas]] = await db.query("SELECT COUNT(*) as total FROM ventas_bot WHERE estatus = 'nueva'");

        const [[listos]] = await db.query("SELECT COUNT(*) as total FROM instrumentos_estatus WHERE estatus_actual = 'Listo'");
        const [[validacion]] = await db.query("SELECT COUNT(*) as total FROM instrumentos_estatus WHERE estatus_actual = 'Aseguramiento'");
        const [[sinCert]] = await db.query(`SELECT COUNT(*) as total FROM instrumentos_estatus WHERE estatus_actual IN ('Listo', 'Entregado') AND (no_certificado IS NULL OR no_certificado = '')`);
        const [[feedbackNuevos]] = await db.query("SELECT COUNT(*) as total FROM feedback_bot WHERE leido_admin = 0");
        const [metrologiaAreas] = await db.query("SELECT area_laboratorio, COUNT(*) as total FROM instrumentos_estatus WHERE estatus_actual = 'Laboratorio' AND area_laboratorio IS NOT NULL GROUP BY area_laboratorio");

        const metroMap = {};
        metrologiaAreas.forEach(a => { metroMap[a.area_laboratorio] = a.total; });

        const [[correccionesTotal]] = await db.query("SELECT COUNT(*) as total FROM instrumento_metrologos im JOIN instrumentos_estatus ie ON ie.id = im.instrumento_id WHERE im.estatus = 'correccion' AND ie.estatus_actual = 'Laboratorio'");

        res.json({
            cotizacionesHoy: cots.total || 0,
            pendientesCotizacion: pendientes.total || 0,
            escaladosPendientes: escalados.total || 0,
            calificacionesNuevas: califNuevas.total || 0,
            verificentrosNuevos: verifNuevas.total || 0,
            ventasNuevas: ventasNuevas.total || 0,
            listosEntrega: listos.total || 0,
            pendientesValidacion: validacion.total || 0,
            metrologiaAreaCounts: metroMap,
            sin_certificado: sinCert.total || 0,
            feedback_nuevos: feedbackNuevos.total || 0,
            correccionesTotal: correccionesTotal.total || 0
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
// ─── CLIENTES HISTORIAL DETALLADO ──────────────────────────────────────────────────────────
app.get('/api/clientes/:id/historial', verificarToken(), async (req, res) => {
    try {
        const idCliente = req.params.id;
        const [clienteList] = await db.query(`SELECT nombre, contacto, email FROM cat_clientes WHERE id = ?`, [idCliente]);
        if (clienteList.length === 0) return res.status(404).json({error: 'Cliente no encontrado'});
        const cliente = clienteList[0];

        // Buscar todos sus equipos por nombre exacto de empresa
        const [equipos] = await db.query(`
            SELECT id, orden_cotizacion, nombre_instrumento, marca, modelo, no_serie, 
                   estatus_actual, fecha_ingreso, fecha_entrega, sla
            FROM instrumentos_estatus 
            WHERE empresa = ?
            ORDER BY fecha_ingreso DESC
        `, [cliente.nombre]);

        res.json({
            cliente,
            equiposStats: {
                total: equipos.length,
                en_laboratorio: equipos.filter(e => e.estatus_actual !== 'Entregado' && e.estatus_actual !== 'Listo').length,
                listos_entregados: equipos.filter(e => e.estatus_actual === 'Entregado' || e.estatus_actual === 'Listo').length
            },
            historial: equipos
        });
    } catch(err) {
        res.status(500).json({error: err.message});
    }
});

// ─── BÚSQUEDA GLOBAL ──────────────────────────────────────────────────────────
app.get('/api/busqueda-global', verificarToken(), async (req, res) => {
    const q = (req.query.q || '').trim();
    if (q.length < 1) return res.json({ equipos: [], clientes: [], conversaciones: [] });
    const like = `%${q}%`;
    try {
        const [equipos] = await db.query(
            `SELECT id, nombre_instrumento, orden_cotizacion,
                    empresa, persona, estatus_actual, no_serie, sla
             FROM instrumentos_estatus
             WHERE nombre_instrumento LIKE ?
                OR orden_cotizacion   LIKE ?
                OR no_serie           LIKE ?
                OR empresa            LIKE ?
                OR persona            LIKE ?
             ORDER BY fecha_ingreso DESC LIMIT 6`,
            [like, like, like, like, like]
        );
        const [clientes] = await db.query(
            `SELECT id, nombre, contacto FROM cat_clientes
             WHERE nombre LIKE ? OR contacto LIKE ? LIMIT 4`,
            [like, like]
        );
        const [conversaciones] = await db.query(
            `SELECT numero_wa, nombre_contacto, telefono_display FROM whatsapp_chats
             WHERE nombre_contacto LIKE ? OR telefono_display LIKE ? LIMIT 4`,
            [like, like]
        );
        res.json({ equipos, clientes, conversaciones });
    } catch (e) {
        console.error('[busqueda-global]', e.message);
        res.status(500).json({ error: e.message });
    }
});

// Helper para notificaciones globales y específicas
async function crearNotificacionGlobal({ titulo, detalle, tipo, ruta, urgencia, creador_id, metadata, usuario_destino_id }) {
    try {
        const [r] = await db.query(
            'INSERT INTO notificaciones_globales (titulo, detalle, tipo, ruta, urgencia, creador_id, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [titulo, detalle, tipo, ruta, urgencia || 'media', creador_id || null, metadata ? JSON.stringify(metadata) : null]
        );
        const nid = r.insertId;

        // Si es para un usuario específico, lo marcamos como leído para los demás (opcional) 
        // o simplemente lo usamos en el GET filtrado.
        
        if (global.io) {
            global.io.emit('nueva_notificacion', { id: nid, titulo, tipo, urgencia });
        }
        return nid;
    } catch (e) {
        console.error('Error al crear notificación global:', e.message);
    }
}

// ─── NOTIFICACIONES INTERNAS ──────────────────────────────────────────────────
app.get('/api/notificaciones', verificarToken(), async (req, res) => {
    try {
        const userId = req.usuario.id;
        const rol = req.usuario?.rol || 'recepcionista';
        const esAdmin = rol === 'admin';
        const notifs = [];

        // 1. Notificaciones Globales sin leer por este usuario
        const [globales] = await db.query(`
            SELECT ng.* 
            FROM notificaciones_globales ng
            LEFT JOIN notificaciones_leidas nl ON nl.notificacion_id = ng.id AND nl.usuario_id = ?
            WHERE nl.id IS NULL
            ORDER BY ng.created_at DESC LIMIT 20
        `, [userId]);

        globales.forEach(ng => {
            // Filtrar si es para un usuario específico (guardado en metadata o similar)
            let meta = {};
            try { meta = JSON.parse(ng.metadata || '{}'); } catch(_) {}
            
            // Si tiene usuario_destino_id en la tabla (no lo agregué pero lo manejamos en el helper logicamente)
            // Por ahora simplificamos: si metadata tiene targetUserId y no es el actual, saltar.
            if (meta.usuario_destino_id && meta.usuario_destino_id != userId) return;

            notifs.push({
                tipo: ng.tipo || 'sistema',
                id: `global_${ng.id}`,
                global_id: ng.id, // Para marcar como visto
                titulo: ng.titulo,
                detalle: ng.detalle,
                ruta: ng.ruta,
                urgencia: ng.urgencia,
                ts: ng.created_at,
                requiere_visto: true
            });
        });

        // 2. Equipos con SLA crítico
        if (esAdmin || ['operador', 'metrolog', 'laboratorio', 'metrologo', 'aseguramiento'].some(r => rol.includes(r))) {
            const [vencidos] = await db.query(
                `SELECT id, nombre_instrumento, orden_cotizacion, empresa, sla, fecha_ingreso, estatus_actual,
                        (sla - DATEDIFF(NOW(), fecha_ingreso)) as sla_restante
                 FROM instrumentos_estatus
                 WHERE (sla - DATEDIFF(NOW(), fecha_ingreso)) <= 2
                   AND estatus_actual NOT IN ('Listo','Entregado')
                 ORDER BY sla_restante ASC LIMIT 10`
            );
            vencidos.forEach(e => {
                const vencido = e.sla_restante <= 0;
                notifs.push({
                    tipo: 'sla',
                    id: `sla_${e.id}`,
                    titulo: vencido ? `SLA VENCIDO: ${e.nombre_instrumento}` : `SLA crítico (${e.sla_restante}d): ${e.nombre_instrumento}`,
                    detalle: `OC ${e.orden_cotizacion || '—'} · ${e.empresa || '—'} · Etapa: ${e.estatus_actual}`,
                    ruta: '/equipos',
                    urgencia: vencido ? 'alta' : 'media',
                    ts: new Date().toISOString()
                });
            });
        }

        // 3. Flujos bot pendientes sin atender
        if (esAdmin || rol === 'recepcionista' || rol === 'ventas') {
            const [[cots]] = await db.query(`SELECT COUNT(*) as total FROM cotizaciones_bot WHERE estatus = 'nueva'`);
            if (cots.total > 0) {
                notifs.push({
                    tipo: 'cotizacion',
                    id: 'cots_pendientes',
                    titulo: `${cots.total} cotización${cots.total > 1 ? 'es' : ''} de calibración sin atender`,
                    detalle: 'Solicitudes de calibración por WhatsApp esperando respuesta',
                    ruta: '/flujos-whatsapp',
                    urgencia: 'media',
                    ts: new Date().toISOString()
                });
            }
            
            const [[calif]] = await db.query(`SELECT COUNT(*) as total FROM calificaciones_bot WHERE estatus = 'nueva'`);
            if (calif.total > 0) {
                notifs.push({
                    tipo: 'cotizacion',
                    id: 'calif_pendientes',
                    titulo: `${calif.total} cotización${calif.total > 1 ? 'es' : ''} de calificación sin atender`,
                    detalle: 'Solicitudes de calificación por WhatsApp esperando respuesta',
                    ruta: '/flujos-whatsapp',
                    urgencia: 'media',
                    ts: new Date().toISOString()
                });
            }
            
            const [[verif]] = await db.query(`SELECT COUNT(*) as total FROM verificentros_bot WHERE estatus = 'nueva'`);
            if (verif.total > 0) {
                notifs.push({
                    tipo: 'cotizacion',
                    id: 'verif_pendientes',
                    titulo: `${verif.total} cotización${verif.total > 1 ? 'es' : ''} de verificentros sin atender`,
                    detalle: 'Solicitudes de verificentros por WhatsApp esperando respuesta',
                    ruta: '/flujos-whatsapp',
                    urgencia: 'media',
                    ts: new Date().toISOString()
                });
            }

            const [[ventas]] = await db.query(`SELECT COUNT(*) as total FROM ventas_bot WHERE estatus = 'nueva'`);
            if (ventas.total > 0) {
                notifs.push({
                    tipo: 'cotizacion',
                    id: 'ventas_pendientes',
                    titulo: `${ventas.total} solicitud${ventas.total > 1 ? 'es' : ''} de ventas sin atender`,
                    detalle: 'Solicitudes de venta de instrumentos esperando respuesta',
                    ruta: '/flujos-whatsapp',
                    urgencia: 'media',
                    ts: new Date().toISOString()
                });
            }
            
            const [[asesores]] = await db.query(`SELECT COUNT(*) as total FROM escalados WHERE estatus = 'pendiente'`);
            if (asesores.total > 0) {
                notifs.push({
                    tipo: 'asesor',
                    id: 'asesores_pendientes',
                    titulo: `${asesores.total} cliente${asesores.total > 1 ? 's' : ''} esperando asesor`,
                    detalle: 'Escalamientos a humano desde WhatsApp sin atender',
                    ruta: '/conversaciones',
                    urgencia: 'alta',
                    ts: new Date().toISOString()
                });
            }
        }

        // 3. Equipos rechazados en Aseguramiento (últimas 48h)
        if (esAdmin || rol === 'recepcionista' || rol.includes('operador')) {
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
                        titulo: `Equipo rechazado en Aseguramiento`,
                        detalle: `${r.nombre_instrumento} · OC ${r.orden_cotizacion || '—'} · Regresó a Laboratorio`,
                        ruta: '/metrologia',
                        urgencia: 'media',
                        ts: r.created_at
                    });
                });
            } catch (_) { /* tabla puede no existir aún */ }
        }

        res.json(notifs);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── CRON: Recordatorios diarios (cada día a las 9:00 AM) ────────────────────
app.post('/api/notificaciones/:id/marcar_visto', verificarToken(), async (req, res) => {
    try {
        const userId = req.usuario.id;
        // Support both 'global_123' format and plain numeric IDs
        const rawId = req.params.id;
        const nid = rawId.startsWith('global_') ? rawId.replace('global_', '') : rawId;
        await db.query(
            'INSERT INTO notificaciones_leidas (notificacion_id, usuario_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE leido_at = NOW()',
            [nid, userId]
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/notificaciones/marcar-todas', verificarToken(), async (req, res) => {
    try {
        const userId = req.usuario.id;
        // Get all global notification IDs not yet read by this user
        const [pendientes] = await db.query(`
            SELECT ng.id FROM notificaciones_globales ng
            LEFT JOIN notificaciones_leidas nl ON nl.notificacion_id = ng.id AND nl.usuario_id = ?
            WHERE nl.id IS NULL
        `, [userId]);
        for (const p of pendientes) {
            await db.query(
                'INSERT INTO notificaciones_leidas (notificacion_id, usuario_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE leido_at = NOW()',
                [p.id, userId]
            );
        }
        res.json({ success: true, marcadas: pendientes.length });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── MODIFICACIÓN MASIVA DE ÓRDENES (TRAZABILIDAD) ───
app.post('/api/instrumentos/orden/:folio/modificar', verificarToken(['admin', 'recepcionista']), async (req, res) => {
    try {
        const { folio } = req.params;
        const { instrumentos, eliminados_ids } = req.body; 
        const userId = req.usuario.id;

        // 1. Manejar instrumentos eliminados
        if (Array.isArray(eliminados_ids) && eliminados_ids.length > 0) {
            await db.query('DELETE FROM instrumentos_estatus WHERE id IN (?) AND orden_cotizacion = ?', [eliminados_ids, folio]);
            await db.query('INSERT INTO instrumentos_historial (instrumento_id, usuario_id, estatus_anterior, estatus_nuevo, comentario) SELECT id, ?, "Eliminado", "N/A", "Equipo removido de la orden por Recepción" FROM instrumentos_estatus WHERE id IN (?)', [userId, eliminados_ids]).catch(() => {});
        }

        // 2. Manejar instrumentos nuevos o editados
        for (const ins of instrumentos) {
            if (ins.id) {
                // UPDATE existente
                await db.query(
                    `UPDATE instrumentos_estatus SET 
                        nombre_instrumento = ?, marca = ?, modelo = ?, no_serie = ?, identificacion = ?, 
                        tipo_servicio = ?, puntos_calibrar = ?, area_laboratorio = ?, numero_informe = ?
                    WHERE id = ? AND orden_cotizacion = ?`,
                    [ins.nombre_instrumento, ins.marca, ins.modelo, ins.no_serie, ins.identificacion, 
                     ins.tipo_servicio, ins.puntos_calibrar, ins.area_laboratorio, ins.numero_informe, ins.id, folio]
                );
            } else {
                // INSERT nuevo
                await db.query(
                    `INSERT INTO instrumentos_estatus 
                        (orden_cotizacion, empresa, persona, tipo_servicio, nombre_instrumento, marca, modelo, no_serie, identificacion, sla, estatus_actual, area_laboratorio)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, "Laboratorio", ?)`,
                    [folio, ins.empresa, ins.persona, ins.tipo_servicio, ins.nombre_instrumento, ins.marca, ins.modelo, ins.no_serie, ins.identificacion, ins.sla || 5, ins.area_laboratorio]
                );
            }
        }

        // 3. Notificación Global de Modificación
        await crearNotificacionGlobal({
            titulo: `Orden modificada: ${folio}`,
            detalle: `La recepción ha realizado cambios en esta orden. Por favor verificar equipos asignados.`,
            tipo: 'modificacion_orden',
            ruta: '/equipos',
            urgencia: 'alta',
            creador_id: userId,
            metadata: { folio }
        });

        if (global.io) global.io.emit('actualizacion_operativa', { tipo: 'orden_modificada', folio });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

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
            usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol, area: usuario.area || null, permisos: usuario.permisos }
        });
    } catch (err) {
        console.error('Error en login:', err.message);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.get('/api/auth/me', verificarToken(), async (req, res) => {
    try {
        const [rows] = await db.query('SELECT id, nombre, email, rol, area, permisos FROM usuarios WHERE id = ?', [req.usuario.id]);
        if (rows.length === 0) return res.status(401).json({ error: 'Usuario no encontrado' });
        res.json({ usuario: rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Error del servidor al obtener usuario' });
    }
});

// Gestión de usuarios (solo admin)
app.get('/api/usuarios', verificarToken(['admin']), async (req, res) => {
    try {
        const [rows] = await db.query('SELECT id, nombre, email, rol, area, es_lider_area, activo, permisos, created_at FROM usuarios ORDER BY created_at DESC');
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/usuarios', verificarToken(['admin']), async (req, res) => {
    try {
        const { nombre, email, password, rol, area, permisos, es_lider_area } = req.body;
        if (!nombre || !email || !password) return res.status(400).json({ error: 'Faltan datos' });
        const bcrypt = require('bcryptjs');
        const hash = await bcrypt.hash(password, 12);
        const [r] = await db.query(
            'INSERT INTO usuarios (nombre, email, password_hash, rol, area, es_lider_area, permisos) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [nombre, email.toLowerCase(), hash, rol || 'recepcionista', area || null, es_lider_area ? 1 : 0, permisos ? JSON.stringify(permisos) : null]
        );
        res.json({ success: true, id: r.insertId });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/usuarios/:id', verificarToken(['admin']), async (req, res) => {
    try {
        const { nombre, email, password, rol, area, permisos, es_lider_area } = req.body;
        const id = req.params.id;

        let query = 'UPDATE usuarios SET nombre = ?, email = ?, rol = ?, area = ?, es_lider_area = ?, permisos = ?';
        let params = [nombre, email.toLowerCase(), rol, area || null, es_lider_area ? 1 : 0, permisos ? JSON.stringify(permisos) : null];

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

