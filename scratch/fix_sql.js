const fs = require('fs');
const path = require('path');

// Ajustamos la ruta para que busque en la raíz del proyecto
const filePath = path.join(__dirname, '..', 'database', 'init_fijo.sql');

// Detectar si el archivo es UTF-16LE
const buffer = fs.readFileSync(filePath);
let content;

// Comprobar BOM o presencia de bytes nulos (característico de UTF-16)
const hasBOM = buffer[0] === 0xff && buffer[1] === 0xfe;
const hasNullBytes = buffer.slice(0, 100).includes(0x00);

if (hasBOM || hasNullBytes) {
    console.log('📦 Detectado formato UTF-16 (o con nulos). Convirtiendo a UTF-8...');
    // Si tiene el BOM erróneo (EF BF BD), lo saltamos
    let startOffset = 0;
    if (buffer[0] === 0xef && buffer[1] === 0xbf && buffer[2] === 0xbd) {
        // En este caso el archivo tiene "" (REPLACEMENT CHARACTER) al inicio
        // Probablemente por una conversión fallida previa.
        // Intentamos encontrar dónde empieza el contenido real.
        console.log('⚠️ Detectados bytes de reemplazo al inicio. Intentando recuperar...');
    }
    
    // Forzamos la lectura como UTF-16LE y eliminamos los caracteres nulos si quedan
    content = buffer.toString('utf16le').replace(/\0/g, '');
} else {
    content = buffer.toString('utf8');
}


// Reemplazos específicos para corregir la corrupción
const replacements = [
    { from: /Recepcin/g, to: 'Recepcion' },
    { from: /Cotizacin/g, to: 'Cotizacion' },
    { from: /Buzn/g, to: 'Buzon' },
    { from: /Certificacin/g, to: 'Certificacion' },
    { from: /MUOZ/g, to: 'MUÑOZ' },
    { from: /Hola!/g, to: 'Hola!' },
    { from: /En qu\+/g, to: 'En que' },
    { from: /das/g, to: 'dias' },
    { from: /Calibracin/g, to: 'Calibracion' },
    { from: /Calificacin/g, to: 'Calificacion' },
    { from: /Consultora/g, to: 'Consultoria' },
    { from: /Gestin/g, to: 'Gestion' },
    { from: /Ms/g, to: 'Mas' },
    { from: /direccin/g, to: 'direccion' },
    { from: /especficos/g, to: 'especificos' },
    { from: /elctrica/g, to: 'electrica' },
    { from: /ptica/g, to: 'optica' },
    { from: /presin/g, to: 'presion' },
    { from: /Recepcinista/gi, to: 'recepcionista' }
];

replacements.forEach(r => {
    content = content.replace(r.from, r.to);
});

// Escribir como UTF-8 sin BOM
fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ Archivo init_fijo.sql convertido y limpiado con éxito');

