// Sprint 4 / S4-B — bandeja del jefe de metrología (Agustín).
// Muestra equipos pendientes de asignación y permite asignarlos a metrólogos
// con visibilidad de la carga de trabajo de cada uno.
//
// Permiso requerido en backend: 'metrologia.asignar'

import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import {
    Inbox, Users, Activity, ChevronRight, RefreshCw, AlertTriangle, X,
    UserPlus, Clock, Calendar, Tag, Building2, FileText, CheckCircle, Search
} from 'lucide-react';
import { toast } from 'sonner';

function badgeSLA(slaRestante, darkMode) {
    if (slaRestante == null) return null;
    let label = `${slaRestante}d`;
    let cls = darkMode ? 'bg-emerald-900/40 text-emerald-300' : 'bg-emerald-100 text-emerald-700';
    if (slaRestante <= 0) {
        label = `Vencido ${Math.abs(slaRestante)}d`;
        cls = darkMode ? 'bg-rose-900/50 text-rose-300' : 'bg-rose-100 text-rose-700';
    } else if (slaRestante <= 3) {
        cls = darkMode ? 'bg-amber-900/40 text-amber-300' : 'bg-amber-100 text-amber-800';
    }
    return <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${cls}`}>{label}</span>;
}

const BandejaAsignacion = ({ darkMode }) => {
    const navigate = useNavigate();
    const [data, setData] = useState({ pendientes: [], total_pendientes: 0, total_activos: 0 });
    const [carga, setCarga] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [busqueda, setBusqueda] = useState('');
    const [equipoModal, setEquipoModal] = useState(null);          // equipo siendo asignado
    const [seleccionados, setSeleccionados] = useState([]);        // ids de metrólogos elegidos
    const [guardando, setGuardando] = useState(false);

    const cargar = async () => {
        setCargando(true);
        try {
            const [pRes, cRes] = await Promise.all([
                axios.get('/api/asignacion/pendientes'),
                axios.get('/api/asignacion/carga-metrologos')
            ]);
            setData(pRes.data);
            setCarga(cRes.data || []);
        } catch (err) {
            toast.error('Error cargando bandeja: ' + (err.response?.data?.error || err.message));
        } finally {
            setCargando(false);
        }
    };
    useEffect(() => { cargar(); }, []);

    const pendientesFiltrados = useMemo(() => {
        if (!busqueda) return data.pendientes;
        const q = busqueda.toLowerCase();
        return data.pendientes.filter(e =>
            (e.nombre_instrumento || '').toLowerCase().includes(q) ||
            (e.orden_cotizacion || '').toLowerCase().includes(q) ||
            (e.empresa || '').toLowerCase().includes(q) ||
            (e.area_laboratorio || '').toLowerCase().includes(q)
        );
    }, [data.pendientes, busqueda]);

    const abrirAsignacion = (eq) => {
        setEquipoModal(eq);
        setSeleccionados([]);
    };

    const toggleMetrologo = (id) => {
        setSeleccionados(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const guardarAsignacion = async () => {
        if (!equipoModal || seleccionados.length === 0) return;
        setGuardando(true);
        try {
            await axios.post(`/api/instrumentos/${equipoModal.id}/asignar_metrologos`, { metrologos_ids: seleccionados });
            toast.success(`Asignación guardada para ${equipoModal.nombre_instrumento}`);
            setEquipoModal(null);
            setSeleccionados([]);
            await cargar();
        } catch (err) {
            toast.error('Error: ' + (err.response?.data?.error || err.message));
        } finally {
            setGuardando(false);
        }
    };

    // Sugerir el metrólogo del área del equipo con menos carga.
    const sugerirMetrologos = (eq) => {
        if (!eq?.area_laboratorio) return [];
        return carga
            .filter(c => (c.area || '').toLowerCase() === (eq.area_laboratorio || '').toLowerCase())
            .slice(0, 3)
            .map(c => c.id);
    };

    const metrologosArea = useMemo(() => {
        if (!equipoModal?.area_laboratorio) return carga;
        return [
            ...carga.filter(c => (c.area || '').toLowerCase() === (equipoModal.area_laboratorio || '').toLowerCase()),
            ...carga.filter(c => (c.area || '').toLowerCase() !== (equipoModal.area_laboratorio || '').toLowerCase())
        ];
    }, [carga, equipoModal]);

    const boxBg = darkMode ? 'bg-[#141f0b] border-[#C9EA63]/20' : 'bg-white border-slate-200';
    const cardBg = darkMode ? 'bg-[#1b2b10] border-[#C9EA63]/15' : 'bg-slate-50 border-slate-200';
    const textTitle = darkMode ? 'text-[#F2F6F0]' : 'text-slate-800';
    const textBody = darkMode ? 'text-[#F2F6F0]/70' : 'text-slate-600';
    const textMuted = darkMode ? 'text-[#F2F6F0]/40' : 'text-slate-400';
    const accent = darkMode ? 'text-[#C9EA63]' : 'text-emerald-600';

    return (
        <div className="w-full space-y-6 animate-in fade-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <p className={`text-[11px] font-black uppercase tracking-widest ${textMuted}`}>Jefe de Metrología</p>
                    <h1 className={`text-2xl sm:text-3xl font-black ${accent}`}>Bandeja de Asignación</h1>
                    <p className={`text-xs ${textBody} mt-1`}>Distribuye equipos a tu equipo en función de la carga.</p>
                </div>
                <button onClick={cargar} className={`p-2 rounded-lg border ${darkMode ? 'border-[#C9EA63]/20 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`} title="Refrescar">
                    <RefreshCw size={18} className={cargando ? 'animate-spin' : ''} />
                </button>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className={`p-4 rounded-2xl border-l-4 border-amber-500 ${boxBg}`}>
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-widest text-amber-500">Pendientes de asignar</div>
                            <div className={`text-3xl font-black mt-1 ${textTitle}`}>{data.total_pendientes}</div>
                        </div>
                        <Inbox size={28} className="text-amber-500/40" />
                    </div>
                </div>
                <div className={`p-4 rounded-2xl border-l-4 border-emerald-500 ${boxBg}`}>
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Activos en operación</div>
                            <div className={`text-3xl font-black mt-1 ${textTitle}`}>{data.total_activos}</div>
                        </div>
                        <Activity size={28} className="text-emerald-500/40" />
                    </div>
                </div>
                <div className={`p-4 rounded-2xl border-l-4 border-sky-500 ${boxBg}`}>
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-widest text-sky-500">Metrólogos disponibles</div>
                            <div className={`text-3xl font-black mt-1 ${textTitle}`}>{carga.length}</div>
                        </div>
                        <Users size={28} className="text-sky-500/40" />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Lista de pendientes */}
                <div className={`lg:col-span-2 p-6 rounded-2xl border ${boxBg} space-y-4`}>
                    <div className="flex items-center justify-between gap-3">
                        <h3 className={`text-lg font-black ${textTitle}`}>Equipos por asignar</h3>
                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${darkMode ? 'bg-[#1b2b10] border-[#C9EA63]/20' : 'bg-slate-50 border-slate-200'}`}>
                            <Search size={14} className={textMuted} />
                            <input
                                type="text"
                                value={busqueda}
                                onChange={e => setBusqueda(e.target.value)}
                                placeholder="Buscar OS, equipo, empresa, área..."
                                className={`bg-transparent outline-none text-xs w-full sm:w-64 ${textTitle}`}
                            />
                        </div>
                    </div>

                    {pendientesFiltrados.length === 0 ? (
                        <div className={`p-8 text-center rounded-xl border-2 border-dashed ${darkMode ? 'border-[#C9EA63]/15' : 'border-slate-200'}`}>
                            <CheckCircle size={32} className="mx-auto mb-2 text-emerald-500/60" />
                            <p className={`text-sm font-bold ${textTitle}`}>No hay equipos pendientes de asignar</p>
                            <p className={`text-xs mt-1 ${textMuted}`}>Cuando recepción registre nuevos equipos aparecerán aquí.</p>
                        </div>
                    ) : (
                        <div className="space-y-2 max-h-[600px] overflow-y-auto custom-scrollbar pr-1">
                            {pendientesFiltrados.map(eq => (
                                <button
                                    key={eq.id}
                                    onClick={() => abrirAsignacion(eq)}
                                    className={`w-full text-left p-3 rounded-xl border transition-all hover:shadow-md flex items-center gap-3 ${cardBg}`}
                                >
                                    <div className={`p-2 rounded-lg ${darkMode ? 'bg-[#141f0b] text-amber-400' : 'bg-amber-50 text-amber-600'}`}>
                                        <Tag size={16} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <p className={`text-sm font-bold truncate ${textTitle}`}>{eq.nombre_instrumento}</p>
                                            {eq.area_laboratorio && (
                                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${darkMode ? 'bg-[#C9EA63]/20 text-[#C9EA63]' : 'bg-emerald-100 text-emerald-700'}`}>
                                                    {eq.area_laboratorio}
                                                </span>
                                            )}
                                            {badgeSLA(eq.slaRestante, darkMode)}
                                        </div>
                                        <div className={`text-[11px] flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-0.5 ${textMuted}`}>
                                            <span className="flex items-center gap-1"><Building2 size={11}/> {eq.empresa || '—'}</span>
                                            <span className="flex items-center gap-1"><FileText size={11}/> OC {eq.orden_cotizacion || '—'}</span>
                                            <span className="flex items-center gap-1"><Calendar size={11}/> {eq.sla_fecha_base || '—'}</span>
                                        </div>
                                    </div>
                                    <UserPlus size={16} className={accent}/>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Carga por metrólogo */}
                <div className={`p-6 rounded-2xl border ${boxBg} space-y-3`}>
                    <h3 className={`text-lg font-black ${textTitle}`}>Carga del equipo</h3>
                    <p className={`text-xs ${textMuted}`}>Equipos activos por persona. Más bajo = mejor para asignar.</p>
                    {carga.length === 0 ? (
                        <p className={`text-xs italic ${textMuted}`}>No hay metrólogos registrados.</p>
                    ) : (
                        <div className="space-y-2">
                            {carga.map(c => (
                                <div key={c.id} className={`p-3 rounded-xl border ${cardBg}`}>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className={`text-sm font-bold ${textTitle}`}>{c.nombre}</p>
                                            <p className={`text-[10px] ${textMuted}`}>{c.area || 'Sin área'}</p>
                                        </div>
                                        <div className={`text-2xl font-black ${textTitle}`}>{c.total_asignados || 0}</div>
                                    </div>
                                    <div className="mt-2 flex items-center gap-2 text-[10px] font-bold">
                                        <span className="text-amber-500">En proceso: {c.en_proceso || 0}</span>
                                        <span className="text-emerald-500">Terminados: {c.terminados || 0}</span>
                                        {c.en_correccion > 0 && <span className="text-rose-500">Corrección: {c.en_correccion}</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Modal de asignación */}
            {equipoModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in">
                    <div className={`w-full max-w-2xl rounded-3xl shadow-2xl border flex flex-col max-h-[90vh] ${boxBg}`}>
                        <div className={`p-5 border-b flex items-start justify-between gap-3 ${darkMode ? 'border-[#C9EA63]/15' : 'border-slate-200'}`}>
                            <div className="min-w-0">
                                <p className={`text-[10px] font-black uppercase tracking-widest ${textMuted}`}>Asignar metrólogos</p>
                                <h3 className={`text-lg font-black ${textTitle} truncate`}>{equipoModal.nombre_instrumento}</h3>
                                <div className={`text-[11px] flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-1 ${textMuted}`}>
                                    <span>OC {equipoModal.orden_cotizacion}</span>
                                    <span>{equipoModal.empresa}</span>
                                    {equipoModal.area_laboratorio && <span className={accent}>Área: {equipoModal.area_laboratorio}</span>}
                                    {badgeSLA(equipoModal.slaRestante, darkMode)}
                                </div>
                            </div>
                            <button onClick={() => setEquipoModal(null)} className={`p-2 rounded-lg ${darkMode ? 'hover:bg-white/5' : 'hover:bg-slate-100'}`}>
                                <X size={18} />
                            </button>
                        </div>

                        <div className="p-5 overflow-y-auto custom-scrollbar flex-1">
                            <p className={`text-xs ${textBody} mb-3`}>
                                Selecciona uno o varios metrólogos. Los del área <b>{equipoModal.area_laboratorio || '—'}</b> aparecen primero.
                            </p>
                            <div className="space-y-2">
                                {metrologosArea.map(m => {
                                    const checked = seleccionados.includes(m.id);
                                    const esArea = (m.area || '').toLowerCase() === (equipoModal.area_laboratorio || '').toLowerCase();
                                    return (
                                        <button
                                            key={m.id}
                                            type="button"
                                            onClick={() => toggleMetrologo(m.id)}
                                            className={`w-full text-left p-3 rounded-xl border flex items-center gap-3 transition-all ${checked ? (darkMode ? 'bg-[#C9EA63]/15 border-[#C9EA63]' : 'bg-emerald-50 border-emerald-400') : cardBg}`}
                                        >
                                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${checked ? (darkMode ? 'bg-[#C9EA63] border-[#C9EA63]' : 'bg-emerald-600 border-emerald-600') : (darkMode ? 'border-[#C9EA63]/40' : 'border-slate-300')}`}>
                                                {checked && <CheckCircle size={10} className="text-[#141f0b]" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-sm font-bold ${textTitle}`}>{m.nombre}</p>
                                                <p className={`text-[10px] ${textMuted}`}>
                                                    {m.area || 'Sin área'}{esArea && <span className={`ml-2 ${accent}`}>· del área</span>}
                                                </p>
                                            </div>
                                            <div className={`text-[10px] font-black px-2 py-0.5 rounded ${darkMode ? 'bg-[#141f0b]' : 'bg-white'} ${textBody}`}>
                                                {m.total_asignados || 0} en curso
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className={`p-4 border-t flex gap-2 ${darkMode ? 'border-[#C9EA63]/15' : 'border-slate-200'}`}>
                            <button onClick={() => setEquipoModal(null)} className={`flex-1 py-2.5 rounded-xl font-bold text-sm ${darkMode ? 'bg-[#1b2b10] text-[#F2F6F0]/70 hover:bg-[#253916]' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                Cancelar
                            </button>
                            <button
                                onClick={guardarAsignacion}
                                disabled={seleccionados.length === 0 || guardando}
                                className={`flex-[2] py-2.5 rounded-xl font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${darkMode ? 'bg-[#C9EA63] text-[#141f0b] hover:bg-[#b0d14b]' : 'bg-[#008a5e] text-white hover:bg-[#007b55]'}`}
                            >
                                {guardando ? 'Guardando...' : <>Asignar a {seleccionados.length} {seleccionados.length === 1 ? 'metrólogo' : 'metrólogos'} <ChevronRight size={14}/></>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BandejaAsignacion;
