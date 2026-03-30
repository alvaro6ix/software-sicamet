const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

async function setup() {
  const conn = await mysql.createConnection({
    host: 'localhost', user: 'root', password: 'sicamet',
    database: 'sicamet_crm', multipleStatements: false
  });

  const tablas = [
    {
      name: 'usuarios',
      sql: `CREATE TABLE IF NOT EXISTS usuarios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        email VARCHAR(150) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        rol ENUM('admin','recepcionista') DEFAULT 'recepcionista',
        activo TINYINT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    },
    {
      name: 'bot_mensajes',
      sql: `CREATE TABLE IF NOT EXISTS bot_mensajes (
        clave VARCHAR(60) PRIMARY KEY,
        texto TEXT NOT NULL,
        descripcion VARCHAR(200),
        activo TINYINT DEFAULT 1,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    },
    {
      name: 'bot_faq',
      sql: `CREATE TABLE IF NOT EXISTS bot_faq (
        id INT AUTO_INCREMENT PRIMARY KEY,
        pregunta VARCHAR(500) NOT NULL,
        respuesta TEXT NOT NULL,
        activo TINYINT DEFAULT 1,
        hits INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    },
    {
      name: 'bot_conversaciones',
      sql: `CREATE TABLE IF NOT EXISTS bot_conversaciones (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cliente_whatsapp VARCHAR(100) NOT NULL,
        rol ENUM('user','bot') NOT NULL,
        mensaje TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_wa (cliente_whatsapp),
        INDEX idx_fecha (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    },
    {
      name: 'bot_config',
      sql: `CREATE TABLE IF NOT EXISTS bot_config (
        clave VARCHAR(50) PRIMARY KEY,
        valor VARCHAR(500) NOT NULL,
        descripcion VARCHAR(200)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    }
  ];

  for (const t of tablas) {
    try { await conn.query(t.sql); console.log('✅', t.name); }
    catch (e) { console.error('❌', t.name, e.message); }
  }

  // ALTER sesiones — añadir columnas si no existen
  try {
    await conn.query(`ALTER TABLE sesiones ADD COLUMN IF NOT EXISTS nombre_cliente VARCHAR(150)`);
    await conn.query(`ALTER TABLE sesiones ADD COLUMN IF NOT EXISTS nombre_empresa VARCHAR(200)`);
    console.log('✅ sesiones (columnas onboarding)');
  } catch (e) { console.log('ℹ️  sesiones ALTER:', e.message); }

  // Seed: usuario admin
  try {
    const hash = await bcrypt.hash('SICAMET2026', 12);
    await conn.query(
      `INSERT IGNORE INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, 'admin')`,
      ['Administrador', 'admin@sicamet.mx', hash]
    );
    console.log('✅ usuario admin creado');
  } catch (e) { console.error('❌ seed admin:', e.message); }

  // Seed: mensajes del bot
  const mensajes = [
    ['menu_principal', '¡Hola! 👋 Soy el asistente virtual de *SICAMET*.\n\n¿En qué te podemos ayudar hoy?\n\n*1️⃣* 📋 Solicitar cotización\n*2️⃣* 🔍 Consultar estatus de equipo\n*3️⃣* 📅 Mis equipos y recordatorios\n*4️⃣* 🏆 Servicios y acreditaciones\n*5️⃣* 📞 Contacto\n*6️⃣* 🧑‍💼 Hablar con un asesor\n\n_Escribe el número de tu opción_', 'Menú principal del bot'],
    ['bienvenida_nuevo', '¡Hola! 👋 Bienvenido a *SICAMET*, laboratorio de calibración con 21 años de experiencia.\n\nAntes de continuar, ¿me podrías decir tu *nombre y empresa*?\n\n_Ejemplo: Juan García, Alimentos del Norte_', 'Primera vez que escribe el cliente'],
    ['bienvenida_conocido', '¡Hola de nuevo, *{nombre}*! 👋 ¿En qué te podemos ayudar hoy?', 'Cliente ya registrado'],
    ['fuera_horario', '🌙 Gracias por contactar a *SICAMET*.\n\nNuestro horario de atención es *Lunes a Viernes 8:00–18:00 hrs*.\n\nTu mensaje quedó registrado y te responderemos al inicio del siguiente día hábil.\n\n📞 Urgencias: *722 270 1584*\n📧 sclientes@sicamet.net', 'Mensaje fuera de horario laboral'],
    ['escalado_humano', '🧑‍💼 *Transfiriendo con un asesor de SICAMET...*\n\nUn especialista revisará tu consulta y te contactará en breve.\n\n📞 *722 270 1584 | 722 212 0722*\n📧 *sclientes@sicamet.net*\n⏰ Lun–Vie 8:00–18:00\n\n_Escribe *0* para volver al menú_', 'Respuesta al escalar a humano'],
    ['cotizacion_recibida', '✅ *¡Solicitud de cotización recibida!*\n\n📋 Resumen:\n• Equipo: *{equipo}*\n• Cantidad: *{cantidad}*\n• Servicio: *{servicio}*\n• Empresa: *{empresa}*\n\n🤝 Un asesor de SICAMET te contactará pronto con tu cotización.\n\n📞 *722 270 1584* | 📧 *sclientes@sicamet.net*\n\n_Escribe *0* para volver al menú_', 'Confirmación de cotización completada'],
    ['estatus_no_encontrado', '❌ No encontramos la orden *{orden}* en nuestro sistema.\n\nVerifica el número o escribe *6* para que un asesor te ayude.\n\n📞 722 270 1584', 'Cuando no se encuentra la orden'],
  ];

  for (const [clave, texto, descripcion] of mensajes) {
    try {
      await conn.query(
        'INSERT IGNORE INTO bot_mensajes (clave, texto, descripcion) VALUES (?, ?, ?)',
        [clave, texto, descripcion]
      );
    } catch (e) { console.error('❌ msg', clave, e.message); }
  }
  console.log('✅ bot_mensajes seed');

  // Seed: bot_config
  const configs = [
    ['horario_inicio', '08:00', 'Hora de inicio de atención (HH:MM)'],
    ['horario_fin', '18:00', 'Hora de fin de atención (HH:MM)'],
    ['dias_atencion', '1,2,3,4,5', 'Días laborales: 1=Lun, 2=Mar, 3=Mié, 4=Jue, 5=Vie'],
    ['modo_fuera_horario', 'auto', 'auto=responde con msg | silent=no responde'],
    ['notif_cotizacion_wa', '', 'Número WhatsApp para notificar cotizaciones (ej: 52722...@c.us)'],
  ];
  for (const [k, v, d] of configs) {
    try { await conn.query('INSERT IGNORE INTO bot_config (clave, valor, descripcion) VALUES (?, ?, ?)', [k, v, d]); } catch {}
  }
  console.log('✅ bot_config seed');

  // Seed: FAQs
  const faqs = [
    ['¿Cuánto tiempo tarda una calibración?', '⏱️ El tiempo varía según el tipo de equipo. Calibraciones estándar (temperatura, presión) tardan 1-3 días hábiles In-Lab. Para In-situ coordinamos la fecha contigo. Solicita tu cotización para tiempos exactos escribiendo *1*.'],
    ['¿Cuánto cuesta calibrar?', '💰 Los precios varían según tipo de equipo, magnitud y modalidad (In-Lab o In-situ). Te preparamos una cotización personalizada sin costo. Escribe *1* para solicitarla.'],
    ['¿Tienen acreditación ISO?', '✅ Sí. SICAMET está acreditado bajo *ISO/IEC 17025:2017* por la EMA y PJLA con reconocimiento internacional. Contamos con *12 acreditaciones vigentes*.'],
    ['¿Calibran en mis instalaciones?', '✅ Sí, ofrecemos servicio *In-situ* — nuestros técnicos van a tus instalaciones. Ideal para equipos que no pueden tener tiempo de inactividad. Escribe *1* para cotizar.'],
    ['¿Son partner de Vaisala?', '✅ SICAMET es el *único partner de calibración y mantenimiento Vaisala en México*, certificado oficialmente. Gestionamos garantías, sensores y calibraciones.'],
    ['¿Qué magnitudes calibran?', '📏 Calibramos: Presión · Temperatura · Fuerza · Masa · Eléctrica · Dimensional · Flujo · Humedad · Óptica · Volumen · Analizadores específicos (dinamómetros vehiculares).'],
    ['¿Dónde están ubicados?', '📍 Contamos con sedes en:\n• *Toluca* (oficina principal)\n• Ciudad de México\n• Querétaro\n• Guadalajara\n\n⏰ Lun–Vie 8:00–18:00 | 📞 722 270 1584'],
  ];
  for (const [p, r] of faqs) {
    try { await conn.query('INSERT IGNORE INTO bot_faq (pregunta, respuesta) VALUES (?, ?)', [p, r]); } catch {}
  }
  console.log('✅ bot_faq seed');

  const [[{ total }]] = await conn.query("SELECT COUNT(*) as total FROM usuarios WHERE rol='admin'");
  const [[msgs]] = await conn.query("SELECT COUNT(*) as total FROM bot_mensajes");
  const [[faqs2]] = await conn.query("SELECT COUNT(*) as total FROM bot_faq");
  console.log(`\n📊 BD lista: ${total} admin(s) · ${msgs.total} mensajes bot · ${faqs2.total} FAQs`);

  await conn.end();
}

setup().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
