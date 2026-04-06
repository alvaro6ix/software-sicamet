import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Activity, Users, MessageSquare } from 'lucide-react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const ESTATUS_COLORS = {
  'Recepción':   { bg: 'bg-slate-100 text-slate-600', bgDark: 'bg-slate-700/50 text-slate-300' },
  'Laboratorio': { bg: 'bg-emerald-100 text-emerald-700', bgDark: 'bg-emerald-900/40 text-emerald-300' },
  'Aseguramiento':{ bg: 'bg-blue-100 text-blue-700', bgDark: 'bg-blue-900/40 text-blue-300' },
  'Certificación':{ bg: 'bg-purple-100 text-purple-700', bgDark: 'bg-purple-900/40 text-purple-300' },
  'Listo':       { bg: 'bg-teal-100 text-teal-700', bgDark: 'bg-teal-900/40 text-teal-300' },
  'Entregado':   { bg: 'bg-green-100 text-green-700', bgDark: 'bg-green-900/40 text-green-300' },
};

const BusquedaGlobal = ({ darkMode }) => {
  const [query, setQuery] = useState('');
  const [resultados, setResultados] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const wrapperRef = useRef(null);
  const navigate = useNavigate();

  const buscar = useCallback(async (q) => {
    if (q.length < 1) { setResultados(null); return; }
    setCargando(true);
    try {
      const res = await axios.get(`/api/busqueda-global?q=${encodeURIComponent(q)}`);
      setResultados(res.data);
    } catch { setResultados(null); }
    setCargando(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => buscar(query), 300);
    return () => clearTimeout(timer);
  }, [query, buscar]);

  // Cerrar al hacer clic afuera
  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setAbierto(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const irA = (ruta) => {
    navigate(ruta);
    setQuery('');
    setResultados(null);
    setAbierto(false);
  };

  const total = resultados
    ? (resultados.equipos?.length || 0) + (resultados.clientes?.length || 0) + (resultados.conversaciones?.length || 0)
    : 0;

  const inputBg = darkMode
    ? 'bg-[#1b2b10] border-[#C9EA63]/20 text-[#F2F6F0] placeholder:text-[#F2F6F0]/30 focus-within:border-[#C9EA63]/50'
    : 'bg-white border-slate-200 text-slate-800 placeholder:text-slate-400 focus-within:border-emerald-400 shadow-sm';

  const dropBg = darkMode ? 'bg-[#141f0b] border-[#C9EA63]/20' : 'bg-white border-slate-200';
  const sectionBg = darkMode ? 'bg-[#1b2b10] text-[#C9EA63]/60' : 'bg-slate-50 text-slate-400';
  const rowHover = darkMode ? 'hover:bg-[#253916]' : 'hover:bg-slate-50';

  return (
    <div ref={wrapperRef} className="relative w-64 xl:w-80">
      <div className={`flex items-center gap-2 px-3 py-2 border rounded-xl transition-all ${inputBg}`}>
        {cargando
          ? <span className="w-4 h-4 rounded-full border-2 border-current/30 border-t-current animate-spin flex-shrink-0 opacity-60" />
          : <Search size={15} className="opacity-40 flex-shrink-0" />
        }
        <input
          type="text"
          placeholder="Buscar equipos, clientes, OC..."
          value={query}
          onChange={e => { setQuery(e.target.value); setAbierto(true); }}
          onFocus={() => setAbierto(true)}
          className="bg-transparent outline-none text-sm w-full min-w-0"
        />
        {query && (
          <button onClick={() => { setQuery(''); setResultados(null); }} className="opacity-40 hover:opacity-100 transition-opacity flex-shrink-0">
            <X size={13} />
          </button>
        )}
      </div>

      {abierto && query.length >= 1 && (
        <div className={`absolute top-full left-0 right-0 mt-1.5 rounded-2xl border shadow-2xl z-[300] overflow-hidden ${dropBg}`}>
          {total === 0 && !cargando && (
            <p className="p-5 text-sm opacity-40 text-center italic">Sin resultados para "{query}"</p>
          )}

          {/* Equipos */}
          {resultados?.equipos?.length > 0 && (
            <div>
              <p className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest ${sectionBg}`}>
                🔧 Equipos ({resultados.equipos.length})
              </p>
              {resultados.equipos.map(eq => {
                const cfg = ESTATUS_COLORS[eq.estatus_actual] || {};
                return (
                  <button
                    key={eq.id}
                    onMouseDown={() => irA('/equipos')}
                    className={`w-full text-left px-3 py-2.5 flex items-center gap-3 text-sm transition-colors ${rowHover}`}
                  >
                    <Activity size={14} className={darkMode ? 'text-[#C9EA63] flex-shrink-0' : 'text-emerald-600 flex-shrink-0'} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate text-xs">{eq.nombre_instrumento}</p>
                      <p className="text-[11px] opacity-50 truncate">{eq.orden_cotizacion} · {eq.empresa}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${darkMode ? (cfg.bgDark || 'bg-slate-700 text-slate-300') : (cfg.bg || 'bg-slate-100 text-slate-600')}`}>
                      {eq.estatus_actual}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Clientes */}
          {resultados?.clientes?.length > 0 && (
            <div>
              <p className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest ${sectionBg}`}>
                🏢 Clientes ({resultados.clientes.length})
              </p>
              {resultados.clientes.map(cl => (
                <button
                  key={cl.id}
                  onMouseDown={() => irA('/clientes')}
                  className={`w-full text-left px-3 py-2.5 flex items-center gap-3 text-sm transition-colors ${rowHover}`}
                >
                  <Users size={14} className={darkMode ? 'text-[#C9EA63] flex-shrink-0' : 'text-emerald-600 flex-shrink-0'} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate text-xs">{cl.nombre}</p>
                    <p className="text-[11px] opacity-50 truncate">{cl.contacto || 'Sin contacto'}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Conversaciones */}
          {resultados?.conversaciones?.length > 0 && (
            <div>
              <p className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest ${sectionBg}`}>
                💬 Conversaciones ({resultados.conversaciones.length})
              </p>
              {resultados.conversaciones.map(c => (
                <button
                  key={c.id}
                  onMouseDown={() => irA('/conversaciones')}
                  className={`w-full text-left px-3 py-2.5 flex items-center gap-3 text-sm transition-colors ${rowHover}`}
                >
                  <MessageSquare size={14} className={darkMode ? 'text-[#C9EA63] flex-shrink-0' : 'text-emerald-600 flex-shrink-0'} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate text-xs">{c.nombre_contacto || 'Desconocido'}</p>
                    <p className="text-[11px] opacity-50 truncate">{c.numero_wa}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {total > 0 && (
            <div className={`px-3 py-2 text-center ${sectionBg}`}>
              <p className="text-[10px] opacity-60">Haz clic en un resultado para navegar al módulo</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BusquedaGlobal;
