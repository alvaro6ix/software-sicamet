const db = require('./bd');

async function setup() {
    try {
        console.log('--- Iniciando configuración de Bot Dinámico ---');

        // 1. Tabla de Nodos
        await db.query(`
            CREATE TABLE IF NOT EXISTS bot_nodos (
                id INT PRIMARY KEY AUTO_INCREMENT,
                nombre VARCHAR(100) NOT NULL,
                mensaje TEXT NOT NULL,
                tipo VARCHAR(20) DEFAULT 'mensaje', 
                accion VARCHAR(50) DEFAULT NULL,    
                media_url TEXT DEFAULT NULL,
                media_tipo VARCHAR(20) DEFAULT NULL, 
                orden INT DEFAULT 0
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
        console.log('✅ Tabla bot_nodos lista');

        // 2. Tabla de Opciones
        await db.query(`
            CREATE TABLE IF NOT EXISTS bot_opciones (
                id INT PRIMARY KEY AUTO_INCREMENT,
                nodo_id INT,
                texto_opcion VARCHAR(100) NOT NULL,
                nodo_destino_id INT,
                FOREIGN KEY (nodo_id) REFERENCES bot_nodos(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
        console.log('✅ Tabla bot_opciones lista');

        // 3. Insertar Nodos Iniciales (ID manual para consistencia)
        const nodos = [
            [0, 'Menú Principal', '¡Hola! 👋 Soy el asistente virtual de *SICAMET*.\n\n¿En qué te podemos ayudar hoy?', 'opciones', null, 0],
            [1, 'Flujo Cotización', '📋 *Cotización de Calibración*\n\n¿Qué tipo de equipo quieres calibrar?', 'opciones', 'cotizacion', 1],
            [2, 'Consulta Estatus', '🔍 Escribe el *número de orden o cotización*:\n\n_Ejemplo: OC-2025-001_', 'input', 'consultar_estatus', 2],
            [3, 'Registro Equipos', '📅 *Registro de Instrumentos*\n\nTe avisaré antes de que venza tu certificado. 🔔\n\n¿Cuál es el nombre de tu empresa?', 'input', 'registrar_equipo', 3],
            [4, 'Servicios', '🏆 *Servicios SICAMET*\n\n✅ Calibración In-Lab / In-situ\n✅ Alta Tecnología y Acreditaciones', 'mensaje', null, 4],
            [5, 'Contacto', '📞 *Contacto SICAMET*\n\n📱 722 270 1584\n📧 sclientes@sicamet.net', 'mensaje', null, 5],
            [6, 'Hablar con Asesor', '🧑‍💼 *Transfiriendo con un asesor...*', 'mensaje', 'escalar', 6]
        ];

        for (const n of nodos) {
            await db.query(
                'INSERT INTO bot_nodos (id, nombre, mensaje, tipo, accion, orden) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE nombre=VALUES(nombre), mensaje=VALUES(mensaje), tipo=VALUES(tipo), accion=VALUES(accion), orden=VALUES(orden)',
                n
            );
        }
        console.log('✅ Nodos base insertados/actualizados');

        // 4. Insertar Opciones Base
        const opciones = [
            [0, '📋 Solicitar cotización', 1],
            [0, '🔍 Consultar estatus', 2],
            [0, '📅 Mis equipos y recordatorios', 3],
            [0, '🏆 Servicios y acreditaciones', 4],
            [0, '📞 Contacto y ubicaciones', 5],
            [0, '🧑‍💼 Hablar con un asesor', 6]
        ];

        // Limpiar opciones previas para evitar duplicados en el menú base (opcional, pero ayuda a que se vea como el plan)
        await db.query('DELETE FROM bot_opciones WHERE nodo_id = 0');

        for (const o of opciones) {
            await db.query(
                'INSERT INTO bot_opciones (nodo_id, texto_opcion, nodo_destino_id) VALUES (?, ?, ?)',
                o
            );
        }
        console.log('✅ Opciones de menú vinculadas');

        console.log('--- Configuración finalizada con éxito ---');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error en el setup:', error.message);
        process.exit(1);
    }
}

setup();
