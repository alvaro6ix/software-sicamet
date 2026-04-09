import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Package, Clock, FileCheck, CheckCircle, Truck, AlertTriangle, X, Calendar, Hash, User, Info, Tag, BookOpen, ChevronRight, Check, Circle, ChevronDown } from 'lucide-react';

const columnasEstatus = [
    { id: 'Recepción', icono: Package, color: 'text-indigo-500', bg: 'bg-indigo-500/10', border: 'border-indigo-500' },
    { id: 'Laboratorio', icono: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500' },
    { id: 'Aseguramiento', icono: AlertTriangle, color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500' },
    { id: 'Certificación', icono: FileCheck, color: 'text-purple-500', bg: 'bg-purple-500/10', border: 'border-purple-500' },
    { id: 'Listo', icono: CheckCircle, color: '#008a5e', bg: 'bg-emerald-500/10', border: 'border-emerald-500' },
    { id: 'Entregado', icono: Truck, color: 'text-gray-500', bg: 'bg-gray-500/10', border: 'border-gray-500' }
];

const TableroKanban = ({ darkMode }) => {
    const navigate = useNavigate();
    const [equipos, setEquipos] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [modalDetalle, setModalDetalle] = useState(false);
    const [equipoDetalle, setEquipoDetalle] = useState(null);
    const [gruposExpandidos, setGruposExpandidos] = useState(new Set());
    const [seleccionados, setSeleccionados] = useState([]);

    const toggleSeleccion = (id) => {
        setSeleccionados(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const seleccionarOC = (oc) => {
        const itemsOC = equipos.filter(e => (e.orden_cotizacion || e.folio_rastreo) === oc).map(e => e.id);
        const yaSeleccionados = itemsOC.every(id => seleccionados.includes(id));
        if (yaSeleccionados) {
            setSeleccionados(prev => prev.filter(id => !itemsOC.includes(id)));
        } else {
            setSeleccionados(prev => [...new Set([...prev, ...itemsOC])]);
        }
    };

    const toggleGrupo = (oc) => {
        const next = new Set(gruposExpandidos);
        if (next.has(oc)) next.delete(oc);
        else next.add(oc);
        setGruposExpandidos(next);
    };

    // Detectar rol para modo lectura
    const userRaw = localStorage.getItem('crm_usuario');
    let userRol = 'recepcionista';
    try { userRol = JSON.parse(userRaw)?.rol || 'recepcionista'; } catch(_) {}
    const puedeModificarEstatus = ['admin', 'aseguramiento', 'validacion'].includes(userRol);
    const esSoloLectura = !puedeModificarEstatus;

    const fetchEquipos = async () => {
        try {
            const res = await axios.get('/api/instrumentos');
            setEquipos(res.data);
            setCargando(false);
        } catch (error) {
            console.error("Error al obtener equipos", error);
            setCargando(false);
        }
    };

    useEffect(() => {
        fetchEquipos();
        window.addEventListener('crm:refresh', fetchEquipos);
        return () => window.removeEventListener('crm:refresh', fetchEquipos);
    }, []);

    // Cálculo de totales globales por OC para el sistema de agrupación inteligente
    const globalOCCounts = {};
    equipos.forEach(eq => {
        const oc = eq.orden_cotizacion || 'S/N';
        globalOCCounts[oc] = (globalOCCounts[oc] || 0) + 1;
    });

    const onDragStart = (e, equipo) => {
        if (esSoloLectura) { e.preventDefault(); return; }
        e.dataTransfer.setData('equipoId', equipo.id);
        e.dataTransfer.effectAllowed = "move";
    };

    const onDrop = async (e, estatusDestino) => {
        e.preventDefault();
        if (esSoloLectura) return;
        const equipoId = e.dataTransfer.getData('equipoId');
        if (!equipoId) return;

        // Actualizamos estado optimista
        const equiposActualizados = equipos.map(eq => {
            if (eq.id.toString() === equipoId) {
                return { ...eq, estatus_actual: estatusDestino };
            }
            return eq;
        });
        setEquipos(equiposActualizados);
        if (equipoDetalle && equipoDetalle.id.toString() === equipoId) {
            setEquipoDetalle({ ...equipoDetalle, estatus_actual: estatusDestino });
        }

        // Llamada API
        try {
            await axios.put(`/api/instrumentos/${equipoId}/estatus`, { estatus: estatusDestino });
        } catch (error) {
            console.error("Error al mover equipo", error);
            fetchEquipos(); // Revertir en caso de error
        }
    };

    const onDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };

    const textTitle = darkMode ? 'text-[#C9EA63]' : 'text-[#253916]';
    const textBody = darkMode ? 'text-[#F2F6F0]/70' : 'text-[#253916]/70';

    const getOsaColor = (osStr, isDark) => {
        if (!osStr) return isDark ? '#2a401c' : '#ffffff';
        let hash = 0;
        for (let i = 0; i < osStr.length; i++) {
            hash = osStr.charCodeAt(i) + ((hash << 5) - hash);
        }
        const hue = Math.abs(hash) % 360;
        return isDark ? `hsl(${hue}, 40%, 20%)` : `hsl(${hue}, 70%, 95%)`;
    };

    const getTipoLabel = (oc = '') => {
        if (oc.startsWith('C')) return 'COTIZACIÓN';
        if (oc.startsWith('O')) return 'ORDEN DE SERVICIO';
        return 'ORDEN';
    };

    if (cargando) return <div className="p-8 text-center">Cargando tablero...</div>;

    return (
        <div className="w-full h-[calc(100vh-6rem)] flex flex-col">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 border-b pb-6 border-opacity-20 border-[#C9EA63] shrink-0">
                <div>
                    <h2 className={`text-2xl md:text-3xl font-bold flex items-center gap-3 ${textTitle}`}>
                        <Package className={darkMode ? 'text-[#C9EA63]' : 'text-[#008a5e]'} size={32} />
                        Pipeline de Calibración
                    </h2>
                    <p className={`mt-1 md:mt-2 text-xs md:text-sm ${textBody}`}>
                        {esSoloLectura
                            ? '🔒 Modo lectura — Solo Aseguramiento puede cambiar estatus de equipos.'
                            : 'Arrastra las tarjetas para cambiar el estado operativo en tiempo real.'}
                    </p>
                </div>
                {esSoloLectura && (
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold ${darkMode ? 'bg-rose-900/30 text-rose-400 border border-rose-500/30' : 'bg-rose-50 text-rose-600 border border-rose-200'}`}>
                        <Info size={14} /> Solo lectura
                    </div>
                )}
            </header>

            <div className={`flex-1 min-h-0 flex overflow-x-auto overflow-y-hidden snap-x snap-mandatory gap-3 lg:gap-4 pb-2 h-full custom-scrollbar`}>
                {columnasEstatus.map(columna => {
                    const equiposColumna = equipos.filter(e => e.estatus_actual === columna.id || 
                        (columna.id === 'Certificación' && e.estatus_actual === 'Certificación o Papelería')); // Fallback si el nombre estatus es ligeramente diferente
                    
                    return (
                        <div 
                            key={columna.id}
                            className={`flex flex-col shrink-0 w-[85vw] sm:w-[320px] lg:w-full lg:max-w-[320px] min-w-[260px] lg:flex-1 min-h-0 h-full rounded-2xl border transition-colors snap-center ${darkMode ? 'border-[#C9EA63]/20 bg-[#1b2b10]/40' : 'border-slate-200 bg-slate-50/50'}`}
                            onDrop={esSoloLectura ? undefined : (e) => onDrop(e, columna.id)}
                            onDragOver={esSoloLectura ? undefined : onDragOver}
                        >
                            {/* Cabecera Columna */}
                            <div className={`p-4 border-b flex items-center justify-between ${darkMode ? 'border-[#C9EA63]/10' : 'border-slate-200'} ${columna.bg} rounded-t-2xl`}>
                                <div className={`flex items-center gap-2 font-bold ${columna.color}`}>
                                    <columna.icono size={18} />
                                    <h3 className="whitespace-nowrap">{columna.id}</h3>
                                </div>
                                <span className={`text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-full ${darkMode ? 'bg-[#141f0b] text-[#F2F6F0]' : 'bg-white text-slate-800'}`}>
                                    {equiposColumna.length}
                                </span>
                            </div>

                            {/* Tarjetas */}
                            {/* Tarjetas Grupedas */}
                            <div className="flex-1 min-h-0 p-3 overflow-y-auto space-y-3 custom-scrollbar">
                                {(() => {
                                    // Agrupar por OC
                                    const grouped = {};
                                    equiposColumna.forEach(eq => {
                                        const oc = eq.orden_cotizacion || 'S/N';
                                        if (!grouped[oc]) grouped[oc] = [];
                                        grouped[oc].push(eq);
                                    });

                                    return Object.entries(grouped).map(([oc, items]) => {
                                        const globalTotal = globalOCCounts[oc] || 0;
                                        const isLarge = globalTotal >= 5;
                                        
                                        if (isLarge) {
                                            return (
                                                <div 
                                                    key={`group-${oc}`}
                                                    onClick={() => navigate(`/equipos/grupo/${oc}`)}
                                                    className={`p-4 rounded-xl shadow-md border-2 border-dashed cursor-pointer transition-all hover:scale-[1.02] flex items-center justify-between ${darkMode ? 'bg-[#253916] border-[#C9EA63]/40 text-[#F2F6F0]' : 'bg-emerald-50 border-emerald-200 text-[#008a5e]'}`}
                                                    style={{ borderLeft: `6px solid ${getOsaColor(oc, darkMode)}` }}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className={`p-2 rounded-lg ${darkMode ? 'bg-[#141f0b]' : 'bg-white shadow-sm'}`}>
                                                            <Package size={20} className="text-emerald-500" />
                                                        </div>
                                                        <div>
                                                            <p className="text-[10px] font-black uppercase tracking-widest opacity-60">
                                                                {getTipoLabel(oc)}
                                                            </p>
                                                            <p className="text-sm font-bold">{oc}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <div 
                                                            onClick={(e) => { e.stopPropagation(); seleccionarOC(oc); }}
                                                            className={`p-1.5 rounded-lg border transition-all ${items.every(i => seleccionados?.includes(i.id)) ? (darkMode ? 'bg-[#C9EA63] border-[#C9EA63] text-[#141f0b]' : 'bg-[#008a5e] border-[#007b55] text-white') : (darkMode ? 'bg-[#141f0b] border-[#C9EA63]/30 text-[#C9EA63]' : 'bg-white border-slate-300 text-slate-400')}`}
                                                            title="Seleccionar toda la orden"
                                                        >
                                                            {items.every(i => seleccionados?.includes(i.id)) ? <Check size={14} /> : <Circle size={14} />}
                                                        </div>
                                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${darkMode ? 'bg-[#C9EA63] text-[#141f0b]' : 'bg-[#008a5e] text-white'}`}>
                                                            {items.length} de {globalTotal}
                                                        </span>
                                                        <ChevronRight size={16} className="opacity-40" />
                                                    </div>
                                                </div>
                                            );
                                        }

                                        return (
                                            <div key={`container-${oc}`} className="space-y-3">
                                                {isLarge && (
                                                    <div 
                                                        onClick={() => toggleGrupo(oc)}
                                                        className={`flex items-center justify-between px-3 py-1 cursor-pointer opacity-60 hover:opacity-100 transition-opacity ${darkMode ? 'text-[#C9EA63]' : 'text-emerald-700'}`}
                                                    >
                                                        <span className="text-[10px] font-black">OC: {oc} ({items.length} equipos cargados)</span>
                                                        <div className="flex items-center gap-3">
                                                            <div 
                                                                onClick={(e) => { e.stopPropagation(); seleccionarOC(oc); }}
                                                                className={`p-1 rounded border transition-all ${items.every(i => seleccionados?.includes(i.id)) ? (darkMode ? 'bg-[#C9EA63] border-[#C9EA63] text-[#141f0b]' : 'bg-[#008a5e] border-[#007b55] text-white') : (darkMode ? 'bg-transparent border-current opacity-30 text-current' : 'bg-white border-slate-300 text-slate-400')}`}
                                                                title="Seleccionar todo el grupo"
                                                            >
                                                                {items.every(i => seleccionados?.includes(i.id)) ? <Check size={10} /> : <Circle size={10} />}
                                                            </div>
                                                            <X size={14} />
                                                        </div>
                                                    </div>
                                                )}
                                                {items.map((equipo, idx) => (
                                                    <div 
                                                        key={equipo.id}
                                                        draggable={!esSoloLectura}
                                                        onDragStart={(e) => onDragStart(e, equipo)}
                                                        onClick={() => { setEquipoDetalle(equipo); setModalDetalle(true); }}
                                                        style={{ backgroundColor: getOsaColor(equipo.orden_cotizacion, darkMode) }}
                                                        className={`p-4 rounded-xl shadow-sm border transition-all relative overflow-hidden group ${esSoloLectura ? 'cursor-pointer' : 'cursor-grab hover:cursor-grab'} hover:shadow-md ${darkMode ? 'border-[#C9EA63]/20 hover:brightness-125' : 'border-slate-200 hover:brightness-95'}`}
                                                    >
                                                        {/* Numeración de Partida */}
                                                        <div className={`absolute top-2 right-2 text-[10px] font-black opacity-20 group-hover:opacity-60 transition-opacity ${darkMode ? 'text-white' : 'text-black'}`}>
                                                            #{idx + 1}
                                                        </div>

                                                        <div className={`absolute top-0 left-0 w-1 rounded-l-xl h-full ${columna.bg.split('/')[0]}`} />
                                                        <div className="flex items-center justify-between mb-2">
                                                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded leading-none ${
                                                                equipo.orden_cotizacion?.startsWith('O') 
                                                                ? (darkMode ? 'bg-emerald-500/20 text-emerald-400' : 'bg-[#008a5e]/10 text-[#008a5e]')
                                                                : (darkMode ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700')
                                                            }`}>
                                                                {equipo.orden_cotizacion?.startsWith('O') ? 'Orden de Servicio' : 'Cotización'}
                                                            </span>
                                                            <span className={`text-[10px] font-mono font-bold ${darkMode ? 'text-[#C9EA63]/70' : 'text-[#008a5e]'}`}>{equipo.orden_cotizacion}</span>
                                                        </div>
                                                        <div className="flex justify-between items-start mb-2">
                                                            {equipo.sla <= 2 && (
                                                                <AlertTriangle size={14} className="text-rose-500 animate-pulse" title="Urgente - SLA Crítico" />
                                                            )}
                                                        </div>
                                                        <h4 className={`text-sm font-bold mb-1 truncate ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>{equipo.nombre_instrumento}</h4>
                                                        <p className={`text-[10px] truncate mb-1 ${darkMode ? 'text-[#F2F6F0]/60' : 'text-slate-500'}`}>{equipo.empresa || equipo.persona}</p>
                                                        <div className={`text-[9px] font-bold uppercase tracking-tight mb-2 opacity-50 px-2 py-0.5 rounded border-l-2 ${darkMode ? 'text-[#C9EA63] border-[#C9EA63]/40 bg-[#C9EA63]/5' : 'text-[#008a5e] border-[#008a5e] bg-emerald-50'}`}>
                                                            Área: {equipo.area_laboratorio || 'N/A'}
                                                        </div>
                                                        
                                                        {/* Chips de Metrólogos */}
                                                        <div className="flex flex-wrap gap-1 mt-2">
                                                            {equipo.metrologos_asignados && equipo.metrologos_asignados.map((m, mIdx) => (
                                                                <span key={mIdx} className={`text-[9px] px-2 py-0.5 rounded-full font-bold border transition-colors ${m.estatus === 'terminado' ? (darkMode ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-emerald-100 text-emerald-700 border-emerald-200') : (darkMode ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 'bg-amber-50 text-amber-600 border-amber-100')}`} title={m.estatus}>
                                                                    {m.nombre.split(' ')[0]} {m.estatus === 'terminado' ? '✓' : '...'}
                                                                </span>
                                                            ))}
                                                        </div>
                                                        
                                                        <div className={`mt-3 pt-3 border-t flex justify-between items-center ${darkMode ? 'border-[#C9EA63]/10' : 'border-slate-100'}`}>
                                                            <div className="text-[10px] font-medium opacity-60">
                                                                SLA: {equipo.sla ? `${equipo.sla - Math.floor((new Date() - new Date(equipo.fecha_ingreso)) / (1000*60*60*24))} d restantes` : 'N/A'}
                                                            </div>
                                                            <div className="text-[10px] font-medium opacity-70 border px-2 py-0.5 rounded-md">{equipo.identificacion || equipo.no_serie || 'N/A'}</div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        );
                                    });
                                })()}
                                {equiposColumna.length === 0 && (
                                    <div className={`text-center p-4 text-xs italic opacity-50 ${textBody}`}>
                                        Arrastra equipos aquí
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Modal de Detalle */}
            {modalDetalle && equipoDetalle && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className={`w-full max-w-2xl max-h-[95vh] rounded-3xl shadow-2xl overflow-hidden border flex flex-col transition-all transform scale-100 ${darkMode ? 'bg-[#141f0b] border-[#C9EA63]/20' : 'bg-white border-slate-200'}`}>
                        {/* Cabecera Modal */}
                        <div className={`p-4 sm:p-6 flex justify-between items-center border-b shrink-0 ${darkMode ? 'bg-[#253916] border-[#C9EA63]/10' : 'bg-slate-50 border-slate-100'}`}>
                            <div className="flex items-center gap-3">
                                <div className={`p-2 sm:p-3 rounded-2xl ${darkMode ? 'bg-[#141f0b] text-[#C9EA63]' : 'bg-white text-[#008a5e] shadow-sm'}`}>
                                    <Package size={20} className="sm:w-6 sm:h-6" />
                                </div>
                                <div className="flex flex-col">
                                    <h2 className={`text-lg sm:text-xl font-black leading-tight ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>{equipoDetalle.nombre_instrumento}</h2>
                                    <p className={`text-[10px] sm:text-xs font-bold uppercase tracking-widest ${darkMode ? 'text-[#C9EA63]/70' : 'text-[#008a5e]'}`}>{equipoDetalle.orden_cotizacion}</p>
                                </div>
                            </div>
                            <button onClick={() => setModalDetalle(false)} className={`p-2 rounded-xl transition-colors ${darkMode ? 'hover:bg-[#141f0b] text-[#F2F6F0]/60' : 'hover:bg-slate-200 text-slate-400'}`}>
                                <X size={24} />
                            </button>
                        </div>

                        {/* Contenido Modal Scrollable */}
                        <div className="p-4 sm:p-8 overflow-y-auto custom-scrollbar flex-1">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
                                <div className="space-y-6">
                                    <section>
                                        <h4 className={`text-[10px] font-black uppercase tracking-widest mb-3 opacity-50 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Datos del Equipo</h4>
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-3 text-sm">
                                                <Tag size={16} className="opacity-40" />
                                                <span className="font-bold w-20">Marca:</span>
                                                <span className="opacity-80">{equipoDetalle.marca || 'N/A'}</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-sm">
                                                <BookOpen size={16} className="opacity-40" />
                                                <span className="font-bold w-20">Modelo:</span>
                                                <span className="opacity-80">{equipoDetalle.modelo || 'N/A'}</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-sm">
                                                <Hash size={16} className="opacity-40" />
                                                <span className="font-bold w-24">Serie:</span>
                                                <span className="opacity-80 font-mono text-[11px]">{equipoDetalle.no_serie || 'N/A'}</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-sm">
                                                <Tag size={16} className="opacity-40" />
                                                <span className="font-bold w-24">ID:</span>
                                                <span className="opacity-80 font-mono text-[11px]">{equipoDetalle.identificacion || 'N/A'}</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-sm">
                                                <Package size={16} className="opacity-40" />
                                                <span className="font-bold w-24">Ubicación:</span>
                                                <span className="opacity-80">{equipoDetalle.ubicacion || 'N/A'}</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-sm">
                                                <FileCheck size={16} className={`opacity-40 ${darkMode ? 'text-[#C9EA63]' : 'text-[#008a5e]'}`} />
                                                <span className="font-bold w-24">Área Lab:</span>
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-black tracking-wider uppercase ${darkMode ? 'bg-[#253916] text-[#C9EA63]' : 'bg-emerald-50 text-[#008a5e]'}`}>
                                                    {equipoDetalle.area_laboratorio || 'No definida'}
                                                </span>
                                            </div>
                                        </div>
                                    </section>

                                    <section>
                                        <h4 className={`text-[10px] font-black uppercase tracking-widest mb-3 opacity-50 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Metrólogos Asignados</h4>
                                        <div className="flex flex-wrap gap-2">
                                            {equipoDetalle.metrologos_asignados?.length ? equipoDetalle.metrologos_asignados.map((m, idx) => (
                                                <div key={idx} className={`px-3 py-2 rounded-xl border flex items-center gap-2 transition-all ${m.estatus === 'terminado' ? (darkMode ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-700') : (darkMode ? 'bg-amber-500/10 border-amber-500/30 text-amber-500' : 'bg-amber-50 border-amber-200 text-amber-700')}`}>
                                                    <span className="text-xs font-bold">{m.nombre}</span>
                                                    {m.estatus === 'terminado' ? <CheckCircle size={14} /> : <Clock size={14} className="animate-pulse" />}
                                                </div>
                                            )) : <span className="text-xs opacity-40 italic">Sin personal asignado</span>}
                                        </div>
                                    </section>

                                    <section>
                                        <h4 className={`text-[10px] font-black uppercase tracking-widest mb-3 opacity-50 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Cliente & Servicio</h4>
                                        <div className="space-y-3">
                                        <div className="flex items-start gap-3 text-sm">
                                                <User size={16} className="opacity-40 mt-1" />
                                                <div className="flex flex-col">
                                                <span className="font-bold text-sm">{equipoDetalle.empresa}</span>
                                                <span className="text-xs opacity-60">{equipoDetalle.persona || 'Sin contacto'}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </section>

                                    <section>
                                        <h4 className={`text-[10px] font-black uppercase tracking-widest mb-3 opacity-50 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Requerimientos & Puntos</h4>
                                        <div className="space-y-4">
                                            <div className={`p-3 rounded-xl border text-xs ${darkMode ? 'bg-[#141f0b] border-[#C9EA63]/10 text-[#F2F6F0]' : 'bg-slate-50 border-slate-100'}`}>
                                                <span className="font-black opacity-40 block mb-1">Requerimientos:</span>
                                                {equipoDetalle.requerimientos_especiales || 'No indicados'}
                                            </div>
                                            <div className={`p-3 rounded-xl border text-xs ${darkMode ? 'bg-[#141f0b] border-[#C9EA63]/10 text-[#F2F6F0]' : 'bg-slate-50 border-slate-100'}`}>
                                                <span className="font-black opacity-40 block mb-1">Puntos a Calibrar:</span>
                                                {equipoDetalle.puntos_calibrar || 'No indicados'}
                                            </div>
                                        </div>
                                    </section>
                                </div>

                                <div className="space-y-6">
                                    <div className={`p-5 sm:p-6 rounded-3xl border ${darkMode ? 'bg-[#1b2b10] border-[#C9EA63]/10' : 'bg-slate-50 border-slate-100'}`}>
                                        <h4 className="text-[10px] font-black uppercase tracking-widest mb-4 opacity-50">Tiempos y Estatus</h4>
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-2 text-sm">
                                                    <Calendar size={16} className="opacity-40" />
                                                    <span>Registro:</span>
                                                </div>
                                                <span className="font-bold text-sm">
                                                    {new Date(equipoDetalle.fecha_ingreso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-2 text-sm">
                                                    <Clock size={16} className="opacity-40" />
                                                    <span>SLA:</span>
                                                </div>
                                                <span className={`font-black text-sm ${equipoDetalle.sla <= 2 ? 'text-rose-500' : ''}`}>{equipoDetalle.sla} d</span>
                                            </div>
                                            <div className="pt-4 border-t border-inherit">
                                                {puedeModificarEstatus ? (
                                                    <>
                                                        <div className="text-[10px] uppercase font-black tracking-widest mb-2 opacity-50 text-center">Cambiar Estado Operativo</div>
                                                        <select 
                                                            value={equipoDetalle.estatus_actual}
                                                            onChange={(e) => onDrop({ preventDefault: () => {}, dataTransfer: { getData: () => equipoDetalle.id.toString() } }, e.target.value)}
                                                            className={`w-full text-center font-black py-2.5 rounded-xl text-xs appearance-none cursor-pointer transition-all border outline-none shadow-sm ${darkMode ? 'bg-[#141f0b] border-[#C9EA63]/30 text-[#C9EA63] hover:border-[#C9EA63]' : 'bg-white border-emerald-200 text-[#008a5e] hover:border-[#008a5e]'}`}
                                                        >
                                                            <option value="Recepción">Recepción</option>
                                                            <option value="Laboratorio">Laboratorio</option>
                                                            <option value="Aseguramiento">Aseguramiento</option>
                                                            <option value="Certificación">Certificación</option>
                                                            <option value="Listo">Listo</option>
                                                            <option value="Entregado">Entregado</option>
                                                        </select>
                                                    </>
                                                ) : (
                                                    <div className={`flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold ${darkMode ? 'bg-[#141f0b] text-[#F2F6F0]/40' : 'bg-slate-100 text-slate-400'}`}>
                                                        <Info size={14} /> Solo Aseguramiento puede cambiar el estatus
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Pie Modal */}
                        <div className={`p-4 sm:p-6 border-t flex justify-end shrink-0 ${darkMode ? 'bg-[#253916] border-[#C9EA63]/10' : 'bg-slate-50 border-slate-100'}`}>
                            <button 
                                onClick={() => setModalDetalle(false)}
                                className={`w-full sm:w-auto px-8 py-3 rounded-2xl font-black text-sm transition-all shadow-lg ${darkMode ? 'bg-[#C9EA63] text-[#141f0b] hover:bg-[#b0d14b]' : 'bg-[#008a5e] text-white hover:bg-[#007b55]'}`}
                            >
                                Entendido
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TableroKanban;
