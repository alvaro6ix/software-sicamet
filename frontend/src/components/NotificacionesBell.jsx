import React, { useState, useEffect, useRef } from 'react';
import { Bell, X, AlertTriangle, MessageSquare, RotateCcw, ChevronRight, RefreshCw, Zap } from 'lucide-react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const tiempoRelativo = (ts) => {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'ahora mismo';
  if (min < 60) return `hace ${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
};

const LEIDAS_KEY = 'crm_notifs_leidas_v2';

const NotificacionesBell = ({ darkMode }) => {
  const [notifs, setNotifs] = useState([]);
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [leidas, setLeidas] = useState(new Set());
  const [vistos, setVistos] = useState(new Set());
  const panelRef = useRef(null);
  const navigate = useNavigate();

  const fetchNotifs = async (mostrarLoader = false) => {
    if (mostrarLoader) setCargando(true);
    try {
      const res = await axios.get('/api/notificaciones');
      setNotifs(res.data || []);
    } catch { /* silencioso */ }
    if (mostrarLoader) setCargando(false);
  };

  useEffect(() => {
    fetchNotifs();
    const interval = setInterval(() => fetchNotifs(), 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handler = () => fetchNotifs();
    window.addEventListener('crm:refresh', handler);
    return () => window.removeEventListener('crm:refresh', handler);
  }, []);

  // Cerrar al hacer click afuera en desktop
  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setAbierto(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Bloquear scroll en mobile cuando está abierto
  useEffect(() => {
    if (abierto && window.innerWidth < 1024) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [abierto]);

  const noLeidas = notifs.filter(n => !leidas.has(n.id));

  const marcarLeida = (id) => {
    const nls = new Set([...leidas, id]);
    setLeidas(nls);
  };

  const marcarEntendido = async (e, id) => {
    e.stopPropagation();
    try {
        await axios.post(`/api/notificaciones/${id}/visto`, { id_usuario: 1 }); // ID estático o de auth
        setVistos(new Set([...vistos, id]));
        fetchNotifs();
    } catch(err) { console.error("Error al marcar visto"); }
  };

  const marcarTodas = () => {
    const todosIds = notifs.map(n => n.id);
    setLeidas(new Set([...leidas, ...todosIds]));
  };

  // Metadata visual por tipo + urgencia
  const getMeta = (n) => {
    const esAlta = n.urgencia === 'alta';
    if (n.tipo === 'sla') return {
      icon: <AlertTriangle size={16} className={esAlta ? 'text-red-500 flex-shrink-0' : 'text-amber-400 flex-shrink-0'} />,
      badge: esAlta ? 'bg-red-500' : 'bg-amber-400',
      rowExtra: esAlta
        ? (darkMode ? 'border-l-2 border-red-500 bg-red-950/30' : 'border-l-2 border-red-400 bg-red-50/80')
        : (darkMode ? 'border-l-2 border-amber-500 bg-amber-950/20' : 'border-l-2 border-amber-400 bg-amber-50/60'),
    };
    if (n.tipo === 'cotizacion') return {
      icon: <MessageSquare size={16} className="text-sky-400 flex-shrink-0" />, badge: 'bg-sky-400', rowExtra: '',
    };
    if (n.tipo === 'rechazo') return {
      icon: <RotateCcw size={16} className="text-orange-400 flex-shrink-0" />, badge: 'bg-orange-400', rowExtra: '',
    };
    if (n.tipo === 'global') return {
      icon: <Zap size={16} className="text-yellow-400 flex-shrink-0" />, 
      badge: 'bg-yellow-400', 
      rowExtra: (darkMode ? 'bg-yellow-950/20 border-l-4 border-yellow-500' : 'bg-yellow-50 border-l-4 border-yellow-400')
    };
    return { icon: <Bell size={16} className="opacity-50 flex-shrink-0" />, badge: 'bg-slate-400', rowExtra: '' };
  };

  const divider = darkMode ? 'border-[#C9EA63]/10' : 'border-slate-100';
  const rowHover = darkMode ? 'hover:bg-[#1b2b10]' : 'hover:bg-slate-50';
  const panelBase = darkMode ? 'bg-[#141f0b] border-[#C9EA63]/20 text-[#F2F6F0]' : 'bg-white border-slate-200 text-slate-800';

  // ── Renderizado de la lista (compartido entre mobile y desktop)
  const Lista = () => notifs.length === 0 ? (
    <div className="py-12 px-6 text-center">
      <Bell size={36} className="mx-auto mb-3 opacity-10" />
      <p className="text-sm font-semibold opacity-40">Sin alertas activas</p>
      <p className="text-xs opacity-25 mt-1">No hay notificaciones pendientes en este momento.</p>
    </div>
  ) : (
    <>
      {notifs.map(n => {
        const leida = leidas.has(n.id);
        const meta = getMeta(n);
        return (
          <div
            key={n.id}
            onClick={() => { marcarLeida(n.id); navigate(n.ruta); setAbierto(false); }}
            className={`
              group flex items-start gap-3 px-4 py-3.5 border-b cursor-pointer transition-all
              ${divider} ${rowHover} ${meta.rowExtra}
              ${leida ? 'opacity-40' : ''}
            `}
          >
            <div className="mt-0.5">{meta.icon}</div>
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-bold leading-snug ${n.urgencia === 'alta' && !leida ? 'text-red-500' : ''}`}>{n.titulo}</p>
              <p className="text-[11px] mt-0.5 leading-relaxed opacity-55">{n.detalle}</p>
              <p className="text-[10px] mt-1 opacity-35">{tiempoRelativo(n.ts)}</p>
            </div>
            <div className="flex flex-col items-end gap-1.5 flex-shrink-0 self-center">
              {n.tipo === 'global' && !n.visto_por_mi ? (
                  <button 
                    onClick={(e) => marcarEntendido(e, n.id)} 
                    className={`px-3 py-1 rounded-full text-[10px] font-black transition-all ${darkMode ? 'bg-[#C9EA63] text-black hover:bg-white' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
                  >
                    ENTERADO
                  </button>
              ) : (
                  <>
                    {!leida && <span className={`w-2 h-2 rounded-full ${meta.badge}`} />}
                    <ChevronRight size={12} className="opacity-0 group-hover:opacity-40 transition-opacity" />
                  </>
              )}
            </div>
          </div>
        );
      })}
    </>
  );

  return (
    <div className="relative" ref={panelRef}>
      {/* ── Botón campana ── */}
      <button
        onClick={() => setAbierto(v => !v)}
        className={`relative p-2 rounded-xl transition-all outline-none ${
          darkMode
            ? 'hover:bg-[#253916] text-[#F2F6F0]/60 hover:text-[#C9EA63]'
            : 'hover:bg-slate-100 text-slate-500 hover:text-slate-700'
        }`}
        title="Notificaciones"
      >
        <Bell size={20} className={abierto ? (darkMode ? 'text-[#C9EA63]' : 'text-emerald-600') : ''} />
        {noLeidas.length > 0 && (
          <span className={`absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1
            flex items-center justify-center rounded-full text-[10px] font-black text-white bg-red-500
            border-2 ${darkMode ? 'border-[#141f0b]' : 'border-white'}
            ${noLeidas.some(n => n.urgencia === 'alta') ? 'animate-bounce' : 'animate-pulse'}`}
          >
            {noLeidas.length > 9 ? '9+' : noLeidas.length}
          </span>
        )}
      </button>

      {abierto && (
        <>
          {/* ── DESKTOP: dropdown normal ── */}
          <div className={`
            hidden lg:flex flex-col
            absolute right-0 top-[calc(100%+8px)] w-96 z-[300]
            rounded-2xl border shadow-2xl overflow-hidden
            ${panelBase}
          `}>
            <div className={`flex items-center justify-between px-4 py-3 border-b ${divider} flex-shrink-0`}>
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Bell size={15} className={darkMode ? 'text-[#C9EA63]' : 'text-emerald-600'} />
                Notificaciones
                {notifs.length > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${darkMode ? 'bg-[#C9EA63]/20 text-[#C9EA63]' : 'bg-emerald-100 text-emerald-700'}`}>
                    {notifs.length}
                  </span>
                )}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchNotifs(true)}
                  title="Actualizar"
                  className={`p-1.5 rounded-lg transition-colors ${darkMode ? 'hover:bg-[#253916] text-[#F2F6F0]/50' : 'hover:bg-slate-100 text-slate-400'} ${cargando ? 'animate-spin' : ''}`}
                >
                  <RefreshCw size={13} />
                </button>
                {noLeidas.length > 0 && (
                  <button onClick={marcarTodas} className="text-[10px] opacity-50 hover:opacity-100 transition-opacity underline whitespace-nowrap">
                    Marcar todas
                  </button>
                )}
                <button onClick={() => setAbierto(false)} className="opacity-40 hover:opacity-90 transition-opacity ml-1">
                  <X size={15} />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto custom-scrollbar flex-1 max-h-[420px]">
              <Lista />
            </div>
            {notifs.length > 0 && (
              <div className={`px-4 py-3 border-t text-center flex-shrink-0 ${divider}`}>
                <button
                  onClick={() => { navigate('/equipos'); setAbierto(false); }}
                  className={`text-xs font-bold opacity-60 hover:opacity-100 transition-opacity ${darkMode ? 'text-[#C9EA63]' : 'text-emerald-600'}`}
                >
                  Ver todos los equipos →
                </button>
              </div>
            )}
          </div>

          {/* ── MOBILE: sheet desde abajo ── */}
          {/* Overlay */}
          <div
            className="fixed inset-0 z-[290] bg-black/50 backdrop-blur-sm lg:hidden"
            onClick={() => setAbierto(false)}
          />
          {/* Panel */}
          <div
            className={`fixed bottom-0 left-0 right-0 z-[300] lg:hidden flex flex-col rounded-t-3xl border-t border-x overflow-hidden ${panelBase}`}
            style={{ maxHeight: '82dvh' }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
              <div className={`w-10 h-1 rounded-full ${darkMode ? 'bg-white/20' : 'bg-slate-300'}`} />
            </div>
            {/* Header */}
            <div className={`flex items-center justify-between px-5 pb-3 border-b flex-shrink-0 ${divider}`}>
              <h3 className="font-bold text-base flex items-center gap-2">
                <Bell size={18} className={darkMode ? 'text-[#C9EA63]' : 'text-emerald-600'} />
                Notificaciones
                {notifs.length > 0 && (
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${darkMode ? 'bg-[#C9EA63]/20 text-[#C9EA63]' : 'bg-emerald-100 text-emerald-700'}`}>
                    {notifs.length}
                  </span>
                )}
              </h3>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => fetchNotifs(true)}
                  className={`p-2 rounded-xl ${darkMode ? 'hover:bg-[#253916] text-[#F2F6F0]/50' : 'hover:bg-slate-100 text-slate-400'} ${cargando ? 'animate-spin' : ''}`}
                >
                  <RefreshCw size={16} />
                </button>
                {noLeidas.length > 0 && (
                  <button onClick={marcarTodas} className="text-xs font-bold opacity-60 hover:opacity-100 underline">
                    Marcar todas
                  </button>
                )}
                <button onClick={() => setAbierto(false)} className="opacity-40 hover:opacity-90 p-1">
                  <X size={18} />
                </button>
              </div>
            </div>
            {/* Lista */}
            <div className="overflow-y-auto custom-scrollbar flex-1">
              <Lista />
            </div>
            {/* Footer */}
            {notifs.length > 0 && (
              <div className={`px-5 py-4 border-t flex-shrink-0 ${divider}`}>
                <button
                  onClick={() => { navigate('/equipos'); setAbierto(false); }}
                  className={`w-full py-3.5 rounded-2xl text-sm font-bold ${darkMode ? 'bg-[#C9EA63] text-[#141f0b]' : 'bg-emerald-600 text-white'}`}
                >
                  Ver todos los equipos
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default NotificacionesBell;
