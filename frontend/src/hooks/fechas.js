// Helpers de formato de fecha consistentes en toda la app.
// Acepta ISO, timestamp, o strings tipo "2026.04.20" / "20/04/2026".

function parsear(input) {
    if (!input) return null;
    if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
    const s = String(input).trim();
    // 2026.04.20
    const m1 = s.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})/);
    if (m1) {
        const d = new Date(`${m1[1]}-${m1[2].padStart(2,'0')}-${m1[3].padStart(2,'0')}T00:00:00`);
        return isNaN(d.getTime()) ? null : d;
    }
    // 20/04/2026
    const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m2) {
        const d = new Date(`${m2[3]}-${m2[2].padStart(2,'0')}-${m2[1].padStart(2,'0')}T00:00:00`);
        return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
}

/** Formato corto: "20/abr/2026" */
export function formatearFecha(input) {
    const d = parsear(input);
    if (!d) return '—';
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/\./g, '');
}

/** Formato con hora: "20/abr/2026 14:30" */
export function formatearFechaHora(input) {
    const d = parsear(input);
    if (!d) return '—';
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/\./g, '') +
           ' ' + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

/** Solo hora: "14:30" */
export function formatearHora(input) {
    const d = parsear(input);
    if (!d) return '—';
    return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

/** Días entre dos fechas (signed). Útil para SLA. */
export function diasDesde(input, hasta = new Date()) {
    const d = parsear(input);
    if (!d) return null;
    const ms = parsear(hasta) - d;
    return Math.floor(ms / (1000 * 60 * 60 * 24));
}

/** "hace 2 horas" / "hace 3 días" / "hoy" */
export function relativeTime(input) {
    const d = parsear(input);
    if (!d) return '—';
    const seg = Math.floor((Date.now() - d.getTime()) / 1000);
    if (seg < 60) return 'hace un momento';
    if (seg < 3600) return `hace ${Math.floor(seg / 60)} min`;
    if (seg < 86400) return `hace ${Math.floor(seg / 3600)} h`;
    if (seg < 86400 * 7) return `hace ${Math.floor(seg / 86400)} d`;
    return formatearFecha(d);
}
