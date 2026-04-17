import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { 
    Package, Clock, AlertTriangle, AlertCircle, CheckCircle, 
    Search, ChevronDown, ChevronUp, CheckSquare, Square, 
    ThumbsUp, HelpCircle, X, Paperclip, Tag, BookOpen, 
    Hash, User, Calendar, FileText, Image as ImageIcon, 
    Eye, ArrowRight, Edit3, Save, RefreshCw, Trash2,
    Layers, MapPin, Activity, Settings2, List, Plus, Edit, Truck, FileCheck
} from 'lucide-react';
import { toast } from 'react-toastify';
import Select from 'react-select';
import { createPortal } from 'react-dom';

const GestionGrupo = ({ darkMode, usuario }) => {
    const { oc } = useParams();
    const navigate = useNavigate();
    
    // Estados principales
    const [equipos, setEquipos] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [vista, setVista] = useState('kanban'); // 'kanban' | 'lista'
    const [busqueda, setBusqueda] = useState('');
    
    // Selección
    const [seleccionados, setSeleccionados] = useState([]);
    
    // Modales
    const [modalDetalle, setModalDetalle] = useState(false);
    const [equipoDetalle, setEquipoDetalle] = useState(null);
    const [modalEditar, setModalEditar] = useState(false);
    const [equipoEditando, setEquipoEditando] = useState(null);
    const [modalOrden, setModalOrden] = useState(false);
    const [instrumentosOrden, setInstrumentosOrden] = useState([]);
    const [guardandoOrden, setGuardandoOrden] = useState(false);
    const [eliminadosIds, setEliminadosIds] = useState([]);
    const [modalAgregar, setModalAgregar] = useState(false);
    const [nuevoEquipo, setNuevoEquipo] = useState({
        nombre_instrumento: '', marca: '', modelo: '', no_serie: '', identificacion: '',
        ubicacion: '', area_laboratorio: '', metrologos_asignados: [],
        requerimientos_especiales: '', puntos_calibrar: '', sla: 20
    });

    // Datos auxiliares
    const [metrologosDisponibles, setMetrologosDisponibles] = useState([]);
    const [cargandoMetrologos, setCargandoMetrologos] = useState(false);
    const [areas, setAreas] = useState([]);

    // Colores de Tema
    const colorPrimario = darkMode ? '#C9EA63' : '#008a5e';
    const bgContainer = darkMode ? 'bg-[#141f0b]' : 'bg-white';
    const borderCard = darkMode ? 'border-[#C9EA63]/20' : 'border-slate-100';
    const textMain = darkMode ? 'text-[#F2F6F0]' : 'text-slate-800';

    // Permisos por Rol
    const esSoloLectura = ['aseguramiento', 'validacion'].includes(usuario?.rol);
    const puedeEditarTotal = ['admin', 'recepcionista'].includes(usuario?.rol);
    const puedeMoverEstatus = ['admin', 'recepcionista', 'metrologo', 'operador'].includes(usuario?.rol);

    const selectStyles = {
        control: (base, state) => ({
            ...base,
            backgroundColor: darkMode ? '#141f0b' : '#ffffff',
            borderColor: state.isFocused ? colorPrimario : (darkMode ? 'rgba(201, 234, 99, 0.2)' : '#e2e8f0'),
            borderRadius: '1rem',
            padding: '2px',
            fontSize: '0.875rem',
            color: darkMode ? '#F2F6F0' : '#1e293b',
            boxShadow: 'none',
            '&:hover': {
                borderColor: colorPrimario
            }
        }),
        menu: (base) => ({
            ...base,
            backgroundColor: darkMode ? '#141f0b' : '#ffffff',
            borderRadius: '1rem',
            overflow: 'hidden',
            zIndex: 1000,
            border: darkMode ? '1px solid rgba(201, 234, 99, 0.2)' : '1px solid #e2e8f0'
        }),
        option: (base, state) => ({
            ...base,
            backgroundColor: state.isFocused ? colorPrimario : 'transparent',
            color: state.isFocused ? '#000000' : (darkMode ? '#F2F6F0' : '#1e293b'),
            fontSize: '0.875rem',
            padding: '10px 15px',
            cursor: 'pointer'
        }),
        singleValue: (base) => ({
            ...base,
            color: darkMode ? '#C9EA63' : '#008a5e',
            fontWeight: '600'
        }),
        multiValue: (base) => ({
            ...base,
            backgroundColor: darkMode ? 'rgba(201, 234, 99, 0.1)' : 'rgba(0, 138, 94, 0.1)',
            borderRadius: '0.5rem',
            border: `1px solid ${colorPrimario}33`
        }),
        multiValueLabel: (base) => ({
            ...base,
            color: colorPrimario,
            fontWeight: '700',
            fontSize: '0.75rem'
        }),
        multiValueRemove: (base) => ({
            ...base,
            color: colorPrimario,
            '&:hover': {
                backgroundColor: colorPrimario,
                color: '#000000'
            }
        })
    };

    const fetchData = async () => {
        try {
            setCargando(true);
            const res = await axios.get(`/api/instrumentos?folio=${oc}`);
            setEquipos(res.data);
            
            // Cargar Catálogos
            const [resMet, resAreas] = await Promise.all([
                axios.get('/api/usuarios/metrologos'),
                axios.get('/api/areas')
            ]);
            setMetrologosDisponibles(resMet.data.map(m => ({ value: m.id, label: m.nombre })));
            setAreas(resAreas.data.map(a => ({ value: a.nombre, label: a.nombre })));
        } catch (error) {
            console.error(error);
            toast.error("Error al cargar datos del grupo");
        } finally {
            setCargando(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [oc]);

    const handleMoverEstatus = async (equipoId, nuevoEstatus) => {
        try {
            await axios.put(`/api/instrumentos/${equipoId}/estatus`, { estatus: nuevoEstatus });
            toast.success("Estatus actualizado");
            fetchData();
        } catch (error) {
            toast.error("Error al actualizar estatus");
        }
    };

    const abrirModalOrden = () => {
        setInstrumentosOrden(equipos.map(ins => ({
            ...ins,
            metrologos_asignados: ins.metrologos_asignados?.map(m => ({ value: m.id, label: m.nombre })) || []
        })));
        setModalOrden(true);
    };

    const actualizarItemOrden = (idx, campo, v) => {
        const next = [...instrumentosOrden];
        next[idx][campo] = v;
        setInstrumentosOrden(next);
    };

    const guardarCambiosIndividual = async (e) => {
        if(e) e.preventDefault();
        try {
            const payload = {
                ...equipoEditando,
                metrologos_asignados: equipoEditando.metrologos_asignados?.map(m => m.value || m.id)
            };
            await axios.put(`/api/instrumentos/${equipoEditando.id}`, payload);
            toast.success("Instrumento actualizado");
            setModalEditar(false);
            fetchData();
        } catch (error) {
            toast.error("Error al actualizar instrumento");
        }
    };

    const crearInstrumento = async (e) => {
        if(e) e.preventDefault();
        try {
            const payload = {
                ...nuevoEquipo,
                orden_cotizacion: oc,
                folio_rastreo: oc,
                metrologos_asignados: nuevoEquipo.metrologos_asignados?.map(m => m.value)
            };
            await axios.post('/api/instrumentos', payload);
            toast.success("Equipo agregado al lote");
            setModalAgregar(false);
            setNuevoEquipo({
                nombre_instrumento: '', marca: '', modelo: '', no_serie: '', identificacion: '',
                ubicacion: '', area_laboratorio: '', metrologos_asignados: [],
                requerimientos_especiales: '', puntos_calibrar: '', sla: 20
            });
            fetchData();
        } catch (error) {
            toast.error("Error al crear equipo");
        }
    };

    const eliminarInstrumento = async (id) => {
        if(!window.confirm("¿Seguro que deseas eliminar permanentemente este equipo?")) return;
        try {
            await axios.delete(`/api/instrumentos/${id}`);
            toast.success("Equipo eliminado");
            fetchData();
        } catch (error) {
            toast.error("Error al eliminar equipo");
        }
    };

    const guardarCambiosOrden = async (e) => {
        if(e) e.preventDefault();
        setGuardandoOrden(true);
        try {
            const payload = instrumentosOrden.map(ins => ({
                ...ins,
                metrologos_asignados: ins.metrologos_asignados?.map(m => m.value || m.id)
            }));
            await axios.post(`/api/instrumentos/orden/${oc}/modificar`, {
                instrumentos: payload,
                eliminados_ids: eliminadosIds
            });
            toast.success("Orden actualizada correctamente");
            setModalOrden(false);
            fetchData();
        } catch (error) {
            toast.error("Error al guardar cambios masivos");
        } finally {
            setGuardandoOrden(false);
        }
    };

    const ColumnasKanban = [
        { id: 'Recepción', icono: Package, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
        { id: 'Laboratorio', icono: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10' },
        { id: 'Aseguramiento', icono: AlertTriangle, color: 'text-blue-500', bg: 'bg-blue-500/10' },
        { id: 'Certificación', icono: FileText, color: 'text-purple-500', bg: 'bg-purple-500/10' },
        { id: 'Listo', icono: CheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
        { id: 'Entregado', icono: Truck, color: 'text-gray-500', bg: 'bg-gray-500/10' }
    ];

    const totalEquipos = equipos.length;
    const equiposCerrados = equipos.filter(e => e.estatus_actual === 'Listo' || e.estatus_actual === 'Entregado').length;
    const porcentajeProgreso = totalEquipos > 0 ? (equiposCerrados / totalEquipos) * 100 : 0;

    if (cargando) return (
        <div className="flex flex-col items-center justify-center h-64 gap-4">
            <RefreshCw className="animate-spin text-emerald-500" size={40} />
            <p className="text-sm font-bold opacity-50 uppercase tracking-widest">Cargando información de orden...</p>
        </div>
    );

    return (
        <div className="w-full space-y-6 animate-in fade-in duration-500">
            {/* Cabecera Refinada */}
            <header className={`p-6 rounded-[2rem] border ${bgContainer} ${borderCard} shadow-lg relative overflow-hidden transition-all duration-500`}>
                {/* Barra de Progreso Superior */}
                <div className="absolute top-0 left-0 w-full h-1.5 bg-black/5 dark:bg-white/5 overflow-hidden">
                    <div 
                        className={`h-full transition-all duration-1000 ease-out shadow-[0_0_15px_rgba(0,138,94,0.4)] ${darkMode ? 'bg-[#C9EA63]' : 'bg-[#008a5e]'}`}
                        style={{ width: `${porcentajeProgreso}%` }}
                    />
                </div>

                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10 pt-2">
                    <div className="flex items-center gap-5">
                        <div className={`p-4 rounded-[1.5rem] ${darkMode ? 'bg-[#C9EA63] text-black shadow-md shadow-[#C9EA63]/10' : 'bg-[#008a5e] text-white shadow-lg shadow-[#008a5e]/5'}`}>
                            <Package size={28} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${darkMode ? 'bg-white/10 text-white/60' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                                    Orden de Servicio
                                </span>
                                <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${darkMode ? 'bg-[#C9EA63] text-black' : 'bg-emerald-600 text-white shadow-sm'}`}>
                                    {oc}
                                </span>
                            </div>
                            <h2 className={`text-2xl font-black uppercase tracking-tight ${textMain} line-clamp-1 max-w-[400px]`}>
                                {equipos[0]?.empresa || "Cliente Sin Nombre"}
                            </h2>
                            <div className="flex items-center gap-3">
                                <p className={`text-[12px] font-bold opacity-50 ${darkMode ? 'text-white' : 'text-slate-600'}`}>
                                    {equipos.length} equipos • {equiposCerrados} cerrados ({Math.round(porcentajeProgreso)}%)
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <div className={`flex p-1 rounded-xl ${darkMode ? 'bg-black/20' : 'bg-slate-100'}`}>
                            <button 
                                onClick={() => setVista('kanban')}
                                className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${vista === 'kanban' ? (darkMode ? 'bg-[#C9EA63] text-black shadow-sm' : 'bg-white text-emerald-700 shadow-sm border border-emerald-100') : (darkMode ? 'text-white/40 hover:text-white' : 'text-slate-500 hover:text-slate-800')}`}
                            >
                                Kanban
                            </button>
                            <button 
                                onClick={() => setVista('lista')}
                                className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${vista === 'lista' ? (darkMode ? 'bg-[#C9EA63] text-black shadow-sm' : 'bg-white text-emerald-700 shadow-sm border border-emerald-100') : (darkMode ? 'text-white/40 hover:text-white' : 'text-slate-500 hover:text-slate-800')}`}
                            >
                                Lista
                            </button>
                        </div>

                        {/* Contador de Certificados PRO */}
                        <div className={`hidden md:flex items-center gap-3 px-4 py-2 rounded-xl border ${darkMode ? 'bg-black/20 border-[#C9EA63]/20' : 'bg-slate-50 border-slate-200'}`}>
                            <div className="flex -space-x-2">
                                { [0,1,2].map(i => (
                                    <div key={i} className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${darkMode ? 'bg-[#141f0b] border-[#C9EA63]/40' : 'bg-white border-emerald-500'}`}>
                                        <FileCheck size={10} className={darkMode ? 'text-[#C9EA63]' : 'text-emerald-600'} />
                                    </div>
                                ))}
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[9px] font-black uppercase opacity-40 leading-none">Certificados</span>
                                <span className={`text-xs font-black ${darkMode ? 'text-[#C9EA63]' : 'text-emerald-700'}`}>
                                    {equipos.filter(e => e.certificado_url).length} de {equipos.length} listos
                                </span>
                            </div>
                        </div>

                        {puedeEditarTotal && (
                            <button 
                                onClick={abrirModalOrden}
                                className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-md hover:scale-105 active:scale-95 ${darkMode ? 'bg-[#C9EA63] text-[#141f0b] hover:bg-[#b0d14b]' : 'bg-[#008a5e] text-white hover:bg-[#007b55]'}`}
                            >
                                <Settings2 size={16} /> Gestionar Orden
                            </button>
                        )}
                    </div>
                </div>
            </header>

            {/* Buscador Rápido */}
            <div className={`flex items-center gap-3 px-6 py-3 rounded-[1.5rem] border ${bgContainer} ${borderCard} max-w-md`}>
                <Search size={18} className="opacity-40" />
                <input 
                    type="text" 
                    placeholder="Buscar instrumento o serie..." 
                    className={`bg-transparent border-none outline-none w-full text-sm font-bold ${textMain}`}
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                />
            </div>

            {/* Área de Trabajo */}
            {vista === 'kanban' ? (
                <div className="flex gap-3 overflow-x-auto pb-6 snap-x custom-scrollbar min-h-[600px] -mx-2 px-2">
                    {ColumnasKanban.map(col => {
                        const itemsCol = equipos.filter(e => e.estatus_actual === col.id);
                        return (
                            <div key={col.id} className={`flex-shrink-0 w-[280px] rounded-[1.8rem] border snap-start flex flex-col ${bgContainer} ${borderCard} transition-all hover:border-emerald-500/20 shadow-sm`}>
                                <div className={`p-4 border-b flex items-center justify-between ${col.bg} rounded-t-[1.8rem]`}>
                                    <div className={`flex items-center gap-3 font-black uppercase text-xs ${col.color}`}>
                                        <col.icono size={18} />
                                        {col.id}
                                    </div>
                                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${darkMode ? 'bg-black/40 text-white' : 'bg-white shadow-sm text-slate-800'}`}>
                                        {itemsCol.length}
                                    </span>
                                </div>
                                
                                <div className="p-4 space-y-4 flex-1 overflow-y-auto custom-scrollbar">
                                    {itemsCol.map(eq => (
                                        <div 
                                            key={eq.id}
                                            className={`p-3 rounded-2xl border transition-all cursor-pointer group relative overflow-hidden ${darkMode ? 'bg-white/[0.02] border-white/5 hover:bg-white/[0.08] hover:border-[#C9EA63]/40 shadow-inner' : 'bg-white border-slate-100 hover:bg-emerald-50/30 hover:border-emerald-500/30 hover:shadow-xl shadow-sm'}`}
                                            onClick={() => { setEquipoDetalle(eq); setModalDetalle(true); }}
                                        >
                                            <div className={`absolute top-0 left-0 w-1 h-full ${col.bg.replace('/10', '')} opacity-40`} />
                                            
                                            <div className="flex justify-between items-start gap-2 mb-2">
                                                <h4 className={`text-[11px] font-black uppercase leading-[1.3] flex-1 tracking-tight ${textMain}`}>
                                                    {eq.nombre_instrumento}
                                                </h4>
                                                <div className="flex gap-1">
                                                    <button 
                                                        className={`p-1.5 rounded-lg transition-all ${darkMode ? 'hover:bg-[#C9EA63]/20 text-[#C9EA63]' : 'hover:bg-emerald-500/10 text-emerald-600'}`} 
                                                        onClick={(e) => { e.stopPropagation(); setEquipoEditando(eq); setModalEditar(true); }}
                                                    >
                                                        <Edit3 size={12} />
                                                    </button>
                                                </div>
                                            </div>
                                            
                                            <div className="grid grid-cols-2 gap-2 mb-2">
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                    <Hash size={10} className="shrink-0 opacity-40" />
                                                    <p className={`text-[9px] font-mono font-bold truncate opacity-60 ${textMain}`}>{eq.no_serie || 'S/N'}</p>
                                                </div>
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                    <Tag size={10} className="shrink-0 opacity-40" />
                                                    <p className={`text-[9px] font-mono font-bold truncate opacity-60 ${textMain}`}>{eq.identificacion || 'S/I'}</p>
                                                </div>
                                            </div>

                                            {/* Alerta de Certificado Faltante */}
                                            { !eq.certificado_url && (
                                                <div className={`mb-2 px-2 py-1 rounded-md flex items-center gap-1.5 border animate-pulse ${darkMode ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                                                    <AlertTriangle size={10} />
                                                    <span className="text-[8px] font-black uppercase italic">⚠️ Sin Certificado</span>
                                                </div>
                                            )}
                                            { eq.certificado_url && (
                                                <div className={`mb-2 px-2 py-1 rounded-md flex items-center gap-1.5 border ${darkMode ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-emerald-50 border-emerald-100 text-emerald-700'}`}>
                                                    <CheckCircle size={10} />
                                                    <span className="text-[8px] font-black uppercase">Certificado: {eq.numero_informe || 'VINCULADO'}</span>
                                                </div>
                                            )}

                                            <div className="flex flex-wrap gap-1">
                                                <div className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-tighter ${darkMode ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'}`}>
                                                    {eq.area_laboratorio || "GENERAL"}
                                                </div>
                                                {eq.metrologos_asignados?.map(m => (
                                                    <div key={m.id} className={`px-2 py-0.5 rounded-md text-[8px] font-black border transition-colors ${darkMode ? 'bg-blue-500/5 border-blue-500/10 text-blue-300' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                                                        {m.nombre.split(' ')[0].toUpperCase()}
                                                    </div>
                                                ))}
                                            </div>

                                            <div className={`mt-2 pt-2 border-t border-dashed flex justify-between items-center ${darkMode ? 'border-white/5' : 'border-slate-100'}`}>
                                                <div className="flex items-center gap-1 opacity-40">
                                                    <Clock size={10} />
                                                    <span className="text-[8px] font-black">SLA: {eq.sla || 20}d</span>
                                                </div>
                                                <div className={`w-1.5 h-1.5 rounded-full ${eq.sla <= 2 ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'}`} />
                                            </div>
                                        </div>
                                    ))}
                                    {itemsCol.length === 0 && (
                                        <div className="h-full flex flex-col items-center justify-center py-12 opacity-10">
                                            <col.icono size={48} />
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className={`rounded-[2.5rem] border overflow-hidden ${bgContainer} ${borderCard} shadow-xl`}>
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className={`text-[10px] font-black uppercase tracking-widest ${darkMode ? 'bg-white/5 text-white/40' : 'bg-slate-50 text-slate-500'}`}>
                                <th className="p-4">Identificación / Serie</th>
                                <th className="p-4">Instrumento / Marca</th>
                                <th className="p-4">Área / Metrólogos</th>
                                <th className="p-4">Estado</th>
                                <th className="p-4 text-center">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className={`divide-y ${darkMode ? 'divide-white/5' : 'divide-slate-100'}`}>
                            {equipos.filter(e => 
                                e.nombre_instrumento?.toLowerCase().includes(busqueda.toLowerCase()) || 
                                e.no_serie?.toLowerCase().includes(busqueda.toLowerCase())
                            ).map(eq => (
                                <tr key={eq.id} className={`group transition-all ${darkMode ? 'hover:bg-white/5' : 'hover:bg-emerald-50/50'}`}>
                                    <td className="p-6">
                                        <div className="flex flex-col gap-1">
                                            <span className={`text-[11px] font-black uppercase ${darkMode ? 'text-[#C9EA63]' : 'text-emerald-700'}`}>{eq.identificacion || 'SIN ID'}</span>
                                            <span className={`text-[10px] font-mono opacity-50 ${textMain}`}>{eq.no_serie}</span>
                                        </div>
                                    </td>
                                    <td className="p-6">
                                        <div className="flex flex-col">
                                            <span className={`text-xs font-black uppercase ${textMain}`}>{eq.nombre_instrumento}</span>
                                            <span className="text-[10px] opacity-40 uppercase font-black">{eq.marca} • {eq.modelo}</span>
                                        </div>
                                    </td>
                                    <td className="p-6">
                                        <div className="flex flex-col gap-2">
                                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border w-fit ${darkMode ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-emerald-50 border-emerald-100 text-emerald-700'}`}>
                                                {eq.area_laboratorio || "GENERAL"}
                                            </span>
                                            <div className="flex flex-wrap gap-1">
                                                {eq.metrologos_asignados?.map(m => (
                                                    <span key={m.id} className={`text-[9px] font-bold opacity-60 ${textMain}`}>• {m.nombre}</span>
                                                ))}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-6">
                                        {puedeMoverEstatus ? (
                                            <select 
                                                value={eq.estatus_actual}
                                                onChange={(e) => handleMoverEstatus(eq.id, e.target.value)}
                                                className={`text-[10px] font-black uppercase px-4 py-1.5 rounded-full border outline-none cursor-pointer transition-all ${darkMode ? 'bg-[#141f0b] border-white/10 text-white hover:border-[#C9EA63]' : 'bg-white border-slate-200 text-slate-700 hover:border-emerald-500'}`}
                                            >
                                                {ColumnasKanban.map(c => <option key={c.id} value={c.id}>{c.id}</option>)}
                                            </select>
                                        ) : (
                                            <span className={`text-[10px] font-black uppercase px-4 py-1.5 rounded-full border ${darkMode ? 'bg-white/5 border-white/10 text-white/40' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                                                {eq.estatus_actual}
                                            </span>
                                        )}
                                    </td>
                                    <td className="p-6">
                                        <div className="flex justify-center gap-2">
                                            <button 
                                                onClick={() => { setEquipoDetalle(eq); setModalDetalle(true); }}
                                                className={`p-2 rounded-xl transition-all ${darkMode ? 'bg-white/5 text-white/40 hover:text-[#C9EA63]' : 'bg-slate-100 text-slate-400 hover:text-emerald-600'}`}
                                                title="Ver Detalle"
                                            >
                                                <Eye size={16} />
                                            </button>
                                            
                                            {puedeEditarTotal && (
                                                <>
                                                    <button 
                                                        onClick={() => { setEquipoEditando(eq); setModalEditar(true); }}
                                                        className={`p-2 rounded-xl transition-all ${darkMode ? 'bg-white/5 text-white/40 hover:text-emerald-400' : 'bg-slate-100 text-slate-400 hover:text-emerald-500'}`}
                                                        title="Editar"
                                                    >
                                                        <Edit3 size={16} />
                                                    </button>
                                                    <button 
                                                        onClick={() => eliminarInstrumento(eq.id)}
                                                        className={`p-2 rounded-xl transition-all ${darkMode ? 'bg-white/5 text-rose-500/40 hover:text-rose-500 hover:bg-rose-500/10' : 'bg-slate-100 text-slate-400 hover:text-rose-600 hover:bg-rose-50'}`}
                                                        title="Eliminar"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* MODAL DETALLE PREMIUM (VER EXPEDIENTE) */}
            {modalDetalle && equipoDetalle && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center p-2 md:p-4 backdrop-blur-md bg-black/40 animate-in fade-in duration-300">
                    <div className={`w-full max-w-5xl max-h-[98vh] md:max-h-[92vh] overflow-hidden rounded-[2rem] shadow-xl border flex flex-col animate-in zoom-in-95 duration-300 ${bgContainer} ${borderCard}`}>
                        <div className={`p-6 md:p-8 border-b flex justify-between items-center ${darkMode ? 'border-white/5 bg-white/5' : 'border-slate-100 bg-slate-50/50'}`}>
                            <div className="flex items-center gap-4 md:gap-6">
                                <div className={`w-12 h-12 md:w-16 md:h-16 rounded-[1.2rem] md:rounded-[2rem] flex items-center justify-center ${darkMode ? 'bg-[#C9EA63] text-black shadow-md shadow-[#C9EA63]/10' : 'bg-[#008a5e] text-white shadow-lg shadow-[#008a5e]/5'}`}>
                                    <Package size={24} className="md:w-8 md:h-8" />
                                </div>
                                <div>
                                    <h3 className={`text-2xl font-black uppercase tracking-tight ${textMain}`}>{equipoDetalle.nombre_instrumento}</h3>
                                    <div className="flex items-center gap-3 mt-1">
                                        <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${darkMode ? 'bg-white/10 text-white/60' : 'bg-emerald-600/10 text-emerald-600'}`}>{oc}</span>
                                        <span className={`text-[10px] font-black uppercase tracking-widest ${darkMode ? 'text-white/40' : 'text-slate-400'}`}>Expediente Técnico</span>
                                    </div>
                                </div>
                            </div>
                            <button onClick={() => setModalDetalle(false)} className="opacity-40 hover:opacity-100 transition-all hover:rotate-90"><X size={32} /></button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-12 custom-scrollbar">
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                                {/* Columna Izquierda: Datos Técnicos */}
                                <div className="lg:col-span-7 space-y-12">
                                    <section>
                                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] mb-6 opacity-30 flex items-center gap-2">
                                            <Activity size={14} /> Datos del Equipo
                                        </h4>
                                        <div className="grid grid-cols-2 gap-8">
                                            <div className="space-y-1">
                                                <p className="text-[9px] font-black uppercase opacity-40">Marca</p>
                                                <p className={`text-md font-bold uppercase ${textMain}`}>{equipoDetalle.marca || 'VAISALA'}</p>
                                            </div>
                                            <div className="space-y-1">
                                                <p className="text-[9px] font-black uppercase opacity-40">Modelo</p>
                                                <p className={`text-md font-bold uppercase ${textMain}`}>{equipoDetalle.modelo || 'N/A'}</p>
                                            </div>
                                            <div className="space-y-1">
                                                <p className="text-[9px] font-black uppercase opacity-40">Serie</p>
                                                <p className={`text-sm font-mono font-black ${textMain}`}>{equipoDetalle.no_serie || 'N/A'}</p>
                                            </div>
                                            <div className="space-y-1">
                                                <p className="text-[9px] font-black uppercase opacity-40">ID / Tag</p>
                                                <p className={`text-sm font-mono font-black ${darkMode ? 'text-[#C9EA63]' : 'text-emerald-700'}`}>{equipoDetalle.identificacion || 'N/A'}</p>
                                            </div>
                                            <div className="space-y-1">
                                                <p className="text-[9px] font-black uppercase opacity-40">Ubicación</p>
                                                <div className="flex items-center gap-2">
                                                    <MapPin size={12} className="opacity-40" />
                                                    <p className={`text-sm font-bold ${textMain}`}>{equipoDetalle.ubicacion || 'No Indicada'}</p>
                                                </div>
                                            </div>
                                            <div className="space-y-1">
                                                <p className="text-[9px] font-black uppercase opacity-40">Área Lab</p>
                                                <span className={`inline-block px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${darkMode ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'}`}>
                                                    {equipoDetalle.area_laboratorio || 'TEMPERATURA'}
                                                </span>
                                            </div>
                                        </div>
                                    </section>

                                    <section>
                                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] mb-6 opacity-30 flex items-center gap-2">
                                            <FileText size={14} /> Requerimientos & Puntos
                                        </h4>
                                        <div className="space-y-6">
                                            <div className={`p-6 rounded-[2rem] border ${darkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
                                                <p className="text-[9px] font-black uppercase opacity-40 mb-2">Requerimientos del Cliente</p>
                                                <p className={`text-sm font-bold leading-relaxed ${textMain}`}>
                                                    {equipoDetalle.requerimientos_especiales || 'Sin requerimientos especiales indicados.'}
                                                </p>
                                            </div>
                                            <div className={`p-6 rounded-[2rem] border ${darkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
                                                <p className="text-[9px] font-black uppercase opacity-40 mb-2">Puntos a Calibrar</p>
                                                <p className={`text-sm font-bold leading-relaxed ${textMain}`}>
                                                    {equipoDetalle.puntos_calibrar || 'Calibración estándar según alcance técnico.'}
                                                </p>
                                            </div>
                                        </div>
                                    </section>
                                </div>

                                {/* Columna Derecha: Servicio y Estatus */}
                                <div className="lg:col-span-5 space-y-12">
                                    <section className={`p-10 rounded-[3.5rem] border relative overflow-hidden ${darkMode ? 'bg-[#C9EA63]/5 border-[#C9EA63]/10' : 'bg-emerald-50 border-emerald-100 shadow-sm'}`}>
                                        <div className="relative z-10 space-y-8">
                                            <div className="flex justify-between items-start">
                                                <h4 className={`text-[11px] font-black uppercase tracking-widest ${darkMode ? 'text-[#C9EA63]' : 'text-emerald-800'}`}>Tiempos y Estatus</h4>
                                                <span className={`px-4 py-1 rounded-full text-[10px] font-black uppercase border ${darkMode ? 'bg-black/20 border-white/10 text-white' : 'bg-white border-emerald-200 text-emerald-700'}`}>
                                                    {equipoDetalle.estatus_actual}
                                                </span>
                                            </div>
                                            
                                            <div className="grid grid-cols-2 gap-6">
                                                <div className="space-y-1">
                                                    <p className="text-[9px] font-black uppercase opacity-40">Registro</p>
                                                    <div className="flex items-center gap-2">
                                                        <Calendar size={14} className="opacity-40" />
                                                        <p className={`text-md font-black ${textMain}`}>
                                                            {new Date(equipoDetalle.fecha_ingreso || Date.now()).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="space-y-1">
                                                    <p className="text-[9px] font-black uppercase opacity-40">SLA</p>
                                                    <div className="flex items-center gap-2">
                                                        <Clock size={14} className={equipoDetalle.sla <= 2 ? 'text-rose-500 animate-pulse' : 'opacity-40'} />
                                                        <p className={`text-md font-black ${equipoDetalle.sla <= 2 ? 'text-rose-500' : textMain}`}>
                                                            {equipoDetalle.sla || 20} d
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="pt-8 border-t border-dashed border-emerald-200/30">
                                                <p className="text-[9px] font-black uppercase opacity-40 mb-4 text-center">Cambiar Estado Operativo</p>
                                                <div className="grid grid-cols-1 gap-2">
                                                    <select 
                                                        value={equipoDetalle.estatus_actual}
                                                        onChange={(e) => handleMoverEstatus(equipoDetalle.id, e.target.value)}
                                                        className={`w-full p-4 rounded-2xl text-[11px] font-black uppercase tracking-widest text-center border outline-none transition-all shadow-lg ${darkMode ? 'bg-[#141f0b] border-[#C9EA63]/20 text-[#C9EA63] hover:border-[#C9EA63]' : 'bg-white border-emerald-200 text-[#008a5e] hover:border-emerald-500'}`}
                                                    >
                                                        {ColumnasKanban.map(c => <option key={c.id} value={c.id}>{c.id}</option>)}
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                    </section>

                                    <section>
                                        <h4 className={`text-[10px] font-black uppercase tracking-widest mb-4 flex items-center gap-2 ${darkMode ? 'text-[#C9EA63]' : 'text-emerald-800'}`}>
                                            <FileCheck size={14} /> Documentación Digital
                                        </h4>
                                        
                                        {equipoDetalle.certificado_url ? (
                                            <div className={`p-6 rounded-[2rem] border flex items-center justify-between transition-all ${darkMode ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-white border-slate-200 shadow-sm'}`}>
                                                <div className="flex items-center gap-4">
                                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${darkMode ? 'bg-[#C9EA63] text-black' : 'bg-emerald-600 text-white'}`}>
                                                        <FileText size={20} />
                                                    </div>
                                                    <div>
                                                        <p className={`text-xs font-black uppercase ${textMain}`}>{equipoDetalle.numero_informe || 'Informe Localizado'}</p>
                                                        <p className="text-[9px] opacity-40 font-mono italic">Documento verificado por Aseguramiento</p>
                                                    </div>
                                                </div>
                                                <a 
                                                    href={equipoDetalle.certificado_url} 
                                                    target="_blank" 
                                                    rel="noreferrer"
                                                    className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${darkMode ? 'bg-[#C9EA63] text-black hover:bg-[#b0d14b]' : 'bg-[#008a5e] text-white hover:bg-[#007b55]'}`}
                                                >
                                                    Ver PDF
                                                </a>
                                            </div>
                                        ) : (
                                            <div className={`p-8 rounded-[2rem] border-2 border-dashed flex flex-col items-center justify-center gap-4 ${darkMode ? 'border-amber-500/20 bg-amber-500/5' : 'border-slate-200 bg-slate-50'}`}>
                                                <AlertCircle size={32} className="text-amber-500 opacity-40" />
                                                <div className="text-center">
                                                    <p className={`text-sm font-black uppercase ${textMain}`}>Documento Pendiente</p>
                                                    <p className="text-[10px] opacity-40 italic mt-1">El certificado digital aún no ha sido cargado en el sistema.</p>
                                                </div>
                                                
                                                { (usuario?.rol === 'admin' || usuario?.rol === 'aseguramiento') && (
                                                    <button 
                                                        onClick={() => navigate('/certificacion-agil')}
                                                        className={`mt-2 flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${darkMode ? 'bg-[#C9EA63] text-black hover:bg-[#b0d14b]' : 'bg-[#008a5e] text-white hover:bg-[#007b55]'}`}
                                                    >
                                                        <RefreshCw size={14} /> Ir a Certificación Ágil
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </section>


                                    <section>
                                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] mb-6 opacity-30 flex items-center gap-2">
                                            <User size={14} /> Metrólogos Asignados
                                        </h4>
                                        <div className="flex flex-wrap gap-2">
                                            {equipoDetalle.metrologos_asignados?.map(m => (
                                                <div key={m.id} className={`px-5 py-3 rounded-2xl border flex items-center gap-3 transition-all ${darkMode ? 'bg-white/5 border-white/5 text-white/80' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                                                    <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/50" />
                                                    <span className="text-xs font-black uppercase tracking-tight">{m.nombre}</span>
                                                </div>
                                            ))}
                                            {!equipoDetalle.metrologos_asignados?.length && <p className="text-xs italic opacity-30">Sin personal técnico asignado</p>}
                                        </div>
                                    </section>

                                    <section>
                                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] mb-6 opacity-30 flex items-center gap-2">
                                            <Layers size={14} /> Cliente & Servicio
                                        </h4>
                                        <div className={`p-8 rounded-[2.5rem] border ${darkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100 shadow-sm'}`}>
                                            <div className="flex items-center gap-4 mb-4">
                                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${darkMode ? 'bg-white/10' : 'bg-white shadow-sm'}`}>
                                                    <User className="opacity-40" />
                                                </div>
                                                <div>
                                                    <p className={`text-md font-black uppercase tracking-tight ${textMain}`}>{equipoDetalle.empresa || 'SOCIO COMERCIAL'}</p>
                                                    <p className="text-[10px] font-black opacity-40 uppercase tracking-widest">Contacto Directo</p>
                                                </div>
                                            </div>
                                            <div className="space-y-2 pl-16">
                                                <p className={`text-sm font-bold ${textMain}`}>{equipoDetalle.persona || 'Daniel Ortiz Dominguez'}</p>
                                                <p className={`text-xs opacity-60 font-medium ${darkMode ? 'text-white/60' : 'text-slate-500'}`}>{equipoDetalle.correo || 'soporte@cliente.com'}</p>
                                            </div>
                                        </div>
                                    </section>
                                </div>
                            </div>
                        </div>
                        
                        <div className={`p-8 border-t flex justify-between gap-4 ${darkMode ? 'bg-black/20 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
                            <button 
                                onClick={() => eliminarInstrumento(equipoDetalle.id)}
                                className="px-10 py-5 rounded-2xl text-xs font-black uppercase tracking-widest text-rose-500 hover:bg-rose-500/10 transition-all flex items-center gap-3"
                            >
                                <Trash2 size={20} /> Eliminar Instrumento
                            </button>
                            <div className="flex gap-4">
                                <button 
                                    onClick={() => { setModalEditar(true); setEquipoEditando(equipoDetalle); setModalDetalle(false); }}
                                    className={`px-10 py-5 rounded-[1.5rem] text-xs font-black uppercase tracking-widest border transition-all ${darkMode ? 'border-white/10 text-white hover:bg-white/5' : 'border-slate-200 text-slate-700 hover:bg-white'}`}
                                >
                                    Editar Información
                                </button>
                                <button 
                                    onClick={() => setModalDetalle(false)}
                                    className={`px-12 py-5 rounded-[1.8rem] text-xs font-black uppercase tracking-[0.2em] shadow-2xl transition-all hover:scale-105 ${darkMode ? 'bg-[#C9EA63] text-black shadow-[#C9EA63]/20' : 'bg-[#008a5e] text-white shadow-[#008a5e]/20'}`}
                                >
                                    Entendido
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL GESTIÓN COMPLETA (ORDEN) */}
            {modalOrden && (
                <div className="fixed inset-0 z-[1100] flex items-center justify-center p-2 md:p-4 backdrop-blur-xl bg-black/40 animate-in fade-in duration-500">
                    <div className={`w-full max-w-[98vw] max-h-[98vh] overflow-hidden rounded-[2.5rem] shadow-2xl border flex flex-col animate-in zoom-in-95 duration-500 ${bgContainer} ${borderCard}`}>
                        <div className={`p-6 md:p-8 border-b flex justify-between items-center ${darkMode ? 'border-white/5' : 'border-slate-100'}`}>
                            <div className="flex items-center gap-4 md:gap-6">
                                <div className={`p-4 md:p-5 rounded-[1.5rem] md:rounded-[2.5rem] ${darkMode ? 'bg-[#C9EA63] text-black' : 'bg-[#008a5e] text-white'} shadow-lg`}>
                                    <Settings2 size={24} className="md:w-8 md:h-8" />
                                </div>
                                <div>
                                    <h3 className={`text-xl md:text-2xl font-black uppercase tracking-tight ${textMain}`}>Gestión Integral por Lote</h3>
                                    <p className="text-[9px] font-black opacity-40 uppercase tracking-widest mt-1">Sincronización masiva de datos técnicos: {oc}</p>
                                </div>
                            </div>
                            <button onClick={() => setModalOrden(false)} className="opacity-40 hover:opacity-100 transition-all hover:rotate-90"><X size={32} /></button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-12 custom-scrollbar space-y-12">
                            {/* Cabecera Global */}
                            <div className={`p-10 rounded-[3rem] border ${darkMode ? 'bg-[#C9EA63]/5 border-[#C9EA63]/10' : 'bg-emerald-50 border-emerald-100'}`}>
                                <h4 className={`text-[11px] font-black uppercase tracking-widest mb-6 opacity-60 ${darkMode ? 'text-[#C9EA63]' : 'text-emerald-800'}`}>Configuración Global del Lote</h4>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase opacity-40 ml-2">Empresa / Socio</label>
                                        <input 
                                            type="text" 
                                            value={instrumentosOrden[0]?.empresa || ""} 
                                            onChange={(e) => {
                                                const val = e.target.value.toUpperCase();
                                                setInstrumentosOrden(instrumentosOrden.map(ins => ({ ...ins, empresa: val })));
                                            }}
                                            className={`w-full p-4 rounded-2xl text-sm font-black border outline-none transition-all ${darkMode ? 'bg-[#141f0b] border-white/10 text-[#C9EA63]' : 'bg-white border-slate-200 text-emerald-800 focus:border-emerald-500'}`} 
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase opacity-40 ml-2">Contacto Principal</label>
                                        <input 
                                            type="text" 
                                            value={instrumentosOrden[0]?.persona || ""} 
                                            onChange={(e) => setInstrumentosOrden(instrumentosOrden.map(ins => ({ ...ins, persona: e.target.value })))}
                                            className={`w-full p-4 rounded-2xl text-sm font-black border outline-none transition-all ${darkMode ? 'bg-[#141f0b] border-white/10 text-white' : 'bg-white border-slate-200 text-slate-800 focus:border-emerald-500'}`} 
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase opacity-40 ml-2">Área Laboratorio (Masivo)</label>
                                        <Select 
                                            options={areas}
                                            styles={selectStyles}
                                            onChange={(val) => {
                                                if(window.confirm("¿Asignar este área a TODOS los equipos del lote?")) {
                                                    setInstrumentosOrden(instrumentosOrden.map(ins => ({ ...ins, area_laboratorio: val.value })));
                                                }
                                            }}
                                            placeholder="CAMBIAR TODO..."
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase opacity-40 ml-2">Metrólogos (Masivo)</label>
                                        <Select 
                                            isMulti
                                            options={metrologosDisponibles}
                                            styles={selectStyles}
                                            onChange={(vals) => {
                                                if(window.confirm("¿Asignar estos técnicos a TODOS los equipos del lote?")) {
                                                    setInstrumentosOrden(instrumentosOrden.map(ins => ({ ...ins, metrologos_asignados: vals })));
                                                }
                                            }}
                                            placeholder="ASIGNAR A TODOS..."
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Listado de Equipos Editables */}
                            <div className="space-y-6">
                                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                    <div className="flex items-center gap-3">
                                        <List size={20} className="opacity-20" />
                                        <h4 className={`text-xl font-black uppercase tracking-tight ${textMain}`}>Detalle de ítems en el lote</h4>
                                    </div>
                                    <button 
                                        onClick={() => setModalAgregar(true)}
                                        className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-md hover:scale-105 active:scale-95 ${darkMode ? 'bg-white text-black' : 'bg-slate-900 text-white'}`}
                                    >
                                        <Plus size={16} /> Agregar Nuevo Equipo al Lote
                                    </button>
                                </div>
                                
                                <div className={`rounded-[3rem] border overflow-hidden ${darkMode ? 'border-white/5 bg-white/5' : 'border-slate-100 bg-slate-50/50'}`}>
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className={`text-[11px] font-black uppercase tracking-[0.2em] opacity-50 ${darkMode ? 'bg-white/5' : 'bg-slate-100'}`}>
                                                <th className="p-6">Instrumento / Marca / Modelo</th>
                                                <th className="p-6">Serie / ID / Ubicación</th>
                                                <th className="p-6">Área / SLA / Requerimientos</th>
                                                <th className="p-6 text-center text-rose-500 uppercase">Borrar</th>
                                            </tr>
                                        </thead>
                                        <tbody className={`divide-y ${darkMode ? 'divide-white/5' : 'divide-slate-100'}`}>
                                            {instrumentosOrden.map((ins, idx) => (
                                                <tr key={idx} className={`group transition-all ${darkMode ? 'hover:bg-white/5' : 'hover:bg-white'}`}>
                                                    <td className="p-6">
                                                        <div className="grid grid-cols-1 gap-3">
                                                            <div className="space-y-1">
                                                                <label className="text-[10px] font-black opacity-30 uppercase ml-1">Instrumento</label>
                                                                <input type="text" value={ins.nombre_instrumento} onChange={e => actualizarItemOrden(idx, 'nombre_instrumento', e.target.value.toUpperCase())} className={`w-full p-3 rounded-xl text-base font-black border outline-none ${darkMode ? 'bg-[#141f0b] border-white/10 text-white' : 'bg-white border-slate-200 focus:border-emerald-500'}`} />
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-2">
                                                                <div className="space-y-1">
                                                                    <label className="text-[8px] font-black opacity-30 uppercase ml-1">Marca</label>
                                                                    <input type="text" value={ins.marca} onChange={e => actualizarItemOrden(idx, 'marca', e.target.value.toUpperCase())} className={`w-full p-2 rounded-lg text-[10px] font-bold border outline-none ${darkMode ? 'bg-[#141f0b] border-white/5 text-white/60' : 'bg-white border-slate-200'}`} />
                                                                </div>
                                                                <div className="space-y-1">
                                                                    <label className="text-[8px] font-black opacity-30 uppercase ml-1">Modelo</label>
                                                                    <input type="text" value={ins.modelo} onChange={e => actualizarItemOrden(idx, 'modelo', e.target.value.toUpperCase())} className={`w-full p-2 rounded-lg text-[10px] font-bold border outline-none ${darkMode ? 'bg-[#141f0b] border-white/5 text-white/60' : 'bg-white border-slate-200'}`} />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="p-6">
                                                        <div className="grid grid-cols-1 gap-3">
                                                            <div className="space-y-1">
                                                                <label className="text-[10px] font-black opacity-30 uppercase ml-1">No. Serie</label>
                                                                <input type="text" value={ins.no_serie} onChange={e => actualizarItemOrden(idx, 'no_serie', e.target.value)} className={`w-full p-3 rounded-xl text-base font-mono font-black border outline-none ${darkMode ? 'bg-[#141f0b] border-white/10 text-white' : 'bg-white border-slate-200 focus:border-emerald-500'}`} />
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-2">
                                                                <div className="space-y-1">
                                                                    <label className="text-[10px] font-black opacity-30 uppercase ml-1">ID Único</label>
                                                                    <input type="text" value={ins.identificacion} onChange={e => actualizarItemOrden(idx, 'identificacion', e.target.value.toUpperCase())} className={`w-full p-2 rounded-lg text-xs font-black border outline-none ${darkMode ? 'bg-[#141f0b] border-white/10 text-white' : 'bg-white border-slate-200'}`} />
                                                                </div>
                                                                <div className="space-y-1">
                                                                    <label className="text-[10px] font-black opacity-30 uppercase ml-1">Ubicación</label>
                                                                    <input type="text" value={ins.ubicacion} onChange={e => actualizarItemOrden(idx, 'ubicacion', e.target.value.toUpperCase())} className={`w-full p-2 rounded-lg text-xs font-black border outline-none ${darkMode ? 'bg-[#141f0b] border-white/10 text-white' : 'bg-white border-slate-200'}`} />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="p-6">
                                                        <div className="flex flex-col gap-4">
                                                            <div className="grid grid-cols-2 gap-3">
                                                                <div className="space-y-1 text-left">
                                                                    <label className="text-[10px] font-black opacity-30 uppercase ml-1">Área Laboratorio</label>
                                                                    <Select 
                                                                        options={areas}
                                                                        value={areas.find(a => a.value === ins.area_laboratorio)}
                                                                        onChange={(val) => actualizarItemOrden(idx, 'area_laboratorio', val.value)}
                                                                        styles={selectStyles}
                                                                        placeholder="ÁREA..."
                                                                    />
                                                                </div>
                                                                <div className="space-y-1 text-left">
                                                                    <label className="text-[10px] font-black opacity-30 uppercase ml-1">SLA (Días)</label>
                                                                    <input type="number" value={ins.sla || 20} onChange={e => actualizarItemOrden(idx, 'sla', e.target.value)} className={`w-full p-2.5 rounded-xl text-sm font-black border outline-none ${darkMode ? 'bg-[#141f0b] border-white/10 text-[#C9EA63]' : 'bg-white border-slate-200 text-emerald-700'}`} />
                                                                </div>
                                                            </div>

                                                            <div className="space-y-1 text-left">
                                                                <label className="text-[10px] font-black opacity-30 uppercase ml-1">Metrólogos Responsables</label>
                                                                <Select 
                                                                    isMulti
                                                                    options={metrologosDisponibles}
                                                                    value={ins.metrologos_asignados}
                                                                    onChange={(vals) => actualizarItemOrden(idx, 'metrologos_asignados', vals)}
                                                                    styles={selectStyles}
                                                                    placeholder="ELEGIR..."
                                                                />
                                                            </div>

                                                            <div className="grid grid-cols-2 gap-3">
                                                                <div className="space-y-1 text-left">
                                                                    <label className="text-[10px] font-black opacity-30 uppercase ml-1">Requerimientos</label>
                                                                    <textarea rows={1} value={ins.requerimientos_especiales || ""} onChange={e => actualizarItemOrden(idx, 'requerimientos_especiales', e.target.value)} placeholder="REQ..." className={`w-full p-2 rounded-lg text-[10px] font-bold border outline-none resize-none ${darkMode ? 'bg-[#141f0b] border-white/5 text-white/40' : 'bg-white border-slate-200'}`} />
                                                                </div>
                                                                <div className="space-y-1 text-left">
                                                                    <label className="text-[10px] font-black opacity-30 uppercase ml-1">Puntos Calibración</label>
                                                                    <textarea rows={1} value={ins.puntos_calibrar || ""} onChange={e => actualizarItemOrden(idx, 'puntos_calibrar', e.target.value)} placeholder="PUNTOS..." className={`w-full p-2 rounded-lg text-[10px] font-bold border outline-none resize-none ${darkMode ? 'bg-[#141f0b] border-white/5 text-white/40' : 'bg-white border-slate-200'}`} />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="p-8 text-center">
                                                        <button 
                                                            onClick={() => {
                                                                if(window.confirm("¿Seguro que deseas eliminar este equipo de la orden?")) {
                                                                    setInstrumentosOrden(instrumentosOrden.filter((_, i) => i !== idx));
                                                                    if(ins.id) setEliminadosIds([...eliminadosIds, ins.id]);
                                                                }
                                                            }}
                                                            className="p-4 rounded-2xl text-rose-500 hover:bg-rose-500/10 transition-all"
                                                        >
                                                            <Trash2 size={24} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        <div className={`p-8 md:p-10 border-t flex flex-col md:flex-row justify-end gap-4 md:gap-6 ${darkMode ? 'bg-black/20 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
                            <button 
                                onClick={() => setModalOrden(false)} 
                                disabled={guardandoOrden}
                                className={`px-8 md:px-10 py-4 md:py-5 rounded-xl md:rounded-2xl text-[10px] md:text-[11px] font-black uppercase tracking-widest transition-all ${darkMode ? 'text-white/40 hover:text-white' : 'text-slate-500 hover:text-slate-800'}`}
                            >
                                Descartar Cambios
                            </button>
                            <button 
                                onClick={guardarCambiosOrden} 
                                disabled={guardandoOrden}
                                className={`px-10 md:px-16 py-4 md:py-5 rounded-xl md:rounded-[1.5rem] text-[10px] md:text-[11px] font-black uppercase tracking-[0.2em] shadow-xl flex items-center justify-center gap-4 transition-all hover:scale-105 active:scale-95 ${darkMode ? 'bg-[#C9EA63] text-[#141f0b] shadow-[#C9EA63]/20' : 'bg-[#008a5e] text-white shadow-[#008a5e]/10'}`}
                            >
                                {guardandoOrden ? <RefreshCw className="animate-spin" size={18} /> : <Save size={18} />} 
                                Sincronizar Orden Completa
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* MODAL EDITAR INDIVIDUAL (EXPANDIDO) */}
            {modalEditar && equipoEditando && (
                <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4 backdrop-blur-xl bg-black/60 animate-in fade-in duration-500">
                    <div className={`w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-[3.5rem] shadow-4xl border flex flex-col animate-in zoom-in-95 duration-500 ${bgContainer} ${borderCard}`}>
                        <div className={`p-8 border-b flex justify-between items-center ${darkMode ? 'border-white/5 bg-white/5' : 'border-slate-100 bg-slate-50/50'}`}>
                            <div className="flex items-center gap-4">
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${darkMode ? 'bg-[#C9EA63] text-black' : 'bg-[#008a5e] text-white'}`}>
                                    <Edit size={24} />
                                </div>
                                <div>
                                    <h3 className={`text-xl font-black uppercase tracking-tight ${textMain}`}>Editar Instrumento</h3>
                                    <p className="text-[10px] font-black opacity-40 uppercase tracking-widest mt-1">ID: {equipoEditando.identificacion || 'N/A'}</p>
                                </div>
                            </div>
                            <button onClick={() => setModalEditar(false)} className="opacity-40 hover:opacity-100 transition-all"><X size={32} /></button>
                        </div>

                        <div className="p-10 space-y-10 overflow-y-auto custom-scrollbar flex-1">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                {/* Sección Equipo */}
                                <div className="space-y-6">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest opacity-40">Datos Técnicos</h4>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2 col-span-2">
                                            <label className="text-[10px] font-black uppercase opacity-40 ml-2">Nombre del Instrumento</label>
                                            <input type="text" value={equipoEditando.nombre_instrumento || ""} onChange={e => setEquipoEditando({...equipoEditando, nombre_instrumento: e.target.value.toUpperCase()})} className={`w-full p-4 rounded-2xl text-sm font-black border outline-none transition-all ${darkMode ? 'bg-[#141f0b] border-white/10 text-white' : 'bg-white border-slate-200 text-slate-800 focus:border-emerald-500'}`} />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase opacity-40 ml-2">Marca</label>
                                            <input type="text" value={equipoEditando.marca || ""} onChange={e => setEquipoEditando({...equipoEditando, marca: e.target.value.toUpperCase()})} className={`w-full p-4 rounded-2xl text-sm font-bold border outline-none transition-all ${darkMode ? 'bg-[#141f0b] border-white/10 text-white' : 'bg-white border-slate-200 focus:border-emerald-500'}`} />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase opacity-40 ml-2">Modelo</label>
                                            <input type="text" value={equipoEditando.modelo || ""} onChange={e => setEquipoEditando({...equipoEditando, modelo: e.target.value.toUpperCase()})} className={`w-full p-4 rounded-2xl text-sm font-bold border outline-none transition-all ${darkMode ? 'bg-[#141f0b] border-white/10 text-white' : 'bg-white border-slate-200 focus:border-emerald-500'}`} />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase opacity-40 ml-2">No. Serie</label>
                                            <input type="text" value={equipoEditando.no_serie || ""} onChange={e => setEquipoEditando({...equipoEditando, no_serie: e.target.value})} className={`w-full p-4 rounded-2xl text-sm font-mono font-black border outline-none transition-all ${darkMode ? 'bg-[#141f0b] border-white/10 text-white' : 'bg-white border-slate-200 focus:border-emerald-500'}`} />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase opacity-40 ml-2">ID Único</label>
                                            <input type="text" value={equipoEditando.identificacion || ""} onChange={e => setEquipoEditando({...equipoEditando, identificacion: e.target.value.toUpperCase()})} className={`w-full p-4 rounded-2xl text-sm font-mono font-black border outline-none transition-all ${darkMode ? 'bg-[#141f0b] border-white/10 text-white' : 'bg-white border-slate-200 focus:border-emerald-500'}`} />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase opacity-40 ml-2">Ubicación</label>
                                            <input type="text" value={equipoEditando.ubicacion || ""} onChange={e => setEquipoEditando({...equipoEditando, ubicacion: e.target.value})} className={`w-full p-4 rounded-2xl text-sm font-bold border outline-none transition-all ${darkMode ? 'bg-[#141f0b] border-white/10 text-white' : 'bg-white border-slate-200 focus:border-emerald-500'}`} />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase opacity-40 ml-2">Área Laboratorio</label>
                                            <Select options={areas} value={areas.find(a => a.value === equipoEditando.area_laboratorio)} onChange={val => setEquipoEditando({...equipoEditando, area_laboratorio: val.value})} styles={selectStyles} />
                                        </div>
                                    </div>
                                </div>

                                {/* Sección Servicio */}
                                <div className="space-y-6">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest opacity-40">Servicio & Tiempos</h4>
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase opacity-40 ml-2">SLA (Días)</label>
                                            <input type="number" value={equipoEditando.sla || 20} onChange={e => setEquipoEditando({...equipoEditando, sla: e.target.value})} className={`w-full p-4 rounded-2xl text-sm font-black border outline-none transition-all ${darkMode ? 'bg-[#141f0b] border-white/10 text-white' : 'bg-white border-slate-200 focus:border-emerald-500'}`} />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase opacity-40 ml-2">Metrólogos Asignados</label>
                                            <Select isMulti options={metrologosDisponibles} value={equipoEditando.metrologos_asignados} onChange={vals => setEquipoEditando({...equipoEditando, metrologos_asignados: vals})} styles={selectStyles} />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase opacity-40 ml-2">Requerimientos Especiales</label>
                                            <textarea rows={2} value={equipoEditando.requerimientos_especiales || ""} onChange={e => setEquipoEditando({...equipoEditando, requerimientos_especiales: e.target.value})} className={`w-full p-4 rounded-2xl text-xs font-bold border outline-none resize-none transition-all ${darkMode ? 'bg-[#141f0b] border-white/10 text-white' : 'bg-white border-slate-200 focus:border-emerald-500'}`} />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase opacity-40 ml-2">Puntos a Calibrar</label>
                                            <textarea rows={2} value={equipoEditando.puntos_calibrar || ""} onChange={e => setEquipoEditando({...equipoEditando, puntos_calibrar: e.target.value})} className={`w-full p-4 rounded-2xl text-xs font-bold border outline-none resize-none transition-all ${darkMode ? 'bg-[#141f0b] border-white/10 text-white' : 'bg-white border-slate-200 focus:border-emerald-500'}`} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className={`p-8 border-t flex justify-end gap-4 ${darkMode ? 'bg-black/20 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
                            <button onClick={() => setModalEditar(false)} className="px-8 py-4 text-xs font-black uppercase opacity-40 hover:opacity-100 transition-all tracking-widest">Descartar</button>
                            <button onClick={guardarCambiosIndividual} className={`px-12 py-5 rounded-[2rem] text-xs font-black uppercase tracking-widest shadow-2xl transition-all hover:scale-105 active:scale-95 ${darkMode ? 'bg-[#C9EA63] text-black shadow-[#C9EA63]/20' : 'bg-[#008a5e] text-white shadow-[#008a5e]/20'}`}>
                                <Save size={18} className="inline mr-2" /> Guardar Cambios
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL AGREGAR INSTRUMENTO (NUEVO) */}
            {modalAgregar && (
                <div className="fixed inset-0 z-[1250] flex items-center justify-center p-2 md:p-4 backdrop-blur-xl bg-black/40 animate-in fade-in duration-500">
                    <div className={`w-full max-w-4xl max-h-[96vh] md:max-h-[85vh] overflow-hidden rounded-[2.5rem] shadow-2xl border flex flex-col animate-in zoom-in-95 duration-500 ${bgContainer} ${borderCard}`}>
                        <div className={`p-6 md:p-8 border-b flex justify-between items-center ${darkMode ? 'border-white/5 bg-white/5' : 'border-slate-100 bg-slate-50/50'}`}>
                            <div className="flex items-center gap-4">
                                <div className={`w-12 h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center ${darkMode ? 'bg-white text-black shadow-md' : 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/10'}`}>
                                    <Plus size={24} />
                                </div>
                                <div>
                                    <h3 className={`text-lg md:text-xl font-black uppercase tracking-tight ${textMain}`}>Registrar Nuevo Instrumento</h3>
                                    <p className="text-[9px] font-black opacity-40 uppercase tracking-widest mt-1">Vincular equipo al Lote: {oc}</p>
                                </div>
                            </div>
                            <button onClick={() => setModalAgregar(false)} className="opacity-40 hover:opacity-100 transition-all"><X size={32} /></button>
                        </div>

                        <div className="p-10 space-y-10 overflow-y-auto custom-scrollbar flex-1">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                {/* Datos Equipo */}
                                <div className="space-y-6">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest opacity-40">Especificaciones Técnicas</h4>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2 col-span-2">
                                            <label className="text-[10px] font-black uppercase opacity-40 ml-2">Nombre del Instrumento</label>
                                            <input type="text" value={nuevoEquipo.nombre_instrumento} onChange={e => setNuevoEquipo({...nuevoEquipo, nombre_instrumento: e.target.value.toUpperCase()})} placeholder="EJ: TERMÓMETRO DIGITAL" className={`w-full p-4 rounded-2xl text-sm font-black border outline-none transition-all ${darkMode ? 'bg-[#141f0b] border-white/10 text-white' : 'bg-white border-slate-200 focus:border-emerald-500'}`} />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase opacity-40 ml-2">Marca</label>
                                            <input type="text" value={nuevoEquipo.marca} onChange={e => setNuevoEquipo({...nuevoEquipo, marca: e.target.value.toUpperCase()})} placeholder="MARCA..." className={`w-full p-4 rounded-2xl text-sm font-bold border outline-none transition-all ${darkMode ? 'bg-[#141f0b] border-white/10 text-white' : 'bg-white border-slate-200 focus:border-emerald-500'}`} />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase opacity-40 ml-2">Modelo</label>
                                            <input type="text" value={nuevoEquipo.modelo} onChange={e => setNuevoEquipo({...nuevoEquipo, modelo: e.target.value.toUpperCase()})} placeholder="MODELO..." className={`w-full p-4 rounded-2xl text-sm font-bold border outline-none transition-all ${darkMode ? 'bg-[#141f0b] border-white/10 text-white' : 'bg-white border-slate-200 focus:border-emerald-500'}`} />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase opacity-40 ml-2">No. Serie</label>
                                            <input type="text" value={nuevoEquipo.no_serie} onChange={e => setNuevoEquipo({...nuevoEquipo, no_serie: e.target.value})} placeholder="SERIE..." className={`w-full p-4 rounded-2xl text-sm font-mono font-black border outline-none transition-all ${darkMode ? 'bg-[#141f0b] border-white/10 text-white' : 'bg-white border-slate-200 focus:border-emerald-500'}`} />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase opacity-40 ml-2">ID / Tag Único</label>
                                            <input type="text" value={nuevoEquipo.identificacion} onChange={e => setNuevoEquipo({...nuevoEquipo, identificacion: e.target.value.toUpperCase()})} placeholder="ID ÚNICO..." className={`w-full p-4 rounded-2xl text-sm font-mono font-black border outline-none transition-all ${darkMode ? 'bg-[#141f0b] border-white/10 text-white' : 'bg-white border-slate-200 focus:border-emerald-500'}`} />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase opacity-40 ml-2">Área Lab</label>
                                            <Select options={areas} onChange={val => setNuevoEquipo({...nuevoEquipo, area_laboratorio: val.value})} placeholder="ELEGIR ÁREA..." styles={selectStyles} />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase opacity-40 ml-2">SLA (Días)</label>
                                            <input type="number" value={nuevoEquipo.sla} onChange={e => setNuevoEquipo({...nuevoEquipo, sla: e.target.value})} className={`w-full p-4 rounded-2xl text-sm font-black border outline-none transition-all ${darkMode ? 'bg-[#141f0b] border-white/10 text-white' : 'bg-white border-slate-200 focus:border-emerald-500'}`} />
                                        </div>
                                    </div>
                                </div>

                                {/* Servicio y Notas */}
                                <div className="space-y-6">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest opacity-40">Requisitos & Asignación</h4>
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase opacity-40 ml-2">Ubicación / Planta</label>
                                            <input type="text" value={nuevoEquipo.ubicacion} onChange={e => setNuevoEquipo({...nuevoEquipo, ubicacion: e.target.value})} placeholder="PISO 1, ÁREA X..." className={`w-full p-4 rounded-2xl text-sm font-bold border outline-none transition-all ${darkMode ? 'bg-[#141f0b] border-white/10 text-white' : 'bg-white border-slate-200 focus:border-emerald-500'}`} />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase opacity-40 ml-2">Metrólogos Asignados</label>
                                            <Select isMulti options={metrologosDisponibles} onChange={vals => setNuevoEquipo({...nuevoEquipo, metrologos_asignados: vals})} styles={selectStyles} placeholder="ASIGNAR TÉCNICOS..." />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase opacity-40 ml-2">Requerimientos Especiales</label>
                                            <textarea rows={2} value={nuevoEquipo.requerimientos_especiales} onChange={e => setNuevoEquipo({...nuevoEquipo, requerimientos_especiales: e.target.value})} placeholder="REQUISITOS DEL CLIENTE..." className={`w-full p-4 rounded-2xl text-xs font-bold border outline-none resize-none transition-all ${darkMode ? 'bg-[#141f0b] border-white/10 text-white' : 'bg-white border-slate-200 focus:border-emerald-500'}`} />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase opacity-40 ml-2">Puntos a Calibrar</label>
                                            <textarea rows={2} value={nuevoEquipo.puntos_calibrar} onChange={e => setNuevoEquipo({...nuevoEquipo, puntos_calibrar: e.target.value})} placeholder="PUNTOS ESPECÍFICOS..." className={`w-full p-4 rounded-2xl text-xs font-bold border outline-none resize-none transition-all ${darkMode ? 'bg-[#141f0b] border-white/10 text-white' : 'bg-white border-slate-200 focus:border-emerald-500'}`} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className={`p-6 md:p-8 border-t flex justify-end gap-3 md:gap-4 ${darkMode ? 'bg-black/20 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
                            <button onClick={() => setModalAgregar(false)} className="px-6 md:px-8 py-3 md:py-4 text-[10px] font-black uppercase opacity-40 hover:opacity-100 transition-all tracking-widest">Cancelar</button>
                            <button onClick={crearInstrumento} className={`px-10 md:px-12 py-4 md:py-5 rounded-[1.5rem] md:rounded-[2rem] text-[10px] font-black uppercase tracking-widest shadow-xl transition-all hover:scale-105 active:scale-95 ${darkMode ? 'bg-white text-black' : 'bg-slate-900 text-white shadow-slate-900/20'}`}>
                                <Activity size={16} className="inline mr-2" /> Vincular al Lote
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GestionGrupo;
