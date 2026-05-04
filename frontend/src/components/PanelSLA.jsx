// Sprint 3 / S3-B — Panel reutilizable de buckets de SLA.
// Uso:
//   <PanelSLA darkMode={darkMode} fase="Aseguramiento" titulo="Mi área" />
// Sin `fase` muestra el agregado global. Las cards son clickables y navegan
// a /equipos con el filtro correspondiente.

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Clock, CheckCircle, Activity, RefreshCw, ChevronRight } from 'lucide-react';

const BUCKETS_DEF = [
    {
        id: 'vencidos',
        titulo: 'Vencidos',
        descripcion: 'SLA agotado',
        icono: AlertTriangle,
        color: 'rose',
        filtroQuery: 'sla_critico'
    },
    {
        id: 'vence_3_dias',
        titulo: 'Vence en 1–3 días',
        descripcion: 'Crítico',
        icono: Clock,
        color: 'amber',
        filtroQuery: 'sla_critico'
    },
    {
        id: 'vence_4_7_dias',
        titulo: 'Vence en 4–7 días',
        descripcion: 'Atención',
        icono: Activity,
        color: 'sky',
        filtroQuery: null   // No hay filtro pre-armado, va a /equipos genérico
    },
    {
        id: 'en_tiempo',
        titulo: 'En tiempo (>7 días)',
        descripcion: 'OK',
        icono: CheckCircle,
        color: 'emerald',
        filtroQuery: null
    }
];

export default function PanelSLA({ darkMode, fase = null, titulo, descripcion }) {
    const [data, setData] = useState(null);
    const [cargando, setCargando] = useState(true);
    const navigate = useNavigate();

    const cargar = async () => {
        setCargando(true);
        try {
            const res = await axios.get(`/api/dashboard/sla-buckets${fase ? `?fase=${encodeURIComponent(fase)}` : ''}`);
            setData(res.data);
        } catch (err) {
            console.error('PanelSLA error:', err);
            setData(null);
        } finally {
            setCargando(false);
        }
    };

    useEffect(() => { cargar(); }, [fase]);

    const boxBg = darkMode ? 'bg-[#141f0b] border-[#C9EA63]/20' : 'bg-white border-slate-200';
    const cardBg = darkMode ? 'bg-[#1b2b10] border-[#C9EA63]/15' : 'bg-slate-50 border-slate-200';
    const textTitle = darkMode ? 'text-[#F2F6F0]' : 'text-slate-800';
    const textBody = darkMode ? 'text-[#F2F6F0]/70' : 'text-slate-600';
    const textMuted = darkMode ? 'text-[#F2F6F0]/40' : 'text-slate-400';

    const irABucket = (bucket) => {
        const params = new URLSearchParams();
        if (bucket.filtroQuery) params.set('filtro', bucket.filtroQuery);
        if (fase) params.set('estatus', fase);
        navigate(`/equipos?${params.toString()}`);
    };

    return (
        <div className={`p-6 rounded-2xl border ${boxBg} space-y-4`}>
            <div className="flex items-center justify-between">
                <div>
                    <h3 className={`text-lg font-black ${textTitle}`}>{titulo || 'Panel SLA'}</h3>
                    {descripcion && <p className={`text-xs ${textMuted}`}>{descripcion}</p>}
                </div>
                <div className="flex items-center gap-3">
                    {data && <span className={`text-xs font-bold ${textMuted}`}>Total activos: <b className={textTitle}>{data.total}</b></span>}
                    <button onClick={cargar} className={`p-2 rounded-lg ${darkMode ? 'hover:bg-white/5' : 'hover:bg-slate-100'}`} title="Refrescar">
                        <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {BUCKETS_DEF.map(b => {
                    const count = data?.buckets?.[b.id]?.count || 0;
                    const Icono = b.icono;
                    return (
                        <button
                            key={b.id}
                            onClick={() => irABucket(b)}
                            className={`text-left p-4 rounded-xl border-l-4 transition-all hover:-translate-y-0.5 hover:shadow-md ${cardBg} border-l-${b.color}-500`}
                        >
                            <div className="flex items-start justify-between mb-2">
                                <div className={`p-1.5 rounded-lg bg-${b.color}-500/10 text-${b.color}-500`}>
                                    <Icono size={16} />
                                </div>
                                <ChevronRight size={14} className={textMuted} />
                            </div>
                            <div className={`text-3xl font-black leading-none ${textTitle}`}>{count}</div>
                            <div className={`text-[10px] font-black uppercase tracking-wider mt-2 text-${b.color}-500`}>
                                {b.titulo}
                            </div>
                            <div className={`text-[10px] mt-0.5 ${textMuted}`}>{b.descripcion}</div>
                        </button>
                    );
                })}
            </div>

            {/* Top 5 vencidos / críticos en preview rápido */}
            {data?.buckets?.vencidos?.equipos?.length > 0 && (
                <div className={`mt-2 p-4 rounded-xl border ${darkMode ? 'border-rose-500/20 bg-rose-900/10' : 'border-rose-200 bg-rose-50'}`}>
                    <div className="flex items-center gap-2 mb-3">
                        <AlertTriangle size={14} className="text-rose-500" />
                        <span className={`text-[11px] font-black uppercase tracking-wider ${darkMode ? 'text-rose-300' : 'text-rose-700'}`}>
                            Atención inmediata — equipos vencidos
                        </span>
                    </div>
                    <div className="space-y-1.5">
                        {data.buckets.vencidos.equipos.slice(0, 5).map(e => (
                            <button
                                key={e.id}
                                onClick={() => navigate(`/orden/${encodeURIComponent(e.orden_cotizacion)}`)}
                                className={`w-full text-left flex items-center justify-between gap-3 p-2 rounded-lg ${darkMode ? 'hover:bg-rose-900/20' : 'hover:bg-rose-100'} transition-colors`}
                            >
                                <div className="min-w-0 flex-1">
                                    <p className={`text-xs font-bold truncate ${textTitle}`}>{e.nombre_instrumento}</p>
                                    <p className={`text-[10px] ${textMuted} truncate`}>OC {e.orden_cotizacion} · {e.empresa} · {e.estatus_actual}</p>
                                </div>
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded ${darkMode ? 'bg-rose-900/40 text-rose-300' : 'bg-rose-100 text-rose-700'}`}>
                                    {e.slaRestante <= 0 ? `${Math.abs(e.slaRestante)}d atrasado` : `${e.slaRestante}d`}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
