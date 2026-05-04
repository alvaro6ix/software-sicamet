import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { Activity, CheckCircle, Clock, AlertTriangle, Eye, Edit, Trash2, X, FileText, Save, Search, Zap, Package, Plus, Trash, Settings2, MapPin, Layers, Edit3, List, RefreshCw, User, AlertCircle } from 'lucide-react';
import Select from 'react-select';

const opcionesSLA = [
  { value: 5, label: '⚡ Super Express (5 días)' },
  { value: 7, label: '🏃 Rápido (7 días)' },
  { value: 10, label: '✅ Normal (10 días)' },
  { value: 15, label: '📅 Especial (15 días)' },
  { value: 20, label: '🛠️ Crítico (20 días)' }
];

const opcionesServicio = [
  "Venta", "Vaisala Boston", "Servicio Terceros", "Patrones SICAMET",
  "Medición", "Ensayos de Aptitud", "Consultoría", "Capacitación",
  "Calificación", "Calibración inLab", "Calibración in Plant"
];

const ListaEquipos = ({ darkMode }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [equipos, setEquipos] = useState([]);
  const [busqueda, setBusqueda] = useState(location.state?.busquedaInicial || '');

  // Filtros opcionales pasados por URL desde KPI cards de los dashboards.
  const filtroEstatus = searchParams.get('estatus');     // ej: 'Aseguramiento', 'Facturación'
  const filtroNombre  = searchParams.get('filtro');      // ej: 'sla_critico', 'detenidos', 'sin_notificar'
  const limpiarFiltro = () => setSearchParams({});
  
  // Estados para el Modal de VER
  const [equipoSeleccionado, setEquipoSeleccionado] = useState(null);
  const [modalAbierto, setModalAbierto] = useState(false);

  // Estados para el Modal de EDITAR
  const [equipoEditando, setEquipoEditando] = useState(null);
  const [modalEditarAbierto, setModalEditarAbierto] = useState(false);

  // Estados para MODIFICACIÓN MASIVA DE ORDEN
  const [modalOrdenAbierto, setModalOrdenAbierto] = useState(false);
  const [folioEdicion, setFolioEdicion] = useState('');
  const [instrumentosOrden, setInstrumentosOrden] = useState([]);
  const [eliminadosIds, setEliminadosIds] = useState([]);
  const [guardandoOrden, setGuardandoOrden] = useState(false);
  const [seleccionados, setSeleccionados] = useState([]);
  const [gruposExpandidos, setGruposExpandidos] = useState(new Set());
  const [areas, setAreas] = useState([]);
  const [metrologosDisponibles, setMetrologosDisponibles] = useState([]);
  const [cargandoMetrologos, setCargandoMetrologos] = useState(false);

  const toggleSeleccion = (id) => {
      setSeleccionados(prev => 
          prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      );
  };

  const seleccionarOC = (oc) => {
      const idsOC = equiposFiltrados.filter(e => (e.orden_cotizacion || e.folio_rastreo) === oc).map(e => e.id);
      const yaSeleccionados = idsOC.every(id => seleccionados.includes(id));
      
      if (yaSeleccionados) {
          setSeleccionados(prev => prev.filter(id => !idsOC.includes(id)));
      } else {
          setSeleccionados(prev => [...new Set([...prev, ...idsOC])]);
      }
  };

  const toggleGrupo = (oc) => {
      const next = new Set(gruposExpandidos);
      if (next.has(oc)) next.delete(oc);
      else next.add(oc);
      setGruposExpandidos(next);
  };

  const moverSeleccionados = async (nuevoEstatus) => {
      if (seleccionados.length === 0) return;
      try {
          await axios.post('/api/instrumentos/bulk-status', {
              ids: seleccionados,
              estatus: nuevoEstatus,
              comentario: 'Movimiento masivo por Administrador'
          });
          alert("Operación completada exitosamente");
          setSeleccionados([]);
          cargarEquipos();
      } catch (err) { alert("Error en movimiento masivo"); }
  };

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

  // Cargar áreas al montar
  useEffect(() => {
    const cargarAreas = async () => {
      try {
        const res = await axios.get('/api/areas');
        setAreas(res.data.filter(a => a.activa).map(a => ({ value: a.nombre, label: a.nombre })));
      } catch (err) { console.error('Error al cargar áreas:', err); }
    };
    cargarAreas();
  }, []);

  // Cargar metrólogos (Agrupados por área)
  useEffect(() => {
    const cargarMetrologos = async () => {
      try {
        setCargandoMetrologos(true);
        const res = await axios.get(`/api/usuarios/metrologos`);
        // Agrupar metrólogos por área para el Select
        const agrupados = {};
        res.data.forEach(m => {
            const area = m.area || 'Sin Área';
            if (!agrupados[area]) agrupados[area] = [];
            agrupados[area].push({ value: m.id, label: m.nombre });
        });
        
        const options = Object.keys(agrupados).map(area => ({
            label: area.toUpperCase(),
            options: agrupados[area]
        }));
        
        setMetrologosDisponibles(options);
      } catch (err) {
        console.error('Error al cargar metrólogos:', err);
      } finally {
        setCargandoMetrologos(false);
      }
    };
    cargarMetrologos();
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
    setEquipoEditando({ 
        ...equipo,
        // Convertimos a formato Select si es necesario
        metrologos_asignados: equipo.metrologos_asignados?.map(m => ({ value: m.id, label: m.nombre })) || []
    });
    setModalEditarAbierto(true);
  };
  const cerrarModalEditar = () => {
    setModalEditarAbierto(false);
    setEquipoEditando(null);
  };

  const selectStyles = {
    control: (base) => ({
      ...base,
      backgroundColor: darkMode ? '#141f0b' : '#f8fafc',
      borderColor: darkMode ? 'rgba(201, 234, 99, 0.2)' : '#e2e8f0',
      borderRadius: '0.75rem',
      padding: '2px',
      fontSize: '0.875rem',
      fontWeight: '700',
      color: darkMode ? '#ffffff' : '#1e293b',
      '&:hover': {
        borderColor: darkMode ? '#C9EA63' : '#10b981'
      }
    }),
    menu: (base) => ({
      ...base,
      backgroundColor: darkMode ? '#141f0b' : '#ffffff',
      borderRadius: '1rem',
      overflow: 'hidden',
      zIndex: 1000
    }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isFocused ? (darkMode ? '#C9EA63' : '#10b981') : 'transparent',
      color: state.isFocused ? '#000000' : (darkMode ? '#ffffff' : '#1e293b'),
      fontSize: '0.75rem',
      fontWeight: '700',
      padding: '10px 15px',
      cursor: 'pointer'
    }),
    singleValue: (base) => ({
      ...base,
      color: darkMode ? '#C9EA63' : '#059669'
    }),
    multiValue: (base) => ({
      ...base,
      backgroundColor: darkMode ? '#C9EA63' : '#10b981',
      borderRadius: '0.5rem'
    }),
    multiValueLabel: (base) => ({
      ...base,
      color: darkMode ? '#000000' : '#ffffff',
      fontWeight: '800',
      fontSize: '0.7rem'
    })
  };

  // Función para GUARDAR los cambios de edición (individual)
  const guardarEdicion = async (e) => {
    e.preventDefault();
    try {
      const payload = {
          ...equipoEditando,
          // Mapeamos metrólogos de vuelta a IDs si es necesario para el backend
          metrologos_asignados: equipoEditando.metrologos_asignados?.map(m => m.value || m.id)
      };
      await axios.put(`/api/instrumentos/${equipoEditando.id}`, payload);
      
      const original = equipos.find(eq => eq.id === equipoEditando.id);
      if (original && (original.empresa !== equipoEditando.empresa || original.persona !== equipoEditando.persona)) {
          const oc = equipoEditando.orden_cotizacion || equipoEditando.folio_rastreo;
          await axios.post('/api/instrumentos/bulk-update-header', {
              orden_cotizacion: oc,
              empresa: equipoEditando.empresa,
              persona: equipoEditando.persona
          });
      }

      alert("Equipo actualizado correctamente");
      cerrarModalEditar();
      cargarEquipos();
    } catch (err) {
      alert("Error al guardar los cambios: " + err.message);
    }
  };

  // Edición Masiva de Orden
  const abrirModalOrden = async (folio) => {
    setFolioEdicion(folio);
    setEliminadosIds([]);
    try {
        const res = await axios.get(`/api/instrumentos?folio=${folio}`);
        const data = res.data.map(ins => ({
            ...ins,
            metrologos_asignados: ins.metrologos_asignados?.map(m => ({ value: m.id, label: m.nombre })) || []
        }));
        setInstrumentosOrden(data);
        setModalOrdenAbierto(true);
    } catch(err) { alert("Error al cargar instrumentos de la orden"); }
  };

  const agregarEquipoAOrden = () => {
    setInstrumentosOrden([...instrumentosOrden, {
        id: null,
        nombre_instrumento: '',
        marca: '',
        modelo: '',
        no_serie: '',
        identificacion: '',
        tipo_servicio: 'Calibración inLab',
        area_laboratorio: instrumentosOrden[0]?.area_laboratorio || '',
        ubicacion: '',
        puntos_calibrar: '',
        requerimientos_especiales: '',
        metrologos_asignados: [],
        empresa: instrumentosOrden[0]?.empresa,
        persona: instrumentosOrden[0]?.persona,
        sla: instrumentosOrden[0]?.sla || 10
    }]);
  };

  const actualizarItemOrden = (idx, campo, v) => {
    const next = [...instrumentosOrden];
    next[idx][campo] = v;
    setInstrumentosOrden(next);
  };

  const removerDeOrden = (idx) => {
    const item = instrumentosOrden[idx];
    if (item.id) setEliminadosIds([...eliminadosIds, item.id]);
    setInstrumentosOrden(instrumentosOrden.filter((_, i) => i !== idx));
  };

  const guardarCambiosOrden = async (e) => {
    e.preventDefault();
    setGuardandoOrden(true);
    try {
        const payload = instrumentosOrden.map(ins => ({
            ...ins,
            metrologos_asignados: ins.metrologos_asignados?.map(m => m.value || m.id)
        }));
        await axios.post(`/api/instrumentos/orden/${folioEdicion}/modificar`, {
            instrumentos: payload,
            eliminados_ids: eliminadosIds
        });
        alert("Orden modificada exitosamente. Se ha notificado al equipo.");
        setModalOrdenAbierto(false);
        cargarEquipos();
    } catch(err) { alert("Error al guardar cambios"); }
    finally { setGuardandoOrden(false); }
  };

  const ESTATUS_BADGE = {
    'Recepción':    { light: 'bg-slate-100 text-slate-600',    dark: 'bg-slate-700/60 text-slate-300',    icon: <Clock size={13} /> },
    'Laboratorio':   { light: 'bg-emerald-100 text-emerald-700', dark: 'bg-emerald-900/50 text-emerald-300', icon: <Activity size={13} /> },
    'Aseguramiento': { light: 'bg-blue-100 text-blue-700',       dark: 'bg-blue-900/40 text-blue-300',       icon: <AlertTriangle size={13} /> },
    'Certificación': { light: 'bg-slate-100 text-slate-700',    dark: 'bg-slate-800 text-slate-300',    icon: <FileText size={13} /> },
    'Facturación':         { light: 'bg-emerald-100 text-emerald-700', dark: 'bg-emerald-900/40 text-emerald-300', icon: <CheckCircle size={13} /> },
    'Entregado':     { light: 'bg-green-100 text-green-700',     dark: 'bg-green-900/40 text-green-300',     icon: <CheckCircle size={13} /> },
  };

  const mostrarPopover = useCallback((eq, e) => {
    // Usamos clientX y clientY para posicionarlo relativamente al cursor y evitar bloquear los botones a la derecha
    const x = Math.min(e.clientX + 15, window.innerWidth - 300);
    const y = Math.max(e.clientY + 15, 8);
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
    'Aseguramiento': { color: 'bg-blue-100 text-blue-700', icon: <AlertTriangle size={14} /> },
    'Certificación': { color: 'bg-slate-100 text-slate-700', icon: <FileText size={14} /> },
    'Facturación': { color: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle size={14} /> },
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

  // Filtros derivados de query params (sla, detenidos, etc).
  const aplicaFiltroPreset = (eq) => {
    if (filtroEstatus && eq.estatus_actual !== filtroEstatus) return false;
    if (filtroNombre === 'sla_critico') {
      const dias = Number.isFinite(eq.dias_restantes_sla) ? eq.dias_restantes_sla : null;
      const operativo = !['Entregado', 'Facturación'].includes(eq.estatus_actual);
      if (!operativo || dias === null || dias > 1) return false;
    }
    if (filtroNombre === 'detenidos') {
      // Equipos atorados en Laboratorio más de 2 días
      const operativo = eq.estatus_actual === 'Laboratorio';
      const fecha = eq.fecha_ingreso ? new Date(eq.fecha_ingreso) : null;
      if (!operativo || !fecha) return false;
      const horas = (Date.now() - fecha.getTime()) / (1000 * 60 * 60);
      if (horas < 48) return false;
    }
    if (filtroNombre === 'sin_notificar') {
      if (eq.estatus_actual !== 'Facturación') return false;
      if (eq.notificado_cliente) return false;
    }
    if (filtroNombre === 'sin_certificado') {
      if (!['Certificación', 'Facturación', 'Entregado'].includes(eq.estatus_actual)) return false;
      if (eq.no_certificado || eq.certificado_url) return false;
    }
    return true;
  };

  const equiposFiltrados = equipos.filter(eq =>
    aplicaFiltroPreset(eq) && (
      eq.folio_rastreo?.toLowerCase().includes(busqueda.toLowerCase()) ||
      eq.orden_cotizacion?.toLowerCase().includes(busqueda.toLowerCase()) ||
      eq.nombre_instrumento?.toLowerCase().includes(busqueda.toLowerCase()) ||
      eq.marca?.toLowerCase().includes(busqueda.toLowerCase()) ||
      eq.no_serie?.toLowerCase().includes(busqueda.toLowerCase()) ||
      eq.empresa?.toLowerCase().includes(busqueda.toLowerCase()) ||
      eq.cliente?.toLowerCase().includes(busqueda.toLowerCase())
    )
  );

  const filtroLabel = (() => {
    if (filtroEstatus) return `Estatus: ${filtroEstatus}`;
    switch (filtroNombre) {
      case 'sla_critico':    return 'SLA Crítico (≤ 1 día)';
      case 'detenidos':      return 'Detenidos en Laboratorio (> 2 días)';
      case 'sin_notificar':  return 'Listos sin notificar al cliente';
      case 'sin_certificado':return 'Sin certificado emitido';
      default: return null;
    }
  })();

  return (
    <>
    <div className={`w-full mt-8 p-6 rounded-2xl shadow-xl border relative transition-colors ${darkMode ? 'bg-[#141f0b] border-[#C9EA63]/20' : 'bg-white border-gray-100'}`}>
      <div className="flex justify-between items-center mb-6">
        <h2 className={`text-xl font-bold ${darkMode ? 'text-[#C9EA63]' : 'text-slate-800'}`}>Panel de Trazabilidad (Órdenes de Servicio)</h2>
        <span className={`text-sm ${darkMode ? 'text-[#F2F6F0]/70' : 'text-slate-500'}`}>Total: {equipos.length} equipos</span>
      </div>

      {filtroLabel && (
        <div className={`flex items-center justify-between gap-3 mb-4 px-4 py-2 rounded-xl border ${darkMode ? 'bg-amber-900/20 border-amber-500/30 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
          <div className="flex items-center gap-2 text-sm font-bold">
            <AlertTriangle size={16} />
            <span>Filtro activo: {filtroLabel}</span>
            <span className={`text-xs font-medium ml-2 ${darkMode ? 'text-amber-200/70' : 'text-amber-700/70'}`}>({equiposFiltrados.length} resultado{equiposFiltrados.length !== 1 ? 's' : ''})</span>
          </div>
          <button
            type="button"
            onClick={limpiarFiltro}
            className={`flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-lg transition-colors ${darkMode ? 'hover:bg-amber-500/20' : 'hover:bg-amber-100'}`}
          >
            <X size={14} /> Limpiar
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className={`flex items-center gap-2 px-4 py-2 border rounded-xl w-full max-w-md ${darkMode ? 'bg-[#2a401c] border-[#C9EA63]/20 text-[#F2F6F0]' : 'bg-slate-50 border-gray-200 text-slate-800'}`}>
          <Search size={18} className={darkMode ? 'text-[#F2F6F0]/50' : 'text-slate-400'} />
          <input
            type="text"
            placeholder="Buscar por O.S, serie, instrumento o cliente..."
            className="bg-transparent border-none outline-none w-full text-sm"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        {seleccionados.length > 0 && (
          <div className="flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
            <span className="text-xs font-bold opacity-60">{seleccionados.length} seleccionados</span>
            <select 
              onChange={(e) => moverSeleccionados(e.target.value)}
              className={`text-xs px-4 py-2 rounded-xl font-bold border outline-none shadow-sm cursor-pointer ${darkMode ? 'bg-[#253916] border-[#C9EA63]/40 text-[#C9EA63]' : 'bg-emerald-600 border-emerald-700 text-white'}`}
            >
              <option value="">Mover Selección a...</option>
              <option value="Recepción">Recepción</option>
              <option value="Laboratorio">Laboratorio</option>
              <option value="Aseguramiento">Aseguramiento</option>
              <option value="Certificación">Certificación</option>
              <option value="Facturación">Facturación</option>
              <option value="Entregado">Entregado</option>
            </select>
            <button onClick={() => setSeleccionados([])} className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all" title="Deseleccionar todo">
              <X size={18} />
            </button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className={`text-sm border-b ${darkMode ? 'bg-[#2a401c] text-[#F2F6F0] border-[#C9EA63]/20' : 'bg-slate-50 text-slate-600 border-gray-200'}`}>
              <th className="p-4 w-12">
                <input 
                    type="checkbox" 
                    checked={equiposFiltrados.length > 0 && seleccionados.length === equiposFiltrados.length}
                    onChange={() => {
                        if (seleccionados.length === equiposFiltrados.length) setSeleccionados([]);
                        else setSeleccionados(equiposFiltrados.map(e => e.id));
                    }}
                    className="cursor-pointer accent-emerald-500"
                />
              </th>
              <th className="p-4 font-semibold">O.S. / Folio</th>
              <th className="p-4 font-semibold">Instrumento / Marca</th>
              <th className="p-4 font-semibold">Cliente</th>
              <th className="p-4 font-semibold">Estatus Actual</th>
              <th className="p-4 font-semibold text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
                // Cálculo de totales globales por OC
                const globalOCCounts = {};
                equipos.forEach(eq => {
                    const oc = eq.orden_cotizacion || eq.folio_rastreo || 'S/N';
                    globalOCCounts[oc] = (globalOCCounts[oc] || 0) + 1;
                });

                const grouped = [];
                const processedOC = new Set();

                equiposFiltrados.forEach(eq => {
                    const oc = eq.orden_cotizacion || eq.folio_rastreo || 'S/N';
                    if (processedOC.has(oc)) return;

                    const itemsFiltrados = equiposFiltrados.filter(e => (e.orden_cotizacion || e.folio_rastreo) === oc);
                    const globalTotal = globalOCCounts[oc] || 0;

                    if (globalTotal >= 5) {
                        grouped.push({ isGroup: true, oc, items: itemsFiltrados, totalGlobal: globalTotal });
                    } else {
                        itemsFiltrados.forEach(i => grouped.push({ isGroup: false, ...i }));
                    }
                    processedOC.add(oc);
                });

              if (grouped.length === 0) {
                return (
                  <tr>
                    <td colSpan="6" className={`p-6 text-center ${darkMode ? 'text-[#F2F6F0]/50' : 'text-gray-500'}`}>
                        {equipos.length === 0 ? 'No hay equipos registrados aún.' : 'No hay resultados para la búsqueda.'}
                    </td>
                  </tr>
                );
              }

              return grouped.map((node, idx) => {
                if (node.isGroup) {
                  const isExpanded = gruposExpandidos.has(node.oc);
                  return (
                    <React.Fragment key={`group-${node.oc}`}>
                      <tr 
                         className={`border-b transition-all ${darkMode ? 'bg-[#1b2b10] border-[#C9EA63]/20 hover:bg-[#253916]' : 'bg-slate-50 border-gray-200 hover:bg-slate-100'}`}
                      >
                        <td className="p-4">
                            <input 
                                type="checkbox" 
                                checked={node.items.every(i => seleccionados.includes(i.id))}
                                onChange={() => seleccionarOC(node.oc)}
                                className="accent-emerald-500"
                            />
                        </td>
                        <td className="p-4 font-black flex items-center gap-2">
                             <Package size={16} className="text-emerald-500" />
                             {node.oc}
                             <span className={`text-[10px] px-2 py-0.5 rounded-full ${darkMode ? 'bg-[#C9EA63] text-black' : 'bg-emerald-600 text-white'}`}>
                                 {node.items.length} de {node.totalGlobal} EQUIPOS
                             </span>
                        </td>
                        <td className="p-4 opacity-70 italic text-xs">Orden agrupada por volumen</td>
                        <td className="p-4 text-xs font-bold opacity-60">Varios estados</td>
                        <td className="p-4 text-center">
                            <button 
                                onClick={() => navigate(`/equipos/grupo/${node.oc}`)}
                                className={`text-[10px] font-black underline uppercase tracking-widest ${darkMode ? 'text-[#C9EA63]' : 'text-emerald-700'}`}
                            >
                                GESTIONAR ORDEN →
                            </button>
                        </td>
                        <td className="p-4"></td>
                      </tr>
                      {isExpanded && node.items.map((eq, iIdx) => (
                        <tr
                           key={eq.id}
                           style={{ backgroundColor: getOsaColor(eq.orden_cotizacion || eq.folio_rastreo, darkMode) }}
                           className={`border-b transition-colors opacity-90 ${darkMode ? 'border-[#C9EA63]/5 hover:brightness-125' : 'border-gray-50 hover:brightness-95'}`}
                        >
                          <td className="p-4 pl-8">
                            <div className="flex items-center gap-3">
                                <span className="text-[10px] opacity-40 font-black">#{iIdx + 1}</span>
                                <input 
                                    type="checkbox" 
                                    checked={seleccionados.includes(eq.id)}
                                    onChange={() => toggleSeleccion(eq.id)}
                                    className="accent-emerald-500"
                                />
                            </div>
                          </td>
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
                              className={`text-[10px] sm:text-xs rounded-full px-3 py-1 font-black outline-none cursor-pointer appearance-none text-center ${estatusConfig[eq.estatus_actual]?.color || 'bg-gray-100 text-gray-700'}`}
                            >
                              <option value="Recepción">Recepción</option>
                              <option value="Laboratorio">Laboratorio</option>
                              <option value="Aseguramiento">Aseguramiento</option>
                              <option value="Certificación">Certificación</option>
                              <option value="Facturación">Facturación</option>
                              <option value="Entregado">Entregado</option>
                            </select>
                          </td>
                          <td className="p-4 flex justify-center gap-3">
                             <button onClick={() => abrirModalVer(eq)} className={`transition-colors ${darkMode ? 'text-gray-400 hover:text-[#C9EA63]' : 'text-gray-400 hover:text-emerald-600'}`} title="Ver Expediente">
                               <Eye size={18} />
                             </button>
                             <button onClick={() => abrirModalEditar(eq)} className={`transition-colors ${darkMode ? 'text-gray-400 hover:text-emerald-400' : 'text-gray-400 hover:text-emerald-500'}`} title="Editar">
                               <Edit size={18} />
                             </button>
                             <button onClick={() => eliminarEquipo(eq.id)} className={`transition-colors ${darkMode ? 'text-gray-400 hover:text-red-400' : 'text-gray-400 hover:text-red-600'}`} title="Eliminar">
                               <Trash2 size={18} />
                             </button>
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                } else {
                  const eq = node;
                  return (
                    <tr
                      key={eq.id}
                      style={{ backgroundColor: getOsaColor(eq.orden_cotizacion || eq.folio_rastreo, darkMode) }}
                      className={`border-b transition-colors ${darkMode ? 'border-[#C9EA63]/10 hover:brightness-125' : 'border-gray-100 hover:brightness-95'}`}
                      onMouseEnter={e => mostrarPopover(eq, e)}
                      onMouseLeave={ocultarPopover}
                    >
                      <td className="p-4">
                        <input 
                            type="checkbox" 
                            checked={seleccionados.includes(eq.id)}
                            onChange={() => toggleSeleccion(eq.id)}
                            className="accent-emerald-500"
                        />
                      </td>
                      <td className={`p-4 font-mono text-sm font-bold ${darkMode ? 'text-[#C9EA63]' : 'text-emerald-500'}`}>
                        <div className="flex items-center gap-2">
                             {eq.folio_rastreo || eq.orden_cotizacion}
                             <button 
                                onClick={(e) => { e.stopPropagation(); seleccionarOC(eq.orden_cotizacion || eq.folio_rastreo); }}
                                className={`text-[8px] font-black border px-1.5 py-0.5 rounded transition-all ${darkMode ? 'border-sky-500 text-sky-400 hover:bg-sky-500 hover:text-[#141f0b]' : 'border-sky-400 text-sky-600 hover:bg-sky-600 hover:text-white'}`}
                                title="Seleccionar todos de esta orden"
                             >
                                MASIVO
                             </button>
                        </div>
                      </td>
                      <td className="p-4">
                        <p className={`font-semibold ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>{eq.nombre_instrumento}</p>
                        <p className={`text-xs ${darkMode ? 'text-[#F2F6F0]/60' : 'text-slate-500'}`}>S/N: {eq.no_serie} • {eq.marca}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                            {eq.area_laboratorio && (
                                <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${darkMode ? 'bg-[#253916] text-[#C9EA63]' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'}`}>
                                    {eq.area_laboratorio}
                                </span>
                            )}
                            {eq.metrologos_asignados?.map((m, mIdx) => (
                                <span key={mIdx} className={`text-[9px] px-1.5 py-0.5 rounded font-bold border transition-colors ${m.estatus === 'terminado' ? (darkMode ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-emerald-50 text-emerald-700 border-emerald-200') : (darkMode ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-slate-50 text-slate-500 border-slate-100')}`}>
                                    {m.nombre.split(' ')[0]} {m.estatus === 'terminado' ? '✓' : '...'}
                                </span>
                            ))}
                        </div>
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
                          <option value="Aseguramiento">Aseguramiento</option>
                          <option value="Certificación">Certificación</option>
                          <option value="Facturación">Facturación</option>
                          <option value="Entregado">Entregado</option>
                        </select>
                      </td>
    
                      <td className="p-4 flex justify-center gap-3">
                        <button onClick={() => abrirModalVer(eq)} className={`transition-colors ${darkMode ? 'text-gray-400 hover:text-[#C9EA63]' : 'text-gray-400 hover:text-emerald-600'}`} title="Ver Expediente">
                          <Eye size={18} />
                        </button>
                        <button onClick={() => abrirModalOrden(eq.orden_cotizacion || eq.folio_rastreo)} className={`transition-colors ${darkMode ? 'text-gray-400 hover:text-[#38ef7d]' : 'text-gray-400 hover:text-emerald-500'}`} title="Gestionar Orden Completa">
                          <Package size={18} />
                        </button>
                        <button onClick={() => abrirModalEditar(eq)} className={`transition-colors ${darkMode ? 'text-gray-400 hover:text-emerald-500' : 'text-gray-400 hover:text-emerald-500'}`} title="Editar">
                          <Edit size={18} />
                        </button>
                        <button onClick={() => eliminarEquipo(eq.id)} className={`transition-colors ${darkMode ? 'text-gray-400 hover:text-red-400' : 'text-gray-400 hover:text-red-600'}`} title="Eliminar">
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  );
                }
              });
            })()}
          </tbody>
        </table>
      </div>

      {/* --- MODAL 1: VER EXPEDIENTE --- */}
      {modalAbierto && equipoSeleccionado && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 backdrop-blur-md bg-black/60 animate-in fade-in duration-300">
          <div className={`w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-[2.5rem] shadow-2xl border flex flex-col animate-in zoom-in-95 duration-300 ${darkMode ? 'bg-[#141f0b] border-[#C9EA63]/20' : 'bg-white border-slate-200'}`}>
            <div className={`p-6 border-b flex items-center justify-between ${darkMode ? 'border-white/5' : 'border-slate-100'}`}>
              <div className="flex items-center gap-3">
                <div className={`p-3 rounded-2xl ${darkMode ? 'bg-[#C9EA63] text-black' : 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'}`}>
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className={`text-xl font-black uppercase tracking-tight ${darkMode ? 'text-white' : 'text-slate-800'}`}>Expediente del Equipo</h3>
                  <p className="text-[10px] font-bold opacity-40 uppercase tracking-widest">Detalle técnico e historial de orden</p>
                </div>
              </div>
              <button onClick={cerrarModalVer} className="opacity-40 hover:opacity-100 transition-all hover:rotate-90"><X size={24} /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <section>
                    <h4 className={`text-[10px] font-black uppercase tracking-widest mb-4 opacity-50 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Identificación Base</h4>
                  <div className={`p-6 rounded-[2rem] border ${darkMode ? 'bg-[#C9EA63]/5 border-[#C9EA63]/20' : 'bg-emerald-50 border-emerald-100'}`}>
                    <h4 className="text-[10px] font-black uppercase tracking-widest mb-4 opacity-40">Identificación Base</h4>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase opacity-40 ml-1">Referencia / Orden</label>
                      <p className={`text-3xl font-black tracking-tighter ${darkMode ? 'text-[#C9EA63]' : 'text-emerald-500'}`}>
                        {equipoSeleccionado.folio_rastreo || equipoSeleccionado.orden_cotizacion}
                      </p>
                    </div>
                  </div>
                  </section>

                  <section>
                    <h4 className={`text-[10px] font-black uppercase tracking-widest mb-4 opacity-50 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Datos del Instrumento</h4>
                    <div className="grid grid-cols-2 gap-4">
                      {equipoSeleccionado.clave && (
                        <div className={`p-4 rounded-2xl border ${darkMode ? 'bg-[#C9EA63]/5 border-[#C9EA63]/10' : 'bg-emerald-50 border-emerald-100'}`}>
                          <p className="text-[9px] font-black uppercase opacity-40 mb-1">Clave</p>
                          <p className="text-sm font-black font-mono uppercase">{equipoSeleccionado.clave}</p>
                        </div>
                      )}
                      <div className={`p-4 rounded-2xl border ${darkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
                        <p className="text-[9px] font-black uppercase opacity-40 mb-1">Nombre / Equipo</p>
                        <p className="text-xs font-bold uppercase">{equipoSeleccionado.nombre_instrumento}</p>
                      </div>
                      {equipoSeleccionado.no_certificado && (
                        <div className={`p-4 rounded-2xl border ${darkMode ? 'bg-[#C9EA63]/5 border-[#C9EA63]/10' : 'bg-emerald-50 border-emerald-100'}`}>
                          <p className="text-[9px] font-black uppercase opacity-40 mb-1">No. Certificado</p>
                          <p className="text-sm font-black font-mono uppercase">{equipoSeleccionado.no_certificado}</p>
                        </div>
                      )}
                      <div className={`p-4 rounded-2xl border ${darkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
                        <p className="text-[9px] font-black uppercase opacity-40 mb-1">Marca / Modelo</p>
                        <p className="text-xs font-bold uppercase">{equipoSeleccionado.marca || 'N/A'} {equipoSeleccionado.modelo ? `/ ${equipoSeleccionado.modelo}` : ''}</p>
                      </div>
                      <div className={`p-4 rounded-2xl border ${darkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
                        <p className="text-[9px] font-black uppercase opacity-40 mb-1">No. Serie</p>
                        <p className="text-xs font-bold font-mono uppercase">{equipoSeleccionado.no_serie || 'S/N'}</p>
                      </div>
                      <div className={`p-4 rounded-2xl border ${darkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
                        <p className="text-[9px] font-black uppercase opacity-40 mb-1">ID / Ubicación</p>
                        <p className="text-xs font-bold uppercase">{equipoSeleccionado.identificacion || 'N/A'} | {equipoSeleccionado.ubicacion || 'ALMACÉN'}</p>
                      </div>
                      {equipoSeleccionado.intervalo_calibracion && equipoSeleccionado.intervalo_calibracion !== 'No especificado' && (
                        <div className={`col-span-2 p-4 rounded-2xl border ${darkMode ? 'bg-blue-950/20 border-blue-500/20' : 'bg-blue-50 border-blue-200'}`}>
                          <p className="text-[9px] font-black uppercase opacity-40 mb-1">Intervalo de Calibración</p>
                          <p className="text-xs font-bold">{equipoSeleccionado.intervalo_calibracion}</p>
                        </div>
                      )}
                    </div>
                  </section>

                  <section>
                    <h4 className={`text-[10px] font-black uppercase tracking-widest mb-4 opacity-50 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Asignación y Metrología</h4>
                    <div className={`p-5 rounded-3xl border flex flex-col gap-4 ${darkMode ? 'bg-white/5 border-white/5 shadows-inner' : 'bg-slate-50 border-slate-100'}`}>
                      <div className="flex justify-between items-center text-xs">
                        <span className="opacity-50 font-bold uppercase">Laboratorio:</span>
                        <span className={`px-2 py-0.5 rounded font-black border ${darkMode ? 'bg-[#C9EA63]/10 border-[#C9EA63]/20 text-[#C9EA63]' : 'bg-emerald-50 border-emerald-100 text-emerald-700'}`}>{equipoSeleccionado.area_laboratorio || 'PENDIENTE'}</span>
                      </div>
                      <div className="space-y-2">
                        <p className="text-[9px] font-black uppercase opacity-30">Metrólogos Responsables</p>
                        <div className="flex flex-wrap gap-2">
                          {equipoSeleccionado.metrologos_asignados?.length ? equipoSeleccionado.metrologos_asignados.map(m => (
                            <div key={m.id} className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 transition-all ${m.estatus === 'terminado' ? (darkMode ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-700') : (darkMode ? 'bg-[#C9EA63]/5 border-[#C9EA63]/10 text-white' : 'bg-white border-slate-200 text-slate-700')}`}>
                                <span className="text-[10px] font-black tracking-tight">{m.nombre.toUpperCase()}</span>
                                {m.estatus === 'terminado' ? <CheckCircle size={14} className="text-emerald-500" /> : <div className="w-1.5 h-1.5 rounded-full bg-[#C9EA63] animate-pulse" />}
                            </div>
                          )) : <span className="text-xs opacity-40 italic">Sin asignar personal técnico</span>}
                        </div>
                      </div>
                    </div>
                  </section>
                </div>

                <div className="space-y-6">
                  <section>
                    <h4 className={`text-[10px] font-black uppercase tracking-widest mb-4 opacity-50 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Información del Cliente</h4>
                    <div className={`p-6 rounded-3xl border space-y-4 ${darkMode ? 'bg-[#1b2b10] border-[#C9EA63]/10' : 'bg-white border-slate-200 shadow-sm'}`}>
                      <div className="space-y-1">
                        <p className="text-[9px] font-black uppercase opacity-40">Empresa / Socio Comercial</p>
                        <p className={`text-sm font-black tracking-tight ${darkMode ? 'text-white' : 'text-slate-800'}`}>{equipoSeleccionado.empresa || equipoSeleccionado.cliente}</p>
                      </div>
                      {equipoSeleccionado.nombre_certificados && (
                        <div className="space-y-1">
                          <p className="text-[9px] font-black uppercase opacity-40">Certificados a nombre de</p>
                          <p className={`text-sm font-bold tracking-tight ${darkMode ? 'text-[#C9EA63]' : 'text-emerald-700'}`}>{equipoSeleccionado.nombre_certificados}</p>
                        </div>
                      )}
                      {equipoSeleccionado.direccion && (
                        <div className="space-y-1">
                          <p className="text-[9px] font-black uppercase opacity-40">Dirección</p>
                          <p className={`text-xs font-bold ${darkMode ? 'text-white/70' : 'text-slate-600'}`}>{equipoSeleccionado.direccion}</p>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-4 pt-2 border-t border-dashed border-white/5">
                        <div className="space-y-1">
                          <p className="text-[9px] font-black uppercase opacity-40">Contacto</p>
                          <p className="text-xs font-bold">{equipoSeleccionado.persona || 'No registrado'}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[9px] font-black uppercase opacity-40">SLA Acordado</p>
                          <p className={`text-xs font-black uppercase tracking-wider ${darkMode ? 'text-[#C9EA63]' : 'text-emerald-500'}`}>{equipoSeleccionado.sla || 10} Días Naturales</p>
                        </div>
                      </div>
                      {equipoSeleccionado.contacto_email && (
                        <div className="space-y-1">
                          <p className="text-[9px] font-black uppercase opacity-40">Email</p>
                          <p className={`text-xs font-bold ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>{equipoSeleccionado.contacto_email}</p>
                        </div>
                      )}
                    </div>
                  </section>

                  {/* DATOS DE ORDEN */}
                  {(equipoSeleccionado.cotizacion_referencia || equipoSeleccionado.fecha_recepcion || equipoSeleccionado.servicio_solicitado) && (
                    <section>
                      <h4 className={`text-[10px] font-black uppercase tracking-widest mb-4 opacity-50 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Datos de la Orden</h4>
                      <div className={`p-5 rounded-3xl border grid grid-cols-3 gap-3 ${darkMode ? 'bg-[#1b2b10]/60 border-[#C9EA63]/15' : 'bg-sky-50 border-sky-200'}`}>
                        {equipoSeleccionado.cotizacion_referencia && (
                          <div className="space-y-1">
                            <p className="text-[9px] font-black uppercase opacity-40">Cotización Ref.</p>
                            <p className={`text-sm font-black font-mono ${darkMode ? 'text-[#C9EA63]' : 'text-sky-700'}`}>{equipoSeleccionado.cotizacion_referencia}</p>
                          </div>
                        )}
                        {equipoSeleccionado.fecha_recepcion && (
                          <div className="space-y-1">
                            <p className="text-[9px] font-black uppercase opacity-40">Fecha Recepción</p>
                            <p className={`text-sm font-black ${darkMode ? 'text-white' : 'text-slate-800'}`}>{equipoSeleccionado.fecha_recepcion}</p>
                          </div>
                        )}
                        {equipoSeleccionado.servicio_solicitado && (
                          <div className="space-y-1">
                            <p className="text-[9px] font-black uppercase opacity-40">Servicio</p>
                            <p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-slate-800'}`}>{equipoSeleccionado.servicio_solicitado}</p>
                          </div>
                        )}
                      </div>
                    </section>
                  )}

                  <section>
                    <h4 className={`text-[10px] font-black uppercase tracking-widest mb-4 opacity-50 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Técnico & Requisitos</h4>
                    <div className="grid grid-cols-1 gap-4">
                      <div className={`p-5 rounded-3xl border ${darkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
                         <div className="flex items-center gap-2 mb-3">
                            <Layers size={14} className="opacity-30" />
                            <p className="text-[9px] font-black uppercase tracking-widest opacity-40">Puntos a Calibrar</p>
                         </div>
                         <p className={`text-[14px] leading-relaxed opacity-90 font-bold ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-700'}`}>
                             {equipoSeleccionado.puntos_calibrar || 'Operación estándar según manual de metrología.'}
                         </p>
                      </div>
                      <div className={`p-5 rounded-3xl border ${darkMode ? 'bg-rose-500/5 border-rose-500/10' : 'bg-amber-50 border-amber-100'}`}>
                         <div className="flex items-center gap-2 mb-3">
                            <AlertTriangle size={14} className="opacity-30" />
                            <p className="text-[9px] font-black uppercase tracking-widest opacity-40">Requisitos Especiales</p>
                         </div>
                         <p className={`text-[14px] leading-relaxed opacity-90 font-bold italic ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-700'}`}>
                             {equipoSeleccionado.requerimientos_especiales || 'Sin consideraciones técnicas adicionales.'}
                         </p>
                      </div>
                    </div>
                  </section>
                  
                  <div className={`p-6 rounded-3xl border ${darkMode ? 'bg-[#C9EA63]/5 border-[#C9EA63]/20 shadow-lg shadow-[#C9EA63]/5' : 'bg-emerald-50 border-emerald-100'}`}>
                    <div className="flex justify-between items-center">
                       <div>
                          <p className="text-[9px] font-black uppercase opacity-40 tracking-widest mb-1">Estatus en línea</p>
                          <p className={`text-sm font-black uppercase ${darkMode ? 'text-[#C9EA63]' : 'text-emerald-700'}`}>{equipoSeleccionado.estatus_actual}</p>
                       </div>
                       <div className="flex -space-x-2">
                          {[1,2,3].map(i => <div key={i} className={`w-8 h-8 rounded-full border-2 border-inherit ${darkMode ? 'bg-[#C9EA63]/20 border-[#C9EA63]' : 'bg-emerald-200 border-emerald-500'}`} />)}
                       </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className={`p-4 border-t flex justify-end gap-3 ${darkMode ? 'bg-black/20 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
                <button onClick={cerrarModalVer} className={`px-8 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-lg ${darkMode ? 'bg-[#C9EA63] hover:bg-[#b0d14b] text-[#141f0b] shadow-[#C9EA63]/10' : 'bg-[#008a5e] hover:bg-[#007b55] text-white shadow-[#008a5e]/20'}`}>
                  Cerrar Expediente
                </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL 2: EDITAR EQUIPO --- */}
      {modalEditarAbierto && equipoEditando && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 backdrop-blur-md bg-black/60 animate-in fade-in duration-300">
          <div className={`w-full max-w-4xl max-h-[95vh] overflow-hidden rounded-[2.5rem] shadow-2xl border flex flex-col animate-in zoom-in-95 duration-300 ${darkMode ? 'bg-[#141f0b] border-[#C9EA63]/20' : 'bg-white border-slate-200'}`}>
            <div className={`p-6 border-b flex items-center justify-between ${darkMode ? 'border-white/5' : 'border-slate-100'}`}>
              <div className="flex items-center gap-3">
                <div className={`p-3 rounded-2xl ${darkMode ? 'bg-[#C9EA63] text-black shadow-lg shadow-[#C9EA63]/20' : 'bg-[#008a5e] text-white shadow-lg shadow-[#008a5e]/20'}`}>
                  <Edit3 size={24} />
                </div>
                <div>
                  <h3 className={`text-xl font-black uppercase tracking-tight ${darkMode ? 'text-white' : 'text-slate-800'}`}>Editar Instrumento</h3>
                  <p className="text-[10px] font-bold opacity-40 uppercase tracking-widest">Panel de edición técnica y administrativa</p>
                </div>
              </div>
              <button onClick={cerrarModalEditar} className="opacity-40 hover:opacity-100 transition-all hover:rotate-90"><X size={24} /></button>
            </div>

            <form onSubmit={guardarEdicion} className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
              {/* ORDEN CABECERA */}
              <div className={`p-6 rounded-3xl border-2 border-dashed ${darkMode ? 'bg-[#C9EA63]/5 border-[#C9EA63]/20' : 'bg-emerald-50 border-emerald-100'}`}>
                <h4 className="text-[10px] font-black uppercase tracking-widest mb-4 opacity-70">Identificación de la Orden</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase opacity-40 ml-1">Ref / Orden</label>
                    <input type="text" value={equipoEditando.orden_cotizacion || equipoEditando.folio_rastreo} className={`w-full p-3 rounded-xl text-sm font-bold border outline-none ${darkMode ? 'bg-[#141f0b] border-white/10 text-white opacity-50' : 'bg-white border-slate-200 text-slate-400'}`} disabled />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase opacity-40 ml-1">Empresa</label>
                    <input type="text" value={equipoEditando.empresa || equipoEditando.cliente} onChange={(e) => setEquipoEditando({...equipoEditando, empresa: e.target.value.toUpperCase()})} className={`w-full p-3 rounded-xl text-sm font-bold border outline-none ${darkMode ? 'bg-[#141f0b] border-white/10 text-[#C9EA63]' : 'bg-white border-slate-200 text-emerald-600'}`} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase opacity-40 ml-1">Contacto</label>
                    <input type="text" value={equipoEditando.persona} onChange={(e) => setEquipoEditando({...equipoEditando, persona: e.target.value})} className={`w-full p-3 rounded-xl text-sm font-bold border outline-none ${darkMode ? 'bg-[#141f0b] border-white/10 text-white' : 'bg-white border-slate-200 text-slate-800'}`} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase opacity-40 ml-1">SLA (Días)</label>
                    <Select 
                        options={opcionesSLA} 
                        value={opcionesSLA.find(o => o.value === equipoEditando.sla)} 
                        onChange={(val) => setEquipoEditando({...equipoEditando, sla: val.value})} 
                        styles={selectStyles} 
                    />
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2 text-[8px] font-black opacity-40 uppercase tracking-widest">
                   <AlertTriangle size={10} className="text-[#C9EA63]" />
                   <span>Cambiar Empresa/Contacto sincronizará toda la orden automáticamente.</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <h4 className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-2">Especificaciones Técnicas</h4>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase opacity-40 ml-1">Instrumento</label>
                    <input type="text" value={equipoEditando.nombre_instrumento} onChange={(e) => setEquipoEditando({...equipoEditando, nombre_instrumento: e.target.value.toUpperCase()})} className={`w-full p-3 rounded-xl text-sm font-bold border outline-none ${darkMode ? 'bg-white/5 border-white/10 text-[#C9EA63]' : 'bg-slate-50 border-slate-200 text-emerald-800'}`} required />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase opacity-40 ml-1">Marca</label>
                      <input type="text" value={equipoEditando.marca} onChange={(e) => setEquipoEditando({...equipoEditando, marca: e.target.value})} className={`w-full p-3 rounded-xl text-xs font-bold border outline-none ${darkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase opacity-40 ml-1">Modelo</label>
                      <input type="text" value={equipoEditando.modelo} onChange={(e) => setEquipoEditando({...equipoEditando, modelo: e.target.value})} className={`w-full p-3 rounded-xl text-xs font-bold border outline-none ${darkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase opacity-40 ml-1">No. Serie</label>
                      <input type="text" value={equipoEditando.no_serie} onChange={(e) => setEquipoEditando({...equipoEditando, no_serie: e.target.value})} className={`w-full p-3 rounded-xl text-xs font-bold border outline-none ${darkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase opacity-40 ml-1">ID / Tag</label>
                      <input type="text" value={equipoEditando.identificacion} onChange={(e) => setEquipoEditando({...equipoEditando, identificacion: e.target.value})} className={`w-full p-3 rounded-xl text-xs font-bold border outline-none ${darkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`} />
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <h4 className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-2">Requerimientos de Servicio</h4>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase opacity-40 ml-1">Tipo de Servicio</label>
                    <Select 
                        options={opcionesServicio.map(opt => ({ value: opt, label: opt }))}
                        value={{ value: equipoEditando.tipo_servicio, label: equipoEditando.tipo_servicio }}
                        onChange={(val) => setEquipoEditando({...equipoEditando, tipo_servicio: val.value})}
                        styles={selectStyles}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase opacity-40 ml-1">Ubicación en Planta</label>
                    <input type="text" value={equipoEditando.ubicacion || ''} onChange={(e) => setEquipoEditando({...equipoEditando, ubicacion: e.target.value})} className={`w-full p-3 rounded-xl text-sm font-bold border outline-none ${darkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`} placeholder="Ej: Laboratorio QC / Planta 1" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase opacity-40 ml-1">Puntos a Calibrar</label>
                    <textarea value={equipoEditando.puntos_calibrar || ''} onChange={(e) => setEquipoEditando({...equipoEditando, puntos_calibrar: e.target.value})} className={`w-full p-4 rounded-2xl text-xs border outline-none resize-none ${darkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`} rows="3" placeholder="Especificar puntos técnicos..." />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                 <div className="space-y-6">
                    <h4 className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-2">Asignación y Metrología</h4>
                    <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase opacity-40 ml-1">Área de Laboratorio</label>
                        <Select 
                            options={areas}
                            value={areas.find(a => a.value === (typeof equipoEditando.area_laboratorio === 'string' ? equipoEditando.area_laboratorio : equipoEditando.area_laboratorio?.value))}
                            onChange={(val) => setEquipoEditando({...equipoEditando, area_laboratorio: val.value})}
                            styles={selectStyles}
                            placeholder="Selecciona el área..."
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase opacity-40 ml-1">Responsables (Metrólogos)</label>
                        <Select 
                            isMulti
                            options={metrologosDisponibles}
                            value={equipoEditando.metrologos_asignados}
                            onChange={(vals) => setEquipoEditando({...equipoEditando, metrologos_asignados: vals})}
                            styles={selectStyles}
                            isLoading={cargandoMetrologos}
                            placeholder="Seleccionar técnicos responsables..."
                        />
                         <p className="text-[8px] font-bold opacity-30 uppercase tracking-widest mt-1">Puedes elegir varios responsables</p>
                    </div>
                 </div>

                 <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase opacity-40 ml-1">Requisitos Especiales / Notas</label>
                    <textarea value={equipoEditando.requerimientos_especiales || ''} onChange={(e) => setEquipoEditando({...equipoEditando, requerimientos_especiales: e.target.value})} className={`w-full p-4 rounded-2xl text-xs border outline-none resize-none ${darkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`} rows="4" placeholder="SST, Tolerancias específicas, etc..." />
                  </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button type="button" onClick={cerrarModalEditar} className={`flex-1 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${darkMode ? 'bg-white/5 hover:bg-white/10 text-white/60' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}>Cancelar</button>
                <button type="submit" className={`flex-[2] py-4 rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl transition-all flex items-center justify-center gap-2 ${darkMode ? 'bg-[#C9EA63] hover:bg-[#b0d14b] text-[#141f0b] shadow-[#C9EA63]/10' : 'bg-[#008a5e] hover:bg-[#007b55] text-white shadow-[#008a5e]/20'}`}>
                  <Save size={18} /> Guardar Cambios en Registro
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 3: MODIFICACIÓN AVANZADA (ORDEN COMPLETA) --- */}
      {modalOrdenAbierto && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 backdrop-blur-lg bg-black/60 animate-in fade-in duration-500">
          <div className={`w-full max-w-7xl max-h-[95vh] overflow-hidden rounded-[3rem] shadow-3xl border flex flex-col animate-in zoom-in-95 duration-500 ${darkMode ? 'bg-[#141f0b] border-[#C9EA63]/20' : 'bg-white border-slate-200'}`}>
            <div className={`p-8 border-b flex items-center justify-between ${darkMode ? 'border-white/5' : 'border-slate-100'}`}>
              <div className="flex items-center gap-5">
                <div className={`p-4 rounded-3xl ${darkMode ? 'bg-[#C9EA63] text-black shadow-lg shadow-[#C9EA63]/20' : 'bg-[#008a5e] text-white shadow-lg shadow-[#008a5e]/20'}`}>
                  <Layers size={28} />
                </div>
                <div>
                  <h3 className="text-2xl font-black uppercase tracking-tight">Gestión Integral de Orden</h3>
                  <p className="text-xs font-bold opacity-40 uppercase tracking-widest">Sincronización masiva y edición de lote: {folioEdicion}</p>
                </div>
              </div>
              <button onClick={() => setModalOrdenAbierto(false)} className="opacity-40 hover:opacity-100 transition-all hover:rotate-90"><X size={32} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
              {/* CABECERA GLOBAL */}
              <div className={`p-8 rounded-[2.5rem] border ${darkMode ? 'bg-[#C9EA63]/5 border-[#C9EA63]/10' : 'bg-emerald-50 border-emerald-100'}`}>
                <div className="flex items-center gap-2 mb-6 text-emerald-600">
                    <Settings2 size={18} />
                    <h4 className="text-[10px] font-black uppercase tracking-widest">Configuración Global de la Orden</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase opacity-40 ml-1">Empresa / Cliente</label>
                        <input 
                            type="text" 
                            value={instrumentosOrden[0]?.empresa || instrumentosOrden[0]?.cliente || ''} 
                            onChange={(e) => {
                                const val = e.target.value.toUpperCase();
                                setInstrumentosOrden(instrumentosOrden.map(ins => ({ ...ins, empresa: val, cliente: val })));
                            }}
                            className={`w-full p-4 rounded-2xl text-sm font-bold border outline-none ${darkMode ? 'bg-[#141f0b] border-white/10 text-[#C9EA63]' : 'bg-white border-slate-200 text-emerald-700'}`} 
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase opacity-40 ml-1">Contacto Principal</label>
                        <input 
                            type="text" 
                            value={instrumentosOrden[0]?.persona || ''} 
                            onChange={(e) => setInstrumentosOrden(instrumentosOrden.map(ins => ({ ...ins, persona: e.target.value })))}
                            className={`w-full p-4 rounded-2xl text-sm font-bold border outline-none ${darkMode ? 'bg-[#141f0b] border-white/10 text-white' : 'bg-white border-slate-200 text-slate-800'}`} 
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase opacity-40 ml-1">SLA Priorizado</label>
                        <Select 
                            options={opcionesSLA} 
                            value={opcionesSLA.find(o => o.value === instrumentosOrden[0]?.sla)} 
                            onChange={(val) => setInstrumentosOrden(instrumentosOrden.map(ins => ({ ...ins, sla: val.value })))}
                            styles={selectStyles} 
                        />
                    </div>
                </div>
              </div>

              {/* LISTADO DE EQUIPOS */}
              <div className="space-y-6">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                   <div className="flex items-center gap-2 text-slate-400">
                        <List size={18} />
                        <h4 className="text-[10px] font-black uppercase tracking-widest">Detalle de Instrumentos en el Lote</h4>
                   </div>
                   <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <span className="text-[9px] font-black opacity-40 uppercase">Área Global:</span>
                            <Select 
                                options={areas}
                                placeholder="Cambiar todos..."
                                onChange={(val) => {
                                    if (window.confirm("¿Deseas cambiar el área de laboratorio a todos los instrumentos de esta orden?")) {
                                        setInstrumentosOrden(instrumentosOrden.map(ins => ({ ...ins, area_laboratorio: val.value })));
                                    }
                                }}
                                styles={{...selectStyles, control: (b) => ({...b, minWidth: '180px', height: '32px', minHeight: '32px', fontSize: '10px'})}}
                            />
                        </div>
                        <button onClick={agregarEquipoAOrden} className={`flex items-center gap-2 px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all border ${darkMode ? 'border-[#C9EA63]/30 text-[#C9EA63] hover:bg-[#C9EA63]/10' : 'border-emerald-500 text-emerald-600 hover:bg-emerald-50'}`}>
                            <Plus size={16} /> AÑADIR OTRO EQUIPO
                        </button>
                   </div>
                </div>

                <div className={`rounded-[2.5rem] border overflow-hidden ${darkMode ? 'border-white/5 bg-white/5' : 'border-slate-100 bg-slate-50/50'}`}>
                    <table className="w-full text-left">
                        <thead>
                            <tr className={`text-[10px] font-black uppercase tracking-widest opacity-50 ${darkMode ? 'bg-white/5' : 'bg-slate-100'}`}>
                                <th className="p-6">Identificación</th>
                                <th className="p-6">Serie / ID</th>
                                <th className="p-6">Servicio / Área</th>
                                <th className="p-6 text-center">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {instrumentosOrden.map((ins, idx) => (
                                <tr key={idx} className={`transition-colors border-b last:border-0 ${darkMode ? 'hover:bg-white/5 border-white/5' : 'hover:bg-white border-slate-100'}`}>
                                    <td className="p-6">
                                        <div className="flex flex-col gap-4">
                                            <div className="space-y-1">
                                                <input type="text" placeholder="INSTRUMENTO" value={ins.nombre_instrumento} onChange={e => actualizarItemOrden(idx, 'nombre_instrumento', e.target.value.toUpperCase())} className={`w-full p-2.5 rounded-xl text-sm font-black border outline-none ${darkMode ? 'bg-[#141f0b] border-white/10 text-white' : 'bg-white border-slate-200 shadow-sm'}`} />
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <input type="text" placeholder="MARCA" value={ins.marca} onChange={e => actualizarItemOrden(idx, 'marca', e.target.value)} className={`w-full p-2 rounded-lg text-xs border outline-none ${darkMode ? 'bg-[#141f0b] border-white/5 text-white/80' : 'bg-white border-slate-200'}`} />
                                                <input type="text" placeholder="MODELO" value={ins.modelo} onChange={e => actualizarItemOrden(idx, 'modelo', e.target.value)} className={`w-full p-2 rounded-lg text-xs border outline-none ${darkMode ? 'bg-[#141f0b] border-white/5 text-white/80' : 'bg-white border-slate-200'}`} />
                                            </div>
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2 opacity-40 mb-1">
                                                    <MapPin size={10} />
                                                    <span className="text-[9px] font-black uppercase tracking-tighter">Ubicación</span>
                                                </div>
                                                <input type="text" placeholder="Ej: Laboratorio QC / Planta 1" value={ins.ubicacion || ''} onChange={e => actualizarItemOrden(idx, 'ubicacion', e.target.value)} className={`w-full p-2 rounded-lg text-xs border outline-none ${darkMode ? 'bg-[#141f0b] border-white/5 text-white' : 'bg-white border-slate-200'}`} />
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-6">
                                        <div className="flex flex-col gap-4">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2 opacity-40 mb-1">
                                                    <Activity size={10} />
                                                    <span className="text-[9px] font-black uppercase tracking-tighter">Serie / Tag</span>
                                                </div>
                                                <input type="text" placeholder="NO. SERIE" value={ins.no_serie} onChange={e => actualizarItemOrden(idx, 'no_serie', e.target.value)} className={`w-full p-2.5 rounded-xl text-xs font-mono font-bold border outline-none ${darkMode ? 'bg-[#141f0b] border-white/10 text-white' : 'bg-white border-slate-200'}`} />
                                                <input type="text" placeholder="ID / TAG" value={ins.identificacion} onChange={e => actualizarItemOrden(idx, 'identificacion', e.target.value)} className={`w-full p-2 rounded-lg text-xs font-bold border outline-none ${darkMode ? 'bg-[#141f0b] border-white/5 text-white/60' : 'bg-white border-slate-200'}`} />
                                            </div>
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2 opacity-40 mb-1">
                                                    <Layers size={10} />
                                                    <span className="text-[9px] font-black uppercase tracking-tighter">Puntos a Calibrar</span>
                                                </div>
                                                <textarea value={ins.puntos_calibrar || ''} onChange={e => actualizarItemOrden(idx, 'puntos_calibrar', e.target.value)} className={`w-full p-3 rounded-xl text-[11px] leading-snug border outline-none resize-none ${darkMode ? 'bg-[#141f0b] border-white/10 text-white' : 'bg-white border-slate-200'}`} rows="3" placeholder="Puntos específicos..." />
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-6">
                                        <div className="flex flex-col gap-4">
                                            <div className="grid grid-cols-2 gap-2">
                                                <div className="space-y-1">
                                                    <span className="text-[9px] font-black opacity-40 uppercase ml-1 tracking-tighter">Servicio</span>
                                                    <Select 
                                                        options={opcionesServicio.map(opt => ({ value: opt, label: opt }))}
                                                        value={{ value: ins.tipo_servicio, label: ins.tipo_servicio }}
                                                        onChange={(val) => actualizarItemOrden(idx, 'tipo_servicio', val.value)}
                                                        styles={{...selectStyles, control: (b) => ({...b, height: '32px', minHeight: '32px', fontSize: '10px'})}}
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <span className="text-[9px] font-black opacity-40 uppercase ml-1 tracking-tighter">Área</span>
                                                    <Select 
                                                        options={areas}
                                                        value={areas.find(a => a.value === ins.area_laboratorio)}
                                                        onChange={(val) => actualizarItemOrden(idx, 'area_laboratorio', val.value)}
                                                        styles={{...selectStyles, control: (b) => ({...b, height: '32px', minHeight: '32px', fontSize: '10px'})}}
                                                        placeholder="ÁREA..."
                                                    />
                                                </div>
                                            </div>
                                            
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2 opacity-40 mb-1">
                                                    <User size={10} />
                                                    <span className="text-[9px] font-black uppercase tracking-tighter">Responsables</span>
                                                </div>
                                                <Select 
                                                    isMulti
                                                    options={metrologosDisponibles.length > 0 ? metrologosDisponibles : []}
                                                    value={ins.metrologos_asignados || []}
                                                    onChange={(vals) => actualizarItemOrden(idx, 'metrologos_asignados', vals)}
                                                    styles={{...selectStyles, control: (b) => ({...b, minHeight: '32px', fontSize: '10px'})}}
                                                    placeholder="Elegir..."
                                                />
                                            </div>

                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2 opacity-40 mb-1">
                                                    <AlertCircle size={10} />
                                                    <span className="text-[9px] font-black uppercase tracking-tighter">Requisitos Especiales</span>
                                                </div>
                                                <textarea value={ins.requerimientos_especiales || ''} onChange={e => actualizarItemOrden(idx, 'requerimientos_especiales', e.target.value)} className={`w-full p-2.5 rounded-lg text-[10px] leading-tight border outline-none resize-none italic ${darkMode ? 'bg-[#141f0b] border-white/5 text-white/50' : 'bg-amber-50/50 border-amber-100 text-slate-500'}`} rows="2" placeholder="Notas adicionales..." />
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-4 text-center">
                                        <button onClick={() => removerDeOrden(idx)} className="p-3 text-rose-500 hover:bg-rose-500/10 rounded-2xl transition-all" title="Eliminar del lote"><Trash2 size={24} /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
              </div>
            </div>

            <div className={`p-8 border-t flex justify-end gap-5 ${darkMode ? 'bg-[#253916]/20 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
                <button onClick={() => setModalOrdenAbierto(false)} disabled={guardandoOrden} className={`px-8 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${darkMode ? 'text-white/40 hover:text-white' : 'text-slate-500 hover:text-slate-800'}`}>Descartar Cambios</button>
                <button onClick={guardarCambiosOrden} disabled={guardandoOrden} className={`px-12 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-2xl flex items-center gap-3 transition-all ${darkMode ? 'bg-[#C9EA63] hover:bg-[#b0d14b] text-[#141f0b] shadow-[#C9EA63]/20' : 'bg-[#008a5e] hover:bg-[#007b55] text-white shadow-[#008a5e]/30'}`}>
                    {guardandoOrden ? <RefreshCw className="animate-spin" /> : <Save size={20} />} 
                    APLICAR CAMBIOS Y SINCRONIZAR
                </button>
            </div>
          </div>
        </div>
      )}

    </div>

      {popover && createPortal(
        <div
          className={`fixed z-[500] w-72 rounded-2xl shadow-2xl border pointer-events-none animate-in fade-in zoom-in-95 duration-150 ${darkMode ? 'bg-[#141f0b] border-[#C9EA63]/30 text-[#F2F6F0]' : 'bg-white border-slate-200 text-slate-800'}`}
          style={{ top: popover.y, left: popover.x }}
        >
          <div className="p-4 space-y-2">
            <p className="text-[10px] uppercase font-black opacity-40">Vista Rápida</p>
            <p className="text-sm font-bold">{popover.eq.nombre_instrumento}</p>
            <p className="text-xs opacity-70">Folio: {popover.eq.orden_cotizacion}</p>
            <p className="text-xs opacity-70">Serie: {popover.eq.no_serie}</p>
            <p className="text-[10px] opacity-70 mt-1 font-bold">Área: {popover.eq.area_laboratorio || 'Sin área'}</p>
            <div className="flex flex-wrap gap-1 mt-1">
               {popover.eq.metrologos_asignados?.map(m => (
                 <span key={m.id} className="text-[9px] bg-emerald-500/10 text-emerald-600 dark:text-[#C9EA63] px-1.5 py-0.5 rounded border border-emerald-500/20">
                   {m.nombre.split(' ')[0]}
                 </span>
               ))}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default ListaEquipos;
