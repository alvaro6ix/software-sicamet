// Sprint 7 / S7-C — Vista de aseguramiento (Berenice y otros).
// Lista los equipos que el usuario logueado ha aprobado o rechazado.

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
    CheckCircle, XCircle, RefreshCw, FileText, MessageSquare,
    Building2, ArrowRight, ShieldCheck
} from 'lucide-react';
import { toast } from 'sonner';
import { formatearFechaHora } from '../hooks/fechas';

export default function MisDecisiones({ darkMode, usuario }) {
    const navigate = useNavigate();
    const [data, setData] = useState({ aprobados: [], rechazados: [] });
    const [tab, setTab] = useState('aprobados');
    const [cargando, setCargando] = useState(true);

    const cargar = async () => {
        setCargando(true);
        try {
            const res = await axios.get('/api/aseguramiento/mis-decisiones');
            setData(res.data || { aprobados: [], rechazados: [] });
        } catch (err) {
            toast.error('Error: ' + (err.response?.data?.error || err.message));
        } finally { setCargando(false); }
    };
    useEffect(() => { cargar(); }, []);

    const boxBg     = darkMode ? 'bg-[#141f0b] border-[#C9EA63]/20' : 'bg-white border-slate-200';
    const cardBg    = darkMode ? 'bg-[#1b2b10] border-[#C9EA63]/15' : 'bg-slate-50 border-slate-200';
    const textTitle = darkMode ? 'text-[#F2F6F0]' : 'text-slate-800';
    const textBody  = darkMode ? 'text-[#F2F6F0]/70' : 'text-slate-600';
    const textMuted = darkMode ? 'text-[#F2F6F0]/40' : 'text-slate-400';
    const accent    = darkMode ? 'text-[#C9EA63]' : 'text-emerald-600';

    const lista = tab === 'aprobados' ? data.aprobados : data.rechazados;

    const renderItem = (e, esRechazo = false) => (
        <div key={`${tab}-${e.id}-${e.fecha_decision}`} className={`p-4 flex items-start gap-3 hover:${darkMode ? 'bg-white/5' : 'bg-slate-50'}`}>
            <div className={`p-2 rounded-lg flex-shrink-0 ${esRechazo ? (darkMode ? 'bg-rose-900/30 text-rose-400' : 'bg-rose-100 text-rose-600') : (darkMode ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-100 text-emerald-600')}`}>
                {esRechazo ? <XCircle size={16}/> : <CheckCircle size={16}/>}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <p className={`text-sm font-bold ${textTitle}`}>{e.nombre_instrumento}</p>
                    <span className={`text-[10px] uppercase font-bold ${textMuted}`}>{e.estatus_actual}</span>
                    {esRechazo && e.rechazo_estatus === 'corregido' && (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${darkMode ? 'bg-emerald-900/40 text-emerald-300' : 'bg-emerald-100 text-emerald-700'}`}>
                            Corregido
                        </span>
                    )}
                </div>
                <div className={`text-[11px] flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-0.5 ${textMuted}`}>
                    <span className="flex items-center gap-1"><Building2 size={11}/> {e.empresa || '—'}</span>
                    <span>OC {e.orden_cotizacion}</span>
                    <span>{formatearFechaHora(e.fecha_decision)}</span>
                </div>
                {esRechazo && e.motivo && (
                    <p className={`text-xs italic mt-2 ${textBody}`}>"{e.motivo.replace(/^RECHAZO:\s*/i, '')}"</p>
                )}
            </div>
            {e.comentarios_count > 0 && (
                <span className={`text-[10px] font-bold flex items-center gap-1 ${textMuted}`}>
                    <MessageSquare size={11}/> {e.comentarios_count}
                </span>
            )}
            <button onClick={() => navigate(`/orden/${encodeURIComponent(e.orden_cotizacion)}`)} className={`p-2 rounded-lg ${darkMode ? 'hover:bg-white/5' : 'hover:bg-slate-100'}`}>
                <ArrowRight size={16} className={textMuted}/>
            </button>
        </div>
    );

    return (
        <div className="w-full space-y-6 animate-in fade-in">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <p className={`text-[11px] font-black uppercase tracking-widest ${textMuted}`}>Aseguramiento</p>
                    <h1 className={`text-2xl sm:text-3xl font-black ${accent}`}>Mis decisiones</h1>
                    <p className={`text-xs ${textBody} mt-1`}>Equipos que has aprobado y rechazado, con tu nombre como auditor.</p>
                </div>
                <button onClick={cargar} className={`p-2 rounded-lg border ${darkMode ? 'border-[#C9EA63]/20 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}>
                    <RefreshCw size={18} className={cargando ? 'animate-spin' : ''} />
                </button>
            </div>

            {/* KPI tabs */}
            <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setTab('aprobados')} className={`p-4 rounded-2xl border text-left transition-all ${tab === 'aprobados' ? 'ring-2 ring-emerald-500' : ''} ${boxBg}`}>
                    <div className="text-[10px] uppercase font-bold text-emerald-500 flex items-center gap-1"><ShieldCheck size={12}/> Aprobados</div>
                    <div className={`text-3xl font-black mt-1 ${textTitle}`}>{data.aprobados.length}</div>
                </button>
                <button onClick={() => setTab('rechazados')} className={`p-4 rounded-2xl border text-left transition-all ${tab === 'rechazados' ? 'ring-2 ring-rose-500' : ''} ${boxBg}`}>
                    <div className="text-[10px] uppercase font-bold text-rose-500 flex items-center gap-1"><XCircle size={12}/> Rechazados</div>
                    <div className={`text-3xl font-black mt-1 ${textTitle}`}>{data.rechazados.length}</div>
                </button>
            </div>

            <div className={`rounded-2xl border ${boxBg} divide-y ${darkMode ? 'divide-[#C9EA63]/10' : 'divide-slate-100'}`}>
                {cargando ? (
                    <div className={`p-12 text-center ${textMuted}`}>
                        <RefreshCw className="mx-auto animate-spin mb-2" size={24}/>
                    </div>
                ) : lista.length === 0 ? (
                    <div className={`p-12 text-center ${textMuted}`}>
                        <ShieldCheck size={32} className="mx-auto mb-2 opacity-50" />
                        <p className="text-sm font-bold">Sin {tab} todavía</p>
                    </div>
                ) : lista.map(e => renderItem(e, tab === 'rechazados'))}
            </div>
        </div>
    );
}
