const mysql = require('mysql2/promise');

// Crear el "pool" de conexiones
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',      // En Docker será 'db'
    user: process.env.DB_USER || 'root',           
    password: process.env.DB_PASS || '***REDACTED***', 
    database: process.env.DB_NAME || 'sicamet_crm',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4'
});

// Función rápida para probar que la conexión funciona
async function probarConexion() {
    try {
        const connection = await pool.getConnection();
        console.log('✅ ¡Conexión exitosa a la base de datos MySQL (sicamet_crm)!');
        
        const [inst] = await connection.query('SELECT COUNT(*) as total FROM instrumentos_estatus');
        const [chts] = await connection.query('SELECT COUNT(*) as total FROM whatsapp_chats');
        console.log(`📊 Inventario de Datos: ${inst[0].total} instrumentos y ${chts[0].total} chats localizados.`);
        
        connection.release();
    } catch (error) {
        console.error('❌ Error al conectar a la base de datos:', error.message);
    }
}

probarConexion();

// Exportamos el pool para usarlo en otros archivos (como tu index.js)
module.exports = pool;