import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { MessageCircle, Clock, CheckCircle, AlertTriangle, Users, Bot, Zap, Calendar, ArrowRight, Activity } from 'lucide-react';

const Dashboard = ({ darkMode }) => {
  const [stats, setStats] = useState({ 
      enCalibracion: 0, proximosSLA: 0, chartData: [], kpis: {}, heatmap: []
  });
  const [horarioInfo, setHorarioInfo] = useState({ estado: 'Activo', msg: '' });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [resStats, resKpis, resHeatmap] = await Promise.all([
          axios.get('http://localhost:3001/api/stats'),
          axios.get('http://localhost:3001/api/kpis_negocio'),
          axios.get('http://localhost:3001/api/heatmap')
        ]);
        setStats({
          ...resStats.data,
          kpis: resKpis.data,
          heatmap: resHeatmap.data
        });
      } catch (err) {
        console.error('Error obteniendo stats:', err);
      }
    };
    fetchStats();
    
    window.addEventListener('crm:refresh', fetchStats);
    
    const interval = setInterval(() => {
      determinarHorario();
    }, 60000);
    determinarHorario();
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('crm:refresh', fetchStats);
    };
  }, []);

  const determinarHorario = () => {
    const ahora = new Date();
    const dia = ahora.getDay(); 
    const minDeldia = ahora.getHours() * 60 + ahora.getMinutes();

    if (dia === 0 || dia === 6 || ahora.getHours() < 8 || ahora.getHours() >= 18) {
        setHorarioInfo({estado: 'Fuera de Horario', msg: 'Bot en modo automático (fuera de atención humana)'});
        return;
    }
    // Lunes 14:00 - 15:00
    if (dia === 1 && minDeldia >= 840 && minDeldia < 900) {
        setHorarioInfo({estado: 'Modo Descanso', msg: 'Modo descanso activo: respuestas automatizadas'});
        return;
    }
    // Martes-Viernes 13:30 - 14:30
    if (dia >= 2 && dia <= 5 && minDeldia >= 810 && minDeldia < 870) {
        setHorarioInfo({estado: 'Modo Descanso', msg: 'Modo descanso activo: respuestas automatizadas'});
        return;
    }
    setHorarioInfo({estado: 'Activo', msg: 'Atención Humana Activa'});
  };

  const getIntensity = (diaStr, horaObj) => {
    // Normalizar día
    const dicDia = {'Lunes': 'Monday', 'Martes': 'Tuesday', 'Miércoles': 'Wednesday', 'Jueves': 'Thursday', 'Viernes': 'Friday'};
    const match = stats.heatmap.find(h => h.dia === dicDia[diaStr] && h.hora === horaObj);
    const count = match ? match.cantidad : 0;
    
    if (count > 10) return darkMode ? 'bg-rose-500' : 'bg-rose-500';
    if (count > 5) return darkMode ? 'bg-amber-500' : 'bg-amber-400';
    if (count > 0) return darkMode ? 'bg-emerald-500/50' : 'bg-emerald-300';
    return darkMode ? 'bg-[#1b2b10]' : 'bg-slate-100';
  };

  const boxBg = darkMode ? 'bg-[#2a401c] border-[#C9EA63]/20' : 'bg-white border-gray-100 shadow-sm';
  const textTitle = darkMode ? 'text-[#C9EA63]' : 'text-[#253916]';
  const textBody = darkMode ? 'text-[#F2F6F0]/70' : 'text-[#253916]/60';
  const textValue = darkMode ? 'text-[#F2F6F0]' : 'text-[#253916]';

  return (
    <div className="w-full space-y-6">
      
      {/* Banner Horario Inteligente */}
      {horarioInfo.estado !== 'Activo' && (
      <div className={`w-full p-4 rounded-xl flex items-center justify-center gap-3 font-bold text-sm shadow-sm ${horarioInfo.estado === 'Modo Descanso' ? (darkMode ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-amber-100 text-amber-800') : (darkMode ? 'bg-indigo-900/40 text-indigo-300 border border-indigo-500/30' : 'bg-indigo-100 text-indigo-800')}`}>
          <Bot size={20} className="animate-pulse" />
          {horarioInfo.msg}
      </div>
      )}

      {/* 1. ATENCIÓN INMEDIATA (Fila Superior) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Clientes Esperando */}
        <div onClick={() => window.location.href='/conversaciones'} className={`p-4 rounded-2xl border-l-4 cursor-pointer transition-transform hover:-translate-y-1 hover:shadow-lg border-rose-500 ${boxBg}`}>
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-black tracking-widest uppercase text-rose-500">🔴 Esperando Respuesta</p>
                <div className="flex items-end gap-2 mt-1">
                    <h2 className={`text-3xl font-black ${textValue}`}>{stats.kpis.clientes_esperando || 0}</h2>
                    <span className="text-xs font-medium text-rose-500 mb-1">chats</span>
                </div>
              </div>
              <MessageCircle size={24} className="text-rose-500/50" />
            </div>
        </div>

        {/* Nuevos Leads */}
        <div onClick={() => window.location.href='/leads'} className={`p-4 rounded-2xl border-l-4 cursor-pointer transition-transform hover:-translate-y-1 hover:shadow-lg border-amber-500 ${boxBg}`}>
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-black tracking-widest uppercase text-amber-500">🟡 Nuevos Prospectos</p>
                <div className="flex items-end gap-2 mt-1">
                    <h2 className={`text-3xl font-black ${textValue}`}>{stats.kpis.nuevos_leads || 0}</h2>
                    <span className="text-xs font-medium text-amber-500 mb-1">leads</span>
                </div>
              </div>
              <Users size={24} className="text-amber-500/50" />
            </div>
        </div>

        {/* Detenidos Laboratorio */}
        <div onClick={() => window.location.href='/kanban'} className={`p-4 rounded-2xl border-l-4 cursor-pointer transition-transform hover:-translate-y-1 hover:shadow-lg border-emerald-500 ${boxBg}`}>
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-black tracking-widest uppercase text-emerald-500">🔵 Detenidos en Lab</p>
                <div className="flex items-end gap-2 mt-1">
                    <h2 className={`text-3xl font-black ${textValue}`}>{stats.kpis.detenidos_laboratorio || 0}</h2>
                    <span className="text-xs font-medium text-emerald-500 mb-1">equipos &gt; 2 días</span>
                </div>
              </div>
              <Clock size={24} className="text-emerald-500/50" />
            </div>
        </div>

        {/* Listos para entregar */}
        <div onClick={() => window.location.href='/kanban'} className={`p-4 rounded-2xl border-l-4 cursor-pointer transition-transform hover:-translate-y-1 hover:shadow-lg border-emerald-500 ${boxBg}`}>
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-black tracking-widest uppercase text-emerald-500">🟢 Listos Sin Notificar</p>
                <div className="flex items-end gap-2 mt-1">
                    <h2 className={`text-3xl font-black ${textValue}`}>{stats.kpis.listos_sin_notificar || 0}</h2>
                    <span className="text-xs font-medium text-emerald-500 mb-1">equipos listos</span>
                </div>
              </div>
              <CheckCircle size={24} className="text-emerald-500/50" />
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* ALERTS E IA INSIGHTS */}
        <div className={`p-6 rounded-2xl border flex flex-col gap-4 ${boxBg}`}>
            <h3 className={`text-lg font-black flex items-center gap-2 ${textValue}`}>
                <Zap className="text-amber-500"/> IA Insights & Alertas
            </h3>
            <div className="flex-1 space-y-3">
                {stats.kpis.clientes_esperando > 4 && (
                <div className={`p-3 rounded-lg text-sm font-medium flex items-start gap-2 ${darkMode ? 'bg-rose-900/30 text-rose-300' : 'bg-rose-50 text-rose-700'}`}>
                    <AlertTriangle size={16} className="mt-0.5" />
                    <p>Atención: Hay congestión de mensajes. Sugiero activar respuestas automatizadas de retardo.</p>
                </div>
                )}
                {stats.kpis.cotizaciones_bot_pendientes > 0 && (
                <div 
                  onClick={() => window.location.href='/flujos-whatsapp'}
                  className={`p-3 rounded-lg text-sm font-bold flex items-start gap-2 shadow-sm cursor-pointer transition-all hover:scale-[1.02] ${darkMode ? 'bg-amber-900/30 text-amber-300 border border-amber-500/20' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}
                >
                    <Bot size={16} className="mt-0.5 animate-bounce" />
                    <p>Tienes {stats.kpis.cotizaciones_bot_pendientes} cotizaciones de WhatsApp pendientes por atender.</p>
                </div>
                )}
                {stats.kpis.escalados_bot_pendientes > 0 && (
                <div 
                  onClick={() => window.location.href='/conversaciones'}
                  className={`p-3 rounded-lg text-sm font-bold flex items-start gap-2 shadow-sm cursor-pointer transition-all hover:scale-[1.02] ${darkMode ? 'bg-rose-900/30 text-rose-300 border border-rose-500/20' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}
                >
                    <Users size={16} className="mt-0.5 animate-pulse" />
                    <p>Hay {stats.kpis.escalados_bot_pendientes} clientes esperando ser atendidos por un humano.</p>
                </div>
                )}
                <div className={`p-3 rounded-lg text-sm flex items-start gap-2 ${darkMode ? 'bg-indigo-900/30 text-indigo-300' : 'bg-indigo-50 text-indigo-700'}`}>
                    <Activity size={16} className="mt-0.5" />
                    <p>El ritmo de liberación de equipos hoy es un 15% mayor al promedio semanal.</p>
                </div>
                <div className={`p-3 rounded-lg text-sm flex items-start gap-2 ${darkMode ? 'bg-[#1b2b10] text-[#C9EA63]' : 'bg-emerald-50 text-emerald-700'}`}>
                    <Clock size={16} className="mt-0.5" />
                    <p>Tu tiempo promedio de respuesta actual es óptimo ({stats.kpis.tiempo_promedio_min} min). ¡Gran trabajo!</p>
                </div>
            </div>
        </div>

        {/* PIPELINE BARS (Kpis visuales) */}
        <div className={`p-6 rounded-2xl border flex flex-col lg:col-span-2 ${boxBg}`}>
            <div className="flex justify-between items-end mb-6">
                <div>
                    <h3 className={`text-lg font-black ${textValue}`}>Pipeline Operativo</h3>
                    <p className={`text-xs ${textBody}`}>Volumen de equipos por fase</p>
                </div>
                <button onClick={() => window.location.href='/kanban'} className={`text-xs font-bold px-3 py-1 flex items-center gap-1 transition-colors rounded-full ${darkMode ? 'bg-[#1b2b10] text-[#F2F6F0] hover:bg-[#C9EA63] hover:text-[#141f0b]' : 'bg-slate-100 text-slate-700 hover:bg-emerald-500 hover:text-white'}`}>
                    Ver Tablero Kanban <ArrowRight size={12}/>
                </button>
            </div>
            
            <div className="space-y-5 flex-1 mt-2">
                {[
                    {label: 'Recepción', count: stats.kpis.pipeline?.recepcion || 0, max: 50, color: 'bg-indigo-500'},
                    {label: 'Laboratorio', count: stats.kpis.pipeline?.laboratorio || 0, max: 50, color: 'bg-amber-500'},
                    {label: 'Certificación / Papelería', count: stats.kpis.pipeline?.certificacion || 0, max: 50, color: 'bg-emerald-500'},
                    {label: 'Listo / En Almacén', count: stats.kpis.pipeline?.listo || 0, max: 50, color: 'bg-emerald-500'}
                ].map((fase) => (
                    <div key={fase.label}>
                        <div className="flex justify-between text-xs font-bold mb-1">
                            <span className={textValue}>{fase.label}</span>
                            <span className={textBody}>{fase.count} uds.</span>
                        </div>
                        <div className={`w-full h-3 rounded-full overflow-hidden ${darkMode ? 'bg-[#141f0b]' : 'bg-slate-100'}`}>
                            <div className={`h-full ${fase.color} rounded-full transition-all duration-1000`} style={{width: `${(fase.count/fase.max)*100}%`}}></div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
      </div>

      {/* HEATMAP DE MENSAJES Y GRÁFICO HISTÓRICO */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Heat Map de Días vs Horas */}
        <div className={`p-6 rounded-2xl border overflow-x-auto ${boxBg}`}>
            <h3 className={`text-lg font-black mb-1 ${textValue}`}>Mapa de Calor de Mensajes</h3>
            <p className={`text-xs mb-6 ${textBody}`}>Días vs Horas de Operación (identifica saturación)</p>
            
            <div className="min-w-[500px]">
                <div className="flex gap-2 mb-2">
                    <div className="w-16"></div> {/* Espaciador */}
                    {[8,9,10,11,12,13,14,15,16,17].map(h => (
                        <div key={h} className={`flex-1 text-center text-[10px] font-bold ${textBody}`}>{h}:00</div>
                    ))}
                </div>
                {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'].map(dia => (
                    <div key={dia} className="flex gap-2 items-center mb-2">
                        <div className={`w-16 text-xs font-bold ${textValue}`}>{dia}</div>
                        {[8,9,10,11,12,13,14,15,16,17].map(h => (
                            <div 
                                key={`${dia}-${h}`} 
                                className={`flex-1 h-8 rounded-md transition-all hover:scale-110 cursor-pointer ${getIntensity(dia, h)}`}
                                title={`${dia} a las ${h}:00`}
                            ></div>
                        ))}
                    </div>
                ))}
                
                {/* Leyenda Heatmap */}
                <div className="flex justify-end gap-3 mt-4">
                    <div className="flex items-center gap-1 text-[10px]"><div className={`w-3 h-3 rounded-full ${darkMode ? 'bg-[#1b2b10]' : 'bg-slate-100'}`}></div> Bajo</div>
                    <div className="flex items-center gap-1 text-[10px]"><div className={`w-3 h-3 rounded-full ${darkMode ? 'bg-amber-500' : 'bg-amber-400'}`}></div> Medio</div>
                    <div className="flex items-center gap-1 text-[10px]"><div className={`w-3 h-3 rounded-full bg-rose-500`}></div> Alto</div>
                </div>
            </div>
        </div>

        {/* Gráfico 7-day trend optimizado */}
        <div className={`p-6 rounded-2xl border ${boxBg}`}>
            <h3 className={`text-lg font-black mb-1 ${textValue}`}>Tendencia de Operación (7 días)</h3>
            <p className={`text-xs mb-6 ${textBody}`}>Equipos recibidos y entregados</p>
            <div className="h-64 w-full mt-4">
                <ResponsiveContainer width="100%" height={250}>
                    <AreaChart data={stats.chartData} margin={{ top: 5, right: 0, bottom: 0, left: -20 }}>
                        <defs>
                            <linearGradient id="colorIngresos" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="colorEntregas" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={darkMode ? 'rgba(201, 234, 99, 0.1)' : '#e2e8f0'} />
                        <XAxis dataKey="name" tick={{fill: darkMode ? '#F2F6F0' : '#64748b', fontSize: 10}} axisLine={false} tickLine={false} />
                        <YAxis tick={{fill: darkMode ? '#F2F6F0' : '#64748b', fontSize: 10}} axisLine={false} tickLine={false} />
                        <RechartsTooltip 
                            contentStyle={{ backgroundColor: darkMode ? '#141f0b' : '#fff', borderRadius: '12px', border: 'none' }}
                            itemStyle={{ color: darkMode ? '#F2F6F0' : '#333', fontSize: '12px' }}
                        />
                        <Area type="monotone" dataKey="ingresos" stroke="#10b981" fillOpacity={1} fill="url(#colorIngresos)" />
                        <Area type="monotone" dataKey="entregados" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorEntregas)" />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>

      </div>
    </div>
  );
};

export default Dashboard;