import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { MessageSquare, CheckCircle, X, Trash2, Award } from 'lucide-react';

const FeedbackBot = ({ darkMode }) => {
    const [feedbacks, setFeedbacks] = useState([]);
    const [cargando, setCargando] = useState(true);

    const fetchData = async () => {
        try {
            setCargando(true);
            const res = await axios.get('/api/bot/feedback');
            setFeedbacks(res.data);
        } catch (error) {
            console.error(error);
        } finally {
            setCargando(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const marcarLeido = async (id) => {
        try {
            await axios.put(`/api/bot/feedback/${id}/leido`);
            setFeedbacks(prev => prev.map(f => f.id === id ? { ...f, leido_admin: 1 } : f));
        } catch (err) { console.error(err); }
    };

    const marcarImplementado = async (id) => {
        if (!window.confirm('¿Marcar sugerencia como IMPLEMENTADA?')) return;
        try {
            await axios.put(`/api/bot/feedback/${id}/implementado`);
            setFeedbacks(prev => prev.map(f => f.id === id ? { ...f, implementado: 1, leido_admin: 1 } : f));
        } catch (err) { console.error(err); }
    };

    const eliminarFeedback = async (id) => {
        if (!window.confirm('¿Eliminar esta sugerencia de forma permanente?')) return;
        try {
            await axios.delete(`/api/bot/feedback/${id}`);
            setFeedbacks(prev => prev.filter(f => f.id !== id));
        } catch (err) { console.error(err); }
    };

    const noLeidos = feedbacks.filter(f => !f.leido_admin).length;

    return (
        <div className="w-full animate-in fade-in">
            {/* Header */}
            <div className={`flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-6 mb-6 ${darkMode ? 'border-[#C9EA63]/20' : 'border-[#008a5e]/20'}`}>
                <div>
                    <h2 className={`text-2xl md:text-3xl font-bold flex items-center gap-3 ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>
                        <MessageSquare className={darkMode ? 'text-[#C9EA63]' : 'text-[#008a5e]'} size={32} />
                        Feedback del Bot
                    </h2>
                    <p className={`mt-1 md:mt-2 text-xs md:text-sm ${darkMode ? 'text-[#F2F6F0]/70' : 'text-gray-500'}`}>
                        Sugerencias y mejoras enviadas por los clientes a través del WhatsApp Bot.
                    </p>
                </div>
                {noLeidos > 0 && (
                    <div className="px-4 py-2 rounded-xl text-sm font-black bg-rose-500 text-white flex items-center gap-2">
                        <MessageSquare size={16}/> {noLeidos} nuevo(s)
                    </div>
                )}
            </div>

            {/* Listado */}
            {cargando ? (
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
                                    {!f.leido_admin && !f.implementado && (
                                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                    )}
                                    <span className={`text-[10px] font-black ${darkMode ? 'text-white/30' : 'text-slate-400'}`}>{f.cliente_wa}</span>
                                    {f.empresa && (
                                        <span className={`px-2 py-0.5 rounded text-[9px] font-black ${darkMode ? 'bg-[#253916] text-[#C9EA63]' : 'bg-emerald-100 text-[#008a5e]'}`}>{f.empresa}</span>
                                    )}
                                    <span className={`text-xs ${darkMode ? 'text-white/30' : 'text-slate-400'}`}>{new Date(f.fecha).toLocaleString('es-MX')}</span>
                                    {f.implementado === 1 && (
                                        <span className={`px-2 py-0.5 ml-2 rounded text-[10px] font-black uppercase flex items-center gap-1 ${darkMode ? 'bg-indigo-900/40 text-indigo-300 border border-indigo-500/20' : 'bg-indigo-50 text-indigo-600 border border-indigo-200'}`}>
                                            <Award size={10}/> Implementado
                                        </span>
                                    )}
                                </div>
                                <p className={`mt-2 text-sm ${darkMode ? (f.implementado ? 'text-[#F2F6F0]/60' : 'text-[#F2F6F0]') : (f.implementado ? 'text-slate-500/80' : 'text-slate-800')}`}>{f.mensaje}</p>
                            </div>
                            <div className="flex gap-2 shrink-0">
                                {!f.implementado && (
                                    <button onClick={() => marcarImplementado(f.id)} className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${darkMode ? 'bg-indigo-900/30 text-indigo-400 hover:bg-indigo-900/50' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'}`} title="Marcar como mejora aplicada al sistema">
                                        <Award size={14}/> Implementar
                                    </button>
                                )}
                                {!f.leido_admin && !f.implementado && (
                                    <button onClick={() => marcarLeido(f.id)} className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${darkMode ? 'bg-[#253916] text-[#C9EA63] hover:bg-[#314a1c]' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'}`}>
                                        <CheckCircle size={14}/> Leído
                                    </button>
                                )}
                                <button onClick={() => eliminarFeedback(f.id)} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors opacity-60 hover:opacity-100 ${darkMode ? 'bg-rose-900/20 text-rose-400 hover:bg-rose-900/50' : 'bg-rose-50 text-rose-600 hover:bg-rose-100'}`} title="Eliminar definitivamente">
                                    <Trash2 size={14}/>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default FeedbackBot;
