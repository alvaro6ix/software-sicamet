import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { MessageSquare, CheckCircle, X, Trash2, Award, Brain, Plus, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { confirmar } from '../hooks/alertas';

const FeedbackBot = ({ darkMode }) => {
    const [tab, setTab] = useState('feedback');

    // Tab Feedback
    const [feedbacks, setFeedbacks] = useState([]);
    const [cargandoFb, setCargandoFb] = useState(true);

    // Tab Aprendizaje
    const [aprendizaje, setAprendizaje] = useState([]);
    const [cargandoAp, setCargandoAp] = useState(false);
    const [filtroAp, setFiltroAp] = useState('pendiente');
    const [aprobandoId, setAprobandoId] = useState(null);
    const [respAprobacion, setRespAprobacion] = useState({ pregunta: '', respuesta: '' });

    const fetchFeedback = async () => {
        try {
            setCargandoFb(true);
            const res = await axios.get('/api/bot/feedback');
            setFeedbacks(res.data);
        } catch (error) { console.error(error); }
        finally { setCargandoFb(false); }
    };

    const fetchAprendizaje = async () => {
        try {
            setCargandoAp(true);
            const res = await axios.get(`/api/bot/aprendizaje?estatus=${filtroAp}`);
            setAprendizaje(res.data || []);
        } catch (error) { console.error(error); }
        finally { setCargandoAp(false); }
    };

    useEffect(() => { fetchFeedback(); }, []);
    useEffect(() => { if (tab === 'aprendizaje') fetchAprendizaje(); }, [tab, filtroAp]);

    const marcarLeido = async (id) => {
        try {
            await axios.put(`/api/bot/feedback/${id}/leido`);
            setFeedbacks(prev => prev.map(f => f.id === id ? { ...f, leido_admin: 1 } : f));
        } catch (err) { console.error(err); }
    };

    const marcarImplementado = async (id) => {
        if (!(await confirmar('Marcar como implementada', 'La sugerencia se mostrará como aplicada.'))) return;
        try {
            await axios.put(`/api/bot/feedback/${id}/implementado`);
            setFeedbacks(prev => prev.map(f => f.id === id ? { ...f, implementado: 1, leido_admin: 1 } : f));
        } catch (err) { console.error(err); }
    };

    const eliminarFeedback = async (id) => {
        if (!(await confirmar('Eliminar sugerencia', 'Esta acción es permanente.', { danger: true, confirmText: 'Sí, eliminar' }))) return;
        try {
            await axios.delete(`/api/bot/feedback/${id}`);
            setFeedbacks(prev => prev.filter(f => f.id !== id));
        } catch (err) { console.error(err); }
    };

    const abrirAprobar = (item) => {
        setAprobandoId(item.id);
        setRespAprobacion({ pregunta: item.mensaje_original, respuesta: '' });
    };

    const aprobarApr = async () => {
        if (!respAprobacion.respuesta || respAprobacion.respuesta.trim().length < 5) {
            toast.error('Escribe una respuesta de al menos 5 caracteres');
            return;
        }
        try {
            await axios.post(`/api/bot/aprendizaje/${aprobandoId}/aprobar`, respAprobacion);
            toast.success('FAQ creada y mensaje aprobado');
            setAprobandoId(null);
            setRespAprobacion({ pregunta: '', respuesta: '' });
            await fetchAprendizaje();
        } catch (err) {
            toast.error(err.response?.data?.error || err.message);
        }
    };

    const descartarApr = async (id) => {
        if (!(await confirmar('Descartar mensaje', 'No se generará FAQ y no volverá a aparecer.', { danger: true, confirmText: 'Sí, descartar' }))) return;
        try {
            await axios.post(`/api/bot/aprendizaje/${id}/descartar`);
            await fetchAprendizaje();
        } catch (err) { console.error(err); }
    };

    const noLeidos = feedbacks.filter(f => !f.leido_admin).length;
    const pendientesAp = filtroAp === 'pendiente' ? aprendizaje.length : 0;

    const accent = darkMode ? 'text-[#C9EA63]' : 'text-[#008a5e]';
    const tabBtn = (id, activo) => `px-4 py-2 text-sm font-bold transition-colors border-b-2 ${activo ? `${accent} ${darkMode ? 'border-[#C9EA63]' : 'border-emerald-600'}` : `${darkMode ? 'text-[#F2F6F0]/40' : 'text-slate-400'} border-transparent hover:opacity-100`}`;

    return (
        <div className="w-full animate-in fade-in">
            {/* Header */}
            <div className={`flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-6 mb-6 ${darkMode ? 'border-[#C9EA63]/20' : 'border-[#008a5e]/20'}`}>
                <div>
                    <h2 className={`text-2xl md:text-3xl font-bold flex items-center gap-3 ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>
                        <MessageSquare className={accent} size={32} />
                        Centro del Bot
                    </h2>
                    <p className={`mt-1 md:mt-2 text-xs md:text-sm ${darkMode ? 'text-[#F2F6F0]/70' : 'text-gray-500'}`}>
                        Sugerencias de clientes y mensajes que el bot no supo responder.
                    </p>
                </div>
            </div>

            {/* Tabs */}
            <div className={`flex gap-2 border-b mb-6 ${darkMode ? 'border-[#C9EA63]/15' : 'border-slate-200'}`}>
                <button onClick={() => setTab('feedback')} className={tabBtn('feedback', tab === 'feedback')}>
                    Sugerencias de clientes {noLeidos > 0 && <span className="ml-2 bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{noLeidos}</span>}
                </button>
                <button onClick={() => setTab('aprendizaje')} className={tabBtn('aprendizaje', tab === 'aprendizaje')}>
                    <Brain size={14} className="inline mr-1"/> Bot aprendiendo {pendientesAp > 0 && <span className="ml-2 bg-amber-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{pendientesAp}</span>}
                </button>
            </div>

            {tab === 'feedback' && (
            <>
            {cargandoFb ? (
                <div className={`p-12 text-center ${darkMode ? 'text-[#F2F6F0]/40' : 'text-slate-400'}`}>
                    <div className="inline-block w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : feedbacks.length === 0 ? (
                <div className={`p-12 text-center rounded-2xl border ${darkMode ? 'bg-[#1b2b10] border-[#C9EA63]/10 text-[#F2F6F0]/40' : 'bg-white border-slate-200 text-slate-400'}`}>
                    <MessageSquare size={48} className="mx-auto mb-4 opacity-30" />
                    <p className="font-bold">No hay feedback registrado</p>
                    <p className="text-xs mt-1 opacity-60">Las sugerencias de los clientes aparecerán aquí.</p>
                </div>
            ) : (
                <div className={`border rounded-2xl overflow-hidden divide-y ${darkMode ? 'border-[#C9EA63]/20 divide-[#C9EA63]/5' : 'border-slate-200 divide-slate-100'}`}>
                    {feedbacks.map(f => (
                        <div key={f.id} className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 transition-colors ${!f.leido_admin ? (darkMode ? 'bg-[#C9EA63]/5' : 'bg-emerald-50') : ''} ${darkMode ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`}>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    {!f.leido_admin && !f.implementado && (<span className="w-2 h-2 rounded-full bg-emerald-500" />)}
                                    <span className={`text-[10px] font-black ${darkMode ? 'text-white/30' : 'text-slate-400'}`}>{f.cliente_wa}</span>
                                    {f.empresa && (<span className={`px-2 py-0.5 rounded text-[9px] font-black ${darkMode ? 'bg-[#253916] text-[#C9EA63]' : 'bg-emerald-100 text-[#008a5e]'}`}>{f.empresa}</span>)}
                                    <span className={`text-xs ${darkMode ? 'text-white/30' : 'text-slate-400'}`}>{new Date(f.fecha).toLocaleString('es-MX')}</span>
                                    {f.implementado === 1 && (
                                        <span className={`px-2 py-0.5 ml-2 rounded text-[10px] font-black uppercase flex items-center gap-1 ${darkMode ? 'bg-sky-900/40 text-sky-300 border border-sky-500/20' : 'bg-sky-50 text-sky-600 border border-sky-200'}`}><Award size={10}/> Implementado</span>
                                    )}
                                </div>
                                <p className={`mt-2 text-sm ${darkMode ? (f.implementado ? 'text-[#F2F6F0]/60' : 'text-[#F2F6F0]') : (f.implementado ? 'text-slate-500/80' : 'text-slate-800')}`}>{f.mensaje}</p>
                            </div>
                            <div className="flex gap-2 shrink-0">
                                {!f.implementado && (
                                    <button onClick={() => marcarImplementado(f.id)} className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${darkMode ? 'bg-sky-900/30 text-sky-400 hover:bg-sky-900/50' : 'bg-sky-50 text-sky-700 hover:bg-sky-100'}`}><Award size={14}/> Implementar</button>
                                )}
                                {!f.leido_admin && !f.implementado && (
                                    <button onClick={() => marcarLeido(f.id)} className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${darkMode ? 'bg-[#253916] text-[#C9EA63] hover:bg-[#314a1c]' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'}`}><CheckCircle size={14}/> Leído</button>
                                )}
                                <button onClick={() => eliminarFeedback(f.id)} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors opacity-60 hover:opacity-100 ${darkMode ? 'bg-rose-900/20 text-rose-400 hover:bg-rose-900/50' : 'bg-rose-50 text-rose-600 hover:bg-rose-100'}`} title="Eliminar definitivamente"><Trash2 size={14}/></button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            </>
            )}

            {tab === 'aprendizaje' && (
            <>
                <div className={`mb-4 p-4 rounded-xl border text-xs ${darkMode ? 'bg-amber-900/10 border-amber-500/20 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                    <div className="flex items-start gap-2">
                        <Brain size={16} className="mt-0.5 flex-shrink-0" />
                        <div>
                            Aquí aparecen los mensajes que el bot <b>no supo responder</b>, agrupados por frecuencia.
                            Apruébalos como FAQ para que la próxima vez los entienda.
                        </div>
                    </div>
                </div>

                <div className="flex gap-2 mb-4">
                    {['pendiente', 'aprobado', 'descartado'].map(s => (
                        <button key={s} onClick={() => setFiltroAp(s)} className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${filtroAp === s ? (darkMode ? 'bg-[#C9EA63] text-[#141f0b]' : 'bg-[#008a5e] text-white') : (darkMode ? 'bg-[#1b2b10] text-[#F2F6F0]/60 hover:bg-[#253916]' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}`}>
                            {s.charAt(0).toUpperCase() + s.slice(1)}
                        </button>
                    ))}
                </div>

                {cargandoAp ? (
                    <div className={`p-12 text-center ${darkMode ? 'text-[#F2F6F0]/40' : 'text-slate-400'}`}>
                        <div className="inline-block w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : aprendizaje.length === 0 ? (
                    <div className={`p-12 text-center rounded-2xl border ${darkMode ? 'bg-[#1b2b10] border-[#C9EA63]/10 text-[#F2F6F0]/40' : 'bg-white border-slate-200 text-slate-400'}`}>
                        <Brain size={48} className="mx-auto mb-4 opacity-30" />
                        <p className="font-bold">No hay mensajes {filtroAp}s</p>
                        <p className="text-xs mt-1 opacity-60">Cuando el bot reciba mensajes que no entiende, aparecerán aquí.</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {aprendizaje.map(item => (
                            <div key={item.id} className={`p-4 rounded-xl border ${darkMode ? 'bg-[#1b2b10] border-[#C9EA63]/15' : 'bg-white border-slate-200'}`}>
                                <div className="flex items-start justify-between gap-3 flex-wrap">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap mb-1">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${darkMode ? 'bg-rose-900/40 text-rose-300' : 'bg-rose-100 text-rose-700'}`}>×{item.count}</span>
                                            {item.contexto && (<span className={`text-[10px] ${darkMode ? 'text-[#F2F6F0]/40' : 'text-slate-400'}`}>en {item.contexto}</span>)}
                                            <span className={`text-[10px] ${darkMode ? 'text-[#F2F6F0]/40' : 'text-slate-400'}`}>último: {new Date(item.ultimo_visto).toLocaleString('es-MX')}</span>
                                        </div>
                                        <p className={`text-sm font-bold ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>"{item.mensaje_original}"</p>
                                    </div>
                                    {item.estatus === 'pendiente' && (
                                        <div className="flex gap-2 shrink-0">
                                            <button onClick={() => abrirAprobar(item)} className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${darkMode ? 'bg-emerald-900/30 text-emerald-400 hover:bg-emerald-900/50' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}><Plus size={14}/> Crear FAQ</button>
                                            <button onClick={() => descartarApr(item.id)} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors opacity-60 hover:opacity-100 ${darkMode ? 'bg-rose-900/20 text-rose-400 hover:bg-rose-900/50' : 'bg-rose-50 text-rose-600 hover:bg-rose-100'}`}><X size={14}/></button>
                                        </div>
                                    )}
                                    {item.estatus === 'aprobado' && (<span className={`px-2 py-1 rounded-full text-[10px] font-black ${darkMode ? 'bg-emerald-900/40 text-emerald-300' : 'bg-emerald-100 text-emerald-700'}`}>FAQ #{item.faq_id}</span>)}
                                    {item.estatus === 'descartado' && (<span className={`px-2 py-1 rounded-full text-[10px] font-black ${darkMode ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>Descartado</span>)}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Modal aprobar */}
                {aprobandoId && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in">
                        <div className={`w-full max-w-lg rounded-3xl shadow-2xl border ${darkMode ? 'bg-[#141f0b] border-[#C9EA63]/20' : 'bg-white border-slate-200'}`}>
                            <div className={`p-5 border-b flex items-start justify-between ${darkMode ? 'border-[#C9EA63]/15' : 'border-slate-200'}`}>
                                <div>
                                    <p className={`text-[10px] font-black uppercase tracking-widest ${darkMode ? 'text-[#F2F6F0]/40' : 'text-slate-400'}`}>Crear FAQ</p>
                                    <h3 className={`text-lg font-black ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>El bot ahora podrá responder esto</h3>
                                </div>
                                <button onClick={() => setAprobandoId(null)} className={`p-2 rounded-lg ${darkMode ? 'hover:bg-white/5' : 'hover:bg-slate-100'}`}><X size={18}/></button>
                            </div>
                            <div className="p-5 space-y-4">
                                <div>
                                    <label className={`block text-[10px] font-black uppercase tracking-wider mb-1.5 ${darkMode ? 'text-[#F2F6F0]/60' : 'text-slate-500'}`}>Pregunta clave (palabras que dispararán)</label>
                                    <textarea rows={2} value={respAprobacion.pregunta} onChange={e => setRespAprobacion({...respAprobacion, pregunta: e.target.value})} className={`w-full p-3 rounded-xl text-sm border outline-none ${darkMode ? 'bg-[#1b2b10] border-[#C9EA63]/20 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`} />
                                    <p className={`text-[10px] mt-1 ${darkMode ? 'text-[#F2F6F0]/40' : 'text-slate-400'}`}>Puedes editarla — usa palabras clave separadas por comas (ej: "tiempo, tarda, dias").</p>
                                </div>
                                <div>
                                    <label className={`block text-[10px] font-black uppercase tracking-wider mb-1.5 ${darkMode ? 'text-[#F2F6F0]/60' : 'text-slate-500'}`}>Respuesta del bot</label>
                                    <textarea rows={5} value={respAprobacion.respuesta} onChange={e => setRespAprobacion({...respAprobacion, respuesta: e.target.value})} placeholder="Lo que el bot debe responder cuando un cliente pregunte algo similar..." className={`w-full p-3 rounded-xl text-sm border outline-none ${darkMode ? 'bg-[#1b2b10] border-[#C9EA63]/20 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`} />
                                </div>
                            </div>
                            <div className={`p-4 border-t flex gap-2 ${darkMode ? 'border-[#C9EA63]/15' : 'border-slate-200'}`}>
                                <button onClick={() => setAprobandoId(null)} className={`flex-1 py-2.5 rounded-xl font-bold text-sm ${darkMode ? 'bg-[#1b2b10] text-[#F2F6F0]/70 hover:bg-[#253916]' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Cancelar</button>
                                <button onClick={aprobarApr} className={`flex-[2] py-2.5 rounded-xl font-bold text-sm ${darkMode ? 'bg-[#C9EA63] text-[#141f0b] hover:bg-[#b0d14b]' : 'bg-[#008a5e] text-white hover:bg-[#007b55]'}`}>Crear FAQ y aprobar</button>
                            </div>
                        </div>
                    </div>
                )}
            </>
            )}
        </div>
    );
};

export default FeedbackBot;
