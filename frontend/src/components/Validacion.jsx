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

    // Filter by tab
    const equiposFiltrados = tabActual === 'Pendientes' 
        ? equiposGlobales.filter(e => e.estatus_actual === 'Validación')
        : equiposGlobales.filter(e => ['Certificación', 'Entregado'].includes(e.estatus_actual));

    // SLA Calculation
    const equiposConSLA = equiposFiltrados.map(e => {
        const dIngreso = new Date(e.fecha_ingreso);
        const hoy = new Date();
        const diasPasados = Math.floor((hoy - dIngreso) / (1000 * 60 * 60 * 24));
        const slaRestante = e.sla - diasPasados;
        
        let prioridad = 'Verde';
        if (slaRestante <= 1) prioridad = 'Rojo';
        else if (slaRestante <= 3) prioridad = 'Amarillo';

        return { ...e, slaRestante, prioridad };
    });

    // Agrupar
    const gruposOC = {};
    equiposConSLA.forEach(e => {
        if (!gruposOC[e.orden_cotizacion]) gruposOC[e.orden_cotizacion] = [];
        gruposOC[e.orden_cotizacion].push(e);
    });

    const procesarAprobacion = async (ids) => {
        try {
            await axios.post('/api/instrumentos/bulk-status', {
                ids,
                estatus: 'Certificación',
                comentario: 'Aprobado en Aseguramiento'
            });
            toast.success('Pasa a Certificación correctamente.');
            fetchData();
        } catch (err) {
            alert('Error al aprobar');
        }
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
        } catch (err) {
            alert('Error al rechazar');
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

    // KPIs
    const countTotal = equiposGlobales.filter(e => e.estatus_actual === 'Validación').length;
    const countUrgentes = equiposGlobales.filter(e => e.estatus_actual === 'Validación').map(e => {
        const diasPasados = Math.floor((new Date() - new Date(e.fecha_ingreso)) / (1000 * 60 * 60 * 24));
        return e.sla - diasPasados;
    }).filter(slaR => slaR <= 1).length;

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
            </div>

            {/* Tabs */}
            <div className={`flex items-center gap-2 mb-4 border-b ${darkMode ? 'border-amber-900/20' : 'border-slate-200'}`}>
                <button 
                    onClick={() => setTabActual('Pendientes')}
                    className={`px-4 py-3 font-bold text-sm border-b-2 transition-colors ${tabActual === 'Pendientes' ? (darkMode ? 'border-amber-500 text-amber-400' : 'border-amber-600 text-amber-700') : 'border-transparent opacity-50 hover:opacity-100'}`}
                >
                    Pendientes
                </button>
                <button 
                    onClick={() => setTabActual('Historial')}
                    className={`px-4 py-3 font-bold text-sm border-b-2 transition-colors ${tabActual === 'Historial' ? (darkMode ? 'border-emerald-500 text-emerald-400' : 'border-emerald-600 text-emerald-700') : 'border-transparent opacity-50 hover:opacity-100'}`}
                >
                    Historial (Aprobados)
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
                                </div>

                                {/* Items de la orden */}
                                <div className={`flex-1 p-2 md:p-4 space-y-2 pb-4 ${darkMode ? 'bg-[#141f0b]/50' : 'bg-slate-50'}`}>
                                    {items.map(eq => {
                                        let badgeColor = '';
                                        if (eq.prioridad === 'Rojo') badgeColor = 'bg-rose-500 text-white';
                                        if (eq.prioridad === 'Amarillo') badgeColor = 'bg-amber-500 text-white';

                                        return (
                                            <div key={eq.id} className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl border ${darkMode ? 'bg-[#1b2b10] border-amber-900/30 hover:border-amber-500/50' : 'bg-white border-slate-200 hover:border-amber-300'} transition-colors`}>
                                                <div 
                                                    className={`flex flex-col min-w-0 pr-4 transition-colors`}
                                                >
                                                    <span className={`font-bold text-sm truncate flex items-center gap-2 ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`} title={eq.nombre_instrumento}>
                                                        {eq.nombre_instrumento}
                                                        <button onClick={() => abrirDetalles(eq)} className={`p-1 rounded opacity-50 hover:opacity-100 transition-colors ${darkMode ? 'hover:text-[#C9EA63] text-emerald-500' : 'hover:text-emerald-600 text-emerald-500'}`} title="Ver Detalles">
                                                            <Eye size={16} />
                                                        </button>
                                                    </span>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className="text-[10px] opacity-60 font-mono border px-1 rounded">ID: {eq.identificacion || eq.no_serie || 'S/N'}</span>
                                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${badgeColor || (darkMode ? 'bg-[#2a401c] text-emerald-500' : 'bg-slate-200 text-slate-700')}`}>
                                                            SLA: {eq.slaRestante} días
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2 mt-3 sm:mt-0">
                                                    <button onClick={() => abrirComentarios(eq.id)} className={`p-1.5 rounded-lg border transition-colors relative ${darkMode ? 'border-amber-900/50 hover:bg-amber-900/20 text-amber-500' : 'border-slate-300 hover:bg-slate-100 text-slate-700'}`} title="Ver observaciones y trazabilidad">
                                                        <MessageSquare size={16} />
                                                    </button>
                                                    {tabActual === 'Pendientes' && (
                                                        <div className="flex gap-1.5">
                                                            <button onClick={() => procesarAprobacion([eq.id])} className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-emerald-900/40 text-emerald-500' : 'hover:bg-emerald-100 text-emerald-600'}`} title="Aprobar (A Certificación)">
                                                                <CheckCircle size={20} />
                                                            </button>
                                                            <button onClick={() => abrirRechazo([eq.id])} className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-rose-900/40 text-rose-500' : 'hover:bg-rose-100 text-rose-600'}`} title="Rechazar (A Laboratorio)">
                                                                <XCircle size={20} />
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
                        <div className={`p-4 border-b flex justify-between items-center ${darkMode ? 'bg-[#253916] border-[#C9EA63]/20' : 'bg-slate-50 border-slate-200'}`}>
                            <div>
                                <h3 className={`font-black ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>Bitácora Técnica</h3>
                                <p className="text-[10px] uppercase font-bold opacity-50">Equipo ID: {comentariosActivos}</p>
                            </div>
                            <button onClick={() => setComentariosActivos(null)} className="p-2 rounded-xl transition-colors hover:bg-rose-500/10 text-rose-500">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 flex flex-col-reverse space-y-4 space-y-reverse custom-scrollbar">
                            {listaComentarios.length === 0 ? (
                                <p className="text-center opacity-40 text-xs my-10">Ninguna observación registrada aún.</p>
                            ) : (
                                listaComentarios.map(c => {
                                    const soyYo = c.usuario_id === usuario?.id;
                                    return (
                                    <div key={c.id} className={`flex flex-col ${soyYo ? 'items-end' : 'items-start'}`}>
                                        <div className={`p-3 max-w-[85%] text-sm shadow-sm ${soyYo ? (darkMode ? 'bg-emerald-900/40 border border-emerald-500/30 rounded-2xl rounded-br-none' : 'bg-emerald-100 border border-emerald-200 rounded-2xl rounded-br-none') : (darkMode ? 'bg-[#1b2b10] border border-slate-700 rounded-2xl rounded-bl-none' : 'bg-white border border-slate-200 rounded-2xl rounded-bl-none')}`}>
                                            <p className={`font-medium mb-1 ${darkMode ? 'text-white' : 'text-slate-800'}`}>{c.mensaje}</p>
                                            
                                            {c.archivo_url && (
                                                c.archivo_url.match(/\.(jpeg|jpg|gif|png|webp)$/i) ? (
                                                    <a href={c.archivo_url} target="_blank" rel="noreferrer" className="block mt-2">
                                                        <img src={c.archivo_url} alt="Evidencia" className="max-w-full rounded-lg border border-slate-200/20 max-h-48 object-cover" />
                                                    </a>
                                                ) : (
                                                    <a href={c.archivo_url} target="_blank" rel="noreferrer" className={`flex items-center gap-2 p-2 mt-2 rounded-lg border text-xs font-bold w-fit transition-colors ${darkMode ? 'bg-[#253916] border-[#C9EA63]/30 hover:border-[#C9EA63] text-[#C9EA63]' : 'bg-white border-slate-300 hover:border-emerald-500 text-emerald-600'}`}>
                                                        <FileText size={14}/> Ver adjunto
                                                    </a>
                                                )
                                            )}
                                            
                                            <div className="flex justify-between items-center text-[10px] opacity-60 font-bold mt-1 pt-1 gap-4">
                                                <span>{soyYo ? 'Tú' : c.usuario_nombre || 'Sistema'}</span>
                                                <span>{new Date(c.fecha).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                            </div>
                                        </div>
                                    </div>
                                    );
                                })
                            )}
                        </div>

                        <form onSubmit={enviarComentario} className={`p-4 border-t flex flex-col gap-2 ${darkMode ? 'bg-[#253916] border-[#C9EA63]/20' : 'bg-slate-50 border-slate-200'}`}>
                            {archivoChat && (
                                <div className={`flex items-center justify-between p-2 rounded-lg text-xs font-bold border ${darkMode ? 'bg-[#141f0b] border-[#C9EA63]/30 text-[#C9EA63]' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
                                    <span className="truncate">{archivoChat.name}</span>
                                    <button type="button" onClick={() => setArchivoChat(null)}><X size={14}/></button>
                                </div>
                            )}
                            <textarea 
                                value={nuevoComentario} onChange={e => setNuevoComentario(e.target.value)} required
                                placeholder="Escribe un comentario técnico..."
                                className={`w-full p-3 rounded-xl border text-sm max-h-32 min-h-[60px] outline-none transition-all ${darkMode ? 'bg-[#141f0b] border-[#C9EA63]/30 text-white focus:border-[#C9EA63]' : 'bg-white border-slate-300 text-slate-800 focus:border-emerald-500'}`}
                            />
                            <div className="flex gap-2">
                                <label className={`flex items-center justify-center p-3 rounded-xl border cursor-pointer transition-colors ${darkMode ? 'bg-[#141f0b] border-[#C9EA63]/30 hover:border-[#C9EA63] text-[#F2F6F0]' : 'bg-white border-slate-300 hover:border-emerald-500 text-slate-600'}`}>
                                    <Paperclip size={18} />
                                    <input type="file" className="hidden" onChange={e => e.target.files[0] && setArchivoChat(e.target.files[0])} />
                                </label>
                                <button type="submit" className={`flex-1 p-3 rounded-xl font-black text-xs flex justify-center items-center gap-2 ${darkMode ? 'bg-[#C9EA63] text-[#141f0b]' : 'bg-emerald-600 text-white'}`}>
                                    Enviar <MessageSquare size={14}/>
                                </button>
                            </div>
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
        </div>
    );
};

export default Validacion;
