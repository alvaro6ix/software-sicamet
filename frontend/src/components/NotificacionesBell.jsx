import React, { useState, useEffect, useRef } from 'react';
import { Bell, X, AlertTriangle, MessageSquare, RotateCcw, ChevronRight } from 'lucide-react';
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
  const [leidas, setLeidas] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(LEIDAS_KEY) || '[]')); }
    catch { return new Set(); }
  });
  const panelRef = useRef(null);
  const navigate = useNavigate();

  const fetchNotifs = async () => {
    try {
      const res = await axios.get('/api/notificaciones');
      setNotifs(res.data || []);
    } catch { /* silencioso */ }
  };

  useEffect(() => {
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 30000); // cada 30s
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handler = () => fetchNotifs();
    window.addEventListener('crm:refresh', handler);
    return () => window.removeEventListener('crm:refresh', handler);
  }, []);

  // Cerrar al hacer click afuera
  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setAbierto(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const noLeidas = notifs.filter(n => !leidas.has(n.id));

  const marcarLeida = (id) => {
    const nls = new Set([...leidas, id]);
    setLeidas(nls);
    localStorage.setItem(LEIDAS_KEY, JSON.stringify([...nls]));
  };

  const marcarTodas = (e) => {
    e.stopPropagation();
    const nls = new Set([...leidas, ...notifs.map(n => n.id)]);
    setLeidas(nls);
    localStorage.setItem(LEIDAS_KEY, JSON.stringify([...nls]));
  };

  const iconoTipo = (tipo, urgencia) => {
    if (tipo === 'sla') return <AlertTriangle size={15} className={urgencia === 'alta' ? 'text-red-500' : 'text-amber-400'} />;
    if (tipo === 'cotizacion') return <MessageSquare size={15} className="text-sky-400" />;
    if (tipo === 'rechazo') return <RotateCcw size={15} className="text-orange-400" />;
    return <Bell size={15} className="opacity-60" />;
  };

  const bg = darkMode
    ? 'bg-[#141f0b] border-[#C9EA63]/20 text-[#F2F6F0]'
    : 'bg-white border-slate-200 text-slate-800';

  const sectionBorder = darkMode ? 'border-[#C9EA63]/10' : 'border-slate-100';

  return (
    <div className="relative" ref={panelRef}>
      {/* Botón campana */}
      <button
        onClick={() => setAbierto(v => !v)}
        className={`relative p-2 rounded-xl transition-all outline-none ${darkMode ? 'hover:bg-[#253916] text-[#F2F6F0]/60 hover:text-[#C9EA63]' : 'hover:bg-slate-100 text-slate-500 hover:text-slate-700'}`}
        title="Notificaciones"
      >
        <Bell size={20} />
        {noLeidas.length > 0 && (
          <span className={`absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full text-[10px] font-black text-white bg-red-500 border-2 animate-pulse ${darkMode ? 'border-[#141f0b]' : 'border-white'}`}>
            {noLeidas.length > 9 ? '9+' : noLeidas.length}
          </span>
        )}
      </button>

      {/* Panel desplegable */}
      {abierto && (
        <div className={`absolute right-0 top-full mt-2 w-80 rounded-2xl border shadow-2xl z-[300] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 ${bg}`}>
          {/* Header */}
          <div className={`flex items-center justify-between px-4 py-3 border-b ${sectionBorder}`}>
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
              {noLeidas.length > 0 && (
                <button onClick={marcarTodas} className="text-[10px] opacity-50 hover:opacity-100 transition-opacity underline">
                  Marcar todas
                </button>
              )}
              <button onClick={() => setAbierto(false)} className="opacity-40 hover:opacity-90 transition-opacity">
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Lista */}
          <div className="max-h-[420px] overflow-y-auto custom-scrollbar">
            {notifs.length === 0 ? (
              <div className="p-8 text-center">
                <Bell size={28} className="mx-auto mb-3 opacity-20" />
                <p className="text-sm opacity-40">Sin alertas activas</p>
                <p className="text-xs opacity-30 mt-1">¡Todo va bien! 🎉</p>
              </div>
            ) : (
              notifs.map(n => {
                const leida = leidas.has(n.id);
                const esAlta = n.urgencia === 'alta';
                return (
                  <div
                    key={n.id}
                    onClick={() => { marcarLeida(n.id); navigate(n.ruta); setAbierto(false); }}
                    className={`
                      group flex items-start gap-3 px-4 py-3 border-b cursor-pointer transition-all
                      ${sectionBorder}
                      ${leida ? 'opacity-45' : ''}
                      ${!leida && esAlta ? (darkMode ? 'bg-red-950/25' : 'bg-red-50/70') : ''}
                      ${darkMode ? 'hover:bg-[#1b2b10]' : 'hover:bg-slate-50'}
                    `}
                  >
                    <div className="mt-0.5 flex-shrink-0">{iconoTipo(n.tipo, n.urgencia)}</div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-bold leading-snug ${esAlta && !leida ? 'text-red-500' : ''}`}>{n.titulo}</p>
                      <p className="text-[11px] opacity-55 mt-0.5 leading-snug">{n.detalle}</p>
                      <p className="text-[10px] opacity-35 mt-1">{tiempoRelativo(n.ts)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      {!leida && (
                        <span className={`w-2 h-2 rounded-full ${esAlta ? 'bg-red-500' : 'bg-amber-400'}`} />
                      )}
                      <ChevronRight size={12} className="opacity-0 group-hover:opacity-40 transition-opacity" />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          {notifs.length > 0 && (
            <div className={`px-4 py-2.5 border-t text-center ${sectionBorder}`}>
              <button
                onClick={() => { navigate('/equipos'); setAbierto(false); }}
                className={`text-[11px] font-semibold opacity-60 hover:opacity-100 transition-opacity ${darkMode ? 'text-[#C9EA63]' : 'text-emerald-600'}`}
              >
                Ver todos los equipos →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificacionesBell;
