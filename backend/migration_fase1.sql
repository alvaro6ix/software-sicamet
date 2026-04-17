-- ============================================
-- MIGRACIÓN FASE 1: SLA Correcto + Trazabilidad
-- ============================================

-- 1. Agregar columna para fecha de recepción parseada como DATE (para cálculo real de SLA)
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='sicamet_crm' AND table_name='instrumentos_estatus' AND column_name='fecha_recepcion_parsed');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE instrumentos_estatus ADD COLUMN fecha_recepcion_parsed DATE NULL AFTER fecha_recepcion', 'SELECT "Columna fecha_recepcion_parsed ya existe"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. Agregar contador de rechazos de aseguramiento
SET @col_exists2 = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='sicamet_crm' AND table_name='instrumentos_estatus' AND column_name='rechazos_aseguramiento');
SET @sql2 = IF(@col_exists2 = 0, 'ALTER TABLE instrumentos_estatus ADD COLUMN rechazos_aseguramiento INT DEFAULT 0 AFTER no_certificado', 'SELECT "Columna rechazos_aseguramiento ya existe"');
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- 3. Tabla de rechazos con historial completo para auditoría
CREATE TABLE IF NOT EXISTS rechazos_aseguramiento (
    id INT AUTO_INCREMENT PRIMARY KEY,
    instrumento_id INT NOT NULL,
    usuario_rechaza_id INT NOT NULL,
    usuario_destino_id INT NULL,
    motivo TEXT NOT NULL,
    fecha_rechazo DATETIME DEFAULT CURRENT_TIMESTAMP,
    estatus_previo VARCHAR(50),
    INDEX (instrumento_id),
    INDEX (usuario_rechaza_id),
    FOREIGN KEY (instrumento_id) REFERENCES instrumentos_estatus(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Tabla de feedback del bot
CREATE TABLE IF NOT EXISTS feedback_bot (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cliente_wa VARCHAR(50) NOT NULL,
    empresa VARCHAR(255) NULL,
    mensaje TEXT NOT NULL,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
    leido_admin TINYINT DEFAULT 0,
    INDEX (cliente_wa),
    INDEX (leido_admin)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. Tabla de logs de auditoría para trazabilidad completa
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. Nota: La migracion de fechas se hara desde el backend al insertar nuevas ordenes.
--    Las ordenes existentes usaran fecha_ingreso como fallback hasta que se re-procesen.

SELECT 'Migración FASE 1 completada' AS resultado;
