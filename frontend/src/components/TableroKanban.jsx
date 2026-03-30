import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Package, Clock, FileCheck, CheckCircle, Truck, AlertTriangle } from 'lucide-react';

const columnasEstatus = [
    { id: 'Recepción', icono: Package, color: 'text-indigo-500', bg: 'bg-indigo-500/10', border: 'border-indigo-500' },
    { id: 'Laboratorio', icono: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500' },
    { id: 'Certificación', icono: FileCheck, color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500' },
    { id: 'Listo', icono: CheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500' },
    { id: 'Entregado', icono: Truck, color: 'text-gray-500', bg: 'bg-gray-500/10', border: 'border-gray-500' }
];

const TableroKanban = ({ darkMode }) => {
    const [equipos, setEquipos] = useState([]);
    const [cargando, setCargando] = useState(true);

    const fetchEquipos = async () => {
        try {
            const res = await axios.get('http://localhost:3001/api/instrumentos');
            setEquipos(res.data);
            setCargando(false);
        } catch (error) {
            console.error("Error al obtener equipos", error);
            setCargando(false);
        }
    };

    useEffect(() => {
        fetchEquipos();
    }, []);

    const onDragStart = (e, equipo) => {
        e.dataTransfer.setData('equipoId', equipo.id);
        // Visual tweak para que el drag ghost se vea mejor
        e.dataTransfer.effectAllowed = "move";
    };

    const onDrop = async (e, estatusDestino) => {
        e.preventDefault();
        const equipoId = e.dataTransfer.getData('equipoId');
        if (!equipoId) return;

        // Actualizamos estado optimista
        const equiposActualizados = equipos.map(eq => {
            if (eq.id.toString() === equipoId) {
                return { ...eq, estatus_actual: estatusDestino };
            }
            return eq;
        });
        setEquipos(equiposActualizados);

        // Llamada API
        try {
            await axios.put(`http://localhost:3001/api/instrumentos/${equipoId}/estatus`, { estatus: estatusDestino });
        } catch (error) {
            console.error("Error al mover equipo", error);
            fetchEquipos(); // Revertir en caso de error
        }
    };

    const onDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };

    const textTitle = darkMode ? 'text-[#C9EA63]' : 'text-[#253916]';
    const textBody = darkMode ? 'text-[#F2F6F0]/70' : 'text-[#253916]/70';

    const getOsaColor = (osStr, isDark) => {
        if (!osStr) return isDark ? '#2a401c' : '#ffffff';
        let hash = 0;
        for (let i = 0; i < osStr.length; i++) {
            hash = osStr.charCodeAt(i) + ((hash << 5) - hash);
        }
        const hue = Math.abs(hash) % 360;
        return isDark ? `hsl(${hue}, 40%, 20%)` : `hsl(${hue}, 70%, 95%)`;
    };

    if (cargando) return <div className="p-8 text-center">Cargando tablero...</div>;

    return (
        <div className="w-full h-[calc(100vh-6rem)] flex flex-col">
            <header className="mb-6 flex justify-between items-end shrink-0">
                <div>
                    <h1 className={`text-3xl font-black ${textTitle}`}>Pipeline de Calibración</h1>
                    <p className={`text-sm font-medium ${textBody}`}>Arrastra las tarjetas para cambiar el estado operativo en tiempo real.</p>
                </div>
            </header>

            <div className={`flex-1 min-h-0 flex overflow-x-auto overflow-y-hidden snap-x snap-mandatory gap-3 lg:gap-4 pb-2 h-full custom-scrollbar`}>
                {columnasEstatus.map(columna => {
                    const equiposColumna = equipos.filter(e => e.estatus_actual === columna.id || 
                        (columna.id === 'Certificación' && e.estatus_actual === 'Certificación o Papelería')); // Fallback si el nombre estatus es ligeramente diferente
                    
                    return (
                        <div 
                            key={columna.id}
                            className={`flex flex-col shrink-0 w-[85vw] md:w-[320px] lg:w-0 lg:flex-1 min-w-0 min-h-0 h-full rounded-2xl border transition-colors snap-center ${darkMode ? 'border-[#C9EA63]/20 bg-[#1b2b10]/40' : 'border-slate-200 bg-slate-50/50'}`}
                            onDrop={(e) => onDrop(e, columna.id)}
                            onDragOver={onDragOver}
                        >
                            {/* Cabecera Columna */}
                            <div className={`p-4 border-b flex items-center justify-between ${darkMode ? 'border-[#C9EA63]/10' : 'border-slate-200'} ${columna.bg} rounded-t-2xl`}>
                                <div className={`flex items-center gap-2 font-bold ${columna.color}`}>
                                    <columna.icono size={18} />
                                    <h3>{columna.id}</h3>
                                </div>
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${darkMode ? 'bg-[#141f0b] text-[#F2F6F0]' : 'bg-white text-slate-800'}`}>
                                    {equiposColumna.length}
                                </span>
                            </div>

                            {/* Tarjetas */}
                            <div className="flex-1 min-h-0 p-3 overflow-y-auto space-y-3">
                                {equiposColumna.map(equipo => (
                                    <div 
                                        key={equipo.id}
                                        draggable
                                        onDragStart={(e) => onDragStart(e, equipo)}
                                        style={{ backgroundColor: getOsaColor(equipo.orden_cotizacion, darkMode) }}
                                        className={`p-4 rounded-xl shadow-sm border cursor-grab active:cursor-grabbing hover:shadow-md transition-all relative overflow-hidden group ${darkMode ? 'border-[#C9EA63]/20 hover:brightness-125' : 'border-slate-200 hover:brightness-95'}`}
                                    >
                                        <div className={`absolute top-0 left-0 w-1 rounded-l-xl h-full ${columna.bg.split('/')[0]}`} />
                                        <div className="flex justify-between items-start mb-2">
                                            <span className={`text-xs font-bold truncate ${columna.color}`}>{equipo.orden_cotizacion}</span>
                                            {equipo.sla <= 2 && (
                                                <AlertTriangle size={14} className="text-rose-500 animate-pulse" title="Urgente - SLA Crítico" />
                                            )}
                                        </div>
                                        <h4 className={`text-sm font-bold mb-1 truncate ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>{equipo.nombre_instrumento}</h4>
                                        <p className={`text-[10px] truncate ${darkMode ? 'text-[#F2F6F0]/60' : 'text-slate-500'}`}>{equipo.empresa || equipo.persona}</p>
                                        
                                        <div className={`mt-3 pt-3 border-t flex justify-between items-center ${darkMode ? 'border-[#C9EA63]/10' : 'border-slate-100'}`}>
                                            <div className="text-[10px] font-medium opacity-60">SLA: {equipo.sla} días</div>
                                            <div className="text-[10px] font-medium opacity-70 border px-2 py-0.5 rounded-md">{equipo.identificacion || equipo.no_serie || 'N/A'}</div>
                                        </div>
                                    </div>
                                ))}
                                {equiposColumna.length === 0 && (
                                    <div className={`text-center p-4 text-xs italic opacity-50 ${textBody}`}>
                                        Arrastra equipos aquí
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default TableroKanban;
