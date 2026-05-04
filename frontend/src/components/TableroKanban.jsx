import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Package, Clock, FileCheck, CheckCircle, Truck, AlertTriangle, X, Calendar, Hash, User, Info, Tag, BookOpen, ChevronRight, Check, Circle, ChevronDown, FileText, Layers, Square, CheckSquare } from 'lucide-react';

const columnasEstatus = [
    { id: 'Recepción',     areaLider: 'Recepción',     icono: Package,        color: 'text-sky-500',    bg: 'bg-sky-500/10',     border: 'border-sky-500' },
    { id: 'Laboratorio',   areaLider: 'Laboratorio',   icono: Clock,          color: 'text-amber-500',  bg: 'bg-amber-500/10',   border: 'border-amber-500' },
    { id: 'Aseguramiento', areaLider: 'Aseguramiento', icono: AlertTriangle,  color: 'text-blue-500',   bg: 'bg-blue-500/10',    border: 'border-blue-500' },
    { id: 'Certificación', areaLider: 'Certificación', icono: FileCheck,      color: 'text-purple-500', bg: 'bg-purple-500/10',  border: 'border-purple-500' },
    { id: 'Facturación',   areaLider: 'Facturación',   icono: CheckCircle,    color: '#008a5e',         bg: 'bg-emerald-500/10', border: 'border-emerald-500' },
    { id: 'Entregado',     areaLider: 'Entrega',       icono: Truck,          color: 'text-gray-500',   bg: 'bg-gray-500/10',    border: 'border-gray-500' }
];

