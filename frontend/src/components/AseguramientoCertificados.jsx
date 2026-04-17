import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import Select from 'react-select';
import { 
  FileCheck, 
  Search, 
  FileUp, 
  Loader2, 
  Trash2, 
  Building, 
  Hash, 
  Camera, 
  CheckCircle2, 
  AlertTriangle,
  ClipboardList,
  Save,
  Link as LinkIcon
} from 'lucide-react';

const AseguramientoCertificados = ({ darkMode }) => {
  const fileInputRef = useRef(null);
  const [cargandoOS, setCargandoOS] = useState(false);
  const [cargandoParser, setCargandoParser] = useState(false);
  const [ordenBusqueda, setOrdenBusqueda] = useState('');
  const [instrumentosOS, setInstrumentosOS] = useState([]);
  const [certificadosProcesados, setCertificadosProcesados] = useState([]);
  const [guardando, setGuardando] = useState(false);

  // --- BUSCAR INSTRUMENTOS POR ORDEN ---
  const buscarOrden = async () => {
    if (!ordenBusqueda) return;
    setCargandoOS(true);
    try {
      const res = await axios.get(`/api/ordenes/${encodeURIComponent(ordenBusqueda)}/instrumentos`);
      setInstrumentosOS(res.data);
      if (res.data.length === 0) {
        alert("No se encontraron equipos para esa orden de servicio.");
      }
    } catch (err) {
      alert("Error al buscar la orden.");
    } finally {
      setCargandoOS(false);
    }
  };

  // --- PROCESAR CERTIFICADOS (IA) CON VALIDACIÓN COMPLETA ---
  const handleSubirCertificados = async (event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    setCargandoParser(true);
    const nuevosCertificados = [];

    for (const file of files) {
      const body = new FormData();
      body.append('archivoCert', file);

      try {
        const res = await axios.post('/api/leer-certificado', body);
        const { datos, url } = res.data;

        // Intentar autovincular con instrumentosOS usando comparación inteligente
        let sugerenciaId = null;
        let validacion = null;

        // Búsqueda por múltiples campos con scoring
        const matches = instrumentosOS.map(inst => {
          let score = 0;
          let camposOk = [];
          let camposFail = [];

          // Serie (alto peso)
          if (datos.serie && datos.serie !== 'No Indicado' && inst.no_serie) {
            if (datos.serie.toLowerCase() === inst.no_serie.toLowerCase()) {
              score += 40; camposOk.push('serie');
            } else { camposFail.push('serie'); }
          }

          // Identificación (alto peso)
          if (datos.identificacion && datos.identificacion !== 'No Indicado' && inst.identificacion) {
            if (datos.identificacion.toLowerCase() === inst.identificacion.toLowerCase()) {
              score += 30; camposOk.push('identificación');
            } else { camposFail.push('identificación'); }
          }

          // No. Certificado
          if (datos.no_certificado && datos.no_certificado !== 'No Indicado' && inst.no_certificado) {
            if (datos.no_certificado.toLowerCase() === inst.no_certificado.toLowerCase()) {
              score += 20; camposOk.push('no_certificado');
            } else if (inst.numero_informe && datos.no_certificado.toLowerCase() === inst.numero_informe.toLowerCase()) {
              score += 20; camposOk.push('no_certificado (numero_informe)');
            } else { camposFail.push('no_certificado'); }
          }

          // Marca
          if (datos.marca && datos.marca !== 'No Indicado' && inst.marca) {
            if (datos.marca.toLowerCase().includes(inst.marca.toLowerCase()) || inst.marca.toLowerCase().includes(datos.marca.toLowerCase())) {
              score += 5; camposOk.push('marca');
            } else { camposFail.push('marca'); }
          }

          // Modelo
          if (datos.modelo && datos.modelo !== 'No Indicado' && inst.modelo) {
            if (datos.modelo.toLowerCase().includes(inst.modelo.toLowerCase()) || inst.modelo.toLowerCase().includes(datos.modelo.toLowerCase())) {
              score += 5; camposOk.push('modelo');
            } else { camposFail.push('modelo'); }
          }

          return { inst, score, camposOk, camposFail };
        });

        // Tomar el mejor match (mínimo 50% confianza)
        const bestMatch = matches.reduce((best, m) => m.score > best.score ? m : best, { score: 0 });
        if (bestMatch.score >= 50) {
          sugerenciaId = bestMatch.inst.id;
          validacion = bestMatch;
        }

        nuevosCertificados.push({
          id_temp: Math.random().toString(36).substr(2, 9),
          file_name: file.name,
          url: url,
          datos_ia: datos,
          instrumento_id: sugerenciaId,
          validacion: validacion,
          confirmado: !!sugerenciaId
        });
      } catch (err) {
        console.error(`Error procesando ${file.name}:`, err);
      }
    }

    setCertificadosProcesados([...certificadosProcesados, ...nuevosCertificados]);
    setCargandoParser(false);
    event.target.value = null;
  };

  const actualizarCertificado = (idTemp, campo, valor) => {
    setCertificadosProcesados(prev => prev.map(c => 
      c.id_temp === idTemp ? { ...c, [campo]: valor } : c
    ));
  };

  const handlesSubmitFinal = async () => {
    const vinculaciones = certificadosProcesados
      .filter(c => c.instrumento_id)
      .map(c => ({
        id: c.instrumento_id,
        numero_informe: c.datos_ia.no_certificado,
        certificado_url: c.url
      }));

    if (vinculaciones.length === 0) {
      return alert("No hay vinculaciones válidas para guardar.");
    }

    setGuardando(true);
    try {
      await axios.post('/api/instrumentos-multiple-certificados', { vinculaciones });
      alert(`¡Éxito! Se vincularon ${vinculaciones.length} certificados correctamente.`);
      // Limpiar o refrescar
      buscarOrden();
      setCertificadosProcesados([]);
    } catch (err) {
      alert("Error al guardar las vinculaciones.");
    } finally {
      setGuardando(false);
    }
  };

  // Styles adaptativos
  const boxBg = darkMode ? 'bg-[#253916] border-[#C9EA63]/20' : 'bg-white border-gray-100 shadow-xl';
  const textTitle = darkMode ? 'text-[#F2F6F0]' : 'text-slate-800';
  const labelText = darkMode ? 'text-[#C9EA63]' : 'text-slate-500';
  const inputBg = darkMode ? 'bg-[#141f0b] border-[#C9EA63]/40 text-[#F2F6F0]' : 'bg-white border-gray-300 text-slate-800';

  const selectStyles = {
    control: (base) => ({
      ...base,
      backgroundColor: darkMode ? '#141f0b' : 'white',
      borderColor: darkMode ? 'rgba(201, 234, 99, 0.4)' : '#d1d5db',
      color: darkMode ? '#F2F6F0' : '#1e293b',
    }),
    singleValue: (base) => ({ ...base, color: darkMode ? '#F2F6F0' : '#1e293b' }),
    menu: (base) => ({ ...base, backgroundColor: darkMode ? '#253916' : 'white', zIndex: 100 }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isFocused ? (darkMode ? '#314a1c' : '#f1f5f9') : 'transparent',
      color: darkMode ? '#F2F6F0' : '#1e293b'
    }),
  };

  const totalCertificados = certificadosProcesados.length;
  const vinculadosCount = certificadosProcesados.filter(c => c.instrumento_id).length;
  const faltantesCount = instrumentosOS.length - instrumentosOS.filter(i => i.certificado_url).length;

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      
      {/* 1. BUSCADOR DE ORDEN */}
      <div className={`p-8 rounded-2xl border transition-all ${boxBg}`}>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <h2 className={`text-2xl font-bold flex items-center gap-3 ${textTitle}`}>
              <Hash className={darkMode ? 'text-[#C9EA63]' : 'text-emerald-600'} />
              Certificación Ágil (IA)
            </h2>
            <p className={`mt-2 text-sm ${darkMode ? 'text-[#F2F6F0]/70' : 'text-gray-500'}`}>
              Sube los certificados finales y la IA los asociará automáticamente por <strong>Serie</strong> o <strong>ID</strong>.
            </p>
          </div>
          
          <div className="flex w-full md:w-auto gap-2">
            <input 
              type="text" 
              placeholder="Orden: 26-0090"
              value={ordenBusqueda}
              onChange={(e) => setOrdenBusqueda(e.target.value.toUpperCase())}
              onKeyPress={(e) => e.key === 'Enter' && buscarOrden()}
              className={`flex-1 md:w-48 p-3 rounded-xl border outline-none font-bold tracking-widest ${inputBg}`}
            />
            <button 
              onClick={buscarOrden}
              disabled={cargandoOS}
              className={`p-3 rounded-xl flex items-center gap-2 font-bold transition-all ${darkMode ? 'bg-[#C9EA63] text-[#141f0b]' : 'bg-[#008a5e] text-white hover:bg-[#007b55]'}`}
            >
              {cargandoOS ? <Loader2 className="animate-spin" size={20} /> : <Search size={20} />}
              Buscar
            </button>
          </div>
        </div>

        {instrumentosOS.length > 0 && (
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className={`p-4 rounded-xl border flex items-center gap-4 ${darkMode ? 'bg-[#141f0b]/50 border-[#C9EA63]/20' : 'bg-slate-50 border-slate-200'}`}>
               <ClipboardList className="text-gray-400" size={24} />
               <div>
                  <p className="text-[10px] uppercase font-bold opacity-50">Equipos en la Orden</p>
                  <p className="text-xl font-black">{instrumentosOS.length}</p>
               </div>
            </div>
            <div className={`p-4 rounded-xl border flex items-center gap-4 ${darkMode ? 'bg-[#141f0b]/50 border-[#C9EA63]/20' : 'bg-slate-50 border-slate-200'}`}>
               <CheckCircle2 className="text-emerald-500" size={24} />
               <div>
                  <p className="text-[10px] uppercase font-bold opacity-50">Ya con Certificado</p>
                  <p className="text-xl font-black">{instrumentosOS.filter(i => i.certificado_url).length}</p>
               </div>
            </div>
            <div className={`p-4 rounded-xl border flex items-center gap-4 ${darkMode ? 'bg-[#141f0b]/50 border-yellow-500/20' : 'bg-yellow-50 border-yellow-200'}`}>
               <AlertTriangle className="text-yellow-500" size={24} />
               <div>
                  <p className="text-[10px] uppercase font-bold opacity-50">Pendientes</p>
                  <p className="text-xl font-black text-yellow-600 dark:text-yellow-400">{faltantesCount}</p>
               </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. ÁREA DE CARGA IA */}
      {instrumentosOS.length > 0 && (
        <div className={`p-8 rounded-2xl border transition-all ${boxBg}`}>
          <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
            <h3 className={`text-xl font-black flex items-center gap-2 ${textTitle}`}>
              <FileUp className={darkMode ? 'text-[#C9EA63]' : 'text-emerald-600'} />
              Subir Certificados (PDF)
            </h3>
            
            <input 
              type="file" 
              multiple 
              accept="application/pdf" 
              ref={fileInputRef} 
              onChange={handleSubirCertificados} 
              className="hidden" 
            />
            <button 
              onClick={() => fileInputRef.current.click()}
              disabled={cargandoParser}
              className={`px-10 py-5 rounded-2xl flex flex-col items-center gap-2 border shadow-2xl transition-all w-full md:w-auto ${darkMode ? 'bg-[#C9EA63] text-[#141f0b] border-[#C9EA63]/40' : 'bg-[#008a5e] text-white hover:bg-[#007b55]'}`}
            >
              {cargandoParser ? <Loader2 className="animate-spin" size={24} /> : <FileUp size={24} />}
              <span className="font-black text-sm">{cargandoParser ? "IA ANALIZANDO..." : "SOLTAR CERTIFICADOS AQUÍ"}</span>
              <span className="text-[10px] opacity-70">Puedes seleccionar múltiples archivos</span>
            </button>
          </div>

          <div className="space-y-4">
            {certificadosProcesados.map((cert) => {
              const v = cert.validacion;
              const allMatch = v && v.camposFail.length === 0 && v.camposOk.length > 0;
              const partialMatch = v && v.camposFail.length > 0;
              const noMatch = !v;

              return (
              <div key={cert.id_temp} className={`p-4 rounded-xl border flex flex-col md:flex-row items-center gap-4 transition-all ${darkMode ? 'bg-[#141f0b] border-[#C9EA63]/20' : 'bg-slate-50 border-slate-200'} ${noMatch ? 'border-rose-500/40 bg-rose-500/5' : allMatch ? 'border-emerald-500/40 bg-emerald-500/5' : partialMatch ? 'border-amber-500/40 bg-amber-500/5' : ''}`}>

                <div className="flex-1 min-w-0">
                   <div className="flex items-center gap-2">
                     <FileCheck className={allMatch ? 'text-emerald-500' : partialMatch ? 'text-amber-500' : 'text-blue-500'} size={18} />
                     <p className="font-bold text-sm truncate">{cert.file_name}</p>
                   </div>
                   <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
                      <div className="p-2 rounded bg-opacity-10 bg-gray-500">
                        <p className="text-[8px] uppercase opacity-50">No. Informe</p>
                        <p className="text-xs font-black font-mono">{cert.datos_ia.no_certificado || 'NO DETECTADO'}</p>
                      </div>
                      <div className="p-2 rounded bg-opacity-10 bg-gray-500">
                        <p className="text-[8px] uppercase opacity-50">Serie (IA)</p>
                        <p className="text-xs font-black font-mono">{cert.datos_ia.serie || 'NO DETECTADO'}</p>
                      </div>
                      <div className="p-2 rounded bg-opacity-10 bg-gray-500">
                        <p className="text-[8px] uppercase opacity-50">Orden (IA)</p>
                        <p className="text-xs font-black font-mono">{cert.datos_ia.orden_servicio || 'NO DETECTADO'}</p>
                      </div>
                      <div className="p-2 rounded bg-opacity-10 bg-gray-500">
                        <p className="text-[8px] uppercase opacity-50">Instrumento</p>
                        <p className="text-xs font-medium truncate">{cert.datos_ia.instrumento}</p>
                      </div>
                   </div>

                   {/* VALIDATION RESULTS */}
                   {v && (
                     <div className={`mt-3 p-2 rounded-lg text-xs ${allMatch ? (darkMode ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-100 text-emerald-700') : partialMatch ? (darkMode ? 'bg-amber-900/30 text-amber-400' : 'bg-amber-100 text-amber-700') : ''}`}>
                        <p className="font-black text-[10px] uppercase mb-1">
                          {allMatch ? '✅ Coincidencia perfecta' : partialMatch ? `⚠️ Coincidencia parcial (${v.score}% confianza)` : '❌ Sin coincidencia'}
                        </p>
                        {v.camposOk.length > 0 && (
                          <p className="opacity-80">✅ Coinciden: {v.camposOk.join(', ')}</p>
                        )}
                        {v.camposFail.length > 0 && (
                          <p className="opacity-80">❌ No coinciden: {v.camposFail.join(', ')}</p>
                        )}
                     </div>
                   )}
                </div>

                <div className="w-full md:w-80 space-y-2">
                   <label className="text-[10px] font-bold opacity-60 uppercase flex items-center gap-1">
                      <LinkIcon size={12}/> Vincular con equipo:
                   </label>
                   <Select
                     options={instrumentosOS.map(i => ({
                        value: i.id,
                        label: `${i.no_serie || 'S/N'} - ${i.nombre_instrumento} (${i.certificado_url ? '⚠️ REEMPLAZAR' : 'NUEVO'})`
                     }))}
                     value={instrumentosOS.find(i => i.id === cert.instrumento_id) ? {
                        value: cert.instrumento_id,
                        label: (instrumentosOS.find(i => i.id === cert.instrumento_id)?.no_serie || 'S/N') + " - " + (instrumentosOS.find(i => i.id === cert.instrumento_id)?.nombre_instrumento || 'Desconocido')
                     } : null}
                     onChange={(sel) => actualizarCertificado(cert.id_temp, 'instrumento_id', sel?.value)}
                     isClearable
                     placeholder="Selecciona equipo..."
                     styles={selectStyles}
                     className="text-xs"
                   />
                   {!cert.instrumento_id && (
                     <p className="text-[10px] text-amber-500 font-bold flex items-center gap-1">
                       <AlertTriangle size={10}/> {noMatch ? 'La IA no encontró coincidencia. Selecciona manualmente.' : `Coincidencia parcial (${v?.score}%). Verifica y selecciona si es necesario.`}
                     </p>
                   )}
                </div>

                <button
                  onClick={() => setCertificadosProcesados(prev => prev.filter(p => p.id_temp !== cert.id_temp))}
                  className="p-2 rounded-lg hover:bg-red-500/10 text-red-500 transition-colors"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            )})}

            {certificadosProcesados.length > 0 && (
              <div className="pt-6 border-t border-opacity-10 flex flex-col md:flex-row justify-between items-center gap-6">
                 <div className="text-sm">
                    <span className="opacity-60">Listo para vincular: </span>
                    <span className="font-black text-lg">{vinculadosCount} de {totalCertificados}</span>
                 </div>
                 <button 
                   onClick={handlesSubmitFinal}
                   disabled={guardando || vinculadosCount === 0}
                   className={`w-full md:w-auto px-10 py-4 rounded-xl font-black flex justify-center items-center gap-2 shadow-2xl transition-all ${darkMode ? 'bg-[#C9EA63] text-[#141f0b] hover:bg-[#b0d14b]' : 'bg-[#008a5e] text-white hover:bg-[#007b55]'} disabled:opacity-50`}
                 >
                   {guardando ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                   {guardando ? "GUARDANDO..." : `VINCULAR ${vinculadosCount} CERTIFICADOS`}
                 </button>
              </div>
            )}

            {certificadosProcesados.length === 0 && (
               <div className="py-12 border-2 border-dashed border-opacity-20 rounded-2xl flex flex-col items-center justify-center opacity-40">
                  <Camera size={48} className="mb-4" />
                  <p className="font-bold">No hay certificados procesados</p>
                  <p className="text-xs">Usa el botón de arriba para leer tus archivos PDF con IA</p>
               </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
};

export default AseguramientoCertificados;
