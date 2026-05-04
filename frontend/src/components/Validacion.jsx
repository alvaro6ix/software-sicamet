import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FileCheck, XCircle, CheckCircle, Package, Clock, MessageSquare, AlertTriangle, HelpCircle, AlertCircle, X, Paperclip, Camera, Tag, BookOpen, Hash, User, Calendar, FileText, File as FileIcon, Image as ImageIcon, Eye } from 'lucide-react';
import { toast } from 'react-toastify';
import { usePermisos } from '../hooks/usePermisos';

const getOsaColor = (osStr, isDark) => {
    if (!osStr) return isDark ? '#2a401c' : '#ffffff';
    let hash = 0;
    for (let i = 0; i < osStr.length; i++) {
        hash = osStr.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return isDark ? `hsl(${hue}, 40%, 20%)` : `hsl(${hue}, 70%, 95%)`;
};

const InstrumentoRow = ({ eq, darkMode, tabActual, abrirDetalles, abrirComentarios, procesarAprobacion, abrirRechazo, finalizarCertificacion, subirCertificado }) => {
    return (
        <div 
            onClick={() => abrirDetalles(eq)}
            className={`group/row p-3 rounded-xl border flex flex-col sm:flex-row items-center justify-between transition-all cursor-pointer ${darkMode ? 'bg-[#1b2b10] border-[#C9EA63]/10 hover:border-[#C9EA63]/40' : 'bg-white border-slate-200 hover:border-emerald-500 shadow-sm'}`}
        >
            <div className="flex items-center gap-3 w-full sm:w-auto overflow-hidden">
                <div className={`p-2 rounded-lg shrink-0 ${darkMode ? 'bg-[#141f0b] text-[#C9EA63]' : 'bg-slate-50 text-slate-500'}`}>
                    <Clock size={18} />
                </div>
                <div className="flex flex-col min-w-0">
                    <span className={`font-bold text-sm truncate ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>{eq.nombre_instrumento}</span>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-[10px] opacity-60 font-mono">ID: {eq.identificacion || eq.no_serie || 'S/N'}</span>
                        <span className={`text-[9px] px-1.5 py-0 rounded font-bold uppercase ${darkMode ? 'bg-[#C9EA63]/20 text-[#C9EA63]' : 'bg-emerald-50 text-[#008a5e]'}`}>
                            {eq.area_laboratorio || 'N/A'}
                        </span>
                        {/* Chips de metrólogos */}
                        <div className="flex flex-wrap gap-1">
                            {eq.metrologos_asignados?.map((m, mIdx) => (
                                <span key={mIdx} className={`text-[8px] px-1.5 py-0 rounded-full font-bold border ${m.estatus === 'terminado' ? (darkMode ? 'bg-[#C9EA63]/20 text-[#C9EA63] border-[#C9EA63]/30' : 'bg-emerald-100 text-[#008a5e] border-emerald-200') : (darkMode ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 'bg-amber-50 text-amber-600 border-amber-100')}`}>
                                    {(m.nombre || 'Sin Nombre').split(' ')[0]} {m.estatus === 'terminado' ? '(L)' : '(...)'}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-3 mt-3 sm:mt-0">
                {(tabActual === 'Certificacion' || tabActual === 'Faltantes') && (
                    <div className="flex items-center gap-2 mr-2 pr-3 border-r dark:border-amber-900/40 border-slate-200">
                        {eq.certificado_url ? (
                            <a 
                                href={eq.certificado_url} 
                                target="_blank" 
                                rel="noreferrer" 
                                onClick={(e) => e.stopPropagation()}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${darkMode ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500 hover:text-white' : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-600 hover:text-white'}`}
                            >
                                <FileText size={14} /> PDF LISTO
                            </a>
                        ) : (
                            <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black cursor-pointer transition-all ${darkMode ? 'bg-amber-950/30 text-amber-500 border border-amber-500/30 hover:border-amber-500' : 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'}`}>
                                <Paperclip size={14} /> SUBIR PDF
                                <input 
                                    type="file" 
                                    accept=".pdf" 
                                    className="hidden" 
                                    onChange={(e) => { e.stopPropagation(); subirCertificado(eq.id, e.target.files[0]); }} 
                                    onClick={(e) => e.stopPropagation()}
                                />
                            </label>
                        )}
                        
                        {eq.certificado_url && (
                            <button 
                                onClick={(e) => { e.stopPropagation(); finalizarCertificacion([eq.id]); }}
                                className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-emerald-900/40 text-emerald-400' : 'hover:bg-emerald-100 text-emerald-600'}`}
                                title="Liberar este equipo individualmente"
                            >
                                <CheckCircle size={24} />
                            </button>
                        )}
                    </div>
                )}

                <button 
                    onClick={(e) => { e.stopPropagation(); abrirComentarios(eq.id); }} 
                    className={`p-2 rounded-lg border transition-all relative ${darkMode ? 'border-amber-900/50 hover:bg-amber-500 hover:text-[#141f0b] text-amber-500' : 'border-slate-300 hover:bg-amber-600 hover:text-white hover:border-amber-600 text-slate-700'} ${eq.comentarios_count > 0 ? 'ring-2 ring-amber-500/50' : ''}`} 
                    title="Ver observaciones y trazabilidad"
                >
                    <MessageSquare size={16} />
                </button>
                {tabActual === 'Pendientes' && (
                    <div className="flex gap-1.5 ml-2 border-l pl-3 dark:border-amber-900/40 border-slate-200">
                        <button onClick={(e) => { e.stopPropagation(); procesarAprobacion([eq.id]); }} className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-emerald-900/40 text-emerald-500' : 'hover:bg-emerald-100 text-emerald-600'}`} title="Aprobar (A Certificación)">
                            <CheckCircle size={24} />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); abrirRechazo([eq.id]); }} className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-rose-900/40 text-rose-500' : 'hover:bg-rose-100 text-rose-600'}`} title="Rechazar (A Laboratorio)">
                            <XCircle size={24} />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};


