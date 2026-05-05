import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FileText, AlertCircle, X, Upload, Eye, AlertTriangle, Clock, CheckSquare, Square, Send, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { usePermisos } from '../hooks/usePermisos';
import { confirmar } from '../hooks/alertas';

const SinCertificado = ({ darkMode, usuario }) => {
    const { tiene } = usePermisos();
    const puedeSubirCert = tiene('certificacion.subir');
    const [equipos, setEquipos] = useState([]);
    const [seguimiento, setSeguimiento] = useState([]); // Sprint 12-B
    const [cargando, setCargando] = useState(true);
    const [modalDetalle, setModalDetalle] = useState(false);
    const [equipoDetalle, setEquipoDetalle] = useState(null);
    const [certificadoFile, setCertificadoFile] = useState(null);
    const [validando, setValidando] = useState(false);
    const [seleccionados, setSeleccionados] = useState([]); // ids para acciones bulk
    const [modoBulk, setModoBulk] = useState(false); // mostrar checkboxes

    const fetchData = async () => {
        try {
            setCargando(true);
            const [r1, r2] = await Promise.all([
                axios.get('/api/instrumentos/sin-certificado'),
                axios.get('/api/certificacion/seguimiento').catch(() => ({ data: [] }))
            ]);
            setEquipos(r1.data);
            setSeguimiento(r2.data || []);
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

    // Sprint 12-B — selección y acciones en lote
    const toggleSel = (id) => {
        setSeleccionados(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };
    const idsCertificacion = equipos.filter(e => e.estatus_actual === 'Certificación').map(e => e.id);
    const allSelectedCert = idsCertificacion.length > 0 && idsCertificacion.every(id => seleccionados.includes(id));
    const toggleSelAllCert = () => {
        setSeleccionados(prev => allSelectedCert ? prev.filter(id => !idsCertificacion.includes(id)) : [...new Set([...prev, ...idsCertificacion])]);
    };

    const ejecutarBulk = async (modo) => {
        const ids = seleccionados.filter(id => idsCertificacion.includes(id));
        if (ids.length === 0) return toast.error('Selecciona al menos un equipo en Certificación');
        const labels = { con_cert: 'enviar CON certificado', no_requiere: 'marcar como NO REQUIERE certificado', pendiente: 'enviar como PENDIENTE de certificado' };
        if (!(await confirmar('Confirmar acción', `Vas a ${labels[modo]} ${ids.length} equipo(s) y pasarlos a Facturación.`))) return;
        try {
            const res = await axios.post('/api/instrumentos-multiple-finalizar', { ids, modo });
            toast.success(`${res.data.count || 0} equipo(s) movidos a Facturación`);
            setSeleccionados([]);
            setModoBulk(false);
            fetchData();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Error al procesar');
        }
    };

    // Acciones individuales desde el modal
    const accionIndividual = async (modo) => {
        if (!equipoDetalle) return;
        const ids = [equipoDetalle.id];
        try {
            await axios.post('/api/instrumentos-multiple-finalizar', { ids, modo });
            toast.success(modo === 'pendiente' ? 'Equipo enviado como pendiente' : modo === 'no_requiere' ? 'Equipo marcado como no requiere' : 'Equipo enviado');
            setModalDetalle(false);
            fetchData();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Error al procesar');
        }
    };

    const abrirDetalle = (eq) => {
        setEquipoDetalle(eq);
        setModalDetalle(true);
        setCertificadoFile(null);
    };

    const subirCertificado = async () => {
        if (!certificadoFile || !equipoDetalle) return;
        try {
            setValidando(true);

            // Intentar validar con IA. Si la IA falla o detecta diferencias,
            // ofrecemos subir igual; no bloqueamos la operación (la IA es asistiva).
            try {
                const fd = new FormData();
                fd.append('archivo', certificadoFile);
                const validRes = await axios.post(`/api/instrumentos/${equipoDetalle.id}/validar-certificado`, fd);
                const validacion = validRes.data?.validacion;
                if (validacion && !validacion.coincide && validacion.campos_fail?.length > 0) {
                    const campos = validacion.campos_fail.map(c => c.campo).join(', ');
                    const continuar = await confirmar(
                        'La IA detectó diferencias',
                        `Campos que no coinciden: ${campos}. ¿Subir el certificado de todos modos?`,
                        { confirmText: 'Sí, subir igual' }
                    );
                    if (!continuar) {
                        setValidando(false);
                        return;
                    }
                }
            } catch (errIA) {
                // La validación con IA es best-effort. Si falla, registrar y seguir.
                console.warn('Validación IA falló (no bloqueante):', errIA?.response?.data?.error || errIA.message);
                toast.info('La validación con IA no pudo ejecutarse. Subiendo el PDF directo.');
            }

            // Subir certificado real (siempre intenta)
            const fd2 = new FormData();
            fd2.append('archivo', certificadoFile);
            await axios.post(`/api/instrumentos/${equipoDetalle.id}/certificado`, fd2);

            toast.success('Certificado subido correctamente');
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

    const countCert = equipos.filter(e => e.estatus_actual === 'Certificación').length;
    const countListo = equipos.filter(e => e.estatus_actual === 'Facturación').length;
    const countEntregado = equipos.filter(e => e.estatus_actual === 'Entregado').length;
    // Sprint 12-B — conteos en seguimiento (los que ya pasaron a Facturación/Entregado)
    const countPendientesSeg = seguimiento.filter(s => s.certificado_pendiente === 1).length;
    const countSinDefinirSeg = seguimiento.filter(s => s.certificado_pendiente !== 1 && s.no_requiere_certificado !== 1).length;

    return (
        <div className="w-full animate-in fade-in">
            {/* Header */}
            <div className={`flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-6 mb-6 ${darkMode ? 'border-[#C9EA63]/20' : 'border-[#008a5e]/20'}`}>
                <div>
                    <h2 className={`text-2xl md:text-3xl font-bold flex items-center gap-3 ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>
                        <AlertCircle className="text-amber-500" size={32} />
                        Pendientes de Certificación
                    </h2>
                    <p className={`mt-1 md:mt-2 text-xs md:text-sm ${darkMode ? 'text-[#F2F6F0]/70' : 'text-gray-500'}`}>
                        Equipos aprobados por Aseguramiento esperando que subas el certificado, y los que ya pasaron a Facturación o Entregado sin PDF.
                    </p>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className={`p-4 rounded-xl border ${darkMode ? 'bg-amber-950/20 border-amber-500/30 text-amber-400' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                    <div className="text-[10px] uppercase font-bold opacity-80 flex items-center gap-1"><FileText size={14}/> Total Sin Certificado</div>
                    <div className="text-3xl font-black">{equipos.length}</div>
                </div>
                <div className={`p-4 rounded-xl border ${darkMode ? 'bg-purple-950/20 border-purple-500/30 text-purple-400' : 'bg-purple-50 border-purple-200 text-purple-700'}`}>
                    <div className="text-[10px] uppercase font-bold opacity-80 flex items-center gap-1"><AlertCircle size={14}/> En Certificación (recién aprobados)</div>
                    <div className="text-3xl font-black">{countCert}</div>
                </div>
                <div className={`p-4 rounded-xl border ${darkMode ? 'bg-blue-950/20 border-blue-500/30 text-blue-400' : 'bg-blue-50 border-blue-200 text-blue-700'}`}>
                    <div className="text-[10px] uppercase font-bold opacity-80 flex items-center gap-1"><AlertCircle size={14}/> Facturación (pendiente entrega)</div>
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

            {/* Sprint 12-B — Seguimiento: equipos que ya pasaron de Certificación pero
                que aún esperan que les subas el PDF. Se separa visualmente del listado
                principal para que no se mezclen con los que están en tu bandeja activa. */}
            {seguimiento.length > 0 && (
                <div className={`mb-6 p-5 rounded-2xl border ${darkMode ? 'bg-amber-950/15 border-amber-500/30' : 'bg-amber-50 border-amber-200'}`}>
                    <div className="flex items-center gap-2 mb-3">
                        <Clock className={darkMode ? 'text-amber-400' : 'text-amber-700'} size={18}/>
                        <h3 className={`text-sm font-black ${darkMode ? 'text-amber-300' : 'text-amber-800'}`}>Seguimiento de PDFs por subir</h3>
                        <span className={`ml-auto text-xs font-bold ${darkMode ? 'text-amber-300/80' : 'text-amber-700'}`}>
                            {countPendientesSeg} marcados pendientes · {countSinDefinirSeg} sin definir
                        </span>
                    </div>
                    <p className={`text-[11px] mb-3 ${darkMode ? 'text-amber-200/70' : 'text-amber-700'}`}>
                        Estos equipos ya pasaron a Facturación o Entrega sin certificado. Sigue siendo tu responsabilidad subirlos.
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {seguimiento.slice(0, 8).map(s => (
                            <button
                                key={s.id}
                                onClick={() => abrirDetalle(s)}
                                className={`text-left px-3 py-2 rounded-xl border text-[11px] hover:shadow-md transition-all ${darkMode ? 'bg-[#1b2b10] border-amber-500/30 hover:border-amber-400' : 'bg-white border-amber-300 hover:border-amber-500'}`}
                            >
                                <div className="flex items-center gap-1.5 mb-1">
                                    <span className={`text-[9px] font-mono opacity-50`}>{s.orden_cotizacion}</span>
                                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-black ${s.certificado_pendiente ? 'bg-amber-500 text-white' : 'bg-rose-500 text-white'}`}>
                                        {s.certificado_pendiente ? 'PENDIENTE' : 'SIN DEFINIR'}
                                    </span>
                                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-black ${darkMode ? 'bg-[#253916] text-[#C9EA63]' : 'bg-emerald-100 text-emerald-700'}`}>{s.estatus_actual}</span>
                                </div>
                                <div className={`font-bold truncate max-w-[200px] ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-700'}`}>{s.nombre_instrumento}</div>
                                <div className={`text-[10px] opacity-60 truncate max-w-[200px]`}>{s.empresa}</div>
                            </button>
                        ))}
                        {seguimiento.length > 8 && (
                            <span className={`px-3 py-2 text-[11px] italic ${darkMode ? 'text-amber-300/60' : 'text-amber-700/60'}`}>
                                + {seguimiento.length - 8} más...
                            </span>
                        )}
                    </div>
                </div>
            )}

            {/* Sprint 12-B — Acciones en lote (solo aplica a los en Certificación) */}
            {puedeSubirCert && countCert > 0 && (
                <div className={`mb-4 p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center gap-3 ${darkMode ? 'bg-[#1b2b10] border-[#C9EA63]/20' : 'bg-emerald-50/60 border-emerald-200'}`}>
                    <button
                        onClick={() => { setModoBulk(!modoBulk); if (modoBulk) setSeleccionados([]); }}
                        className={`px-3 py-2 rounded-lg text-xs font-black ${modoBulk ? (darkMode ? 'bg-[#C9EA63] text-[#141f0b]' : 'bg-emerald-600 text-white') : (darkMode ? 'bg-[#253916] text-[#C9EA63]' : 'bg-white border border-emerald-300 text-emerald-700')}`}
                    >
                        {modoBulk ? '✕ Salir de selección' : '☐ Modo selección'}
                    </button>
                    {modoBulk && (
                        <>
                            <button onClick={toggleSelAllCert} className={`px-3 py-2 rounded-lg text-xs font-bold ${darkMode ? 'bg-[#253916] text-[#C9EA63] hover:bg-[#314a1c]' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                                {allSelectedCert ? 'Deseleccionar' : 'Seleccionar todos en Certificación'}
                            </button>
                            <span className={`text-xs font-bold ${darkMode ? 'text-[#F2F6F0]/60' : 'text-slate-600'}`}>
                                {seleccionados.filter(id => idsCertificacion.includes(id)).length} seleccionados
                            </span>
                            <div className="flex flex-wrap gap-2 ml-auto">
                                <button onClick={() => ejecutarBulk('con_cert')} className={`px-3 py-2 rounded-lg text-[11px] font-black flex items-center gap-1 ${darkMode ? 'bg-emerald-500 text-white' : 'bg-emerald-600 text-white'}`} title="Solo procesa los que ya tienen certificado subido">
                                    <Send size={12}/> CON cert
                                </button>
                                <button onClick={() => ejecutarBulk('pendiente')} className={`px-3 py-2 rounded-lg text-[11px] font-black flex items-center gap-1 ${darkMode ? 'bg-amber-500 text-white' : 'bg-amber-500 text-white'}`}>
                                    <Clock size={12}/> Pendiente cert
                                </button>
                                <button onClick={() => ejecutarBulk('no_requiere')} className={`px-3 py-2 rounded-lg text-[11px] font-black flex items-center gap-1 ${darkMode ? 'bg-slate-500 text-white' : 'bg-slate-600 text-white'}`}>
                                    <Ban size={12}/> No requiere
                                </button>
                            </div>
                        </>
                    )}
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
                    {equipos.map(eq => {
                        const enCert = eq.estatus_actual === 'Certificación';
                        const sel = seleccionados.includes(eq.id);
                        return (
                            <div key={eq.id} className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 transition-colors ${sel ? (darkMode ? 'bg-[#C9EA63]/5' : 'bg-emerald-50') : (darkMode ? 'hover:bg-white/5' : 'hover:bg-slate-50')}`}>
                                {/* Checkbox solo cuando estamos en modo bulk y el equipo está en Certificación */}
                                {modoBulk && enCert && (
                                    <button onClick={() => toggleSel(eq.id)} className={`p-1.5 rounded-lg ${sel ? (darkMode ? 'bg-[#C9EA63] text-[#141f0b]' : 'bg-emerald-600 text-white') : (darkMode ? 'bg-white/10 text-white/40' : 'bg-slate-200 text-slate-400')}`}>
                                        {sel ? <CheckSquare size={16}/> : <Square size={16}/>}
                                    </button>
                                )}
                                <div onClick={() => abrirDetalle(eq)} className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                                    <div className={`w-2 h-2 rounded-full ${eq.estatus_actual === 'Entregado' ? 'bg-rose-500 animate-pulse' : 'bg-amber-500 animate-pulse'}`} />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className={`text-[10px] font-black ${darkMode ? 'text-white/30' : 'text-slate-400'}`}>{eq.orden_cotizacion}</span>
                                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                                                eq.estatus_actual === 'Entregado'
                                                    ? 'bg-rose-500 text-white'
                                                    : darkMode ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700'
                                            }`}>{eq.estatus_actual}</span>
                                            {/* Sprint 12-B — badges de estado del cert */}
                                            {eq.certificado_pendiente === 1 && (
                                                <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-amber-500 text-white">PENDIENTE PDF</span>
                                            )}
                                            {eq.no_requiere_certificado === 1 && (
                                                <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-slate-500 text-white">NO REQUIERE</span>
                                            )}
                                        </div>
                                        <h4 className={`font-black text-base mt-1 truncate ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>{eq.nombre_instrumento}</h4>
                                        <p className={`text-xs ${darkMode ? 'text-white/50' : 'text-slate-500'}`}>{eq.empresa}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className={`text-xs ${darkMode ? 'text-white/30' : 'text-slate-400'}`}>{new Date(eq.fecha_ingreso).toLocaleDateString('es-MX')}</span>
                                    <button onClick={() => abrirDetalle(eq)} className={`p-2 rounded-xl transition-all ${darkMode ? 'hover:bg-[#253916] text-[#C9EA63]' : 'hover:bg-slate-100 text-slate-500'}`}><Eye size={18}/></button>
                                </div>
                            </div>
                        );
                    })}
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

                        <div className={`p-5 border-t flex flex-col gap-3 ${darkMode ? 'border-[#C9EA63]/10' : 'border-slate-100'}`}>
                            {puedeSubirCert ? (
                                <>
                                    <button onClick={subirCertificado} disabled={!certificadoFile || validando} className={`flex justify-center items-center gap-2 font-black py-3 rounded-xl shadow-lg disabled:opacity-50 disabled:cursor-not-allowed ${darkMode ? 'bg-[#C9EA63] text-[#141f0b] hover:bg-[#b0d14b]' : 'bg-[#008a5e] text-white hover:bg-[#007b55]'}`}>
                                        {validando ? 'Validando con IA...' : <>Subir Certificado y pasar a Facturación <Upload size={18}/></>}
                                    </button>
                                    {/* Sprint 12-B — solo aplica cuando el equipo está en Certificación */}
                                    {equipoDetalle.estatus_actual === 'Certificación' && (
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => accionIndividual('pendiente')}
                                                className={`flex-1 flex items-center justify-center gap-1 py-2.5 rounded-xl text-xs font-black ${darkMode ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-amber-500 text-white hover:bg-amber-600'}`}
                                                title="Manda a Facturación marcado como pendiente. Ivón y Flor verán el flag y tú podrás subir el PDF más tarde."
                                            >
                                                <Clock size={14}/> Enviar como PENDIENTE
                                            </button>
                                            <button
                                                onClick={() => accionIndividual('no_requiere')}
                                                className={`flex-1 flex items-center justify-center gap-1 py-2.5 rounded-xl text-xs font-black ${darkMode ? 'bg-slate-500 text-white hover:bg-slate-600' : 'bg-slate-600 text-white hover:bg-slate-700'}`}
                                                title="El equipo no requiere certificado (servicio sin entregable). Pasa directo a Facturación."
                                            >
                                                <Ban size={14}/> NO REQUIERE certificado
                                            </button>
                                        </div>
                                    )}
                                    <button onClick={() => setModalDetalle(false)} className={`py-2 font-bold rounded-xl text-xs ${darkMode ? 'bg-[#253916] text-white/70 hover:bg-[#314a1c]' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>Cerrar</button>
                                </>
                            ) : (
                                <div className="flex gap-3">
                                    <button onClick={() => setModalDetalle(false)} className={`flex-1 py-3 font-bold rounded-xl ${darkMode ? 'bg-[#253916] text-white hover:bg-[#314a1c]' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Cerrar</button>
                                    <div className={`flex-[2] flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold ${darkMode ? 'bg-[#1b2b10] text-[#F2F6F0]/40' : 'bg-slate-100 text-slate-400'}`}>
                                        <AlertCircle size={14}/> No tienes permiso para subir certificados
                                    </div>
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
