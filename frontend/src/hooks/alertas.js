// Helper unificado de alertas y confirmaciones modernas con SweetAlert2.
// Reemplaza los window.alert / window.confirm dispersos por el código.
//
// Uso:
//   import { confirmar, alertaError, alertaExito, prompt } from '../hooks/alertas';
//   if (await confirmar('¿Eliminar equipo?', 'Esta acción no se puede deshacer.')) { ... }
//
// Respeta el modo oscuro leyendo `crm_dark` de localStorage.

import Swal from 'sweetalert2';

function esDark() {
    try {
        return localStorage.getItem('crm_dark') === 'true' ||
               document.documentElement.classList.contains('dark');
    } catch (_) { return false; }
}

function paleta() {
    const dark = esDark();
    return dark ? {
        background: '#141f0b',
        color: '#F2F6F0',
        confirmButtonColor: '#C9EA63',
        cancelButtonColor: '#475569',
        denyButtonColor: '#f43f5e',
        // Forzar color de texto del botón verde a oscuro para contraste
        confirmButtonText: 'Aceptar'
    } : {
        background: '#ffffff',
        color: '#0f172a',
        confirmButtonColor: '#008a5e',
        cancelButtonColor: '#94a3b8',
        denyButtonColor: '#e11d48',
        confirmButtonText: 'Aceptar'
    };
}

const baseToast = Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true
});

export async function confirmar(titulo, texto = '', opts = {}) {
    const p = paleta();
    const r = await Swal.fire({
        title: titulo,
        text: texto,
        icon: opts.icon || 'question',
        showCancelButton: true,
        confirmButtonColor: opts.danger ? p.denyButtonColor : p.confirmButtonColor,
        cancelButtonColor: p.cancelButtonColor,
        confirmButtonText: opts.confirmText || (opts.danger ? 'Sí, continuar' : 'Confirmar'),
        cancelButtonText: opts.cancelText || 'Cancelar',
        background: p.background,
        color: p.color,
        reverseButtons: true,
        focusCancel: !!opts.danger
    });
    return r.isConfirmed;
}

export async function alertaExito(titulo, texto = '') {
    return baseToast.fire({ icon: 'success', title: titulo, text: texto });
}

export async function alertaError(titulo, texto = '') {
    const p = paleta();
    return Swal.fire({
        title: titulo,
        text: texto,
        icon: 'error',
        background: p.background,
        color: p.color,
        confirmButtonColor: p.confirmButtonColor
    });
}

export async function alertaInfo(titulo, texto = '') {
    return baseToast.fire({ icon: 'info', title: titulo, text: texto });
}

export async function alertaAdvertencia(titulo, texto = '') {
    const p = paleta();
    return Swal.fire({
        title: titulo,
        text: texto,
        icon: 'warning',
        background: p.background,
        color: p.color,
        confirmButtonColor: p.confirmButtonColor
    });
}

/** Prompt: pide texto al usuario. Devuelve string o null. */
export async function prompt(titulo, opts = {}) {
    const p = paleta();
    const r = await Swal.fire({
        title: titulo,
        input: opts.input || 'text',
        inputLabel: opts.label || '',
        inputPlaceholder: opts.placeholder || '',
        inputValue: opts.value || '',
        showCancelButton: true,
        background: p.background,
        color: p.color,
        confirmButtonColor: p.confirmButtonColor,
        cancelButtonColor: p.cancelButtonColor,
        confirmButtonText: opts.confirmText || 'Aceptar',
        cancelButtonText: 'Cancelar',
        inputValidator: opts.required ? (v) => (!v || !v.trim()) ? 'Este campo es obligatorio' : null : undefined
    });
    return r.isConfirmed ? r.value : null;
}
