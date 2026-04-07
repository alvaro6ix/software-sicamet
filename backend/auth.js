/**
 * Módulo de Autenticación JWT — SICAMET CRM
 */
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || '***REDACTED-OLD-JWT***';
const JWT_EXPIRES = '8h'; // Duración de un turno laboral

/**
 * Genera un token JWT para el usuario autenticado.
 */
function generarToken(usuario) {
    return jwt.sign(
        { id: usuario.id, email: usuario.email, rol: usuario.rol, nombre: usuario.nombre, area: usuario.area || null },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES }
    );
}

/**
 * Middleware que verifica el token JWT.
 * Uso: router.get('/ruta', verificarToken(), handler)
 * Uso con rol: router.put('/ruta', verificarToken(['admin']), handler)
 */
function verificarToken(rolesPermitidos = []) {
    return (req, res, next) => {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            return res.status(401).json({ error: 'Acceso denegado. Token requerido.' });
        }

        try {
            const usuario = jwt.verify(token, JWT_SECRET);
            req.usuario = usuario;

            if (rolesPermitidos.length > 0 && !rolesPermitidos.includes(usuario.rol)) {
                return res.status(403).json({ error: 'No tienes permisos para esta acción.' });
            }

            next();
        } catch (err) {
            return res.status(401).json({ error: 'Token inválido o expirado. Por favor inicia sesión.' });
        }
    };
}

/**
 * Genera un hash seguro de la contraseña.
 */
async function hashPassword(password) {
    return bcrypt.hash(password, 12);
}

/**
 * Verifica si la contraseña coincide con el hash.
 */
async function verificarPassword(password, hash) {
    return bcrypt.compare(password, hash);
}

module.exports = { generarToken, verificarToken, hashPassword, verificarPassword, JWT_SECRET };
