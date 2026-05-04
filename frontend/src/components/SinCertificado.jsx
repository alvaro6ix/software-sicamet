import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FileText, AlertCircle, X, Upload, Eye, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { usePermisos } from '../hooks/usePermisos';

const SinCertificado = ({ darkMode, usuario }) => {
    const { tiene } = usePermisos();
    const puedeSubirCert = tiene('certificacion.subir');
    const [equipos, setEquipos] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [modalDetalle, setModalDetalle] = useState(false);
    const [equipoDetalle, setEquipoDetalle] = useState(null);
    const [certificadoFile, setCertificadoFile] = useState(null);
    const [validando, setValidando] = useState(false);

    const fetchData = async () => {
        try {
            setCargando(true);
            const res = await axios.get('/api/instrumentos/sin-certificado');
            setEquipos(res.data);
        } catch (error) {
            console.error(error);
        } finally {
            setCargando(false);
        }
    };

    useEffect(() => {
        fetchData();
        window.addEventListener('crm:refresh', fetchData);
        return () => window.removeEventListener('crm:refresh', fetchData);
    }, []);

    const abrirDetalle = (eq) => {
        setEquipoDetalle(eq);
        setModalDetalle(true);
        setCertificadoFile(null);
    };

    const subirCertificado = async () => {
        if (!certificadoFile || !equipoDetalle) return;
        try {
            setValidando(true);
            const fd = new FormData();
            fd.append('archivo', certificadoFile);

            // Primero validar con IA
            const validRes = await axios.post(`/api/instrumentos/${equipoDetalle.id}/validar-certificado`, fd);
            const validacion = validRes.data.validacion;

            if (!validacion.coincide && validacion.campos_fail.length > 0) {
                const campos = validacion.campos_fail.map(c => c.campo).join(', ');
                const continuar = window.confirm(
                    `⚠️ La IA detectó diferencias en: ${campos}\n\n` +
                    `¿Deseas subir el certificado de todos modos?`
                );
                if (!continuar) {
                    setValidando(false);
                    return;
                }
            }

            // Subir certificado
            const fd2 = new FormData();
            fd2.append('archivo', certificadoFile);
            await axios.post(`/api/instrumentos/${equipoDetalle.id}/certificado`, fd2);

            toast.success('Certificado subido y validado correctamente');
            setModalDetalle(false);
            setCertificadoFile(null);
            fetchData();
        } catch (err) {
            console.error(err);
            toast.error(err.response?.data?.error || 'Error al subir certificado');
        } finally {
            setValidando(false);
        }
    };

    const countListo = equipos.filter(e => e.estatus_actual === 'Facturación').length;
    const countEntregado = equipos.filter(e => e.estatus_actual === 'Entregado').length;

    return (
        <div className="w-full animate-in fade-in">
            {/* Header */}
            <div className={`flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-6 mb-6 ${darkMode ? 'border-[#C9EA63]/20' : 'border-[#008a5e]/20'}`}>
                <div>
                    <h2 className={`text-2xl md:text-3xl font-bold flex items-center gap-3 ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>
                        <AlertCircle className="text-amber-500" size={32} />
                        Equipos Sin Certificado
                    </h2>
                    <p className={`mt-1 md:mt-2 text-xs md:text-sm ${darkMode ? 'text-[#F2F6F0]/70' : 'text-gray-500'}`}>
                        Equipos que ya están Listos o Entregados pero aún no tienen certificado. Esta alerta es persistente hasta que se suba el PDF.
                    </p>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                <div className={`p-4 rounded-xl border ${darkMode ? 'bg-amber-950/20 border-amber-500/30 text-amber-400' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                    <div className="text-[10px] uppercase font-bold opacity-80 flex items-center gap-1"><FileText size={14}/> Total Sin Certificado</div>
                    <div className="text-3xl font-black">{equipos.length}</div>
                </div>
                <div className={`p-4 rounded-xl border ${darkMode ? 'bg-blue-950/20 border-blue-500/30 text-blue-400' : 'bg-blue-50 border-blue-200 text-blue-700'}`}>
                    <div className="text-[10px] uppercase font-bold opacity-80 flex items-center gap-1"><AlertCircle size={14}/> Listos (pendiente entrega)</div>
                    <div className="text-3xl font-black">{countListo}</div>
                </div>
                <div className={`p-4 rounded-xl border ${darkMode ? 'bg-rose-950/20 border-rose-500/30 text-rose-400' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
                    <div className="text-[10px] uppercase font-bold opacity-80 flex items-center gap-1"><AlertTriangle size={14}/> ¡ENTREGADOS sin certificado!</div>
                    <div className="text-3xl font-black">{countEntregado}</div>
                </div>
            </div>

            {/* Alerta para entregados sin certificado */}
            {countEntregado > 0 && (
                <div className={`mb-6 p-4 rounded-xl border ${darkMode ? 'bg-rose-950/30 border-rose-500/50' : 'bg-rose-50 border-rose-300'}`}>
                    <p className={`text-sm font-bold flex items-center gap-2 ${darkMode ? 'text-rose-300' : 'text-rose-700'}`}>
                        ⚠️ {countEntregado} equipo(s) ya fueron ENTREGADOS al cliente pero aún no tienen certificado registrado.
                    </p>
                </div>
            )}

            {/* Listado */}
            {cargando ? (
                <div className={`p-12 text-center ${darkMode ? 'text-[#F2F6F0]/40' : 'text-slate-400'}`}>
                    <div className="inline-block w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : equipos.length === 0 ? (
                <div className={`p-12 text-center rounded-2xl border ${darkMode ? 'bg-[#1b2b10] border-[#C9EA63]/10 text-[#F2F6F0]/40' : 'bg-white border-slate-200 text-slate-400'}`}>
                    <FileText size={48} className="mx-auto mb-4 opacity-30" />
                    <p className="font-bold">Todos los equipos tienen certificado</p>
                    <p className="text-xs mt-1 opacity-60">¡Excelente trabajo de certificación!</p>
                </div>
            ) : (
                <div className={`border rounded-2xl overflow-hidden divide-y ${darkMode ? 'border-[#C9EA63]/20 divide-[#C9EA63]/5' : 'border-slate-200 divide-slate-100'}`}>
                    {equipos.map(eq => (
                        <div key={eq.id} onClick={() => abrirDetalle(eq)} className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 cursor-pointer transition-colors ${darkMode ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`}>
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                <div className={`w-2 h-2 rounded-full ${eq.estatus_actual === 'Entregado' ? 'bg-rose-500 animate-pulse' : 'bg-amber-500 animate-pulse'}`} />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`text-[10px] font-black ${darkMode ? 'text-white/30' : 'text-slate-400'}`}>{eq.orden_cotizacion}</span>
                                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                                            eq.estatus_actual === 'Entregado'
                                                ? 'bg-rose-500 text-white'
                                                : darkMode ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700'
                                        }`}>
                                            {eq.estatus_actual}
                                        </span>
                                    </div>
                                    <h4 className={`font-black text-base mt-1 truncate ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>{eq.nombre_instrumento}</h4>
                                    <p className={`text-xs ${darkMode ? 'text-white/50' : 'text-slate-500'}`}>{eq.empresa}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className={`text-xs ${darkMode ? 'text-white/30' : 'text-slate-400'}`}>{new Date(eq.fecha_ingreso).toLocaleDateString('es-MX')}</span>
                                <button className={`p-2 rounded-xl transition-all ${darkMode ? 'hover:bg-[#253916] text-[#C9EA63]' : 'hover:bg-slate-100 text-slate-500'}`}><Eye size={18}/></button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal Detalle */}
            {modalDetalle && equipoDetalle && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in">
                    <div className={`w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl shadow-2xl border ${darkMode ? 'bg-[#141f0b] border-[#C9EA63]/20' : 'bg-white border-slate-200'}`}>
                        <div className={`p-5 flex justify-between items-center border-b ${darkMode ? 'bg-[#253916] border-[#C9EA63]/10' : 'bg-slate-50 border-slate-100'}`}>
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-xl ${darkMode ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-600'}`}><FileText size={20}/></div>
                                <div>
                                    <h2 className={`text-lg font-black ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>Subir Certificado</h2>
                                    <p className={`text-xs ${darkMode ? 'text-[#C9EA63]/70' : 'text-emerald-600'}`}>{equipoDetalle.nombre_instrumento} — {equipoDetalle.orden_cotizacion}</p>
                                </div>
                            </div>
                            <button onClick={() => setModalDetalle(false)} className={`p-2 rounded-xl ${darkMode ? 'hover:bg-[#141f0b] text-white/60' : 'hover:bg-slate-200 text-slate-400'}`}><X size={24}/></button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div className={`p-4 rounded-xl ${darkMode ? 'bg-[#1b2b10]' : 'bg-slate-50'}`}>
                                <h4 className={`text-sm font-bold mb-2 ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>Datos del Equipo</h4>
                                <p className={`text-xs ${darkMode ? 'text-white/60' : 'text-slate-500'}`}>Empresa: <strong>{equipoDetalle.empresa}</strong></p>
                                <p className={`text-xs ${darkMode ? 'text-white/60' : 'text-slate-500'}`}>Marca: <strong>{equipoDetalle.marca}</strong> | Modelo: <strong>{equipoDetalle.modelo}</strong></p>
                                <p className={`text-xs ${darkMode ? 'text-white/60' : 'text-slate-500'}`}>Serie: <strong>{equipoDetalle.no_serie}</strong></p>
                                <p className={`text-xs mt-1 ${darkMode ? 'text-amber-400' : 'text-amber-600'}`}>
                                    Estatus: <strong>{equipoDetalle.estatus_actual}</strong> | 
                                    {equipoDetalle.estatus_actual === 'Entregado' && <span className="text-rose-500 font-bold"> ¡ENTREGADO sin certificado!</span>}
                                </p>
                            </div>

                            <div>
                                <label className={`text-sm font-bold ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>Subir PDF del Certificado</label>
                                <div className={`mt-2 p-6 rounded-xl border-2 border-dashed text-center cursor-pointer transition-colors ${darkMode ? 'border-[#C9EA63]/30 hover:border-[#C9EA63]/60 bg-[#1b2b10]' : 'border-slate-300 hover:border-[#008a5e] bg-slate-50'}`}
                                    onClick={() => document.getElementById('cert-input')?.click()}
                                >
                                    <input id="cert-input" type="file" accept=".pdf" className="hidden" onChange={e => setCertificadoFile(e.target.files[0])} />
                                    {certificadoFile ? (
                                        <div>
                                            <p className={`font-bold ${darkMode ? 'text-[#C9EA63]' : 'text-[#008a5e]'}`}>✅ {certificadoFile.name}</p>
                                            <p className={`text-xs mt-1 ${darkMode ? 'text-white/40' : 'text-slate-400'}`}>Click para cambiar</p>
                                        </div>
                                    ) : (
                                        <div>
                                            <Upload size={32} className={`mx-auto mb-2 ${darkMode ? 'text-[#C9EA63]/40' : 'text-slate-400'}`} />
                                            <p className={`font-bold ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>Click o arrastra el PDF aquí</p>
                                            <p className={`text-xs mt-1 ${darkMode ? 'text-white/40' : 'text-slate-400'}`}>La IA validará que los datos coincidan</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className={`p-5 border-t flex gap-3 ${darkMode ? 'border-[#C9EA63]/10' : 'border-slate-100'}`}>
                            <button onClick={() => setModalDetalle(false)} className={`flex-1 py-3 font-bold rounded-xl ${darkMode ? 'bg-[#253916] text-white hover:bg-[#314a1c]' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Cerrar</button>
                            {puedeSubirCert ? (
                                <button onClick={subirCertificado} disabled={!certificadoFile || validando} className={`flex-[2] flex justify-center items-center gap-2 font-black py-3 rounded-xl shadow-lg disabled:opacity-50 disabled:cursor-not-allowed ${darkMode ? 'bg-[#C9EA63] text-[#141f0b] hover:bg-[#b0d14b]' : 'bg-[#008a5e] text-white hover:bg-[#007b55]'}`}>
                                    {validando ? 'Validando con IA...' : <>Subir y Validar Certificado <Upload size={18}/></>}
                                </button>
                            ) : (
                                <div className={`flex-[2] flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold ${darkMode ? 'bg-[#1b2b10] text-[#F2F6F0]/40' : 'bg-slate-100 text-slate-400'}`}>
                                    <AlertCircle size={14}/> No tienes permiso para subir certificados
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};



export default SinCertificado;
