// Sprint 9 / S9-A — Módulo de Facturación para Ivón.
// Recibe equipos que Julieta envió (con o sin certificado), confirma pago al cliente
// y los pasa a la bandeja de Flor (Entregas).

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
    DollarSign, FileText, RefreshCw, Building2, Calendar, ArrowRight,
    CheckCircle, Clock, AlertTriangle, Search, Receipt, History, FileCheck, Ban
} from 'lucide-react';
import { toast } from 'sonner';
import { confirmar } from '../hooks/alertas';
import { formatearFecha, formatearFechaHora } from '../hooks/fechas';
import { usePermisos } from '../hooks/usePermisos';
import PanelSLA from './PanelSLA';

function badgeSLA(sla, darkMode) {
    if (sla == null) return null;
    let label = `${sla}d`;
    let cls = darkMode ? 'bg-emerald-900/40 text-emerald-300' : 'bg-emerald-100 text-emerald-700';
    if (sla <= 0) {
        label = `Vencido ${Math.abs(sla)}d`;
        cls = darkMode ? 'bg-rose-900/50 text-rose-300' : 'bg-rose-100 text-rose-700';
    } else if (sla <= 3) {
        cls = darkMode ? 'bg-amber-900/40 text-amber-300' : 'bg-amber-100 text-amber-800';
    } else if (sla > 7) {
        cls = darkMode ? 'bg-sky-900/40 text-sky-300' : 'bg-sky-100 text-sky-700';
    }
    return <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${cls}`}>{label}</span>;
}

export default function Facturacion({ darkMode, usuario }) {
    const navigate = useNavigate();
    const { tiene } = usePermisos();
    const puedeConfirmar = tiene('facturacion.confirmar_pago');
    const [tab, setTab] = useState('pendientes'); // 'pendientes' | 'historial'
    const [pendientes, setPendientes] = useState([]);
    const [historial, setHistorial] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [busqueda, setBusqueda] = useState('');
    const [confirmando, setConfirmando] = useState(null);

    const [seguimiento, setSeguimiento] = useState([]); // Sprint 12-E

    const cargar = async () => {
        setCargando(true);
        try {
            const [r1, r2, r3] = await Promise.all([
                axios.get('/api/facturacion/pendientes'),
                axios.get('/api/facturacion/historial'),
                axios.get('/api/certificacion/seguimiento').catch(() => ({ data: [] }))
            ]);
            setPendientes(r1.data || []);
            setHistorial(r2.data || []);
            setSeguimiento(r3.data || []);
        } catch (err) {
            toast.error('Error cargando facturación: ' + (err.response?.data?.error || err.message));
        } finally { setCargando(false); }
    };
    useEffect(() => { cargar(); }, []);

    const confirmarPago = async (eq) => {
        // Sprint 12-C — warning visible cuando el equipo está en pendiente o sin cert.
        // Ivón puede confirmar igual; el flag se conserva para que Flor vea el estado.
        let nota = '';
        if (eq.certificado_pendiente === 1) nota = '\n\n⚠️ ATENCIÓN: este equipo se envió como CERTIFICADO PENDIENTE. Julieta debe subir el PDF más tarde.';
        else if (!eq.certificado_url && !eq.no_requiere_certificado) nota = '\n\n⚠️ ATENCIÓN: este equipo NO tiene certificado y no está marcado como "no requiere". Verifica con Julieta antes de cobrar.';

        const ok = await confirmar(
            'Confirmar pago de factura',
            `¿El cliente ${eq.empresa || ''} ya pagó la factura de "${eq.nombre_instrumento}"? Se enviará a Entrega.${nota}`,
            { confirmText: 'Sí, marcar pagada' }
        );
        if (!ok) return;
        setConfirmando(eq.id);
        try {
            await axios.post(`/api/facturacion/${eq.id}/confirmar-pago`);
            toast.success('Pago confirmado. Equipo movido a Entregas.');
            await cargar();
        } catch (err) {
            toast.error(err.response?.data?.error || err.message);
        } finally { setConfirmando(null); }
    };

    const filtrar = (lista) => {
        if (!busqueda) return lista;
        const q = busqueda.toLowerCase();
        return lista.filter(e =>
            (e.nombre_instrumento || '').toLowerCase().includes(q) ||
            (e.orden_cotizacion || '').toLowerCase().includes(q) ||
            (e.empresa || '').toLowerCase().includes(q)
        );
    };

    // Sprint 12-C — separamos pendientes (flag explícito) de sin definir (sin nada).
    const totalCert = pendientes.filter(e => e.certificado_url).length;
    const totalNoRequiere = pendientes.filter(e => !e.certificado_url && e.no_requiere_certificado === 1).length;
    const totalPendienteCert = pendientes.filter(e => !e.certificado_url && e.certificado_pendiente === 1).length;
    const totalSinDefinir = pendientes.filter(e => !e.certificado_url && e.no_requiere_certificado !== 1 && e.certificado_pendiente !== 1).length;
    // Sprint 12-E — equipos que YA facturé (factura_pagada=1) o entregados sin cert.
    // Sigue siendo mi responsabilidad recordarle a Julieta que les suba el PDF.
    const seguimientoMios = seguimiento.filter(s => s.factura_pagada === 1 || s.estatus_actual === 'Entregado');

    const boxBg     = darkMode ? 'bg-[#141f0b] border-[#C9EA63]/20' : 'bg-white border-slate-200';
    const cardBg    = darkMode ? 'bg-[#1b2b10] border-[#C9EA63]/15' : 'bg-slate-50 border-slate-200';
    const textTitle = darkMode ? 'text-[#F2F6F0]' : 'text-slate-800';
    const textBody  = darkMode ? 'text-[#F2F6F0]/70' : 'text-slate-600';
    const textMuted = darkMode ? 'text-[#F2F6F0]/40' : 'text-slate-400';
    const accent    = darkMode ? 'text-[#C9EA63]' : 'text-emerald-600';

    return (
        <div className="w-full space-y-6 animate-in fade-in">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <p className={`text-[11px] font-black uppercase tracking-widest ${textMuted}`}>Facturación</p>
                    <h1 className={`text-2xl sm:text-3xl font-black ${accent}`}>Bandeja de Cobranza</h1>
                    <p className={`text-xs ${textBody} mt-1`}>
                        Equipos certificados listos para facturar al cliente. Al confirmar el pago se envían a Entregas.
                    </p>
                </div>
                <button onClick={cargar} className={`p-2 rounded-lg border ${darkMode ? 'border-[#C9EA63]/20 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}>
                    <RefreshCw size={18} className={cargando ? 'animate-spin' : ''} />
                </button>
            </div>

            {/* KPIs principales (Sprint 12-C) */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className={`p-4 rounded-2xl border-l-4 border-amber-500 ${boxBg}`}>
                    <div className="text-[10px] font-black uppercase tracking-widest text-amber-500 flex items-center gap-1"><Receipt size={12}/> Por facturar</div>
                    <div className={`text-3xl font-black mt-1 ${textTitle}`}>{pendientes.length}</div>
                </div>
                <div className={`p-4 rounded-2xl border-l-4 border-emerald-500 ${boxBg}`}>
                    <div className="text-[10px] font-black uppercase tracking-widest text-emerald-500 flex items-center gap-1"><FileCheck size={12}/> Con certificado</div>
                    <div className={`text-3xl font-black mt-1 ${textTitle}`}>{totalCert}</div>
                </div>
                <div className={`p-4 rounded-2xl border-l-4 border-sky-500 ${boxBg}`}>
                    <div className="text-[10px] font-black uppercase tracking-widest text-sky-500 flex items-center gap-1"><Ban size={12}/> No requieren cert.</div>
                    <div className={`text-3xl font-black mt-1 ${textTitle}`}>{totalNoRequiere}</div>
                </div>
                <div className={`p-4 rounded-2xl border-l-4 border-amber-600 ${boxBg}`}>
                    <div className="text-[10px] font-black uppercase tracking-widest text-amber-600 flex items-center gap-1"><Clock size={12}/> Pendientes (vienen)</div>
                    <div className={`text-3xl font-black mt-1 ${textTitle}`}>{totalPendienteCert}</div>
                </div>
                <div className={`p-4 rounded-2xl border-l-4 border-rose-500 ${boxBg}`}>
                    <div className="text-[10px] font-black uppercase tracking-widest text-rose-500 flex items-center gap-1"><AlertTriangle size={12}/> Sin definir</div>
                    <div className={`text-3xl font-black mt-1 ${textTitle}`}>{totalSinDefinir}</div>
                </div>
            </div>

            {/* Sprint 12-E — Seguimiento global de PDFs faltantes (incluye los que YA facturé).
                Si una se olvida del cert, las otras lo ven y se lo recuerdan. */}
            {seguimientoMios.length > 0 && (
                <div className={`p-5 rounded-2xl border ${darkMode ? 'bg-amber-950/15 border-amber-500/30' : 'bg-amber-50 border-amber-200'}`}>
                    <div className="flex items-center gap-2 mb-3 flex-wrap">
                        <Clock className={darkMode ? 'text-amber-400' : 'text-amber-700'} size={18}/>
                        <h3 className={`text-sm font-black ${darkMode ? 'text-amber-300' : 'text-amber-800'}`}>
                            {seguimientoMios.length} equipo(s) facturados o entregados SIN certificado
                        </h3>
                        <span className={`ml-auto text-[11px] ${darkMode ? 'text-amber-300/70' : 'text-amber-700/80'}`}>
                            Coordina con Julieta para que suba el PDF
                        </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {seguimientoMios.slice(0, 10).map(s => (
                            <button
                                key={s.id}
                                onClick={() => navigate(`/orden/${encodeURIComponent(s.orden_cotizacion)}`)}
                                className={`text-left px-3 py-2 rounded-xl border text-[11px] hover:shadow-md transition-all ${darkMode ? 'bg-[#1b2b10] border-amber-500/30 hover:border-amber-400' : 'bg-white border-amber-300 hover:border-amber-500'}`}
                            >
                                <div className="flex items-center gap-1.5 mb-1">
                                    <span className={`text-[9px] font-mono opacity-50`}>{s.orden_cotizacion}</span>
                                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-black ${s.certificado_pendiente ? 'bg-amber-500 text-white' : 'bg-rose-500 text-white'}`}>
                                        {s.certificado_pendiente ? 'PENDIENTE' : 'SIN DEFINIR'}
                                    </span>
                                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-black ${darkMode ? 'bg-[#253916] text-[#C9EA63]' : 'bg-emerald-100 text-emerald-700'}`}>{s.estatus_actual}</span>
                                </div>
                                <div className={`font-bold truncate max-w-[200px] ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-700'}`}>{s.nombre_instrumento}</div>
                                <div className={`text-[10px] opacity-60 truncate max-w-[200px]`}>{s.empresa}</div>
                            </button>
                        ))}
                        {seguimientoMios.length > 10 && (
                            <span className={`px-3 py-2 text-[11px] italic ${darkMode ? 'text-amber-300/60' : 'text-amber-700/60'}`}>
                                + {seguimientoMios.length - 10} más...
                            </span>
                        )}
                    </div>
                </div>
            )}

            {/* PanelSLA específico para Facturación */}
            <PanelSLA
                darkMode={darkMode}
                fase="Facturación"
                titulo="SLA de equipos en Facturación"
                descripcion="Equipos en mi bandeja agrupados por urgencia. Click en una tarjeta filtra el listado de equipos."
            />

            {/* Tabs */}
            <div className={`flex gap-1 p-1 rounded-xl ${darkMode ? 'bg-white/5' : 'bg-slate-100'}`}>
                <button onClick={() => setTab('pendientes')} className={`flex-1 py-2 rounded-lg text-xs font-black ${tab === 'pendientes' ? (darkMode ? 'bg-[#C9EA63] text-[#141f0b]' : 'bg-white text-slate-800 shadow-sm') : (darkMode ? 'text-white/40' : 'text-slate-400')}`}>
                    Por cobrar ({pendientes.length})
                </button>
                <button onClick={() => setTab('historial')} className={`flex-1 py-2 rounded-lg text-xs font-black flex items-center justify-center gap-1 ${tab === 'historial' ? (darkMode ? 'bg-[#C9EA63] text-[#141f0b]' : 'bg-white text-slate-800 shadow-sm') : (darkMode ? 'text-white/40' : 'text-slate-400')}`}>
                    <History size={12}/> Historial pagos ({historial.length})
                </button>
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
                {(() => {
                    const lista = filtrar(tab === 'pendientes' ? pendientes : historial);
                    if (cargando) return (
                        <div className={`p-12 text-center ${textMuted}`}>
                            <RefreshCw className="mx-auto animate-spin mb-2" size={24}/>
                        </div>
                    );
                    if (lista.length === 0) return (
                        <div className={`p-12 text-center ${textMuted}`}>
                            <Receipt size={32} className="mx-auto mb-2 opacity-50" />
                            <p className="text-sm font-bold">{tab === 'pendientes' ? 'Sin equipos pendientes de facturar' : 'Sin pagos registrados'}</p>
                        </div>
                    );
                    return lista.map(e => {
                        const esHist = tab === 'historial';
                        const tieneCert = !!e.certificado_url;
                        const noReq = e.no_requiere_certificado === 1;
                        const pendiente = e.certificado_pendiente === 1;
                        return (
                            <div key={e.id} className={`p-4 flex items-start gap-3 ${darkMode ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`}>
                                <div className={`p-2 rounded-lg flex-shrink-0 ${esHist ? (darkMode ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-100 text-emerald-600') : (darkMode ? 'bg-amber-900/30 text-amber-400' : 'bg-amber-100 text-amber-600')}`}>
                                    {esHist ? <CheckCircle size={16}/> : <Receipt size={16}/>}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <p className={`text-sm font-bold ${textTitle}`}>{e.nombre_instrumento}</p>
                                        {/* Sprint 12-C — badges del estado del certificado */}
                                        {tieneCert && (
                                            <a href={e.certificado_url} target="_blank" rel="noreferrer" className={`px-2 py-0.5 rounded-full text-[9px] font-bold inline-flex items-center gap-1 hover:underline ${darkMode ? 'bg-emerald-900/40 text-emerald-300' : 'bg-emerald-100 text-emerald-700'}`}>
                                                <FileCheck size={10}/> Con PDF
                                            </a>
                                        )}
                                        {!tieneCert && noReq && <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold inline-flex items-center gap-1 ${darkMode ? 'bg-sky-900/40 text-sky-300' : 'bg-sky-100 text-sky-700'}`}><Ban size={10}/> No requiere</span>}
                                        {!tieneCert && pendiente && <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold inline-flex items-center gap-1 ${darkMode ? 'bg-amber-900/40 text-amber-300' : 'bg-amber-100 text-amber-700'}`}><Clock size={10}/> Cert pendiente</span>}
                                        {!tieneCert && !noReq && !pendiente && <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold inline-flex items-center gap-1 ${darkMode ? 'bg-rose-900/40 text-rose-300' : 'bg-rose-100 text-rose-700'}`}><AlertTriangle size={10}/> Sin definir</span>}
                                        {!esHist && badgeSLA(e.slaRestante, darkMode)}
                                    </div>
                                    <div className={`text-[11px] flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-0.5 ${textMuted}`}>
                                        <span className="flex items-center gap-1"><Building2 size={11}/> {e.empresa || '—'}</span>
                                        <span>OC {e.orden_cotizacion}</span>
                                        {esHist && e.fecha_factura_pagada && (
                                            <span className="text-emerald-500">Pagada {formatearFechaHora(e.fecha_factura_pagada)}</span>
                                        )}
                                    </div>
                                </div>
                                {!esHist && puedeConfirmar && (
                                    <button
                                        onClick={() => confirmarPago(e)}
                                        disabled={confirmando === e.id}
                                        className={`px-3 py-2 rounded-xl font-bold text-xs flex items-center gap-1 disabled:opacity-50 ${darkMode ? 'bg-[#C9EA63] text-[#141f0b] hover:bg-[#b0d14b]' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
                                    >
                                        <DollarSign size={14}/> Confirmar pago
                                    </button>
                                )}
                                <button onClick={() => navigate(`/orden/${encodeURIComponent(e.orden_cotizacion)}`)} className={`p-2 rounded-lg ${darkMode ? 'hover:bg-white/5' : 'hover:bg-slate-100'}`}>
                                    <ArrowRight size={16} className={textMuted}/>
                                </button>
                            </div>
                        );
                    });
                })()}
            </div>
        </div>
    );
}
