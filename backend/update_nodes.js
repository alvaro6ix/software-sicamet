const db = require('./bd.js');

async function run() {
    try {
        await db.query(`UPDATE bot_nodos SET mensaje = '🧑‍💼 Por favor, escribe en un solo mensaje el motivo por el cual deseas contactar a un asesor:' WHERE id = 6`);
        console.log('Node 6 updated successfully in DB');
    } catch (e) {
        console.error('Error:', e);
    } finally {
        process.exit(0);
    }
}

run();
