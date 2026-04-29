import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Package, Clock, AlertTriangle, AlertCircle, CheckCircle, Search, MessageSquare, ChevronDown, ChevronUp, CheckSquare, Square, ThumbsUp, HelpCircle, X, Paperclip, Tag, BookOpen, Hash, User, Calendar, FileText, FileCheck, Image as ImageIcon, Eye, ArrowRight, Camera, Send } from 'lucide-react';
import { toast } from 'react-toastify';

const getOsaColor = (osStr, isDark) => {
    if (!osStr) return isDark ? '#2a401c' : '#ffffff';
    let hash = 0;
    for (let i = 0; i < osStr.length; i++) {
        hash = osStr.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return isDark ? `hsl(${hue}, 40%, 20%)` : `hsl(${hue}, 70%, 95%)`;
};

const MetrologiaDashboard = ({ darkMode, usuario }) => {
    const navigate = useNavigate();
    const [equiposGlobales, setEquiposGlobales] = useState([]);
    const [tabActual, setTabActual] = useState('Laboratorio');
    const [cargando, setCargando] = useState(true);
    const [busqueda, setBusqueda] = useState('');
    const [prioridadFiltro, setPrioridadFiltro] = useState(null);
    
    // Selección de equipos (IDs)
    const [seleccionados, setSeleccionados] = useState([]);
    const [modalConf, setModalConf] = useState(false);
    const [alertasConf, setAlertasConf] = useState([]);
    const [comentarioGlobal, setComentarioGlobal] = useState('');
    const [gruposExpandidosMet, setGruposExpandidosMet] = useState(new Set());

    const seleccionarOC = (oc, items) => {
        const ids = items.map(i => i.id);
        const todosSel = ids.every(id => seleccionados.includes(id));
        if (todosSel) {
            setSeleccionados(prev => prev.filter(id => !ids.includes(id)));
        } else {
            setSeleccionados(prev => [...new Set([...prev, ...ids])]);
        }
    };

    // Modal de comentarios
    const [comentariosActivos, setComentariosActivos] = useState(null); // instrumento_id
    const [listaComentarios, setListaComentarios] = useState([]);
    const [nuevoComentario, setNuevoComentario] = useState('');
    const [archivoChat, setArchivoChat] = useState(null);
    
    // Modal de Detalle
    const [modalDetalle, setModalDetalle] = useState(false);
    const [equipoDetalle, setEquipoDetalle] = useState(null);

    const fetchData = async () => {
        try {
            setCargando(true);
            const res = await axios.get('/api/instrumentos');
            setEquiposGlobales(res.data);
        } catch (error) {
            console.error(error);
        } finally {
            setCargando(false);
        }
    };

    useEffect(() => {
        fetchData();
        window.addEventListener('crm:refresh', fetchData);
        return () => window.removeEventListener('crm:refresh', fetchData);
    }, []);

    // Calcular Prioridades
    const equiposConSLA = equiposGlobales.map(e => {
        const dIngreso = new Date(e.fecha_ingreso);
        const hoy = new Date();
        const diasPasados = Math.floor((hoy - dIngreso) / (1000 * 60 * 60 * 24));
        const slaRestante = e.sla - diasPasados;
        
        let prioridad = 'Verde'; // >3
        if (slaRestante <= 1) prioridad = 'Rojo';
        else if (slaRestante <= 3) prioridad = 'Amarillo';

        return { ...e, slaRestante, prioridad, diasPasados };
    });

    const idUsuarioActual = usuario?.id || 1;

    // Derived State - Filtrar por asignación
    let equiposFiltroTab = [];
    if (tabActual === 'Laboratorio') {
        equiposFiltroTab = equiposConSLA.filter(e => {
            const enLab = e.estatus_actual === 'Laboratorio';
            if (usuario?.rol === 'admin') return enLab; // Admins ven todo en Lab
            
            const soyAsignadoLegacy = Number(e.metrologo_asignado_id) === Number(idUsuarioActual);
            const soyAsignadoMultiple = e.metrologos_asignados?.some(m => Number(m.id) === Number(idUsuarioActual) && (m.estatus === 'asignado' || m.estatus === 'correccion'));
            return enLab && (soyAsignadoLegacy || soyAsignadoMultiple);
        });
    } else if (tabActual === 'Historial') {
        equiposFiltroTab = equiposConSLA.filter(e => ['Validación', 'Aseguramiento', 'Certificación', 'Listo'].includes(e.estatus_actual));
    } else if (tabActual === 'Entregados') {
        equiposFiltroTab = equiposConSLA.filter(e => e.estatus_actual === 'Entregado');
    } else if (tabActual === 'Vencidos') {
        equiposFiltroTab = equiposConSLA.filter(e => e.estatus_actual === 'Laboratorio' && e.slaRestante <= 0);
    }

    if (tabActual === 'Laboratorio' && prioridadFiltro) {
        equiposFiltroTab = equiposFiltroTab.filter(e => e.prioridad === prioridadFiltro);
    }

    const filtrados = equiposFiltroTab.filter(e => 
        (e.orden_cotizacion || '').toLowerCase().includes(busqueda.toLowerCase()) ||
        (e.empresa || '').toLowerCase().includes(busqueda.toLowerCase()) ||
        (e.nombre_instrumento || '').toLowerCase().includes(busqueda.toLowerCase())
    );

    // Lógica de conteo global para agrupaciones inteligentes
    const countsByOCGlobal = {};
    equiposGlobales.forEach(e => {
        const oc = e.orden_cotizacion || 'S/N';
        countsByOCGlobal[oc] = (countsByOCGlobal[oc] || 0) + 1;
    });

    // Agrupar dinámicamente: Si el OC tiene 5 o más en TOTAL (global), es un grupo.
    const tempGroups = {};
    filtrados.forEach(e => {
        if (!tempGroups[e.orden_cotizacion]) tempGroups[e.orden_cotizacion] = [];
        tempGroups[e.orden_cotizacion].push(e);
    });

    const grouped = [];
    const usedOCs = new Set();

    filtrados.forEach(e => {
        if (usedOCs.has(e.orden_cotizacion)) return;
        const groupItems = tempGroups[e.orden_cotizacion];
        const globalCount = countsByOCGlobal[e.orden_cotizacion] || 0;
        
        if (globalCount >= 2) {
            grouped.push({ isGroup: true, oc: e.orden_cotizacion, items: groupItems, totalGlobal: globalCount });
            usedOCs.add(e.orden_cotizacion);
        } else {
            // Si son menos de 5, los metemos individuales en el orden que venían
            groupItems.forEach(item => {
                grouped.push({ ...item, isGroup: false });
            });
            usedOCs.add(e.orden_cotizacion);
        }
    });

    const getTipoLabel = (oc = '') => {
        if (oc.startsWith('C')) return 'COTIZACIÓN';
        if (oc.startsWith('O')) return 'ORDEN DE SERVICIO';
        return 'ORDEN';
    };

    // KPIs (Siempre calculados sobre los de Laboratorio independientemente de la pestaña)
    const enLaboratorioKPIs = equiposConSLA.filter(e => e.estatus_actual === 'Laboratorio');
    const countTotal = enLaboratorioKPIs.length;
    const countRojo = enLaboratorioKPIs.filter(e => e.prioridad === 'Rojo').length;
    const countAmarillo = enLaboratorioKPIs.filter(e => e.prioridad === 'Amarillo').length;
    const countVerde = enLaboratorioKPIs.filter(e => e.prioridad === 'Verde').length;

    // Lógica Magica (Selección)
    const toggleSeleccion = (id) => {
        if (seleccionados.includes(id)) {
            setSeleccionados(seleccionados.filter(x => x !== id));
        } else {
            setSeleccionados([...seleccionados, id]);
        }
    };

    const toggleGrupo = (oc, equiposGrupo) => {
        const idsGrupo = equiposGrupo.map(e => e.id);
        const estantodos = idsGrupo.every(id => seleccionados.includes(id));
        if (estantodos) {
            setSeleccionados(seleccionados.filter(id => !idsGrupo.includes(id)));
        } else {
            const nuevos = [...seleccionados];
            idsGrupo.forEach(id => {
                if (!nuevos.includes(id)) nuevos.push(id);
            });
            setSeleccionados(nuevos);
        }
    };

    const prepararEnvio = () => {
        const selEquipos = equiposConSLA.filter(e => seleccionados.includes(e.id));
        const ocs = [...new Set(selEquipos.map(e => e.orden_cotizacion))];
        
        let alerts = [];
        ocs.forEach(oc => {
            const totalOC = equiposGlobales.filter(e => e.orden_cotizacion === oc);
            const enLote = selEquipos.filter(e => e.orden_cotizacion === oc);
            
            if (enLote.length < totalOC.length) {
                const rest = totalOC.filter(e => !seleccionados.includes(e.id));
                const statusMap = {};
                rest.forEach(r => { statusMap[r.estatus_actual] = (statusMap[r.estatus_actual] || 0) + 1; });
                const statusDesc = Object.entries(statusMap).map(([s, n]) => `${n} en ${s}`).join(', ');
                
                alerts.push(`OC ${oc}: Estás enviando ${enLote.length} de ${totalOC.length} equipos totales. Los restantes (${totalOC.length - enLote.length}) están: ${statusDesc}.`);
            } else {
                alerts.push(`OC ${oc}: Enviando el lote completo (${enLote.length} de ${totalOC.length}).`);
            }
        });
        
        setAlertasConf(alerts);
        setModalConf(true);
    };

    const confirmarEnvioBatch = async () => {
        try {
            // Usamos el nuevo endpoint individual para cada equipo seleccionado
            const promesas = seleccionados.map(id => axios.post(`/api/instrumentos/${id}/finalizar_metrologo`, {}));
            await Promise.all(promesas);
            
            toast.success(`Se ha finalizado el registro técnico de ${seleccionados.length} equipos.`);
            setSeleccionados([]);
            setModalConf(false);
            fetchData();
        } catch (err) {
            toast.error('Error al finalizar metrología');
        }
    };

    const confirmarEnvioIndividual = async (id) => {
        if (!window.confirm("¿Confirmas que has terminado el trabajo técnico de este equipo?")) return;
        try {
            await axios.post(`/api/instrumentos/${id}/finalizar_metrologo`, {});
            toast.success(`Equipo finalizado y enviado a Aseguramiento.`);
            fetchData();
        } catch (err) {
            toast.error('Error al finalizar metrología');
        }
    };

    const solicitarCorreccion = async (instrumentoId, companeroId) => {
        const motivo = window.prompt("Indica el motivo de la corrección:");
        if (!motivo) return;
        try {
            await axios.post(`/api/instrumentos/${instrumentoId}/solicitar_correccion`, {
                usuario_destino_id: companeroId,
                motivo
            });
            toast.warn("Corrección solicitada. El equipo regresará a Laboratorio para revisión.");
            fetchData();
        } catch(err) { toast.error("Error al solicitar corrección"); }
    };

    // Chat
    const abrirComentarios = async (id) => {
        try {
            setComentariosActivos(id);
            const res = await axios.get(`/api/instrumentos/${id}/comentarios`);
            setListaComentarios(res.data);
        } catch (err) { console.error(err); }
    };

    const enviarComentario = async (e) => {
        e.preventDefault();
        try {
            const fd = new FormData();
            fd.append('mensaje', nuevoComentario);
            if (archivoChat) fd.append('archivo', archivoChat);

            await axios.post(`/api/instrumentos/${comentariosActivos}/comentarios`, fd);
            setNuevoComentario('');
            setArchivoChat(null);
            const res = await axios.get(`/api/instrumentos/${comentariosActivos}/comentarios`);
            setListaComentarios(res.data);
        } catch(err) {}
    };

    const abrirDetalles = (eq) => {
        setEquipoDetalle(eq);
        setModalDetalle(true);
    };

    const bgApp = darkMode ? 'bg-[#141f0b]' : 'bg-slate-50';
    const textApp = darkMode ? 'text-[#F2F6F0]' : 'text-slate-800';

    return (
        <div className="w-full relative pb-24 animate-in fade-in">
            {/* Header / KPIs */}
            <div className={`flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-6 mb-6 border-opacity-20 ${darkMode ? 'border-[#C9EA63]' : 'border-[#008a5e]'}`}>
                <div>
                    <h2 className={`text-2xl md:text-3xl font-bold flex items-center gap-3 ${textApp}`}>
                        <Package className={darkMode ? 'text-[#C9EA63]' : 'text-[#008a5e]'} size={32} />
                        Centro de Metrología
                    </h2>
                    <p className={`mt-1 md:mt-2 text-xs md:text-sm ${darkMode ? 'text-[#F2F6F0]/70' : 'text-gray-500'}`}>
                        Registra resultados técnicos, gestiona calibraciones en curso y aprueba equipos hacia Aseguramiento.
                    </p>
                </div>
            </div>
            <div className="mb-6">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div 
                        onClick={() => { setTabActual('Laboratorio'); setPrioridadFiltro(null); }}
                        className={`p-4 rounded-xl border flex flex-col cursor-pointer transition-all hover:scale-105 active:scale-95 ${prioridadFiltro === null && tabActual === 'Laboratorio' ? 'ring-2 ring-slate-400' : ''} ${darkMode ? 'bg-[#1b2b10] border-[#C9EA63]/20' : 'bg-white border-slate-200'}`}
                    >
                        <div className="text-[10px] uppercase font-bold opacity-60 mb-2 flex items-center gap-1"><Package size={14}/> En Laboratorio</div>
                        <div className="text-3xl font-black">{countTotal}</div>
                    </div>
                    <div 
                        onClick={() => { setTabActual('Laboratorio'); setPrioridadFiltro('Rojo'); }}
                        className={`p-4 rounded-xl border flex flex-col cursor-pointer transition-all hover:scale-105 active:scale-95 ${prioridadFiltro === 'Rojo' ? 'ring-2 ring-rose-500' : ''} ${darkMode ? 'bg-rose-950/20 border-rose-900/50 text-rose-400' : 'bg-rose-50 border-rose-200 text-rose-700'}`}
                    >
                        <div className="text-[10px] uppercase font-bold opacity-80 mb-2 flex items-center gap-1"><AlertTriangle size={14}/> Urgentes (&lt; 24h)</div>
                        <div className="text-3xl font-black">{countRojo}</div>
                    </div>
                    <div 
                        onClick={() => navigate('/correcciones-metrologia')}
                        className={`p-4 rounded-xl border flex flex-col cursor-pointer transition-all hover:scale-105 active:scale-95 ${darkMode ? 'bg-rose-600 border-rose-700 text-white animate-pulse shadow-lg' : 'bg-rose-600 text-white shadow-md'}`}
                    >
                        <div className="text-[10px] uppercase font-bold opacity-90 mb-2 flex items-center gap-1"><AlertTriangle size={14}/> Correcciones</div>
                        <div className="text-3xl font-black">{
                            equiposGlobales.filter(e => 
                                e.estatus_actual === 'Laboratorio' && 
                                e.metrologos_asignados?.some(m => Number(m.id) === Number(usuario?.id) && m.estatus === 'correccion')
                            ).length
                        }</div>
                    </div>
                    <div 
                        onClick={() => { setTabActual('Laboratorio'); setPrioridadFiltro('Amarillo'); }}
                        className={`p-4 rounded-xl border flex flex-col cursor-pointer transition-all hover:scale-105 active:scale-95 ${prioridadFiltro === 'Amarillo' ? 'ring-2 ring-amber-500' : ''} ${darkMode ? 'bg-[#C9EA63]/10 border-[#C9EA63]/20 text-[#C9EA63]' : 'bg-amber-50 border-amber-200 text-amber-600'}`}
                    >
                        <div className="text-[10px] uppercase font-bold opacity-80 mb-2 flex items-center gap-1"><AlertCircle size={14}/> Medio (2-3 días)</div>
                        <div className="text-3xl font-black text-inherit">{countAmarillo}</div>
                    </div>
                    <div 
                        onClick={() => { setTabActual('Laboratorio'); setPrioridadFiltro('Verde'); }}
                        className={`p-4 rounded-xl border flex flex-col cursor-pointer transition-all hover:scale-105 active:scale-95 ${prioridadFiltro === 'Verde' ? 'ring-2 ring-emerald-500' : ''} ${darkMode ? 'bg-emerald-950/20 border-emerald-900/50 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-[#008a5e]'}`}
                    >
                        <div className="text-[10px] uppercase font-bold opacity-80 mb-2 flex items-center gap-1"><CheckCircle size={14}/> Normal (&gt; 3 días)</div>
                        <div className="text-3xl font-black">{countVerde}</div>
                    </div>
                </div>
                </div>
            
            {/* Tabs */}
            <div className={`flex items-center gap-2 mb-4 border-b overflow-x-auto custom-scrollbar ${darkMode ? 'border-[#C9EA63]/20' : 'border-slate-200'}`}>
                <button 
                    onClick={() => setTabActual('Laboratorio')}
                    className={`px-4 py-3 font-bold text-sm border-b-2 transition-colors whitespace-nowrap ${tabActual === 'Laboratorio' ? (darkMode ? 'border-[#C9EA63] text-[#C9EA63]' : 'border-[#008a5e] text-[#008a5e]') : 'border-transparent opacity-50 hover:opacity-100'}`}
                >
                    En Laboratorio
                </button>
                <button 
                    onClick={() => setTabActual('Vencidos')}
                    className={`px-4 py-3 font-bold text-sm border-b-2 transition-colors whitespace-nowrap ${tabActual === 'Vencidos' ? 'border-rose-500 text-rose-500' : 'border-transparent opacity-50 hover:opacity-100 hover:text-rose-500'}`}
                >
                    SLA Vencido
                </button>
                <button 
                    onClick={() => setTabActual('Historial')}
                    className={`px-4 py-3 font-bold text-sm border-b-2 transition-colors whitespace-nowrap ${tabActual === 'Historial' ? (darkMode ? 'border-[#C9EA63] text-[#C9EA63]' : 'border-[#008a5e] text-[#008a5e]') : 'border-transparent opacity-50 hover:opacity-100'}`}
                >
                    En Aseguramiento/Listo
                </button>
                <button 
                    onClick={() => setTabActual('Entregados')}
                    className={`px-4 py-3 font-bold text-sm border-b-2 transition-colors whitespace-nowrap ${tabActual === 'Entregados' ? (darkMode ? 'border-slate-500 text-slate-400' : 'border-slate-600 text-slate-700') : 'border-transparent opacity-50 hover:opacity-100'}`}
                >
                    Entregados
                </button>
            </div>

            {/* Listado Agrupado */}
            <div className={`border rounded-2xl overflow-hidden ${darkMode ? 'border-[#C9EA63]/20 bg-[#1b2b10]' : 'border-slate-200 bg-white'}`}>
                <div className={`p-4 border-b flex items-center justify-between ${darkMode ? 'border-[#C9EA63]/10' : 'border-slate-100'}`}>
                    <h3 className="font-bold flex items-center gap-2"><Package size={18}/> Equipos Asignados</h3>
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${darkMode ? 'bg-[#141f0b] border-[#C9EA63]/30' : 'bg-slate-50 border-slate-200'}`}>
                        <Search size={14} className="opacity-50" />
                        <input 
                            value={busqueda} onChange={e => setBusqueda(e.target.value)}
                            placeholder="Buscar OC o Empresa..." 
                            className="bg-transparent outline-none text-xs w-32 md:w-48"
                        />
                    </div>
                </div>

                <div className="divide-y divide-gray-100 dark:divide-white/5">
                    {grouped.length === 0 ? (
                        <div className="p-12 text-center opacity-50">No hay equipos asignados en este momento.</div>
                    ) : (
                        grouped.map((node, gidx) => {
                            if (node.isGroup) {
                                const { oc, items } = node;
                                return (
                                    <div key={`g-${oc}-${gidx}`} className={`flex flex-col md:flex-row transition-all border-b last:border-b-0 ${darkMode ? 'hover:bg-white/[0.02]' : 'hover:bg-slate-50/50'}`}>
                                        <div 
                                            onClick={() => navigate(`/equipos/grupo/${oc}`)}
                                            className={`p-6 w-full md:w-64 flex flex-col justify-center border-b md:border-b-0 md:border-r transition-all cursor-pointer group/header ${darkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100'}`}
                                            style={{ borderLeft: `6px solid ${getOsaColor(oc, darkMode)}` }}
                                        >
                                            <div className="flex items-center justify-between mb-2 pr-10">
                                                <div className="flex flex-col">
                                                    <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded w-fit mb-1 ${darkMode ? 'bg-[#C9EA63] text-[#141f0b]' : 'bg-[#008a5e] text-white'}`}>
                                                        {getTipoLabel(oc)}
                                                    </span>
                                                    <h4 className={`font-black uppercase tracking-tight text-lg ${darkMode ? 'text-[#C9EA63]' : 'text-[#008a5e]'}`}>{oc}</h4>
                                                </div>
                                                <div className={`px-2 py-0.5 rounded-full text-[10px] font-black ${darkMode ? 'bg-white/5 text-white/60' : 'bg-emerald-50 text-emerald-500'}`}>
                                                    {items.length} de {node.totalGlobal} PZAS
                                                </div>
                                            </div>
                                            <p className={`text-[10px] font-bold mb-4 line-clamp-2 ${darkMode ? 'text-white/40' : 'text-slate-400'}`}>{items[0]?.empresa}</p>
                                            
                                            <div className="flex flex-col gap-2">
                                                {tabActual === 'Laboratorio' && (
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); seleccionarOC(oc, items); }}
                                                        className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl font-black text-[10px] transition-all border ${
                                                            items.every(i => seleccionados.includes(i.id)) 
                                                            ? (darkMode ? 'bg-[#C9EA63] text-[#141f0b] border-[#C9EA63]' : 'bg-[#008a5e] text-white border-[#007b55]')
                                                            : (darkMode ? 'bg-white/5 text-white/60 border-white/10 hover:border-[#C9EA63]/50' : 'bg-white text-slate-600 border-slate-200 hover:border-[#008a5e]')
                                                        }`}
                                                    >
                                                        {items.every(i => seleccionados.includes(i.id)) ? <CheckSquare size={14} /> : <Square size={14} />}
                                                        {items.every(i => seleccionados.includes(i.id)) ? "SELECCIONADO" : "SELECCIONAR LOTE"}
                                                    </button>
                                                )}
                                                <div className={`text-[10px] font-black flex items-center justify-center gap-2 opacity-40 group-hover/header:opacity-100 transition-opacity ${darkMode ? 'text-white' : 'text-slate-600'}`}>
                                                    <ArrowRight size={14}/> GESTIONAR ORDEN
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            } else {
                                const eq = node;
                                const sel = seleccionados.includes(eq.id);
                                const badgeColor = eq.prioridad === 'Rojo' ? (darkMode ? 'bg-rose-500/20 border-rose-500/30 text-rose-400' : 'bg-rose-50 text-rose-700 border-rose-100') : 
                                                   eq.prioridad === 'Amarillo' ? (darkMode ? 'bg-amber-500/20 border-amber-500/30 text-amber-400' : 'bg-amber-50 text-amber-700 border-amber-100') : 
                                                   eq.prioridad === 'Verde' ? (darkMode ? 'bg-[#C9EA63] text-black' : 'bg-emerald-500 text-white') : null;

                                return (
                                    <div 
                                        key={eq.id} 
                                        onClick={() => abrirDetalles(eq)}
                                        className={`p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between transition-all border-b last:border-b-0 relative overflow-hidden group cursor-pointer ${sel ? (darkMode ? 'bg-[#C9EA63]/5' : 'bg-emerald-50') : (darkMode ? 'hover:bg-white/5' : 'bg-white')}`}
                                    >
                                        <div className="flex items-center gap-4 flex-1">
                                            <div className="flex flex-col flex-1 sm:max-w-xl">
                                                <div className="flex items-center gap-3">
                                                    <span className={`text-[10px] font-black tracking-widest ${darkMode ? 'text-white/30' : 'text-slate-400'}`}>{eq.orden_cotizacion}</span>
                                                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${darkMode ? 'bg-[#C9EA63]/10 text-[#C9EA63]' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'}`}>Área: {eq.area_laboratorio || 'N/A'}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className={`font-black text-lg mt-1 truncate`} title={eq.nombre_instrumento}>
                                                        {eq.nombre_instrumento}
                                                    </span>
                                                    {(eq.rechazos_aseguramiento > 0 || eq.total_rechazos > 0) && (
                                                        <span className="animate-pulse px-2 py-0.5 rounded-full text-[9px] font-black bg-rose-600 text-white flex items-center gap-1 mt-1">
                                                            <AlertTriangle size={10}/> RECHAZADO
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                                                    <span className="text-xs font-bold opacity-60">{eq.empresa}</span>
                                                    <span className="text-xs opacity-40 font-mono">ID: {eq.identificacion || eq.no_serie || 'S/N'}</span>
                                                    <div className="flex flex-wrap gap-1">
                                                        {eq.metrologos_asignados?.map((m, mIdx) => (
                                                            <span key={mIdx} className={`text-[9px] px-2 py-0.5 rounded-full font-bold border ${m.estatus === 'terminado' ? (darkMode ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-emerald-100 text-emerald-700 border-emerald-200') : (darkMode ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 'bg-amber-50 text-amber-600 border-amber-100')}`}>
                                                                {(m.nombre || 'Sin Nombre').split(' ')[0]} {m.estatus === 'terminado' ? '(L)' : '(...)'}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-6 mt-4 sm:mt-0">
                                            <div className="flex flex-col items-end">
                                                <span className="text-[10px] font-black opacity-40 mb-1">TIEMPO RESTANTE</span>
                                                <div className={`px-4 py-1.5 rounded-xl text-sm font-black ${badgeColor || (darkMode ? 'bg-[#253916] text-[#C9EA63]' : 'bg-slate-200 text-slate-700')}`}>
                                                    {eq.slaRestante} DÍAS
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); abrirDetalles(eq); }} 
                                                    className={`p-3 rounded-2xl border transition-all ${darkMode ? 'border-[#C9EA63]/30 hover:bg-[#C9EA63] hover:text-[#141f0b] text-[#C9EA63]' : 'border-slate-300 hover:bg-[#008a5e] hover:text-white hover:border-[#008a5e] text-slate-700'}`} 
                                                    title="Ver Detalles"
                                                >
                                                    <Eye size={20} />
                                                </button>
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); abrirComentarios(eq.id); }} 
                                                    className={`p-3 rounded-2xl border transition-all relative ${darkMode ? 'border-[#C9EA63]/30 hover:bg-[#C9EA63] hover:text-[#141f0b] text-[#C9EA63]' : 'border-slate-300 hover:bg-[#008a5e] hover:text-white hover:border-[#008a5e] text-slate-700'} ${eq.comentarios_count > 0 ? 'ring-4 ring-emerald-500/20' : ''}`} 
                                                >
                                                    <MessageSquare size={20} />
                                                </button>
                                                {tabActual === 'Laboratorio' && (
                                                    <div className="flex items-center gap-2">
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); confirmarEnvioIndividual(eq.id); }}
                                                            className={`p-3 rounded-2xl border transition-all ${darkMode ? 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20' : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'}`}
                                                            title="Finalizar este equipo"
                                                        >
                                                            <CheckCircle size={20} />
                                                        </button>
                                                        <button onClick={(e) => { e.stopPropagation(); toggleSeleccion(eq.id); }} className={`p-3 rounded-2xl border transition-all ${sel ? (darkMode ? 'bg-[#C9EA63] text-[#141f0b]' : 'bg-[#008a5e] text-white') : (darkMode ? 'border-[#C9EA63]/30 text-[#C9EA63]' : 'border-slate-300 text-slate-700')}`}>
                                                            {sel ? <CheckSquare size={20} /> : <Square size={20} />}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            }
                        })
                    )}
                </div>
            </div>

            {/* Floating Magic Button */}
            {seleccionados.length > 0 && (
                <div className="fixed bottom-0 sm:bottom-6 left-0 right-0 sm:left-auto sm:right-6 lg:right-12 z-[50] p-4 sm:p-0 animate-in slide-in-from-bottom flex justify-center w-full sm:w-auto">
                    <div className={`shadow-2xl rounded-2xl sm:rounded-full border flex items-center p-2 sm:p-3 max-w-full sm:max-w-xl transition-all w-full sm:w-auto overflow-hidden ${darkMode ? 'bg-[#253916] border-[#C9EA63]/50' : 'bg-white border-emerald-500'}`}>
                        <div className="flex-1 px-4 py-2">
                            <span className={`text-sm font-black flex items-center gap-2 ${darkMode ? 'text-[#C9EA63]' : 'text-[#008a5e]'}`}>
                                <CheckSquare size={18} /> {seleccionados.length} seleccionados
                            </span>
                            <span className={`hidden sm:block text-[10px] font-bold opacity-60 ${darkMode ? 'text-white' : 'text-slate-500'}`}>Equipos listos para Aseguramiento de Calidad</span>
                        </div>
                        <button 
                            onClick={prepararEnvio}
                            className={`px-6 py-3 rounded-xl sm:rounded-full font-black text-[11px] sm:text-sm transition-all focus:outline-none flex items-center gap-2 shrink-0 ${darkMode ? 'bg-[#C9EA63] text-[#141f0b] hover:bg-[#b0d14b]' : 'bg-[#008a5e] text-white hover:bg-[#007b55]'}`}
                        >
                            {(() => {
                                const selEquipos = equiposConSLA.filter(e => seleccionados.includes(e.id));
                                if (selEquipos.length === 0) return "FINALIZAR MI PARTE";
                                
                                const todosSeVan = selEquipos.every(e => {
                                    const pendientes = (e.metrologos_asignados || []).filter(m => m.estatus !== 'terminado');
                                    // Soy el último pendiente o el único
                                    return pendientes.length <= 1;
                                });

                                return todosSeVan ? "FINALIZAR Y ENVIAR A ASEGURAMIENTO" : "FINALIZAR MI PARTE (PENDIENTES OTROS)";
                            })()} <ThumbsUp size={18} />
                        </button>
                    </div>
                </div>
            )}

            {/* Modal de Envio a Aseguramiento (Integridad & Notas) */}
            {modalConf && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex justify-center items-center p-4">
                    <div className={`w-full max-w-lg rounded-3xl shadow-2xl p-6 md:p-8 border animate-in zoom-in-95 duration-200 ${darkMode ? 'bg-[#141f0b] border-[#C9EA63]/30 text-[#F2F6F0]' : 'bg-white border-slate-200 text-slate-800'}`}>
                        <h2 className="text-2xl font-black mb-4 flex items-center gap-2">Finalizar Metrología</h2>
                        
                        {alertasConf.length > 0 && (
                            <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/50 text-sm">
                                <h4 className="font-bold flex items-center gap-1.5 text-amber-500 mb-2"><HelpCircle size={18}/> Alerta de Integridad de OC</h4>
                                <ul className="list-disc pl-5 opacity-80 space-y-1">
                                    {alertasConf.map((a,i) => <li key={i}>{a}</li>)}
                                </ul>
                                <p className="mt-3 text-[11px] font-bold opacity-60">Los equipos restantes permanecerán en Laboratorio y seguirán contando SLA.</p>
                            </div>
                        )}

                        <div className="flex gap-4">
                            <button onClick={() => setModalConf(false)} className={`flex-1 py-3 font-bold rounded-xl ${darkMode ? 'bg-[#253916] text-white hover:bg-[#314a1c]' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Cancelar</button>
                            <button onClick={confirmarEnvioBatch} className={`flex-[2] flex justify-center items-center gap-2 font-black py-3 rounded-xl transition-all shadow-lg ${darkMode ? 'bg-[#C9EA63] text-[#141f0b] hover:bg-[#b0d14b]' : 'bg-[#008a5e] text-white hover:bg-[#007b55]'}`}>
                                ¡He terminado! <ThumbsUp size={18} />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Comentarios / Bitácora */}
            {comentariosActivos && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex justify-end">
                    <div className={`w-full md:w-[400px] h-full shadow-2xl flex flex-col border-l animate-in slide-in-from-right duration-300 ${darkMode ? 'bg-[#141f0b] border-[#C9EA63]/20' : 'bg-white border-slate-200'}`}>
                        <div className={`p-4 border-b flex justify-between items-center z-10 shadow-sm ${darkMode ? 'bg-[#202c33] border-slate-700' : 'bg-[#f0f2f5] border-slate-200'}`}>
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${darkMode ? 'bg-[#111b21] text-[#00a884]' : 'bg-[#dfe5e7] text-[#00a884]'}`}>
                                    <Package size={20} />
                                </div>
                                <div className="flex flex-col">
                                    <h3 className={`font-bold text-sm leading-tight ${darkMode ? 'text-[#e9edef]' : 'text-[#111b21]'}`}>Bitácora del Equipo</h3>
                                    <span className={`text-[11px] ${darkMode ? 'text-[#8696a0]' : 'text-[#667781]'}`}>ID: {comentariosActivos}</span>
                                </div>
                            </div>
                            <button onClick={() => setComentariosActivos(null)} className={`p-2 rounded-full transition-colors ${darkMode ? 'hover:bg-[#111b21] text-[#8696a0]' : 'hover:bg-[#dfe5e7] text-[#54656f]'}`}>
                                <X size={20} />
                            </button>
                        </div>

                        {/* WhatsApp pattern background overlay */}
                        <div className={`flex-1 overflow-y-auto p-4 md:p-6 flex flex-col-reverse space-y-4 space-y-reverse custom-scrollbar relative ${darkMode ? 'bg-[#0b141a]' : 'bg-[#efeae2]'}`}>
                            {/* SVG Pattern */}
                            <div className="absolute inset-0 opacity-[0.06] dark:opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'url("https://w7.pngwing.com/pngs/365/157/png-transparent-whatsapp-logo-whatsapp-pattern-texture-pattern-thumbnail.png")', backgroundSize: '300px', backgroundRepeat: 'repeat' }}></div>
                            
                            <div className="relative z-10 flex flex-col w-full space-y-4">
                                {listaComentarios.length === 0 ? (
                                    <div className="flex justify-center my-6">
                                        <div className={`px-4 py-2 rounded-lg text-xs shadow-sm ${darkMode ? 'bg-[#182229] text-[#8696a0]' : 'bg-[#ffeecd] text-[#54656f]'}`}>
                                            El chat de este equipo está vacío.
                                        </div>
                                    </div>
                                ) : (
                                    listaComentarios.slice().reverse().map((c, i, arr) => {
                                        const soyYo = Number(c.usuario_id) === Number(usuario?.id);
                                        const nextMsg = arr[i + 1];
                                        const sameUserNext = nextMsg && Number(nextMsg.usuario_id) === Number(c.usuario_id);
                                        const msgBg = soyYo 
                                            ? (darkMode ? 'bg-[#005c4b] text-[#e9edef]' : 'bg-[#d9fdd3] text-[#111b21]') 
                                            : (darkMode ? 'bg-[#202c33] text-[#e9edef]' : 'bg-white text-[#111b21]');

                                        return (
                                        <div key={c.id} className={`flex flex-col w-full ${soyYo ? 'items-end' : 'items-start'} ${sameUserNext ? 'mb-1' : 'mb-3'}`}>
                                            <div className={`relative max-w-[85%] sm:max-w-[75%] px-3 py-2 shadow-[0_1px_0.5px_rgba(0,0,0,0.13)] ${msgBg}`}
                                                 style={{
                                                    borderTopLeftRadius: !soyYo && !sameUserNext ? '0' : '8px',
                                                    borderTopRightRadius: soyYo && !sameUserNext ? '0' : '8px',
                                                    borderBottomLeftRadius: '8px',
                                                    borderBottomRightRadius: '8px'
                                                 }}
                                            >
                                                {!soyYo && !sameUserNext && (
                                                    <span className={`text-[11px] font-bold block mb-1 ${darkMode ? 'text-[#53bdeb]' : 'text-[#1fa855]'}`}>
                                                        {c.usuario_nombre || 'Sistema'}
                                                    </span>
                                                )}

                                                <p className="text-[13px] leading-relaxed whitespace-pre-wrap word-break">{c.mensaje}</p>
                                                
                                                {c.archivo_url && (
                                                    <div className="mt-2 mb-1">
                                                        {c.archivo_url.match(/\.(jpeg|jpg|gif|png|webp)$/i) ? (
                                                            <a href={c.archivo_url} target="_blank" rel="noreferrer" className="block cursor-zoom-in">
                                                                <img src={c.archivo_url} alt="Evidencia" className="rounded-lg max-w-full max-h-[250px] object-cover" />
                                                            </a>
                                                        ) : (
                                                            <a href={c.archivo_url} target="_blank" rel="noreferrer" className={`flex items-center gap-3 p-3 rounded border text-xs font-bold transition-colors ${darkMode ? 'bg-[#182229] border-[#2a3942] text-[#8696a0] hover:bg-[#202c33]' : 'bg-[#f0f2f5] border-[#d1d7db] text-[#54656f] hover:bg-[#e9edef]'}`}>
                                                                <FileText size={18}/> <span>Ver Documento Adjunto</span>
                                                            </a>
                                                        )}
                                                    </div>
                                                )}
                                                
                                                <div className="float-right ml-3 mt-1 flex items-center justify-end gap-1">
                                                    <span className={`text-[10px] ${darkMode ? 'text-[#8696a0]' : 'text-[#667781]'}`}>
                                                        {new Date(c.fecha).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                    </span>
                                                    {soyYo && <CheckCircle size={13} className={darkMode ? "text-[#53bdeb]" : "text-[#53bdeb]"} />}
                                                </div>
                                            </div>
                                        </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        <form onSubmit={enviarComentario} className={`p-3 md:p-4 z-10 flex items-end gap-2 shadow-[0_-1px_3px_rgba(0,0,0,0.05)] ${darkMode ? 'bg-[#202c33]' : 'bg-[#f0f2f5]'}`}>
                            <div className="flex-1 flex flex-col gap-2 relative">
                                {archivoChat && (
                                    <div className={`absolute bottom-full mb-3 left-0 right-0 p-3 rounded-lg flex justify-between items-center shadow-lg ${darkMode ? 'bg-[#2a3942] text-[#e9edef]' : 'bg-white text-[#111b21]'}`}>
                                        <div className="flex items-center gap-2 truncate text-sm font-medium">
                                            <Paperclip size={16} className={darkMode ? 'text-[#8696a0]' : 'text-[#8696a0]'} />
                                            {archivoChat.name}
                                        </div>
                                        <button type="button" onClick={() => setArchivoChat(null)} className={`p-1.5 rounded-full ${darkMode ? 'hover:bg-[#202c33]' : 'hover:bg-[#f0f2f5]'}`}><X size={16}/></button>
                                    </div>
                                )}
                                
                                <div className={`flex items-end rounded-2xl md:rounded-full px-2 min-h-[44px] ${darkMode ? 'bg-[#2a3942]' : 'bg-white'}`}>
                                    <div className="flex items-center">
                                        <label className={`p-3 shrink-0 cursor-pointer rounded-full transition-colors ${darkMode ? 'text-[#8696a0] hover:text-[#e9edef]' : 'text-[#54656f] hover:text-[#111b21]'}`}>
                                            <Paperclip size={20} />
                                            <input type="file" className="hidden" onChange={e => { e.target.files[0] && setArchivoChat(e.target.files[0]); e.target.value = null; }} />
                                        </label>
                                        <label className={`p-3 shrink-0 cursor-pointer rounded-full transition-colors ${darkMode ? 'text-[#8696a0] hover:text-[#e9edef]' : 'text-[#54656f] hover:text-[#111b21]'}`}>
                                            <Camera size={20} />
                                            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { e.target.files[0] && setArchivoChat(e.target.files[0]); e.target.value = null; }} />
                                        </label>
                                    </div>
                                    <textarea 
                                        value={nuevoComentario} onChange={e => setNuevoComentario(e.target.value)} required
                                        placeholder="Escribe un mensaje"
                                        className={`flex-1 py-3 px-1 text-[15px] bg-transparent outline-none resize-none max-h-[120px] custom-scrollbar leading-tight placeholder:opacity-70 ${darkMode ? 'text-[#e9edef]' : 'text-[#111b21]'}`}
                                        rows="1"
                                        onInput={(e) => {
                                            e.target.style.height = 'auto';
                                            e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                if (nuevoComentario.trim()) enviarComentario(e);
                                            }
                                        }}
                                    />
                                </div>
                            </div>
                            <button type="submit" disabled={!nuevoComentario.trim() && !archivoChat} className={`shrink-0 w-12 h-12 rounded-full flex justify-center items-center text-white transition-transform ${(!nuevoComentario.trim() && !archivoChat) ? 'opacity-50 scale-95 cursor-not-allowed' : 'hover:scale-105 active:scale-95'} ${darkMode ? 'bg-[#00a884]' : 'bg-[#00a884]'}`}>
                                <MessageSquare size={20} className="ml-[-2px]" />
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal de Detalle */}
            {modalDetalle && equipoDetalle && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className={`w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl shadow-2xl border flex flex-col transition-all ${darkMode ? 'bg-[#141f0b] border-[#C9EA63]/20' : 'bg-white border-slate-200'}`}>
                        {/* Cabecera Modal */}
                        <div className={`p-4 sm:p-6 flex justify-between items-center border-b shrink-0 ${darkMode ? 'bg-[#253916] border-[#C9EA63]/10' : 'bg-slate-50 border-slate-100'}`}>
                            <div className="flex items-center gap-3">
                                <div className={`p-2 sm:p-3 rounded-2xl ${darkMode ? 'bg-[#141f0b] text-[#C9EA63]' : 'bg-white text-emerald-600 shadow-sm'}`}>
                                    <Package size={20} className="sm:w-6 sm:h-6" />
                                </div>
                                <div className="flex flex-col">
                                    <h2 className={`text-lg sm:text-xl font-black leading-tight ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>{equipoDetalle.nombre_instrumento}</h2>
                                    <p className={`text-[10px] sm:text-xs font-bold uppercase tracking-widest ${darkMode ? 'text-[#C9EA63]/70' : 'text-emerald-600'}`}>{equipoDetalle.orden_cotizacion}</p>
                                </div>
                            </div>
                            <button onClick={() => setModalDetalle(false)} className={`p-2 rounded-xl transition-colors ${darkMode ? 'hover:bg-[#141f0b] text-[#F2F6F0]/60' : 'hover:bg-slate-200 text-slate-400'}`}>
                                <X size={24} />
                            </button>
                        </div>

                        {/* Contenido Modal Scrollable */}
                        <div className="p-4 sm:p-8 flex-1">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
                                <div className="space-y-6">
                                    <section>
                                        <h4 className={`text-[10px] font-black uppercase tracking-widest mb-3 opacity-50 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Datos del Equipo</h4>
                                        <div className="space-y-3">
                                            {equipoDetalle.clave && (
                                                <div className="flex items-center gap-3 text-sm">
                                                    <Tag size={16} className="opacity-40" />
                                                    <span className="font-bold w-16">Clave:</span>
                                                    <span className="opacity-80 font-mono font-bold">{equipoDetalle.clave}</span>
                                                </div>
                                            )}
                                            <div className="flex items-center gap-3 text-sm">
                                                <Tag size={16} className="opacity-40" />
                                                <span className="font-bold w-24">Equipo:</span>
                                                <span className="opacity-80 font-bold text-sm">{equipoDetalle.nombre_instrumento}</span>
                                            </div>
                                            {equipoDetalle.no_certificado && (
                                                <div className="flex items-center gap-3 text-sm">
                                                    <FileText size={16} className="opacity-40 text-emerald-500" />
                                                    <span className="font-bold w-24">Certificado:</span>
                                                    <span className="opacity-80 font-mono font-bold">{equipoDetalle.no_certificado}</span>
                                                </div>
                                            )}
                                            <div className="flex items-center gap-3 text-sm">
                                                <Tag size={16} className="opacity-40" />
                                                <span className="font-bold w-24">Marca:</span>
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
                                            {equipoDetalle.intervalo_calibracion && equipoDetalle.intervalo_calibracion !== 'No especificado' && (
                                                <div className={`p-3 rounded-xl border text-xs ${darkMode ? 'bg-blue-950/20 border-blue-500/20' : 'bg-blue-50 border-blue-200'}`}>
                                                    <span className="font-black opacity-40 block mb-1">Intervalo:</span>
                                                    {equipoDetalle.intervalo_calibracion}
                                                </div>
                                            )}
                                            <div className="flex items-center gap-3 text-sm">
                                                <FileCheck size={16} className="opacity-40 text-emerald-500" />
                                                <span className="font-bold w-24">Área Lab:</span>
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-black tracking-wider uppercase ${darkMode ? 'bg-[#253916] text-[#C9EA63]' : 'bg-emerald-50 text-emerald-700'}`}>
                                                    {equipoDetalle.area_laboratorio || 'No definida'}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-3 text-sm">
                                                <User size={16} className="opacity-40" />
                                                <span className="font-bold w-24">Metrólogos:</span>
                                                <div className="flex flex-wrap gap-1">
                                                    {equipoDetalle.metrologos_asignados?.length ? equipoDetalle.metrologos_asignados.map(m => (
                                                        <span key={m.id} className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold">{(m.nombre || 'Sin Nombre').split(' ')[0]} ({m.estatus})</span>
                                                    )) : <span className="opacity-50 italic">Sin asignar</span>}
                                                </div>
                                            </div>
                                        </div>
                                    </section>

                                    <section>
                                        {(equipoDetalle.rechazos_aseguramiento > 0 || equipoDetalle.ultimo_motivo) && (
                                            <div className={`mb-6 p-5 rounded-3xl border-2 border-dashed animate-in zoom-in duration-300 ${darkMode ? 'bg-rose-500/10 border-rose-500/40 text-rose-200' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
                                                <div className="flex items-center gap-2 mb-2">
                                                    <AlertTriangle size={18} className="text-rose-500" />
                                                    <p className="text-xs font-black uppercase tracking-widest">Atención: Corrección Requerida</p>
                                                </div>
                                                <p className="text-sm font-bold italic mb-1">Motivo del rechazo:</p>
                                                <p className="text-sm opacity-90">{equipoDetalle.ultimo_motivo || 'Revisar bitácora para detalles.'}</p>
                                                {equipoDetalle.fecha_rechazo && (
                                                    <p className="text-[10px] mt-2 opacity-50">Fecha de devolución: {new Date(equipoDetalle.fecha_rechazo).toLocaleString('es-MX')}</p>
                                                )}
                                            </div>
                                        )}

                                        <h4 className={`text-[10px] font-black uppercase tracking-widest mb-3 opacity-50 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Requerimientos & Puntos</h4>
                                        <div className="space-y-4">
                                            <div className={`p-4 rounded-xl border text-sm ${darkMode ? 'bg-[#1b2b10] border-[#C9EA63]/10 text-[#F2F6F0]' : 'bg-slate-50 border-slate-100'}`}>
                                                <span className="font-black opacity-40 block mb-1">Requerimientos:</span>
                                                {equipoDetalle.requerimientos_especiales || 'No indicados'}
                                            </div>
                                            <div className={`p-4 rounded-xl border text-sm ${darkMode ? 'bg-[#1b2b10] border-[#C9EA63]/10 text-[#F2F6F0]' : 'bg-slate-50 border-slate-100'}`}>
                                                <span className="font-black opacity-40 block mb-1">Puntos a Calibrar:</span>
                                                {equipoDetalle.puntos_calibrar || 'No indicados'}
                                            </div>
                                        </div>
                                    </section>
                                </div>

                                <div className="space-y-6">
                                    <section>
                                        <h4 className={`text-[10px] font-black uppercase tracking-widest mb-3 opacity-50 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Información del Cliente</h4>
                                        <div className={`p-5 rounded-xl border space-y-3 ${darkMode ? 'bg-[#1b2b10] border-[#C9EA63]/10' : 'bg-slate-50 border-slate-100'}`}>
                                            <div>
                                                <p className="text-[9px] font-black uppercase opacity-40">Empresa</p>
                                                <p className="text-sm font-bold">{equipoDetalle.empresa || 'N/A'}</p>
                                            </div>
                                            {equipoDetalle.nombre_certificados && (
                                                <div>
                                                    <p className="text-[9px] font-black uppercase opacity-40">Certificados a nombre de</p>
                                                    <p className="text-sm font-bold">{equipoDetalle.nombre_certificados}</p>
                                                </div>
                                            )}
                                            {equipoDetalle.direccion && (
                                                <div>
                                                    <p className="text-[9px] font-black uppercase opacity-40">Dirección</p>
                                                    <p className="text-xs">{equipoDetalle.direccion}</p>
                                                </div>
                                            )}
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <p className="text-[9px] font-black uppercase opacity-40">Contacto</p>
                                                    <p className="text-xs font-bold">{equipoDetalle.persona || 'N/A'}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[9px] font-black uppercase opacity-40">SLA</p>
                                                    <p className="text-xs font-black">{equipoDetalle.sla} días</p>
                                                </div>
                                            </div>
                                            {equipoDetalle.contacto_email && (
                                                <div>
                                                    <p className="text-[9px] font-black uppercase opacity-40">Email</p>
                                                    <p className="text-xs font-bold text-blue-500">{equipoDetalle.contacto_email}</p>
                                                </div>
                                            )}
                                        </div>
                                    </section>

                                    {(equipoDetalle.cotizacion_referencia || equipoDetalle.fecha_recepcion || equipoDetalle.servicio_solicitado) && (
                                        <section>
                                            <h4 className={`text-[10px] font-black uppercase tracking-widest mb-3 opacity-50 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Datos de la Orden</h4>
                                            <div className={`p-4 rounded-xl border grid grid-cols-2 gap-3 ${darkMode ? 'bg-sky-950/20 border-sky-500/20' : 'bg-sky-50 border-sky-200'}`}>
                                                {equipoDetalle.cotizacion_referencia && (
                                                    <div>
                                                        <p className="text-[9px] font-black uppercase opacity-40">Cotización Ref.</p>
                                                        <p className="text-sm font-black font-mono">{equipoDetalle.cotizacion_referencia}</p>
                                                    </div>
                                                )}
                                                {equipoDetalle.fecha_recepcion && (
                                                    <div>
                                                        <p className="text-[9px] font-black uppercase opacity-40">Fecha Recepción</p>
                                                        <p className="text-sm font-bold">{equipoDetalle.fecha_recepcion}</p>
                                                    </div>
                                                )}
                                                {equipoDetalle.servicio_solicitado && (
                                                    <div>
                                                        <p className="text-[9px] font-black uppercase opacity-40">Servicio</p>
                                                        <p className="text-sm font-bold">{equipoDetalle.servicio_solicitado}</p>
                                                    </div>
                                                )}
                                            </div>
                                        </section>
                                    )}

                                    <div className={`p-5 rounded-xl border ${darkMode ? 'bg-[#C9EA63]/5 border-[#C9EA63]/20' : 'bg-emerald-50 border-emerald-100'}`}>
                                        <h4 className="text-[10px] font-black uppercase tracking-widest mb-3 opacity-50">Tiempos y Estatus</h4>
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="opacity-60">Registro:</span>
                                                <span className="font-bold">{new Date(equipoDetalle.fecha_ingreso).toLocaleDateString('es-MX', {day:'2-digit', month:'short'})}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="opacity-60">SLA:</span>
                                                <span className={`font-black ${equipoDetalle.sla <= 2 ? 'text-rose-500' : ''}`}>{equipoDetalle.sla} días</span>
                                            </div>
                                            <div className={`p-2 rounded-lg text-center text-xs font-black uppercase ${darkMode ? 'bg-[#C9EA63]/10 text-[#C9EA63]' : 'bg-emerald-100 text-emerald-700'}`}>
                                                {equipoDetalle.estatus_actual}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        {/* Footer del Modal */}
                        <div className={`p-6 border-t flex justify-end shrink-0 ${darkMode ? 'bg-[#141f0b] border-[#C9EA63]/10' : 'bg-white border-slate-100'}`}>
                            <button onClick={() => setModalDetalle(false)} className={`px-6 py-2 rounded-xl font-bold transition-colors ${darkMode ? 'bg-[#C9EA63] text-[#141f0b] hover:bg-[#b0d14b]' : 'bg-[#008a5e] text-white hover:bg-[#007b55]'}`}>
                                Entendido
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MetrologiaDashboard;

