import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { AlertTriangle, Eye, X, MessageSquare, Package, ThumbsUp } from 'lucide-react';
import { toast } from 'react-toastify';

const CorreccionesMetrologia = ({ darkMode, usuario }) => {
    const [equipos, setEquipos] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [modalDetalle, setModalDetalle] = useState(false);
    const [equipoDetalle, setEquipoDetalle] = useState(null);
    const [rechazosDetalle, setRechazosDetalle] = useState([]);

    const fetchData = async () => {
        try {
            setCargando(true);
            const res = await axios.get('/api/metrologia/correcciones');
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

    const abrirDetalle = async (eq) => {
        setEquipoDetalle(eq);
        setModalDetalle(true);
        try {
            const res = await axios.get(`/api/instrumentos/${eq.id}/rechazos`);
            setRechazosDetalle(res.data);
        } catch (err) { console.error(err); }
    };

    const finalizarCorreccion = async (id) => {
        try {
            await axios.post(`/api/instrumentos/${id}/finalizar_metrologo`, { enviar_a_aseguramiento: true });
            toast.success('Corrección finalizada. Enviado a Aseguramiento.');
            setModalDetalle(false);
            fetchData();
        } catch (err) {
            toast.error('Error al finalizar corrección');
        }
    };

    return (
        <div className="w-full animate-in fade-in">
            {/* Header */}
            <div className={`flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-6 mb-6 ${darkMode ? 'border-[#C9EA63]/20' : 'border-[#008a5e]/20'}`}>
                <div>
                    <h2 className={`text-2xl md:text-3xl font-bold flex items-center gap-3 ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>
                        <AlertTriangle className="text-orange-500" size={32} />
                        Correcciones Pendientes
                    </h2>
                    <p className={`mt-1 md:mt-2 text-xs md:text-sm ${darkMode ? 'text-[#F2F6F0]/70' : 'text-gray-500'}`}>
                        Equipos que Aseguramiento rechazó y requieren correcciones. Revisa los motivos y trabaja las correcciones.
                    </p>
                </div>
                <div className={`px-4 py-2 rounded-xl text-sm font-black ${darkMode ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'bg-orange-50 text-orange-700 border border-orange-200'}`}>
                    {equipos.length} equipo(s) con corrección
                </div>
            </div>

            {/* Listado */}
            {cargando ? (
                <div className={`p-12 text-center ${darkMode ? 'text-[#F2F6F0]/40' : 'text-slate-400'}`}>
                    <div className="inline-block w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : equipos.length === 0 ? (
                <div className={`p-12 text-center rounded-2xl border ${darkMode ? 'bg-[#1b2b10] border-[#C9EA63]/10 text-[#F2F6F0]/40' : 'bg-white border-slate-200 text-slate-400'}`}>
                    <AlertTriangle size={48} className="mx-auto mb-4 opacity-30" />
                    <p className="font-bold">No hay correcciones pendientes</p>
                    <p className="text-xs mt-1 opacity-60">¡Buen trabajo! No hay equipos rechazados.</p>
                </div>
            ) : (
                <div className={`border rounded-2xl overflow-hidden divide-y ${darkMode ? 'border-[#C9EA63]/20 divide-[#C9EA63]/5' : 'border-slate-200 divide-slate-100'}`}>
                    {equipos.map(eq => (
                        <div key={eq.id} onClick={() => abrirDetalle(eq)} className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 cursor-pointer transition-colors ${darkMode ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`}>
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`text-[10px] font-black ${darkMode ? 'text-white/30' : 'text-slate-400'}`}>{eq.orden_cotizacion}</span>
                                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-rose-500 text-white flex items-center gap-1">
                                            <AlertTriangle size={10}/> RECHAZO #{eq.rechazos_aseguramiento || eq.total_rechazos || 1}
                                        </span>
                                    </div>
                                    <h4 className={`font-black text-base mt-1 truncate ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>{eq.nombre_instrumento}</h4>
                                    <p className={`text-xs ${darkMode ? 'text-white/50' : 'text-slate-500'}`}>{eq.empresa}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className={`px-3 py-2 rounded-xl text-xs max-w-xs ${darkMode ? 'bg-orange-500/10 text-orange-300 border border-orange-500/20' : 'bg-orange-50 text-orange-700 border border-orange-100'}`}>
                                    <p className="font-bold mb-0.5">Motivo:</p>
                                    <p className="line-clamp-2 italic">{eq.ultimo_motivo || 'Sin motivo registrado'}</p>
                                </div>
                                <button className={`p-2 rounded-xl transition-all ${darkMode ? 'hover:bg-[#253916] text-[#C9EA63]' : 'hover:bg-slate-100 text-slate-500'}`}>
                                    <Eye size={18} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal Detalle con Historial de Rechazos */}
            {modalDetalle && equipoDetalle && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in">
                    <div className={`w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl shadow-2xl border ${darkMode ? 'bg-[#141f0b] border-[#C9EA63]/20' : 'bg-white border-slate-200'}`}>
                        <div className={`p-5 flex justify-between items-center border-b ${darkMode ? 'bg-[#253916] border-[#C9EA63]/10' : 'bg-slate-50 border-slate-100'}`}>
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-xl bg-orange-500/20 text-orange-400`}><AlertTriangle size={20}/></div>
                                <div>
                                    <h2 className={`text-lg font-black ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>Corrección - {equipoDetalle.nombre_instrumento}</h2>
                                    <p className={`text-[10px] font-bold uppercase ${darkMode ? 'text-[#C9EA63]/70' : 'text-emerald-600'}`}>{equipoDetalle.orden_cotizacion} | Rechazos: {equipoDetalle.rechazos_aseguramiento || equipoDetalle.total_rechazos || 1}</p>
                                </div>
                            </div>
                            <button onClick={() => setModalDetalle(false)} className={`p-2 rounded-xl ${darkMode ? 'hover:bg-[#141f0b] text-white/60' : 'hover:bg-slate-200 text-slate-400'}`}><X size={24}/></button>
                        </div>

                        {/* Motivo actual */}
                        <div className={`m-5 p-4 rounded-xl border ${darkMode ? 'bg-orange-500/10 border-orange-500/30' : 'bg-orange-50 border-orange-200'}`}>
                            <h4 className={`text-sm font-bold flex items-center gap-2 mb-2 ${darkMode ? 'text-orange-300' : 'text-orange-700'}`}>
                                <MessageSquare size={16}/> Motivo del último rechazo
                            </h4>
                            <p className={`text-sm ${darkMode ? 'text-orange-200' : 'text-orange-800'}`}>{equipoDetalle.ultimo_motivo || 'Sin motivo registrado'}</p>
                            {equipoDetalle.fecha_rechazo && (
                                <p className={`text-xs mt-2 ${darkMode ? 'text-orange-400/60' : 'text-orange-600/60'}`}>Fecha: {new Date(equipoDetalle.fecha_rechazo).toLocaleString('es-MX')}</p>
                            )}
                        </div>

                        {/* Historial de rechazos */}
                        {rechazosDetalle.length > 0 && (
                            <div className="px-5 pb-5">
                                <h4 className={`text-sm font-bold mb-3 ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>📋 Historial Completo de Rechazos</h4>
                                <div className="space-y-2">
                                    {rechazosDetalle.map((r, i) => (
                                        <div key={r.id} className={`p-3 rounded-xl border ${darkMode ? 'bg-[#1b2b10] border-[#C9EA63]/10' : 'bg-slate-50 border-slate-200'}`}>
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <span className={`text-[10px] font-black uppercase ${darkMode ? 'text-rose-400' : 'text-rose-600'}`}>Rechazo #{rechazosDetalle.length - i}</span>
                                                    <p className={`text-xs mt-1 ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>{r.motivo}</p>
                                                    <p className={`text-[10px] mt-1 ${darkMode ? 'text-white/40' : 'text-slate-400'}`}>
                                                        Por: {r.rechaza_nombre || 'N/A'} {r.destino_nombre ? `→ Para: ${r.destino_nombre}` : ''}
                                                    </p>
                                                </div>
                                                <span className={`text-[10px] ${darkMode ? 'text-white/30' : 'text-slate-400'}`}>{new Date(r.fecha_rechazo).toLocaleString('es-MX')}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Acciones */}
                        <div className={`p-5 border-t flex gap-3 ${darkMode ? 'border-[#C9EA63]/10' : 'border-slate-100'}`}>
                            <button onClick={() => setModalDetalle(false)} className={`flex-1 py-3 font-bold rounded-xl ${darkMode ? 'bg-[#253916] text-white hover:bg-[#314a1c]' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Cerrar</button>
                            <button onClick={() => finalizarCorreccion(equipoDetalle.id)} className={`flex-[2] flex justify-center items-center gap-2 font-black py-3 rounded-xl shadow-lg ${darkMode ? 'bg-[#C9EA63] text-[#141f0b] hover:bg-[#b0d14b]' : 'bg-[#008a5e] text-white hover:bg-[#007b55]'}`}>
                                ¡Corrección Terminada! <ThumbsUp size={18} />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CorreccionesMetrologia;
