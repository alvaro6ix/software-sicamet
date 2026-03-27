import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Bot, MessageSquare, Plus, Edit2, Trash2, Smartphone, Save, X, Zap, AlertCircle, Users, Clock, TrendingUp, BarChart2, RefreshCw, Bell, Package, Send, ChevronRight, CheckCircle, AlertTriangle } from 'lucide-react';

const API = 'http://localhost:3001';

// Menú principal simulado con botones rápidos
const OPCIONES_MENU = [
  { id: '1', label: '📋 Solicitar cotización', color: 'blue' },
  { id: '2', label: '🔍 Consultar estatus de equipo', color: 'emerald' },
  { id: '3', label: '📅 Mis equipos y recordatorios', color: 'purple' },
  { id: '4', label: '🏆 Servicios y acreditaciones', color: 'amber' },
  { id: '5', label: '📞 Contacto y ubicaciones', color: 'slate' },
  { id: '6', label: '🧑‍💼 Hablar con un asesor', color: 'rose' },
];

const MENSAJES_INICIALES = [
  {
    tipo: 'bot',
    text: '¡Hola! 👋 Soy el asistente virtual de *SICAMET*.\n\n¿En qué te podemos ayudar hoy?',
    esMenu: true
  }
];

const FlujosWhatsapp = ({ darkMode }) => {
  const [pestana, setPestana] = useState('simulador');
  const [mensajes, setMensajes] = useState(MENSAJES_INICIALES);
  const [inputMsg, setInputMsg] = useState('');
  const [cargandoBot, setCargandoBot] = useState(false);
  const [statusBot, setStatusBot] = useState({ connected: false });
  const [stats, setStats] = useState({});
  const [cotizaciones, setCotizaciones] = useState([]);
  const [escalados, setEscalados] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [cacheIA, setCacheIA] = useState([]);
  const chatRef = useRef(null);

  // Colores por tema
  const box = darkMode ? 'bg-[#253916] border-[#C9EA63]/20' : 'bg-white border-gray-100 shadow-lg';
  const textPrimary = darkMode ? 'text-[#F2F6F0]' : 'text-slate-800';
  const textMuted = darkMode ? 'text-[#F2F6F0]/60' : 'text-slate-500';
  const inputCls = darkMode ? 'bg-[#141f0b] border-[#C9EA63]/30 text-[#F2F6F0] placeholder-[#F2F6F0]/40' : 'bg-slate-50 border-gray-200 text-slate-800';

  useEffect(() => {
    fetchStatusBot();
    fetchStats();
    const interval = setInterval(fetchStatusBot, 8000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (pestana === 'cotizaciones') fetchCotizaciones();
    if (pestana === 'escalados') fetchEscalados();
    if (pestana === 'equipos') fetchEquipos();
    if (pestana === 'cache') fetchCache();
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
  const fetchEscalados = async () => {
    try { const { data } = await axios.get(`${API}/api/escalados`); setEscalados(data); } catch {}
  };
  const fetchEquipos = async () => {
    try { const { data } = await axios.get(`${API}/api/equipos-cliente`); setEquipos(data); } catch {}
  };
  const fetchCache = async () => {
    try { const { data } = await axios.get(`${API}/api/bot/cache`); setCacheIA(data); } catch {}
  };

  // Simulador de chat con lógica local
  const enviarMensaje = async (texto) => {
    if (!texto.trim()) return;
    const userMsg = texto.trim();
    setInputMsg('');
    setMensajes(prev => [...prev, { tipo: 'user', text: userMsg }]);
    setCargandoBot(true);

    try {
      const respuesta = await simularRespuestaBot(userMsg);
      setTimeout(() => {
        setMensajes(prev => [...prev, ...respuesta]);
        setCargandoBot(false);
      }, 700);
    } catch {
      setCargandoBot(false);
    }
  };

  const simularRespuestaBot = async (texto) => {
    const t = texto.toLowerCase().trim();

    if (['0', 'menu', 'menú', 'inicio'].includes(t)) {
      return [{ tipo: 'bot', text: '¡Claro! Aquí el menú principal 👇', esMenu: true }];
    }

    if (t === '1') return [{ tipo: 'bot', text: '📋 *Cotización de Calibración*\n\n¿Qué tipo de equipo quieres calibrar?', esOpciones: true, opciones: [
      { id: 'temp', label: '🌡️ Temperatura' }, { id: 'pres', label: '⚡ Presión' },
      { id: 'masa', label: '⚖️ Masa / Fuerza' }, { id: 'elec', label: '💡 Eléctrica' },
      { id: 'dim', label: '📏 Dimensional' }, { id: 'otro', label: '🔧 Otro' }
    ]}];

    if (t === '2') return [{ tipo: 'bot', text: '🔍 Escribe el número de orden o cotización:\n\n_Ejemplo: OC-2025-001_' }];
    if (t === '3') return [{ tipo: 'bot', text: '📅 *Registro de Equipos*\n\nPuedo avisarte antes de que venza tu certificado de calibración. 🔔\n\n¿Cuál es el nombre de tu empresa?' }];
    if (t === '4') return [{ tipo: 'bot', text: '🏆 *Servicios SICAMET*\n\n✅ Calibración In-Lab / In-situ\n✅ Calificación DQ/IQ/OQ/PQ\n✅ Consultoría y Capacitación\n✅ Vaisala Partner\n\n*12 Acreditaciones · EMA · PJLA · 21 años*' }];
    if (t === '5') return [{ tipo: 'bot', text: '📞 *Contacto SICAMET*\n\n📍 Toluca · CDMX · Querétaro · GDL\n📱 722 270 1584\n📧 sclientes@sicamet.net\n🌐 sicamet.mx\n⏰ Lun–Vie 8:00–18:00' }];
    if (t === '6') return [{ tipo: 'bot', text: '🧑‍💼 *Transfiriendo con un asesor...*\n\n📞 722 270 1584 · 722 212 0722\n📧 sclientes@sicamet.net\n\n_Escribe *0* para volver al menú_' }];

    // Respuesta IA (simulada en el preview)
    const keywordsCot = ['calibrar', 'cotización', 'precio', 'costo', 'manómetro', 'termómetro', 'balanza'];
    if (keywordsCot.some(k => t.includes(k))) {
      return [{ tipo: 'bot', text: '📋 Perfecto, puedo ayudarte con una cotización. ¿Qué tipo de equipo necesitas calibrar?', esOpciones: true, opciones: [
        { id: '1', label: '🌡️ Temperatura' }, { id: '2', label: '⚡ Presión' },
        { id: '3', label: '⚖️ Masa / Fuerza' }, { id: '7', label: '🔧 Otro' }
      ]}];
    }

    return [{ tipo: 'bot', text: `🤖 *Modo Simulador*\n\nEn producción, la IA de SICAMET analizaría: _"${texto}"_ y respondería de forma inteligente.\n\nEscribe un número del menú para probar los flujos:`, esMenu: true }];
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
      alert(`✅ Recordatorios ejecutados: ${data.enviados} enviados, ${data.omitidos} omitidos`);
    } catch (e) { alert('Error al ejecutar recordatorios: ' + e.message); }
  };

  const limpiarCache = async () => {
    try {
      await axios.delete(`${API}/api/bot/cache`);
      fetchCache();
      alert('✅ Caché expirado eliminado');
    } catch {}
  };

  const resetChat = () => setMensajes(MENSAJES_INICIALES);

  const TABS = [
    { id: 'simulador', label: '💬 Simulador', icon: Smartphone },
    { id: 'cotizaciones', label: '📋 Cotizaciones Bot', icon: TrendingUp },
    { id: 'escalados', label: '🧑‍💼 Escalados', icon: AlertCircle },
    { id: 'equipos', label: '📅 Equipos', icon: Package },
    { id: 'cache', label: '🧠 Caché IA', icon: Zap },
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
          {statusBot.connected ? '🟢 Bot Activo' : '🔴 Bot Inactivo'}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Cotizaciones hoy', value: stats.cotizacionesHoy ?? '—', icon: '📋' },
          { label: 'Escalados pendientes', value: stats.escaladosPendientes ?? '—', icon: '🧑‍💼', alert: stats.escaladosPendientes > 0 },
          { label: 'Equipos registrados', value: stats.equiposRegistrados ?? '—', icon: '📦' },
          { label: 'Vencen en 30d', value: stats.proximosVencer30d ?? '—', icon: '⏰', alert: stats.proximosVencer30d > 0 },
          { label: 'Cache hits IA', value: stats.cacheHitsTotal ?? '—', icon: '🧠' },
        ].map((kpi, i) => (
          <div key={i} className={`rounded-xl border p-4 ${box} ${kpi.alert ? (darkMode ? 'border-amber-500/50' : 'border-amber-300 bg-amber-50') : ''}`}>
            <p className="text-2xl">{kpi.icon}</p>
            <p className={`text-2xl font-bold mt-1 ${textPrimary} ${kpi.alert ? 'text-amber-600' : ''}`}>{kpi.value}</p>
            <p className={`text-xs mt-1 ${textMuted}`}>{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 flex-wrap">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setPestana(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${pestana === tab.id
              ? (darkMode ? 'bg-[#C9EA63] text-[#141f0b]' : 'bg-blue-600 text-white')
              : (darkMode ? 'bg-[#141f0b] text-[#F2F6F0]/70 hover:bg-[#314a1c]' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}`}>
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
          <div ref={chatRef} className={`h-[400px] overflow-y-auto p-4 space-y-3 ${darkMode ? 'bg-[#1a2e10]/50' : 'bg-slate-50'}`}>
            {mensajes.map((msg, i) => (
              <div key={i} className={`flex ${msg.tipo === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] space-y-2`}>
                  <div className={`px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap shadow-sm ${
                    msg.tipo === 'user'
                      ? (darkMode ? 'bg-[#C9EA63] text-[#141f0b]' : 'bg-blue-600 text-white') + ' rounded-br-sm'
                      : (darkMode ? 'bg-[#253916] text-[#F2F6F0]' : 'bg-white text-slate-800 border border-gray-100') + ' rounded-bl-sm'
                  }`}>
                    {msg.text.replace(/\*(.*?)\*/g, '$1').replace(/_(.*?)_/g, '$1')}
                  </div>

                  {/* Botones de respuesta rápida */}
                  {msg.esMenu && (
                    <div className="grid grid-cols-2 gap-1.5 mt-1">
                      {OPCIONES_MENU.map(op => (
                        <button key={op.id} onClick={() => clickBoton(op.id)}
                          className={`text-left text-xs px-3 py-2 rounded-lg font-medium transition-all border ${darkMode ? 'bg-[#253916] border-[#C9EA63]/30 text-[#F2F6F0] hover:bg-[#314a1c]' : 'bg-white border-gray-200 text-slate-700 hover:bg-slate-50'} flex items-center gap-1.5`}>
                          <ChevronRight size={10} className="opacity-50 flex-shrink-0" />
                          {op.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {msg.esOpciones && msg.opciones && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {msg.opciones.map(op => (
                        <button key={op.id} onClick={() => clickBoton(op.id)}
                          className={`text-xs px-3 py-1.5 rounded-full font-medium transition-all border ${darkMode ? 'bg-[#253916] border-[#C9EA63]/30 text-[#F2F6F0] hover:bg-[#314a1c]' : 'bg-white border-blue-200 text-blue-700 hover:bg-blue-50'}`}>
                          {op.label}
                        </button>
                      ))}
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
            <button type="submit" className={`p-2.5 rounded-xl transition-all ${darkMode ? 'bg-[#C9EA63] text-[#141f0b] hover:bg-[#b0d14b]' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
              <Send size={16} />
            </button>
          </form>
          <p className={`text-center text-xs py-2 ${textMuted}`}>
            🛈 Simulador de preview · Los flujos reales con IA están activos en el bot de WhatsApp
          </p>
        </div>
      )}

      {/* ── COTIZACIONES BOT ────────────────────────────────────────── */}
      {pestana === 'cotizaciones' && (
        <div className={`rounded-2xl border ${box} overflow-hidden`}>
          <div className="p-4 border-b border-[#C9EA63]/10 flex justify-between items-center">
            <h3 className={`font-bold ${textPrimary}`}>Pre-cotizaciones generadas por el bot</h3>
            <button onClick={fetchCotizaciones} className={`p-2 rounded-lg ${darkMode ? 'hover:bg-[#314a1c]' : 'hover:bg-slate-100'}`}><RefreshCw size={14} /></button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={darkMode ? 'bg-[#141f0b]' : 'bg-slate-50'}>
                <tr>{['WhatsApp', 'Empresa', 'Equipo', 'Tipo Servicio', 'Estatus', 'Fecha'].map(h => (
                  <th key={h} className={`px-4 py-3 text-left font-semibold ${textMuted}`}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {cotizaciones.length === 0 ? (
                  <tr><td colSpan={6} className={`text-center py-10 ${textMuted}`}>No hay cotizaciones aún</td></tr>
                ) : cotizaciones.map(c => (
                  <tr key={c.id} className={`border-t ${darkMode ? 'border-[#C9EA63]/10' : 'border-gray-100'}`}>
                    <td className={`px-4 py-3 ${textPrimary} font-mono text-xs`}>{c.cliente_whatsapp?.replace('@c.us','')}</td>
                    <td className={`px-4 py-3 ${textPrimary}`}>{c.nombre_empresa || '—'}</td>
                    <td className={`px-4 py-3 ${textPrimary}`}>{c.tipo_equipo} — {c.marca || '—'}</td>
                    <td className={`px-4 py-3 ${textMuted}`}>{c.tipo_servicio}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${c.estatus === 'nueva' ? 'bg-blue-100 text-blue-700' : c.estatus === 'enviada' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>{c.estatus}</span>
                    </td>
                    <td className={`px-4 py-3 ${textMuted} text-xs`}>{new Date(c.created_at).toLocaleDateString('es-MX')}</td>
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={darkMode ? 'bg-[#141f0b]' : 'bg-slate-50'}>
                <tr>{['WhatsApp', 'Motivo', 'Estatus', 'Fecha', 'Acción'].map(h => (
                  <th key={h} className={`px-4 py-3 text-left font-semibold ${textMuted}`}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {escalados.length === 0 ? (
                  <tr><td colSpan={5} className={`text-center py-10 ${textMuted}`}>No hay escalados pendientes ✅</td></tr>
                ) : escalados.map(e => (
                  <tr key={e.id} className={`border-t ${darkMode ? 'border-[#C9EA63]/10' : 'border-gray-100'}`}>
                    <td className={`px-4 py-3 ${textPrimary} font-mono text-xs`}>{e.cliente_whatsapp?.replace('@c.us','')}</td>
                    <td className={`px-4 py-3 ${textMuted} max-w-[200px] truncate`}>{e.motivo}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${e.estatus === 'pendiente' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{e.estatus}</span>
                    </td>
                    <td className={`px-4 py-3 ${textMuted} text-xs`}>{new Date(e.created_at).toLocaleDateString('es-MX')}</td>
                    <td className="px-4 py-3">
                      {e.estatus === 'pendiente' && (
                        <button onClick={() => resolverEscalado(e.id)}
                          className={`px-3 py-1 rounded-lg text-xs font-semibold ${darkMode ? 'bg-[#C9EA63] text-[#141f0b]' : 'bg-emerald-600 text-white'} hover:opacity-80 flex items-center gap-1`}>
                          <CheckCircle size={12} /> Resolver
                        </button>
                      )}
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
          <div className="overflow-x-auto">
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
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${urgente ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {urgente ? '⚠️ ' : '✅ '}{prox.toLocaleDateString('es-MX')} {diasRestantes !== null ? `(${diasRestantes}d)` : ''}
                          </span>
                        ) : '—'}
                      </td>
                      <td className={`px-4 py-3 ${textMuted} font-mono text-xs`}>{eq.cliente_whatsapp?.replace('@c.us','')}</td>
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
          <div className="overflow-x-auto">
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
                    <td className={`px-4 py-3 ${darkMode ? 'text-[#C9EA63]' : 'text-blue-600'} font-bold`}>{c.hits}x</td>
                    <td className={`px-4 py-3 ${textMuted} text-xs`}>{new Date(c.expires_at).toLocaleDateString('es-MX')}</td>
                    <td className={`px-4 py-3 ${textMuted} text-xs`}>{new Date(c.created_at).toLocaleDateString('es-MX')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default FlujosWhatsapp;
