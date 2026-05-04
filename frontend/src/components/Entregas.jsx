import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Package, Search, Filter, CheckCircle2, 
  ChevronRight, Calendar, Building2, User, FileText,
  ExternalLink, ArrowRight, Tag, X, AlertTriangle, Truck
} from 'lucide-react';
import { toast } from 'react-toastify';

const ConfirmModal = ({ isOpen, onClose, onConfirm, titulo, mensaje, darkMode, selectedCount }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex justify-center items-center p-4 animate-in fade-in duration-200">
      <div className={`w-full max-w-md rounded-3xl shadow-2xl p-6 md:p-8 border animate-in zoom-in-95 duration-200 ${darkMode ? 'bg-[#141f0b] border-[#C9EA63]/20 text-[#F2F6F0]' : 'bg-white border-slate-200 text-slate-800'}`}>
        <div className="flex items-center justify-center w-14 h-14 rounded-full bg-[#008a5e]/10 text-[#008a5e] mb-6 mx-auto">
          <Truck size={32} />
        </div>
        <h2 className="text-2xl font-black text-center mb-2">{titulo}</h2>
        <p className="text-sm text-center opacity-70 mb-8 leading-relaxed">{mensaje}</p>
        
        <div className="flex gap-4">
          <button 
            onClick={onClose} 
            className={`flex-1 py-3 font-bold rounded-2xl transition-all ${darkMode ? 'bg-[#253916] text-white hover:bg-[#314a1c]' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            Cancelar
          </button>
           <button 
            onClick={onConfirm} 
            className={`flex-[2] py-3 font-black rounded-2xl transition-all shadow-lg shadow-[#008a5e]/10 active:scale-95 bg-[#008a5e] text-white hover:bg-[#007b55]`}
          >
            Confirmar Entrega
          </button>
        </div>
      </div>
    </div>
  );
};

const Entregas = ({ darkMode, usuario }) => {
  const [equipos, setEquipos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [modalConfirm, setModalConfirm] = useState({ open: false, ids: [] });

  useEffect(() => {
    fetchEquipos();
    const handleRefresh = () => fetchEquipos();
    window.addEventListener('crm:refresh', handleRefresh);
    return () => window.removeEventListener('crm:refresh', handleRefresh);
  }, []);

  const fetchEquipos = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/instrumentos');
      const listos = res.data.filter(e => e.estatus_actual === 'Facturación');
      setEquipos(listos);
    } catch (err) {
      console.error(err);
      toast.error('Error al cargar equipos');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenConfirm = (ids) => {
    setModalConfirm({ open: true, ids });
  };

  const confirmarEntrega = async () => {
    const ids = modalConfirm.ids;
    try {
      await axios.post('/api/instrumentos/bulk-status', {
        ids: ids,
        estatus: 'Entregado',
        comentario: 'Equipo entregado al cliente por Recepción.'
      });
      toast.success(ids.length === 1 ? 'Equipo entregado' : `${ids.length} equipos entregados correctamente`);
      setSelectedIds(prev => prev.filter(id => !ids.includes(id)));
      setModalConfirm({ open: false, ids: [] });
      fetchEquipos();
      window.dispatchEvent(new CustomEvent('actualizacion_operativa'));
    } catch (err) {
      toast.error('Error al procesar la entrega');
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = (ids) => {
    const allIn = ids.every(id => selectedIds.includes(id));
    if (allIn) {
      setSelectedIds(prev => prev.filter(id => !ids.includes(id)));
    } else {
      setSelectedIds(prev => [...new Set([...prev, ...ids])]);
    }
  };

  const filtrados = equipos.filter(e => 
    e.orden_cotizacion.toLowerCase().includes(busqueda.toLowerCase()) ||
    e.empresa.toLowerCase().includes(busqueda.toLowerCase()) ||
    e.nombre_instrumento.toLowerCase().includes(busqueda.toLowerCase()) ||
    (e.no_serie && e.no_serie.toLowerCase().includes(busqueda.toLowerCase()))
  );

  const gruposOC = {};
  filtrados.forEach(e => {
    if (!gruposOC[e.orden_cotizacion]) gruposOC[e.orden_cotizacion] = [];
    gruposOC[e.orden_cotizacion].push(e);
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className={`text-3xl font-black tracking-tighter flex items-center gap-3 ${darkMode ? 'text-[#C9EA63]' : 'text-[#253916]'}`}>
            <Truck size={36} />
            Módulo de Entregas
          </h1>
          <p className={darkMode ? 'text-[#F2F6F0]/60' : 'text-[#253916]/60'}>
            Bandeja de equipos certificados listos para ser retirados por el cliente.
          </p>
        </div>

        {selectedIds.length > 0 && (
          <button
            onClick={() => handleOpenConfirm(selectedIds)}
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-black shadow-xl transition-all scale-105 active:scale-95 ${darkMode ? 'bg-[#C9EA63] text-[#141f0b] shadow-[#C9EA63]/10 hover:bg-[#b0d14b]' : 'bg-[#008a5e] text-white shadow-[#008a5e]/20 hover:bg-[#007b55]'}`}
          >
            <CheckCircle2 size={20} />
            Entregar {selectedIds.length} seleccionados
          </button>
        )}
      </div>

      <div className={`relative flex items-center p-1 rounded-2xl ${darkMode ? 'bg-[#253916]/30' : 'bg-white shadow-sm border border-gray-100'}`}>
        <Search className={`absolute left-4 ${darkMode ? 'text-[#C9EA63]/40' : 'text-gray-400'}`} size={20} />
        <input
          type="text"
          placeholder="Buscar por OC, empresa, instrumento..."
          className="w-full pl-12 pr-4 py-3 bg-transparent outline-none font-medium"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className={`w-12 h-12 border-4 rounded-full animate-spin ${darkMode ? 'border-[#C9EA63]/20 border-t-[#C9EA63]' : 'border-[#65D067]/20 border-t-[#65D067]'}`} />
          <p className="font-bold animate-pulse text-sm opacity-60">Sincronizando con almacén...</p>
        </div>
      ) : equipos.length === 0 ? (
        <div className={`flex flex-col items-center justify-center py-24 rounded-[3rem] border-2 border-dashed transition-colors ${darkMode ? 'border-[#C9EA63]/10 text-[#C9EA63]/20 hover:border-[#C9EA63]/20' : 'border-gray-200 text-gray-400 hover:border-gray-300'}`}>
          <Truck size={80} className="mb-6 opacity-10" />
          <p className="text-2xl font-black">Todo entregado</p>
          <p className="text-sm font-medium mt-1">No hay equipos pendientes de retiro en este momento.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-8">
          {Object.keys(gruposOC).map(oc => {
            const items = gruposOC[oc];
            const allSelected = items.every(i => selectedIds.includes(i.id));
            
            return (
              <div key={oc} className={`group rounded-[2rem] overflow-hidden border transition-all duration-300 ${
                darkMode ? 'bg-[#253916]/10 border-[#C9EA63]/10 hover:border-[#C9EA63]/30' : 'bg-white border-gray-100 shadow-sm hover:shadow-xl'
              }`}>
                <div className={`px-8 py-5 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b transition-colors ${
                  darkMode ? 'bg-[#C9EA63]/5 border-[#C9EA63]/10 group-hover:bg-[#C9EA63]/10' : 'bg-gray-50/50 border-gray-100 group-hover:bg-gray-50'
                }`}>
                  <div className="flex items-center gap-4">
                     <button 
                      onClick={() => toggleSelectAll(items.map(i => i.id))}
                      className={`w-7 h-7 rounded-xl border-2 flex items-center justify-center transition-all ${
                        allSelected 
                          ? (darkMode ? 'bg-[#C9EA63] border-[#C9EA63] text-black' : 'bg-[#008a5e] border-[#008a5e] text-white')
                          : (darkMode ? 'border-[#C9EA63]/20 hover:border-[#C9EA63]/50' : 'border-gray-300 hover:border-gray-400')
                      }`}
                    >
                      {allSelected && <CheckCircle2 size={18} strokeWidth={3} />}
                    </button>
                    <div>
                      <h3 className={`font-black text-xl tracking-tight ${darkMode ? 'text-[#C9EA63]' : 'text-[#253916]'}`}>{oc}</h3>
                      <div className="flex items-center gap-2 text-xs font-bold opacity-50 uppercase tracking-widest mt-0.5">
                        <Building2 size={12} />
                        <span>{items[0].empresa}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="hidden md:flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-[10px] opacity-40 uppercase font-black tracking-widest mb-1">EQUIPOS EN LOTE</p>
                      <p className="font-black text-lg">{items.length}</p>
                    </div>
                  </div>
                </div>

                <div className="divide-y divide-gray-100/5">
                  {items.map(ins => (
                    <div 
                      key={ins.id}
                      className={`px-8 py-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all ${
                        selectedIds.includes(ins.id) 
                          ? (darkMode ? 'bg-[#C9EA63]/5' : 'bg-[#65D067]/5')
                          : 'hover:bg-gray-50/30 dark:hover:bg-[#C9EA63]/5'
                      }`}
                    >
                      <div className="flex items-start gap-5 flex-1">
                         <button 
                          onClick={() => toggleSelect(ins.id)}
                          className={`mt-1 w-6 h-6 rounded-lg flex-shrink-0 border-2 flex items-center justify-center transition-all ${
                            selectedIds.includes(ins.id)
                              ? (darkMode ? 'bg-[#C9EA63] border-[#C9EA63] text-black' : 'bg-[#008a5e] border-[#008a5e] text-white')
                              : (darkMode ? 'border-[#C9EA63]/10 hover:border-[#C9EA63]/40' : 'border-gray-200 hover:border-gray-300')
                          }`}
                        >
                          {selectedIds.includes(ins.id) && <CheckCircle2 size={14} strokeWidth={4} />}
                        </button>
                        
                        <div className="min-w-0 flex-1">
                          <p className={`font-black text-base truncate ${darkMode ? 'text-[#F2F6F0]' : 'text-gray-900'}`}>{ins.nombre_instrumento}</p>
                          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-1.5">
                            <span className="text-xs font-bold opacity-50 flex items-center gap-1.5">
                              <Tag size={12} className="text-[#C9EA63]" /> SN: {ins.no_serie || 'N/A'}
                            </span>
                            <span className="text-xs font-bold opacity-50 flex items-center gap-1.5">
                              <User size={12} className="text-[#C9EA63]" /> {ins.persona || 'Sin asignar'}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-black uppercase ${darkMode ? 'bg-amber-500/10 text-amber-500' : 'bg-amber-100 text-amber-800'}`}>Área: {ins.area_laboratorio || 'N/A'}</span>
                          </div>
                          <div className="flex flex-wrap gap-1 mt-2">
                             {ins.metrologos_asignados?.map((m, idx) => (
                               <span key={idx} className={`text-[9px] px-2 py-0.5 rounded font-bold border ${darkMode ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                                 {m.nombre.split(' ')[0]}
                               </span>
                             ))}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        {ins.certificado_url ? (
                           <a 
                            href={ins.certificado_url} 
                            target="_blank" 
                            rel="noreferrer"
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all shadow-sm ${darkMode ? 'bg-[#C9EA63] text-[#141f0b] hover:bg-[#b0d14b] shadow-[#C9EA63]/10' : 'bg-[#008a5e] text-white hover:bg-[#007b55] shadow-[#008a5e]/20'}`}
                          >
                            <FileText size={16} />
                            Ver PDF
                            <ExternalLink size={12} />
                          </a>
                        ) : (
                          <div className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-[11px] font-bold opacity-30 border border-dashed ${darkMode ? 'border-[#C9EA63]/30 text-[#C9EA63]' : 'border-gray-400 text-gray-400'}`}>
                             SIN CERTIFICADO
                          </div>
                        )}
                        
                         <button
                           onClick={() => handleOpenConfirm([ins.id])}
                           className={`p-3 rounded-2xl transition-all ${darkMode ? 'bg-[#C9EA63]/10 text-[#C9EA63] hover:bg-[#C9EA63] hover:text-[#141f0b]' : 'bg-[#008a5e]/10 text-[#008a5e] hover:bg-[#008a5e] hover:text-white'}`}
                           title="Entregar ahora"
                         >
                           <CheckCircle2 size={24} />
                         </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmModal 
        isOpen={modalConfirm.open}
        onClose={() => setModalConfirm({ open: false, ids: [] })}
        onConfirm={confirmarEntrega}
        titulo={modalConfirm.ids.length === 1 ? '¿Confirmar entrega?' : `¿Confirmar ${modalConfirm.ids.length} entregas?`}
        mensaje={`Al confirmar, el estatus de los equipos pasará a "Entregado" y se registrará la salida final en la bitácora.`}
        darkMode={darkMode}
        selectedCount={modalConfirm.ids.length}
      />
    </div>
  );
};

export default Entregas;