const TableroKanban = ({ darkMode }) => {
    const navigate = useNavigate();
    const [equipos, setEquipos] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [modalDetalle, setModalDetalle] = useState(false);
    const [equipoDetalle, setEquipoDetalle] = useState(null);
    const [gruposExpandidos, setGruposExpandidos] = useState(new Set());
    const [seleccionados, setSeleccionados] = useState([]);
    const [lideresArea, setLideresArea] = useState({});

    useEffect(() => {
        axios.get('/api/lideres-area')
            .then(res => setLideresArea(res.data || {}))
            .catch(() => setLideresArea({}));
    }, []);

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
    // Metrólogos y aseguramiento: SOLO lectura. No pueden arrastrar ni cambiar estatus.
    const esSoloLectura = ['metrologo', 'operador', 'aseguramiento', 'validacion'].includes(userRol);
    const puedeModificarEstatus = !esSoloLectura;

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

        const equipo = equipos.find(eq => eq.id.toString() === equipoId);
        if (!equipo) return;

        const estatusOrigen = equipo.estatus_actual;

        // Validaciones de Flujo
        let permiteCambio = false;
        
        // Admin y Recepcionista pueden mover casi todo (por ahora respetamos el deseo de profesionalizar incluso para admin si es necesario, pero permitimos ajustes básicos)
        if (userRol === 'admin' || userRol === 'recepcionista') {
            permiteCambio = true;
        } else if (userRol === 'metrologo' || userRol === 'operador') {
            if (estatusOrigen === 'Laboratorio' && estatusDestino === 'Aseguramiento') permiteCambio = true;
        } else if (userRol === 'aseguramiento' || userRol === 'validacion') {
            if (estatusOrigen === 'Aseguramiento' && (estatusDestino === 'Certificación' || estatusDestino === 'Laboratorio')) permiteCambio = true;
        }

        if (!permiteCambio) {
            alert(`No tienes permisos para mover de ${estatusOrigen} a ${estatusDestino} directamente. Usa el flujo formal.`);
            return;
        }

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

    const handleFinalizarMetrologo = async (id) => {
        if (!window.confirm("¿Confirmas que has terminado el trabajo técnico y deseas enviar el equipo a Aseguramiento?")) return;
        try {
            await axios.post(`/api/instrumentos/${id}/finalizar_metrologo`);
            fetchEquipos();
            setModalDetalle(false);
        } catch (error) {
            alert("Error al finalizar metrología");
        }
    };

    const handleAprobarQA = async (id) => {
        try {
            await axios.put(`/api/instrumentos/${id}/estatus`, { estatus: 'Certificación' });
            alert("Equipo aprobado y movido a Certificación");
            fetchEquipos();
            setModalDetalle(false);
        } catch (error) {
            alert("Error al aprobar");
        }
    };

    const handleRechazarQA = async (id) => {
        const motivo = window.prompt("Motivo del rechazo:");
        if (!motivo) return;
        try {
            await axios.post(`/api/instrumentos/${id}/solicitar_correccion`, { motivo });
            alert("Equipo rechazado y regresado a Laboratorio");
            fetchEquipos();
            setModalDetalle(false);
        } catch (error) {
            alert("Error al rechazar");
        }
    };

    const [modalConf, setModalConf] = useState(false);
    const [alertasConf, setAlertasConf] = useState([]);

    const prepararEnvioMasivo = () => {
        const ocsAfectadas = [...new Set(equipos.filter(e => seleccionados.includes(e.id)).map(e => e.orden_cotizacion || 'S/N'))];
        let alertasLocales = [];

        for (const oc of ocsAfectadas) {
            const totalesDoc = equipos.filter(e => (e.orden_cotizacion || 'S/N') === oc);
            const mandadosDoc = equipos.filter(e => (e.orden_cotizacion || 'S/N') === oc && seleccionados.includes(e.id));
            
            if (mandadosDoc.length < totalesDoc.length) {
                const enRec = totalesDoc.filter(e => e.estatus_actual === 'Recepción').length;
                const enVal = totalesDoc.filter(e => e.estatus_actual === 'Validación').length;
                const enLabNoSel = totalesDoc.filter(e => e.estatus_actual === 'Laboratorio' && !seleccionados.includes(e.id)).length;
                const enQA = totalesDoc.filter(e => e.estatus_actual === 'Aseguramiento').length;
                const enCert = totalesDoc.filter(e => e.estatus_actual === 'Certificación').length;
                const enListo = totalesDoc.filter(e => e.estatus_actual === 'Facturación' || e.estatus_actual === 'Entregado').length;
                
                let d = [];
                if (enRec) d.push(`${enRec} en Recepción`);
                if (enVal) d.push(`${enVal} en Validación`);
                if (enLabNoSel) d.push(`${enLabNoSel} aún en Lab (sin marcar)`);
                if (enQA) d.push(`${enQA} ya en Aseguramiento`);
                if (enCert) d.push(`${enCert} en Certificación`);
                if (enListo) d.push(`${enListo} listos/entregados`);

                const rest = d.length > 0 ? ` Estado del resto: ${d.join(', ')}.` : '';
                alertasLocales.push(`OC ${oc}: Estás enviando ${mandadosDoc.length} de ${totalesDoc.length} equipos totales.${rest}`);
            }
        }
        setAlertasConf(alertasLocales);
        setModalConf(true);
    };

    const handleEnviarMasivo = async () => {
        try {
            const promesas = seleccionados.map(id => axios.post(`/api/instrumentos/${id}/finalizar_metrologo`));
            await Promise.all(promesas);
            setSeleccionados([]);
            setModalConf(false);
            fetchEquipos();
        } catch (error) {
            alert("Error al enviar masivamente");
        }
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
                            ? '🔒 Modo lectura — Solo personal autorizado puede cambiar estatus de equipos.'
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
                            <div className={`p-4 border-b ${darkMode ? 'border-[#C9EA63]/10' : 'border-slate-200'} ${columna.bg} rounded-t-2xl`}>
                                <div className="flex items-center justify-between">
                                    <div className={`flex items-center gap-2 font-bold ${columna.color}`}>
                                        <columna.icono size={18} />
                                        <h3 className="whitespace-nowrap">{columna.id}</h3>
                                    </div>
                                    <span className={`text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-full ${darkMode ? 'bg-[#141f0b] text-[#F2F6F0]' : 'bg-white text-slate-800'}`}>
                                        {equiposColumna.length}
                                    </span>
                                </div>
                                {lideresArea[columna.areaLider]?.nombre && (
                                    <div className={`mt-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide ${darkMode ? 'text-[#F2F6F0]/60' : 'text-slate-500'}`}>
                                        <User size={11} />
                                        <span className="truncate" title={lideresArea[columna.areaLider].email}>
                                            {lideresArea[columna.areaLider].nombre}
                                        </span>
                                    </div>
                                )}
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
                                                            <div className="flex gap-2">
                                                                {equipo.estatus_actual === 'Laboratorio' && (
                                                                    <button 
                                                                        onClick={(e) => { e.stopPropagation(); handleFinalizarMetrologo(equipo.id); }}
                                                                        className={`p-1.5 rounded-lg transition-all ${darkMode ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/40' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}
                                                                        title="Finalizar y Enviar a QA"
                                                                    >
                                                                        <Check size={14} />
                                                                    </button>
                                                                )}
                                                                {equipo.estatus_actual === 'Laboratorio' && (
                                                                    <div 
                                                                        onClick={(e) => { e.stopPropagation(); toggleSeleccion(equipo.id); }}
                                                                        className={`p-1.5 rounded-lg border transition-all ${seleccionados.includes(equipo.id) ? (darkMode ? 'bg-[#C9EA63] border-[#C9EA63] text-[#141f0b]' : 'bg-[#008a5e] border-[#007b55] text-white') : (darkMode ? 'bg-white/5 border-white/10 text-[#C9EA63]' : 'bg-white border-slate-200 text-slate-400')}`}
                                                                    >
                                                                        {seleccionados.includes(equipo.id) ? <CheckSquare size={14} /> : <Square size={14} />}
                                                                    </div>
                                                                )}
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

            {/* Modal de Detalle — Expediente del Equipo */}
            {modalDetalle && equipoDetalle && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className={`w-full max-w-5xl max-h-[95vh] overflow-hidden rounded-[2.5rem] shadow-2xl border flex flex-col transition-all transform scale-100 ${darkMode ? 'bg-[#141f0b] border-[#C9EA63]/20' : 'bg-white border-slate-200'}`}>
                        {/* Cabecera Modal */}
                        <div className={`p-6 border-b flex items-center justify-between shrink-0 ${darkMode ? 'border-white/5' : 'border-slate-100'}`}>
                            <div className="flex items-center gap-3">
                                <div className={`p-3 rounded-2xl ${darkMode ? 'bg-[#C9EA63] text-black' : 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'}`}>
                                    <FileText size={20} />
                                </div>
                                <div>
                                    <h2 className={`text-xl font-black uppercase tracking-tight ${darkMode ? 'text-white' : 'text-slate-800'}`}>Expediente del Equipo</h2>
                                    <p className="text-[10px] font-bold opacity-40 uppercase tracking-widest">Detalle técnico e historial de orden</p>
                                </div>
                            </div>
                            <button onClick={() => setModalDetalle(false)} className="opacity-40 hover:opacity-100 transition-all hover:rotate-90"><X size={24} /></button>
                        </div>

                        {/* Contenido Modal Scrollable */}
                        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                {/* COLUMNA IZQUIERDA */}
                                <div className="space-y-6">
                                    {/* Orden prominente */}
                                    <section>
                                        <h4 className={`text-[10px] font-black uppercase tracking-widest mb-4 opacity-50 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Identificación Base</h4>
                                        <div className={`p-6 rounded-[2rem] border ${darkMode ? 'bg-[#C9EA63]/5 border-[#C9EA63]/20' : 'bg-emerald-50 border-emerald-100'}`}>
                                            <div className="space-y-1">
                                                <label className="text-[9px] font-black uppercase opacity-40 ml-1">Referencia / Orden</label>
                                                <p className={`text-3xl font-black tracking-tighter ${darkMode ? 'text-[#C9EA63]' : 'text-emerald-500'}`}>
                                                    {equipoDetalle.orden_cotizacion || equipoDetalle.folio_rastreo}
                                                </p>
                                            </div>
                                        </div>
                                    </section>

                                    {/* Datos del Instrumento */}
                                    <section>
                                        <h4 className={`text-[10px] font-black uppercase tracking-widest mb-4 opacity-50 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Datos del Instrumento</h4>
                                        <div className="grid grid-cols-2 gap-4">
                                            {equipoDetalle.clave && (
                                                <div className={`p-4 rounded-2xl border ${darkMode ? 'bg-[#C9EA63]/5 border-[#C9EA63]/10' : 'bg-emerald-50 border-emerald-100'}`}>
                                                    <p className="text-[9px] font-black uppercase opacity-40 mb-1">Clave</p>
                                                    <p className="text-sm font-black font-mono uppercase">{equipoDetalle.clave}</p>
                                                </div>
                                            )}
                                            <div className={`p-4 rounded-2xl border ${darkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
                                                <p className="text-[9px] font-black uppercase opacity-40 mb-1">Nombre / Equipo</p>
                                                <p className="text-xs font-bold uppercase">{equipoDetalle.nombre_instrumento}</p>
                                            </div>
                                            {equipoDetalle.no_certificado && (
                                                <div className={`p-4 rounded-2xl border ${darkMode ? 'bg-[#C9EA63]/5 border-[#C9EA63]/10' : 'bg-emerald-50 border-emerald-100'}`}>
                                                    <p className="text-[9px] font-black uppercase opacity-40 mb-1">No. Certificado</p>
                                                    <p className="text-sm font-black font-mono uppercase">{equipoDetalle.no_certificado}</p>
                                                </div>
                                            )}
                                            <div className={`p-4 rounded-2xl border ${darkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
                                                <p className="text-[9px] font-black uppercase opacity-40 mb-1">Marca / Modelo</p>
                                                <p className="text-xs font-bold uppercase">{equipoDetalle.marca || 'N/A'} {equipoDetalle.modelo ? `/ ${equipoDetalle.modelo}` : ''}</p>
                                            </div>
                                            <div className={`p-4 rounded-2xl border ${darkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
                                                <p className="text-[9px] font-black uppercase opacity-40 mb-1">No. Serie</p>
                                                <p className="text-xs font-bold font-mono uppercase">{equipoDetalle.no_serie || 'S/N'}</p>
                                            </div>
                                            <div className={`p-4 rounded-2xl border ${darkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
                                                <p className="text-[9px] font-black uppercase opacity-40 mb-1">ID / Ubicación</p>
                                                <p className="text-xs font-bold uppercase">{equipoDetalle.identificacion || 'N/A'} | {equipoDetalle.ubicacion || 'ALMACÉN'}</p>
                                            </div>
                                            {equipoDetalle.intervalo_calibracion && equipoDetalle.intervalo_calibracion !== 'No especificado' && (
                                                <div className={`col-span-2 p-4 rounded-2xl border ${darkMode ? 'bg-blue-950/20 border-blue-500/20' : 'bg-blue-50 border-blue-200'}`}>
                                                    <p className="text-[9px] font-black uppercase opacity-40 mb-1">Intervalo de Calibración</p>
                                                    <p className="text-xs font-bold">{equipoDetalle.intervalo_calibracion}</p>
                                                </div>
                                            )}
                                        </div>
                                    </section>

                                    {/* Asignación y Metrología */}
                                    <section>
                                        <h4 className={`text-[10px] font-black uppercase tracking-widest mb-4 opacity-50 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Asignación y Metrología</h4>
                                        <div className={`p-5 rounded-3xl border flex flex-col gap-4 ${darkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
                                            <div className="flex justify-between items-center text-xs">
                                                <span className="opacity-50 font-bold uppercase">Laboratorio:</span>
                                                <span className={`px-2 py-0.5 rounded font-black border ${darkMode ? 'bg-[#C9EA63]/10 border-[#C9EA63]/20 text-[#C9EA63]' : 'bg-emerald-50 border-emerald-100 text-emerald-700'}`}>{equipoDetalle.area_laboratorio || 'PENDIENTE'}</span>
                                            </div>
                                            <div className="space-y-2">
                                                <p className="text-[9px] font-black uppercase opacity-30">Metrólogos Responsables</p>
                                                <div className="flex flex-wrap gap-2">
                                                    {equipoDetalle.metrologos_asignados?.length ? equipoDetalle.metrologos_asignados.map(m => (
                                                        <div key={m.id} className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 transition-all ${m.estatus === 'terminado' ? (darkMode ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-700') : (darkMode ? 'bg-[#C9EA63]/5 border-[#C9EA63]/10 text-white' : 'bg-white border-slate-200 text-slate-700')}`}>
                                                            <span className="text-[10px] font-black tracking-tight">{m.nombre.toUpperCase()}</span>
                                                            {m.estatus === 'terminado' ? <CheckCircle size={14} className="text-emerald-500" /> : <div className="w-1.5 h-1.5 rounded-full bg-[#C9EA63] animate-pulse" />}
                                                        </div>
                                                    )) : <span className="text-xs opacity-40 italic">Sin asignar personal técnico</span>}
                                                </div>
                                            </div>
                                        </div>
                                    </section>
                                </div>

                                {/* COLUMNA DERECHA */}
                                <div className="space-y-6">
                                    {/* Información del Cliente */}
                                    <section>
                                        <h4 className={`text-[10px] font-black uppercase tracking-widest mb-4 opacity-50 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Información del Cliente</h4>
                                        <div className={`p-6 rounded-3xl border space-y-4 ${darkMode ? 'bg-[#1b2b10] border-[#C9EA63]/10' : 'bg-white border-slate-200 shadow-sm'}`}>
                                            <div className="space-y-1">
                                                <p className="text-[9px] font-black uppercase opacity-40">Empresa / Socio Comercial</p>
                                                <p className={`text-sm font-black tracking-tight ${darkMode ? 'text-white' : 'text-slate-800'}`}>{equipoDetalle.empresa || equipoDetalle.persona}</p>
                                            </div>
                                            {equipoDetalle.nombre_certificados && (
                                                <div className="space-y-1">
                                                    <p className="text-[9px] font-black uppercase opacity-40">Certificados a nombre de</p>
                                                    <p className={`text-sm font-bold tracking-tight ${darkMode ? 'text-[#C9EA63]' : 'text-emerald-700'}`}>{equipoDetalle.nombre_certificados}</p>
                                                </div>
                                            )}
                                            {equipoDetalle.direccion && (
                                                <div className="space-y-1">
                                                    <p className="text-[9px] font-black uppercase opacity-40">Dirección</p>
                                                    <p className={`text-xs font-bold ${darkMode ? 'text-white/70' : 'text-slate-600'}`}>{equipoDetalle.direccion}</p>
                                                </div>
                                            )}
                                            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-dashed border-white/5">
                                                <div className="space-y-1">
                                                    <p className="text-[9px] font-black uppercase opacity-40">Contacto</p>
                                                    <p className="text-xs font-bold">{equipoDetalle.persona || 'No registrado'}</p>
                                                </div>
                                                <div className="space-y-1">
                                                    <p className="text-[9px] font-black uppercase opacity-40">SLA Acordado</p>
                                                    <p className={`text-xs font-black uppercase tracking-wider ${darkMode ? 'text-[#C9EA63]' : 'text-emerald-500'}`}>{equipoDetalle.sla || 10} Días Naturales</p>
                                                </div>
                                            </div>
                                            {equipoDetalle.contacto_email && (
                                                <div className="space-y-1">
                                                    <p className="text-[9px] font-black uppercase opacity-40">Email</p>
                                                    <p className={`text-xs font-bold ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>{equipoDetalle.contacto_email}</p>
                                                </div>
                                            )}
                                        </div>
                                    </section>

                                    {/* Datos de la Orden */}
                                    {(equipoDetalle.cotizacion_referencia || equipoDetalle.fecha_recepcion || equipoDetalle.servicio_solicitado) && (
                                        <section>
                                            <h4 className={`text-[10px] font-black uppercase tracking-widest mb-4 opacity-50 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Datos de la Orden</h4>
                                            <div className={`p-5 rounded-3xl border grid grid-cols-3 gap-3 ${darkMode ? 'bg-[#1b2b10]/60 border-[#C9EA63]/15' : 'bg-sky-50 border-sky-200'}`}>
                                                {equipoDetalle.cotizacion_referencia && (
                                                    <div className="space-y-1">
                                                        <p className="text-[9px] font-black uppercase opacity-40">Cotización Ref.</p>
                                                        <p className={`text-sm font-black font-mono ${darkMode ? 'text-[#C9EA63]' : 'text-sky-700'}`}>{equipoDetalle.cotizacion_referencia}</p>
                                                    </div>
                                                )}
                                                {equipoDetalle.fecha_recepcion && (
                                                    <div className="space-y-1">
                                                        <p className="text-[9px] font-black uppercase opacity-40">Fecha Recepción</p>
                                                        <p className={`text-sm font-black ${darkMode ? 'text-white' : 'text-slate-800'}`}>{equipoDetalle.fecha_recepcion}</p>
                                                    </div>
                                                )}
                                                {equipoDetalle.servicio_solicitado && (
                                                    <div className="space-y-1">
                                                        <p className="text-[9px] font-black uppercase opacity-40">Servicio</p>
                                                        <p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-slate-800'}`}>{equipoDetalle.servicio_solicitado}</p>
                                                    </div>
                                                )}
                                            </div>
                                        </section>
                                    )}

                                    {/* Técnico & Requisitos */}
                                    <section>
                                        <h4 className={`text-[10px] font-black uppercase tracking-widest mb-4 opacity-50 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Técnico & Requisitos</h4>
                                        <div className="grid grid-cols-1 gap-4">
                                            <div className={`p-5 rounded-3xl border ${darkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
                                                <div className="flex items-center gap-2 mb-3">
                                                    <Layers size={14} className="opacity-30" />
                                                    <p className="text-[9px] font-black uppercase tracking-widest opacity-40">Puntos a Calibrar</p>
                                                </div>
                                                <p className={`text-[14px] leading-relaxed opacity-90 font-bold ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-700'}`}>
                                                    {equipoDetalle.puntos_calibrar || 'Operación estándar según manual de metrología.'}
                                                </p>
                                            </div>
                                            <div className={`p-5 rounded-3xl border ${darkMode ? 'bg-rose-500/5 border-rose-500/10' : 'bg-amber-50 border-amber-100'}`}>
                                                <div className="flex items-center gap-2 mb-3">
                                                    <AlertTriangle size={14} className="opacity-30" />
                                                    <p className="text-[9px] font-black uppercase tracking-widest opacity-40">Requisitos Especiales</p>
                                                </div>
                                                <p className={`text-[14px] leading-relaxed opacity-90 font-bold italic ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-700'}`}>
                                                    {equipoDetalle.requerimientos_especiales || 'Sin consideraciones técnicas adicionales.'}
                                                </p>
                                            </div>
                                        </div>
                                    </section>

                                    {/* Tiempos y Estatus */}
                                    <div className={`p-6 rounded-3xl border ${darkMode ? 'bg-[#C9EA63]/5 border-[#C9EA63]/20 shadow-lg shadow-[#C9EA63]/5' : 'bg-emerald-50 border-emerald-100'}`}>
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-2 text-sm">
                                                    <Calendar size={16} className="opacity-40" />
                                                    <span>Registro:</span>
                                                </div>
                                                <span className="font-bold text-sm">
                                                    {new Date(equipoDetalle.fecha_ingreso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-2 text-sm">
                                                    <Clock size={16} className="opacity-40" />
                                                    <span>SLA:</span>
                                                </div>
                                                <span className={`font-black text-sm ${equipoDetalle.sla <= 2 ? 'text-rose-500' : ''}`}>{equipoDetalle.sla} d</span>
                                            </div>

                                            <div className="flex justify-between items-center pt-2 border-t border-inherit">
                                                <div className="flex items-center gap-2 text-sm">
                                                    <span className="opacity-50">Estatus Actual:</span>
                                                </div>
                                                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${darkMode ? 'bg-[#C9EA63]/10 text-[#C9EA63] border border-[#C9EA63]/20' : 'bg-emerald-100 text-emerald-700 border border-emerald-200'}`}>
                                                    {equipoDetalle.estatus_actual}
                                                </span>
                                            </div>

                                            {/* Acciones de Flujo Formal */}
                                            <div className="pt-4 border-t border-dashed border-inherit">
                                                <div className="space-y-3">
                                                    {/* Botón para Metrólogos */}
                                                    {(userRol === 'metrologo' || userRol === 'operador' || userRol === 'admin') && equipoDetalle.estatus_actual === 'Laboratorio' && (
                                                        <button 
                                                            onClick={() => handleFinalizarMetrologo(equipoDetalle.id)}
                                                            className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-lg bg-[#C9EA63] text-[#141f0b] hover:bg-[#b0d14b]`}
                                                        >
                                                            <CheckCircle size={16} /> Finalizar y Enviar a QA
                                                        </button>
                                                    )}

                                                    {/* Botones para Aseguramiento */}
                                                    {(userRol === 'aseguramiento' || userRol === 'validacion' || userRol === 'admin') && equipoDetalle.estatus_actual === 'Aseguramiento' && (
                                                        <div className="grid grid-cols-2 gap-3">
                                                            <button 
                                                                onClick={() => handleAprobarQA(equipoDetalle.id)}
                                                                className={`flex items-center justify-center gap-2 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg bg-[#C9EA63] text-[#141f0b] hover:bg-[#b0d14b]`}
                                                            >
                                                                <Check size={16} /> Aprobar QA
                                                            </button>
                                                            <button 
                                                                onClick={() => handleRechazarQA(equipoDetalle.id)}
                                                                className={`flex items-center justify-center gap-2 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg bg-rose-600 text-white hover:bg-rose-700`}
                                                            >
                                                                <X size={16} /> Rechazar
                                                            </button>
                                                        </div>
                                                    )}

                                                    {/* Control Maestro (Solo Admin/Recepción) */}
                                                    {(userRol === 'admin' || userRol === 'recepcionista') && (
                                                        <div className="pt-4 border-t border-dashed border-white/10">
                                                            <p className="text-[9px] font-black uppercase opacity-40 mb-2 text-center">Control Maestro de Estatus (Admin/Rec)</p>
                                                            <select
                                                                value={equipoDetalle.estatus_actual}
                                                                onChange={(e) => {
                                                                    const nuevoEstatus = e.target.value;
                                                                    setEquipoDetalle({ ...equipoDetalle, estatus_actual: nuevoEstatus });
                                                                    setEquipos(prev => prev.map(eq => eq.id === equipoDetalle.id ? { ...eq, estatus_actual: nuevoEstatus } : eq));
                                                                    axios.put(`/api/instrumentos/${equipoDetalle.id}/estatus`, { estatus: nuevoEstatus }).catch(err => {
                                                                        console.error("Error al cambiar estatus", err);
                                                                        fetchEquipos();
                                                                    });
                                                                }}
                                                                className={`w-full text-center font-black py-2.5 rounded-xl text-[10px] appearance-none cursor-pointer transition-all border outline-none shadow-sm ${darkMode ? 'bg-[#141f0b] border-[#C9EA63]/30 text-[#C9EA63] hover:border-[#C9EA63]' : 'bg-white border-emerald-200 text-[#008a5e] hover:border-[#008a5e]'}`}
                                                            >
                                                                {columnasEstatus.map(c => <option key={c.id} value={c.id}>{c.id}</option>)}
                                                            </select>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Pie Modal */}
                        <div className={`p-4 border-t flex justify-end shrink-0 ${darkMode ? 'bg-black/20 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
                            <button
                                onClick={() => setModalDetalle(false)}
                                className={`px-8 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-lg ${darkMode ? 'bg-[#C9EA63] hover:bg-[#b0d14b] text-[#141f0b] shadow-[#C9EA63]/10' : 'bg-[#008a5e] hover:bg-[#007b55] text-white shadow-[#008a5e]/20'}`}
                            >
                                Cerrar Expediente
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Panel de Acciones Masivas */}
            {seleccionados.length > 0 && (
                <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[500] animate-in slide-in-from-bottom-10 duration-500">
                    <div className={`px-8 py-5 rounded-[2rem] border shadow-2xl flex items-center gap-8 ${darkMode ? 'bg-[#141f0b] border-[#C9EA63]/40' : 'bg-white border-emerald-200'}`}>
                        <div className="flex flex-col">
                            <span className={`text-[10px] font-black uppercase tracking-widest opacity-40 ${darkMode ? 'text-white' : 'text-slate-800'}`}>Seleccionados</span>
                            <span className={`text-lg font-black ${darkMode ? 'text-[#C9EA63]' : 'text-emerald-700'}`}>{seleccionados.length} Equipos</span>
                        </div>
                        
                        <div className="h-10 w-px bg-current opacity-10" />
                        
                        <div className="flex gap-3">
                            <button 
                                onClick={prepararEnvioMasivo}
                                className={`px-6 py-3 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all hover:scale-105 active:scale-95 ${darkMode ? 'bg-[#C9EA63] text-[#141f0b]' : 'bg-[#008a5e] text-white'}`}
                            >
                                Enviar a Aseguramiento
                            </button>
                            <button 
                                onClick={() => setSeleccionados([])}
                                className={`px-4 py-3 rounded-xl font-black text-[11px] uppercase tracking-widest opacity-40 hover:opacity-100 transition-all ${darkMode ? 'text-white' : 'text-slate-800'}`}
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Modal de Envio a Aseguramiento (Integridad & Notas) */}
            {modalConf && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[1000] flex justify-center items-center p-4">
                    <div className={`w-full max-w-lg rounded-3xl shadow-2xl p-6 md:p-8 border animate-in zoom-in-95 duration-200 ${darkMode ? 'bg-[#141f0b] border-[#C9EA63]/30 text-[#F2F6F0]' : 'bg-white border-slate-200 text-slate-800'}`}>
                        <h2 className="text-2xl font-black mb-4 flex items-center gap-2">Finalizar Metrología</h2>
                        
                        {alertasConf.length > 0 && (
                            <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/50 text-sm">
                                <h4 className="font-bold flex items-center gap-1.5 text-amber-500 mb-2">Alerta de Integridad de OC</h4>
                                <ul className="list-disc pl-5 opacity-80 space-y-1">
                                    {alertasConf.map((a,i) => <li key={i}>{a}</li>)}
                                </ul>
                                <p className="mt-3 text-[11px] font-bold opacity-60">Los equipos restantes permanecerán en su estatus actual.</p>
                            </div>
                        )}

                        <div className="flex gap-4">
                            <button onClick={() => setModalConf(false)} className={`flex-1 py-3 font-bold rounded-xl ${darkMode ? 'bg-[#253916] text-white hover:bg-[#314a1c]' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Cancelar</button>
                            <button onClick={handleEnviarMasivo} className={`flex-[2] flex justify-center items-center gap-2 font-black py-3 rounded-xl transition-all shadow-lg ${darkMode ? 'bg-[#C9EA63] text-[#141f0b] hover:bg-[#b0d14b]' : 'bg-[#008a5e] text-white hover:bg-[#007b55]'}`}>
                                ¡He terminado!
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TableroKanban;
