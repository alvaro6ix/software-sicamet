-- Crear tabla de Nodos para el Flujo del Bot
CREATE TABLE IF NOT EXISTS bot_nodos (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    mensaje TEXT NOT NULL,
    tipo VARCHAR(20) DEFAULT 'mensaje', -- 'mensaje', 'opciones', 'input'
    accion VARCHAR(50) DEFAULT NULL,    -- 'consultar_estatus', 'cotizacion', 'registrar_equipo', 'escalar'
    media_url TEXT DEFAULT NULL,
    media_tipo VARCHAR(20) DEFAULT NULL, -- 'image', 'video', 'document'
    orden INT DEFAULT 0
);

-- Crear tabla de Opciones (Botones/Ramificaciones)
CREATE TABLE IF NOT EXISTS bot_opciones (
    id SERIAL PRIMARY KEY,
    nodo_id INT REFERENCES bot_nodos(id) ON DELETE CASCADE,
    texto_opcion VARCHAR(100) NOT NULL,
    nodo_destino_id INT REFERENCES bot_nodos(id) ON DELETE SET NULL
);

-- Insertar Nodo 0: Menú Principal
INSERT INTO bot_nodos (id, nombre, mensaje, tipo, orden) VALUES (
    0, 
    'Menú Principal', 
    '¡Hola! 👋 Soy el asistente virtual de *SICAMET*.\n\n¿En qué te podemos ayudar hoy?', 
    'opciones', 
    0
) ON CONFLICT (id) DO NOTHING;

-- Insertar Opciones del Menú Principal
-- Asumiendo IDs por defecto para los primeros flujos fijos
INSERT INTO bot_nodos (id, nombre, mensaje, tipo, accion, orden) VALUES 
(1, 'Flujo Cotización', '📋 *Cotización de Calibración*\n\n¿Qué tipo de equipo quieres calibrar?', 'opciones', 'cotizacion', 1),
(2, 'Consulta Estatus', '🔍 Escribe el *número de orden o cotización*:\n\n_Ejemplo: OC-2025-001_', 'input', 'consultar_estatus', 2),
(3, 'Registro Equipos', '📅 *Registro de Instrumentos*\n\nTe avisaré antes de que venza tu certificado. 🔔\n\n¿Cuál es el nombre de tu empresa?', 'input', 'registrar_equipo', 3),
(4, 'Servicios', '🏆 *Servicios SICAMET*\n\n✅ Calibración In-Lab / In-situ\n✅ Alta Tecnología y Acreditaciones', 'mensaje', NULL, 4),
(5, 'Contacto', '📞 *Contacto SICAMET*\n\n📱 722 270 1584\n📧 sclientes@sicamet.net', 'mensaje', NULL, 5),
(6, 'Hablar con Asesor', '🧑‍💼 *Transfiriendo con un asesor...*', 'mensaje', 'escalar', 6)
ON CONFLICT (id) DO NOTHING;

-- Vincular Nodo 0 con las opciones
INSERT INTO bot_opciones (nodo_id, texto_opcion, nodo_destino_id) VALUES 
(0, '📋 Solicitar cotización', 1),
(0, '🔍 Consultar estatus', 2),
(0, '📅 Mis equipos y recordatorios', 3),
(0, '🏆 Servicios y acreditaciones', 4),
(0, '📞 Contacto y ubicaciones', 5),
(0, '🧑‍💼 Hablar con un asesor', 6)
ON CONFLICT DO NOTHING;
