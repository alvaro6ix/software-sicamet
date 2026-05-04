// Helper unificado de alertas y confirmaciones con Sonner.
// Diseño minimalista (estilo macOS/Vercel) que reemplaza a sweetalert2 y react-toastify.
//
// Uso:
//   import { confirmar, alertaError, alertaExito, alertaInfo } from '../hooks/alertas';
//   if (await confirmar('¿Eliminar equipo?', 'No se puede deshacer.')) { ... }

import React from 'react';
import { toast } from 'sonner';

export function alertaExito(titulo, descripcion) {
    return toast.success(titulo, { description: descripcion });
}

export function alertaError(titulo, descripcion) {
    return toast.error(titulo, { description: descripcion, duration: 6000 });
}

export function alertaInfo(titulo, descripcion) {
    return toast(titulo, { description: descripcion });
}

export function alertaAdvertencia(titulo, descripcion) {
    return toast.warning(titulo, { description: descripcion });
}

/**
 * Confirmación inline. Devuelve Promise<boolean>.
 * Renderiza un toast con descripción y dos botones (Cancelar / Confirmar).
 *
 *   const ok = await confirmar('Eliminar', 'Esta acción es definitiva.', { danger: true });
 */
export function confirmar(titulo, descripcion, opts = {}) {
    return new Promise((resolve) => {
        const id = toast.custom((t) => (
            <div className="bg-white dark:bg-[#141f0b] border border-slate-200 dark:border-[#C9EA63]/20 rounded-xl shadow-2xl p-4 w-[360px] max-w-[calc(100vw-2rem)]">
                <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-lg ${opts.danger ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400' : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'}`}>
                        {opts.danger ? '!' : '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-slate-900 dark:text-white">{titulo}</p>
                        {descripcion && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-snug">{descripcion}</p>}
                    </div>
                </div>
                <div className="flex gap-2 mt-3">
                    <button
                        onClick={() => { toast.dismiss(id); resolve(false); }}
                        className="flex-1 py-1.5 px-3 rounded-lg text-xs font-bold bg-slate-100 dark:bg-[#1b2b10] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#253916]"
                    >
                        {opts.cancelText || 'Cancelar'}
                    </button>
                    <button
                        onClick={() => { toast.dismiss(id); resolve(true); }}
                        autoFocus={!opts.danger}
                        className={`flex-[2] py-1.5 px-3 rounded-lg text-xs font-bold text-white ${opts.danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                    >
                        {opts.confirmText || (opts.danger ? 'Sí, continuar' : 'Confirmar')}
                    </button>
                </div>
            </div>
        ), { duration: Infinity });
    });
}

/**
 * Prompt minimalista. Devuelve string o null.
 * Para casos simples; si necesitas validación compleja, usa un modal propio.
 */
export function prompt(titulo, opts = {}) {
    return new Promise((resolve) => {
        const id = toast.custom((t) => {
            const Form = () => {
                const [val, setVal] = React.useState(opts.value || '');
                return (
                    <div className="bg-white dark:bg-[#141f0b] border border-slate-200 dark:border-[#C9EA63]/20 rounded-xl shadow-2xl p-4 w-[400px] max-w-[calc(100vw-2rem)]">
                        <p className="font-bold text-sm text-slate-900 dark:text-white">{titulo}</p>
                        {opts.label && <p className="text-xs text-slate-500 mt-1">{opts.label}</p>}
                        <input
                            autoFocus
                            type={opts.input || 'text'}
                            value={val}
                            onChange={e => setVal(e.target.value)}
                            placeholder={opts.placeholder || ''}
                            className="w-full mt-3 px-3 py-2 rounded-lg text-sm border border-slate-200 dark:border-[#C9EA63]/20 bg-slate-50 dark:bg-[#1b2b10] text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') { toast.dismiss(id); resolve(val.trim() || null); }
                                else if (e.key === 'Escape') { toast.dismiss(id); resolve(null); }
                            }}
                        />
                        <div className="flex gap-2 mt-3">
                            <button onClick={() => { toast.dismiss(id); resolve(null); }} className="flex-1 py-1.5 px-3 rounded-lg text-xs font-bold bg-slate-100 dark:bg-[#1b2b10] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#253916]">
                                Cancelar
                            </button>
                            <button onClick={() => { toast.dismiss(id); resolve(val.trim() || null); }} className="flex-[2] py-1.5 px-3 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white">
                                {opts.confirmText || 'Aceptar'}
                            </button>
                        </div>
                    </div>
                );
            };
            return <Form />;
        }, { duration: Infinity });
    });
}
