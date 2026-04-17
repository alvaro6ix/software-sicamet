import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Package, Clock, AlertTriangle, CheckCircle, MessageSquare, X, Eye, ThumbsUp, CheckSquare, Square, AlertCircle, FileText } from 'lucide-react';
import { toast } from 'react-toastify';

const getOsaColor = (osStr, isDark) => {
    if (!osStr) return isDark ? '#2a401c' : '#ffffff';
    let hash = 0;
    for (let i = 0; i < osStr.length; i++) hash = osStr.charCodeAt(i) + ((hash << 5) - hash);
    const hue = Math.abs(hash) % 360;
    return isDark ? `hsl(${hue}, 40%, 20%)` : `hsl(${hue}, 70%, 95%)`;
};

const MiBandeja = ({ darkMode, usuario }) => {
    const navigate = useNavigate();
    const [equipos, setEquipos] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [busqueda, setBusqueda] = useState('');
    const [seleccionados, setSeleccionados] = useState([]);
    const [modalDetalle, setModalDetalle] = useState(false);
    const [equipoDetalle, setEquipoDetalle] = useState(null);
    const [modalConf, setModalConf] = useState(false);

    const fetchData = async () => {
        try {
            setCargando(true);
            const res = await axios.get('/api/metrologia/mi-bandeja');
            setEquipos(res.data);
        } catch (error) {
            console.error(error);
            toast.error('Error al cargar mi bandeja');
        } finally {
            setCargando(false);
        }
    };

    useEffect(() => {
        fetchData();
        window.addEventListener('crm:refresh', fetchData);
        return () => window.removeEventListener('crm:refresh', fetchData);
    }, []);

    const toggleSeleccion = (id) => {
        setSeleccionados(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const toggleTodos = () => {
        const ids = equipos.map(e => e.id);
        const todosSel = ids.every(id => seleccionados.includes(id));
        setSeleccionados(todosSel ? [] : ids);
    };

    const finalizarSeleccionados = () => {
        if (seleccionados.length === 0) return;
        setModalConf(true);
    };

    const confirmarEnvio = async (envioIndividual = false) => {
        try {
            const promesas = seleccionados.map(id =>
                axios.post(`/api/instrumentos/${id}/finalizar_metrologo`, { enviar_a_aseguramiento: envioIndividual })
            );
            const resultados = await Promise.all(promesas);

            const enviados = resultados.filter(r => r.data.enviado_a_aseguramiento).length;
            const pendientes = seleccionados.length - enviados;

            if (enviados > 0) toast.success(`${enviados} equipo(s) enviados a Aseguramiento`);
            if (pendientes > 0) toast.info(`${pendientes} equipo(s): marcaste tu parte pero hay metrologos pendientes`);

            setSeleccionados([]);
            setModalConf(false);
            fetchData();
        } catch (err) {
            toast.error('Error al finalizar metrología');
        }
    };

    const abrirDetalles = (eq) => {
        setEquipoDetalle(eq);
        setModalDetalle(true);
    };

    const filtrados = equipos.filter(e =>
        (e.orden_cotizacion || '').toLowerCase().includes(busqueda.toLowerCase()) ||
        (e.empresa || '').toLowerCase().includes(busqueda.toLowerCase()) ||
        (e.nombre_instrumento || '').toLowerCase().includes(busqueda.toLowerCase())
    );

    // KPIs personales
    const countTotal = equipos.length;
    const countRojo = equipos.filter(e => e.slaRestante <= 1).length;
    const countAmarillo = equipos.filter(e => e.slaRestante > 1 && e.slaRestante <= 3).length;
    const countVerde = equipos.filter(e => e.slaRestante > 3).length;
    const countCorreccion = equipos.filter(e => e.mi_estatus === 'correccion').length;
    const countTerminado = equipos.filter(e => e.mi_estatus === 'terminado').length;

    return (
        <div className="w-full relative pb-24 animate-in fade-in">
            {/* Header */}
            <div className={`flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-6 mb-6 ${darkMode ? 'border-[#C9EA63]/20' : 'border-[#008a5e]/20'}`}>
                <div>
                    <h2 className={`text-2xl md:text-3xl font-bold flex items-center gap-3 ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>
                        <Package className={darkMode ? 'text-[#C9EA63]' : 'text-[#008a5e]'} size={32} />
                        Mi Bandeja de Trabajo
                    </h2>
                    <p className={`mt-1 md:mt-2 text-xs md:text-sm ${darkMode ? 'text-[#F2F6F0]/70' : 'text-gray-500'}`}>
                        Instrumentos asignados a ti. Gestiona tu trabajo y envía a Aseguramiento cuando termines.
                    </p>
                </div>
                <div className={`text-xs font-bold px-3 py-1.5 rounded-lg ${darkMode ? 'bg-[#253916] text-[#C9EA63]' : 'bg-emerald-50 text-[#008a5e]'}`}>
                    Metrologo: {usuario?.nombre}
                </div>
            </div>

            {/* KPIs Personales */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
                <div className={`p-3 rounded-xl border ${darkMode ? 'bg-[#1b2b10] border-[#C9EA63]/20' : 'bg-white border-slate-200'}`}>
                    <div className={`text-[10px] uppercase font-bold opacity-60 flex items-center gap-1`}><Package size={12}/> Total</div>
                    <div className={`text-2xl font-black ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>{countTotal}</div>
                </div>
                <div className={`p-3 rounded-xl border ${darkMode ? 'bg-rose-950/20 border-rose-900/50 text-rose-400' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
                    <div className="text-[10px] uppercase font-bold opacity-80 flex items-center gap-1"><AlertTriangle size={12}/> Urgente</div>
                    <div className="text-2xl font-black">{countRojo}</div>
                </div>
                <div className={`p-3 rounded-xl border ${darkMode ? 'bg-[#C9EA63]/10 border-[#C9EA63]/20 text-[#C9EA63]' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                    <div className="text-[10px] uppercase font-bold opacity-80 flex items-center gap-1"><AlertCircle size={12}/> Medio</div>
                    <div className="text-2xl font-black">{countAmarillo}</div>
                </div>
                <div className={`p-3 rounded-xl border ${darkMode ? 'bg-emerald-950/20 border-emerald-900/50 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
                    <div className="text-[10px] uppercase font-bold opacity-80 flex items-center gap-1"><CheckCircle size={12}/> Normal</div>
                    <div className="text-2xl font-black">{countVerde}</div>
                </div>
                <div className={`p-3 rounded-xl border ${darkMode ? 'bg-orange-950/20 border-orange-900/50 text-orange-400' : 'bg-orange-50 border-orange-200 text-orange-700'}`}>
                    <div className="text-[10px] uppercase font-bold opacity-80 flex items-center gap-1"><AlertTriangle size={12}/> Corrección</div>
                    <div className="text-2xl font-black">{countCorreccion}</div>
                </div>
                <div className={`p-3 rounded-xl border ${darkMode ? 'bg-blue-950/20 border-blue-900/50 text-blue-400' : 'bg-blue-50 border-blue-200 text-blue-700'}`}>
                    <div className="text-[10px] uppercase font-bold opacity-80 flex items-center gap-1"><ThumbsUp size={12}/> Terminado</div>
                    <div className="text-2xl font-black">{countTerminado}</div>
                </div>
            </div>

            {/* Busqueda */}
            <div className={`p-4 border rounded-2xl mb-4 flex items-center gap-2 ${darkMode ? 'bg-[#1b2b10] border-[#C9EA63]/20' : 'bg-white border-slate-200'}`}>
                <input
                    value={busqueda} onChange={e => setBusqueda(e.target.value)}
                    placeholder="Buscar por OC, empresa o instrumento..."
                    className={`flex-1 bg-transparent outline-none text-sm ${darkMode ? 'text-[#F2F6F0] placeholder-[#F2F6F0]/40' : 'text-slate-800 placeholder-slate-400'}`}
                />
                {countTotal > 0 && (
                    <button onClick={toggleTodos} className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${darkMode ? 'bg-[#253916] text-[#C9EA63] hover:bg-[#314a1c]' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                        {seleccionados.length === countTotal ? 'Deseleccionar' : 'Seleccionar todos'}
                    </button>
                )}
            </div>

            {/* Listado */}
            {cargando ? (
                <div className={`p-12 text-center ${darkMode ? 'text-[#F2F6F0]/40' : 'text-slate-400'}`}>
                    <div className="inline-block w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : filtrados.length === 0 ? (
                <div className={`p-12 text-center rounded-2xl border ${darkMode ? 'bg-[#1b2b10] border-[#C9EA63]/10 text-[#F2F6F0]/40' : 'bg-white border-slate-200 text-slate-400'}`}>
                    <Package size={48} className="mx-auto mb-4 opacity-30" />
                    <p className="font-bold">No tienes instrumentos asignados</p>
                    <p className="text-xs mt-1 opacity-60">Los instrumentos que te asignen aparecerán aquí.</p>
                </div>
            ) : (
                <div className={`border rounded-2xl overflow-hidden divide-y ${darkMode ? 'border-[#C9EA63]/20 divide-[#C9EA63]/5' : 'border-slate-200 divide-slate-100'}`}>
                    {filtrados.map(eq => {
                        const sel = seleccionados.includes(eq.id);
                        const badgeColor = eq.slaRestante <= 1 ? 'bg-rose-500/20 text-rose-400' :
                                          eq.slaRestante <= 3 ? 'bg-amber-500/20 text-amber-400' :
                                          'bg-emerald-500/20 text-emerald-400';
                        const miEstatusColor = eq.mi_estatus === 'correccion' ? 'bg-orange-500/20 text-orange-400' :
                                              eq.mi_estatus === 'terminado' ? 'bg-blue-500/20 text-blue-400' :
                                              'bg-slate-500/20 text-slate-400';

                        return (
                            <div key={eq.id} className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 transition-colors cursor-pointer ${sel ? (darkMode ? 'bg-[#C9EA63]/5' : 'bg-emerald-50') : (darkMode ? 'hover:bg-white/5' : 'hover:bg-slate-50')}`}
                                onClick={() => abrirDetalles(eq)}
                            >
                                {/* Select checkbox */}
                                <div className="sm:mr-3 flex-shrink-0" onClick={e => e.stopPropagation()}>
                                    <button onClick={() => toggleSeleccion(eq.id)} className={`p-1.5 rounded-lg transition-colors ${sel ? (darkMode ? 'bg-[#C9EA63] text-[#141f0b]' : 'bg-[#008a5e] text-white') : (darkMode ? 'bg-white/10 text-white/40' : 'bg-slate-200 text-slate-400')}`}>
                                        {sel ? <CheckSquare size={16} /> : <Square size={16} />}
                                    </button>
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`text-[10px] font-black tracking-widest ${darkMode ? 'text-white/30' : 'text-slate-400'}`}>{eq.orden_cotizacion}</span>
                                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${miEstatusColor}`}>
                                            {eq.mi_estatus === 'correccion' ? `CORRECCIÓN (${eq.total_rechazos || 0})` : eq.mi_estatus}
                                        </span>
                                        {eq.total_rechazos > 0 && (
                                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-rose-500 text-white flex items-center gap-1">
                                                <AlertTriangle size={10}/> RECHAZO #{eq.total_rechazos}
                                            </span>
                                        )}
                                    </div>
                                    <h4 className={`font-black text-base mt-1 truncate ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>{eq.nombre_instrumento}</h4>
                                    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs ${darkMode ? 'text-white/50' : 'text-slate-500'}`}>
                                        <span>{eq.empresa}</span>
                                        <span className="font-mono">{eq.identificacion || eq.no_serie || 'S/N'}</span>
                                        {eq.area_laboratorio && <span className={`px-1.5 py-0.5 rounded text-[10px] ${darkMode ? 'bg-[#253916] text-[#C9EA63]' : 'bg-emerald-100 text-[#008a5e]'}`}>{eq.area_laboratorio}</span>}
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 flex-shrink-0">
                                    <div className={`px-3 py-1.5 rounded-xl text-xs font-black ${badgeColor}`}>
                                        {eq.slaRestante <= 0 ? `VENCIDO (${Math.abs(eq.slaRestante)}d)` : `${eq.slaRestante} DÍAS`}
                                    </div>
                                    <button onClick={e => { e.stopPropagation(); abrirDetalles(eq); }} className={`p-2 rounded-xl transition-all ${darkMode ? 'hover:bg-[#253916] text-[#C9EA63]' : 'hover:bg-slate-100 text-slate-500'}`}>
                                        <Eye size={18} />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Floating Action Button */}
            {seleccionados.length > 0 && (
                <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom">
                    <div className={`shadow-2xl rounded-2xl border p-3 flex items-center gap-3 ${darkMode ? 'bg-[#253916] border-[#C9EA63]/50' : 'bg-white border-emerald-500'}`}>
                        <span className={`text-sm font-black ${darkMode ? 'text-[#C9EA63]' : 'text-[#008a5e]'}`}>{seleccionados.length} seleccionado(s)</span>
                        <button onClick={finalizarSeleccionados} className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 ${darkMode ? 'bg-[#C9EA63] text-[#141f0b] hover:bg-[#b0d14b]' : 'bg-[#008a5e] text-white hover:bg-[#007b55]'}`}>
                            Enviar a Aseguramiento <ThumbsUp size={16} />
                        </button>
                    </div>
                </div>
            )}

            {/* Modal Confirmación */}
            {modalConf && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex justify-center items-center p-4 animate-in zoom-in-95">
                    <div className={`w-full max-w-lg rounded-3xl shadow-2xl p-6 md:p-8 border ${darkMode ? 'bg-[#141f0b] border-[#C9EA63]/30 text-[#F2F6F0]' : 'bg-white border-slate-200 text-slate-800'}`}>
                        <h2 className="text-2xl font-black mb-4 flex items-center gap-2"><ThumbsUp size={24}/> Finalizar Metrología</h2>
                        <p className={`text-sm mb-4 ${darkMode ? 'text-[#F2F6F0]/70' : 'text-gray-600'}`}>
                            Se enviarán <strong>{seleccionados.length}</strong> equipo(s) a Aseguramiento de Calidad.
                        </p>
                        <div className="mb-6 p-4 rounded-xl bg-blue-500/10 border border-blue-500/50">
                            <p className={`text-xs ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>
                                <strong>Nota:</strong> Si algún metrólogo aún no termina su parte en estos equipos, el sistema enviará tu parte de todos modos y notificará a los pendientes.
                            </p>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setModalConf(false)} className={`flex-1 py-3 font-bold rounded-xl ${darkMode ? 'bg-[#253916] text-white hover:bg-[#314a1c]' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Cancelar</button>
                            <button onClick={() => confirmarEnvio(true)} className={`flex-[2] flex justify-center items-center gap-2 font-black py-3 rounded-xl shadow-lg ${darkMode ? 'bg-[#C9EA63] text-[#141f0b] hover:bg-[#b0d14b]' : 'bg-[#008a5e] text-white hover:bg-[#007b55]'}`}>
                                ¡Enviar a Aseguramiento! <ThumbsUp size={18} />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Detalle */}
            {modalDetalle && equipoDetalle && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in">
                    <div className={`w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl shadow-2xl border ${darkMode ? 'bg-[#141f0b] border-[#C9EA63]/20' : 'bg-white border-slate-200'}`}>
                        <div className={`p-5 flex justify-between items-center border-b sticky top-0 ${darkMode ? 'bg-[#253916] border-[#C9EA63]/10' : 'bg-slate-50 border-slate-100'}`}>
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-xl ${darkMode ? 'bg-[#141f0b] text-[#C9EA63]' : 'bg-white text-emerald-600'}`}><Package size={20}/></div>
                                <div>
                                    <h2 className={`text-lg font-black ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>{equipoDetalle.nombre_instrumento}</h2>
                                    <p className={`text-[10px] font-bold uppercase ${darkMode ? 'text-[#C9EA63]/70' : 'text-emerald-600'}`}>{equipoDetalle.orden_cotizacion}</p>
                                </div>
                            </div>
                            <button onClick={() => setModalDetalle(false)} className={`p-2 rounded-xl ${darkMode ? 'hover:bg-[#141f0b] text-white/60' : 'hover:bg-slate-200 text-slate-400'}`}><X size={24}/></button>
                        </div>
                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-3">
                                <h4 className={`text-[10px] font-black uppercase tracking-widest opacity-50`}>Datos del Equipo</h4>
                                <InfoRow label="Empresa" value={equipoDetalle.empresa} darkMode={darkMode} />
                                <InfoRow label="Marca" value={equipoDetalle.marca} darkMode={darkMode} />
                                <InfoRow label="Modelo" value={equipoDetalle.modelo} darkMode={darkMode} />
                                <InfoRow label="Serie" value={equipoDetalle.no_serie} darkMode={darkMode} />
                                <InfoRow label="Identificación" value={equipoDetalle.identificacion} darkMode={darkMode} />
                                <InfoRow label="Área" value={equipoDetalle.area_laboratorio} darkMode={darkMode} />
                                <InfoRow label="Fecha Recepción" value={equipoDetalle.fecha_recepcion} darkMode={darkMode} />
                                <InfoRow label="Fecha Ingreso Sistema" value={new Date(equipoDetalle.fecha_ingreso).toLocaleDateString('es-MX')} darkMode={darkMode} />
                                <InfoRow label="SLA Base" value={`Desde: ${equipoDetalle.sla_fecha_base || equipoDetalle.fecha_recepcion_parsed || 'fecha_ingreso'}`} darkMode={darkMode} />
                            </div>
                            <div className="space-y-3">
                                <h4 className={`text-[10px] font-black uppercase tracking-widest opacity-50`}>Estado Actual</h4>
                                <InfoRow label="Mi Estatus" value={equipoDetalle.mi_estatus?.toUpperCase()} darkMode={darkMode} />
                                <InfoRow label="SLA Restante" value={`${equipoDetalle.slaRestante} días (Pasados: ${equipoDetalle.diasPasados})`} darkMode={darkMode} />
                                <InfoRow label="Rechazos" value={equipoDetalle.total_rechazos || 0} darkMode={darkMode} highlight={equipoDetalle.total_rechazos > 0} />
                                <div className={`mt-4 p-4 rounded-xl ${darkMode ? 'bg-[#253916]/50' : 'bg-slate-50'}`}>
                                    <h5 className={`text-xs font-bold mb-2`}>SLA Detal</h5>
                                    <div className={`text-xs ${darkMode ? 'text-white/60' : 'text-slate-500'}`}>
                                        <p>Fecha recepción PDF: <strong>{equipoDetalle.fecha_recepcion || 'N/A'}</strong></p>
                                        <p>Fecha parseada: <strong>{equipoDetalle.fecha_recepcion_parsed || 'No disponible'}</strong></p>
                                        <p>Días transcurridos: <strong>{equipoDetalle.diasPasados}</strong></p>
                                        <p>SLA total: <strong>{equipoDetalle.sla} días</strong></p>
                                        <p>Restante: <strong className={equipoDetalle.slaRestante <= 1 ? 'text-rose-500' : 'text-emerald-500'}>{equipoDetalle.slaRestante} días</strong></p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const InfoRow = ({ label, value, darkMode, highlight }) => (
    <div className="flex justify-between items-start text-sm">
        <span className={`font-bold ${darkMode ? 'text-white/60' : 'text-slate-500'}`}>{label}:</span>
        <span className={`font-medium ${highlight ? 'text-rose-500 font-bold' : (darkMode ? 'text-[#F2F6F0]' : 'text-slate-800')}`}>{value || 'N/A'}</span>
    </div>
);

export default MiBandeja;
