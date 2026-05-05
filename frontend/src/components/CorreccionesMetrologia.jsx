import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { AlertTriangle, Eye, X, MessageSquare, ThumbsUp, CheckCircle, Send, Paperclip, Camera, FileText } from 'lucide-react';
import { toast } from 'sonner';

const CorreccionesMetrologia = ({ darkMode, usuario }) => {
    const [equipos, setEquipos] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [modalDetalle, setModalDetalle] = useState(false);
    const [equipoDetalle, setEquipoDetalle] = useState(null);
    const [rechazosDetalle, setRechazosDetalle] = useState([]);
    const [scope, setScope] = useState({ tipo: 'propio', area: null }); // Sprint 11-E

    // Two-step correction flow: Set of IDs marked as "corrected" locally
    const [corregidos, setCorregidos] = useState(new Set());

    // Chat state
    const [chatActivo, setChatActivo] = useState(null); // instrumento_id
    const [listaComentarios, setListaComentarios] = useState([]);
    const [nuevoMensaje, setNuevoMensaje] = useState('');
    const [enviandoChat, setEnviandoChat] = useState(false);
    const [archivoChat, setArchivoChat] = useState(null);
    const chatEndRef = useRef(null);

    const fetchData = async () => {
        try {
            setCargando(true);
            const res = await axios.get('/api/metrologia/correcciones');
            setEquipos(Array.isArray(res.data) ? res.data : []);
            setScope({
                tipo: res.headers['x-metrologia-scope'] || 'propio',
                area: res.headers['x-metrologia-area'] || null
            });
        } catch (error) {
            console.error('Error al cargar correcciones:', error);
            setEquipos([]);
        } finally {
            setCargando(false);
        }
    };

    useEffect(() => {
        fetchData();
        window.addEventListener('crm:refresh', fetchData);
        return () => window.removeEventListener('crm:refresh', fetchData);
    }, []);

    useEffect(() => {
        if (chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [listaComentarios]);

    // ── Detail modal ──────────────────────────────────────────────────────────
    const abrirDetalle = async (eq) => {
        setEquipoDetalle(eq);
        setModalDetalle(true);
        try {
            const res = await axios.get(`/api/instrumentos/${eq.id}/rechazos`);
            setRechazosDetalle(Array.isArray(res.data) ? res.data : []);
        } catch (err) { console.error(err); }
    };

    // ── Chat ──────────────────────────────────────────────────────────────────
    const abrirChat = async (id) => {
        try {
            setChatActivo(id);
            const res = await axios.get(`/api/instrumentos/${id}/comentarios`);
            setListaComentarios(Array.isArray(res.data) ? res.data : []);
        } catch (err) { console.error(err); }
    };

    const enviarMensaje = async (e) => {
        if (e) e.preventDefault();
        if ((!nuevoMensaje.trim() && !archivoChat) || !chatActivo || enviandoChat) return;
        setEnviandoChat(true);
        try {
            const fd = new FormData();
            fd.append('mensaje', nuevoMensaje || '');
            if (archivoChat) fd.append('archivo', archivoChat);
            await axios.post(`/api/instrumentos/${chatActivo}/comentarios`, fd);
            setNuevoMensaje('');
            setArchivoChat(null);
            const res = await axios.get(`/api/instrumentos/${chatActivo}/comentarios`);
            setListaComentarios(Array.isArray(res.data) ? res.data : []);
        } catch (err) { console.error(err); } finally {
            setEnviandoChat(false);
        }
    };

    // ── Two-step correction flow ──────────────────────────────────────────────
    const marcarCorregido = (id) => {
        setCorregidos(prev => new Set([...prev, id]));
        toast.info('Marcado como corregido. Presiona "Enviar a Revisión" cuando estés listo.');
    };

    const desmarcarCorregido = (id) => {
        setCorregidos(prev => { const next = new Set(prev); next.delete(id); return next; });
    };

    const finalizarCorreccion = async (id) => {
        try {
            await axios.post(`/api/instrumentos/${id}/finalizar_metrologo`, {});
            toast.success('✅ Corrección enviada a Aseguramiento para re-inspección.');
            setCorregidos(prev => { const next = new Set(prev); next.delete(id); return next; });
            setModalDetalle(false);
            fetchData();
        } catch (err) {
            toast.error('Error al enviar corrección.');
        }
    };

    // ── Styles ────────────────────────────────────────────────────────────────
    const cardBg = darkMode
        ? 'bg-[#1b2b10] border-[#C9EA63]/20 hover:border-[#C9EA63]/50'
        : 'bg-white border-slate-200 hover:border-emerald-300';

    return (
        <div className="w-full animate-in fade-in space-y-6">
            {/* Header */}
            <div className={`flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6 border-b ${darkMode ? 'border-[#C9EA63]/20' : 'border-slate-200'}`}>
                <div>
                    <h2 className={`text-2xl md:text-3xl font-black flex items-center gap-3 ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>
                        <AlertTriangle className="text-orange-500" size={32} />
                        Correcciones Pendientes
                    </h2>
                    <p className={`mt-1 text-sm ${darkMode ? 'text-[#F2F6F0]/60' : 'text-slate-500'}`}>
                        Equipos rechazados por Aseguramiento que requieren tu corrección técnica.
                    </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                    <div className={`px-4 py-2 rounded-2xl text-sm font-black flex items-center gap-2 ${darkMode ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'bg-orange-50 text-orange-700 border border-orange-200'}`}>
                        <AlertTriangle size={16} />
                        {equipos.length} pendiente{equipos.length !== 1 ? 's' : ''}
                    </div>
                    {/* Sprint 11-E — scope visual */}
                    {scope.tipo === 'global' && (
                        <div className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded ${darkMode ? 'bg-amber-500/20 text-amber-300' : 'bg-amber-100 text-amber-700'}`}>
                            👑 Jefe global · TODAS las correcciones
                        </div>
                    )}
                    {scope.tipo === 'area' && (
                        <div className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded ${darkMode ? 'bg-sky-500/20 text-sky-300' : 'bg-sky-100 text-sky-700'}`}>
                            🛡️ Encargado · Área {scope.area}
                        </div>
                    )}
                </div>
            </div>

            {/* Content */}
            {cargando ? (
                <div className={`p-16 text-center ${darkMode ? 'text-[#F2F6F0]/40' : 'text-slate-400'}`}>
                    <div className="inline-block w-10 h-10 border-4 border-t-transparent rounded-full animate-spin border-current" />
                    <p className="mt-4 text-sm font-bold">Cargando correcciones...</p>
                </div>
            ) : equipos.length === 0 ? (
                <div className={`p-16 text-center rounded-3xl border ${darkMode ? 'bg-[#1b2b10] border-[#C9EA63]/10 text-[#F2F6F0]/40' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                    <CheckCircle size={56} className="mx-auto mb-4 opacity-30 text-emerald-500" />
                    <p className="font-black text-lg">¡Todo en orden!</p>
                    <p className="text-sm mt-1 opacity-60">No tienes equipos rechazados pendientes de corrección.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {equipos.map(eq => {
                        const estaCorregido = corregidos.has(eq.id);
                        return (
                            <div
                                key={eq.id}
                                className={`flex flex-col rounded-3xl border transition-all duration-300 overflow-hidden shadow-sm hover:shadow-lg ${cardBg}`}
                            >
                                {/* Top accent bar */}
                                <div className={`h-1.5 w-full ${estaCorregido ? 'bg-emerald-500' : 'bg-rose-500'}`} />

                                <div className="p-6 flex flex-col h-full">
                                    {/* Header row */}
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex flex-col gap-1.5">
                                            <span className={`text-[11px] font-black tracking-[0.15em] uppercase opacity-50 ${darkMode ? 'text-white' : 'text-slate-700'}`}>
                                                {eq.orden_cotizacion}
                                            </span>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                {estaCorregido ? (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 animate-pulse">
                                                        <CheckCircle size={11} /> CORREGIDO
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black bg-rose-600 text-white shadow-lg shadow-rose-600/20">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse inline-block" />
                                                        RECHAZO #{eq.rechazos_aseguramiento || 1}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => abrirDetalle(eq)}
                                            className={`p-2.5 rounded-2xl transition-all ${darkMode ? 'bg-white/5 hover:bg-white/10 text-[#C9EA63]' : 'bg-slate-50 hover:bg-slate-100 text-slate-500'}`}
                                        >
                                            <Eye size={18} />
                                        </button>
                                    </div>

                                    {/* Instrument info */}
                                    <h4 className={`font-black text-lg leading-tight mb-1 ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>
                                        {eq.nombre_instrumento}
                                    </h4>
                                    <p className={`text-xs font-semibold mb-2 truncate opacity-60 ${darkMode ? 'text-white' : 'text-slate-500'}`}>
                                        {eq.empresa}
                                    </p>
                                    {/* Sprint 11-F — metrólogo asignado (visible para jefe global y de área) */}
                                    {eq.asignado_a_nombre && (
                                        <p className={`text-[11px] font-bold mb-6 flex items-center gap-1.5 ${darkMode ? 'text-sky-300' : 'text-sky-700'}`}>
                                            <span className="opacity-50">Asignado a:</span> {eq.asignado_a_nombre}
                                            {eq.area_laboratorio && <span className="opacity-50">· {eq.area_laboratorio}</span>}
                                        </p>
                                    )}

                                    {/* Action buttons */}
                                    <div className="flex flex-col gap-3 mt-auto">
                                        {/* Chat button */}
                                        <button
                                            onClick={() => abrirChat(eq.id)}
                                            className={`flex items-center justify-between p-4 rounded-2xl text-sm font-black transition-all ${darkMode ? 'bg-[#253916] text-[#C9EA63] border border-[#C9EA63]/20 hover:bg-[#314a1c]' : 'bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100'}`}
                                        >
                                            <div className="flex items-center gap-2.5">
                                                <MessageSquare size={18} />
                                                <span>VER CHAT Y MOTIVO</span>
                                            </div>
                                            {(eq.comentarios_count > 0) && (
                                                <span className="bg-rose-600 text-white text-[10px] min-w-[24px] h-6 px-1.5 flex items-center justify-center rounded-full font-black shadow-lg border-2 border-white">
                                                    {eq.comentarios_count}
                                                </span>
                                            )}
                                        </button>

                                        {/* Two-step correction button */}
                                        {estaCorregido ? (
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => desmarcarCorregido(eq.id)}
                                                    className={`p-4 rounded-2xl text-sm font-black transition-all border ${darkMode ? 'border-white/10 text-white/40 hover:bg-white/5' : 'border-slate-200 text-slate-400 hover:bg-slate-50'}`}
                                                >
                                                    <X size={18} />
                                                </button>
                                                <button
                                                    onClick={() => finalizarCorreccion(eq.id)}
                                                    className="flex-1 flex items-center justify-center gap-2.5 p-4 rounded-2xl text-sm font-black transition-all shadow-xl active:scale-95 bg-emerald-500 text-white hover:bg-emerald-600 shadow-emerald-500/20"
                                                >
                                                    <Send size={18} />
                                                    ENVIAR A REVISIÓN
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => marcarCorregido(eq.id)}
                                                className={`flex items-center justify-center gap-2.5 p-4 rounded-2xl text-sm font-black transition-all shadow-xl active:scale-95 ${darkMode ? 'bg-[#C9EA63] text-[#141f0b] hover:bg-[#b0d14b] shadow-[#C9EA63]/10' : 'bg-[#008a5e] text-white hover:bg-[#007b55] shadow-emerald-500/20'}`}
                                            >
                                                <ThumbsUp size={18} />
                                                MARCAR COMO CORREGIDO
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Detail Modal */}
            {modalDetalle && equipoDetalle && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in">
                    <div className={`w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl shadow-2xl border ${darkMode ? 'bg-[#141f0b] border-[#C9EA63]/20' : 'bg-white border-slate-200'}`}>
                        <div className={`p-5 flex justify-between items-center border-b sticky top-0 z-10 ${darkMode ? 'bg-[#1b2b10] border-[#C9EA63]/10' : 'bg-slate-50 border-slate-100'}`}>
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-xl bg-orange-500/20 text-orange-400">
                                    <AlertTriangle size={20} />
                                </div>
                                <div>
                                    <h2 className={`text-base font-black ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>
                                        {equipoDetalle.nombre_instrumento}
                                    </h2>
                                    <p className={`text-[11px] font-bold uppercase tracking-wider ${darkMode ? 'text-[#C9EA63]/70' : 'text-emerald-600'}`}>
                                        {equipoDetalle.orden_cotizacion} · {equipoDetalle.rechazos_aseguramiento || rechazosDetalle.length || 1} rechazo(s)
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setModalDetalle(false)}
                                className={`p-2 rounded-xl ${darkMode ? 'hover:bg-[#253916] text-white/60' : 'hover:bg-slate-200 text-slate-400'}`}
                            >
                                <X size={22} />
                            </button>
                        </div>

                        <div className="p-5 space-y-4">
                            {rechazosDetalle.length === 0 ? (
                                <p className="text-sm opacity-50 italic text-center py-6">Abre el chat para ver el motivo del rechazo.</p>
                            ) : (
                                rechazosDetalle.map((r, i) => (
                                    <div key={r.id} className={`p-4 rounded-2xl border ${darkMode ? 'bg-[#1b2b10] border-[#C9EA63]/10' : 'bg-slate-50 border-slate-200'}`}>
                                        <div className="flex justify-between items-start mb-2">
                                            <span className={`text-[10px] font-black uppercase ${darkMode ? 'text-rose-400' : 'text-rose-600'}`}>
                                                Rechazo #{rechazosDetalle.length - i}
                                            </span>
                                            <span className={`text-[10px] ${darkMode ? 'text-white/30' : 'text-slate-400'}`}>
                                                {new Date(r.fecha_rechazo).toLocaleString('es-MX')}
                                            </span>
                                        </div>
                                        <p className={`text-sm ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>{r.motivo}</p>
                                        {r.rechaza_nombre && (
                                            <p className={`text-[11px] mt-1.5 font-semibold ${darkMode ? 'text-white/40' : 'text-slate-400'}`}>
                                                Por: {r.rechaza_nombre}
                                            </p>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>

                        <div className={`p-5 border-t flex flex-wrap gap-3 ${darkMode ? 'border-[#C9EA63]/10' : 'border-slate-100'}`}>
                            <button
                                onClick={() => { setModalDetalle(false); abrirChat(equipoDetalle.id); }}
                                className={`flex-1 flex justify-center items-center gap-2 py-3 font-bold rounded-2xl border transition-all ${darkMode ? 'border-[#C9EA63]/30 text-[#C9EA63] hover:bg-[#C9EA63]/10' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                            >
                                <MessageSquare size={18} /> Ver Chat
                            </button>
                            <button
                                onClick={() => setModalDetalle(false)}
                                className={`flex-1 py-3 font-bold rounded-2xl ${darkMode ? 'bg-[#253916] text-white hover:bg-[#314a1c]' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* WhatsApp-style Chat Modal */}
            {chatActivo && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex justify-end">
                    <div className={`w-full md:w-[420px] h-full shadow-2xl flex flex-col border-l animate-in slide-in-from-right duration-300 ${darkMode ? 'bg-[#0b141a] border-[#C9EA63]/20' : 'bg-[#efeae2] border-slate-200'}`}>
                        {/* Chat header */}
                        <div className={`p-4 border-b flex justify-between items-center flex-shrink-0 ${darkMode ? 'bg-[#202c33] border-slate-700' : 'bg-[#008a5e] border-transparent'}`}>
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm ${darkMode ? 'bg-[#C9EA63] text-[#141f0b]' : 'bg-white/20 text-white'}`}>
                                    QA
                                </div>
                                <div>
                                    <h3 className={`font-black text-sm ${darkMode ? 'text-[#e9edef]' : 'text-white'}`}>Chat de Corrección</h3>
                                    <p className={`text-[10px] ${darkMode ? 'text-[#8696a0]' : 'text-white/70'}`}>
                                        {equipos.find(e => e.id === chatActivo)?.nombre_instrumento || `Instrumento #${chatActivo}`}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setChatActivo(null)}
                                className={`p-2 rounded-full ${darkMode ? 'hover:bg-white/10 text-[#8696a0]' : 'hover:bg-white/20 text-white'}`}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-2">
                            {listaComentarios.length === 0 ? (
                                <div className="flex justify-center mt-8">
                                    <div className={`px-4 py-2 rounded-lg text-xs shadow-sm ${darkMode ? 'bg-[#182229] text-[#8696a0]' : 'bg-[#ffeecd] text-[#54656f]'}`}>
                                        El chat está vacío. El motivo de rechazo aparecerá aquí.
                                    </div>
                                </div>
                            ) : (
                                listaComentarios.map(c => {
                                    let usuarioId = usuario?.id;
                                    if (!usuarioId) {
                                        try { usuarioId = JSON.parse(localStorage.getItem('crm_usuario') || '{}').id; } catch (_) {}
                                    }
                                    const soyYo = c.mio === true || (usuarioId != null && Number(c.usuario_id) === Number(usuarioId));
                                    return (
                                        <div key={c.id} className={`flex flex-col ${soyYo ? 'items-end' : 'items-start'}`}>
                                            <div className={`max-w-[85%] px-3 py-2 rounded-lg shadow-sm text-sm ${soyYo ? (darkMode ? 'bg-[#005c4b] text-[#e9edef]' : 'bg-[#d9fdd3] text-[#111b21]') : (darkMode ? 'bg-[#202c33] text-[#e9edef]' : 'bg-white text-[#111b21]')}`}>
                                                {!soyYo && (
                                                    <p className={`text-[10px] font-black mb-1 ${darkMode ? 'text-[#53bdeb]' : 'text-[#1fa855]'}`}>
                                                        {c.usuario_nombre || 'Sistema'}
                                                    </p>
                                                )}
                                                {c.mensaje && <p className="whitespace-pre-wrap break-words">{c.mensaje}</p>}
                                                {c.archivo_url && (
                                                    <div className="mt-2 mb-1">
                                                        {c.archivo_url.match(/\.(jpeg|jpg|gif|png|webp)$/i) ? (
                                                            <a href={c.archivo_url} target="_blank" rel="noreferrer" className="block cursor-zoom-in">
                                                                <img src={c.archivo_url} alt="Adjunto" className="rounded-lg max-w-full max-h-[250px] object-cover" />
                                                            </a>
                                                        ) : (
                                                            <a href={c.archivo_url} target="_blank" rel="noreferrer" className={`flex items-center gap-2 p-2 rounded border text-xs font-bold transition-colors ${darkMode ? 'bg-[#182229] border-[#2a3942] text-[#8696a0] hover:bg-[#202c33]' : 'bg-[#f0f2f5] border-[#d1d7db] text-[#54656f] hover:bg-[#e9edef]'}`}>
                                                                <FileText size={16}/> <span>Ver archivo adjunto</span>
                                                            </a>
                                                        )}
                                                    </div>
                                                )}
                                                <p className="text-[10px] opacity-40 text-right mt-1">
                                                    {new Date(c.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                            <div ref={chatEndRef} />
                        </div>

                        {/* Input */}
                        <form onSubmit={enviarMensaje} className={`p-3 flex flex-col gap-2 flex-shrink-0 border-t ${darkMode ? 'bg-[#202c33] border-slate-700' : 'bg-[#f0f2f5] border-slate-200'}`}>
                            {archivoChat && (
                                <div className={`p-2 rounded-lg flex justify-between items-center text-sm ${darkMode ? 'bg-[#2a3942] text-[#e9edef]' : 'bg-white text-[#111b21]'}`}>
                                    <div className="flex items-center gap-2 truncate font-medium">
                                        <Paperclip size={14} />
                                        <span className="truncate">{archivoChat.name}</span>
                                    </div>
                                    <button type="button" onClick={() => setArchivoChat(null)} className={`p-1 rounded-full ${darkMode ? 'hover:bg-[#202c33]' : 'hover:bg-[#f0f2f5]'}`}><X size={14}/></button>
                                </div>
                            )}
                            <div className="flex items-end gap-2">
                                <label className={`p-3 shrink-0 cursor-pointer rounded-full transition-colors ${darkMode ? 'text-[#8696a0] hover:text-[#e9edef] hover:bg-[#2a3942]' : 'text-[#54656f] hover:text-[#111b21] hover:bg-white'}`} title="Adjuntar archivo">
                                    <Paperclip size={18} />
                                    <input type="file" className="hidden" onChange={e => { e.target.files[0] && setArchivoChat(e.target.files[0]); e.target.value = null; }} />
                                </label>
                                <label className={`p-3 shrink-0 cursor-pointer rounded-full transition-colors ${darkMode ? 'text-[#8696a0] hover:text-[#e9edef] hover:bg-[#2a3942]' : 'text-[#54656f] hover:text-[#111b21] hover:bg-white'}`} title="Tomar foto">
                                    <Camera size={18} />
                                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { e.target.files[0] && setArchivoChat(e.target.files[0]); e.target.value = null; }} />
                                </label>
                                <textarea
                                    value={nuevoMensaje}
                                    onChange={e => setNuevoMensaje(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarMensaje(); } }}
                                    placeholder="Escribe una respuesta..."
                                    rows={1}
                                    className={`flex-1 p-3 rounded-2xl text-sm outline-none resize-none max-h-28 overflow-y-auto ${darkMode ? 'bg-[#2a3942] text-[#e9edef] placeholder:text-[#8696a0]' : 'bg-white text-[#111b21] placeholder:text-[#8696a0]'}`}
                                />
                                <button
                                    type="submit"
                                    disabled={(!nuevoMensaje.trim() && !archivoChat) || enviandoChat}
                                    className="w-11 h-11 flex items-center justify-center rounded-full bg-[#008a5e] text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:bg-[#007b55] active:scale-95 flex-shrink-0"
                                >
                                    <Send size={18} />
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CorreccionesMetrologia;
