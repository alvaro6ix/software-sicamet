const mysql = require('mysql2/promise');

// Crear el "pool" de conexiones
const pool = mysql.createPool({
    host: 'localhost',      // El servidor local de tu computadora
    user: 'root',           // El usuario administrador por defecto
    password: 'sicamet', // Reemplaza esto con tu contraseña real
    database: 'sicamet_crm',// La base de datos que creaste en Workbench
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
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