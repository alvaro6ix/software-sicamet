import React, { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { Activity, CheckCircle, Clock, AlertTriangle, Eye, Edit, Trash2, X, FileText, Save, Search, Zap } from 'lucide-react';

const ListaEquipos = ({ darkMode }) => {
  const [equipos, setEquipos] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  
  // Estados para el Modal de VER
  const [equipoSeleccionado, setEquipoSeleccionado] = useState(null);
  const [modalAbierto, setModalAbierto] = useState(false);

  // Estados para el Modal de EDITAR
  const [equipoEditando, setEquipoEditando] = useState(null);
  const [modalEditarAbierto, setModalEditarAbierto] = useState(false);

  // Popover de vista rápida
  const [popover, setPopover] = useState(null); // { eq, x, y }
  const hoverTimer = useRef(null);

  const cargarEquipos = async () => {
    try {
      const res = await axios.get('/api/instrumentos');
      setEquipos(res.data);
    } catch (err) {
      console.error("Error al cargar equipos:", err);
    }
  };

  useEffect(() => {
    cargarEquipos();
    window.addEventListener('crm:refresh', cargarEquipos);
    return () => window.removeEventListener('crm:refresh', cargarEquipos);
  }, []);

  const cambiarEstatus = async (id, nuevoEstatus) => {
    try {
      await axios.put(`/api/instrumentos/${id}/estatus`, { estatus: nuevoEstatus });
      cargarEquipos();
    } catch (err) {
      alert("Error al actualizar estatus");
    }
  };

  const eliminarEquipo = async (id) => {
    if(window.confirm("¿Estás seguro de que deseas eliminar este registro?")) {
      try {
        await axios.delete(`/api/instrumentos/${id}`);
        cargarEquipos();
      } catch (err) {
        alert("Error al eliminar");
      }
    }
  };

  // Funciones Modal VER
  const abrirModalVer = (equipo) => {
    setEquipoSeleccionado(equipo);
    setModalAbierto(true);
  };
  const cerrarModalVer = () => {
    setModalAbierto(false);
    setEquipoSeleccionado(null);
  };

  // Funciones Modal EDITAR
  const abrirModalEditar = (equipo) => {
    setEquipoEditando({ ...equipo }); // Hacemos una copia para editar sin afectar la tabla original
    setModalEditarAbierto(true);
  };
  const cerrarModalEditar = () => {
    setModalEditarAbierto(false);
    setEquipoEditando(null);
  };

  // Función para GUARDAR los cambios de edición
  const guardarEdicion = async (e) => {
    e.preventDefault();
    try {
      await axios.put(`/api/instrumentos/${equipoEditando.id}`, equipoEditando);
      alert("✅ Equipo actualizado correctamente");
      cerrarModalEditar();
      cargarEquipos(); // Recargamos la tabla
    } catch (err) {
      alert("Error al guardar los cambios: " + err.message);
    }
  };

  const ESTATUS_BADGE = {
    'Recepción':    { light: 'bg-slate-100 text-slate-600',    dark: 'bg-slate-700/60 text-slate-300',    icon: <Clock size={13} /> },
    'Laboratorio':   { light: 'bg-emerald-100 text-emerald-700', dark: 'bg-emerald-900/50 text-emerald-300', icon: <Activity size={13} /> },
    'Aseguramiento': { light: 'bg-blue-100 text-blue-700',       dark: 'bg-blue-900/40 text-blue-300',       icon: <AlertTriangle size={13} /> },
    'Certificación': { light: 'bg-purple-100 text-purple-700',   dark: 'bg-purple-900/40 text-purple-300',   icon: <AlertTriangle size={13} /> },
    'Listo':         { light: 'bg-teal-100 text-teal-700',       dark: 'bg-teal-900/40 text-teal-300',       icon: <CheckCircle size={13} /> },
    'Entregado':     { light: 'bg-green-100 text-green-700',     dark: 'bg-green-900/40 text-green-300',     icon: <CheckCircle size={13} /> },
  };

  // Manejadores para el popover
  const mostrarPopover = useCallback((eq, e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(rect.right + 8, window.innerWidth - 300);
    const y = Math.max(rect.top, 8);
    hoverTimer.current = setTimeout(() => {
      setPopover({ eq, x, y });
    }, 400);
  }, []);

  const ocultarPopover = useCallback(() => {
    clearTimeout(hoverTimer.current);
    setPopover(null);
  }, []);

  const estatusConfig = {
    'Recepción': { color: 'bg-gray-100 text-gray-700', icon: <Clock size={14} /> },
    'Laboratorio': { color: 'bg-emerald-100 text-emerald-700', icon: <Activity size={14} /> },
    'Certificación': { color: 'bg-purple-100 text-purple-700', icon: <AlertTriangle size={14} /> },
    'Listo': { color: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle size={14} /> },
    'Entregado': { color: 'bg-green-100 text-green-700', icon: <CheckCircle size={14} /> }
  };

  const getOsaColor = (osStr, isDark) => {
    if (!osStr) return isDark ? '#141f0b' : '#fff';
    let hash = 0;
    for (let i = 0; i < osStr.length; i++) {
        hash = osStr.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return isDark ? `hsl(${hue}, 40%, 20%)` : `hsl(${hue}, 70%, 95%)`;
  };

  const equiposFiltrados = equipos.filter(eq => 
    eq.folio_rastreo?.toLowerCase().includes(busqueda.toLowerCase()) ||
    eq.orden_cotizacion?.toLowerCase().includes(busqueda.toLowerCase()) ||
    eq.nombre_instrumento?.toLowerCase().includes(busqueda.toLowerCase()) ||
    eq.marca?.toLowerCase().includes(busqueda.toLowerCase()) ||
    eq.no_serie?.toLowerCase().includes(busqueda.toLowerCase()) ||
    eq.empresa?.toLowerCase().includes(busqueda.toLowerCase()) ||
    eq.cliente?.toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <>
    <div className={`w-full mt-8 p-6 rounded-2xl shadow-xl border relative transition-colors ${darkMode ? 'bg-[#141f0b] border-[#C9EA63]/20' : 'bg-white border-gray-100'}`}>
      <div className="flex justify-between items-center mb-6">
        <h2 className={`text-xl font-bold ${darkMode ? 'text-[#C9EA63]' : 'text-slate-800'}`}>Panel de Trazabilidad (Órdenes de Servicio)</h2>
        <span className={`text-sm ${darkMode ? 'text-[#F2F6F0]/70' : 'text-slate-500'}`}>Total: {equipos.length} equipos</span>
      </div>

      <div className={`mb-6 flex items-center gap-2 w-full max-w-md px-4 py-2 border rounded-xl ${darkMode ? 'bg-[#2a401c] border-[#C9EA63]/20 text-[#F2F6F0]' : 'bg-slate-50 border-gray-200 text-slate-800'}`}>
        <Search size={18} className={darkMode ? 'text-[#F2F6F0]/50' : 'text-slate-400'} />
        <input
          type="text"
          placeholder="Buscar por O.S, serie, instrumento o cliente..."
          className="bg-transparent border-none outline-none w-full text-sm"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className={`text-sm border-b ${darkMode ? 'bg-[#2a401c] text-[#F2F6F0] border-[#C9EA63]/20' : 'bg-slate-50 text-slate-600 border-gray-200'}`}>
              <th className="p-4 font-semibold">O.S. / Folio</th>
              <th className="p-4 font-semibold">Instrumento / Marca</th>
              <th className="p-4 font-semibold">Cliente</th>
              <th className="p-4 font-semibold">Estatus Actual</th>
              <th className="p-4 font-semibold text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {equiposFiltrados.length === 0 ? (
              <tr>
                <td colSpan="5" className={`p-6 text-center ${darkMode ? 'text-[#F2F6F0]/50' : 'text-gray-500'}`}>
                    {equipos.length === 0 ? 'No hay equipos registrados aún.' : 'No hay resultados para la búsqueda.'}
                </td>
              </tr>
            ) : (
              equiposFiltrados.map((eq) => (
                <tr
                  key={eq.id}
                  style={{ backgroundColor: getOsaColor(eq.orden_cotizacion || eq.folio_rastreo, darkMode) }}
                  className={`border-b transition-colors ${darkMode ? 'border-[#C9EA63]/10 hover:brightness-125' : 'border-gray-100 hover:brightness-95'}`}
                  onMouseEnter={e => mostrarPopover(eq, e)}
                  onMouseLeave={ocultarPopover}
                >
                  <td className={`p-4 font-mono text-sm font-bold ${darkMode ? 'text-[#65d067]' : 'text-emerald-600'}`}>{eq.folio_rastreo || eq.orden_cotizacion}</td>
                  <td className="p-4">
                    <p className={`font-semibold ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>{eq.nombre_instrumento}</p>
                    <p className={`text-xs ${darkMode ? 'text-[#F2F6F0]/60' : 'text-slate-500'}`}>S/N: {eq.no_serie} • {eq.marca}</p>
                  </td>
                  <td className={`p-4 text-sm ${darkMode ? 'text-[#F2F6F0]/80' : 'text-slate-700'}`}>{eq.empresa || eq.cliente}</td>
                  
                  <td className="p-4">
                    <select 
                      value={eq.estatus_actual}
                      onChange={(e) => cambiarEstatus(eq.id, e.target.value)}
                      className={`text-sm rounded-full px-3 py-1 font-bold outline-none cursor-pointer appearance-none text-center ${estatusConfig[eq.estatus_actual]?.color || 'bg-gray-100 text-gray-700'}`}
                    >
                      <option value="Recepción">Recepción</option>
                      <option value="Laboratorio">Laboratorio</option>
                      <option value="Certificación">Certificación</option>
                      <option value="Listo">Listo</option>
                      <option value="Entregado">Entregado</option>
                    </select>
                  </td>

                  <td className="p-4 flex justify-center gap-3">
                    <button onClick={() => abrirModalVer(eq)} className={`transition-colors ${darkMode ? 'text-gray-400 hover:text-[#C9EA63]' : 'text-gray-400 hover:text-emerald-600'}`} title="Ver Expediente">
                      <Eye size={18} />
                    </button>
                    {/* AQUI CONECTAMOS EL BOTON EDITAR */}
                    <button onClick={() => abrirModalEditar(eq)} className={`transition-colors ${darkMode ? 'text-gray-400 hover:text-yellow-400' : 'text-gray-400 hover:text-yellow-500'}`} title="Editar">
                      <Edit size={18} />
                    </button>
                    <button onClick={() => eliminarEquipo(eq.id)} className={`transition-colors ${darkMode ? 'text-gray-400 hover:text-red-400' : 'text-gray-400 hover:text-red-600'}`} title="Eliminar">
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* --- MODAL 1: VER EXPEDIENTE --- */}
      {modalAbierto && equipoSeleccionado && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-[100]">
          <div className={`w-full max-w-lg max-h-[95vh] rounded-2xl shadow-2xl relative border-t-4 flex flex-col overflow-hidden transition-all ${darkMode ? 'bg-[#141f0b] border-[#C9EA63]' : 'bg-white border-emerald-600'}`}>
            <div className={`p-4 sm:p-8 flex-1 overflow-y-auto custom-scrollbar`}>
              <button onClick={cerrarModalVer} className={`absolute top-4 right-4 z-10 ${darkMode ? 'text-gray-400 hover:text-[#C9EA63]' : 'text-gray-400 hover:text-gray-800'}`}>
                <X size={24} />
              </button>
              <h2 className={`text-xl sm:text-2xl font-bold mb-6 flex items-center gap-2 ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>
                <FileText className={darkMode ? 'text-[#C9EA63]' : 'text-emerald-600'} /> Expediente del Equipo
              </h2>
              <div className="space-y-4">
                <div className={`p-4 rounded-lg ${darkMode ? 'bg-[#2a401c]' : 'bg-slate-50'}`}>
                  <p className={`text-xs sm:text-sm uppercase font-bold ${darkMode ? 'text-[#C9EA63]' : 'text-gray-500'}`}>Orden de Servicio / Ref.</p>
                  <p className={`text-lg sm:text-xl font-mono font-bold ${darkMode ? 'text-[#F2F6F0]' : 'text-emerald-700'}`}>{equipoSeleccionado.folio_rastreo || equipoSeleccionado.orden_cotizacion}</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><p className={`text-sm font-semibold ${darkMode ? 'text-[#F2F6F0]/60' : 'text-gray-500'}`}>Instrumento</p><p className={`font-medium sm:text-base text-sm ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>{equipoSeleccionado.nombre_instrumento}</p></div>
                  <div><p className={`text-sm font-semibold ${darkMode ? 'text-[#F2F6F0]/60' : 'text-gray-500'}`}>Marca</p><p className={`font-medium sm:text-base text-sm ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>{equipoSeleccionado.marca}</p></div>
                  <div><p className={`text-sm font-semibold ${darkMode ? 'text-[#F2F6F0]/60' : 'text-gray-500'}`}>No. de Serie</p><p className={`font-medium sm:text-base text-sm ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>{equipoSeleccionado.no_serie}</p></div>
                  <div><p className={`text-sm font-semibold ${darkMode ? 'text-[#F2F6F0]/60' : 'text-gray-500'}`}>Cliente / Empresa</p><p className={`font-medium sm:text-base text-sm ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>{equipoSeleccionado.empresa || equipoSeleccionado.cliente}</p></div>
                  <div className="col-span-1 sm:col-span-2"><p className={`text-sm font-semibold ${darkMode ? 'text-[#F2F6F0]/60' : 'text-gray-500'}`}>Contacto</p><p className={`font-medium sm:text-base text-sm ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>{equipoSeleccionado.persona || 'N/A'}</p></div>
                  <div><p className={`text-sm font-semibold ${darkMode ? 'text-[#F2F6F0]/60' : 'text-gray-500'}`}>Identificación</p><p className={`font-medium sm:text-base text-sm ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>{equipoSeleccionado.identificacion}</p></div>
                  <div><p className={`text-sm font-semibold ${darkMode ? 'text-[#F2F6F0]/60' : 'text-gray-500'}`}>Ubicación</p><p className={`font-medium sm:text-base text-sm ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>{equipoSeleccionado.ubicacion}</p></div>
                  <div><p className={`text-sm font-semibold ${darkMode ? 'text-[#F2F6F0]/60' : 'text-gray-500'}`}>SLA</p><p className={`font-bold sm:text-base text-sm ${darkMode ? 'text-[#C9EA63]' : 'text-emerald-700'}`}>{equipoSeleccionado.sla} días</p></div>
                </div>
                <div className="space-y-4">
                  <div className={`p-4 rounded-lg border ${darkMode ? 'bg-[#141f0b] border-[#C9EA63]/20' : 'bg-slate-50 border-gray-100'}`}>
                    <p className={`text-xs font-bold uppercase mb-1 ${darkMode ? 'text-[#C9EA63]' : 'text-gray-500'}`}>Requerimientos Especiales</p>
                    <p className={`text-sm ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-700'}`}>{equipoSeleccionado.requerimientos_especiales}</p>
                  </div>
                  <div className={`p-4 rounded-lg border ${darkMode ? 'bg-[#141f0b] border-[#C9EA63]/20' : 'bg-slate-50 border-gray-100'}`}>
                    <p className={`text-xs font-bold uppercase mb-1 ${darkMode ? 'text-[#C9EA63]' : 'text-gray-500'}`}>Puntos a Calibrar</p>
                    <p className={`text-sm ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-700'}`}>{equipoSeleccionado.puntos_calibrar}</p>
                  </div>
                  <div className={`p-4 rounded-lg border ${darkMode ? 'bg-[#141f0b] border-[#C9EA63]/20' : 'bg-slate-50 border-gray-100'}`}>
                    <p className={`text-xs font-bold uppercase mb-1 ${darkMode ? 'text-[#C9EA63]' : 'text-gray-500'}`}>Tipo de Servicio</p>
                    <p className={`text-sm italic ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-700'}`}>{equipoSeleccionado.tipo_servicio}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL 2: EDITAR EQUIPO --- */}
      {modalEditarAbierto && equipoEditando && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-[100] p-4">
          <div className={`w-full max-w-lg max-h-[95vh] rounded-2xl shadow-2xl relative border-t-4 flex flex-col overflow-hidden transition-all ${darkMode ? 'bg-[#141f0b] border-yellow-400' : 'bg-white border-yellow-500'}`}>
            <div className="p-4 sm:p-8 overflow-y-auto custom-scrollbar">
              <button onClick={cerrarModalEditar} className={`absolute top-4 right-4 z-10 ${darkMode ? 'text-gray-400 hover:text-yellow-400' : 'text-gray-400 hover:text-gray-800'}`}>
                <X size={24} />
              </button>
              <h2 className={`text-xl sm:text-2xl font-bold mb-6 flex items-center gap-2 ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>
                <Edit className={darkMode ? 'text-yellow-400' : 'text-yellow-500'} /> Editar Registro
              </h2>
              
              <form onSubmit={guardarEdicion} className="space-y-4">
                <div>
                  <label className={`block text-xs sm:text-sm font-semibold mb-1 ${darkMode ? 'text-[#F2F6F0]/80' : 'text-gray-600'}`}>Orden de Servicio</label>
                  <input 
                    type="text" 
                    value={equipoEditando.orden_cotizacion || equipoEditando.folio_rastreo} 
                    onChange={(e) => setEquipoEditando({...equipoEditando, orden_cotizacion: e.target.value.toUpperCase()})}
                    className={`w-full p-2 border rounded focus:ring-2 focus:ring-yellow-500 outline-none font-mono text-sm ${darkMode ? 'bg-[#2a401c] border-[#C9EA63]/20 text-[#F2F6F0]' : 'border-gray-300 text-slate-800'}`}
                    required
                  />
                </div>
                <div>
                  <label className={`block text-xs sm:text-sm font-semibold mb-1 ${darkMode ? 'text-[#F2F6F0]/80' : 'text-gray-600'}`}>Instrumento</label>
                  <input 
                    type="text" 
                    value={equipoEditando.nombre_instrumento} 
                    onChange={(e) => setEquipoEditando({...equipoEditando, nombre_instrumento: e.target.value})}
                    className={`w-full p-2 border rounded focus:ring-2 focus:ring-yellow-500 outline-none text-sm ${darkMode ? 'bg-[#2a401c] border-[#C9EA63]/20 text-[#F2F6F0]' : 'border-gray-300 text-slate-800'}`}
                    required
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-xs sm:text-sm font-semibold mb-1 ${darkMode ? 'text-[#F2F6F0]/80' : 'text-gray-600'}`}>Marca</label>
                    <input 
                      type="text" 
                      value={equipoEditando.marca} 
                      onChange={(e) => setEquipoEditando({...equipoEditando, marca: e.target.value})}
                      className={`w-full p-2 border rounded focus:ring-2 focus:ring-yellow-500 outline-none text-sm ${darkMode ? 'bg-[#2a401c] border-[#C9EA63]/20 text-[#F2F6F0]' : 'border-gray-300 text-slate-800'}`}
                      required
                    />
                  </div>
                  <div>
                    <label className={`block text-xs sm:text-sm font-semibold mb-1 ${darkMode ? 'text-[#F2F6F0]/80' : 'text-gray-600'}`}>No. Serie</label>
                    <input 
                      type="text" 
                      value={equipoEditando.no_serie} 
                      onChange={(e) => setEquipoEditando({...equipoEditando, no_serie: e.target.value})}
                      className={`w-full p-2 border rounded focus:ring-2 focus:ring-yellow-500 outline-none text-sm ${darkMode ? 'bg-[#2a401c] border-[#C9EA63]/20 text-[#F2F6F0]' : 'border-gray-300 text-slate-800'}`}
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className={`block text-xs sm:text-sm font-semibold mb-1 ${darkMode ? 'text-[#F2F6F0]/80' : 'text-gray-600'}`}>Empresa</label>
                  <input 
                    type="text" 
                    value={equipoEditando.empresa} 
                    onChange={(e) => setEquipoEditando({...equipoEditando, empresa: e.target.value})}
                    className={`w-full p-2 border rounded focus:ring-2 focus:ring-yellow-500 outline-none text-sm ${darkMode ? 'bg-[#2a401c] border-[#C9EA63]/20 text-[#F2F6F0]' : 'border-gray-300 text-slate-800'}`}
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-xs sm:text-sm font-semibold mb-1 ${darkMode ? 'text-[#F2F6F0]/80' : 'text-gray-600'}`}>Identificación</label>
                    <input 
                      type="text" 
                      value={equipoEditando.identificacion} 
                      onChange={(e) => setEquipoEditando({...equipoEditando, identificacion: e.target.value})}
                      className={`w-full p-2 border rounded focus:ring-2 focus:ring-yellow-500 outline-none text-sm ${darkMode ? 'bg-[#2a401c] border-[#C9EA63]/20 text-[#F2F6F0]' : 'border-gray-300 text-slate-800'}`}
                    />
                  </div>
                  <div>
                    <label className={`block text-xs sm:text-sm font-semibold mb-1 ${darkMode ? 'text-[#F2F6F0]/80' : 'text-gray-600'}`}>Ubicación</label>
                    <input 
                      type="text" 
                      value={equipoEditando.ubicacion} 
                      onChange={(e) => setEquipoEditando({...equipoEditando, ubicacion: e.target.value})}
                      className={`w-full p-2 border rounded focus:ring-2 focus:ring-yellow-500 outline-none text-sm ${darkMode ? 'bg-[#2a401c] border-[#C9EA63]/20 text-[#F2F6F0]' : 'border-gray-300 text-slate-800'}`}
                    />
                  </div>
                </div>

                <div>
                  <label className={`block text-xs sm:text-sm font-semibold mb-1 ${darkMode ? 'text-[#F2F6F0]/80' : 'text-gray-600'}`}>Requerimientos Especiales</label>
                  <textarea 
                    value={equipoEditando.requerimientos_especiales} 
                    onChange={(e) => setEquipoEditando({...equipoEditando, requerimientos_especiales: e.target.value})}
                    className={`w-full p-2 border rounded focus:ring-2 focus:ring-yellow-500 outline-none text-sm ${darkMode ? 'bg-[#2a401c] border-[#C9EA63]/20 text-[#F2F6F0]' : 'border-gray-300 text-slate-800'}`}
                    rows="2"
                  />
                </div>

                <div>
                  <label className={`block text-xs sm:text-sm font-semibold mb-1 ${darkMode ? 'text-[#F2F6F0]/80' : 'text-gray-600'}`}>Puntos a Calibrar</label>
                  <textarea 
                    value={equipoEditando.puntos_calibrar} 
                    onChange={(e) => setEquipoEditando({...equipoEditando, puntos_calibrar: e.target.value})}
                    className={`w-full p-2 border rounded focus:ring-2 focus:ring-yellow-500 outline-none text-sm ${darkMode ? 'bg-[#2a401c] border-[#C9EA63]/20 text-[#F2F6F0]' : 'border-gray-300 text-slate-800'}`}
                    rows="2"
                  />
                </div>

                <button type="submit" className={`w-full mt-4 font-bold py-3 px-4 rounded-lg flex justify-center items-center gap-2 transition-colors shadow-lg ${darkMode ? 'bg-yellow-500 hover:bg-yellow-400 text-[#141f0b]' : 'bg-yellow-500 hover:bg-yellow-600 text-white'}`}>
                  <Save size={20} /> Guardar Cambios
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

    </div>

      {/* Popover vista rápida — portal fuera del overflow */}
      {popover && createPortal(
        <div
          className={`fixed z-[500] w-72 rounded-2xl shadow-2xl border pointer-events-none animate-in fade-in zoom-in-95 duration-150 ${darkMode ? 'bg-[#141f0b] border-[#C9EA63]/30 text-[#F2F6F0]' : 'bg-white border-slate-200 text-slate-800'}`}
          style={{ top: popover.y, left: popover.x }}
        >
          <div className={`px-4 py-3 border-b flex items-center gap-2 ${darkMode ? 'border-[#C9EA63]/10' : 'border-slate-100'}`}>
            <Zap size={14} className={darkMode ? 'text-[#C9EA63]' : 'text-emerald-600'} />
            <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Vista Rápida</span>
          </div>
          <div className="p-4 space-y-3">
            <div>
              <p className="text-[10px] uppercase font-bold opacity-50 mb-0.5">Instrumento</p>
              <p className="text-sm font-bold leading-snug">{popover.eq.nombre_instrumento}</p>
              <p className="text-xs opacity-60">{popover.eq.marca} · S/N: {popover.eq.no_serie || '—'}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[10px] uppercase font-bold opacity-50 mb-0.5">Orden</p>
                <p className={`text-sm font-mono font-bold ${darkMode ? 'text-[#C9EA63]' : 'text-emerald-600'}`}>{popover.eq.orden_cotizacion || popover.eq.folio_rastreo || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold opacity-50 mb-0.5">SLA</p>
                <p className={`text-sm font-bold ${(popover.eq.sla ?? 99) <= 0 ? 'text-red-500' : (popover.eq.sla ?? 99) <= 2 ? 'text-amber-400' : (darkMode ? 'text-[#C9EA63]' : 'text-emerald-600')}`}>
                  {(popover.eq.sla ?? 99) <= 0 ? '⏰ Vencido' : `${popover.eq.sla}d restantes`}
                </p>
              </div>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold opacity-50 mb-0.5">Cliente</p>
              <p className="text-xs font-semibold truncate">{popover.eq.empresa || popover.eq.cliente || '—'}</p>
            </div>
            {(() => {
              const cfg = ESTATUS_BADGE[popover.eq.estatus_actual] || {};
              return (
                <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full ${darkMode ? (cfg.dark || 'bg-slate-700 text-slate-300') : (cfg.light || 'bg-slate-100 text-slate-600')}`}>
                  {cfg.icon} {popover.eq.estatus_actual}
                </span>
              );
            })()}
          </div>
          <div className={`px-4 py-2 rounded-b-2xl text-[9px] text-center opacity-30 border-t ${darkMode ? 'border-[#C9EA63]/10' : 'border-slate-100'}`}>
            Haz clic en 👁 para ver el expediente completo
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default ListaEquipos;
