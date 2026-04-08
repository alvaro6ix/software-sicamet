import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Package, Clock, AlertTriangle, AlertCircle, CheckCircle, Search, MessageSquare, ChevronDown, ChevronUp, CheckSquare, Square, ThumbsUp, HelpCircle, X, Paperclip, Tag, BookOpen, Hash, User, Calendar, FileText, Image as ImageIcon, Eye } from 'lucide-react';
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
    const [equiposGlobales, setEquiposGlobales] = useState([]);
    const [tabActual, setTabActual] = useState('Laboratorio');
    const [cargando, setCargando] = useState(true);
    const [busqueda, setBusqueda] = useState('');
    
    // Selección de equipos (IDs)
    const [seleccionados, setSeleccionados] = useState([]);
    const [modalConf, setModalConf] = useState(false);
    const [comentarioConf, setComentarioConf] = useState('');
    const [alertasConf, setAlertasConf] = useState([]);

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

    // Derived State
    let equiposFiltroTab = [];
    if (tabActual === 'Laboratorio') {
        equiposFiltroTab = equiposConSLA.filter(e => e.estatus_actual === 'Laboratorio');
    } else if (tabActual === 'Historial') {
        equiposFiltroTab = equiposConSLA.filter(e => ['Validación', 'Aseguramiento', 'Certificación', 'Listo'].includes(e.estatus_actual));
    } else if (tabActual === 'Entregados') {
        equiposFiltroTab = equiposConSLA.filter(e => e.estatus_actual === 'Entregado');
    } else if (tabActual === 'Vencidos') {
        equiposFiltroTab = equiposConSLA.filter(e => e.estatus_actual === 'Laboratorio' && e.slaRestante <= 0);
    }

    const filtrados = equiposFiltroTab.filter(e => 
        (e.orden_cotizacion || '').toLowerCase().includes(busqueda.toLowerCase()) ||
        (e.empresa || '').toLowerCase().includes(busqueda.toLowerCase()) ||
        (e.nombre_instrumento || '').toLowerCase().includes(busqueda.toLowerCase())
    );

    // Agrupar por OC
    const gruposOC = {};
    filtrados.forEach(e => {
        if (!gruposOC[e.orden_cotizacion]) gruposOC[e.orden_cotizacion] = [];
        gruposOC[e.orden_cotizacion].push(e);
    });

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
        // Verificar integridad
        const ocsAfectadas = [...new Set(equiposConSLA.filter(e => seleccionados.includes(e.id)).map(e => e.orden_cotizacion))];
        let alertasLocales = [];
        
        for (const oc of ocsAfectadas) {
            const totalesDoc = equiposGlobales.filter(e => e.orden_cotizacion === oc);
            const mandadosDoc = equiposConSLA.filter(e => e.orden_cotizacion === oc && seleccionados.includes(e.id));
            if (mandadosDoc.length < totalesDoc.length) {
                const estatusList = totalesDoc.map(e => e.estatus_actual);
                const enRec = estatusList.filter(s => s === 'Recepción').length;
                const enVal = estatusList.filter(s => s === 'Validación').length;
                const enLabNoSel = totalesDoc.filter(e => e.estatus_actual === 'Laboratorio' && !seleccionados.includes(e.id)).length;
                
                let d = [];
                if (enRec) d.push(`${enRec} en Recepción`);
                if (enVal) d.push(`${enVal} en Validación`);
                if (enLabNoSel) d.push(`${enLabNoSel} sin marcar en Lab`);
                const rest = d.length > 0 ? ` Faltan: ${d.join(', ')}.` : '';
                
                alertasLocales.push(`OC ${oc}: Estás enviando ${mandadosDoc.length} de ${totalesDoc.length} equipos totales.${rest}`);
            }
        }

        setAlertasConf(alertasLocales);
        setModalConf(true);
    };

    const confirmarEnvioBatch = async () => {
        try {
            await axios.post('/api/instrumentos/bulk-status', {
                ids: seleccionados,
                estatus: 'Validación',
                comentario: comentarioConf
            });
            toast.success(`${seleccionados.length} equipos enviados a Validación.`);
            setSeleccionados([]);
            setModalConf(false);
            setComentarioConf('');
            fetchData();
            window.dispatchEvent(new CustomEvent('actualizacion_operativa'));
        } catch (err) {
            toast.error('Error al enviar los equipos');
        }
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
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-6 mb-6 border-opacity-20 border-[#C9EA63]">
                <div>
                    <h2 className={`text-2xl md:text-3xl font-bold flex items-center gap-3 ${textApp}`}>
                        <Package className={darkMode ? 'text-[#C9EA63]' : 'text-emerald-600'} size={32} />
                        Centro de Metrología
                    </h2>
                    <p className={`mt-1 md:mt-2 text-xs md:text-sm ${darkMode ? 'text-[#F2F6F0]/70' : 'text-gray-500'}`}>
                        Registra resultados técnicos, gestiona calibraciones en curso y aprueba equipos hacia Aseguramiento.
                    </p>
                </div>
            </div>
            <div className="mb-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className={`p-4 rounded-xl border flex flex-col ${darkMode ? 'bg-[#1b2b10] border-[#C9EA63]/20' : 'bg-white border-slate-200'}`}>
                        <div className="text-[10px] uppercase font-bold opacity-60 mb-2 flex items-center gap-1"><Package size={14}/> En Laboratorio</div>
                        <div className="text-3xl font-black">{countTotal}</div>
                    </div>
                    <div className={`p-4 rounded-xl border flex flex-col ${darkMode ? 'bg-rose-950/20 border-rose-900/50 text-rose-400' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
                        <div className="text-[10px] uppercase font-bold opacity-80 mb-2 flex items-center gap-1"><AlertTriangle size={14}/> Urgentes (&lt; 24h)</div>
                        <div className="text-3xl font-black">{countRojo}</div>
                    </div>
                    <div className={`p-4 rounded-xl border flex flex-col ${darkMode ? 'bg-amber-950/20 border-amber-900/50 text-amber-400' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                        <div className="text-[10px] uppercase font-bold opacity-80 mb-2 flex items-center gap-1"><AlertCircle size={14}/> Medio (2-3 días)</div>
                        <div className="text-3xl font-black">{countAmarillo}</div>
                    </div>
                    <div className={`p-4 rounded-xl border flex flex-col ${darkMode ? 'bg-emerald-950/20 border-emerald-900/50 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
                        <div className="text-[10px] uppercase font-bold opacity-80 mb-2 flex items-center gap-1"><CheckCircle size={14}/> Normal (&gt; 3 días)</div>
                        <div className="text-3xl font-black">{countVerde}</div>
                    </div>
                </div>
                </div>
            
            {/* Tabs */}
            <div className={`flex items-center gap-2 mb-4 border-b overflow-x-auto custom-scrollbar ${darkMode ? 'border-[#C9EA63]/20' : 'border-slate-200'}`}>
                <button 
                    onClick={() => setTabActual('Laboratorio')}
                    className={`px-4 py-3 font-bold text-sm border-b-2 transition-colors whitespace-nowrap ${tabActual === 'Laboratorio' ? (darkMode ? 'border-[#C9EA63] text-[#C9EA63]' : 'border-emerald-600 text-emerald-700') : 'border-transparent opacity-50 hover:opacity-100'}`}
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
                    className={`px-4 py-3 font-bold text-sm border-b-2 transition-colors whitespace-nowrap ${tabActual === 'Historial' ? (darkMode ? 'border-amber-500 text-amber-500' : 'border-amber-600 text-amber-700') : 'border-transparent opacity-50 hover:opacity-100'}`}
                >
                    En Aseguramiento/Listo
                </button>
                <button 
                    onClick={() => setTabActual('Entregados')}
                    className={`px-4 py-3 font-bold text-sm border-b-2 transition-colors whitespace-nowrap ${tabActual === 'Entregados' ? (darkMode ? 'border-blue-500 text-blue-400' : 'border-blue-600 text-blue-700') : 'border-transparent opacity-50 hover:opacity-100'}`}
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

                {Object.keys(gruposOC).length === 0 ? (
                    <div className="p-12 text-center opacity-50">No hay equipos en laboratorio.</div>
                ) : (
                    <div className="divide-y divide-slate-100 dark:divide-[#C9EA63]/10">
                        {Object.entries(gruposOC).map(([oc, items]) => {
                            const estantodos = items.every(i => seleccionados.includes(i.id));
                            const estanAlgunos = items.some(i => seleccionados.includes(i.id)) && !estantodos;

                            return (
                                <div key={oc} className="group">
                                    {/* Cabecera de la Orden */}
                                    <div 
                                        className={`p-3 md:p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-sm border-l-4 transition-colors ${darkMode ? 'hover:bg-[#253916]' : 'hover:bg-slate-50'}`}
                                        style={{ borderLeftColor: getOsaColor(oc, darkMode) }}
                                    >
                                        <div className="flex items-center gap-3">
                                            {tabActual === 'Laboratorio' && (
                                                <button 
                                                    onClick={() => toggleGrupo(oc, items)}
                                                    className={`p-1 rounded transition-colors ${estantodos ? 'text-emerald-500' : estanAlgunos ? 'text-amber-500' : 'text-gray-400'}`}
                                                >
                                                    {estantodos ? <CheckSquare size={20} /> : estanAlgunos ? <Square size={20} fill="currentColor" className="opacity-50" /> : <Square size={20} />}
                                                </button>
                                            )}
                                            <div>
                                                <h4 className={`font-black uppercase tracking-wider ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>{oc}</h4>
                                                <p className="text-[11px] opacity-60 font-bold">{items[0]?.empresa}</p>
                                            </div>
                                        </div>
                                        <div className="flex flex-col md:items-end gap-1 px-9 md:px-0">
                                            <span className="text-[10px] uppercase font-bold opacity-50 border border-inherit px-2 rounded-sm">{items.length} equipos</span>
                                        </div>
                                    </div>

                                    {/* Items del Grupo */}
                                    <div className={`pl-10 pr-2 md:pr-4 py-2 space-y-2 pb-4 ${darkMode ? 'bg-[#141f0b]/50' : 'bg-slate-50'}`}>
                                        {items.map(eq => {
                                            const sel = seleccionados.includes(eq.id);
                                            // Priority Colors
                                            let colorPrioridad = darkMode ? 'border-[#C9EA63]/20' : 'border-slate-200';
                                            let badgeColor = '';
                                            if (eq.prioridad === 'Rojo') { badgeColor = 'bg-rose-500 text-white'; colorPrioridad = darkMode ? 'border-rose-900 bg-rose-950/20' : 'border-rose-300 bg-rose-50'; }
                                            if (eq.prioridad === 'Amarillo') { badgeColor = 'bg-amber-500 text-white'; colorPrioridad = darkMode ? 'border-amber-900 bg-amber-950/20' : 'border-amber-200 bg-amber-50'; }
                                            
                                            return (
                                                <div 
                                                    key={eq.id} 
                                                    onClick={() => abrirDetalles(eq)}
                                                    className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl border transition-all cursor-pointer hover:-translate-y-0.5 hover:shadow-md ${colorPrioridad} ${sel ? (darkMode ? 'ring-2 ring-emerald-500/50 bg-[#1b2b10]' : 'ring-2 ring-emerald-500 bg-emerald-50') : (darkMode ? 'hover:bg-[#1b2b10]/60' : 'hover:bg-white')}`}
                                                >
                                                    <div className="flex items-start sm:items-center gap-3 w-full sm:w-auto">
                                                        {tabActual === 'Laboratorio' && (
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); toggleSeleccion(eq.id); }} 
                                                                className={`mt-1 sm:mt-0 p-2 -ml-2 rounded transition-colors ${sel ? 'text-emerald-500' : 'text-gray-400 hover:text-emerald-400'}`}
                                                            >
                                                                {sel ? <CheckSquare size={20} /> : <Square size={20} />}
                                                            </button>
                                                        )}
                                                        <div className={`flex flex-col flex-1 sm:max-w-md transition-colors ${tabActual !== 'Laboratorio' ? 'ml-2' : ''}`}>
                                                            <span className={`font-bold text-sm truncate flex items-center gap-2`} title={eq.nombre_instrumento}>
                                                                {eq.nombre_instrumento}
                                                            </span>
                                                            <span className="text-[10px] opacity-60 font-mono">ID: {eq.identificacion || eq.no_serie || 'S/N'}</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-4 mt-3 sm:mt-0 ml-1 sm:ml-0 pl-7 sm:pl-0">
                                                        <div className="flex items-center gap-1.5 text-xs font-medium">
                                                            <Clock size={14} className="opacity-40" />
                                                            <span title={`SLA Total: ${eq.sla} días`}>Restante: </span>
                                                            <span className={`px-2 py-0.5 rounded font-black ${badgeColor || (darkMode ? 'bg-[#253916] text-[#C9EA63]' : 'bg-slate-200 text-slate-700')}`}>
                                                                {eq.slaRestante} d
                                                            </span>
                                                        </div>
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); abrirComentarios(eq.id); }} 
                                                            className={`p-2 rounded-lg border transition-all relative ${darkMode ? 'border-[#C9EA63]/30 hover:bg-[#C9EA63] hover:text-[#141f0b] text-[#C9EA63]' : 'border-slate-300 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 text-slate-700'} ${eq.comentarios_count > 0 ? 'ring-2 ring-emerald-500/50' : ''}`} 
                                                            title="Bitácora y chat"
                                                        >
                                                            <MessageSquare size={16} />
                                                        </button>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Floating Magic Button */}
            {seleccionados.length > 0 && (
                <div className="fixed bottom-0 sm:bottom-6 left-0 right-0 sm:left-auto sm:right-6 lg:right-12 z-[50] p-4 sm:p-0 animate-in slide-in-from-bottom flex justify-center w-full sm:w-auto">
                    <div className={`shadow-2xl rounded-2xl sm:rounded-full border flex items-center p-2 sm:p-3 max-w-full sm:max-w-xl transition-all w-full sm:w-auto overflow-hidden ${darkMode ? 'bg-[#253916] border-[#C9EA63]/50' : 'bg-white border-emerald-500'}`}>
                        <div className="flex-1 px-4 py-2">
                            <span className="text-sm font-black flex items-center gap-2 text-emerald-600 dark:text-[#C9EA63]">
                                <CheckSquare size={18} /> {seleccionados.length} seleccionados
                            </span>
                            <span className={`hidden sm:block text-[10px] font-bold opacity-60 ${darkMode ? 'text-white' : 'text-slate-500'}`}>Equipos listos para Aseguramiento de Calidad</span>
                        </div>
                        <button 
                            onClick={prepararEnvio}
                            className={`px-6 py-3 rounded-xl sm:rounded-full font-black text-sm transition-all focus:outline-none flex items-center gap-2 shrink-0 ${darkMode ? 'bg-[#C9EA63] text-[#141f0b] hover:bg-[#b0d14b]' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
                        >
                            ENVIAR A ASEGURAMIENTO <ThumbsUp size={18} />
                        </button>
                    </div>
                </div>
            )}

            {/* Modal de Envio a Aseguramiento (Integridad & Notas) */}
            {modalConf && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex justify-center items-center p-4">
                    <div className={`w-full max-w-lg rounded-3xl shadow-2xl p-6 md:p-8 border animate-in zoom-in-95 duration-200 ${darkMode ? 'bg-[#141f0b] border-[#C9EA63]/30 text-[#F2F6F0]' : 'bg-white border-slate-200 text-slate-800'}`}>
                        <h2 className="text-2xl font-black mb-4 flex items-center gap-2">Moviendo a Aseguramiento</h2>
                        
                        {alertasConf.length > 0 && (
                            <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/50 text-sm">
                                <h4 className="font-bold flex items-center gap-1.5 text-amber-500 mb-2"><HelpCircle size={18}/> Alerta de Integridad de OC</h4>
                                <ul className="list-disc pl-5 opacity-80 space-y-1">
                                    {alertasConf.map((a,i) => <li key={i}>{a}</li>)}
                                </ul>
                                <p className="mt-3 text-[11px] font-bold opacity-60">Los equipos restantes permanecerán en Laboratorio y seguirán contando SLA.</p>
                            </div>
                        )}

                        <div className="mb-6">
                            <label className="block text-[10px] font-black uppercase tracking-wider mb-2 opacity-60">Notas para Aseguramiento (Opcional)</label>
                            <textarea
                                value={comentarioConf} onChange={e => setComentarioConf(e.target.value)}
                                className={`w-full p-3 border rounded-xl text-sm min-h-[100px] flex-1 outline-none focus:ring-2 focus:ring-emerald-500 transition-all ${darkMode ? 'bg-[#1b2b10] border-[#C9EA63]/20' : 'bg-slate-50 border-slate-200'}`}
                                placeholder="Escribe aquí cualquier observación sobre el grupo de equipos..."
                            />
                        </div>

                        <div className="flex gap-4">
                            <button onClick={() => setModalConf(false)} className={`flex-1 py-3 font-bold rounded-xl ${darkMode ? 'bg-[#253916] text-white hover:bg-[#314a1c]' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Cancelar</button>
                            <button onClick={confirmarEnvioBatch} className={`flex-[2] flex justify-center items-center gap-2 font-black py-3 rounded-xl transition-all shadow-lg ${darkMode ? 'bg-[#C9EA63] text-[#141f0b] hover:bg-[#b0d14b]' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}>
                                ¡Entendido, Enviar! <ThumbsUp size={18} />
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
                                        const soyYo = c.usuario_id === usuario?.id;
                                        const nextMsg = arr[i + 1];
                                        const sameUserNext = nextMsg && nextMsg.usuario_id === c.usuario_id;
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
                                    <label className={`p-3 shrink-0 cursor-pointer rounded-full transition-colors ${darkMode ? 'text-[#8696a0] hover:text-[#e9edef]' : 'text-[#54656f] hover:text-[#111b21]'}`}>
                                        <Paperclip size={20} />
                                        <input type="file" className="hidden" onChange={e => { e.target.files[0] && setArchivoChat(e.target.files[0]); e.target.value = null; }} />
                                    </label>
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
                                </div>

                                <div className="space-y-6">
                                    <section>
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
                            </div>
                        </div>
                        
                        {/* Footer del Modal */}
                        <div className={`p-6 border-t flex justify-end shrink-0 ${darkMode ? 'bg-[#141f0b] border-[#C9EA63]/10' : 'bg-white border-slate-100'}`}>
                            <button onClick={() => setModalDetalle(false)} className={`px-6 py-2 rounded-xl font-bold transition-colors ${darkMode ? 'bg-[#C9EA63] text-[#141f0b] hover:bg-[#b0d14b]' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}>
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
