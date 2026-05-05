import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import Select from 'react-select';
import { Save, ClipboardList, Hash, FileUp, Loader2, Trash2, Building, User, Settings2, Hand, FlaskConical, MapPin, FileText, Mail, Calendar, Tag, MapPinned } from 'lucide-react';

const opcionesSLA_calibracion = [
  { value: 5, label: '🔴 Urgente (5 días)' },
  { value: 7, label: '🟠 Rápido (7 días)' },
  { value: 10, label: '🟡 Normal (10 días)' },
  { value: 15, label: '🔵 Especial (15 días)' },
  { value: 20, label: '🟣 Crítico (20 días)' }
];

const opcionesSLA_calificacion = [
  { value: 20, label: '🟤 Calificación Estándar (20 días)' },
  { value: 25, label: '🔵 Calificación Normal (25 días)' },
  { value: 30, label: '🟣 Calificación Especial (30 días)' },
  { value: 35, label: '🔴 Calificación Crítica (35 días)' }
];

// Sprint 10-B — Los tipos de servicio se consumen del API (catálogo editable
// por admin en Gestión de Usuarios → Tipos Servicio).


const Registro = ({ darkMode }) => {
  const fileInputRef = useRef(null);
  const excelInputRef = useRef(null);

  const [cargandoPdf, setCargandoPdf] = useState(false);
  const [cargandoExcel, setCargandoExcel] = useState(false);
  const [tipoCatalogo, setTipoCatalogo] = useState('instrumentos');
  const [tipoOS, setTipoOS] = useState('calibracion'); // 'calibracion' | 'calificacion'

  const [modoRegistro, setModoRegistro] = useState('pdf');

  const [cabecera, setCabecera] = useState({
    orden_cotizacion: '', empresa: '', persona: '',
    sla: null, servicio_solicitado: null,
    cotizacion_referencia: '', fecha_recepcion: '',
    nombre_certificados: '', direccion: '', contacto_email: ''
  });
  const [partidas, setPartidas] = useState([]);

  // Áreas (multi-select) y Metrólogos (multi-select, independientes)
  const [areas, setAreas] = useState([]);
  const [metrologos, setMetrologos] = useState([]);
  const [areasSeleccionadas, setAreasSeleccionadas] = useState([]);
  const [metrologosSeleccionados, setMetrologosSeleccionados] = useState([]);
  const [cargandoMetrologos, setCargandoMetrologos] = useState(false);
  const [tiposServicioActivos, setTiposServicioActivos] = useState([]);

  // Cargar áreas, metrólogos y tipos de servicio al montar.
  useEffect(() => {
    const cargarCatalogos = async () => {
      try {
        const [resAreas, resMetrologos, resTipos] = await Promise.all([
          axios.get('/api/areas'),
          axios.get('/api/usuarios/metrologos'),
          axios.get('/api/tipos-servicio')
        ]);
        setAreas(resAreas.data.filter(a => a.activa).map(a => ({ value: a.nombre, label: a.nombre })));
        setMetrologos(resMetrologos.data.map(m => ({ value: m.id, label: m.nombre })));
        setTiposServicioActivos((resTipos.data || []).filter(t => t.activo).map(t => ({ value: t.nombre, label: t.nombre })));
      } catch (err) {
        console.error('Error al cargar catálogos:', err);
      }
    };
    cargarCatalogos();
  }, []);

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
        sla: null,
        servicio_solicitado: null,
        cotizacion_referencia: cab.cotizacion_referencia || '',
        fecha_recepcion: cab.fecha_recepcion || '',
        nombre_certificados: cab.nombre_certificados || '',
        direccion: cab.direccion || '',
        contacto_email: cab.contacto_email || ''
      });

      setPartidas(pars);
      alert(`PDF procesado: ${pars?.length || 0} instrumentos detectados por IA. Revisa datos, selecciona Área y Metrólogos antes de guardar.`);
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
      alert(`${res.data.message}`);
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
    // Default al servicio de cabecera si ya está seleccionado, así una OS de "Venta"
    // arranca con todos sus equipos en Venta y solo cambias los que necesiten otro tipo.
    const defaultTipo = (typeof cabecera.servicio_solicitado === 'string'
      ? cabecera.servicio_solicitado
      : cabecera.servicio_solicitado?.value || cabecera.servicio_solicitado?.label || '');
    setPartidas([...partidas, {
      clave: '',
      nombre_instrumento: '',
      marca: 'No Indicada',
      modelo: 'No Indicado',
      no_serie: 'No Indicado',
      no_certificado: '',
      identificacion: 'No Indicada',
      ubicacion: 'No Indicada',
      requerimientos_especiales: 'No requeridos',
      puntos_calibrar: 'No especificados',
      intervalo_calibracion: 'No especificado',
      tipo_servicio: defaultTipo
    }]);
  };

  const handleSubmitFinal = async (e) => {
    e.preventDefault();
    if (partidas.length === 0) return alert("No hay instrumentos para guardar.");
    if (!cabecera.sla) return alert("⚠️ Debes seleccionar el SLA antes de guardar.");
    if (!cabecera.servicio_solicitado) return alert("⚠️ Debes seleccionar el Tipo de Servicio antes de guardar.");
    if (areasSeleccionadas.length === 0) return alert("⚠️ Debes seleccionar al menos un Área de Laboratorio.");

    const instrumentosAGuardar = partidas.map(p => ({
      ...p,
      orden_cotizacion: cabecera.orden_cotizacion,
      cotizacion_referencia: cabecera.cotizacion_referencia,
      fecha_recepcion: cabecera.fecha_recepcion,
      servicio_solicitado: typeof cabecera.servicio_solicitado === 'string' ? cabecera.servicio_solicitado : cabecera.servicio_solicitado?.value || cabecera.servicio_solicitado?.label || '',
      empresa: cabecera.empresa,
      nombre_certificados: cabecera.nombre_certificados,
      direccion: cabecera.direccion,
      persona: cabecera.persona,
      contacto_email: cabecera.contacto_email,
      sla: cabecera.sla.value,
      area_laboratorio: areasSeleccionadas.map(a => a.value).join(', '),
      tipo_servicio: p.tipo_servicio || (typeof cabecera.servicio_solicitado === 'string' ? cabecera.servicio_solicitado : cabecera.servicio_solicitado?.label || '')
    }));

    try {
      setCargandoPdf(true);
      // Recepción NO asigna metrólogos. Esa decisión es del jefe de metrología.
      await axios.post('/api/instrumentos-multiple', {
        instrumentos: instrumentosAGuardar,
        metrologos_ids: []
      });
      alert(`¡Éxito! Se registraron ${partidas.length} equipos para Área(s): "${areasSeleccionadas.map(a => a.label).join(', ')}". Quedan en bandeja del jefe de metrología para asignación.`);
      setCabecera({ orden_cotizacion: '', empresa: '', persona: '', sla: null, servicio_solicitado: null, cotizacion_referencia: '', fecha_recepcion: '', nombre_certificados: '', direccion: '', contacto_email: '' });
      setPartidas([]);
      setAreasSeleccionadas([]);
      setMetrologosSeleccionados([]);
    } catch (err) { alert(err.response?.data?.error || "Error al guardar la orden."); }
    finally { setCargandoPdf(false); }
  };

  // Styles adaptativos
  const boxBg = darkMode ? 'bg-[#253916] border-[#C9EA63]/20 shadow-none' : 'bg-white border-gray-100 shadow-xl';
  const textTitle = darkMode ? 'text-[#F2F6F0]' : 'text-slate-800';
  const headerBg = darkMode ? 'bg-[#141f0b]' : 'bg-slate-50';
  const labelText = darkMode ? 'text-[#C9EA63]' : 'text-slate-500';
  const inputBg = darkMode ? 'bg-[#253916] border-[#C9EA63]/40 text-[#F2F6F0] focus:border-[#C9EA63]' : 'bg-white border-gray-300 text-slate-800 focus:border-emerald-500';

  const selectStyles = {
    control: (base, state) => ({
      ...base,
      backgroundColor: darkMode ? '#253916' : 'white',
      borderColor: state.isFocused ? (darkMode ? '#C9EA63' : '#008a5e') : (darkMode ? 'rgba(201, 234, 99, 0.4)' : '#d1d5db'),
      color: darkMode ? '#F2F6F0' : '#1e293b',
      boxShadow: state.isFocused ? `0 0 0 1px ${darkMode ? '#C9EA63' : '#008a5e'}` : 'none',
    }),
    singleValue: (base) => ({ ...base, color: darkMode ? '#F2F6F0' : '#1e293b' }),
    menu: (base) => ({ ...base, backgroundColor: darkMode ? '#253916' : 'white', zIndex: 50 }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isFocused ? (darkMode ? '#314a1c' : '#f1f5f9') : 'transparent',
      color: darkMode ? '#F2F6F0' : '#1e293b'
    }),
    placeholder: (base) => ({ ...base, color: darkMode ? 'rgba(242,246,240,0.4)' : '#9ca3af' }),
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
              Registra los equipos que entran a laboratorio. <strong>Debes asignar un Área antes de guardar.</strong>
            </p>
          </div>

          <div className={`flex rounded-xl p-1 ${darkMode ? 'bg-[#141f0b]' : 'bg-slate-100'}`}>
            <button 
              onClick={() => { setModoRegistro('manual'); if(partidas.length===0) agregarPartidaManual(); }} 
              className={`flex items-center gap-2 px-6 py-2 rounded-lg font-bold text-sm transition-all ${modoRegistro === 'manual' ? (darkMode ? 'bg-[#C9EA63] text-[#141f0b] shadow-md' : 'bg-[#008a5e] text-white shadow-md') : (darkMode ? 'text-[#F2F6F0]/60 hover:text-[#C9EA63]' : 'text-slate-500 hover:text-slate-800')}`}
            >
              <Hand size={18}/> Manual
            </button>
            <button 
              onClick={() => setModoRegistro('pdf')}
              className={`flex items-center gap-2 px-6 py-2 rounded-lg font-bold text-sm transition-all ${modoRegistro === 'pdf' ? (darkMode ? 'bg-[#C9EA63] text-[#141f0b] shadow-md' : 'bg-[#008a5e] text-white shadow-md') : (darkMode ? 'text-[#F2F6F0]/60 hover:text-[#C9EA63]' : 'text-slate-500 hover:text-slate-800')}`}
            >
              <FileUp size={18}/> PDF IA
            </button>
          </div>
        </div>

        {modoRegistro === 'pdf' && (
          <div className="mb-8 flex justify-center">
             <input type="file" accept="application/pdf" ref={fileInputRef} onChange={handleSubirPDF} className="hidden" />
             <button onClick={() => fileInputRef.current.click()} disabled={cargandoPdf} className={`px-8 py-4 rounded-2xl flex flex-col items-center justify-center gap-3 border transition-all w-full max-w-lg shadow-2xl ${darkMode ? 'bg-[#C9EA63] hover:bg-[#b0d14b] text-[#141f0b] border-[#C9EA63]/20 shadow-[#C9EA63]/10' : 'bg-[#008a5e] hover:bg-[#007b55] text-white border-[#008a5e]/20 shadow-[#008a5e]/20'}`}>
               {cargandoPdf ? <Loader2 className="animate-spin" size={32} /> : <FileUp size={32} />} 
               <span className="font-black text-lg">{cargandoPdf ? "Procesando documento con IA..." : "Sube Orden de Servicio"}</span>
               {!cargandoPdf && <span className="text-sm opacity-80 font-medium">Extraemos clave, certificado, marca, modelo, serie, intervalo y más</span>}
             </button>
          </div>
        )}

        <form onSubmit={handleSubmitFinal}>
          {/* CABECERA */}
          {/* TIPO DE ORDEN + CABECERA */}
          <div className={`flex items-center gap-3 mb-4 p-3 rounded-xl border ${darkMode ? 'bg-[#1b2b10]/50 border-[#C9EA63]/20' : 'bg-slate-50 border-slate-200'}`}>
            <span className={`text-xs font-bold uppercase tracking-wide ${darkMode ? 'text-[#C9EA63]' : 'text-slate-600'}`}>Tipo de O.S.:</span>
            <div className={`flex rounded-lg p-0.5 gap-0.5 ${darkMode ? 'bg-[#141f0b]' : 'bg-slate-200'}`}>
              <button
                type="button"
                onClick={() => { setTipoOS('calibracion'); setCabecera(c => ({...c, sla: null})); }}
                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
                  tipoOS === 'calibracion'
                    ? (darkMode ? 'bg-[#C9EA63] text-[#141f0b]' : 'bg-[#008a5e] text-white')
                    : (darkMode ? 'text-[#F2F6F0]/60 hover:text-[#C9EA63]' : 'text-slate-500 hover:text-slate-800')
                }`}
              >
                🔬 Calibración
              </button>
              <button
                type="button"
                onClick={() => { setTipoOS('calificacion'); setCabecera(c => ({...c, sla: null, servicio_solicitado: { value: 'Calificación', label: 'Calificación' }})); }}
                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
                  tipoOS === 'calificacion'
                    ? (darkMode ? 'bg-amber-500 text-white' : 'bg-amber-500 text-white')
                    : (darkMode ? 'text-[#F2F6F0]/60 hover:text-[#C9EA63]' : 'text-slate-500 hover:text-slate-800')
                }`}
              >
                🏷️ Calificación
              </button>
            </div>
            {tipoOS === 'calificacion' && (
              <span className={`text-xs italic ${darkMode ? 'text-amber-400' : 'text-amber-600'}`}>
                ⚠️ Entrega: 20–35 días hábiles
              </span>
            )}
          </div>
          <div className={`grid grid-cols-1 md:grid-cols-4 gap-4 p-6 rounded-xl border mb-6 shadow-sm transition-colors ${headerBg} ${darkMode ? 'border-[#C9EA63]/20' : 'border-slate-200'}`}>
            <div className="md:col-span-1">
              <label className={`text-xs font-bold flex items-center gap-1.5 mb-1 ${labelText}`}><Hash size={14}/> Ref / Orden</label>
              <input type="text" value={cabecera.orden_cotizacion} onChange={(e) => setCabecera({...cabecera, orden_cotizacion: e.target.value.toUpperCase()})} required placeholder="Ejem: O26-0461" className={`w-full p-2 border rounded-md font-mono font-bold outline-none ${inputBg}`} />
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
              <label className={`text-xs font-bold flex items-center gap-1.5 mb-1 ${labelText}`}><Settings2 size={14}/> SLA (Días) <span className="text-rose-500">*</span></label>
              <Select options={tipoOS === 'calificacion' ? opcionesSLA_calificacion : opcionesSLA_calibracion} value={cabecera.sla} onChange={(s) => setCabecera({...cabecera, sla: s})} placeholder="Selecciona SLA..." styles={selectStyles} className="text-sm" />
            </div>
          </div>

          {/* CABECERA DATOS ADICIONALES DEL PDF */}
          {(cabecera.cotizacion_referencia || cabecera.fecha_recepcion || cabecera.nombre_certificados || cabecera.direccion || cabecera.contacto_email) && (
            <div className={`grid grid-cols-1 md:grid-cols-3 gap-4 p-6 rounded-xl border mb-6 shadow-sm ${darkMode ? 'bg-[#1b2b10]/40 border-[#C9EA63]/15' : 'bg-blue-50 border-blue-200'}`}>
              <div>
                <label className={`text-xs font-bold flex items-center gap-1.5 mb-1 ${labelText}`}><Tag size={14}/> Cotización Ref.</label>
                <input type="text" value={cabecera.cotizacion_referencia} onChange={(e) => setCabecera({...cabecera, cotizacion_referencia: e.target.value.toUpperCase()})} placeholder="Ejem: C26-0520" className={`w-full p-2 border rounded-md text-sm font-mono outline-none ${inputBg}`} />
              </div>
              <div>
                <label className={`text-xs font-bold flex items-center gap-1.5 mb-1 ${labelText}`}><Calendar size={14}/> Fecha Recepción</label>
                <input type="text" value={cabecera.fecha_recepcion} onChange={(e) => setCabecera({...cabecera, fecha_recepcion: e.target.value})} placeholder="Ejem: 2026.03.19" className={`w-full p-2 border rounded-md text-sm outline-none ${inputBg}`} />
              </div>
              <div>
                <label className={`text-xs font-bold flex items-center gap-1.5 mb-1 ${labelText}`}><Mail size={14}/> Email Contacto</label>
                <input type="email" value={cabecera.contacto_email} onChange={(e) => setCabecera({...cabecera, contacto_email: e.target.value})} placeholder="email@empresa.com" className={`w-full p-2 border rounded-md text-sm outline-none ${inputBg}`} />
              </div>
              <div>
                <label className={`text-xs font-bold flex items-center gap-1.5 mb-1 ${labelText}`}><FileText size={14}/> Certificados a nombre de</label>
                <input type="text" value={cabecera.nombre_certificados} onChange={(e) => setCabecera({...cabecera, nombre_certificados: e.target.value})} placeholder="Razón social para certificados" className={`w-full p-2 border rounded-md text-sm outline-none ${inputBg}`} />
              </div>
              <div>
                <label className={`text-xs font-bold flex items-center gap-1.5 mb-1 ${labelText}`}><MapPinned size={14}/> Dirección</label>
                <input type="text" value={cabecera.direccion} onChange={(e) => setCabecera({...cabecera, direccion: e.target.value})} placeholder="Dirección del cliente" className={`w-full p-2 border rounded-md text-sm outline-none ${inputBg}`} />
              </div>
            </div>
          )}

          {/* ---- TIPO DE SERVICIO + ÁREAS + METRÓLOGOS ---- */}
          <div className={`grid grid-cols-1 md:grid-cols-3 gap-4 p-6 rounded-xl border mb-6 shadow-sm ${darkMode ? 'bg-[#1b2b10]/60 border-[#C9EA63]/30' : 'bg-emerald-50 border-emerald-200'}`}>
            <div>
              <label className={`text-xs font-bold flex items-center gap-1.5 mb-1.5 uppercase tracking-wide ${darkMode ? 'text-[#C9EA63]' : 'text-emerald-700'}`}>
                <FileText size={14}/> Tipo de Servicio Solicitado <span className="text-rose-500">*</span>
              </label>
              <Select
                options={tiposServicioActivos}
                value={cabecera.servicio_solicitado}
                onChange={(s) => setCabecera({...cabecera, servicio_solicitado: s})}
                noOptionsMessage={() => 'No hay tipos activos. Pídele a admin que los agregue en Gestión de Usuarios.'}
                placeholder="Selecciona tipo de servicio..."
                isClearable
                styles={selectStyles}
                className="text-sm"
              />
            </div>
            <div>
              <label className={`text-xs font-bold flex items-center gap-1.5 mb-1.5 uppercase tracking-wide ${darkMode ? 'text-[#C9EA63]' : 'text-emerald-700'}`}>
                <MapPin size={14}/> Áreas de Laboratorio <span className="text-rose-500">*</span>
                <span className={`text-[10px] font-normal ml-1 ${darkMode ? 'text-[#F2F6F0]/40' : 'text-slate-400'}`}>(puedes elegir varias)</span>
              </label>
              <Select
                options={areas}
                value={areasSeleccionadas}
                onChange={(a) => setAreasSeleccionadas(a || [])}
                placeholder="Selecciona áreas..."
                noOptionsMessage={() => "Sin áreas configuradas. Ve a Gestión de Personal → Áreas."}
                styles={selectStyles}
                className="text-sm"
                isMulti
                isClearable
              />
              {areas.length === 0 && (
                <p className={`text-[10px] mt-1 italic ${darkMode ? 'text-yellow-400/70' : 'text-orange-500'}`}>
                  ⚠️ No hay áreas creadas. Ve a Gestión de Personal → Áreas para crearlas.
                </p>
              )}
            </div>
            <div>
              <label className={`text-xs font-bold flex items-center gap-1.5 mb-1.5 uppercase tracking-wide ${darkMode ? 'text-[#C9EA63]' : 'text-emerald-700'}`}>
                <FlaskConical size={14}/> Asignación de metrólogos
              </label>
              <div className={`p-3 rounded-xl border text-xs leading-relaxed ${darkMode ? 'bg-[#1b2b10] border-[#C9EA63]/20 text-[#F2F6F0]/70' : 'bg-emerald-50 border-emerald-200 text-emerald-900'}`}>
                Recepción <b>solo registra el equipo y selecciona el área</b>.
                El jefe de metrología (Agustín) recibe los equipos en su <b>Bandeja</b>
                y asigna a los metrólogos según carga de trabajo.
              </div>
            </div>
          </div>

          {/* TABLA DE EQUIPOS */}
          {partidas.length > 0 && (
            <div className={`mb-6 border rounded-xl overflow-x-auto shadow-md ${darkMode ? 'border-[#C9EA63]/20' : 'border-slate-200'}`}>
              <table className="w-full text-sm text-left">
                <thead className={`text-xs uppercase border-b ${darkMode ? 'bg-[#141f0b] text-[#C9EA63] border-[#C9EA63]/20' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                  <tr>
                    <th className="px-3 py-3">#</th>
                    <th className="px-3 py-3 min-w-[80px]">Clave</th>
                    <th className="px-3 py-3 min-w-[200px]">Instrumento</th>
                    <th className="px-3 py-3 min-w-[100px]">No. Certificado</th>
                    <th className="px-3 py-3 min-w-[150px]">Marca / Modelo</th>
                    <th className="px-3 py-3 min-w-[130px]">No. Serie</th>
                    <th className="px-3 py-3 min-w-[150px]">ID / Ubicación</th>
                    <th className="px-3 py-3 min-w-[150px]">Intervalo Calibración</th>
                    <th className="px-3 py-3 min-w-[180px]">Requerimientos / Puntos</th>
                    <th className="px-3 py-3 min-w-[160px]">Tipo de Servicio</th>
                    <th className="px-3 py-3 text-center"></th>
                  </tr>
                </thead>
                <tbody className={darkMode ? 'divide-y divide-[#C9EA63]/10' : 'divide-y divide-slate-100'}>
                  {partidas.map((partida, index) => (
                    <tr key={index} className={`transition-colors ${darkMode ? 'bg-[#253916] hover:bg-[#314a1c]' : 'bg-white hover:bg-emerald-50/50'}`}>
                      <td className={`px-3 py-2 font-bold ${darkMode ? 'text-[#C9EA63]/50' : 'text-slate-400'}`}>{index + 1}</td>
                      <td className="px-3 py-2"><input type="text" value={partida.clave || ''} onChange={(e) => actualizarPartida(index, 'clave', e.target.value.toUpperCase())} placeholder="PDMB01" className={`w-full p-2 rounded font-mono font-bold text-xs outline-none border ${inputBg}`} /></td>
                      <td className="px-3 py-2"><input type="text" value={partida.nombre_instrumento} onChange={(e) => actualizarPartida(index, 'nombre_instrumento', e.target.value)} className={`w-full p-2 rounded font-semibold outline-none border ${inputBg}`} required /></td>
                      <td className="px-3 py-2"><input type="text" value={partida.no_certificado || ''} onChange={(e) => actualizarPartida(index, 'no_certificado', e.target.value.toUpperCase())} placeholder="ICP.0212.26" className={`w-full p-2 rounded font-mono text-xs outline-none border ${darkMode ? 'bg-[#141f0b] text-[#C9EA63] border-[#C9EA63]/40 focus:border-[#C9EA63]' : 'bg-emerald-50 text-[#008a5e] border-emerald-200 focus:border-emerald-500'}`} /></td>
                      <td className="px-3 py-2">
                        <div className="space-y-1">
                          <input type="text" placeholder="Marca" value={partida.marca} onChange={(e) => actualizarPartida(index, 'marca', e.target.value)} className={`w-full p-2 rounded outline-none border ${inputBg}`} required/>
                          <input type="text" placeholder="Modelo" value={partida.modelo} onChange={(e) => actualizarPartida(index, 'modelo', e.target.value)} className={`w-full p-2 rounded font-mono outline-none border ${inputBg}`} required/>
                        </div>
                      </td>
                      <td className="px-3 py-2"><input type="text" value={partida.no_serie} onChange={(e) => actualizarPartida(index, 'no_serie', e.target.value)} className={`w-full p-2 rounded font-mono font-bold outline-none border ${darkMode ? 'bg-[#141f0b] text-[#C9EA63] border-[#C9EA63]/40 focus:border-[#C9EA63]' : 'bg-slate-50 text-[#008a5e] border-gray-300 focus:border-emerald-500'}`} required/></td>
                      <td className="px-3 py-2">
                        <div className="space-y-1">
                          <input type="text" placeholder="Identificación" value={partida.identificacion} onChange={(e) => actualizarPartida(index, 'identificacion', e.target.value)} className={`w-full p-2 rounded outline-none border ${inputBg}`} required/>
                          <input type="text" placeholder="Ubicación" value={partida.ubicacion} onChange={(e) => actualizarPartida(index, 'ubicacion', e.target.value)} className={`w-full p-2 rounded outline-none border ${inputBg}`} required/>
                        </div>
                      </td>
                      <td className="px-3 py-2"><textarea rows="2" value={partida.intervalo_calibracion || ''} onChange={(e) => actualizarPartida(index, 'intervalo_calibracion', e.target.value)} placeholder="(50, 60, 75) %HR" className={`w-full p-2 rounded text-xs outline-none border ${inputBg}`} /></td>
                      <td className="px-3 py-2">
                        <div className="space-y-1">
                          <textarea rows="1" placeholder="Requerimientos" value={partida.requerimientos_especiales} onChange={(e) => actualizarPartida(index, 'requerimientos_especiales', e.target.value)} className={`w-full p-2 rounded text-xs outline-none border ${inputBg}`} />
                          <textarea rows="1" placeholder="Puntos" value={partida.puntos_calibrar} onChange={(e) => actualizarPartida(index, 'puntos_calibrar', e.target.value)} className={`w-full p-2 rounded text-xs outline-none border ${inputBg}`} />
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {/* Sprint 11-A: select per equipo. Default al servicio_solicitado de
                            cabecera, pero cada equipo puede tener un tipo distinto. */}
                        <Select
                          options={tiposServicioActivos}
                          value={partida.tipo_servicio ? { value: partida.tipo_servicio, label: partida.tipo_servicio } : null}
                          onChange={(s) => actualizarPartida(index, 'tipo_servicio', s?.value || '')}
                          isClearable
                          placeholder="—"
                          menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
                          styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }), control: base => ({ ...base, minHeight: 36, fontSize: 12 }) }}
                          noOptionsMessage={() => 'Sin tipos activos'}
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button type="button" onClick={() => eliminarPartida(index)} className="text-red-500 hover:text-red-400 p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20" title="Eliminar fila"><Trash2 size={18} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className={`p-3 border-t ${darkMode ? 'bg-[#141f0b] border-[#C9EA63]/20' : 'bg-slate-50 border-slate-200'}`}>
                <button type="button" onClick={agregarPartidaManual} className={`text-sm font-bold hover:underline px-2 ${darkMode ? 'text-[#C9EA63]' : 'text-[#008a5e]'}`}>
                  + Agregar equipo manualmente
                </button>
              </div>
            </div>
          )}

          {partidas.length > 0 && (
            <div className="space-y-3">
              {(!cabecera.sla || !cabecera.servicio_solicitado || areasSeleccionadas.length === 0) && (
                <div className={`flex items-center gap-3 p-3 rounded-xl border ${darkMode ? 'bg-rose-900/20 border-rose-500/30 text-rose-400' : 'bg-rose-50 border-rose-200 text-rose-600'}`}>
                  <MapPin size={18} />
                  <span className="text-sm font-bold">
                    {!cabecera.sla ? 'Falta SLA' : !cabecera.servicio_solicitado ? 'Falta Tipo de Servicio' : 'Falta Área de Laboratorio'} — debes seleccionar antes de guardar
                  </span>
                </div>
              )}
              <button
                type="submit"
                disabled={cargandoPdf || !cabecera.sla || !cabecera.servicio_solicitado || areasSeleccionadas.length === 0}
                className={`w-full font-black py-5 px-6 rounded-2xl flex justify-center items-center gap-3 transition-all shadow-2xl text-lg disabled:opacity-50 disabled:cursor-not-allowed ${darkMode ? 'bg-[#C9EA63] hover:bg-[#b0d14b] text-[#141f0b] shadow-[#C9EA63]/20' : 'bg-[#008a5e] hover:bg-[#007b55] text-white shadow-[#008a5e]/30'}`}
              >
                {cargandoPdf ? <Loader2 className="animate-spin" /> : <Save size={22} />}
                {`Confirmar y Enviar a Laboratorio (${partidas.length} equipos)${areasSeleccionadas.length > 0 ? ` → ${areasSeleccionadas.map(a => a.label).join(', ')}` : ''}`}
              </button>
            </div>
          )}
        </form>
      </div>

    </div>
  );
};

export default Registro;
