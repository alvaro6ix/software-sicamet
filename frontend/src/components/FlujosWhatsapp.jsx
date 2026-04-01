import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { 
  Bot, MessageSquare, BookOpen, HelpCircle, Settings, RefreshCw, Send, CheckCircle, Bell, 
  Trash2, Plus, Download, ChevronRight, X, User, Phone, Calendar, Building, TrendingUp, Package, 
  Clock, AlertCircle, PlayCircle, Smartphone, Edit2, Zap, Search, Award, Info, Save
} from 'lucide-react';
import io from 'socket.io-client';

const API = '';

// Menú principal simulado con iconos modernos
const OPCIONES_MENU = [
  { id: '1', label: 'Solicitar cotización', icon: TrendingUp, color: 'blue' },
  { id: '2', label: 'Consultar estatus de equipo', icon: Search, color: 'emerald' },
  { id: '3', label: 'Mis equipos y recordatorios', icon: Calendar, color: 'purple' },
  { id: '4', label: 'Servicios y acreditaciones', icon: Award, color: 'amber' },
  { id: '5', label: 'Contacto y ubicaciones', icon: Building, color: 'slate' },
  { id: '6', label: 'Hablar con un asesor', icon: User, color: 'rose' },
];

const MENSAJES_INICIALES = []; // Se cargarán del simulador real

