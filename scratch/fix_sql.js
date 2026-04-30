const fs = require('fs');
const path = require('path');

// Ajustamos la ruta para que busque en la raíz del proyecto
const filePath = path.join(__dirname, '..', 'database', 'init_fijo.sql');
let content = fs.readFileSync(filePath, 'utf8');

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

fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ Archivo init_fijo.sql limpiado con éxito');
