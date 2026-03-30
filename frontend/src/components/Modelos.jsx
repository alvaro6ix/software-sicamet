import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Database, FileUp, Loader2, Plus, Edit2, Trash2, Search, Package, X, Save, Eye, AlertCircle, FileDown } from 'lucide-react';
import * as XLSX from 'xlsx';
const Modelos = ({ darkMode }) => {
  const excelInputRef = useRef(null);
  const [cargandoExcel, setCargandoExcel] = useState(false);
  const [modelos, setModelos] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  
  const [modalAbierto, setModalAbierto] = useState(false);
  const [nuevoItem, setNuevoItem] = useState({ nombre: '', marca: '' });
  const [editandoItem, setEditandoItem] = useState(null);
  const [viendoItem, setViendoItem] = useState(null);
  const [modalConfirmarVaciar, setModalConfirmarVaciar] = useState(false);
  const [modalConfirmarEliminar, setModalConfirmarEliminar] = useState(false);
  const [itemAEliminar, setItemAEliminar] = useState(null);

  const abrirModalEliminar = (id) => {
    setItemAEliminar(id);
    setModalConfirmarEliminar(true);
  };

  const handleDeleteMasivo = async () => {
    try {
      await axios.delete('http://localhost:3001/api/catalogo/modelos/all');
      alert(`✅ Todos los registros fueron eliminados exitosamente.`);
      setModalConfirmarVaciar(false);
      fetchModelos();
    } catch(err) {
      alert("Error al vaciar modelos");
    }
  };

  const fetchModelos = async () => {
    try {
      const res = await axios.get('http://localhost:3001/api/catalogo/modelos');
      setModelos(res.data);
    } catch(err) { console.error("Error cargando modelos"); }
  };

  useEffect(() => {
    fetchModelos();
  }, []);

  const handleSubirExcel = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setCargandoExcel(true);
    const body = new FormData();
    body.append('archivoExcel', file);
    body.append('tipo', 'modelos'); 

    try {
      const res = await axios.post('http://localhost:3001/api/importar-catalogo', body);
      alert(`✅ ${res.data.message}`);
      fetchModelos();
    } catch (err) { alert("Error al subir excel de modelos."); }
    finally { setCargandoExcel(false); event.target.value = null; }
  };

  const handleDelete = async () => {
    if (!itemAEliminar) return;
    try {
      await axios.delete(`http://localhost:3001/api/catalogo/modelos/${itemAEliminar}`);
      fetchModelos();
      setModalConfirmarEliminar(false);
      setItemAEliminar(null);
    } catch(err) { alert("Error al eliminar"); }
  };

  const handleGuardarManual = async (e) => {
    e.preventDefault();
    try {
      await axios.post('http://localhost:3001/api/catalogo/modelos', nuevoItem);
      setModalAbierto(false);
      setNuevoItem({ nombre: '', marca: '' });
      fetchModelos();
    } catch(err) { 
      const serverMsg = err.response?.data?.error || err.message;
      alert(`Error al guardar modelo: ${serverMsg}`); 
    }
  };

  const abrirModalEditar = (item) => {
    setEditandoItem({ ...item });
  };

  const handleGuardarEdicion = async (e) => {
    e.preventDefault();
    try {
      await axios.put(`http://localhost:3001/api/catalogo/modelos/${editandoItem.id}`, editandoItem);
      setEditandoItem(null);
      fetchModelos();
    } catch(err) { 
      const serverMsg = err.response?.data?.error || err.message;
      alert(`Error al guardar modelo: ${serverMsg}`); 
    }
  };

  const modelosFiltrados = modelos.filter(item => 
    item.nombre.toLowerCase().includes(busqueda.toLowerCase()) || 
    (item.marca && item.marca.toLowerCase().includes(busqueda.toLowerCase()))
  );

  const handleExportarExcel = () => {
    if (modelos.length === 0) return alert("No hay datos para exportar");
    const ws = XLSX.utils.json_to_sheet(modelos.map(item => ({
      'ID': item.id,
      'Nombre de Modelo': item.nombre,
      'Marca': item.marca || ''
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Modelos");
    XLSX.writeFile(wb, "Modelos_Export.xlsx");
  };

  const boxBg = darkMode ? 'bg-[#253916] border-[#C9EA63]/20' : 'bg-white border-gray-100 shadow-xl';
  const textTitle = darkMode ? 'text-[#F2F6F0]' : 'text-slate-800';
  const inputBg = darkMode ? 'bg-[#141f0b] border-[#C9EA63]/40 text-[#F2F6F0]' : 'bg-slate-50 border-gray-200 text-slate-800';

  return (
    <div className="w-full space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-6 border-opacity-20 border-[#C9EA63]">
        {/* ... */}
        <div>
          <h2 className={`text-3xl font-bold flex items-center gap-3 ${textTitle}`}>
            <Package className={darkMode ? 'text-[#C9EA63]' : 'text-emerald-600'} size={32} /> 
            Catálogo de Modelos
          </h2>
          <p className={`mt-2 text-sm ${darkMode ? 'text-[#F2F6F0]/70' : 'text-gray-500'}`}>
            Base de datos de modelos específicos de instrumentos.
          </p>
        </div>
        
        <div className="flex items-start gap-3 flex-wrap md:flex-nowrap justify-end">
            <button onClick={() => setModalAbierto(true)} className={`px-4 py-2 rounded-lg font-bold text-sm whitespace-nowrap transition-all focus:outline-none flex items-center gap-2 max-h-[36px] ${darkMode ? 'bg-[#141f0b] text-[#C9EA63] border border-[#C9EA63]/30 hover:bg-[#314a1c]' : 'bg-white border border-gray-200 text-slate-700 hover:bg-slate-50 shadow-sm'}`}>
                <Plus size={16}/> Nuevo Modelo
            </button>
            
            <div className="flex flex-col items-end gap-1">
              <div className="flex gap-2">
                <input type="file" accept=".xlsx, .xls" ref={excelInputRef} onChange={handleSubirExcel} className="hidden" />
                <button onClick={() => excelInputRef.current.click()} disabled={cargandoExcel} className={`px-4 py-2 rounded-lg font-bold text-sm whitespace-nowrap transition-all focus:outline-none flex items-center gap-2 max-h-[36px] shadow-md ${darkMode ? 'bg-[#C9EA63] text-[#141f0b] hover:bg-[#b0d14b]' : 'bg-emerald-600 text-white hover:bg-emerald-700'} ${cargandoExcel ? 'opacity-50' : ''}`}>
                    {cargandoExcel ? <Loader2 className="animate-spin" size={16} /> : <FileUp size={16} />} Masivo
                </button>
                <button onClick={handleExportarExcel} className={`px-4 py-2 rounded-lg font-bold text-sm whitespace-nowrap transition-all focus:outline-none flex items-center gap-2 max-h-[36px] shadow-md ${darkMode ? 'bg-[#141f0b] text-[#C9EA63] border border-[#C9EA63]/50 hover:bg-[#314a1c]' : 'bg-emerald-50 text-emerald-600 border border-emerald-100 hover:bg-emerald-100'}`}>
                  <FileDown size={16} /> Exportar
                </button>
                <button onClick={() => setModalConfirmarVaciar(true)} className={`px-4 py-2 rounded-lg font-bold text-sm whitespace-nowrap transition-all focus:outline-none flex items-center gap-2 max-h-[36px] shadow-md ${darkMode ? 'bg-rose-900 text-rose-300 hover:bg-rose-800' : 'bg-rose-100 text-rose-600 hover:bg-rose-200'}`}>
                  <Trash2 size={16} /> Vaciar
                </button>
              </div>
              <p className={`text-[10px] text-right mt-1 max-w-[200px] leading-tight ${darkMode ? 'text-[#F2F6F0]/60' : 'text-slate-500'}`}>
                El Excel debe tener columnas <b>nombre</b> (modelo) y <b>marca</b> de forma obligatoria.
              </p>
            </div>
        </div>
      </div>

      <div className={`rounded-2xl border p-6 transition-colors duration-300 ${boxBg}`}>
        <div className="mb-6 flex gap-4">
            <div className={`flex items-center gap-2 w-full max-w-md px-4 py-2 border rounded-xl ${inputBg}`}>
                <Search size={18} className={darkMode ? 'text-[#F2F6F0]/50' : 'text-slate-400'} />
                <input 
                    type="text" 
                    placeholder="Buscar por modelo o marca..." 
                    className="bg-transparent border-none outline-none w-full text-sm"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                />
            </div>
        </div>

        <div className={`border rounded-xl overflow-x-auto shadow-sm ${darkMode ? 'border-[#C9EA63]/20' : 'border-slate-200'}`}>
            <table className="w-full text-sm text-left">
                <thead className={`text-xs uppercase border-b ${darkMode ? 'bg-[#141f0b] text-[#C9EA63]' : 'bg-slate-100 text-slate-600'}`}>
                    <tr>
                        <th className="px-4 py-4 w-24">ID</th>
                        <th className="px-4 py-4">Nombre del Modelo</th>
                        <th className="px-4 py-4 break-words">Marca Asociada</th>
                        <th className="px-4 py-4 w-32 text-center">Acciones</th>
                    </tr>
                </thead>
                <tbody className={darkMode ? 'divide-y divide-[#C9EA63]/10' : 'divide-y divide-slate-100'}>
                    {modelosFiltrados.map(item => (
                        <tr key={item.id} className={`transition-colors ${darkMode ? 'bg-[#253916] hover:bg-[#314a1c]' : 'bg-white hover:bg-emerald-50/50'}`}>
                            <td className="px-4 py-3 font-medium opacity-60">#{item.id}</td>
                            <td className="px-4 py-3 font-bold">{item.nombre}</td>
                            <td className="px-4 py-3 opacity-80">{item.marca}</td>
                            <td className="px-4 py-3 text-center">
                                <div className="flex justify-center gap-2">
                                    <button onClick={() => setViendoItem(item)} className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-emerald-900/40 text-emerald-400' : 'hover:bg-emerald-50 text-emerald-500'}`}><Eye size={16}/></button>
                                    <button onClick={() => abrirModalEditar(item)} className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-[#141f0b] text-[#C9EA63]' : 'hover:bg-emerald-50 text-emerald-600'}`}><Edit2 size={16}/></button>
                                    <button onClick={() => abrirModalEliminar(item.id)} className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-red-900/40 text-red-400' : 'hover:bg-red-50 text-red-500'}`}><Trash2 size={16}/></button>
                                </div>
                            </td>
                        </tr>
                    ))}
                    {modelosFiltrados.length === 0 && (
                        <tr>
                            <td colSpan="4" className="px-4 py-8 text-center opacity-60">
                                {modelos.length === 0 ? 'No hay modelos registrados.' : 'No hay resultados para la búsqueda.'}
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
      </div>

      {modalAbierto && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-[100]">
          <div className={`p-8 rounded-2xl shadow-2xl w-full max-w-md relative border-t-4 ${darkMode ? 'bg-[#141f0b] border-[#C9EA63]' : 'bg-white border-emerald-600'}`}>
            <button onClick={() => setModalAbierto(false)} className={`absolute top-4 right-4 ${darkMode ? 'text-gray-400 hover:text-[#C9EA63]' : 'text-gray-400 hover:text-gray-800'}`}>
              <X size={24} />
            </button>
            <h2 className={`text-2xl font-bold mb-6 flex items-center gap-2 ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>
              Nuevo Modelo
            </h2>
            <form onSubmit={handleGuardarManual} className="space-y-4">
              <div>
                <label className={`block text-sm font-semibold mb-1 ${darkMode ? 'text-[#F2F6F0]/80' : 'text-gray-600'}`}>Nombre del Modelo *</label>
                <input required type="text" value={nuevoItem.nombre} onChange={(e) => setNuevoItem({...nuevoItem, nombre: e.target.value})} className={`w-full p-2 border rounded focus:ring-2 focus:ring-emerald-500 outline-none ${darkMode ? 'bg-[#2a401c] border-[#C9EA63]/20 text-[#F2F6F0]' : 'border-gray-300 text-slate-800'}`} />
              </div>
              <div>
                <label className={`block text-sm font-semibold mb-1 ${darkMode ? 'text-[#F2F6F0]/80' : 'text-gray-600'}`}>Marca Asociada *</label>
                <input required type="text" value={nuevoItem.marca} onChange={(e) => setNuevoItem({...nuevoItem, marca: e.target.value})} className={`w-full p-2 border rounded focus:ring-2 focus:ring-emerald-500 outline-none ${darkMode ? 'bg-[#2a401c] border-[#C9EA63]/20 text-[#F2F6F0]' : 'border-gray-300 text-slate-800'}`} />
              </div>
              <button type="submit" className={`w-full mt-4 font-bold py-3 px-4 rounded-lg flex justify-center items-center gap-2 transition-colors ${darkMode ? 'bg-[#C9EA63] hover:bg-[#b0d14b] text-[#141f0b]' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}>
                <Save size={20} /> Guardar
              </button>
            </form>
          </div>
        </div>
      )}

      {editandoItem && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-[100]">
          <div className={`p-8 rounded-2xl shadow-2xl w-full max-w-md relative border-t-4 ${darkMode ? 'bg-[#141f0b] border-emerald-400' : 'bg-white border-emerald-500'}`}>
            <button onClick={() => setEditandoItem(null)} className={`absolute top-4 right-4 ${darkMode ? 'text-gray-400 hover:text-emerald-400' : 'text-gray-400 hover:text-gray-800'}`}>
              <X size={24} />
            </button>
            <h2 className={`text-2xl font-bold mb-6 flex items-center gap-2 ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>
              <Edit2 className={darkMode ? 'text-emerald-400' : 'text-emerald-500'} /> Editar Modelo
            </h2>
            <form onSubmit={handleGuardarEdicion} className="space-y-4">
              <div>
                <label className={`block text-sm font-semibold mb-1 ${darkMode ? 'text-[#F2F6F0]/80' : 'text-gray-600'}`}>Nombre del Modelo *</label>
                <input required type="text" value={editandoItem.nombre} onChange={(e) => setEditandoItem({...editandoItem, nombre: e.target.value})} className={`w-full p-2 border rounded focus:ring-2 focus:ring-emerald-500 outline-none ${darkMode ? 'bg-[#2a401c] border-[#C9EA63]/20 text-[#F2F6F0]' : 'border-gray-300 text-slate-800'}`} />
              </div>
              <div>
                <label className={`block text-sm font-semibold mb-1 ${darkMode ? 'text-[#F2F6F0]/80' : 'text-gray-600'}`}>Marca Asociada *</label>
                <input required type="text" value={editandoItem.marca} onChange={(e) => setEditandoItem({...editandoItem, marca: e.target.value})} className={`w-full p-2 border rounded focus:ring-2 focus:ring-emerald-500 outline-none ${darkMode ? 'bg-[#2a401c] border-[#C9EA63]/20 text-[#F2F6F0]' : 'border-gray-300 text-slate-800'}`} />
              </div>
              <button type="submit" className={`w-full mt-4 font-bold py-3 px-4 rounded-lg flex justify-center items-center gap-2 transition-colors ${darkMode ? 'bg-emerald-500 hover:bg-emerald-400 text-[#141f0b]' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}>
                <Save size={20} /> Actualizar
              </button>
            </form>
          </div>
        </div>
      )}

      {viendoItem && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-[100]">
          <div className={`p-8 rounded-2xl shadow-2xl w-full max-w-md relative border-t-4 ${darkMode ? 'bg-[#141f0b] border-emerald-400' : 'bg-white border-emerald-500'}`}>
            <button onClick={() => setViendoItem(null)} className={`absolute top-4 right-4 ${darkMode ? 'text-gray-400 hover:text-emerald-400' : 'text-gray-400 hover:text-gray-800'}`}>
              <X size={24} />
            </button>
            <h2 className={`text-2xl font-bold mb-6 flex items-center gap-2 ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>
              <Eye className={darkMode ? 'text-emerald-400' : 'text-emerald-500'} /> Detalle del Modelo
            </h2>
            <div className="space-y-4">
              <div>
                <label className={`block text-xs font-semibold mb-1 uppercase ${darkMode ? 'text-[#F2F6F0]/50' : 'text-gray-400'}`}>Modelo</label>
                <div className={`w-full p-3 rounded-lg font-medium tracking-wide ${darkMode ? 'bg-[#2a401c] text-[#F2F6F0]' : 'bg-slate-50 text-slate-800'}`}>{viendoItem.nombre}</div>
              </div>
              <div>
                <label className={`block text-xs font-semibold mb-1 uppercase ${darkMode ? 'text-[#F2F6F0]/50' : 'text-gray-400'}`}>Marca Asociada</label>
                <div className={`w-full p-3 rounded-lg font-medium tracking-wide ${darkMode ? 'bg-[#2a401c] text-[#F2F6F0]' : 'bg-slate-50 text-slate-800'}`}>{viendoItem.marca}</div>
              </div>
            </div>
            <button onClick={() => setViendoItem(null)} className={`w-full mt-8 font-bold py-3 px-4 rounded-lg flex justify-center items-center gap-2 transition-colors ${darkMode ? 'bg-[#253916] text-[#C9EA63] hover:bg-[#314a1c]' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
              Cerrar
            </button>
          </div>
        </div>
      )}
        {modalConfirmarVaciar && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex justify-center items-center z-[100]">
          <div className={`p-8 rounded-2xl shadow-2xl w-full max-w-sm relative ${darkMode ? 'bg-[#1b2b10] border border-rose-900/50' : 'bg-white border border-rose-100'}`}>
            <div className="mx-auto w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mb-4">
              <AlertCircle size={32} className="text-rose-600" />
            </div>
            <h2 className={`text-2xl font-black text-center mb-2 ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>¿Vaciar Catálogo?</h2>
            <p className={`text-center text-sm mb-6 ${darkMode ? 'text-[#F2F6F0]/70' : 'text-slate-500'}`}>Estás a punto de eliminar <b>TODOS</b> los modelos registrados. Esta acción es irreversible.</p>
            <div className="flex gap-3">
              <button onClick={() => setModalConfirmarVaciar(false)} className={`flex-1 font-bold py-3 rounded-xl transition-colors ${darkMode ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Cancelar</button>
              <button onClick={handleDeleteMasivo} className="flex-1 font-bold py-3 rounded-xl transition-colors bg-rose-600 text-white hover:bg-rose-700">Sí, Vaciar</button>
            </div>
          </div>
        </div>
      )}

      {modalConfirmarEliminar && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex justify-center items-center z-[100]">
          <div className={`p-8 rounded-2xl shadow-2xl w-full max-w-sm relative ${darkMode ? 'bg-[#1b2b10] border border-rose-900/50' : 'bg-white border border-rose-100'}`}>
            <div className="mx-auto w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mb-4">
              <AlertCircle size={32} className="text-rose-600" />
            </div>
            <h2 className={`text-2xl font-black text-center mb-2 ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>¿Eliminar Modelo?</h2>
            <p className={`text-center text-sm mb-6 ${darkMode ? 'text-[#F2F6F0]/70' : 'text-slate-500'}`}>Esta acción no se puede deshacer.</p>
            <div className="flex gap-3">
              <button onClick={() => setModalConfirmarEliminar(false)} className={`flex-1 font-bold py-3 rounded-xl transition-colors ${darkMode ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Cancelar</button>
              <button onClick={handleDelete} className="flex-1 font-bold py-3 rounded-xl transition-colors bg-rose-600 text-white hover:bg-rose-700">Eliminar</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Modelos;
