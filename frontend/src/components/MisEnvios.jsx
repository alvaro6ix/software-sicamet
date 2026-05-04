// Sprint 7 / S7-C — Vista del metrólogo de "lo que ya envié a aseguramiento".
// Muestra equipos en fases post-laboratorio donde participó, con badge de
// mensajes nuevos y atajo al chat de cada equipo.

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
    Send, MessageSquare, RefreshCw, Building2, FileText, Activity,
    CheckCircle, AlertTriangle, FileCheck, Truck, Search, ArrowRight, Clock
} from 'lucide-react';
import { toast } from 'sonner';
import { formatearFechaHora, relativeTime } from '../hooks/fechas';

const FASE_INFO = {
    'Aseguramiento': { color: 'blue',    icono: AlertTriangle, label: 'En Aseguramiento' },
    'Certificación': { color: 'purple',  icono: FileCheck,     label: 'En Certificación' },
    'Facturación':   { color: 'emerald', icono: CheckCircle,   label: 'En Facturación' },
    'Entregado':     { color: 'gray',    icono: Truck,         label: 'Entregado' }
};

export default function MisEnvios({ darkMode, usuario }) {
    const navigate = useNavigate();
    const [equipos, setEquipos] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [filtroFase, setFiltroFase] = useState(null);
    const [busqueda, setBusqueda] = useState('');

    const cargar = async () => {
        setCargando(true);
        try {
            const res = await axios.get('/api/metrologia/mis-envios');
            setEquipos(res.data || []);
        } catch (err) {
            toast.error('Error al cargar envíos: ' + (err.response?.data?.error || err.message));
        } finally {
            setCargando(false);
        }
    };
    useEffect(() => { cargar(); }, []);

    const boxBg    = darkMode ? 'bg-[#141f0b] border-[#C9EA63]/20' : 'bg-white border-slate-200';
    const cardBg   = darkMode ? 'bg-[#1b2b10] border-[#C9EA63]/15' : 'bg-slate-50 border-slate-200';
    const textTitle = darkMode ? 'text-[#F2F6F0]' : 'text-slate-800';
    const textBody  = darkMode ? 'text-[#F2F6F0]/70' : 'text-slate-600';
    const textMuted = darkMode ? 'text-[#F2F6F0]/40' : 'text-slate-400';
    const accent    = darkMode ? 'text-[#C9EA63]' : 'text-emerald-600';

    const conteos = equipos.reduce((acc, e) => {
        acc.total = (acc.total || 0) + 1;
        acc[e.estatus_actual] = (acc[e.estatus_actual] || 0) + 1;
        if (e.rechazos_aseguramiento > 0) acc.con_rechazos = (acc.con_rechazos || 0) + 1;
        return acc;
    }, {});

    const filtrados = equipos.filter(e => {
        if (filtroFase && e.estatus_actual !== filtroFase) return false;
        const q = busqueda.toLowerCase();
        return !q ||
            (e.nombre_instrumento || '').toLowerCase().includes(q) ||
            (e.orden_cotizacion || '').toLowerCase().includes(q) ||
            (e.empresa || '').toLowerCase().includes(q);
    });

    return (
        <div className="w-full space-y-6 animate-in fade-in">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <p className={`text-[11px] font-black uppercase tracking-widest ${textMuted}`}>Metrología</p>
                    <h1 className={`text-2xl sm:text-3xl font-black ${accent}`}>Mis Envíos</h1>
                    <p className={`text-xs ${textBody} mt-1`}>
                        Equipos que enviaste a Aseguramiento. Click en el ícono de chat para ver mensajes.
                    </p>
                </div>
                <button onClick={cargar} className={`p-2 rounded-lg border ${darkMode ? 'border-[#C9EA63]/20 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}>
                    <RefreshCw size={18} className={cargando ? 'animate-spin' : ''} />
                </button>
            </div>

            {/* KPIs por fase — clickables */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <button onClick={() => setFiltroFase(null)} className={`p-4 rounded-2xl border text-left transition-all hover:-translate-y-0.5 ${filtroFase === null ? 'ring-2 ring-emerald-500' : ''} ${boxBg}`}>
                    <div className={`text-[10px] uppercase font-bold ${textMuted}`}>Total enviados</div>
                    <div className={`text-3xl font-black mt-1 ${textTitle}`}>{conteos.total || 0}</div>
                </button>
                {Object.entries(FASE_INFO).map(([fase, cfg]) => {
                    const Icono = cfg.icono;
                    const count = conteos[fase] || 0;
                    return (
                        <button
                            key={fase}
                            onClick={() => setFiltroFase(filtroFase === fase ? null : fase)}
                            className={`p-4 rounded-2xl border text-left transition-all hover:-translate-y-0.5 ${filtroFase === fase ? `ring-2 ring-${cfg.color}-500` : ''} ${boxBg}`}
                        >
                            <div className={`text-[10px] uppercase font-bold flex items-center gap-1 text-${cfg.color}-500`}>
                                <Icono size={12}/> {cfg.label}
                            </div>
                            <div className={`text-3xl font-black mt-1 ${textTitle}`}>{count}</div>
                        </button>
                    );
                })}
            </div>

            {/* Buscador */}
            <div className={`p-3 rounded-xl border flex items-center gap-2 ${boxBg}`}>
                <Search size={16} className={textMuted} />
                <input
                    value={busqueda}
                    onChange={e => setBusqueda(e.target.value)}
                    placeholder="Buscar por equipo, OS o empresa..."
                    className={`flex-1 bg-transparent outline-none text-sm ${textTitle}`}
                />
            </div>

            {/* Lista */}
            <div className={`rounded-2xl border ${boxBg} divide-y ${darkMode ? 'divide-[#C9EA63]/10' : 'divide-slate-100'}`}>
                {cargando ? (
                    <div className={`p-12 text-center ${textMuted}`}>
                        <RefreshCw className="mx-auto animate-spin mb-2" size={24}/>
                        <p className="text-sm">Cargando...</p>
                    </div>
                ) : filtrados.length === 0 ? (
                    <div className={`p-12 text-center ${textMuted}`}>
                        <Send size={32} className="mx-auto mb-2 opacity-50" />
                        <p className="text-sm font-bold">Aún no has enviado equipos a aseguramiento</p>
                        <p className="text-xs mt-1">Cuando termines un equipo en Mi Bandeja, aparecerá aquí.</p>
                    </div>
                ) : filtrados.map(e => {
                    const cfg = FASE_INFO[e.estatus_actual] || { color: 'gray', icono: Activity, label: e.estatus_actual };
                    const Icono = cfg.icono;
                    return (
                        <div key={e.id} className={`p-4 flex items-center gap-3 hover:${darkMode ? 'bg-white/5' : 'bg-slate-50'}`}>
                            <button
                                onClick={() => navigate(`/orden/${encodeURIComponent(e.orden_cotizacion)}`)}
                                className={`p-2 rounded-lg flex-shrink-0 ${darkMode ? 'bg-[#1b2b10] hover:bg-[#253916]' : 'bg-white hover:bg-slate-100'}`}
                                title="Ver detalle de la OS"
                            >
                                <FileText size={16} className={accent}/>
                            </button>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <p className={`text-sm font-bold truncate ${textTitle}`}>{e.nombre_instrumento}</p>
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold bg-${cfg.color}-500/10 text-${cfg.color}-500 flex items-center gap-1`}>
                                        <Icono size={10}/> {cfg.label}
                                    </span>
                                    {e.rechazos_aseguramiento > 0 && (
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${darkMode ? 'bg-rose-900/40 text-rose-300' : 'bg-rose-100 text-rose-700'}`}>
                                            {e.rechazos_aseguramiento} rechazo{e.rechazos_aseguramiento > 1 ? 's' : ''}
                                        </span>
                                    )}
                                </div>
                                <div className={`text-[11px] flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-0.5 ${textMuted}`}>
                                    <span className="flex items-center gap-1"><Building2 size={11}/> {e.empresa || '—'}</span>
                                    <span className="flex items-center gap-1">OC {e.orden_cotizacion}</span>
                                    {e.ultimo_comentario && (
                                        <span className="flex items-center gap-1 text-emerald-500">
                                            <Clock size={11}/> Último mensaje {relativeTime(e.ultimo_comentario)}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <button
                                onClick={() => navigate('/correcciones-metrologia')}
                                className={`relative p-2 rounded-lg ${darkMode ? 'hover:bg-white/5' : 'hover:bg-slate-100'}`}
                                title={e.comentarios_count > 0 ? `Ver chat (${e.comentarios_count})` : 'Sin mensajes aún'}
                            >
                                <MessageSquare size={18} className={e.comentarios_count > 0 ? 'text-amber-500' : textMuted} />
                                {e.comentarios_count > 0 && (
                                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] font-black flex items-center justify-center">
                                        {e.comentarios_count > 9 ? '9+' : e.comentarios_count}
                                    </span>
                                )}
                            </button>
                            <button
                                onClick={() => navigate(`/orden/${encodeURIComponent(e.orden_cotizacion)}`)}
                                className={`p-2 rounded-lg ${darkMode ? 'hover:bg-white/5' : 'hover:bg-slate-100'}`}
                                title="Abrir orden"
                            >
                                <ArrowRight size={18} className={textMuted}/>
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
