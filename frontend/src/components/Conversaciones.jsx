import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { 
    MessageSquare, Phone, Search, Send, User, Bot, Plus, X, Paperclip, 
    FileText, CheckCircle, AlertTriangle, Star, MoreVertical, Download, 
    Image as ImageIcon, Clock
} from 'lucide-react';
import io from 'socket.io-client';

const API = 'http://localhost:3001';

const Conversaciones = ({ darkMode }) => {
    const [chats, setChats] = useState([]);
    const [activeChat, setActiveChat] = useState(null);
    const [mensajes, setMensajes] = useState([]);
    const [inputMsg, setInputMsg] = useState('');
    const [busqueda, setBusqueda] = useState('');
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    
    // Atajos
    const [atajos] = useState(() => {
        const g = localStorage.getItem('sicamet_atajos');
        return g ? JSON.parse(g) : [
            { id: '1', titulo: 'Pedir O.S.', texto: 'Por favor, indícame tu número de Orden de Servicio o Cotización (ej. C26-0449).' },
            { id: '2', titulo: 'Formato Listo', texto: 'Te informamos que tu equipo ya se encuentra listo y calibrado.' }
        ];
    });

    const chatContainerRef = useRef(null);
    const fileInputRef = useRef(null);

    // 1. Cargar lista de chats
    const fetchChats = async () => {
        try {
            const { data } = await axios.get(`${API}/api/whatsapp/chats`);
            setChats(data);
        } catch (err) { console.error('Error fetching chats:', err); }
    };

    // 2. Cargar historial de un chat
    const fetchMensajes = async (numero) => {
        setLoading(true);
        try {
            const { data } = await axios.get(`${API}/api/whatsapp/chats/${encodeURIComponent(numero)}/mensajes`);
            setMensajes(data);
            setLoading(false);
        } catch (err) { 
            console.error('Error fetching messages:', err);
            setLoading(false);
        }
    };

    // 3. Inicializar Sockets y Carga Inicial
    useEffect(() => {
        fetchChats();
        const socket = io(API);
        
        socket.on('nuevo_mensaje_whatsapp', (msg) => {
            // Si el mensaje es del chat activo, añadirlo al historial
            setActiveChat(prevActive => {
                if (prevActive && prevActive.numero_wa === msg.numero_wa) {
                    setMensajes(prev => [...prev, msg]);
                }
                return prevActive;
            });
            fetchChats(); // Refrescar lista lateral
        });

        socket.on('actualizacion_chat_whatsapp', () => {
            fetchChats();
        });

        return () => socket.disconnect();
    }, []);

    // Scroll al final al recibir mensajes
    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [mensajes]);

    const seleccionarChat = (chat) => {
        setActiveChat(chat);
        fetchMensajes(chat.numero_wa);
    };

    const enviarMensaje = async (e) => {
        e?.preventDefault();
        if ((!inputMsg.trim() && !fileInputRef.current?.files[0]) || !activeChat || sending) return;

        setSending(true);
        const formData = new FormData();
        formData.append('numero', activeChat.numero_wa);
        formData.append('texto', inputMsg);
        if (fileInputRef.current.files[0]) {
            formData.append('archivo', fileInputRef.current.files[0]);
        }

        try {
            await axios.post(`${API}/api/whatsapp/enviar`, formData);
            setInputMsg('');
            if (fileInputRef.current) fileInputRef.current.value = '';
        } catch (err) {
            alert('Error al enviar mensaje. Revisa la conexión del bot.');
        } finally {
            setSending(false);
        }
    };

    const toggleConfig = async (campo, valor) => {
        if (!activeChat) return;
        try {
            await axios.put(`${API}/api/whatsapp/chats/${encodeURIComponent(activeChat.numero_wa)}/config`, { [campo]: valor });
            const updatedActive = { ...activeChat, [campo]: valor };
            setActiveChat(updatedActive);
            fetchChats();
        } catch (err) { console.error('Error config:', err); }
    };

    const filtrarChats = chats.filter(c => 
        (c.nombre_contacto || '').toLowerCase().includes(busqueda.toLowerCase()) || 
        c.numero_wa.includes(busqueda)
    );

    const boxBg = darkMode ? 'bg-[#253916] border-[#C9EA63]/20' : 'bg-white border-gray-100 shadow-xl';
    const textTitle = darkMode ? 'text-[#F2F6F0]' : 'text-slate-800';
    const inputBg = darkMode ? 'bg-[#141f0b] border-[#C9EA63]/40 text-[#F2F6F0]' : 'bg-slate-50 border-gray-200 text-slate-800';

    return (
        <div className={`h-[calc(100vh-8rem)] flex flex-col md:flex-row rounded-2xl border overflow-hidden ${boxBg} relative`}>
            
            {/* --- SIDEBAR DE CHATS --- */}
            <div className={`w-full md:w-1/3 h-1/4 md:h-full border-b md:border-b-0 md:border-r flex flex-col shrink-0 ${darkMode ? 'border-[#C9EA63]/20' : 'border-slate-200'}`}>
                <div className="p-4 border-b border-inherit bg-inherit shrink-0">
                    <h2 className={`font-bold text-lg flex items-center gap-2 mb-4 ${textTitle}`}>
                        <MessageSquare size={20} className={darkMode ? 'text-[#C9EA63]' : 'text-emerald-500'} /> CRM WhatsApp
                    </h2>
                    <div className={`flex items-center gap-2 w-full px-3 py-2 border rounded-xl ${inputBg}`}>
                        <Search size={16} className={darkMode ? 'text-[#F2F6F0]/50' : 'text-slate-400'} />
                        <input 
                            type="text" 
                            placeholder="Buscar chats..." 
                            className="bg-transparent border-none outline-none w-full text-sm"
                            value={busqueda}
                            onChange={(e) => setBusqueda(e.target.value)}
                        />
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {filtrarChats.length === 0 && <div className="p-8 text-center text-xs opacity-50">No hay chats activos.</div>}
                    {filtrarChats.map(chat => (
                        <div 
                            key={chat.numero_wa}
                            onClick={() => seleccionarChat(chat)}
                            className={`p-4 border-b cursor-pointer transition-colors flex items-center gap-3 ${
                                activeChat?.numero_wa === chat.numero_wa 
                                    ? (darkMode ? 'bg-[#314a1c] border-[#C9EA63]/40' : 'bg-emerald-50 border-emerald-200') 
                                    : (darkMode ? 'border-[#C9EA63]/10 hover:bg-[#314a1c]/30' : 'border-slate-100 hover:bg-slate-50')
                            }`}
                        >
                            <div className={`w-12 h-12 rounded-full overflow-hidden flex-shrink-0 ${darkMode ? 'bg-[#253916]' : 'bg-slate-200'}`}>
                                {chat.foto_url ? <img src={chat.foto_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-400"><User size={24}/></div>}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-start mb-0.5">
                                    <h4 className={`font-bold text-sm truncate ${textTitle}`}>{chat.nombre_contacto || chat.numero_wa.split('@')[0]}</h4>
                                    <span className="text-[10px] text-slate-500 font-medium whitespace-nowrap">
                                        {new Date(chat.ultima_actividad).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <p className={`text-xs truncate ${darkMode ? 'text-[#F2F6F0]/50' : 'text-slate-500'}`}>
                                        {chat.bot_desactivado === 1 ? <span className="text-rose-400 font-black tracking-tighter uppercase">[Manual] </span> : <span className="text-emerald-500 font-black tracking-tighter uppercase">[In Bot] </span>}
                                        WhatsApp Chat
                                    </p>
                                    {chat.es_favorito === 1 && <Star size={12} className="text-amber-400 fill-amber-400" />}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* --- ÁREA DE CHAT PRINCIPAL --- */}
            <div className="flex-1 min-h-0 md:h-full flex flex-col relative bg-inherit">
                {activeChat ? (
                    <>
                        {/* Cabecera del chat */}
                        <div className={`p-4 border-b flex justify-between items-center ${darkMode ? 'border-[#C9EA63]/20 bg-[#141f0b]/50' : 'border-slate-200 bg-slate-50/50'}`}>
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${darkMode ? 'bg-[#253916] text-[#C9EA63]' : 'bg-emerald-100 text-emerald-600'} overflow-hidden`}>
                                    {activeChat.foto_url ? <img src={activeChat.foto_url} alt="" /> : <User size={20} />}
                                </div>
                                <div>
                                    <h3 className={`font-bold text-sm ${textTitle}`}>{activeChat.nombre_contacto || activeChat.numero_wa.split('@')[0]}</h3>
                                    <p className="text-xs text-emerald-500 flex items-center gap-1 font-mono">
                                        {activeChat.numero_wa.split('@')[0]}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={() => toggleConfig('es_favorito', activeChat.es_favorito === 1 ? 0 : 1)}
                                    className={`p-2 rounded-lg transition-colors ${activeChat.es_favorito === 1 ? 'text-amber-400' : 'text-slate-400 hover:bg-slate-200'}`}
                                >
                                    <Star size={18} className={activeChat.es_favorito === 1 ? 'fill-amber-400' : ''} />
                                </button>
                                <button className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-[#253916] text-[#C9EA63]' : 'hover:bg-slate-200 text-slate-600'}`}>
                                    <MoreVertical size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Contenedor de Mensajes */}
                        <div 
                            ref={chatContainerRef}
                            className={`flex-1 overflow-y-auto p-4 md:p-6 space-y-4 custom-scrollbar ${darkMode ? 'bg-[#141f0b]' : 'bg-[#e5ddd5]/20'}`}
                        >
                            {loading && <div className="text-center p-4 text-xs opacity-50 italic">Cargando historial operativo...</div>}
                            {mensajes.map((msg, i) => (
                                <div key={i} className={`flex ${msg.direccion === 'saliente' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[85%] md:max-w-[70%] p-3 rounded-2xl shadow-sm text-sm group relative ${
                                        msg.direccion === 'saliente'
                                            ? (darkMode ? 'bg-[#C9EA63] text-[#141f0b]' : 'bg-emerald-600 text-white shadow-emerald-500/10') + ' rounded-tr-none'
                                            : (darkMode ? 'bg-[#253916] text-[#F2F6F0]' : 'bg-white text-slate-800') + ' rounded-tl-none'
                                    }`}>
                                        {/* Renderizado de Media */}
                                        {msg.tipo === 'imagen' && msg.url_media && (
                                            <div className="mb-2 rounded-lg overflow-hidden border border-black/10">
                                                <img src={`${API}${msg.url_media}`} alt="WhatsApp" className="max-w-full h-auto cursor-zoom-in" onClick={() => window.open(`${API}${msg.url_media}`)} />
                                            </div>
                                        )}
                                        {msg.tipo === 'archivo' && msg.url_media && (
                                            <a 
                                                href={`${API}${msg.url_media}`} 
                                                target="_blank" 
                                                rel="noreferrer"
                                                className={`flex items-center gap-3 p-3 rounded-xl mb-2 transition-colors ${msg.direccion === 'saliente' ? 'bg-black/10 hover:bg-black/20' : 'bg-emerald-500/10 hover:bg-emerald-500/20'}`}
                                            >
                                                <div className="p-2 bg-indigo-500 rounded-lg text-white shadow-sm"><FileText size={20}/></div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-bold truncate">{msg.cuerpo}</p>
                                                    <p className="text-[9px] opacity-70 italic font-mono uppercase tracking-tighter">Archivo Adjunto</p>
                                                </div>
                                                <Download size={14} className="shrink-0" />
                                            </a>
                                        )}

                                        <p className="whitespace-pre-wrap leading-relaxed">
                                            {msg.tipo === 'texto' ? msg.cuerpo : (msg.tipo === 'imagen' && !msg.cuerpo.includes('Imagen/Archivo') ? msg.cuerpo : '')}
                                        </p>
                                        
                                        <div className={`text-[9px] mt-1 flex items-center justify-end gap-1 opacity-60 font-black uppercase tracking-widest ${msg.direccion === 'saliente' ? 'text-black/60' : 'text-emerald-500'}`}>
                                            {new Date(msg.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            {msg.direccion === 'saliente' && <CheckCircle size={10} />}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Barra de Atajos y Bot Control */}
                        <div className={`p-2 flex gap-2 border-t overflow-x-auto custom-scrollbar ${darkMode ? 'border-[#C9EA63]/20 bg-[#1b2b10]' : 'border-slate-200 bg-white'}`}>
                            <button 
                                onClick={() => toggleConfig('bot_desactivado', activeChat.bot_desactivado === 1 ? 0 : 1)} 
                                className={`flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-black transition-all shadow-md whitespace-nowrap ${
                                    activeChat.bot_desactivado === 0 
                                        ? (darkMode ? 'bg-[#C9EA63] text-[#141f0b]' : 'bg-emerald-600 text-white') 
                                        : (darkMode ? 'bg-rose-900 text-rose-100 border border-rose-500' : 'bg-rose-600 text-white shadow-rose-200')
                                }`}
                            >
                                <Bot size={14} className={activeChat.bot_desactivado === 0 ? 'animate-pulse' : ''} /> 
                                {activeChat.bot_desactivado === 0 ? 'IA ACTIVA: MODO BOT' : 'IA PAUSADA: ATENCIÓN HUMANA'}
                            </button>
                            <div className={`w-px h-6 mx-2 my-auto ${darkMode ? 'bg-white/10' : 'bg-gray-300'}`}></div>

                            {atajos.map(atajo => (
                                <button 
                                    key={atajo.id} 
                                    onClick={() => setInputMsg(atajo.texto)}
                                    className={`flex-shrink-0 px-4 py-1.5 rounded-full text-[10px] font-bold transition-all border ${
                                        darkMode ? 'bg-[#253916] text-[#F2F6F0] border-[#C9EA63]/30 hover:bg-[#C9EA63] hover:text-[#141f0b]' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-emerald-600 hover:text-white'
                                    }`}
                                >
                                    {atajo.titulo}
                                </button>
                            ))}
                        </div>

                        {/* Área de Input */}
                        <form 
                            onSubmit={enviarMensaje}
                            className={`p-4 border-t ${darkMode ? 'border-[#C9EA63]/20 bg-[#253916]' : 'border-slate-200 bg-white'}`}
                        >
                            <div className={`flex items-center gap-2 w-full px-2 py-2 border rounded-full transition-all ${inputBg} ${sending ? 'opacity-50 grayscale pointer-events-none' : 'focus-within:ring-2 focus-within:ring-[#C9EA63]/40'}`}>
                                <button 
                                    type="button"
                                    onClick={() => fileInputRef.current.click()} 
                                    className={`p-2.5 rounded-full transition-colors ${darkMode ? 'text-[#C9EA63] hover:bg-[#141f0b]' : 'text-slate-500 hover:bg-slate-100'}`}
                                >
                                    <Paperclip size={20} />
                                </button>
                                <input type="file" className="hidden" ref={fileInputRef} onChange={(e) => { if(e.target.files[0]) setInputMsg(prev => prev || `[Envío de ${e.target.files[0].name}]`); }} />
                                
                                <input 
                                    type="text" 
                                    placeholder={sending ? "Procesando envío..." : "Escribe un mensaje para WhatsApp..."} 
                                    className="bg-transparent border-none outline-none w-full text-sm px-2"
                                    value={inputMsg}
                                    onChange={(e) => setInputMsg(e.target.value)}
                                    autoFocus
                                />
                                
                                <button 
                                    type="submit"
                                    disabled={sending}
                                    className={`p-3 rounded-full transition-all hover:scale-110 shadow-lg ${darkMode ? 'bg-[#C9EA63] text-[#141f0b]' : 'bg-emerald-600 text-white'}`}
                                >
                                    <Send size={18} className="ml-0.5" />
                                </button>
                            </div>
                        </form>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-inherit">
                        <div className={`w-32 h-32 rounded-full flex items-center justify-center mb-8 animate-pulse ${darkMode ? 'bg-[#253916] text-[#C9EA63]' : 'bg-slate-100 text-slate-300'}`}>
                            <MessageSquare size={56} />
                        </div>
                        <h3 className={`text-3xl font-black mb-2 ${textTitle}`}>Central de Atención</h3>
                        <p className={`max-w-xs text-sm font-medium ${darkMode ? 'text-white/40' : 'text-slate-500'}`}>
                            Selecciona una conversación del panel izquierdo para comenzar a gestionar tus chats con el Bot Pro y tus clientes en tiempo real.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Conversaciones;
