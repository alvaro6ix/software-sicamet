// ... (rest of imports) ...
import React, { useState, useRef } from 'react';
import axios from 'axios';
import Select from 'react-select';
import { Save, ClipboardList, Hash, FileUp, Loader2, Trash2, Building, User, Settings2, Database, Hand } from 'lucide-react';

const opcionesSLA = [
  { value: 5, label: '🔴 Urgente (5 días)' },
  { value: 7, label: '🟠 Rápido (7 días)' },
  { value: 10, label: '🟡 Normal (10 días)' },
  { value: 15, label: '🔵 Especial (15 días)' },
  { value: 20, label: '🟣 Crítico (20 días)' }
];

const opcionesServicio = [
  "Venta", "Vaisala Boston", "Servicio Terceros", "Patrones SICAMET",
  "Medición", "Ensayos de Aptitud", "Consultoría", "Capacitación",
  "Calificación", "Calibración inLab", "Calibración in Plant"
];

const Registro = ({ darkMode }) => {
  const fileInputRef = useRef(null);
  const excelInputRef = useRef(null);
  
  const [cargandoPdf, setCargandoPdf] = useState(false);
  const [cargandoExcel, setCargandoExcel] = useState(false);
  const [tipoCatalogo, setTipoCatalogo] = useState('instrumentos');
  
  // TABS: 'manual' o 'pdf'
  const [modoRegistro, setModoRegistro] = useState('pdf');

  const [cabecera, setCabecera] = useState({ orden_cotizacion: '', empresa: '', persona: '', sla: opcionesSLA[2] });
  const [partidas, setPartidas] = useState([]);

  // --- CARGAR PDF ---
  const handleSubirPDF = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setCargandoPdf(true);
    const body = new FormData();
    body.append('archivoPdf', file);

    try {
      const res = await axios.post('/api/leer-pdf', body);
      const { cabecera: cab, partidas: pars } = res.data;

      setCabecera({
        orden_cotizacion: cab.orden_cotizacion || '',
        empresa: cab.empresa || '',
        persona: cab.persona || '',
        sla: opcionesSLA.find(s => s.value === cab.sla) || opcionesSLA[2]
      });

      setPartidas(pars);
      alert(`✅ PDF procesado vía Inteligencia Artificial. Por favor verifica los datos y confirma.`);
    } catch (err) { 
        alert("Error al procesar el documento. Puede que el PDF esté corrupto o ilegible."); 
        console.error(err);
    }
    finally { setCargandoPdf(false); event.target.value = null; }
  };

  // --- CARGAR EXCEL MASIVO ---
  const handleSubirExcel = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setCargandoExcel(true);
    const body = new FormData();
    body.append('archivoExcel', file);
    body.append('tipo', tipoCatalogo);

    try {
      const res = await axios.post('/api/importar-catalogo', body);
      alert(`✅ ${res.data.message}`);
    } catch (err) { alert("Error al subir el catálogo. Verifica que el archivo sea Excel (.xlsx) y tenga una columna llamada 'nombre'."); }
    finally { setCargandoExcel(false); event.target.value = null; }
  };

  const actualizarPartida = (index, campo, valor) => {
    const nuevasPartidas = [...partidas];
    nuevasPartidas[index][campo] = valor;
    setPartidas(nuevasPartidas);
  };

  const eliminarPartida = (index) => {
    setPartidas(partidas.filter((_, i) => i !== index));
  };

  const agregarPartidaManual = () => {
    setPartidas([...partidas, {
      nombre_instrumento: '', 
      marca: 'No Indicada', 
      modelo: 'No Indicado', 
      no_serie: 'No Indicado', 
      identificacion: 'No Indicada',
      ubicacion: 'No Indicada',
      requerimientos_especiales: 'No requeridos',
      puntos_calibrar: 'No especificados',
      tipo_servicio: 'Calibración inLab'
    }]);
  };

  const handleSubmitFinal = async (e) => {
    e.preventDefault();
    if (partidas.length === 0) return alert("No hay instrumentos para guardar.");

    const instrumentosAGuardar = partidas.map(p => ({
      ...p,
      orden_cotizacion: cabecera.orden_cotizacion,
      empresa: cabecera.empresa,
      persona: cabecera.persona,
      sla: cabecera.sla.value
    }));

    try {
      setCargandoPdf(true);
      await axios.post('/api/instrumentos-multiple', { instrumentos: instrumentosAGuardar });
      alert(`✅ ¡Éxito! Se registraron ${partidas.length} equipos bajo la referencia ${cabecera.orden_cotizacion}.`);
      setCabecera({ orden_cotizacion: '', empresa: '', persona: '', sla: opcionesSLA[2] });
      setPartidas([]);
    } catch (err) { alert("Error al guardar la orden."); }
    finally { setCargandoPdf(false); }
  };

  // Styles adaptativos
  const boxBg = darkMode ? 'bg-[#253916] border-[#C9EA63]/20 shadow-none' : 'bg-white border-gray-100 shadow-xl';
  const textTitle = darkMode ? 'text-[#F2F6F0]' : 'text-slate-800';
  const headerBg = darkMode ? 'bg-[#141f0b]' : 'bg-slate-50';
  const labelText = darkMode ? 'text-[#C9EA63]' : 'text-slate-500';
  const inputBg = darkMode ? 'bg-[#253916] border-[#C9EA63]/40 text-[#F2F6F0] focus:border-[#C9EA63]' : 'bg-white border-gray-300 text-slate-800 focus:border-emerald-500';

  const selectStyles = {
    control: (base) => ({
      ...base,
      backgroundColor: darkMode ? '#253916' : 'white',
      borderColor: darkMode ? 'rgba(201, 234, 99, 0.4)' : '#d1d5db',
      color: darkMode ? '#F2F6F0' : '#1e293b'
    }),
    singleValue: (base) => ({
      ...base,
      color: darkMode ? '#F2F6F0' : '#1e293b'
    }),
    menu: (base) => ({
      ...base,
      backgroundColor: darkMode ? '#253916' : 'white',
    }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isFocused ? (darkMode ? '#314a1c' : '#f1f5f9') : 'transparent',
      color: darkMode ? '#F2F6F0' : '#1e293b'
    })
  };

  return (
    <div className="max-w-7xl mx-auto space-y-10">
        
      {/* -------------------- BLOQUE 1: INGRESO DE EQUIPOS -------------------- */}
      <div className={`rounded-2xl border p-8 transition-colors duration-300 ${boxBg}`}>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 border-b border-opacity-20 pb-6 gap-4 border-[#C9EA63]">
          
          <div>
            <h2 className={`text-2xl font-bold flex items-center gap-3 ${textTitle}`}>
              <ClipboardList className={darkMode ? 'text-[#C9EA63]' : 'text-emerald-600'} /> 
              Ingreso de Instrumentos
            </h2>
            <p className={`mt-2 text-sm ${darkMode ? 'text-[#F2F6F0]/70' : 'text-gray-500'}`}>
              Registra los equipos que entran a laboratorio. Usa el modo automático para PDFs.
            </p>
          </div>

          <div className={`flex rounded-xl p-1 ${darkMode ? 'bg-[#141f0b]' : 'bg-slate-100'}`}>
            <button 
              onClick={() => { setModoRegistro('manual'); if(partidas.length===0) agregarPartidaManual(); }} 
              className={`flex items-center gap-2 px-6 py-2 rounded-lg font-bold text-sm transition-all ${modoRegistro === 'manual' ? (darkMode ? 'bg-[#65D067] text-[#141f0b] shadow-md' : 'bg-white text-emerald-700 shadow-md') : (darkMode ? 'text-[#F2F6F0]/60 hover:text-[#C9EA63]' : 'text-slate-500 hover:text-slate-800')}`}
            >
              <Hand size={18}/> Manual
            </button>
            <button 
              onClick={() => setModoRegistro('pdf')}
              className={`flex items-center gap-2 px-6 py-2 rounded-lg font-bold text-sm transition-all ${modoRegistro === 'pdf' ? (darkMode ? 'bg-[#65D067] text-[#141f0b] shadow-md' : 'bg-white text-emerald-700 shadow-md') : (darkMode ? 'text-[#F2F6F0]/60 hover:text-[#C9EA63]' : 'text-slate-500 hover:text-slate-800')}`}
            >
              <FileUp size={18}/> PDF IA
            </button>
          </div>
        </div>

        {modoRegistro === 'pdf' && (
          <div className="mb-8 flex justify-center">
             <input type="file" accept="application/pdf" ref={fileInputRef} onChange={handleSubirPDF} className="hidden" />
             <button onClick={() => fileInputRef.current.click()} disabled={cargandoPdf} className={`px-8 py-4 rounded-xl flex flex-col items-center justify-center gap-3 border shadow-md transition-all w-full max-w-lg ${darkMode ? 'bg-[#C9EA63] text-[#141f0b] hover:bg-[#b0d14b] border-[#C9EA63]' : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'}`}>
               {cargandoPdf ? <Loader2 className="animate-spin" size={32} /> : <FileUp size={32} />} 
               <span className="font-black text-lg">{cargandoPdf ? "Procesando documento con IA..." : "Sube el PDF de la O.S. o Cotización"}</span>
               {!cargandoPdf && <span className="text-sm opacity-80 font-medium">Extraemos Marca, Modelo, Serie y Servicio de forma automática</span>}
             </button>
          </div>
        )}

        <form onSubmit={handleSubmitFinal}>
          {/* CABECERA */}
          <div className={`grid grid-cols-1 md:grid-cols-4 gap-4 p-6 rounded-xl border mb-6 shadow-sm transition-colors ${headerBg} ${darkMode ? 'border-[#C9EA63]/20' : 'border-slate-200'}`}>
            <div className="md:col-span-1">
              <label className={`text-xs font-bold flex items-center gap-1.5 mb-1 ${labelText}`}><Hash size={14}/> Ref / Orden</label>
              <input type="text" value={cabecera.orden_cotizacion} onChange={(e) => setCabecera({...cabecera, orden_cotizacion: e.target.value.toUpperCase()})} required placeholder="Ejem: C26-0881" className={`w-full p-2 border rounded-md font-mono font-bold outline-none ${inputBg}`} />
            </div>
            <div className="md:col-span-1">
              <label className={`text-xs font-bold flex items-center gap-1.5 mb-1 ${labelText}`}><Building size={14}/> Empresa</label>
              <input type="text" value={cabecera.empresa} onChange={(e) => setCabecera({...cabecera, empresa: e.target.value.toUpperCase()})} required placeholder="Ej: ALIMENTOS SA" className={`w-full p-2 border rounded-md text-sm outline-none ${inputBg}`} />
            </div>
            <div className="md:col-span-1">
              <label className={`text-xs font-bold flex items-center gap-1.5 mb-1 ${labelText}`}><User size={14}/> Contacto</label>
              <input type="text" value={cabecera.persona} onChange={(e) => setCabecera({...cabecera, persona: e.target.value})} required placeholder="Ing. Juan Pérez" className={`w-full p-2 border rounded-md text-sm outline-none ${inputBg}`} />
            </div>
            <div className="md:col-span-1">
              <label className={`text-xs font-bold flex items-center gap-1.5 mb-1 ${labelText}`}><Settings2 size={14}/> SLA (Días)</label>
              <Select options={opcionesSLA} value={cabecera.sla} onChange={(s) => setCabecera({...cabecera, sla: s})} styles={selectStyles} className="text-sm" />
            </div>
          </div>

          {/* TABLA DE EQUIPOS */}
          {partidas.length > 0 && (
            <div className={`mb-6 border rounded-xl overflow-x-auto shadow-md ${darkMode ? 'border-[#C9EA63]/20' : 'border-slate-200'}`}>
              <table className="w-full text-sm text-left">
                <thead className={`text-xs uppercase border-b ${darkMode ? 'bg-[#141f0b] text-[#C9EA63] border-[#C9EA63]/20' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                  <tr>
                    <th className="px-3 py-3">#</th>
                    <th className="px-3 py-3 min-w-[200px]">Instrumento</th>
                    <th className="px-3 py-3 min-w-[150px]">Marca / Modelo</th>
                    <th className="px-3 py-3 min-w-[150px]">No. Serie</th>
                    <th className="px-3 py-3 min-w-[150px]">ID / Ubicación</th>
                    <th className="px-3 py-3 min-w-[200px]">Requerimientos / Puntos</th>
                    <th className="px-3 py-3 min-w-[180px]">Tipo de Servicio</th>
                    <th className="px-3 py-3 text-center"></th>
                  </tr>
                </thead>
                <tbody className={darkMode ? 'divide-y divide-[#C9EA63]/10' : 'divide-y divide-slate-100'}>
                  {partidas.map((partida, index) => (
                    <tr key={index} className={`transition-colors ${darkMode ? 'bg-[#253916] hover:bg-[#314a1c]' : 'bg-white hover:bg-emerald-50/50'}`}>
                      <td className={`px-3 py-2 font-bold ${darkMode ? 'text-[#C9EA63]/50' : 'text-slate-400'}`}>{index + 1}</td>
                      <td className="px-3 py-2"><input type="text" value={partida.nombre_instrumento} onChange={(e) => actualizarPartida(index, 'nombre_instrumento', e.target.value)} className={`w-full p-2 rounded font-semibold outline-none border ${inputBg}`} required /></td>
                      <td className="px-3 py-2">
                        <div className="space-y-1">
                          <input type="text" placeholder="Marca" value={partida.marca} onChange={(e) => actualizarPartida(index, 'marca', e.target.value)} className={`w-full p-2 rounded outline-none border ${inputBg}`} required/>
                          <input type="text" placeholder="Modelo" value={partida.modelo} onChange={(e) => actualizarPartida(index, 'modelo', e.target.value)} className={`w-full p-2 rounded font-mono outline-none border ${inputBg}`} required/>
                        </div>
                      </td>
                      <td className="px-3 py-2"><input type="text" value={partida.no_serie} onChange={(e) => actualizarPartida(index, 'no_serie', e.target.value)} className={`w-full p-2 rounded font-mono font-bold outline-none border ${darkMode ? 'bg-[#141f0b] text-[#65D067] border-[#65D067]/40 focus:border-[#65D067]' : 'bg-slate-50 text-emerald-700 border-gray-300 focus:border-emerald-500'}`} required/></td>
                      <td className="px-3 py-2">
                        <div className="space-y-1">
                          <input type="text" placeholder="Identificación" value={partida.identificacion} onChange={(e) => actualizarPartida(index, 'identificacion', e.target.value)} className={`w-full p-2 rounded outline-none border ${inputBg}`} required/>
                          <input type="text" placeholder="Ubicación" value={partida.ubicacion} onChange={(e) => actualizarPartida(index, 'ubicacion', e.target.value)} className={`w-full p-2 rounded outline-none border ${inputBg}`} required/>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="space-y-1">
                          <textarea rows="1" placeholder="Requerimientos" value={partida.requerimientos_especiales} onChange={(e) => actualizarPartida(index, 'requerimientos_especiales', e.target.value)} className={`w-full p-2 rounded text-xs outline-none border ${inputBg}`} />
                          <textarea rows="1" placeholder="Puntos" value={partida.puntos_calibrar} onChange={(e) => actualizarPartida(index, 'puntos_calibrar', e.target.value)} className={`w-full p-2 rounded text-xs outline-none border ${inputBg}`} />
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <textarea rows="2" value={partida.tipo_servicio} onChange={(e) => actualizarPartida(index, 'tipo_servicio', e.target.value)} className={`w-full p-2 rounded text-[10px] leading-tight cursor-pointer outline-none border ${inputBg}`} />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button type="button" onClick={() => eliminarPartida(index)} className="text-red-500 hover:text-red-400 p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20" title="Eliminar fila"><Trash2 size={18} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className={`p-3 border-t ${darkMode ? 'bg-[#141f0b] border-[#C9EA63]/20' : 'bg-slate-50 border-slate-200'}`}>
                <button type="button" onClick={agregarPartidaManual} className={`text-sm font-bold hover:underline px-2 ${darkMode ? 'text-[#65D067]' : 'text-emerald-600'}`}>
                  + Agregar equipo manualmente
                </button>
              </div>
            </div>
          )}

          {partidas.length > 0 && (
            <button type="submit" disabled={cargandoPdf} className={`w-full font-bold py-4 px-6 rounded-xl flex justify-center items-center gap-3 transition-all shadow-lg text-lg ${darkMode ? 'bg-[#65D067] hover:bg-[#52ad53] text-[#141f0b]' : 'bg-slate-800 hover:bg-slate-900 text-white'}`}>
              {cargandoPdf ? <Loader2 className="animate-spin" /> : <Save size={22} />}
              {`Confirmar y Guardar Registro (${partidas.length} equipos)`}
            </button>
          )}
        </form>
      </div>

    </div>
  );
};

export default Registro;
