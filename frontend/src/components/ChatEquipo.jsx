// Componente reutilizable de chat por equipo. Renderiza un modal con la
// conversación + input + adjuntos + cámara. Lógica idéntica a la de
// Validacion.jsx y CorreccionesMetrologia.jsx, ahora compartida.

import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { X, Send, Paperclip, Camera, FileText, MessageSquare } from 'lucide-react';

export default function ChatEquipo({ darkMode, equipoId, equipoNombre, onClose }) {
    const [comentarios, setComentarios] = useState([]);
    const [nuevo, setNuevo] = useState('');
    const [archivo, setArchivo] = useState(null);
    const [enviando, setEnviando] = useState(false);
    const endRef = useRef(null);

    const cargar = async () => {
        try {
            const res = await axios.get(`/api/instrumentos/${equipoId}/comentarios`);
            setComentarios(Array.isArray(res.data) ? res.data : []);
        } catch (e) { console.error(e); }
    };

    useEffect(() => { if (equipoId) cargar(); }, [equipoId]);
    useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [comentarios]);

    const enviar = async (e) => {
        e?.preventDefault?.();
        if (!equipoId || (!nuevo.trim() && !archivo) || enviando) return;
        setEnviando(true);
        try {
            const fd = new FormData();
            fd.append('mensaje', nuevo || '');
            if (archivo) fd.append('archivo', archivo);
            await axios.post(`/api/instrumentos/${equipoId}/comentarios`, fd);
            setNuevo('');
            setArchivo(null);
            await cargar();
        } catch (err) {
            console.error(err);
        } finally { setEnviando(false); }
    };

    let usuarioId = null;
    try { usuarioId = JSON.parse(localStorage.getItem('crm_usuario') || '{}').id; } catch (_) {}

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in">
            <div className={`w-full max-w-lg rounded-3xl shadow-2xl border flex flex-col max-h-[90vh] ${darkMode ? 'bg-[#141f0b] border-[#C9EA63]/20' : 'bg-white border-slate-200'}`}>
                {/* Header */}
                <div className={`p-4 border-b flex items-center justify-between ${darkMode ? 'border-[#C9EA63]/15' : 'border-slate-200'}`}>
                    <div className="flex items-center gap-2 min-w-0">
                        <div className={`p-2 rounded-lg ${darkMode ? 'bg-[#1b2b10] text-[#C9EA63]' : 'bg-emerald-100 text-emerald-600'}`}>
                            <MessageSquare size={16}/>
                        </div>
                        <div className="min-w-0">
                            <p className={`text-[10px] font-black uppercase tracking-widest ${darkMode ? 'text-[#F2F6F0]/40' : 'text-slate-400'}`}>Conversación</p>
                            <p className={`text-sm font-bold truncate ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>{equipoNombre || `Equipo #${equipoId}`}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className={`p-2 rounded-lg ${darkMode ? 'hover:bg-white/5' : 'hover:bg-slate-100'}`}>
                        <X size={18}/>
                    </button>
                </div>

                {/* Mensajes */}
                <div className={`flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2 ${darkMode ? 'bg-[#0a1205]' : 'bg-[#efeae2]'}`}>
                    {comentarios.length === 0 ? (
                        <div className="flex justify-center mt-6">
                            <div className={`px-4 py-2 rounded-lg text-xs shadow-sm ${darkMode ? 'bg-[#182229] text-[#8696a0]' : 'bg-[#ffeecd] text-[#54656f]'}`}>
                                El chat de este equipo está vacío.
                            </div>
                        </div>
                    ) : comentarios.slice().reverse().map(c => {
                        const soyYo = c.mio === true || (usuarioId != null && Number(c.usuario_id) === Number(usuarioId));
                        const bg = soyYo
                            ? (darkMode ? 'bg-[#005c4b] text-[#e9edef]' : 'bg-[#d9fdd3] text-[#111b21]')
                            : (darkMode ? 'bg-[#202c33] text-[#e9edef]' : 'bg-white text-[#111b21]');
                        return (
                            <div key={c.id} className={`flex flex-col ${soyYo ? 'items-end' : 'items-start'}`}>
                                <div className={`max-w-[85%] px-3 py-2 rounded-lg shadow-sm text-sm ${bg}`}>
                                    {!soyYo && (
                                        <p className={`text-[10px] font-black mb-1 ${darkMode ? 'text-[#53bdeb]' : 'text-[#1fa855]'}`}>
                                            {c.usuario_nombre || 'Sistema'}
                                        </p>
                                    )}
                                    {c.mensaje && <p className="whitespace-pre-wrap break-words">{c.mensaje}</p>}
                                    {c.archivo_url && (
                                        <div className="mt-2 mb-1">
                                            {c.archivo_url.match(/\.(jpeg|jpg|gif|png|webp)$/i) ? (
                                                <a href={c.archivo_url} target="_blank" rel="noreferrer">
                                                    <img src={c.archivo_url} alt="adjunto" className="rounded-lg max-w-full max-h-[250px]"/>
                                                </a>
                                            ) : (
                                                <a href={c.archivo_url} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1 text-[11px] font-bold underline ${darkMode ? 'text-[#8696a0]' : 'text-[#54656f]'}`}>
                                                    <FileText size={12}/> Ver archivo
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
                    })}
                    <div ref={endRef} />
                </div>

                {/* Input */}
                <form onSubmit={enviar} className={`p-3 flex flex-col gap-2 border-t ${darkMode ? 'bg-[#202c33] border-slate-700' : 'bg-[#f0f2f5] border-slate-200'}`}>
                    {archivo && (
                        <div className={`p-2 rounded-lg flex justify-between items-center text-xs ${darkMode ? 'bg-[#2a3942] text-[#e9edef]' : 'bg-white text-[#111b21]'}`}>
                            <span className="truncate flex items-center gap-2"><Paperclip size={12}/> {archivo.name}</span>
                            <button type="button" onClick={() => setArchivo(null)}><X size={14}/></button>
                        </div>
                    )}
                    <div className="flex items-end gap-2">
                        <label className={`p-3 cursor-pointer rounded-full ${darkMode ? 'text-[#8696a0] hover:bg-[#2a3942]' : 'text-[#54656f] hover:bg-white'}`} title="Adjuntar archivo">
                            <Paperclip size={18}/>
                            <input type="file" className="hidden" onChange={e => { e.target.files[0] && setArchivo(e.target.files[0]); e.target.value = null; }}/>
                        </label>
                        <label className={`p-3 cursor-pointer rounded-full ${darkMode ? 'text-[#8696a0] hover:bg-[#2a3942]' : 'text-[#54656f] hover:bg-white'}`} title="Tomar foto">
                            <Camera size={18}/>
                            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { e.target.files[0] && setArchivo(e.target.files[0]); e.target.value = null; }}/>
                        </label>
                        <textarea
                            value={nuevo}
                            onChange={e => setNuevo(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
                            placeholder="Escribe un mensaje..."
                            rows={1}
                            className={`flex-1 p-3 rounded-2xl text-sm outline-none resize-none max-h-28 ${darkMode ? 'bg-[#2a3942] text-[#e9edef]' : 'bg-white text-[#111b21]'}`}
                        />
                        <button type="submit" disabled={(!nuevo.trim() && !archivo) || enviando} className="w-11 h-11 flex items-center justify-center rounded-full bg-[#008a5e] text-white disabled:opacity-40 hover:bg-[#007b55]">
                            <Send size={18}/>
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
