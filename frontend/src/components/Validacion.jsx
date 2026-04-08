import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FileCheck, XCircle, CheckCircle, Package, Clock, MessageSquare, AlertTriangle, HelpCircle, AlertCircle, X, Paperclip, Tag, BookOpen, Hash, User, Calendar, FileText, Image as ImageIcon, Eye } from 'lucide-react';
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

const Validacion = ({ darkMode, usuario }) => {
    const [equiposGlobales, setEquiposGlobales] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [tabActual, setTabActual] = useState('Pendientes');

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

    // Calcular SLA de todos los equipos primero
    const equiposConSLA = equiposGlobales.map(e => {
        const dIngreso = new Date(e.fecha_ingreso);
        const hoy = new Date();
        const diasPasados = Math.floor((hoy - dIngreso) / (1000 * 60 * 60 * 24));
        const slaRestante = e.sla - diasPasados;
        
        let prioridad = 'Verde';
        if (slaRestante <= 1) prioridad = 'Rojo';
        else if (slaRestante <= 3) prioridad = 'Amarillo';

        return { ...e, slaRestante, prioridad };
    });

    // Filter by tab
    let equiposFiltroTab = [];
    if (tabActual === 'Pendientes') {
        equiposFiltroTab = equiposConSLA.filter(e => e.estatus_actual === 'Validación');
    } else if (tabActual === 'Certificacion') {
        equiposFiltroTab = equiposConSLA.filter(e => e.estatus_actual === 'Certificación');
    } else if (tabActual === 'Listos') {
        equiposFiltroTab = equiposConSLA.filter(e => e.estatus_actual === 'Listo');
    } else if (tabActual === 'Entregados') {
        equiposFiltroTab = equiposConSLA.filter(e => e.estatus_actual === 'Entregado');
    }

    // Agrupar
    const gruposOC = {};
    equiposFiltroTab.forEach(e => {
        if (!gruposOC[e.orden_cotizacion]) gruposOC[e.orden_cotizacion] = [];
        gruposOC[e.orden_cotizacion].push(e);
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
                    toast.success('Pasa a Certificación correctamente.');
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
        // Validación de integridad: Todos deben tener PDF
        const incompletos = equiposGlobales.filter(e => ids.includes(e.id) && !e.certificado_url);
        if (incompletos.length > 0) {
            toast.error(`No se pueden liberar ${incompletos.length} equipos porque no tienen el certificado PDF cargado.`);
            return;
        }

        setConfirmModal({
            open: true,
            title: '¿Liberar para Entrega?',
            message: `¿Estás seguro de que deseas marcar ${ids.length} equipos como LISTOS? Recepción recibirá una notificación instantánea para entregarlos al cliente.`,
            type: 'info',
            onConfirm: async () => {
                try {
                    await axios.post('/api/instrumentos/bulk-status', {
                        ids,
                        estatus: 'Listo',
                        comentario: 'Certificación completada por Aseguramiento'
                    });
                    toast.success('Equipos movidos a Listos para Entrega.');
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
            toast.error('Enviado de vuelta a Laboratorio.');
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

    // KPIs generales
    const validacionList = equiposConSLA.filter(e => e.estatus_actual === 'Validación');
    const certList = equiposConSLA.filter(e => e.estatus_actual === 'Certificación');
    const listosList = equiposConSLA.filter(e => e.estatus_actual === 'Listo');
    const entregadosList = equiposConSLA.filter(e => e.estatus_actual === 'Entregado');
    
    const countTotal = validacionList.length;
    const countUrgentes = validacionList.filter(e => e.slaRestante <= 1).length;
    const countCert = certList.length;
    const countCertSinDoc = certList.filter(e => !e.certificado_url).length;
    const countEntregados = entregadosList.length;

    return (
        <div className="w-full relative pb-24 animate-in fade-in">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-6 mb-6 border-opacity-20 border-[#C9EA63]">
                <div>
                    <h2 className={`text-2xl md:text-3xl font-bold flex items-center gap-3 ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>
                        <FileCheck className={darkMode ? 'text-[#C9EA63]' : 'text-emerald-600'} size={32} />
                        Área de Aseguramiento
                    </h2>
                    <p className={`mt-1 md:mt-2 text-xs md:text-sm ${darkMode ? 'text-[#F2F6F0]/70' : 'text-gray-500'}`}>
                        Revisión de calidad de equipos calibrados para decidir si pasan a certificado o regresan a laboratorio.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className={`p-4 rounded-xl border flex flex-col ${darkMode ? 'bg-amber-950/20 border-amber-900/50 text-amber-400' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                    <div className="text-[10px] uppercase font-bold opacity-80 mb-2 flex items-center gap-1"><Package size={14}/> Pendientes de Validar</div>
                    <div className="text-3xl font-black">{countTotal}</div>
                </div>
                <div className={`p-4 rounded-xl border flex flex-col ${darkMode ? 'bg-rose-950/20 border-rose-900/50 text-rose-400' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
                    <div className="text-[10px] uppercase font-bold opacity-80 mb-2 flex items-center gap-1"><AlertTriangle size={14}/> SLA Urgente</div>
                    <div className="text-3xl font-black">{countUrgentes}</div>
                </div>
                <div className={`p-4 rounded-xl border flex flex-col ${darkMode ? 'bg-indigo-950/20 border-indigo-900/50 text-indigo-400' : 'bg-indigo-50 border-indigo-200 text-indigo-700'}`}>
                    <div className="text-[10px] uppercase font-bold opacity-80 mb-2 flex items-center gap-1"><FileCheck size={14}/> En Certificación</div>
                    <div className="text-3xl font-black">{countCert} <span className="text-xs opacity-60 font-medium">({countCertSinDoc} sin PDF)</span></div>
                </div>
                <div className={`p-4 rounded-xl border flex flex-col ${darkMode ? 'bg-blue-950/20 border-blue-900/50 text-blue-400' : 'bg-blue-50 border-blue-200 text-blue-700'}`}>
                    <div className="text-[10px] uppercase font-bold opacity-80 mb-2 flex items-center gap-1"><CheckCircle size={14}/> Entregados</div>
                    <div className="text-3xl font-black">{countEntregados}</div>
                </div>
            </div>

            {/* Tabs */}
            <div className={`flex items-center gap-2 mb-4 border-b overflow-x-auto custom-scrollbar ${darkMode ? 'border-amber-900/20' : 'border-slate-200'}`}>
                <button 
                    onClick={() => setTabActual('Pendientes')}
                    className={`px-4 py-3 font-bold text-sm border-b-2 transition-colors whitespace-nowrap ${tabActual === 'Pendientes' ? (darkMode ? 'border-amber-500 text-amber-400' : 'border-amber-600 text-amber-700') : 'border-transparent opacity-50 hover:opacity-100'}`}
                >
                    Pendientes de Validar
                </button>
                <button 
                    onClick={() => setTabActual('Certificacion')}
                    className={`px-4 py-3 font-bold text-sm border-b-2 transition-colors whitespace-nowrap ${tabActual === 'Certificacion' ? (darkMode ? 'border-indigo-500 text-indigo-400' : 'border-indigo-600 text-indigo-700') : 'border-transparent opacity-50 hover:opacity-100'}`}
                >
                    En Certificación
                </button>
                <button 
                    onClick={() => setTabActual('Listos')}
                    className={`px-4 py-3 font-bold text-sm border-b-2 transition-colors whitespace-nowrap ${tabActual === 'Listos' ? (darkMode ? 'border-emerald-500 text-emerald-400' : 'border-emerald-600 text-emerald-700') : 'border-transparent opacity-50 hover:opacity-100'}`}
                >
                    Listos para Entrega
                </button>
                <button 
                    onClick={() => setTabActual('Entregados')}
                    className={`px-4 py-3 font-bold text-sm border-b-2 transition-colors whitespace-nowrap ${tabActual === 'Entregados' ? (darkMode ? 'border-blue-500 text-blue-400' : 'border-blue-600 text-blue-700') : 'border-transparent opacity-50 hover:opacity-100'}`}
                >
                    Entregados
                </button>
            </div>

            <div className={`border rounded-2xl overflow-hidden ${darkMode ? 'border-amber-900/30 bg-[#141f0b]' : 'border-slate-200 bg-white'}`}>
                {Object.keys(gruposOC).length === 0 ? (
                    <div className="p-12 text-center opacity-50 flex flex-col items-center justify-center">
                        {tabActual === 'Pendientes' ? (
                            <>
                                <CheckCircle size={48} className="text-emerald-500 mb-4 opacity-30" />
                                <span className="font-bold">Bandeja Vacía! No hay nada pendiente de validar.</span>
                            </>
                        ) : (
                            <>
                                <Package size={48} className="text-slate-500 mb-4 opacity-30" />
                                <span className="font-bold">Aún no hay equipos aprobados en el historial.</span>
                            </>
                        )}
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100 dark:divide-amber-900/20">
                        {Object.entries(gruposOC).map(([oc, items]) => (
                            <div key={oc} className="group flex flex-col md:flex-row relative">
                                {/* Cabecera de la Orden (Izquierda en desktop, Arriba en móvil) */}
                                <div 
                                    className={`p-4 w-full md:w-64 flex flex-col justify-center border-b md:border-b-0 md:border-r transition-colors ${darkMode ? 'bg-amber-950/10 border-amber-900/20' : 'bg-slate-50 border-slate-100'}`}
                                    style={{ borderLeft: `4px solid ${getOsaColor(oc, darkMode)}` }}
                                >
                                    <h4 className={`font-black uppercase tracking-wider text-lg ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>{oc}</h4>
                                    <p className="text-xs opacity-60 font-bold mb-3">{items[0]?.empresa}</p>
                                    
                                    {tabActual === 'Pendientes' && (
                                        <div className="flex gap-2 w-full mt-auto">
                                            <button onClick={() => procesarAprobacion(items.map(e => e.id))} className={`flex-1 flex justify-center items-center py-2 rounded border border-emerald-500 text-emerald-600 bg-emerald-50 text-xs font-bold hover:bg-emerald-600 hover:text-white transition-colors dark:bg-emerald-950/30 dark:border-emerald-600 dark:text-emerald-400 dark:hover:bg-emerald-600 dark:hover:text-white`}>
                                                <CheckCircle size={14} className="mr-1" /> Pasar Todo
                                            </button>
                                            <button onClick={() => abrirRechazo(items.map(e => e.id))} className={`flex-1 flex justify-center items-center py-2 rounded border border-rose-500 text-rose-600 bg-rose-50 text-xs font-bold hover:bg-rose-600 hover:text-white transition-colors dark:bg-rose-950/30 dark:border-rose-600 dark:text-rose-400 dark:hover:bg-rose-600 dark:hover:text-white`}>
                                                <XCircle size={14} className="mr-1" /> Rechazar Todo
                                            </button>
                                        </div>
                                    )}

                                    {tabActual === 'Certificacion' && (
                                        <div className="flex flex-col gap-2 w-full mt-auto">
                                            <button 
                                                onClick={() => finalizarCertificacion(items.map(e => e.id))} 
                                                disabled={items.some(e => !e.certificado_url)}
                                                className={`w-full flex justify-center items-center py-2 rounded border font-black text-[10px] transition-all ${items.some(e => !e.certificado_url) ? 'opacity-40 cursor-not-allowed border-slate-300' : 'border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600'}`}
                                            >
                                                <CheckCircle size={14} className="mr-1" /> Liberar Lote a Entrega
                                            </button>
                                            {items.some(e => !e.certificado_url) && <p className="text-[9px] text-center opacity-70 italic">Faltan PDFs en este lote</p>}
                                        </div>
                                    )}
                                </div>

                                {/* Items de la orden */}
                                <div className={`flex-1 p-2 md:p-4 space-y-2 pb-4 ${darkMode ? 'bg-[#141f0b]/50' : 'bg-slate-50'}`}>
                                    {items.map(eq => {
                                        let badgeColor = '';
                                        if (eq.prioridad === 'Rojo') badgeColor = 'bg-rose-500 text-white';
                                        if (eq.prioridad === 'Amarillo') badgeColor = 'bg-amber-500 text-white';

                                        return (
                                            <div 
                                                key={eq.id} 
                                                onClick={() => abrirDetalles(eq)}
                                                className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl border transition-all cursor-pointer hover:-translate-y-0.5 hover:shadow-md ${darkMode ? 'bg-[#1b2b10] border-amber-900/30 hover:border-amber-500/50 hover:bg-[#1b2b10]/80' : 'bg-white border-slate-200 hover:border-amber-300 hover:bg-slate-50'}`}
                                            >
                                                <div className={`flex flex-col min-w-0 pr-4 transition-colors`}>
                                                    <span className={`font-bold text-sm truncate flex items-center gap-2 ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`} title={eq.nombre_instrumento}>
                                                        {eq.nombre_instrumento}
                                                    </span>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className="text-[10px] opacity-60 font-mono border px-1 rounded">ID: {eq.identificacion || eq.no_serie || 'S/N'}</span>
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-black ${badgeColor || (darkMode ? 'bg-[#2a401c] text-emerald-500' : 'bg-slate-200 text-slate-700')}`}>
                                                            SLA: {eq.slaRestante} días
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-3 mt-3 sm:mt-0">
                                                    {tabActual === 'Certificacion' && (
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
                                                                    className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-indigo-900/40 text-indigo-400' : 'hover:bg-indigo-100 text-indigo-600'}`}
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
                                        )
                                    })}
                                </div>
                            </div>
                        ))}
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

            {/* Modal de Confirmación Moderno */}
            {confirmModal.open && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex justify-center items-center z-[200] p-4 animate-in fade-in duration-200">
                    <div className={`w-full max-w-md rounded-[2.5rem] shadow-2xl p-8 border animate-in zoom-in-95 duration-200 ${darkMode ? 'bg-[#141f0b] border-amber-900/40 text-[#F2F6F0]' : 'bg-white border-slate-200 text-slate-800'}`}>
                        <div className={`w-16 h-16 rounded-3xl flex items-center justify-center mb-6 mx-auto ${confirmModal.type === 'success' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-indigo-500/20 text-indigo-500'}`}>
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
                                className={`flex-[2] py-4 font-black rounded-2xl transition-all shadow-xl active:scale-95 ${confirmModal.type === 'success' ? 'bg-emerald-600' : 'bg-indigo-600'} text-white hover:brightness-110`}
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
