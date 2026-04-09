import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Activity, Users, MessageSquare, Briefcase, Calendar, Clock, ArrowRight } from 'lucide-react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const ESTATUS_COLORS = {
  'Recepción':   { bg: 'bg-slate-100 text-slate-600', bgDark: 'bg-slate-700/50 text-slate-300' },
  'Laboratorio': { bg: 'bg-emerald-100 text-[#008a5e]', bgDark: 'bg-emerald-900/40 text-[#C9EA63]' },
  'Aseguramiento':{ bg: 'bg-blue-100 text-blue-700', bgDark: 'bg-blue-900/40 text-blue-300' },
  'Certificación':{ bg: 'bg-purple-100 text-purple-700', bgDark: 'bg-purple-900/40 text-purple-300' },
  'Listo':       { bg: 'bg-teal-100 text-teal-700', bgDark: 'bg-teal-900/40 text-teal-300' },
  'Entregado':   { bg: 'bg-green-100 text-green-700', bgDark: 'bg-green-900/40 text-green-300' },
};

const ClienteDetalleModal = ({ clienteInfo, darkMode, onClose }) => {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await axios.get(`/api/clientes/${clienteInfo.id}/historial`);
        setDatos(res.data);
      } catch (e) { console.error('Error fetching historial', e); }
      setCargando(false);
    };
    fetchStats();
  }, [clienteInfo]);

  if (!datos && cargando) {
      return (
          <div className="fixed inset-0 z-[400] flex justify-center items-center bg-black/60 backdrop-blur-sm">
            <span className={`w-8 h-8 rounded-full border-4 border-opacity-30 animate-spin ${darkMode ? 'border-[#C9EA63] border-t-[#C9EA63]' : 'border-[#008a5e] border-t-[#008a5e]'}`} />
          </div>
      );
  }
  if (!datos) return null;

  const { cliente, equiposStats, historial } = datos;
  const modalBg = darkMode ? 'bg-[#141f0b] text-[#F2F6F0]' : 'bg-white text-slate-800';
  const cardBg = darkMode ? 'bg-[#1b2b10] border-[#C9EA63]/20' : 'bg-slate-50 border-slate-200';

  return (
    <div className="fixed inset-0 z-[400] flex justify-center items-center bg-black/60 backdrop-blur-sm p-4">
      <div className={`w-full max-w-3xl max-h-[90dvh] flex flex-col rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 ${modalBg}`}>
        {/* Header */}
        <div className={`p-6 border-b flex justify-between items-start flex-shrink-0 ${darkMode ? 'border-[#C9EA63]/20' : 'border-slate-100'}`}>
          <div>
            <h2 className="text-2xl font-black">{cliente.nombre}</h2>
            <div className={`flex flex-wrap gap-4 mt-2 text-sm ${darkMode ? 'text-[#C9EA63]/80' : 'text-slate-500'}`}>
               <span className="flex items-center gap-1.5"><Users size={16}/> {cliente.contacto || 'Sin contacto'}</span>
               <span className="flex items-center gap-1.5"><MessageSquare size={16}/> {cliente.email || 'Sin correo'}</span>
            </div>
          </div>
          <button onClick={onClose} className={`p-2 rounded-xl transition-colors ${darkMode ? 'hover:bg-red-900/30 text-rose-400' : 'hover:bg-red-50 text-rose-500'}`}>
            <X size={24} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar space-y-8">
            {/* Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className={`p-4 rounded-2xl border ${cardBg}`}>
                    <p className="text-xs font-bold uppercase tracking-widest opacity-50 mb-1">Total Equipos</p>
                    <h3 className="text-3xl font-black">{equiposStats.total}</h3>
                </div>
                <div className={`p-4 rounded-2xl border ${cardBg}`}>
                    <p className={`text-xs font-bold uppercase tracking-widest opacity-50 mb-1 ${darkMode ? 'text-[#C9EA63]' : 'text-[#008a5e]'}`}>En Proceso Lab</p>
                    <h3 className={`text-3xl font-black ${darkMode ? 'text-[#C9EA63]' : 'text-[#008a5e]'}`}>{equiposStats.en_laboratorio}</h3>
                </div>
                <div className={`p-4 rounded-2xl border ${cardBg}`}>
                    <p className="text-xs font-bold uppercase tracking-widest opacity-50 mb-1 text-teal-500">Listos / Entregados</p>
                    <h3 className="text-3xl font-black text-teal-500">{equiposStats.listos_entregados}</h3>
                </div>
            </div>

            {/* Historial Timeline */}
            <div>
                <h3 className="text-lg font-black mb-4 flex items-center gap-2">
                    <Clock className={darkMode ? 'text-[#C9EA63]' : 'text-[#008a5e]'} />
                    Historial de Instrumentos
                </h3>
                {historial.length === 0 ? (
                    <p className="text-sm opacity-50 italic">No hay equipos registrados para este cliente.</p>
                ) : (
                    <div className="space-y-4">
                        {historial.map(eq => {
                            const cfg = ESTATUS_COLORS[eq.estatus_actual] || {};
                            return (
                                <div key={eq.id} className={`p-4 rounded-2xl border flex flex-col md:flex-row gap-4 items-start md:items-center justify-between ${cardBg}`}>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${darkMode ? (cfg.bgDark || 'bg-slate-700/50') : (cfg.bg || 'bg-slate-100')}`}>
                                                {eq.estatus_actual}
                                            </span>
                                            <span className="text-xs font-bold opacity-60">OC: {eq.orden_cotizacion || '—'}</span>
                                        </div>
                                        <h4 className="font-bold text-base">{eq.nombre_instrumento}</h4>
                                        <p className="text-sm opacity-60 mt-0.5">{eq.marca} · {eq.modelo} · SN: {eq.no_serie || 'N/A'}</p>
                                    </div>
                                    <div className="text-right text-xs opacity-60">
                                        <p>Ingreso: {new Date(eq.fecha_ingreso).toLocaleDateString()}</p>
                                        <p>SLA Restante: {eq.sla} días</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};

const BusquedaGlobal = ({ darkMode }) => {
  const [query, setQuery] = useState('');
  const [resultados, setResultados] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [clienteSel, setClienteSel] = useState(null); // Modal detalle cliente
  const [movilAbierto, setMovilAbierto] = useState(false); // UI full screen on mobile
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);
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

  // Cerrar al hacer clic afuera (desktop context)
  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setAbierto(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const irA = (ruta, params) => {
    // Attempt rudimentary passing. Better to just route to the global table and the user types again, 
    // unless we had time to rewrite those pages to parse ?q=. 
    // Wait, the easiest way is to push it as state or query.
    navigate(ruta);
    setQuery('');
    setResultados(null);
    setAbierto(false);
    setMovilAbierto(false);
  };

  const handleClienteClick = (cl) => {
      setClienteSel(cl);
      setAbierto(false);
      setMovilAbierto(false);
  };

  const total = resultados
    ? (resultados.equipos?.length || 0) + (resultados.clientes?.length || 0) + (resultados.conversaciones?.length || 0)
    : 0;

  const inputBg = darkMode
    ? 'bg-[#1b2b10] border-[#C9EA63]/20 text-[#F2F6F0] placeholder:text-[#F2F6F0]/30 focus-within:border-[#C9EA63]/50'
    : 'bg-white border-slate-200 text-slate-800 placeholder:text-slate-400 focus-within:border-[#008a5e] shadow-sm';

  const dropBg = darkMode ? 'bg-[#141f0b] border-[#C9EA63]/20' : 'bg-white border-slate-200';
  const sectionBg = darkMode ? 'bg-[#1b2b10] text-[#C9EA63]/60' : 'bg-slate-50 text-slate-400';
  const rowHover = darkMode ? 'hover:bg-[#253916]' : 'hover:bg-slate-50';

  const ContenidoResultados = () => (
    <div className={`flex flex-col h-full overflow-y-auto custom-scrollbar lg:max-h-[70vh] ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>
        {total === 0 && !cargando && (
        <p className="p-8 text-sm opacity-40 text-center italic">Sin resultados para "{query}"</p>
        )}

        {/* Equipos */}
        {resultados?.equipos?.length > 0 && (
        <div>
            <p className={`sticky top-0 z-10 px-4 py-2 text-[10px] font-black uppercase tracking-widest ${sectionBg}`}>
            🔧 Equipos ({resultados.equipos.length})
            </p>
            {resultados.equipos.map(eq => {
            const cfg = ESTATUS_COLORS[eq.estatus_actual] || {};
            return (
                <button
                key={eq.id}
                onMouseDown={() => irA('/equipos')}
                className={`w-full text-left px-4 py-3 flex items-center gap-3 text-sm transition-colors border-b last:border-0 ${darkMode ? 'border-[#C9EA63]/10' : 'border-slate-100'} ${rowHover}`}
                >
                <Activity size={16} className={darkMode ? 'text-[#C9EA63] flex-shrink-0' : 'text-[#008a5e] flex-shrink-0'} />
                <div className="flex-1 min-w-0">
                    <p className="font-bold truncate text-sm">{eq.nombre_instrumento}</p>
                    <p className="text-[11px] opacity-60 truncate mt-0.5">{eq.orden_cotizacion} · {eq.empresa}</p>
                </div>
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${darkMode ? (cfg.bgDark || 'bg-slate-700 text-slate-300') : (cfg.bg || 'bg-slate-100 text-slate-600')}`}>
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
            <p className={`sticky top-0 z-10 px-4 py-2 text-[10px] font-black uppercase tracking-widest ${sectionBg}`}>
            🏢 Clientes ({resultados.clientes.length})
            </p>
            {resultados.clientes.map(cl => (
            <button
                key={cl.id}
                onMouseDown={() => handleClienteClick(cl)}
                className={`w-full text-left px-4 py-3 flex items-center justify-between gap-3 text-sm transition-colors border-b last:border-0 ${darkMode ? 'border-[#C9EA63]/10' : 'border-slate-100'} ${rowHover}`}
            >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                    <Users size={16} className={darkMode ? 'text-[#C9EA63] flex-shrink-0' : 'text-[#008a5e] flex-shrink-0'} />
                    <div className="flex-1 min-w-0">
                    <p className="font-bold truncate text-sm">{cl.nombre}</p>
                    <p className="text-[11px] opacity-60 truncate mt-0.5">{cl.contacto || 'Sin contacto'}</p>
                    </div>
                </div>
                <ArrowRight size={14} className="opacity-40" />
            </button>
            ))}
        </div>
        )}

        {/* Conversaciones */}
        {resultados?.conversaciones?.length > 0 && (
        <div>
            <p className={`sticky top-0 z-10 px-4 py-2 text-[10px] font-black uppercase tracking-widest ${sectionBg}`}>
            💬 Conversaciones ({resultados.conversaciones.length})
            </p>
            {resultados.conversaciones.map(c => (
            <button
                key={c.id || c.numero_wa}
                onMouseDown={() => irA('/conversaciones')}
                className={`w-full text-left px-4 py-3 flex items-center justify-between gap-3 text-sm transition-colors border-b last:border-0 ${darkMode ? 'border-[#C9EA63]/10' : 'border-slate-100'} ${rowHover}`}
            >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                    <MessageSquare size={16} className={darkMode ? 'text-[#C9EA63] flex-shrink-0' : 'text-emerald-600 flex-shrink-0'} />
                    <div className="flex-1 min-w-0">
                    <p className="font-bold truncate text-sm">{c.nombre_contacto || 'Desconocido'}</p>
                    <p className="text-[11px] opacity-60 truncate mt-0.5">{c.numero_wa}</p>
                    </div>
                </div>
            </button>
            ))}
        </div>
        )}
    </div>
  );

  return (
    <>
      {clienteSel && (
          <ClienteDetalleModal clienteInfo={clienteSel} darkMode={darkMode} onClose={() => setClienteSel(null)} />
      )}

      {/* Desktop Search Wrapper */}
      <div ref={wrapperRef} className="hidden lg:block relative w-64 xl:w-96">
        <div className={`flex items-center gap-2 px-3 py-2.5 border rounded-2xl transition-all ${inputBg}`}>
          {cargando
            ? <span className="w-4 h-4 rounded-full border-2 border-current/30 border-t-current animate-spin flex-shrink-0 opacity-60" />
            : <Search size={16} className="opacity-40 flex-shrink-0" />
          }
          <input
            type="text"
            placeholder="Buscar equipos, clientes, OC..."
            value={query}
            onChange={e => { setQuery(e.target.value); setAbierto(true); }}
            onFocus={() => setAbierto(true)}
            className="bg-transparent outline-none text-sm w-full min-w-0 font-medium"
          />
          {query && (
            <button onClick={() => { setQuery(''); setResultados(null); }} className="opacity-40 hover:opacity-100 transition-opacity p-0.5 rounded-full hover:bg-black/10">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Dropdown Desktop */}
        {abierto && query.length >= 1 && (
          <div className={`absolute top-full left-0 right-0 mt-2 rounded-3xl border shadow-2xl z-[300] overflow-hidden ${dropBg}`}>
            <ContenidoResultados />
          </div>
        )}
      </div>

      {/* Mobile Search Button (Activator) */}
      <button 
        className="lg:hidden p-2 rounded-xl text-[#008a5e] dark:text-[#C9EA63]"
        onClick={() => { setMovilAbierto(true); setTimeout(() => inputRef.current?.focus(), 100); }}
      >
          <Search size={22} />
      </button>

      {/* Mobile Search Full Screen UI */}
      {movilAbierto && (
          <div className={`fixed inset-0 z-[500] flex flex-col ${dropBg}`}>
              {/* Mobile Header (Input Focus) */}
              <div className={`px-4 py-3 border-b flex items-center gap-3 ${darkMode ? 'border-[#C9EA63]/20' : 'border-slate-200'}`}>
                  <button onClick={() => { setMovilAbierto(false); setQuery(''); }} className="p-1 opacity-50 hover:opacity-100">
                      <ArrowRight size={22} className="rotate-180" />
                  </button>
                  <div className={`flex-1 flex items-center gap-2 px-3 py-2 border rounded-full ${inputBg}`}>
                      <Search size={16} className="opacity-40 flex-shrink-0" />
                      <input
                        ref={inputRef}
                        type="text"
                        placeholder="Buscar global..."
                        value={query}
                        onChange={e => { setQuery(e.target.value); }}
                        className="bg-transparent outline-none text-sm font-bold w-full min-w-0"
                      />
                      {cargando && <span className="w-4 h-4 rounded-full border-2 border-current/30 border-t-current animate-spin opacity-60" />}
                  </div>
              </div>

              {/* Mobile Results */}
              <div className="flex-1 overflow-hidden">
                  {query.length >= 1 ? (
                      <ContenidoResultados />
                  ) : (
                      <div className="p-12 text-center opacity-40">
                          <Search size={48} className="mx-auto mb-4 opacity-50" />
                          <p className="text-sm font-bold">Empieza a escribir</p>
                          <p className="text-xs mt-1">Busca por cliente, empresa, folio C26, teléfono...</p>
                      </div>
                  )}
              </div>
          </div>
      )}
    </>
  );
};

export default BusquedaGlobal;
