import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import { 
    MessageSquare, Phone, Search, Send, User, Bot, Plus, X, Paperclip, 
    FileText, CheckCircle, AlertTriangle, Star, MoreVertical, Download, 
    Image as ImageIcon, Clock, RefreshCcw, UserCheck, UserX, Bell, Volume2, VolumeX
} from 'lucide-react';
import io from 'socket.io-client';

const API = '';

// ─── Sonido de notificación (generado con Web Audio API) ─────────────────────
function playNotifSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.4, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.4);
    } catch {}
}

const Conversaciones = ({ darkMode, usuario }) => {
    const limpiarID = (id) => {
        if (!id) return '';
        return id.split('@')[0].replace(/[^\d]/g, '');
    };
    const numeroParaMostrar = (chat) => {
        if (!chat) return '';
        const v = chat.numero_visible || chat.telefono_display;
        if (v) return String(v).replace(/\D/g, '');
        return limpiarID(chat.numero_wa);
    };

    const [chats, setChats] = useState([]);
    const [activeChat, setActiveChat] = useState(null);
    const [mobileView, setMobileView] = useState('list');
    const [mensajes, setMensajes] = useState([]);
    const [inputMsg, setInputMsg] = useState('');
    const [busqueda, setBusqueda] = useState('');
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [soundEnabled, setSoundEnabled] = useState(() => {
        return localStorage.getItem('sicamet_sound') !== 'off';
    });

    // ─── Sistema de asignación de conversaciones ─────────────────────────────
    const [asignaciones, setAsignaciones] = useState({}); // { numero_wa: { usuario_id, usuario_nombre } }
    const [asignandoChat, setAsignandoChat] = useState(false);

    const fetchAsignaciones = async () => {
        try {
            const { data } = await axios.get(`${API}/api/whatsapp/asignaciones`);
            const mapa = {};
            (data || []).forEach(a => { mapa[a.numero_wa] = a; });
            setAsignaciones(mapa);
        } catch {}
    };

    const tomarConversacion = async (numWa) => {
        if (asignandoChat) return;
        setAsignandoChat(true);
        try {
            await axios.post(`${API}/api/whatsapp/chats/${encodeURIComponent(numWa)}/asignar`);
            fetchAsignaciones();
        } catch (err) {
            alert('Error al tomar conversación');
        } finally {
            setAsignandoChat(false);
        }
    };

    const liberarConversacion = async (numWa) => {
        try {
            await axios.delete(`${API}/api/whatsapp/chats/${encodeURIComponent(numWa)}/asignar`);
            fetchAsignaciones();
        } catch {}
    };

    const miAsignacion = activeChat ? asignaciones[limpiarID(activeChat.numero_wa)] : null;
    const soyYoElAsignado = miAsignacion && miAsignacion.usuario_id === usuario?.id;
    const otraPersonaAtiende = miAsignacion && miAsignacion.usuario_id !== usuario?.id;

    // Atajos
    const [atajos, setAtajos] = useState(() => {
        const g = localStorage.getItem('sicamet_atajos');
        return g ? JSON.parse(g) : [
            { id: '1', titulo: 'Pedir O.S.', texto: 'Por favor, indícame tu número de Orden de Servicio o Cotización (ej. C26-0449).' },
            { id: '2', titulo: 'Formato Listo', texto: 'Te informamos que tu equipo ya se encuentra listo y calibrado.' },
            { id: '3', titulo: 'Aviso Demora', texto: 'Le informamos que su equipo presenta una demora adicional en el proceso de calibración. En breve le notificaremos la nueva fecha estimada.' }
        ];
    });
    const [nuevoAtajo, setNuevoAtajo] = useState({ visible: false, titulo: '', texto: '' });

    const guardarAtajos = (lista) => {
        setAtajos(lista);
        localStorage.setItem('sicamet_atajos', JSON.stringify(lista));
    };

    const agregarAtajo = () => {
        if (!nuevoAtajo.titulo.trim() || !nuevoAtajo.texto.trim()) return;
        guardarAtajos([...atajos, { id: Date.now().toString(), titulo: nuevoAtajo.titulo.trim(), texto: nuevoAtajo.texto.trim() }]);
        setNuevoAtajo({ visible: false, titulo: '', texto: '' });
    };

    const eliminarAtajo = (id) => guardarAtajos(atajos.filter(a => a.id !== id));

    const chatContainerRef = useRef(null);
    const fileInputRef = useRef(null);
    const activeChatRef = useRef(null);
    const soundRef = useRef(soundEnabled);
    soundRef.current = soundEnabled;

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
        fetchAsignaciones();
        const socket = io(API);
        
        socket.on('nuevo_mensaje_whatsapp', (msg) => {
            setActiveChat(prevActive => {
                activeChatRef.current = prevActive;
                if (prevActive && limpiarID(prevActive.numero_wa) === limpiarID(msg.numero_wa)) {
                    setMensajes(prev => {
                        // Evitar duplicados por id de mensaje
                        if (prev.some(m => m.id === msg.id)) return prev;
                        return [...prev, msg];
                    });
                } else if (msg.direccion !== 'saliente') {
                    // Mensaje nuevo de otro chat → sonar si está habilitado
                    if (soundRef.current) playNotifSound();
                }
                return prevActive;
            });
            fetchChats();
        });

        socket.on('actualizacion_chat_whatsapp', () => fetchChats());

        // Eventos de asignación en tiempo real
        socket.on('chat_asignado', (data) => {
            setAsignaciones(prev => ({ ...prev, [data.numero_wa]: data }));
        });
        socket.on('chat_liberado', (data) => {
            setAsignaciones(prev => {
                const next = { ...prev };
                delete next[data.numero_wa];
                return next;
            });
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
        setMobileView('chat');
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
        String(c.numero_wa || '').includes(busqueda.replace(/\D/g, '')) ||
        String(numeroParaMostrar(c)).includes(busqueda.replace(/\D/g, ''))
    );

    const [showMenu, setShowMenu] = useState(false);
    const menuRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleVaciarChat = async () => {
        if (!activeChat) return;
        if (!window.confirm(`⚠️ ¿Vaciar mensajes y reiniciar sesión del bot con ${activeChat.nombre_contacto || numeroParaMostrar(activeChat)}?`)) return;
        try {
            await axios.delete(`${API}/api/whatsapp/chats/${encodeURIComponent(activeChat.numero_wa)}/mensajes`);
            setMensajes([]);
            setShowMenu(false);
            fetchChats();
        } catch (err) { alert('Error al vaciar chat'); }
    };

    const handleEliminarChat = async () => {
        if (!activeChat) return;
        if (!window.confirm(`⚠️ ¿Eliminar por completo el chat con ${numeroParaMostrar(activeChat)}?`)) return;
        try {
            await axios.delete(`${API}/api/whatsapp/chats/${encodeURIComponent(activeChat.numero_wa)}`);
            setActiveChat(null);
            setMensajes([]);
            setShowMenu(false);
            fetchChats();
        } catch (err) { alert('Error al eliminar chat'); }
    };

    const handleReenviar = (msg) => { setInputMsg(msg.cuerpo || ''); setShowMenu(false); };

    const toggleSound = () => {
        const newVal = !soundEnabled;
        setSoundEnabled(newVal);
        localStorage.setItem('sicamet_sound', newVal ? 'on' : 'off');
        if (newVal) playNotifSound(); // Sonido de prueba
    };

    const boxBg = darkMode ? 'bg-[#253916] border-[#C9EA63]/20' : 'bg-white border-gray-100 shadow-xl';
    const textTitle = darkMode ? 'text-[#F2F6F0]' : 'text-slate-800';
    const inputBg = darkMode ? 'bg-[#141f0b] border-[#C9EA63]/40 text-[#F2F6F0]' : 'bg-slate-50 border-gray-200 text-slate-800';

    return (
        <div className={`h-[calc(100vh-6.5rem)] flex flex-col md:flex-row rounded-2xl border overflow-hidden ${boxBg} relative`}>
            
            {/* --- SIDEBAR DE CHATS --- */}
            <div className={`w-full md:w-1/3 h-full border-b md:border-b-0 md:border-r flex flex-col shrink-0 ${mobileView === 'list' ? 'flex' : 'hidden md:flex'} ${darkMode ? 'border-[#C9EA63]/20' : 'border-slate-200'}`}>
                <div className="p-4 border-b border-inherit bg-inherit shrink-0">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className={`font-bold text-lg flex items-center gap-2 ${textTitle}`}>
                            <MessageSquare size={20} className={darkMode ? 'text-[#C9EA63]' : 'text-[#008a5e]'} /> CRM WhatsApp
                        </h2>
                        {/* Botón de sonido */}
                        <button
                            onClick={toggleSound}
                            title={soundEnabled ? 'Silenciar notificaciones' : 'Activar sonido de notificaciones'}
                            className={`p-2 rounded-full transition-all ${soundEnabled 
                                ? (darkMode ? 'bg-[#C9EA63]/20 text-[#C9EA63]' : 'bg-emerald-50 text-[#008a5e]') 
                                : (darkMode ? 'bg-white/5 text-white/30' : 'bg-slate-100 text-slate-400')
                            }`}
                        >
                            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                        </button>
                    </div>
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
                    {filtrarChats.map(chat => {
                        const numMostrar = numeroParaMostrar(chat);
                        const numLimpio = limpiarID(chat.numero_wa);
                        const asignacion = asignaciones[numLimpio];
                        const soyYoAqui = asignacion && asignacion.usuario_id === usuario?.id;
                        const otraPersonaAqui = asignacion && asignacion.usuario_id !== usuario?.id;

                        return (
                            <div 
                                key={chat.numero_wa}
                                onClick={() => seleccionarChat(chat)}
                                className={`p-4 border-b cursor-pointer transition-colors flex items-center gap-3 ${
                                    activeChat?.numero_wa === chat.numero_wa 
                                        ? (darkMode ? 'bg-[#314a1c] border-[#C9EA63]/40' : 'bg-emerald-50 border-[#008a5e]/20') 
                                        : (darkMode ? 'border-[#C9EA63]/10 hover:bg-[#314a1c]/30' : 'border-slate-100 hover:bg-slate-50')
                                }`}
                            >
                                <div className={`w-12 h-12 rounded-full overflow-hidden flex-shrink-0 relative ${darkMode ? 'bg-[#253916]' : 'bg-slate-200'}`}>
                                    {chat.foto_url ? <img src={chat.foto_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-400"><User size={24}/></div>}
                                    {/* Indicador de quién atiende */}
                                    {asignacion && (
                                        <div 
                                            className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center border-2 text-[8px] font-black ${soyYoAqui ? 'bg-emerald-500 border-emerald-700 text-white' : 'bg-amber-400 border-amber-600 text-black'}`}
                                            title={soyYoAqui ? 'Tú atiendes' : `Atiende: ${asignacion.usuario_nombre}`}
                                        >
                                            {soyYoAqui ? '✓' : '!'}
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start mb-0.5">
                                        <h4 className={`font-bold text-sm truncate ${textTitle}`}>
                                            {chat.nombre_contacto?.includes('@') ? limpiarID(chat.nombre_contacto) : (chat.nombre_contacto || numMostrar)}
                                        </h4>
                                        <span className="text-[10px] text-slate-500 font-medium whitespace-nowrap">
                                            {new Date(chat.ultima_actividad).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between gap-1">
                                        <p className={`text-xs truncate font-mono ${darkMode ? 'text-[#F2F6F0]/50' : 'text-slate-500'}`} title={`ID interno: ${chat.numero_wa}`}>
                                            {chat.bot_desactivado === 1 ? <span className="text-rose-400 font-black tracking-tighter uppercase">[Manual] </span> : <span className={`${darkMode ? 'text-[#C9EA63]' : 'text-[#008a5e]'} font-black tracking-tighter uppercase`}>[In Bot] </span>}
                                            {numMostrar}
                                        </p>
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                            {chat.es_favorito === 1 && <Star size={10} className="text-amber-400 fill-amber-400" />}
                                            {otraPersonaAqui && (
                                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${darkMode ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700'}`}>
                                                    {asignacion.usuario_nombre?.split(' ')[0]}
                                                </span>
                                            )}
                                            {soyYoAqui && (
                                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${darkMode ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-700'}`}>
                                                    Tú
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* --- ÁREA DE CHAT PRINCIPAL --- */}
            <div className={`flex-1 min-h-0 h-full flex flex-col relative bg-inherit ${mobileView === 'chat' ? 'flex' : 'hidden md:flex'}`}>
                {activeChat ? (
                    <>
                        {/* Cabecera del chat */}
                        <div className={`p-3 md:p-4 border-b flex flex-col gap-2 ${darkMode ? 'border-[#C9EA63]/20 bg-[#141f0b]/50' : 'border-slate-200 bg-slate-50/50'}`}>
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-2 md:gap-3">
                                    <button 
                                        onClick={() => setMobileView('list')}
                                        className={`md:hidden p-2 -ml-2 rounded-full hover:bg-black/10 ${darkMode ? 'text-[#C9EA63]' : 'text-slate-600'}`}
                                    >
                                        <X size={20} />
                                    </button>
                                    
                                    <div className={`w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center ${darkMode ? 'bg-[#253916] text-[#C9EA63]' : 'bg-emerald-50 text-[#008a5e]'} overflow-hidden shrink-0`}>
                                        {activeChat.foto_url ? <img src={activeChat.foto_url} alt="" className="w-full h-full object-cover" /> : <User size={18} />}
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className={`font-bold text-sm truncate ${textTitle}`}>
                                            {activeChat.nombre_contacto?.includes('@') ? limpiarID(activeChat.nombre_contacto) : (activeChat.nombre_contacto || numeroParaMostrar(activeChat))}
                                        </h3>
                                        <p className={`text-[10px] md:text-xs ${darkMode ? 'text-[#C9EA63]' : 'text-[#008a5e]'} flex items-center gap-1 font-mono truncate`} title={`ID CRM: ${activeChat.numero_wa}`}>
                                            <Phone size={10} /> {numeroParaMostrar(activeChat)}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 relative" ref={menuRef}>
                                    <button 
                                        onClick={() => toggleConfig('es_favorito', activeChat.es_favorito === 1 ? 0 : 1)}
                                        className={`p-2 rounded-lg transition-colors ${activeChat.es_favorito === 1 ? 'text-amber-400' : 'text-slate-400 hover:bg-slate-200'}`}
                                    >
                                        <Star size={18} className={activeChat.es_favorito === 1 ? 'fill-amber-400' : ''} />
                                    </button>
                                    
                                    <button 
                                        onClick={() => setShowMenu(!showMenu)}
                                        className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-[#253916] text-[#C9EA63]' : 'hover:bg-slate-200 text-slate-600'}`}
                                    >
                                        <MoreVertical size={18} />
                                    </button>

                                    {showMenu && (
                                        <div className={`absolute right-0 top-12 w-52 rounded-xl border shadow-2xl z-50 py-2 ${darkMode ? 'bg-[#1b2b10] border-[#C9EA63]/30' : 'bg-white border-slate-100'}`}>
                                            <button 
                                                onClick={handleVaciarChat}
                                                className={`w-full text-left px-4 py-2 text-xs font-bold transition-colors ${darkMode ? 'text-rose-400 hover:bg-rose-950/30' : 'text-rose-600 hover:bg-rose-50'}`}
                                            >
                                                Vaciar mensajes + reiniciar bot
                                            </button>
                                            <button 
                                                onClick={handleEliminarChat}
                                                className={`w-full text-left px-4 py-2 text-xs font-bold transition-colors ${darkMode ? 'text-orange-300 hover:bg-orange-950/30' : 'text-orange-700 hover:bg-orange-50'}`}
                                            >
                                                Eliminar chat del CRM
                                            </button>
                                            <div className={`h-px mx-2 my-1 ${darkMode ? 'bg-[#C9EA63]/10' : 'bg-slate-100'}`}></div>
                                            <button 
                                                onClick={() => window.alert("Próximamente: Exportar historial")}
                                                className={`w-full text-left px-4 py-2 text-xs font-bold transition-colors ${darkMode ? 'text-[#F2F6F0] hover:bg-[#C9EA63]/10' : 'text-slate-600 hover:bg-slate-50'}`}
                                            >
                                                EXPORTAR CHAT
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* ─── BANNER DE ASIGNACIÓN ─────────────────────────────── */}
                            {otraPersonaAtiende && (
                                <div className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold border ${darkMode ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                                    <div className="flex items-center gap-2">
                                        <UserCheck size={14} />
                                        <span>Esta conversación la atiende <strong>{miAsignacion.usuario_nombre}</strong></span>
                                    </div>
                                    <button 
                                        onClick={() => tomarConversacion(limpiarID(activeChat.numero_wa))}
                                        className={`px-2 py-1 rounded-lg text-[10px] font-black transition-all ${darkMode ? 'bg-amber-500 text-black hover:bg-amber-400' : 'bg-amber-500 text-white hover:bg-amber-600'}`}
                                    >
                                        Tomar igual
                                    </button>
                                </div>
                            )}
                            {soyYoElAsignado && (
                                <div className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold border ${darkMode ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
                                    <div className="flex items-center gap-2">
                                        <UserCheck size={14} />
                                        <span>Tú estás atendiendo esta conversación</span>
                                    </div>
                                    <button 
                                        onClick={() => liberarConversacion(limpiarID(activeChat.numero_wa))}
                                        className={`px-2 py-1 rounded-lg text-[10px] font-black transition-all ${darkMode ? 'bg-white/10 text-white/70 hover:bg-white/20' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                    >
                                        Liberar
                                    </button>
                                </div>
                            )}
                            {!miAsignacion && (
                                <div className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs border ${darkMode ? 'bg-white/5 border-white/10 text-white/40' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                                    <span className="font-bold">Sin asignar — nadie atiende esta conversación</span>
                                    <button 
                                        onClick={() => tomarConversacion(limpiarID(activeChat.numero_wa))}
                                        disabled={asignandoChat}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${darkMode ? 'bg-[#C9EA63] text-[#141f0b] hover:bg-[#b0d14b]' : 'bg-[#008a5e] text-white hover:bg-[#007b55]'}`}
                                    >
                                        <UserCheck size={12} /> Atender yo
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Contenedor de Mensajes */}
                        <div 
                            ref={chatContainerRef}
                            className={`flex-1 overflow-y-auto p-4 md:p-6 flex flex-col space-y-1 relative custom-scrollbar ${darkMode ? 'bg-[#0b141a]' : 'bg-[#efeae2]'}`}
                        >
                            <div className="absolute inset-0 opacity-[0.06] dark:opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'url("https://w7.pngwing.com/pngs/365/157/png-transparent-whatsapp-logo-whatsapp-pattern-texture-pattern-thumbnail.png")', backgroundSize: '300px', backgroundRepeat: 'repeat' }}></div>
                            
                            <div className="relative z-10 flex flex-col w-full pb-4">
                                {loading && <div className="text-center p-4 text-xs opacity-50 italic w-full">Cargando historial operativo...</div>}
                                {mensajes.map((msg, i, arr) => {
                                    const soyYo = msg.direccion === 'saliente';
                                    const prevMsg = arr[i - 1];
                                    const nextMsg = arr[i + 1];
                                    const sameUserPrev = prevMsg && (prevMsg.direccion === 'saliente') === soyYo;
                                    const sameUserNext = nextMsg && (nextMsg.direccion === 'saliente') === soyYo;
                                    
                                    const msgBg = soyYo 
                                        ? (darkMode ? 'bg-[#005c4b] text-[#e9edef]' : 'bg-[#d9fdd3] text-[#111b21]') 
                                        : (darkMode ? 'bg-[#202c33] text-[#e9edef]' : 'bg-white text-[#111b21]');

                                    return (
                                        <div key={i} className={`flex flex-col w-full group relative ${soyYo ? 'items-end' : 'items-start'} ${sameUserNext ? 'mb-[2px]' : 'mb-3'}`}>
                                            <div className={`relative max-w-[85%] sm:max-w-[75%] px-3 py-2 shadow-[0_1px_0.5px_rgba(0,0,0,0.13)] ${msgBg}`}
                                                 style={{
                                                    borderTopLeftRadius: !soyYo && !sameUserPrev ? '0' : '8px',
                                                    borderTopRightRadius: soyYo && !sameUserPrev ? '0' : '8px',
                                                    borderBottomLeftRadius: '8px',
                                                    borderBottomRightRadius: '8px'
                                                 }}
                                            >
                                                {/* Imagen recibida por WhatsApp */}
                                                {(msg.tipo === 'imagen' || msg.tipo === 'sticker') && msg.url_media && (
                                                    <div className="mb-2 rounded-lg overflow-hidden border border-black/10">
                                                        <img src={`${API}${msg.url_media}`} alt="WhatsApp" className="max-w-full max-h-[300px] object-cover cursor-zoom-in" onClick={() => window.open(`${API}${msg.url_media}`)} />
                                                    </div>
                                                )}
                                                {msg.tipo === 'archivo' && msg.url_media && (
                                                    <a 
                                                        href={`${API}${msg.url_media}`} 
                                                        target="_blank" 
                                                        rel="noreferrer"
                                                        className={`flex items-center gap-3 p-3 rounded-xl mb-2 transition-colors ${msg.direccion === 'saliente' ? 'bg-black/10 hover:bg-black/20' : 'bg-black/5 hover:bg-black/10'}`}
                                                    >
                                                        <div className={`p-2 rounded-lg text-white shadow-sm ${darkMode ? 'bg-[#C9EA63] text-[#141f0b]' : 'bg-[#008a5e]'}`}><FileText size={20}/></div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-xs font-bold truncate">{msg.cuerpo || 'Documento'}</p>
                                                            <p className="text-[9px] opacity-70 italic font-mono uppercase tracking-tighter">Archivo Adjunto</p>
                                                        </div>
                                                        <Download size={14} className="shrink-0" />
                                                    </a>
                                                )}

                                                {/* Texto del mensaje — solo si es texto puro o imagen con caption real */}
                                                {(() => {
                                                    const cuerpo = msg.cuerpo || '';
                                                    // Nunca mostrar base64 crudo ni placeholders técnicos
                                                    const esBase64 = cuerpo.length > 200 && /^[A-Za-z0-9+/=]{100,}$/.test(cuerpo.replace(/\s/g,''));
                                                    const esTipoMedia = ['imagen','sticker','archivo'].includes(msg.tipo);
                                                    const esCaptionVacio = !cuerpo || cuerpo === '[Media]' || cuerpo.startsWith('[') || esBase64;
                                                    if (msg.tipo === 'texto' && !esBase64) {
                                                        return <p className="text-[14.2px] leading-[19px] whitespace-pre-wrap break-words">{cuerpo}</p>;
                                                    }
                                                    if (esTipoMedia && !esCaptionVacio) {
                                                        return <p className="text-[14.2px] leading-[19px] whitespace-pre-wrap break-words">{cuerpo}</p>;
                                                    }
                                                    if (esTipoMedia && !msg.url_media) {
                                                        // Media sin archivo guardado (sticker sin descarga, etc.)
                                                        return <p className="text-[11px] italic opacity-50">{msg.tipo === 'sticker' ? '🎭 Sticker' : '📎 Archivo multimedia'}</p>;
                                                    }
                                                    return null;
                                                })()}
                                                
                                                <div className={`float-right ml-3 mt-1 flex items-center justify-end gap-1 font-medium`}>
                                                    <span className={`text-[10.5px] ${darkMode ? 'text-[#8696a0]' : 'text-[#667781]'}`}>
                                                        {new Date(msg.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                    {soyYo && <CheckCircle size={14} className={darkMode ? "text-[#53bdeb]" : "text-[#53bdeb]"} />}
                                                </div>

                                                <button 
                                                    onClick={() => handleReenviar(msg)}
                                                    title="Reenviar mensaje"
                                                    className={`absolute top-1 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-full shadow-lg border z-10 ${
                                                        msg.direccion === 'saliente' 
                                                            ? `-left-10 ${darkMode ? 'bg-[#202c33] border-[#2a3942] text-[#8696a0]' : 'bg-white border-slate-200 text-slate-500'}` 
                                                            : `-right-10 ${darkMode ? 'bg-[#202c33] border-[#2a3942] text-[#8696a0]' : 'bg-white border-slate-200 text-slate-500'}`
                                                    }`}
                                                >
                                                    <RefreshCcw size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Barra de Atajos y Bot Control */}
                        <div className={`p-2 flex gap-2 border-t overflow-x-auto custom-scrollbar ${darkMode ? 'border-[#C9EA63]/20 bg-[#1b2b10]' : 'border-slate-200 bg-white'}`}>
                            <button 
                                onClick={() => toggleConfig('bot_desactivado', activeChat.bot_desactivado === 1 ? 0 : 1)} 
                                className={`flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-black transition-all shadow-md whitespace-nowrap ${
                                    activeChat.bot_desactivado === 0 
                                        ? (darkMode ? 'bg-[#C9EA63] text-[#141f0b]' : 'bg-[#008a5e] text-white') 
                                        : (darkMode ? 'bg-rose-900 text-rose-100 border border-rose-500' : 'bg-rose-600 text-white shadow-rose-200')
                                }`}
                            >
                                <Bot size={14} className={activeChat.bot_desactivado === 0 ? 'animate-pulse' : ''} /> 
                                {activeChat.bot_desactivado === 0 ? 'IA ACTIVA: MODO BOT' : 'IA PAUSADA: ATENCIÓN HUMANA'}
                            </button>
                            <div className={`w-px h-6 mx-1 my-auto flex-shrink-0 ${darkMode ? 'bg-white/10' : 'bg-gray-300'}`}></div>

                            {atajos.map(atajo => (
                                <div key={atajo.id} className="flex items-center gap-0.5 flex-shrink-0 group/atajo">
                                    <button 
                                        onClick={() => setInputMsg(atajo.texto)}
                                        className={`px-3 py-1.5 rounded-full text-[10px] font-bold transition-all border ${
                                            darkMode ? 'bg-[#253916] text-[#F2F6F0] border-[#C9EA63]/30 hover:bg-[#C9EA63] hover:text-[#141f0b]' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-[#008a5e] hover:text-white'
                                        }`}
                                    >
                                        {atajo.titulo}
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); eliminarAtajo(atajo.id); }}
                                        className={`opacity-0 group-hover/atajo:opacity-100 transition-opacity p-0.5 rounded-full text-[9px] ${
                                            darkMode ? 'text-rose-400 hover:bg-rose-900/40' : 'text-rose-500 hover:bg-rose-50'
                                        }`}
                                        title="Eliminar atajo"
                                    >
                                        <X size={10} />
                                    </button>
                                </div>
                            ))}

                            {nuevoAtajo.visible ? (
                                <div className={`flex items-center gap-1.5 flex-shrink-0 px-2 py-1 rounded-xl border ${
                                    darkMode ? 'bg-[#253916] border-[#C9EA63]/30' : 'bg-slate-50 border-slate-200'
                                }`}>
                                    <input
                                        type="text"
                                        placeholder="Título"
                                        value={nuevoAtajo.titulo}
                                        onChange={e => setNuevoAtajo(p => ({ ...p, titulo: e.target.value }))}
                                        className={`text-[10px] font-bold bg-transparent outline-none w-20 ${
                                            darkMode ? 'text-[#F2F6F0] placeholder:text-white/30' : 'text-slate-700 placeholder:text-slate-400'
                                        }`}
                                        autoFocus
                                    />
                                    <input
                                        type="text"
                                        placeholder="Texto completo..."
                                        value={nuevoAtajo.texto}
                                        onChange={e => setNuevoAtajo(p => ({ ...p, texto: e.target.value }))}
                                        onKeyDown={e => e.key === 'Enter' && agregarAtajo()}
                                        className={`text-[10px] bg-transparent outline-none w-40 ${
                                            darkMode ? 'text-[#F2F6F0] placeholder:text-white/30' : 'text-slate-600 placeholder:text-slate-400'
                                        }`}
                                    />
                                    <button onClick={agregarAtajo} className="text-emerald-500 hover:text-emerald-400" title="Guardar">
                                        <CheckCircle size={14} />
                                    </button>
                                    <button onClick={() => setNuevoAtajo({ visible: false, titulo: '', texto: '' })} className="text-slate-400 hover:text-rose-400" title="Cancelar">
                                        <X size={12} />
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setNuevoAtajo(p => ({ ...p, visible: true }))}
                                    className={`flex-shrink-0 p-1.5 rounded-full border transition-all ${
                                        darkMode ? 'border-[#C9EA63]/20 text-[#C9EA63]/60 hover:bg-[#253916] hover:text-[#C9EA63]' : 'border-slate-200 text-slate-400 hover:bg-emerald-50 hover:text-[#008a5e]'
                                    }`}
                                    title="Añadir atajo rápido"
                                >
                                    <Plus size={13} />
                                </button>
                            )}
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
                                    className={`p-3 rounded-full transition-all hover:scale-110 shadow-lg ${darkMode ? 'bg-[#C9EA63] text-[#141f0b]' : 'bg-[#008a5e] text-white'}`}
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
                            Selecciona una conversación del panel izquierdo para comenzar a gestionar tus chats. El sistema de asignación evita que dos personas respondan al mismo cliente.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Conversaciones;