const FlujosWhatsapp = ({ darkMode, usuario }) => {
  const [pestana, setPestana] = useState('simulador');
  const [loadingAccion, setLoadingAccion] = useState(false);
  const [mensajes, setMensajes] = useState(MENSAJES_INICIALES);
  const [inputMsg, setInputMsg] = useState('');
  const [cargandoBot, setCargandoBot] = useState(false);
  const [statusBot, setStatusBot] = useState({ connected: false });
  const [stats, setStats] = useState({});
  const [cotizaciones, setCotizaciones] = useState([]);
  const [escalados, setEscalados] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [cacheIA, setCacheIA] = useState([]);
  const [botNodos, setBotNodos] = useState([]);
  const [mensajeBienvenida, setMensajeBienvenida] = useState('');
  const [editandoBienvenida, setEditandoBienvenida] = useState(false);
  const [editandoBienvenidaTexto, setEditandoBienvenidaTexto] = useState('');
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [editandoNodo, setEditandoNodo] = useState(null);
  const [waSimulado, setWaSimulado] = useState(`sim_${Math.floor(Math.random() * 10000)}`);
  const [botFaq, setBotFaq] = useState([]);
  const [faqForm, setFaqForm] = useState({ pregunta: '', respuesta: '', id: null });
  const [botConfig, setBotConfig] = useState({});
  const [configForm, setConfigForm] = useState({});
  const chatRef = useRef(null);
  const fileInputRef = useRef(null);
  const [selectedCotizacion, setSelectedCotizacion] = useState(null);
  const esAdmin = usuario?.rol === 'admin';

  // Colores por tema
  const box = darkMode ? 'bg-[#253916] border-[#C9EA63]/20' : 'bg-white border-gray-100 shadow-lg';
  const textPrimary = darkMode ? 'text-[#F2F6F0]' : 'text-slate-800';
  const textMuted = darkMode ? 'text-[#F2F6F0]/60' : 'text-slate-500';
  const inputCls = darkMode ? 'bg-[#141f0b] border-[#C9EA63]/30 text-[#F2F6F0] placeholder-[#F2F6F0]/40' : 'bg-slate-50 border-gray-200 text-slate-800';

  useEffect(() => {
    fetchStatusBot();
    fetchStats();
    const interval = setInterval(fetchStatusBot, 8000);
    
    // Configurar Socket para actualizaciones en tiempo real
    const socket = io('');
    socket.on('nueva_cotizacion', () => {
      fetchStats();
      if (pestana === 'cotizaciones') fetchCotizaciones();
    });
    socket.on('actualizacion_cotizacion', () => {
      fetchStats();
      if (pestana === 'cotizaciones') fetchCotizaciones();
    });

    return () => {
      clearInterval(interval);
      socket.disconnect();
    };
  }, [pestana]);

  useEffect(() => {
    if (pestana === 'cotizaciones') fetchCotizaciones();
    if (pestana === 'escalados') fetchEscalados();
    if (pestana === 'equipos') fetchEquipos();
    if (pestana === 'cache') fetchCache();
    if (pestana === 'mensajes') fetchBotNodos();
    if (pestana === 'faq') fetchBotFaq();
    if (pestana === 'config') fetchBotConfig();
    if (pestana === 'simulador' && mensajes.length === 0) resetChat();
  }, [pestana]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [mensajes]);

  const fetchStatusBot = async () => {
    try { const { data } = await axios.get(`${API}/api/whatsapp/status`); setStatusBot(data); } catch {}
  };
  const fetchStats = async () => {
    try { const { data } = await axios.get(`${API}/api/bot/stats`); setStats(data); } catch {}
  };
  const fetchCotizaciones = async () => {
    try { const { data } = await axios.get(`${API}/api/cotizaciones-bot`); setCotizaciones(data); } catch {}
  };
  const fetchBotNodos = async () => {
    try {
      const token = localStorage.getItem('token');
      const { data } = await axios.get(`${API}/api/bot/nodo-raiz`, { headers: { Authorization: `Bearer ${token}` } });
      setMensajeBienvenida(data.mensaje_bienvenida);
      setBotNodos(data.nodos || []);
    } catch (err) { console.error('Error fetching nodos:', err); }
  };
  const fetchBotFaq = async () => {
    try { const { data } = await axios.get(`${API}/api/bot/faq`); setBotFaq(data); } catch {}
  };
  const fetchBotConfig = async () => {
    try {
      const { data } = await axios.get(`${API}/api/bot/config`);
      if (!data) return;
      setBotConfig(data);
      const form = {};
      Object.entries(data).forEach(([k, v]) => { if (v) form[k] = v.valor; });
      setConfigForm(form);
    } catch (err) { console.error('Error fetching config:', err); }
  };
  const guardarNodoRaiz = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API}/api/bot/nodo-raiz`, { mensaje_bienvenida: editandoBienvenidaTexto }, { headers: { Authorization: `Bearer ${token}` } });
      setMensajeBienvenida(editandoBienvenidaTexto);
      setEditandoBienvenida(false);
      alert('Mensaje de bienvenida guardado');
    } catch { alert('Error al guardar mensaje'); }
  };

  const guardarNodo = async (nodo) => {
    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      if (nodo.id !== undefined && nodo.id !== null && !nodo.isNew) {
        await axios.put(`${API}/api/bot/nodos/${nodo.id}`, nodo, config);
      } else {
        const { id, isNew, ...payload } = nodo;
        await axios.post(`${API}/api/bot/nodos`, payload, config);
      }
      setEditandoNodo(null);
      fetchBotNodos();
      alert('Nodo guardado correctamente');
    } catch { alert('Error al guardar el nodo'); }
  };

  const handleUploadMedia = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingMedia(true);
    const formData = new FormData();
    formData.append('archivo', file);
    try {
      const token = localStorage.getItem('token');
      const { data } = await axios.post(`${API}/api/bot/upload-media`, formData, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
      });
      if (data.success && data.url) {
        setEditandoNodo(prev => ({ ...prev, media_url: data.url }));
        alert('Archivo subido y enlazado correctamente');
      }
    } catch (err) { alert('Hooray! Error al subir archivo: ' + err.message); }
    setUploadingMedia(false);
  };

  const eliminarNodo = async (id) => {
    if (id === 0) return alert('No puedes eliminar el menú principal');
    if (!confirm('¿Eliminar este paso del flujo? Esto borrará sus opciones asociadas.')) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API}/api/bot/nodos/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      fetchBotNodos();
    } catch { alert('Error al eliminar'); }
  };

  const guardarOpciones = async (nodoId, opciones) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/api/bot/nodos/${nodoId}/opciones`, { opciones }, { headers: { Authorization: `Bearer ${token}` } });
      fetchBotNodos();
      alert('Ramificaciones actualizadas');
    } catch { alert('Error al guardar opciones'); }
  };
  const guardarFaq = async () => {
    try {
      if (faqForm.id) {
        await axios.put(`${API}/api/bot/faq/${faqForm.id}`, faqForm);
      } else {
        await axios.post(`${API}/api/bot/faq`, faqForm);
      }
      setFaqForm({ pregunta: '', respuesta: '', id: null });
      fetchBotFaq();
      alert('FAQ guardado correctamente');
    } catch { alert('Error al guardar FAQ'); }
  };
  const eliminarFaq = async (id) => {
    if (!window.confirm && !confirm('¿Eliminar esta respuesta?')) return;
    try { await axios.delete(`${API}/api/bot/faq/${id}`); fetchBotFaq(); } catch {}
  };
  const guardarConfig = async () => {
    try {
      await axios.put(`${API}/api/bot/config`, configForm);
      fetchBotConfig();
      alert('Configuración guardada');
    } catch { alert('Error al guardar configuración'); }
  };
  const fetchEscalados = async () => {
    try { const { data } = await axios.get(`${API}/api/escalados`); setEscalados(data); } catch {}
  };
  const fetchEquipos = async () => {
    try { const { data } = await axios.get(`${API}/api/equipos-cliente`); setEquipos(data); } catch {}
  };
  const eliminarCotizacion = async (id) => {
    if (!confirm('¿Seguro que deseas eliminar esta cotización?')) return;
    try {
      await axios.delete(`${API}/api/cotizaciones-bot/${id}`);
      fetchCotizaciones();
    } catch { alert('Error al eliminar'); }
  };
  const eliminarEscalado = async (id) => {
    if (!confirm('¿Seguro que deseas eliminar este registro de escalado?')) return;
    try {
      await axios.delete(`${API}/api/escalados/${id}`);
      fetchEscalados();
    } catch { alert('Error al eliminar'); }
  };
  const fetchCache = async () => {
    try { const { data } = await axios.get(`${API}/api/bot/cache`); setCacheIA(data); } catch {}
  };

  // Detecta si el texto del bot contiene un menú con opciones numeradas
  const esTextoMenu = (text) => text && (/\*\d+[️⃣]*\*|\d+\)/.test(text) && text.includes('\n'));

  // Extrae opciones numeradas del texto del bot para mostrar como botones
  const extraerBotones = (text) => {
    if (!text) return [];
    const lines = text.split('\n').filter(l => /^\*?\d+[️⃣]*\*?[.)\s]/.test(l.trim()));
    return lines.slice(0, 8).map((l, i) => ({
      id: String(i + 1),
      label: l.replace(/^\*?\d+[️⃣]*\*?[.)\s]+/, '').trim()
    })).filter(b => b.label.length > 0);
  };

  // Simulador de chat — conectado al mismo motor del bot real
  const enviarMensaje = async (texto) => {
    if (!texto.trim() || cargandoBot) return;
    const userMsg = texto.trim();
    setInputMsg('');
    setMensajes(prev => [...prev, { tipo: 'user', text: userMsg }]);
    setCargandoBot(true);

    try {
      const token = localStorage.getItem('token');
      const { data } = await axios.post(`${API}/api/bot/chat`,
        { wa: waSimulado, texto: userMsg },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setTimeout(() => {
        const botResp = data.respuesta;
        if (botResp && botResp.text) {
          const botones = extraerBotones(botResp.text);
          setMensajes(prev => [...prev, {
            tipo: 'bot',
            text: botResp.text,
            mediaUrl: botResp.mediaUrl,
            mediaTipo: botResp.mediaTipo,
            botones: botones.length > 0 ? botones : null
          }]);
        }
        setCargandoBot(false);
      }, 700);
    } catch (err) {
      console.error('Error en simulador:', err);
      setCargandoBot(false);
      setMensajes(prev => [...prev, { tipo: 'bot', text: 'Error al conectar con el backend. Verifica que el servidor esté corriendo.' }]);
    }
  };

  const resetChat = () => {
    const nuevoWa = `sim_${Date.now()}`;
    setMensajes([]);
    setWaSimulado(nuevoWa);
    // Enviar 'hola' → el backend mostrará el menú dinámico
    setTimeout(() => {
      setMensajes([]);
      setCargandoBot(true);
      const token = localStorage.getItem('token');
      axios.post(`${API}/api/bot/chat`,
        { wa: nuevoWa, texto: 'hola' },
        { headers: { Authorization: `Bearer ${token}` } }
      ).then(({ data }) => {
        const botResp = data.respuesta;
        if (botResp && botResp.text) {
          const botones = extraerBotones(botResp.text);
          setMensajes([{
            tipo: 'bot',
            text: botResp.text,
            botones: botones.length > 0 ? botones : null
          }]);
        }
        setCargandoBot(false);
      }).catch(() => setCargandoBot(false));
    }, 300);
  };

  const clickBoton = (id) => enviarMensaje(id);

  const resolverEscalado = async (id) => {
    try {
      await axios.put(`${API}/api/escalados/${id}/resolver`, { agente: 'CRM Operador' });
      fetchEscalados();
    } catch {}
  };

  const ejecutarRecordatorios = async () => {
    try {
      const { data } = await axios.post(`${API}/api/bot/ejecutar-recordatorios`);
      alert(`Recordatorios ejecutados: ${data.enviados} enviados, ${data.omitidos} omitidos`);
    } catch (e) { alert('Error al ejecutar recordatorios: ' + e.message); }
  };

  const limpiarCache = async () => {
    try {
      await axios.delete(`${API}/api/bot/cache`);
      fetchCache();
      alert('Caché expirado eliminado');
    } catch {}
  };



  const TABS = [
    { id: 'simulador', label: '💬 Simulador', icon: Smartphone },
    { id: 'cotizaciones', label: '📋 Cotizaciones Bot', icon: TrendingUp },
    { id: 'escalados', label: '🧑‍💼 Escalados', icon: AlertCircle },
    { id: 'equipos', label: '📅 Equipos', icon: Package },
    { id: 'cache', label: '🧠 Caché IA', icon: Zap },
    ...(esAdmin ? [
      { id: 'mensajes', label: '🌳 Gestor de Flujos', icon: Edit2 },
      { id: 'faq', label: '❓ FAQ / Respuestas', icon: MessageSquare },
      { id: 'config', label: '⚙️ Configuración', icon: RefreshCw },
    ] : []),
  ];

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-6 border-[#C9EA63]/20">
        <div>
          <h2 className={`text-3xl font-bold flex items-center gap-3 ${textPrimary}`}>
            <Bot className={darkMode ? 'text-[#C9EA63]' : 'text-emerald-600'} size={32} />
            Bot PRO SICAMET
          </h2>
          <p className={`mt-1 text-sm ${textMuted}`}>Motor inteligente de conversación · IA · Cotizaciones · Recordatorios</p>
        </div>
        <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold ${statusBot.connected ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
          <span className={`w-2 h-2 rounded-full ${statusBot.connected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
          {statusBot.connected ? 'Bot Activo' : 'Bot Inactivo'}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
        <div 
          onClick={() => setPestana('cotizaciones')}
          className={`p-6 rounded-3xl border transition-all duration-500 overflow-hidden relative group cursor-pointer hover:shadow-lg ${
            stats.pendientesCotizacion > 0 
              ? (darkMode ? 'bg-rose-500/10 border-rose-500/40 hover:bg-rose-500/20' : 'bg-rose-50 border-rose-200 hover:bg-rose-100' )
              : (darkMode ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-white border-gray-100 shadow-sm hover:border-emerald-200')
          }`}
        >
          {stats.pendientesCotizacion > 0 && (
            <div className="absolute top-0 right-0 p-3">
              <span className="flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
              </span>
            </div>
          )}
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${stats.pendientesCotizacion > 0 ? 'bg-rose-500 text-white animate-bounce shadow-lg shadow-rose-500/20' : (darkMode ? 'bg-white/5 text-white/50' : 'bg-slate-100 text-slate-500')}`}>
              <TrendingUp size={18} />
            </div>
            <div>
              <p className={`text-sm font-medium ${textMuted}`}>Cotizaciones hoy</p>
              <h4 className={`text-xl font-black ${stats.pendientesCotizacion > 0 && !darkMode ? 'text-rose-600' : textPrimary}`}>
                {stats.cotizacionesHoy || 0}
              </h4>
              {stats.pendientesCotizacion > 0 && (
                <p className="text-[10px] font-bold text-rose-500 uppercase tracking-tighter mt-1 animate-pulse">
                   {stats.pendientesCotizacion} pendientes por atender
                </p>
              )}
            </div>
          </div>
        </div>
        {[
          { label: 'Escalados pendientes', value: stats.escaladosPendientes ?? '—', icon: <User size={20}/>, alert: stats.escaladosPendientes > 0, tab: 'escalados' },
          { label: 'Equipos registrados', value: stats.equiposRegistrados ?? '—', icon: <Package size={20}/>, tab: 'equipos' },
          { label: 'Vencen en 30d', value: stats.proximosVencer30d ?? '—', icon: <Clock size={20}/>, alert: stats.proximosVencer30d > 0, tab: 'equipos' },
          { label: 'Cache hits IA', value: stats.cacheHitsTotal ?? '—', icon: <Zap size={20}/>, tab: 'cache' },
        ].map((kpi, i) => (
          <div 
            key={i} 
            onClick={() => kpi.tab && setPestana(kpi.tab)}
            className={`rounded-xl border p-4 transition-all ${kpi.tab ? 'cursor-pointer hover:shadow-md hover:border-emerald-300' : ''} ${box} ${kpi.alert ? (darkMode ? 'border-amber-500/50' : 'border-amber-300 bg-amber-50 shadow-sm') : ''}`}
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${darkMode ? 'bg-white/5 text-white/50' : 'bg-slate-100 text-slate-500'}`}>
               {kpi.icon}
            </div>
            <p className={`text-2xl font-bold mt-1 ${textPrimary} ${kpi.alert ? 'text-amber-600' : ''}`}>{kpi.value}</p>
            <p className={`text-xs mt-1 ${textMuted}`}>{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 flex-wrap overflow-x-auto pb-2">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setPestana(tab.id)}
            className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap ${pestana === tab.id
              ? (darkMode ? 'bg-[#C9EA63] text-[#141f0b] shadow-lg shadow-[#C9EA63]/20' : 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20')
              : (darkMode ? 'bg-[#141f0b] text-[#F2F6F0]/50 hover:bg-[#C9EA63]/10 border border-white/5' : 'bg-slate-100 text-slate-500 hover:bg-slate-200')}`}>
            {tab.icon && <tab.icon size={16} />}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── SIMULADOR ────────────────────────────────────────────────── */}
      {pestana === 'simulador' && (
        <div className={`rounded-2xl border ${box} overflow-hidden`}>
          {/* Barra del teléfono */}
          <div className={`px-5 py-3 flex items-center justify-between ${darkMode ? 'bg-[#1a2e10]' : 'bg-emerald-600'}`}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-sm">S</div>
              <div>
                <p className="text-white font-bold text-sm">SICAMET Bot</p>
                <p className="text-white/70 text-xs">Simulador · Modo Preview</p>
              </div>
            </div>
            <button onClick={resetChat} className="text-white/70 hover:text-white transition-colors" title="Reiniciar chat">
              <RefreshCw size={16} />
            </button>
          </div>

          {/* Área de chat */}
          <div ref={chatRef} className={`h-[400px] md:h-[500px] overflow-y-auto p-4 space-y-3 ${darkMode ? 'bg-[#1a2e10]/50' : 'bg-slate-50'}`}>
            {mensajes.map((msg, i) => (
              <div key={i} className={`flex ${msg.tipo === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] space-y-2`}>
                  {/* Burbuja de mensaje */}
                  <div className={`px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed ${
                    msg.tipo === 'user'
                      ? (darkMode ? 'bg-[#C9EA63] text-[#141f0b]' : 'bg-emerald-600 text-white') + ' rounded-br-sm shadow-sm'
                      : (darkMode ? 'bg-[#253916] text-[#F2F6F0]' : 'bg-white text-slate-800 border border-gray-100 shadow-sm') + ' rounded-bl-sm'
                  }`}>
                    {(msg.text || '')
                      .replace(/\*([^*]+)\*/g, '$1')
                      .replace(/_([^_]+)_/g, '$1')}
                  </div>

                  {/* Botones dinámicos extraídos de la respuesta del bot */}
                  {msg.tipo === 'bot' && msg.botones && msg.botones.length > 0 && (
                    <div className="grid grid-cols-1 gap-1.5 mt-1">
                      {msg.botones.map(op => (
                        <button key={op.id} onClick={() => clickBoton(op.id)}
                          className={`text-left text-xs px-3 py-2.5 rounded-xl font-semibold transition-all border flex items-center gap-2
                            ${darkMode
                              ? 'bg-[#1a2e10] border-[#C9EA63]/20 text-[#F2F6F0] hover:bg-[#253916] hover:border-[#C9EA63]/40'
                              : 'bg-slate-50 border-gray-200 text-slate-700 hover:bg-white hover:border-emerald-300 hover:shadow-sm'}`}>
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0
                            ${darkMode ? 'bg-[#C9EA63]/20 text-[#C9EA63]' : 'bg-emerald-100 text-emerald-600'}`}>
                            {op.id}
                          </span>
                          {op.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Adjuntos */}
                  {msg.mediaUrl && (
                    <div className="mt-2 rounded-lg overflow-hidden border border-white/10">
                      {msg.mediaTipo === 'image' ? (
                        <img src={msg.mediaUrl} alt="Adjunto" className="max-w-full h-auto" />
                      ) : (
                        <div className={`p-3 text-xs flex items-center gap-2 ${darkMode ? 'bg-white/5' : 'bg-slate-100'}`}>
                          <Package size={14} className={textMuted} /> 
                          <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer" className={`font-bold hover:underline ${darkMode ? 'text-[#C9EA63]' : 'text-emerald-600'}`}>
                            Archivo adjunto: {msg.mediaUrl.split('/').pop()}
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {cargandoBot && (
              <div className="flex justify-start">
                <div className={`px-4 py-3 rounded-2xl rounded-bl-sm ${darkMode ? 'bg-[#253916]' : 'bg-white border border-gray-100'}`}>
                  <div className="flex gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={(e) => { e.preventDefault(); enviarMensaje(inputMsg); }}
            className={`flex gap-2 p-3 border-t ${darkMode ? 'border-[#C9EA63]/10 bg-[#141f0b]' : 'border-gray-100 bg-white'}`}>
            <input value={inputMsg} onChange={e => setInputMsg(e.target.value)}
              placeholder="Escribe un mensaje o presiona un botón arriba..."
              className={`flex-1 px-4 py-2 rounded-xl border text-sm outline-none ${inputCls}`} />
            <button type="submit" className={`p-2.5 rounded-xl transition-all ${darkMode ? 'bg-[#C9EA63] text-[#141f0b] hover:bg-[#b0d14b]' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}>
              <Send size={16} />
            </button>
          </form>
            <div className={`flex items-center justify-center gap-2 py-2 ${textMuted}`}>
              <AlertCircle size={12} />
              <span className="text-[10px]">Simulador de preview · Los flujos reales con IA están activos en el bot de WhatsApp</span>
            </div>
        </div>
      )}

      {/* ── COTIZACIONES BOT ────────────────────────────────────────── */}
      {pestana === 'cotizaciones' && (
        <div className={`rounded-2xl border ${box} overflow-hidden`}>
          <div className="p-4 border-b border-[#C9EA63]/10 flex justify-between items-center">
            <h3 className={`font-bold ${textPrimary}`}>Pre-cotizaciones generadas por el bot</h3>
            <button onClick={fetchCotizaciones} className={`p-2 rounded-lg ${darkMode ? 'hover:bg-[#314a1c]' : 'hover:bg-slate-100'}`}><RefreshCw size={14} /></button>
          </div>
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full text-sm">
              <thead className={darkMode ? 'bg-[#141f0b]' : 'bg-slate-50'}>
                <tr>{['WhatsApp', 'Empresa', 'Equipos', 'Entrega', 'Estatus', 'Fecha', 'Acción'].map(h => (
                  <th key={h} className={`px-4 py-3 text-left font-semibold ${textMuted}`}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {cotizaciones.length === 0 ? (
                  <tr><td colSpan={7} className={`text-center py-10 ${textMuted}`}>No hay cotizaciones aún</td></tr>
                ) : cotizaciones.map(c => (
                  <tr key={c.id} className={`border-t ${darkMode ? 'border-[#C9EA63]/10' : 'border-gray-100'}`}>
                    <td className={`px-4 py-3 ${textPrimary} font-mono text-xs`}>{c.cliente_whatsapp_display || c.cliente_whatsapp?.replace('@c.us','')}</td>
                    <td className={`px-4 py-3 ${textPrimary}`}>{c.nombre_empresa || '—'}</td>
                    <td className={`px-4 py-3 ${textPrimary}`}>
                      <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${darkMode ? 'bg-[#C9EA63]/10 text-[#C9EA63]' : 'bg-emerald-50 text-emerald-700'}`}>
                        {c.cantidad} equipo(s)
                      </span>
                    </td>
                    <td className={`px-4 py-3 ${textMuted} text-xs`}>{c.tiempo_entrega || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase transition-colors ${
                        c.estatus === 'nueva' ? 'bg-rose-100 text-rose-700 animate-pulse' : 
                        c.estatus === 'en-proceso' ? 'bg-amber-100 text-amber-700' : 
                        'bg-emerald-100 text-emerald-700'
                      }`}>{c.estatus || 'nueva'}</span>
                    </td>
                    <td className={`px-4 py-3 ${textMuted} text-xs`}>{new Date(c.created_at).toLocaleDateString('es-MX')}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button 
                          onClick={() => setSelectedCotizacion(c)}
                          className={`p-2 rounded-lg transition-colors ${darkMode ? 'bg-[#C9EA63]/10 text-[#C9EA63] hover:bg-[#C9EA63]/20' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}
                          title="Ver detalles técnicos"
                        >
                          <ChevronRight size={18} />
                        </button>
                        <button 
                          onClick={() => eliminarCotizacion(c.id)}
                          className={`p-2 rounded-lg transition-colors ${darkMode ? 'bg-rose-500/10 text-rose-500 hover:bg-rose-500/20' : 'bg-rose-50 text-rose-600 hover:bg-rose-100'}`}
                          title="Eliminar"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── ESCALADOS ───────────────────────────────────────────────── */}
      {pestana === 'escalados' && (
        <div className={`rounded-2xl border ${box} overflow-hidden`}>
          <div className="p-4 border-b border-[#C9EA63]/10 flex justify-between items-center">
            <h3 className={`font-bold ${textPrimary}`}>Conversaciones escaladas a agente humano</h3>
            <button onClick={fetchEscalados} className={`p-2 rounded-lg ${darkMode ? 'hover:bg-[#314a1c]' : 'hover:bg-slate-100'}`}><RefreshCw size={14} /></button>
          </div>
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full text-sm">
              <thead className={darkMode ? 'bg-[#141f0b]' : 'bg-slate-50'}>
                <tr>{['WhatsApp', 'Motivo', 'Estatus', 'Fecha', 'Acción'].map(h => (
                  <th key={h} className={`px-4 py-3 text-left font-semibold ${textMuted}`}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {escalados.length === 0 ? (
                  <tr>
                    <td colSpan={5} className={`text-center py-10 ${textMuted}`}>
                      <div className="flex flex-col items-center gap-2 opacity-50">
                        <CheckCircle size={32} />
                        <p className="font-bold">No hay escalados pendientes</p>
                      </div>
                    </td>
                  </tr>
                ) : escalados.map(e => (
                  <tr key={e.id} className={`border-t ${darkMode ? 'border-[#C9EA63]/10' : 'border-gray-100'}`}>
                    <td className={`px-4 py-3 ${textPrimary} font-mono text-xs`}>{e.cliente_whatsapp_display || e.cliente_whatsapp?.replace('@c.us','')}</td>
                    <td className={`px-4 py-3 ${textMuted} max-w-[200px] truncate`}>{e.motivo}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${e.estatus === 'pendiente' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{e.estatus}</span>
                    </td>
                    <td className={`px-4 py-3 ${textMuted} text-xs`}>{new Date(e.created_at).toLocaleDateString('es-MX')}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 items-center">
                        {e.estatus === 'pendiente' && (
                          <button onClick={() => resolverEscalado(e.id)}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold ${darkMode ? 'bg-[#C9EA63] text-[#141f0b]' : 'bg-emerald-600 text-white'} hover:opacity-80 flex items-center gap-1`}>
                            <CheckCircle size={12} /> Resolver
                          </button>
                        )}
                        <button onClick={() => eliminarEscalado(e.id)}
                          className={`p-2 rounded-lg transition-colors ${darkMode ? 'bg-rose-500/10 text-rose-500 hover:bg-rose-500/20' : 'bg-rose-50 text-rose-600 hover:bg-rose-100'}`}
                          title="Eliminar registro">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── EQUIPOS ─────────────────────────────────────────────────── */}
      {pestana === 'equipos' && (
        <div className={`rounded-2xl border ${box} overflow-hidden`}>
          <div className="p-4 border-b border-[#C9EA63]/10 flex justify-between items-center">
            <h3 className={`font-bold ${textPrimary}`}>Equipos registrados para recordatorios</h3>
            <button onClick={ejecutarRecordatorios}
              className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 ${darkMode ? 'bg-[#C9EA63] text-[#141f0b]' : 'bg-amber-500 text-white'} hover:opacity-80`}>
              <Bell size={14} /> Ejecutar recordatorios ahora
            </button>
          </div>
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full text-sm">
              <thead className={darkMode ? 'bg-[#141f0b]' : 'bg-slate-50'}>
                <tr>{['Empresa', 'Equipo', 'Marca', 'Última Calibración', 'Próxima', 'WhatsApp'].map(h => (
                  <th key={h} className={`px-4 py-3 text-left font-semibold ${textMuted}`}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {equipos.length === 0 ? (
                  <tr><td colSpan={6} className={`text-center py-10 ${textMuted}`}>Los clientes registrarán sus equipos desde el bot</td></tr>
                ) : equipos.map(eq => {
                  const prox = eq.proxima_calibracion ? new Date(eq.proxima_calibracion) : null;
                  const diasRestantes = prox ? Math.ceil((prox - new Date()) / 86400000) : null;
                  const urgente = diasRestantes !== null && diasRestantes <= 30;
                  return (
                    <tr key={eq.id} className={`border-t ${darkMode ? 'border-[#C9EA63]/10' : 'border-gray-100'}`}>
                      <td className={`px-4 py-3 ${textPrimary} font-semibold`}>{eq.nombre_empresa || '—'}</td>
                      <td className={`px-4 py-3 ${textPrimary}`}>{eq.nombre_equipo}</td>
                      <td className={`px-4 py-3 ${textMuted}`}>{eq.marca || '—'}</td>
                      <td className={`px-4 py-3 ${textMuted} text-xs`}>{eq.ultima_calibracion ? new Date(eq.ultima_calibracion).toLocaleDateString('es-MX') : '—'}</td>
                      <td className="px-4 py-3">
                        {prox ? (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${urgente ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'} flex items-center gap-1`}>
                            {urgente ? <Clock size={10} /> : <CheckCircle size={10} />}
                            {prox.toLocaleDateString('es-MX')} {diasRestantes !== null ? `(${diasRestantes}d)` : ''}
                          </span>
                        ) : '—'}
                      </td>
                      <td className={`px-4 py-3 ${textMuted} font-mono text-xs`}>{eq.cliente_whatsapp_display || eq.cliente_whatsapp?.replace('@c.us','')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── CACHÉ IA ────────────────────────────────────────────────── */}
      {pestana === 'cache' && (
        <div className={`rounded-2xl border ${box} overflow-hidden`}>
          <div className="p-4 border-b border-[#C9EA63]/10 flex justify-between items-center">
            <div>
              <h3 className={`font-bold ${textPrimary}`}>🧠 Caché de Respuestas IA</h3>
              <p className={`text-xs mt-0.5 ${textMuted}`}>Las respuestas se cachean 7 días para optimizar costos de la API de Gemini</p>
            </div>
            <div className="flex gap-2">
              <button onClick={fetchCache} className={`p-2 rounded-lg ${darkMode ? 'hover:bg-[#314a1c]' : 'hover:bg-slate-100'}`}><RefreshCw size={14} /></button>
              <button onClick={limpiarCache} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${darkMode ? 'bg-rose-900 text-rose-300' : 'bg-rose-100 text-rose-600'} hover:opacity-80`}>Limpiar caché expirado</button>
            </div>
          </div>
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full text-sm">
              <thead className={darkMode ? 'bg-[#141f0b]' : 'bg-slate-50'}>
                <tr>{['Pregunta', 'Hits', 'Expira', 'Creado'].map(h => (
                  <th key={h} className={`px-4 py-3 text-left font-semibold ${textMuted}`}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {cacheIA.length === 0 ? (
                  <tr><td colSpan={4} className={`text-center py-10 ${textMuted}`}>El caché se llenará conforme el bot responda preguntas IA</td></tr>
                ) : cacheIA.map(c => (
                  <tr key={c.id} className={`border-t ${darkMode ? 'border-[#C9EA63]/10' : 'border-gray-100'}`}>
                    <td className={`px-4 py-3 ${textPrimary} max-w-[300px] truncate`} title={c.pregunta_texto}>{c.pregunta_texto?.substring(0,80)}...</td>
                    <td className={`px-4 py-3 ${darkMode ? 'text-[#C9EA63]' : 'text-emerald-600'} font-bold`}>{c.hits}x</td>
                    <td className={`px-4 py-3 ${textMuted} text-xs`}>{new Date(c.expires_at).toLocaleDateString('es-MX')}</td>
                    <td className={`px-4 py-3 ${textMuted} text-xs`}>{new Date(c.created_at).toLocaleDateString('es-MX')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── MENSAJES DEL BOT (SOLO ADMIN) ────────────────────────────── */}
      {pestana === 'mensajes' && esAdmin && (
        <div className="space-y-6">
          <div className={`${box} rounded-2xl p-6`}>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                  <h3 className={`text-xl font-bold flex items-center gap-2 ${textPrimary}`}>
                    <Bot className={darkMode ? 'text-[#C9EA63]' : 'text-emerald-600'} size={24} /> 
                    Constructor de Flujos Dinámicos
                  </h3>
                  <p className={`text-sm mt-1 ${textMuted}`}>Define los pasos de la conversación y la inteligencia del bot.</p>
                </div>
                <button 
                  onClick={() => setEditandoNodo({ isNew: true, nombre: 'Nuevo Paso', mensaje: '', tipo: 'mensaje', orden: botNodos.length + 1, opciones: [] })}
                  className={`w-full sm:w-auto px-4 py-2 rounded-xl text-sm font-bold flex items-center justify-center gap-2 ${darkMode ? 'bg-[#C9EA63] text-[#141f0b] hover:bg-[#b0cc5a]' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
                >
                  <Plus size={18} /> Añadir Paso
                </button>
              </div>

            <div className="grid gap-4">
              {/* NODO RAIZ EDITABLE */}
              <div className={`p-5 rounded-2xl border ${darkMode ? 'border-amber-500/20 bg-amber-500/5' : 'border-amber-200 bg-amber-50'}`}>
                <div className="flex justify-between items-start">
                  <div className="flex gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg ${darkMode ? 'bg-amber-500 text-[#141F0B]' : 'bg-amber-500 text-white'}`}>
                      0
                    </div>
                    <div>
                      <h4 className={`font-bold ${textPrimary}`}>Menú Principal (Bienvenida)</h4>
                      <div className="flex gap-2 mt-1">
                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-500 text-amber-900 border border-amber-400">PUNTO DE ENTRADA</span>
                      </div>
                    </div>
                  </div>
                  {!editandoBienvenida && (
                    <button onClick={() => { setEditandoBienvenida(true); setEditandoBienvenidaTexto(mensajeBienvenida); }} className="p-2 rounded-lg hover:bg-amber-500/10 text-amber-500 text-sm font-bold flex items-center gap-2">
                       <Edit2 size={16} /> Editar Mensaje
                    </button>
                  )}
                </div>

                {editandoBienvenida ? (
                  <div className="mt-4">
                    <textarea 
                      rows={4} 
                      value={editandoBienvenidaTexto} 
                      onChange={e => setEditandoBienvenidaTexto(e.target.value)} 
                      className={`w-full p-3 rounded-xl border text-sm focus:ring-2 focus:ring-amber-500 outline-none ${inputCls}`} 
                      placeholder="Ej: Hola! Bienvenido a SICAMET..."
                    />
                    <div className="flex justify-end gap-2 mt-2">
                      <button onClick={() => setEditandoBienvenida(false)} className={`px-4 py-1.5 rounded-lg text-sm font-bold ${textMuted}`}>Cancelar</button>
                      <button onClick={guardarNodoRaiz} className={`px-4 py-1.5 rounded-lg text-sm font-bold ${darkMode ? 'bg-[#C9EA63] text-[#141f0b]' : 'bg-emerald-600 text-white'}`}>Guardar</button>
                    </div>
                  </div>
                ) : (
                  <p className={`mt-3 text-sm whitespace-pre-wrap leading-relaxed ${textMuted}`}>
                    {mensajeBienvenida || '👋 ¡Hola! Soy el asistente virtual de *SICAMET*.'}
                  </p>
                )}
                
                <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-amber-500/20">
                  <span className={`text-[11px] font-bold ${textMuted}`}>Nodos activos en el menú principal:</span>
                  {botNodos.map((n, i) => (
                    <span key={n.id} className={`px-2 py-1 rounded-lg text-[10px] uppercase font-bold flex items-center gap-1.5 ${darkMode ? 'bg-[#C9EA63]/10 text-[#C9EA63]' : 'bg-gray-100 text-gray-600'}`}>
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] ${darkMode ? 'bg-[#C9EA63] text-[#141F0B]' : 'bg-gray-400 text-white'}`}>{i + 1}</div>
                      {n.nombre}
                    </span>
                  ))}
                </div>
              </div>

              {/* LISTA DE NODOS (1-N) */}
              {botNodos.map((nodo, idx) => (
                <div key={nodo.id} className={`p-5 rounded-2xl border transition-all ${editandoNodo?.id === nodo.id ? (darkMode ? 'border-[#C9EA63] bg-[#C9EA63]/5' : 'border-emerald-500 bg-emerald-50') : (darkMode ? 'border-white/5 bg-white/5' : 'border-gray-100 bg-white shadow-sm')}`}>
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="flex gap-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg shrink-0 ${darkMode ? 'bg-[#C9EA63]/20 text-[#C9EA63]' : 'bg-emerald-100 text-emerald-600'}`}>
                        {nodo.id}
                      </div>
                      <div>
                        <h4 className={`font-bold ${textPrimary}`}>{nodo.nombre}</h4>
                        <div className="flex flex-wrap gap-2 mt-1">
                          <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${darkMode ? 'bg-white/10 text-white/60' : 'bg-gray-100 text-gray-500'}`}>{nodo.tipo}</span>
                          {nodo.accion && <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-500">Acción: {nodo.accion}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1 w-full sm:w-auto justify-end">
                      <button onClick={() => setEditandoNodo({...nodo})} className={`p-2 rounded-lg hover:bg-emerald-500/10 text-emerald-500`}><Edit2 size={16} /></button>
                      {nodo.id !== 0 && <button onClick={() => eliminarNodo(nodo.id)} className={`p-2 rounded-lg hover:bg-rose-500/10 text-rose-500`}><Trash2 size={16} /></button>}
                    </div>
                  </div>

                  <p className={`mt-3 text-sm line-clamp-2 ${textMuted}`}>{nodo.mensaje}</p>
                  
                  {nodo.opciones?.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {nodo.opciones.map(opt => (
                        <div key={opt.id} className={`px-3 py-1 rounded-full text-[11px] font-bold border ${darkMode ? 'border-[#C9EA63]/20 text-[#C9EA63]/80' : 'border-emerald-100 text-emerald-600 bg-emerald-50'}`}>
                          {opt.texto_opcion} → Step {opt.nodo_destino_id}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Modal / Editor de Nodo */}
          {editandoNodo && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <div className={`${darkMode ? 'bg-[#141f0b] border-[#C9EA63]/20' : 'bg-white border-gray-100'} border rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]`}>
                <div className={`p-5 sm:p-6 border-b ${darkMode ? 'border-white/10' : 'border-gray-100'} flex justify-between items-center shrink-0`}>
                  <h3 className={`text-xl font-bold flex items-center gap-2 ${textPrimary}`}>
                    {editandoNodo.isNew ? <><Plus size={20} className="text-emerald-500"/> Nuevo Paso</> : <><Edit2 size={20} className="text-emerald-500"/> Editando Paso {editandoNodo.id}</>}
                  </h3>
                  <button onClick={() => setEditandoNodo(null)} className={`hover:bg-rose-500/10 hover:text-rose-500 p-2 rounded-full transition-colors ${textMuted}`}><X size={20} /></button>
                </div>
                
                <div className="p-6 overflow-y-auto space-y-6 flex-1">
                  {/* Fila 1 */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={`text-[10px] uppercase font-bold tracking-wider mb-1 block flex items-center gap-1 ${textMuted}`}>
                        Nombre del nodo <span className="text-rose-500">*</span>
                      </label>
                      <input type="text" value={editandoNodo.nombre} onChange={e => setEditandoNodo({...editandoNodo, nombre: e.target.value})} className={`w-full p-3 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-[#C9EA63]/50 focus:border-[#C9EA63] transition-all ${inputCls}`} placeholder="Ej: Cotizacion Paso 2" />
                    </div>
                    <div>
                      <label className={`text-[10px] uppercase font-bold tracking-wider mb-1 block flex items-center gap-1 ${textMuted}`}>
                        Comportamiento IA / Tipo <span className="text-rose-500">*</span>
                      </label>
                      <select value={editandoNodo.tipo} onChange={e => setEditandoNodo({...editandoNodo, tipo: e.target.value})} className={`w-full p-3 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-[#C9EA63]/50 focus:border-[#C9EA63] transition-all ${inputCls}`}>
                        <option value="mensaje">Mensaje Informativo (IA contextual)</option>
                        <option value="opciones">Menú de Opciones (Botones fijos)</option>
                        <option value="input">Esperar dato del usuario (Programable)</option>
                      </select>
                      <p className={`text-[10px] mt-1 ${textMuted}`}>{editandoNodo.tipo === 'mensaje' ? 'Gemini responderá preguntas usando este texto como base.' : 'Navegación tradicional sin usar IA para responder.'}</p>
                    </div>
                  </div>

                  {/* Fila 2 - Mensaje */}
                  <div>
                    <label className={`text-[10px] uppercase font-bold tracking-wider mb-1 block flex items-center justify-between ${textMuted}`}>
                      <span>Mensaje de WhatsApp <span className="text-rose-500">*</span></span>
                      <span className="text-[10px] text-emerald-500 font-medium normal-case">Formatos: *negrita* _cursiva_</span>
                    </label>
                    <textarea rows={5} value={editandoNodo.mensaje} onChange={e => setEditandoNodo({...editandoNodo, mensaje: e.target.value})} className={`w-full p-4 rounded-xl border text-sm leading-relaxed outline-none resize-none focus:ring-2 focus:ring-[#C9EA63]/50 focus:border-[#C9EA63] transition-all ${inputCls}`} placeholder="Escribe el mensaje exacto que enviará el bot al usuario. \n\nEjemplo:\n¡Excelente! Con gusto te explico nuestros servicios..." />
                  </div>

                  {/* Fila 3 - Archivos Adjuntos Upload Local */}
                  <div className={`p-4 rounded-2xl border ${darkMode ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-gray-50'}`}>
                    <label className={`text-[10px] uppercase font-bold tracking-wider mb-2 block flex items-center justify-between ${textMuted}`}>
                       <span>Archivo Multimedia Adjunto</span>
                    </label>
                    <div className="flex flex-col md:flex-row gap-3 items-center">
                       <input type="text" value={editandoNodo.media_url || ''} onChange={e => setEditandoNodo({...editandoNodo, media_url: e.target.value})} className={`flex-1 w-full p-3 rounded-xl border text-sm outline-none ${inputCls}`} placeholder="https://ejemplo.com/archivo.pdf (o URL pública)" />
                       <span className={`hidden md:block text-xs font-bold ${textMuted}`}>O</span>
                       
                       <input type="file" ref={fileInputRef} className="hidden" accept="image/*,video/*,application/pdf" onChange={handleUploadMedia} />
                       <button onClick={() => fileInputRef.current?.click()} disabled={uploadingMedia} className={`whitespace-nowrap px-4 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 border transition-colors ${darkMode ? 'bg-[#141F0B] border-[#C9EA63]/30 text-[#C9EA63] hover:bg-[#C9EA63]/10' : 'bg-white border-emerald-200 text-emerald-600 hover:bg-emerald-50'}`}>
                         {uploadingMedia ? <RefreshCw size={16} className="animate-spin" /> : <Plus size={16} />} 
                         {uploadingMedia ? 'Subiendo...' : 'Subir Archivo Local'}
                       </button>
                    </div>
                    {editandoNodo.media_url && (
                        <div className="flex gap-4 mt-3">
                           {['image', 'video', 'document'].map(t => (
                             <label key={t} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition-colors ${editandoNodo.media_tipo === t ? (darkMode ? 'bg-[#C9EA63]/20 border-[#C9EA63] text-[#F2F6F0]' : 'bg-emerald-100 border-emerald-400 text-emerald-800') : (darkMode ? 'border-white/10 text-white/50 hover:bg-white/5' : 'border-gray-200 text-gray-500 hover:bg-gray-100')}`}>
                               <input type="radio" name="media_tipo" className="hidden" checked={editandoNodo.media_tipo === t} onChange={() => setEditandoNodo({...editandoNodo, media_tipo: t})} />
                               <span className="text-xs font-bold capitalize">{t === 'document' ? 'PDF/Doc' : t}</span>
                             </label>
                           ))}
                        </div>
                    )}
                  </div>

                  {/* Fila 4 */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={`text-[10px] uppercase font-bold tracking-wider mb-1 block ${textMuted}`}>Conectar a Motor Interno</label>
                      <select value={editandoNodo.accion || ''} onChange={e => setEditandoNodo({...editandoNodo, accion: e.target.value || null})} className={`w-full p-3 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-[#C9EA63]/50 focus:border-[#C9EA63] ${inputCls}`}>
                        <option value="">-- Ninguna / Estándar --</option>
                        <option value="consultar_estatus">Motor Búsqueda Estatus (Kanban)</option>
                        <option value="cotizacion">Motor Flujo Cotización Compleja</option>
                        <option value="registrar_equipo">Motor Registro Próxima Calibración</option>
                        <option value="escalar">Motor Escalar a Asesor Humano</option>
                      </select>
                      <p className={`text-[10px] mt-1 ${textMuted}`}>Llama a código especializado en el backend si se selecciona.</p>
                    </div>
                    <div>
                      <label className={`text-[10px] uppercase font-bold tracking-wider mb-1 block ${textMuted}`}>Orden de Visualización</label>
                      <input type="number" value={editandoNodo.orden} onChange={e => setEditandoNodo({...editandoNodo, orden: parseInt(e.target.value)})} className={`w-full p-3 rounded-xl border text-sm outline-none ${inputCls}`} />
                    </div>
                  </div>

                  {/* Editor de Opciones/Ramificaciones */}
                  {editandoNodo.tipo === 'opciones' && (
                    <div className={`p-4 rounded-2xl border ${darkMode ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-gray-200'}`}>
                      <h4 className={`text-sm font-bold mb-4 ${textPrimary}`}>Ramificaciones (Botones)</h4>
                      <div className="space-y-3">
                        {(editandoNodo.opciones || []).map((opt, oIdx) => (
                          <div key={oIdx} className="flex flex-col sm:flex-row gap-2 sm:items-center p-3 rounded-xl bg-black/10 border border-white/5 relative">
                            <input type="text" placeholder="Texto del botón" value={opt.texto_opcion} onChange={e => {
                              const newOpts = [...editandoNodo.opciones];
                              newOpts[oIdx].texto_opcion = e.target.value;
                              setEditandoNodo({...editandoNodo, opciones: newOpts});
                            }} className={`flex-1 p-2 rounded-lg border text-xs min-h-[40px] ${inputCls}`} />
                            <div className="flex gap-2">
                              <select value={opt.nodo_destino_id} onChange={e => {
                                const newOpts = [...editandoNodo.opciones];
                                newOpts[oIdx].nodo_destino_id = parseInt(e.target.value);
                                setEditandoNodo({...editandoNodo, opciones: newOpts});
                              }} className={`flex-1 sm:w-32 p-2 rounded-lg border text-xs min-h-[40px] ${inputCls}`}>
                                <option value="">Destino...</option>
                                {botNodos.map(n => <option key={n.id} value={n.id}>Paso {n.id}: {n.nombre}</option>)}
                              </select>
                              <button onClick={() => {
                                const newOpts = editandoNodo.opciones.filter((_, i) => i !== oIdx);
                                setEditandoNodo({...editandoNodo, opciones: newOpts});
                              }} className="text-rose-500 p-2 border border-rose-500/20 rounded-lg hover:bg-rose-500/10"><X size={16} /></button>
                            </div>
                          </div>
                        ))}
                        <button 
                          onClick={() => setEditandoNodo({...editandoNodo, opciones: [...(editandoNodo.opciones || []), { texto_opcion: '', nodo_destino_id: 0 }]})}
                          className={`w-full py-2 border-2 border-dashed rounded-xl text-xs font-bold ${darkMode ? 'border-white/10 text-[#C9EA63] hover:bg-[#C9EA63]/5' : 'border-gray-200 text-emerald-600 hover:bg-emerald-50'}`}
                        >
                          + Añadir Opción
                        </button>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className={`text-xs font-bold mb-1 block ${textMuted}`}>URL de Archivo Adjunto (Opcional)</label>
                    <input type="text" value={editandoNodo.media_url || ''} onChange={e => setEditandoNodo({...editandoNodo, media_url: e.target.value})} className={`w-full p-3 rounded-xl border text-sm ${inputCls}`} placeholder="https://ejemplo.com/archivo.pdf" />
                    <div className="flex gap-4 mt-2">
                       {['image', 'video', 'document'].map(t => (
                         <label key={t} className="flex items-center gap-1.5 text-xs">
                           <input type="radio" name="media_tipo" checked={editandoNodo.media_tipo === t} onChange={() => setEditandoNodo({...editandoNodo, media_tipo: t})} />
                           {t}
                         </label>
                       ))}
                    </div>
                  </div>
                </div>

                <div className="p-6 border-t border-white/10 flex justify-end gap-3 bg-white/5">
                  <button onClick={() => setEditandoNodo(null)} className={`px-6 py-2.5 rounded-xl text-sm font-bold ${textMuted}`}>Cancelar</button>
                  <button 
                    onClick={async () => {
                      await guardarNodo(editandoNodo);
                      if (editandoNodo.tipo === 'opciones' && !editandoNodo.isNew) {
                         await guardarOpciones(editandoNodo.id, editandoNodo.opciones);
                      }
                    }} 
                    className={`px-8 py-2.5 rounded-xl text-sm font-bold shadow-lg ${darkMode ? 'bg-[#C9EA63] text-[#141f0b] shadow-[#C9EA63]/20' : 'bg-emerald-600 text-white shadow-emerald-600/20'}`}
                  >
                    {editandoNodo.isNew ? 'Crear Paso' : 'Guardar Cambios'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── FAQ / RESPUESTAS (SOLO ADMIN) ────────────────────────────── */}
      {pestana === 'faq' && esAdmin && (
        <div className="space-y-6">
          <div className={`rounded-2xl border ${box} p-6`}>
            <h3 className={`font-bold mb-4 ${textPrimary}`}>{faqForm.id ? 'Editar Respuesta' : 'Nueva Respuesta Frecuente (FAQ)'}</h3>
            <div className="space-y-4">
              <div>
                <label className={`text-xs font-bold mb-1 block ${textMuted}`}>Pregunta / Palabras clave</label>
                <input
                  type="text"
                  value={faqForm.pregunta}
                  onChange={e => setFaqForm({ ...faqForm, pregunta: e.target.value })}
                  placeholder="Ej: ¿Qué magnitudes calibran?"
                  className={`w-full p-3 rounded-xl border text-sm outline-none ${inputCls}`}
                />
              </div>
              <div>
                <label className={`text-xs font-bold mb-1 block ${textMuted}`}>Respuesta del Bot</label>
                <textarea
                  value={faqForm.respuesta}
                  onChange={e => setFaqForm({ ...faqForm, respuesta: e.target.value })}
                  rows={3}
                  placeholder="Respuesta que el bot dará al detectar la pregunta..."
                  className={`w-full p-3 rounded-xl border text-sm outline-none ${inputCls}`}
                />
              </div>
              <div className="flex justify-end gap-2">
                {faqForm.id && <button onClick={() => setFaqForm({ pregunta: '', respuesta: '', id: null })} className="px-4 py-2 text-sm font-bold text-rose-500">Cancelar</button>}
                <button onClick={guardarFaq} className={`px-6 py-2 rounded-xl text-sm font-bold shadow-lg ${darkMode ? 'bg-[#C9EA63] text-[#141f0b] shadow-[#C9EA63]/10' : 'bg-emerald-600 text-white shadow-emerald-600/20'}`}>
                  {faqForm.id ? 'Actualizar' : 'Agregar FAQ'}
                </button>
              </div>
            </div>
          </div>

          <div className={`rounded-2xl border ${box} overflow-hidden`}>
            <div className="p-4 border-b border-[#C9EA63]/10 flex justify-between items-center">
              <h3 className={`font-bold ${textPrimary}`}>Biblioteca de Respuestas</h3>
              <button onClick={fetchBotFaq} className={`p-2 rounded-lg ${darkMode ? 'hover:bg-[#314a1c]' : 'hover:bg-slate-100'}`}><RefreshCw size={14} /></button>
            </div>
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full text-sm">
                <thead className={darkMode ? 'bg-[#141f0b]' : 'bg-slate-50'}>
                  <tr>
                    <th className={`px-4 py-3 text-left font-semibold ${textMuted}`}>Pregunta</th>
                    <th className={`px-4 py-3 text-left font-semibold ${textMuted}`}>Respuesta</th>
                    <th className={`px-4 py-3 text-center font-semibold ${textMuted}`}>Hits</th>
                    <th className={`px-4 py-3 text-right font-semibold ${textMuted}`}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {botFaq.map(f => (
                    <tr key={f.id} className={`border-t ${darkMode ? 'border-[#C9EA63]/10' : 'border-gray-100'}`}>
                      <td className={`px-4 py-3 ${textPrimary} font-bold`}>{f.pregunta}</td>
                      <td className={`px-4 py-3 ${textMuted} text-xs max-w-xs truncate`}>{f.respuesta}</td>
                      <td className={`px-4 py-3 text-center ${darkMode ? 'text-[#C9EA63]' : 'text-emerald-600'} font-bold`}>{f.hits}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setFaqForm({ ...f })} className="p-2 rounded-lg hover:bg-emerald-500/10 text-emerald-500"><Edit2 size={14} /></button>
                          <button onClick={() => eliminarFaq(f.id)} className="p-2 rounded-lg hover:bg-rose-500/10 text-rose-500"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── CONFIGURACIÓN (SOLO ADMIN) ────────────────────────────── */}
      {pestana === 'config' && esAdmin && (
        <div className={`rounded-2xl border ${box} p-4 sm:p-8 max-w-2xl mx-auto shadow-2xl`}>
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-3xl bg-[#C9EA63]/10 flex items-center justify-center mx-auto mb-4 border border-[#C9EA63]/20">
              <RefreshCw className="text-[#C9EA63]" size={32} />
            </div>
            <h3 className={`text-2xl font-black ${textPrimary} tracking-tight`}>Configuración del Bot</h3>
            <p className={`text-sm mt-1 ${textMuted}`}>Personaliza horarios y comportamientos del sistema</p>
          </div>

          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={`text-xs font-bold mb-2 block uppercase tracking-widest ${textMuted}`}>Hora Inicio</label>
                <input
                  type="time"
                  value={configForm.horario_inicio || '08:00'}
                  onChange={e => setConfigForm({ ...configForm, horario_inicio: e.target.value })}
                  className={`w-full p-3 rounded-xl border font-bold ${inputCls}`}
                />
              </div>
              <div>
                <label className={`text-xs font-bold mb-2 block uppercase tracking-widest ${textMuted}`}>Hora Fin</label>
                <input
                  type="time"
                  value={configForm.horario_fin || '18:00'}
                  onChange={e => setConfigForm({ ...configForm, horario_fin: e.target.value })}
                  className={`w-full p-3 rounded-xl border font-bold ${inputCls}`}
                />
              </div>
            </div>

            <div>
              <label className={`text-xs font-bold mb-2 block uppercase tracking-widest ${textMuted}`}>Días de Atención (1=Lun, 5=Vie)</label>
              <input
                type="text"
                value={configForm.dias_atencion || '1,2,3,4,5'}
                onChange={e => setConfigForm({ ...configForm, dias_atencion: e.target.value })}
                placeholder="Ej: 1,2,3,4,5"
                className={`w-full p-3 rounded-xl border font-mono ${inputCls}`}
              />
            </div>

            <div>
              <label className={`text-xs font-bold mb-2 block uppercase tracking-widest ${textMuted}`}>WhatsApp(s) para Notificaciones del Sistema</label>
              <textarea
                rows={3}
                value={configForm.notif_numeros || ''}
                onChange={e => setConfigForm({ ...configForm, notif_numeros: e.target.value })}
                placeholder="Ej: 527221234567@c.us,527229876543@c.us"
                className={`w-full p-3 rounded-xl border font-mono ${inputCls}`}
              />
              <p className="text-[10px] mt-1 text-emerald-500 font-medium">Puedes escribir varios números separados por comas (,). Estos números recibirán notificaciones de pre-cotizaciones.</p>
            </div>

            <div className={`p-4 rounded-2xl border ${darkMode ? 'bg-[#141f0b] border-[#C9EA63]/20' : 'bg-slate-50 border-gray-200'}`}>
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div>
                  <p className={`text-sm font-bold ${textPrimary}`}>Modo Fuera de Horario</p>
                  <p className={`text-xs ${textMuted}`}>Determina si el bot responde fuera de turno laboral</p>
                </div>
                <select
                  value={configForm.modo_fuera_horario || 'auto'}
                  onChange={e => setConfigForm({ ...configForm, modo_fuera_horario: e.target.value })}
                  className={`w-full sm:w-auto p-2 rounded-lg border text-sm font-bold outline-none ${inputCls}`}
                >
                  <option value="auto">Auto (Bot responde con mensaje fuera de horario)</option>
                  <option value="silent">Silencioso (Bot no responde)</option>
                </select>
              </div>
            </div>

            <button
              onClick={guardarConfig}
              className={`w-full py-4 rounded-2xl font-black text-lg transition-all shadow-xl flex items-center justify-center gap-3 ${
                darkMode ? 'bg-[#C9EA63] text-[#141f0b] shadow-[#C9EA63]/20 hover:scale-[1.02]' : 'bg-emerald-600 text-white shadow-emerald-600/20 hover:bg-emerald-700'
              }`}
            >
              <Save size={20} /> Guardar Configuración
            </button>
          </div>
        </div>
      )}
      {/* ── MODAL DETALLES COTIZACIÓN ────────────────────────────── */}
      {selectedCotizacion && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className={`${darkMode ? 'bg-[#141f0b] border-[#C9EA63]/20' : 'bg-white border-gray-100'} border rounded-3xl w-full max-w-5xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]`}>
            <div className={`p-6 border-b ${darkMode ? 'border-white/10' : 'border-gray-100'} flex justify-between items-center shrink-0`}>
              <div>
                <h3 className={`text-xl font-bold flex items-center gap-3 ${textPrimary}`}>
                  <TrendingUp className="text-emerald-500" size={24} />
                  Detalle de Cotización Bot #{selectedCotizacion.id}
                </h3>
                <p className={`text-sm ${textMuted}`}>Solicitud de: <span className="font-bold text-emerald-500">{selectedCotizacion.nombre_empresa}</span></p>
              </div>
              <button onClick={() => setSelectedCotizacion(null)} className={`hover:bg-rose-500/10 hover:text-rose-500 p-2 rounded-full transition-colors ${textMuted}`}><X size={24} /></button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className={`p-4 rounded-2xl border ${darkMode ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-gray-100'}`}>
                  <p className={`text-[10px] uppercase font-bold tracking-wider ${textMuted} mb-1`}>Contacto</p>
                  <p className={`text-sm font-semibold ${textPrimary}`}>{selectedCotizacion.cliente_whatsapp_display || selectedCotizacion.cliente_whatsapp?.replace('@c.us', '')}</p>
                </div>
                <div className={`p-4 rounded-2xl border ${darkMode ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-gray-100'}`}>
                  <p className={`text-[10px] uppercase font-bold tracking-wider ${textMuted} mb-1`}>Tiempo de Entrega</p>
                  <p className={`text-sm font-semibold text-emerald-500`}>{selectedCotizacion.tiempo_entrega || 'No especificado'}</p>
                </div>
                <div className={`p-4 rounded-2xl border ${darkMode ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-gray-100'}`}>
                  <p className={`text-[10px] uppercase font-bold tracking-wider ${textMuted} mb-1`}>Fecha Registro</p>
                  <p className={`text-sm font-semibold ${textPrimary}`}>{new Date(selectedCotizacion.created_at).toLocaleString('es-MX')}</p>
                </div>
              </div>

              <h4 className={`text-lg font-bold mb-4 flex items-center gap-2 ${textPrimary}`}>
                <Package size={20} className="text-emerald-500" />
                Instrumentos a Calibrar ({selectedCotizacion.cantidad})
              </h4>

              <div className="space-y-4">
                {(() => {
                  let items = [];
                  try {
                    items = typeof selectedCotizacion.detalle_instrumentos === 'string' 
                      ? JSON.parse(selectedCotizacion.detalle_instrumentos) 
                      : (selectedCotizacion.detalle_instrumentos || []);
                  } catch (e) { console.error("Error parsing items:", e); }

                  if (items.length === 0) {
                    return (
                      <div className={`p-6 text-center rounded-2xl border border-dashed ${darkMode ? 'border-white/20' : 'border-gray-200'}`}>
                        <p className={textMuted}>No se encontraron detalles técnicos para esta cotización.</p>
                      </div>
                    );
                  }

                  return items.map((item, idx) => (
                    <div key={idx} className={`p-5 rounded-2xl border ${darkMode ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200 shadow-sm'} hover:border-emerald-500/50 transition-colors`}>
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex gap-4">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg ${darkMode ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-600'}`}>
                            {idx + 1}
                          </div>
                          <div>
                            <h5 className={`font-bold ${textPrimary}`}>{item.tipoEquipo}</h5>
                            <p className={`text-sm ${textMuted}`}>{item.marcaModelo || 'Marca/Modelo no especificado'}</p>
                          </div>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${darkMode ? 'bg-[#C9EA63]/10 text-[#C9EA63]' : 'bg-emerald-50 text-emerald-600'}`}>
                          Item Detallado
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-4 gap-x-6">
                        <div>
                          <p className={`text-[10px] uppercase font-bold tracking-wider ${textMuted} mb-0.5`}>ID / Tag</p>
                          <p className={`text-sm ${textPrimary} font-mono`}>{item.identificacion || '—'}</p>
                        </div>
                        <div>
                          <p className={`text-[10px] uppercase font-bold tracking-wider ${textMuted} mb-0.5`}>Ubicación</p>
                          <p className={`text-sm ${textPrimary}`}>{item.ubicacion || '—'}</p>
                        </div>
                        <div className="md:col-span-2 lg:col-span-1">
                          <p className={`text-[10px] uppercase font-bold tracking-wider ${textMuted} mb-0.5`}>Requerimientos Especiales</p>
                          <p className={`text-sm ${item.requerimientos ? (darkMode ? 'text-amber-400' : 'text-amber-600 font-medium') : textMuted}`}>
                            {item.requerimientos || 'Sin requerimientos especiales'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>

            <div className={`p-6 border-t ${darkMode ? 'border-white/10' : 'border-gray-100'} bg-black/5 flex flex-wrap justify-between items-center gap-4 shrink-0`}>
              <div className="flex gap-2">
                {selectedCotizacion.estatus !== 'completada' && selectedCotizacion.estatus !== 'cerrada' && (
                  <>
                    <button 
                      disabled={loadingAccion}
                      onClick={async () => {
                        try {
                          setLoadingAccion(true);
                          await axios.put(`${API}/api/cotizaciones-bot/${selectedCotizacion.id}/estatus`, { estatus: 'en-proceso' });
                          setSelectedCotizacion(prev => ({ ...prev, estatus: 'en-proceso' }));
                          fetchCotizaciones();
                        } catch (e) {
                          alert("Error al actualizar estado");
                        } finally {
                          setLoadingAccion(false);
                        }
                      }}
                      className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${loadingAccion ? 'opacity-50 cursor-not-allowed' : (darkMode ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30' : 'bg-amber-100 text-amber-700 hover:bg-amber-200')}`}
                    >
                      <Clock size={14} className={loadingAccion ? "animate-spin" : ""} /> En Proceso
                    </button>
                    <button 
                      disabled={loadingAccion}
                      onClick={async () => {
                        try {
                          setLoadingAccion(true);
                          await axios.put(`${API}/api/cotizaciones-bot/${selectedCotizacion.id}/estatus`, { estatus: 'cerrada' });
                          setSelectedCotizacion(null);
                          fetchCotizaciones();
                        } catch (e) {
                          alert("Error al completar cotización");
                        } finally {
                          setLoadingAccion(false);
                        }
                      }}
                      className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${loadingAccion ? 'opacity-50 cursor-not-allowed' : (darkMode ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-emerald-600 text-white hover:bg-emerald-700')}`}
                    >
                      <CheckCircle size={14} className={loadingAccion ? "animate-spin" : ""} /> Completar
                    </button>
                  </>
                )}
              </div>
              <button 
                onClick={() => setSelectedCotizacion(null)}
                className={`px-6 py-2.5 rounded-xl font-bold transition-all ${darkMode ? 'bg-white/5 text-[#F2F6F0] hover:bg-white/10 border border-white/10' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`}
              >
                Cerrar Detalle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FlujosWhatsapp;
