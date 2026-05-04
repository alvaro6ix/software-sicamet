const mysql = require('mysql2/promise');

// Las credenciales se leen exclusivamente del entorno (no hay fallback hardcoded).
// docker-compose se encarga de pasar DB_PASS desde el .env de la raíz.
if (!process.env.DB_PASS) {
    console.error('FATAL: DB_PASS no está definido. Verifica que el archivo .env exista en la raíz del proyecto.');
    process.exit(1);
}

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',      // En Docker será 'db'
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS,
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