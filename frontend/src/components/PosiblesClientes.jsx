import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Target, Search, Plus, Filter, Mail, Phone, CheckCircle, ArrowRight } from 'lucide-react';

const PosiblesClientes = ({ darkMode }) => {
  const [leads, setLeads] = useState([]);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [nuevoLead, setNuevoLead] = useState({ nombre: '', telefono: '', interes: '' });

  const boxBg = darkMode ? 'bg-[#253916] border-[#C9EA63]/20' : 'bg-white border-gray-100 shadow-xl';
  const textTitle = darkMode ? 'text-[#F2F6F0]' : 'text-slate-800';
  const inputBg = darkMode ? 'bg-[#141f0b] border-[#C9EA63]/40 text-[#F2F6F0]' : 'bg-slate-50 border-gray-200 text-slate-800';

  const fetchLeads = async () => {
    try {
        const res = await axios.get('http://localhost:3001/api/leads');
        setLeads(res.data);
    } catch (error) {
        console.error("Error al obtener leads", error);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, []);

  const handleAgregarLead = async () => {
    if(!nuevoLead.nombre || !nuevoLead.telefono) return alert("Falta nombre o teléfono");
    try {
        await axios.post('http://localhost:3001/api/leads', nuevoLead);
        setModalAbierto(false);
        setNuevoLead({ nombre: '', telefono: '', interes: '' });
        fetchLeads();
    } catch(err) { console.error(err); }
  };

  const convertirACliente = async (lead) => {
    try {
        // 1. Añadir a catálogo de Clientes
        await axios.post('http://localhost:3001/api/catalogo/clientes', { empresa: lead.nombre, contacto: lead.nombre });
        // 2. Marcar lead como Convertido
        await axios.put(`http://localhost:3001/api/leads/${lead.id}`, { estado: 'Convertido' });
        // 3. Informar
        alert(`¡Felicidades! ${lead.nombre} ha sido convertido en un Cliente activo de SICAMET.`);
        fetchLeads();
    } catch(err) { console.error(err); }
  };

  const marcarContactado = async (lead) => {
    try {
        await axios.put(`http://localhost:3001/api/leads/${lead.id}`, { estado: 'Contactado' });
        fetchLeads();
    } catch(err) { console.error(err); }
  };

  return (
    <div className="w-full space-y-8 relative">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-6 border-opacity-20 border-[#C9EA63]">
        <div>
          <h2 className={`text-3xl font-bold flex items-center gap-3 ${textTitle}`}>
            <Target className={darkMode ? 'text-[#C9EA63]' : 'text-emerald-600'} size={32} /> 
            Posibles Clientes (Leads)
          </h2>
          <p className={`mt-2 text-sm ${darkMode ? 'text-[#F2F6F0]/70' : 'text-gray-500'}`}>
            Prospectos comerciales para venta de servicios.
          </p>
        </div>
        
        <button onClick={() => setModalAbierto(true)} className={`px-4 py-2 rounded-lg font-bold text-sm transition-all focus:outline-none flex items-center gap-2 shadow-md ${darkMode ? 'bg-[#C9EA63] text-[#141f0b] hover:bg-[#b0d14b]' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}>
            <Plus size={16}/> Agregar Lead
        </button>
      </div>

      <div className={`rounded-2xl border p-6 transition-colors duration-300 ${boxBg}`}>
        <div className="mb-6 flex flex-col md:flex-row gap-4">
            <div className={`flex items-center gap-2 w-full max-w-md px-4 py-2 border rounded-xl ${inputBg}`}>
                <Search size={18} className={darkMode ? 'text-[#F2F6F0]/50' : 'text-slate-400'} />
                <input type="text" placeholder="Buscar prospecto..." className="bg-transparent border-none outline-none w-full text-sm" />
            </div>
            <button className={`px-4 py-2 border rounded-xl flex items-center gap-2 text-sm font-medium ${darkMode ? 'border-[#C9EA63]/30 text-[#F2F6F0] hover:bg-[#141f0b]' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                <Filter size={16}/> Filtrar Status
            </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {leads.map((lead) => (
                <div key={lead.id} className={`p-5 border rounded-xl flex flex-col justify-between ${darkMode ? 'border-[#C9EA63]/20 bg-[#141f0b]' : 'border-slate-200 bg-white'}`}>
                    <div>
                        <div className="flex justify-between items-start mb-3">
                            <span className={`px-2 py-1 text-[10px] uppercase font-bold tracking-wider rounded-md ${
                                lead.estado === 'Convertido' ? 'bg-emerald-500 text-white' : 
                                (darkMode ? 'bg-[#253916] text-[#C9EA63]' : 'bg-emerald-100 text-emerald-800')
                            }`}>
                                {lead.estado}
                            </span>
                            <span className="text-xs opacity-50 font-medium">{new Date(lead.fecha).toLocaleDateString()}</span>
                        </div>
                        <h3 className={`font-bold text-lg mb-1 leading-tight ${textTitle}`}>{lead.nombre}</h3>
                        <p className={`text-sm mb-4 italic ${darkMode ? 'text-[#F2F6F0]/60' : 'text-slate-500'}`}>Interés: {lead.interes || 'Cotización General'}</p>
                        
                        <div className="space-y-2 mb-5 border-t border-inherit pt-3">
                            <p className={`flex items-center gap-2 text-xs opacity-80 ${textTitle}`}><Phone size={14}/> {lead.telefono}</p>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2 pt-4">
                        {lead.estado !== 'Convertido' && (
                            <button onClick={() => convertirACliente(lead)} className={`w-full py-2 rounded-lg text-sm font-bold shadow-sm transition-colors ${darkMode ? 'bg-[#253916] text-[#C9EA63] border border-[#C9EA63]/30 hover:bg-[#314a1c]' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}>
                                🎉 Convertir a Cliente
                            </button>
                        )}
                        {lead.estado === 'Pendiente' && (
                            <button onClick={() => marcarContactado(lead)} className={`w-full py-2 rounded-lg text-xs font-bold transition-colors ${darkMode ? 'bg-transparent text-[#F2F6F0] hover:underline' : 'bg-transparent text-slate-500 hover:underline'}`}>
                                Marcar como Contactado
                            </button>
                        )}
                    </div>
                </div>
            ))}
            {leads.length === 0 && (
                <div className="col-span-full p-8 text-center opacity-50 text-sm">No hay prospectos registrados aún.</div>
            )}
        </div>
      </div>

      {/* Modal Nuevo Lead */}
      {modalAbierto && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm p-4">
            <div className={`p-6 rounded-2xl w-full max-w-sm border shadow-2xl ${boxBg}`}>
                <h3 className={`text-xl font-bold mb-4 ${textTitle}`}>Capturar Nuevo Prospecto</h3>
                <div className="space-y-4">
                    <div>
                        <label className={`block text-xs font-bold mb-1 ${darkMode ? 'text-[#C9EA63]' : 'text-slate-500'}`}>Nombre o Empresa</label>
                        <input type="text" className={`w-full p-2 rounded-lg border text-sm ${inputBg}`}
                            value={nuevoLead.nombre} onChange={e => setNuevoLead({...nuevoLead, nombre: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className={`block text-xs font-bold mb-1 ${darkMode ? 'text-[#C9EA63]' : 'text-slate-500'}`}>Teléfono WP</label>
                        <input type="text" className={`w-full p-2 rounded-lg border text-sm ${inputBg}`}
                            value={nuevoLead.telefono} onChange={e => setNuevoLead({...nuevoLead, telefono: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className={`block text-xs font-bold mb-1 ${darkMode ? 'text-[#C9EA63]' : 'text-slate-500'}`}>Área de Interés</label>
                        <input type="text" placeholder="Ej: Calibración de masas" className={`w-full p-2 rounded-lg border text-sm ${inputBg}`}
                            value={nuevoLead.interes} onChange={e => setNuevoLead({...nuevoLead, interes: e.target.value})}
                        />
                    </div>
                </div>
                <div className="flex gap-3 justify-end mt-6">
                    <button onClick={() => setModalAbierto(false)} className={`px-4 py-2 rounded-lg text-sm font-bold ${darkMode ? 'text-[#F2F6F0] hover:bg-[#141f0b]' : 'text-slate-600 hover:bg-slate-100'}`}>Cancelar</button>
                    <button onClick={handleAgregarLead} className={`px-4 py-2 rounded-lg text-sm font-bold ${darkMode ? 'bg-[#C9EA63] text-[#141f0b]' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}>Guardar</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default PosiblesClientes;
