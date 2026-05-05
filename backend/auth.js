/**
 * Módulo de Autenticación JWT — SICAMET CRM
 */
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
    console.error('FATAL: JWT_SECRET no está definido o es demasiado corto (>=32 chars). Defínelo en .env');
    process.exit(1);
}
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

/**
 * Sprint 14-A — Política de contraseñas SICAMET.
 * Mínimo: 12 chars, 1 mayúscula, 1 minúscula, 1 número, 1 símbolo.
 * No permite secuencias comunes (123, abc, qwerty) ni el email del usuario.
 * Devuelve { valida: bool, errores: [string], score: 0-5 }.
 */
function evaluarPassword(password, contexto = {}) {
    const errores = [];
    if (!password || password.length < 12) errores.push('Mínimo 12 caracteres.');
    if (!/[A-Z]/.test(password)) errores.push('Debe incluir al menos una mayúscula.');
    if (!/[a-z]/.test(password)) errores.push('Debe incluir al menos una minúscula.');
    if (!/[0-9]/.test(password)) errores.push('Debe incluir al menos un número.');
    if (!/[^A-Za-z0-9]/.test(password)) errores.push('Debe incluir al menos un símbolo (!@#$%^&* etc.).');

    // Patrones débiles
    const lower = (password || '').toLowerCase();
    const debiles = ['password', '12345', 'qwerty', 'sicamet', 'admin', 'abc123', '111111', '000000'];
    if (debiles.some(d => lower.includes(d))) errores.push('No uses palabras comunes (password, 12345, qwerty, sicamet, etc.).');

    // No debe contener el email del usuario
    if (contexto.email) {
        const userPart = contexto.email.split('@')[0].toLowerCase();
        if (userPart.length >= 4 && lower.includes(userPart)) errores.push('No puede contener tu nombre de usuario / email.');
    }

    // Score visual (informativo, no bloqueante)
    let score = 0;
    if (password && password.length >= 12) score++;
    if (password && password.length >= 16) score++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    return { valida: errores.length === 0, errores, score };
}

/**
 * Sprint 14-A — Generador de contraseñas robustas.
 * Garantiza al menos 1 char de cada clase (upper/lower/digit/symbol)
 * y luego rellena hasta `len` con chars aleatorios del pool completo.
 * Usa crypto.randomBytes (CSPRNG), no Math.random.
 */
function generarPasswordRobusto(len = 16) {
    if (len < 12) len = 12;
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // sin I, O para evitar confusión visual
    const lower = 'abcdefghijkmnpqrstuvwxyz';   // sin l, o
    const digit = '23456789';                   // sin 0, 1
    const sym   = '!@#$%&*+-?';
    const all   = upper + lower + digit + sym;

    const pickFrom = (set) => set[crypto.randomBytes(1)[0] % set.length];

    // Garantizar al menos 1 de cada clase
    const chars = [pickFrom(upper), pickFrom(lower), pickFrom(digit), pickFrom(sym)];

    // Rellenar el resto con caracteres aleatorios del pool completo
    while (chars.length < len) chars.push(pickFrom(all));

    // Shuffle Fisher-Yates con randomBytes
    for (let i = chars.length - 1; i > 0; i--) {
        const j = crypto.randomBytes(1)[0] % (i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
}

module.exports = {
    generarToken, verificarToken, hashPassword, verificarPassword,
    evaluarPassword, generarPasswordRobusto, JWT_SECRET
};