const Validacion = ({ darkMode, usuario }) => {
    const { tiene } = usePermisos();
    const puedeAprobar     = tiene(['aseguramiento.aprobar', 'aseguramiento.rechazar']);
    const puedeCertificar  = tiene('certificacion.subir');
    const puedeVerCert     = tiene(['certificacion.ver', 'certificacion.subir']);

    // Tab por defecto según los permisos del usuario.
    const tabInicial = puedeAprobar ? 'Pendientes' : (puedeCertificar ? 'Certificacion' : (puedeVerCert ? 'Listos' : 'Pendientes'));

    const [equiposGlobales, setEquiposGlobales] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [tabActual, setTabActual] = useState(tabInicial);

    // Modales de confirmación modernos
    const [confirmModal, setConfirmModal] = useState({ open: false, title: '', message: '', onConfirm: null, type: 'info' });

    // Modal de rechazo
    const [rechazoModal, setRechazoModal] = useState({ activo: false, ids: [] });
    const [motivoRechazo, setMotivoRechazo] = useState('');

    // Modal de Detalle
    const [modalDetalle, setModalDetalle] = useState(false);
    const [equipoDetalle, setEquipoDetalle] = useState(null);

    const abrirDetalles = (eq) => {
        setEquipoDetalle(eq);
        setModalDetalle(true);
    };

    // Chat
    const [comentariosActivos, setComentariosActivos] = useState(null); // instrumento_id
    const [listaComentarios, setListaComentarios] = useState([]);
    const [nuevoComentario, setNuevoComentario] = useState('');
    const [archivoChat, setArchivoChat] = useState(null);

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

    // El SLA se calcula en el backend desde fecha_recepcion_parsed (no fecha_ingreso)
    // y considera sla + sla_dias_extra. Aquí solo derivamos la prioridad visual.
    const equiposConSLA = equiposGlobales.map(e => {
        const slaRestante = Number.isFinite(e.sla_restante) ? e.sla_restante : (e.sla || 10);
        let prioridad = 'Verde';
        if (slaRestante <= 1) prioridad = 'Rojo';
        else if (slaRestante <= 3) prioridad = 'Amarillo';
        return { ...e, slaRestante, prioridad };
    });

    // Filter by tab
    let equiposFiltroTab = [];
    if (tabActual === 'Pendientes') {
        equiposFiltroTab = equiposConSLA.filter(e => e.estatus_actual === 'Aseguramiento');
    } else if (tabActual === 'Certificacion') {
        equiposFiltroTab = equiposConSLA.filter(e => e.estatus_actual === 'Certificación');
    } else if (tabActual === 'Listos') {
        equiposFiltroTab = equiposConSLA.filter(e => e.estatus_actual === 'Facturación');
    } else if (tabActual === 'Entregados') {
        equiposFiltroTab = equiposConSLA.filter(e => e.estatus_actual === 'Entregado');
    } else if (tabActual === 'Faltantes') {
        equiposFiltroTab = equiposConSLA.filter(e => ['Certificación', 'Facturación', 'Entregado'].includes(e.estatus_actual) && !e.certificado_url);
    }

    // Agrupar solo si la OC tiene >= 5 equipos (Umbral solicitado por el usuario)
    const grouped = [];
    const ocCounter = {};
    equiposFiltroTab.forEach(e => {
        const oc = e.orden_cotizacion || 'S/N';
        ocCounter[oc] = (ocCounter[oc] || 0) + 1;
    });

    const groupsProcessed = new Set();
    equiposFiltroTab.forEach(e => {
        const oc = e.orden_cotizacion || 'S/N';
        if (ocCounter[oc] >= 2) {
            if (!groupsProcessed.has(oc)) {
                grouped.push({ isGroup: true, oc, items: equiposFiltroTab.filter(item => (item.orden_cotizacion || 'S/N') === oc) });
                groupsProcessed.add(oc);
            }
        } else {
            grouped.push({ isGroup: false, ...e });
        }
    });

    const procesarAprobacion = (ids) => {
        setConfirmModal({
            open: true,
            title: '¿Confirmar Aprobación?',
            message: `Vas a pasar ${ids.length} equipo(s) a la etapa de Certificación. Asegúrate de que las fotos y datos del metrólogo sean correctos.`,
            type: 'success',
            onConfirm: async () => {
                try {
                    await axios.post('/api/instrumentos/bulk-status', {
                        ids,
                        estatus: 'Certificación',
                        comentario: 'Aprobado en Aseguramiento'
                    });
                    toast.success('El equipo ha pasado a Certificación correctamente.');
                    setConfirmModal({ open: false });
                    fetchData();
                } catch (err) {
                    toast.error('Error al aprobar');
                }
            }
        });
    };

    const subirCertificado = async (id, archivo) => {
        if (!archivo) return;
        try {
            const fd = new FormData();
            fd.append('archivo', archivo);
            await axios.post(`/api/instrumentos/${id}/certificado`, fd);
            toast.success('Certificado PDF cargado correctamente.');
            fetchData();
        } catch (err) {
            toast.error('Error al subir certificado: ' + (err.response?.data?.error || err.message));
        }
    };

    const finalizarCertificacion = (ids) => {
        // Marcamos listos - Si faltan PDFs, solo advertimos para que el bot de WA no los encuentre
        const incompletosCount = equiposGlobales.filter(e => ids.includes(e.id) && !e.certificado_url).length;
        const msgComp = incompletosCount > 0 
            ? `⚠️ Nota: ${incompletosCount} equipo(s) no tienen certificado PDF. Podrán ser entregados físicamente, pero no consultados por el Bot de WhatsApp.` 
            : '';

        setConfirmModal({
            open: true,
            title: '¿Liberar para Entrega?',
            message: `¿Estás seguro de que deseas marcar ${ids.length} equipos como LISTOS? ${msgComp} Recepción recibirá una notificación instantánea.`,
            type: incompletosCount > 0 ? 'warning' : 'info',
            onConfirm: async () => {
                try {
                    await axios.post('/api/instrumentos/bulk-status', {
                        ids,
                        estatus: 'Facturación',
                        comentario: 'Certificación completada por Aseguramiento'
                    });
                    toast.success('Equipos movidos a Facturación.');
                    setConfirmModal({ open: false });
                    fetchData();
                    window.dispatchEvent(new CustomEvent('actualizacion_operativa'));
                } catch (err) {
                    toast.error('Error al finalizar certificación');
                }
            }
        });
    };

    const abrirRechazo = (ids) => {
        setRechazoModal({ activo: true, ids });
        setMotivoRechazo('');
    };

    const confirmarRechazo = async (e) => {
        e.preventDefault();
        try {
            await axios.post('/api/instrumentos/bulk-status', {
                ids: rechazoModal.ids,
                estatus: 'Laboratorio',
                comentario: `RECHAZO: ${motivoRechazo}`
            });
            toast.info('Los equipos han sido enviados de vuelta a Laboratorio.');
            setRechazoModal({ activo: false, ids: [] });
            fetchData();
            window.dispatchEvent(new CustomEvent('actualizacion_operativa'));
        } catch (err) {
            toast.error('Error al rechazar');
        }
    };

    // Chat logic
    const abrirComentarios = async (id) => {
        try {
            setComentariosActivos(id);
            const res = await axios.get(`/api/instrumentos/${id}/comentarios`);
            setListaComentarios(res.data);
        } catch (err) { console.error(err); }
    };

    const enviarComentario = async (e) => {
        e.preventDefault();
        if (!comentariosActivos || (!nuevoComentario.trim() && !archivoChat)) return;
        
        const equipoIdActual = comentariosActivos; // Capturar para cierre estable
        try {
            const fd = new FormData();
            fd.append('mensaje', nuevoComentario);
            if (archivoChat) fd.append('archivo', archivoChat);

            await axios.post(`/api/instrumentos/${equipoIdActual}/comentarios`, fd);
            setNuevoComentario('');
            setArchivoChat(null);
            
            // Refrescar lista
            const res = await axios.get(`/api/instrumentos/${equipoIdActual}/comentarios`);
            setListaComentarios(res.data);
            
            // Notificar a otros si es necesario (socket ya lo hace en backend si está configurado)
        } catch(err) {
            console.error("Error al enviar comentario:", err);
            toast.error("Error al enviar: " + (err.response?.data?.error || "Revisa tu conexión"));
        }
    };

    // KPIs generales
    const validacionList = equiposConSLA.filter(e => e.estatus_actual === 'Aseguramiento');
    const certList = equiposConSLA.filter(e => e.estatus_actual === 'Certificación');
    const listosList = equiposConSLA.filter(e => e.estatus_actual === 'Facturación');
    const entregadosList = equiposConSLA.filter(e => e.estatus_actual === 'Entregado');
    
    const countTotal = validacionList.length;
    const countUrgentes = validacionList.filter(e => e.slaRestante <= 1).length;
    const countCert = certList.length;
    const countCertSinDoc = certList.filter(e => !e.certificado_url).length;
    const countEntregados = entregadosList.length;
    const countFaltantes = equiposConSLA.filter(e => ['Certificación', 'Facturación', 'Entregado'].includes(e.estatus_actual) && !e.certificado_url).length;

    return (
        <div className="w-full relative pb-24 animate-in fade-in">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-6 mb-6 border-opacity-20 border-[#C9EA63]">
                <div>
                    <h2 className={`text-2xl md:text-3xl font-bold flex items-center gap-3 ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>
                        <FileCheck className={darkMode ? 'text-[#C9EA63]' : 'text-emerald-500'} size={32} />
                        Área de Aseguramiento
                    </h2>
                    <p className={`mt-1 md:mt-2 text-xs md:text-sm ${darkMode ? 'text-[#F2F6F0]/70' : 'text-gray-500'}`}>
                        Revisión de calidad de equipos calibrados para decidir si pasan a certificado o regresan a laboratorio.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className={`p-4 rounded-xl border flex flex-col ${darkMode ? 'bg-amber-950/20 border-amber-900/50 text-amber-400' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                    <div className="text-[10px] uppercase font-bold opacity-80 mb-2 flex items-center gap-1"><Package size={14}/> Pendientes Aseguramiento </div>
                    <div className="text-3xl font-black">{countTotal}</div>
                </div>
                <div className={`p-4 rounded-xl border flex flex-col ${darkMode ? 'bg-rose-950/20 border-rose-900/50 text-rose-400' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
                    <div className="text-[10px] uppercase font-bold opacity-80 mb-2 flex items-center gap-1"><AlertTriangle size={14}/> SLA Urgente</div>
                    <div className="text-3xl font-black">{countUrgentes}</div>
                </div>
                <div className={`p-4 rounded-xl border flex flex-col ${darkMode ? 'bg-emerald-950/20 border-emerald-900/50 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
                    <div className="text-[10px] uppercase font-bold opacity-80 mb-2 flex items-center gap-1"><FileCheck size={14}/> En Certificación</div>
                    <div className="text-3xl font-black">{countCert} <span className="text-xs opacity-60 font-medium">({countCertSinDoc} sin PDF)</span></div>
                </div>
                <div className={`p-4 rounded-xl border flex flex-col ${darkMode ? 'bg-blue-950/20 border-blue-900/50 text-blue-400' : 'bg-blue-50 border-blue-200 text-blue-700'}`}>
                    <div className="text-[10px] uppercase font-bold opacity-80 mb-2 flex items-center gap-1"><CheckCircle size={14}/> Entregados</div>
                    <div className="text-3xl font-black">{countEntregados}</div>
                </div>
            </div>

            {/* Tabs — filtrados por permisos del usuario */}
            <div className={`flex items-center gap-2 mb-4 border-b overflow-x-auto custom-scrollbar ${darkMode ? 'border-amber-900/20' : 'border-slate-200'}`}>
                {puedeAprobar && (
                <button
                    onClick={() => setTabActual('Pendientes')}
                    className={`px-4 py-3 font-bold text-sm border-b-2 transition-colors whitespace-nowrap ${tabActual === 'Pendientes' ? (darkMode ? 'border-amber-500 text-amber-400' : 'border-amber-600 text-amber-700') : 'border-transparent opacity-50 hover:opacity-100'}`}
                >
                    Pendientes de Aseguramiento
                </button>
                )}
                {puedeCertificar && (
                <button
                    onClick={() => setTabActual('Certificacion')}
                    className={`px-4 py-3 font-bold text-sm border-b-2 transition-colors whitespace-nowrap ${tabActual === 'Certificacion' ? (darkMode ? 'border-emerald-500 text-emerald-400' : 'border-emerald-600 text-emerald-700') : 'border-transparent opacity-50 hover:opacity-100'}`}
                >
                    En Certificación
                </button>
                )}
                {puedeVerCert && (
                <button
                    onClick={() => setTabActual('Listos')}
                    className={`px-4 py-3 font-bold text-sm border-b-2 transition-colors whitespace-nowrap ${tabActual === 'Listos' ? (darkMode ? 'border-emerald-500 text-emerald-400' : 'border-emerald-600 text-emerald-700') : 'border-transparent opacity-50 hover:opacity-100'}`}
                >
                    Listos para Entrega
                </button>
                )}
                {puedeVerCert && (
                <button
                    onClick={() => setTabActual('Entregados')}
                    className={`px-4 py-3 font-bold text-sm border-b-2 transition-colors whitespace-nowrap ${tabActual === 'Entregados' ? (darkMode ? 'border-blue-500 text-blue-400' : 'border-blue-600 text-blue-700') : 'border-transparent opacity-50 hover:opacity-100'}`}
                >
                    Entregados
                </button>
                )}
                {puedeCertificar && (
                <button
                    onClick={() => setTabActual('Faltantes')}
                    className={`px-4 py-3 font-bold text-sm border-b-2 transition-colors whitespace-nowrap ${tabActual === 'Faltantes' ? (darkMode ? 'border-rose-500 text-rose-400' : 'border-rose-600 text-rose-700') : 'border-transparent opacity-50 hover:opacity-100'}`}
                >
                    Faltantes de PDF {countFaltantes > 0 && <span className="ml-2 bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{countFaltantes}</span>}
                </button>
                )}
            </div>

            <div className={`border rounded-2xl overflow-hidden ${darkMode ? 'border-amber-900/30 bg-[#141f0b]' : 'border-slate-200 bg-white'}`}>
                {grouped.length === 0 ? (
                    <div className="p-12 text-center opacity-50 flex flex-col items-center justify-center">
                        {tabActual === 'Pendientes' ? (
                            <>
                                <CheckCircle size={48} className="text-emerald-500 mb-4 opacity-30" />
                                <span className="font-bold text-lg mb-2">¡Bandeja Vacía!</span>
                                <span className="text-sm opacity-60">No hay equipos pendientes de validación en este momento.</span>
                            </>
                        ) : (
                            <>
                                <Package size={48} className="text-slate-500 mb-4 opacity-30" />
                                <span className="font-bold text-lg mb-2">Sin equipos</span>
                                <span className="text-sm opacity-60">Aún no hay registros en esta sección.</span>
                            </>
                        )}
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100 dark:divide-amber-900/20">
                        {grouped.map((node, gidx) => {
                            if (node.isGroup) {
                                const { oc, items } = node;
                                return (
                                    <div key={`group-${oc}-${gidx}`} className="group flex flex-col md:flex-row relative">
                                        {/* Cabecera de la Orden */}
                                        <div 
                                            className={`p-4 w-full md:w-64 flex flex-col justify-center border-b md:border-b-0 md:border-r transition-colors ${darkMode ? 'bg-amber-950/10 border-amber-900/20' : 'bg-slate-50 border-slate-100'}`}
                                            style={{ borderLeft: `6px solid ${getOsaColor(oc, darkMode)}` }}
                                        >
                                            <div className="flex items-center justify-between mb-1">
                                                <h4 className={`font-black uppercase tracking-wider text-sm ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>{oc}</h4>
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${darkMode ? 'bg-[#C9EA63] text-black shadow-lg shadow-[#C9EA63]/10' : 'bg-[#008a5e] text-white shadow-lg shadow-[#008a5e]/20'}`}>
                                                    {items.length} EQUIPOS
                                                </span>
                                            </div>
                                            <p className="text-[10px] opacity-60 font-bold mb-3 truncate">{items[0]?.empresa}</p>
                                            
                                            {tabActual === 'Pendientes' && (
                                                <div className="flex gap-2 w-full mt-auto">
                                                    <button onClick={(e) => { e.stopPropagation(); procesarAprobacion(items.map(i => i.id)); }} className={`flex-1 flex justify-center items-center py-2 rounded-lg font-black text-[10px] transition-all ${darkMode ? 'bg-[#C9EA63] hover:bg-[#b0d14b] text-[#141f0b] shadow-lg shadow-[#C9EA63]/10' : 'bg-[#008a5e] hover:bg-[#007b55] text-white shadow-lg shadow-[#008a5e]/20'}`}>
                                                        APROBAR
                                                    </button>
                                                    <button onClick={(e) => { e.stopPropagation(); abrirRechazo(items.map(i => i.id)); }} className={`flex-1 flex justify-center items-center py-2 rounded-lg font-black text-[10px] transition-all bg-rose-600 text-white hover:bg-rose-700 shadow-lg shadow-rose-600/20`}>
                                                        RECHAZAR
                                                    </button>
                                                </div>
                                            )}

                                            {tabActual === 'Certificacion' && (
                                                <div className="mt-auto">
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); finalizarCertificacion(items.map(i => i.id)); }} 
                                                        className={`w-full flex justify-center items-center py-2 rounded-lg font-black text-[10px] transition-all ${darkMode ? 'bg-[#C9EA63] hover:bg-[#b0d14b] text-[#141f0b] shadow-lg shadow-[#C9EA63]/10' : 'bg-[#008a5e] hover:bg-[#007b55] text-white shadow-lg shadow-[#008a5e]/20'}`}
                                                    >
                                                        LIBERAR LOTE
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        <div className={`flex-1 p-2 md:p-4 space-y-2 pb-4 ${darkMode ? 'bg-[#141f0b]/50' : 'bg-slate-50'}`}>
                                            {items.map(eq => (
                                                <InstrumentoRow key={eq.id} eq={eq} darkMode={darkMode} tabActual={tabActual} abrirDetalles={abrirDetalles} abrirComentarios={abrirComentarios} procesarAprobacion={procesarAprobacion} abrirRechazo={abrirRechazo} finalizarCertificacion={finalizarCertificacion} subirCertificado={subirCertificado} />
                                            ))}
                                        </div>
                                    </div>
                                );
                            } else {
                                const eq = node;
                                return (
                                    <div key={eq.id} className={`p-4 border-b last:border-b-0 ${darkMode ? 'hover:bg-amber-900/5' : 'hover:bg-slate-50'}`}>
                                        <InstrumentoRow eq={eq} darkMode={darkMode} tabActual={tabActual} abrirDetalles={abrirDetalles} abrirComentarios={abrirComentarios} procesarAprobacion={procesarAprobacion} abrirRechazo={abrirRechazo} finalizarCertificacion={finalizarCertificacion} subirCertificado={subirCertificado} />
                                    </div>
                                );
                            }
                        })}
                    </div>
                )}
            </div>

            {/* Modal Rechazo Obligatorio */}
            {rechazoModal.activo && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex justify-center items-center p-4">
                    <div className={`w-full max-w-lg rounded-3xl shadow-2xl p-6 md:p-8 border animate-in zoom-in-95 duration-200 ${darkMode ? 'bg-[#141f0b] border-rose-900 text-[#F2F6F0]' : 'bg-white border-rose-200 text-slate-800'}`}>
                        
                        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-rose-100 text-rose-600 mb-4 dark:bg-rose-950 dark:text-rose-400">
                            <AlertTriangle size={24} />
                        </div>

                        <h2 className="text-2xl font-black mb-2">Devolver a Laboratorio</h2>
                        <p className="text-sm opacity-60 mb-6 font-medium">Estás devolviendo {rechazoModal.ids.length} equipo(s) a Metrología. El tiempo (SLA) seguirá corriendo en su contra, es importante detallar por qué falló.</p>

                        <form onSubmit={confirmarRechazo}>
                            <div className="mb-6">
                                <label className="block text-[10px] font-black uppercase tracking-wider mb-2 text-rose-600 dark:text-rose-400">Motivo del Rechazo (Obligatorio)</label>
                                <textarea
                                    value={motivoRechazo} onChange={e => setMotivoRechazo(e.target.value)} required minLength={10}
                                    className={`w-full p-4 border rounded-xl text-sm min-h-[120px] outline-none focus:ring-2 transition-all shadow-inner ${darkMode ? 'bg-[#1b2b10] border-rose-900/50 focus:ring-rose-500/50' : 'bg-slate-50 border-rose-200 focus:ring-rose-500'}`}
                                    placeholder="Ej: El punto de calibración de 50kg falla, revisar ajuste..."
                                />
                                <p className="text-[10px] opacity-40 mt-1 italic flex justify-end">Mín. 10 caracteres.</p>
                            </div>

                            <div className="flex gap-4">
                                <button type="button" onClick={() => setRechazoModal({ activo: false, ids: [] })} className={`flex-1 py-3 font-bold rounded-xl ${darkMode ? 'bg-[#253916] text-white hover:bg-[#314a1c]' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Cancelar</button>
                                <button type="submit" disabled={motivoRechazo.length < 10} className={`flex-[2] flex justify-center items-center gap-2 font-black py-3 rounded-xl transition-all shadow-lg ${motivoRechazo.length < 10 ? 'opacity-50 cursor-not-allowed' : ''} ${darkMode ? 'bg-rose-600 text-white hover:bg-rose-700' : 'bg-rose-600 text-white hover:bg-rose-700'}`}>
                                    Rechazar Equipos <MessageSquare size={18} />
                                </button>
                            </div>
                        </form>
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
                                        const soyYo = c.mio === true;
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
                                    <label className={`p-3 shrink-0 cursor-pointer rounded-full transition-colors ${darkMode ? 'text-[#8696a0] hover:text-[#e9edef]' : 'text-[#54656f] hover:text-[#111b21]'}`} title="Adjuntar archivo">
                                        <Paperclip size={20} />
                                        <input type="file" className="hidden" onChange={e => { e.target.files[0] && setArchivoChat(e.target.files[0]); e.target.value = null; }} />
                                    </label>
                                    <label className={`p-3 shrink-0 cursor-pointer rounded-full transition-colors ${darkMode ? 'text-[#8696a0] hover:text-[#e9edef]' : 'text-[#54656f] hover:text-[#111b21]'}`} title="Tomar foto">
                                        <Camera size={20} />
                                        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { e.target.files[0] && setArchivoChat(e.target.files[0]); e.target.value = null; }} />
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

            {/* Modal de Detalle (UI Verde) */}
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
                                            {equipoDetalle.no_certificado && (
                                                <div className="flex items-center gap-3 text-sm">
                                                    <FileText size={16} className="opacity-40 text-emerald-500" />
                                                    <span className="font-bold w-24">Certificado:</span>
                                                    <span className="opacity-80 font-mono font-bold">{equipoDetalle.no_certificado}</span>
                                                </div>
                                            )}
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
                                            {equipoDetalle.intervalo_calibracion && equipoDetalle.intervalo_calibracion !== 'No especificado' && (
                                                <div className={`p-3 rounded-xl border text-xs ${darkMode ? 'bg-blue-950/20 border-blue-500/20' : 'bg-blue-50 border-blue-200'}`}>
                                                    <span className="font-black opacity-40 block mb-1">Intervalo:</span>
                                                    {equipoDetalle.intervalo_calibracion}
                                                </div>
                                            )}
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
                                                <FileCheck size={16} className="opacity-40 text-emerald-500" />
                                                <span className="font-bold w-24">Área Lab:</span>
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-black tracking-wider uppercase ${darkMode ? 'bg-[#253916] text-[#C9EA63]' : 'bg-emerald-50 text-emerald-700'}`}>
                                                    {equipoDetalle.area_laboratorio || 'No definida'}
                                                </span>
                                            </div>
                                        </div>
                                    </section>

                                    <section>
                                        <h4 className={`text-[10px] font-black uppercase tracking-widest mb-3 opacity-50 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Requerimientos & Puntos</h4>
                                        <div className="space-y-4">
                                            <div className={`p-4 rounded-xl border text-sm ${darkMode ? 'bg-[#1b2b10] border-[#C9EA63]/10' : 'bg-slate-50 border-slate-100'}`}>
                                                <span className="font-black opacity-40 block mb-1">Requerimientos:</span>
                                                {equipoDetalle.requerimientos_especiales || 'No indicados'}
                                            </div>
                                            <div className={`p-4 rounded-xl border text-sm ${darkMode ? 'bg-[#1b2b10] border-[#C9EA63]/10' : 'bg-slate-50 border-slate-100'}`}>
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
                                                <div><p className="text-[9px] font-black uppercase opacity-40">Certificados a nombre de</p><p className="text-sm font-bold">{equipoDetalle.nombre_certificados}</p></div>
                                            )}
                                            {equipoDetalle.direccion && (
                                                <div><p className="text-[9px] font-black uppercase opacity-40">Dirección</p><p className="text-xs">{equipoDetalle.direccion}</p></div>
                                            )}
                                            <div className="grid grid-cols-2 gap-3">
                                                <div><p className="text-[9px] font-black uppercase opacity-40">Contacto</p><p className="text-xs font-bold">{equipoDetalle.persona || 'N/A'}</p></div>
                                                <div><p className="text-[9px] font-black uppercase opacity-40">SLA</p><p className="text-xs font-black">{equipoDetalle.sla} días</p></div>
                                            </div>
                                            {equipoDetalle.contacto_email && (
                                                <div><p className="text-[9px] font-black uppercase opacity-40">Email</p><p className="text-xs font-bold text-blue-500">{equipoDetalle.contacto_email}</p></div>
                                            )}
                                        </div>
                                    </section>

                                    {(equipoDetalle.cotizacion_referencia || equipoDetalle.fecha_recepcion || equipoDetalle.servicio_solicitado) && (
                                        <section>
                                            <h4 className={`text-[10px] font-black uppercase tracking-widest mb-3 opacity-50 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Datos de la Orden</h4>
                                            <div className={`p-4 rounded-xl border grid grid-cols-2 gap-3 ${darkMode ? 'bg-emerald-950/20 border-emerald-500/20' : 'bg-emerald-50 border-emerald-200'}`}>
                                                {equipoDetalle.cotizacion_referencia && (<div><p className="text-[9px] font-black uppercase opacity-40">Cotización Ref.</p><p className="text-sm font-black font-mono">{equipoDetalle.cotizacion_referencia}</p></div>)}
                                                {equipoDetalle.fecha_recepcion && (<div><p className="text-[9px] font-black uppercase opacity-40">Fecha Recepción</p><p className="text-sm font-bold">{equipoDetalle.fecha_recepcion}</p></div>)}
                                                {equipoDetalle.servicio_solicitado && (<div><p className="text-[9px] font-black uppercase opacity-40">Servicio</p><p className="text-sm font-bold">{equipoDetalle.servicio_solicitado}</p></div>)}
                                            </div>
                                        </section>
                                    )}

                                    <section>
                                        <h4 className={`text-[10px] font-black uppercase tracking-widest mb-3 opacity-50 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Metrólogos Asignados</h4>
                                        <div className="flex flex-wrap gap-2">
                                            {equipoDetalle.metrologos_asignados?.length ? equipoDetalle.metrologos_asignados.map((m, idx) => (
                                                <div key={idx} className={`px-3 py-2 rounded-xl border flex items-center gap-2 ${m.estatus === 'terminado' ? (darkMode ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-700') : (darkMode ? 'bg-amber-500/10 border-amber-500/30 text-amber-500' : 'bg-amber-50 border-amber-200 text-amber-700')}`}>
                                                    <span className="text-xs font-bold">{m.nombre}</span>
                                                    {m.estatus === 'terminado' ? <CheckCircle size={14} /> : <Clock size={14} className="animate-pulse" />}
                                                </div>
                                            )) : <span className="text-xs opacity-40 italic">Sin personal asignado</span>}
                                        </div>
                                    </section>

                                    <div className={`p-5 rounded-xl border ${darkMode ? 'bg-[#C9EA63]/5 border-[#C9EA63]/20' : 'bg-emerald-50 border-emerald-100'}`}>
                                        <h4 className="text-[10px] font-black uppercase tracking-widest mb-3 opacity-50">Tiempos y Estatus</h4>
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center text-sm"><span className="opacity-60">Registro:</span><span className="font-bold">{new Date(equipoDetalle.fecha_ingreso).toLocaleDateString('es-MX', {day:'2-digit', month:'short'})}</span></div>
                                            <div className="flex justify-between items-center text-sm"><span className="opacity-60">SLA:</span><span className={`font-black ${equipoDetalle.sla <= 2 ? 'text-rose-500' : ''}`}>{equipoDetalle.sla} días</span></div>
                                            <div className={`p-2 rounded-lg text-center text-xs font-black uppercase ${darkMode ? 'bg-[#C9EA63]/10 text-[#C9EA63]' : 'bg-emerald-100 text-emerald-700'}`}>{equipoDetalle.estatus_actual}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        {/* Footer del Modal */}
                        <div className={`p-6 border-t flex justify-end shrink-0 ${darkMode ? 'bg-[#141f0b] border-[#C9EA63]/10' : 'bg-white border-slate-100'}`}>
                            <button onClick={() => setModalDetalle(false)} className={`px-10 py-3 rounded-2xl font-black uppercase tracking-widest text-xs transition-all ${darkMode ? 'bg-[#C9EA63] hover:bg-[#b0d14b] text-[#141f0b] shadow-lg shadow-[#C9EA63]/10' : 'bg-[#008a5e] hover:bg-[#007b55] text-white shadow-lg shadow-[#008a5e]/20'}`}>
                                Entendido
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Confirmación Moderno */}
            {confirmModal.open && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex justify-center items-center z-[200] p-4 animate-in fade-in duration-200">
                    <div className={`w-full max-w-md rounded-[2.5rem] shadow-2xl p-8 border animate-in zoom-in-95 duration-200 ${darkMode ? 'bg-[#141f0b] border-amber-900/40 text-[#F2F6F0]' : 'bg-white border-slate-200 text-slate-800'}`}>
                        <div className={`w-16 h-16 rounded-3xl flex items-center justify-center mb-6 mx-auto ${confirmModal.type === 'success' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-emerald-500/20 text-emerald-600'}`}>
                            {confirmModal.type === 'success' ? <CheckCircle size={32} /> : <HelpCircle size={32} />}
                        </div>
                        <h2 className="text-2xl font-black text-center mb-3 tracking-tight">{confirmModal.title}</h2>
                        <p className="text-sm text-center opacity-60 mb-8 leading-relaxed font-medium">
                            {confirmModal.message}
                        </p>
                        <div className="flex gap-4">
                            <button 
                                onClick={() => setConfirmModal({ open: false })}
                                className={`flex-1 py-4 font-bold rounded-2xl transition-all ${darkMode ? 'bg-[#253916] text-[#F2F6F0]/60 hover:text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={confirmModal.onConfirm}
                                className={`flex-[2] py-4 font-black rounded-2xl transition-all shadow-xl active:scale-95 ${darkMode ? 'bg-[#C9EA63] text-[#141f0b] hover:bg-[#b0d14b]' : (confirmModal.type === 'success' ? 'bg-[#008a5e] hover:bg-[#007b55]' : 'bg-emerald-600 hover:bg-emerald-700')} text-white hover:brightness-110`}
                            >
                                Confirmar Acción
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Validacion;
