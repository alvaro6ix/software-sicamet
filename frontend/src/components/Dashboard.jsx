import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { MessageCircle, Clock, CheckCircle, AlertTriangle, Users, Bot, Zap, Calendar, ArrowRight, Activity, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Dashboard = ({ darkMode }) => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ 
      enCalibracion: 0, proximosSLA: 0, chartData: [], kpis: {}, heatmap: []
  });
  const [horarioInfo, setHorarioInfo] = useState({ estado: 'Activo', msg: '' });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [resStats, resKpis, resHeatmap] = await Promise.all([
          axios.get('/api/stats'),
          axios.get('/api/kpis_negocio'),
          axios.get('/api/heatmap')
        ]);
        setStats({
          ...(resStats?.data || {}),
          kpis: resKpis?.data || {},
          heatmap: Array.isArray(resHeatmap?.data) ? resHeatmap.data : []
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
    const match = Array.isArray(stats.heatmap) ? stats.heatmap.find(h => h.dia === dicDia[diaStr] && h.hora === horaObj) : null;
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
      <div className={`w-full p-4 rounded-xl flex items-center justify-center gap-3 font-bold text-sm shadow-sm ${horarioInfo.estado === 'Modo Descanso' ? (darkMode ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-amber-100 text-amber-800') : (darkMode ? 'bg-emerald-900/40 text-emerald-300 border border-emerald-500/30' : 'bg-emerald-100 text-emerald-800')}`}>
          <Bot size={20} className="animate-pulse" />
          {horarioInfo.msg}
      </div>
      )}

      {/* 1. ATENCIÓN INMEDIATA (Fila Superior) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Clientes Esperando */}
        <div onClick={() => navigate('/conversaciones')} className={`p-4 rounded-2xl border-l-4 cursor-pointer transition-transform hover:-translate-y-1 hover:shadow-lg border-rose-500 ${boxBg}`}>
            <div className="flex justify-between items-start">
              <div>
                <div className="text-[10px] font-black tracking-widest uppercase text-rose-500 flex items-center gap-1">
                  <MessageCircle size={10} />
                  <span>Esperando Respuesta</span>
                </div>
                <div className="flex items-end gap-2 mt-1">
                    <h2 className={`text-3xl font-black ${textValue}`}>{stats?.kpis?.clientes_esperando ?? 0}</h2>
                    <span className="text-xs font-medium text-rose-500 mb-1">chats</span>
                </div>
              </div>
              <MessageCircle size={24} className="text-rose-500/50" />
            </div>
        </div>

        {/* Nuevos Leads / Cotizaciones */}
        <div onClick={() => navigate('/flujos-whatsapp')} className={`p-4 rounded-2xl border-l-4 cursor-pointer transition-transform hover:-translate-y-1 hover:shadow-lg border-amber-500 ${boxBg}`}>
            <div className="flex justify-between items-start">
              <div>
                <div className="text-[10px] font-black tracking-widest uppercase text-amber-500 flex items-center gap-1"><FileText size={10} /> Cotizaciones por Atender</div>
                <div className="flex items-end gap-2 mt-1">
                    <h2 className={`text-3xl font-black ${textValue}`}>{stats.kpis.nuevos_leads || 0}</h2>
                    <span className="text-xs font-medium text-amber-500 mb-1">leads</span>
                </div>
              </div>
              <FileText size={24} className="text-amber-500/50" />
            </div>
        </div>

        {/* Detenidos Laboratorio */}
        <div onClick={() => navigate('/kanban')} className={`p-4 rounded-2xl border-l-4 cursor-pointer transition-transform hover:-translate-y-1 hover:shadow-lg ${darkMode ? 'border-[#C9EA63]' : 'border-[#008a5e]'} ${boxBg}`}>
            <div className="flex justify-between items-start">
              <div>
                <div className={`text-[10px] font-black tracking-widest uppercase flex items-center gap-1 ${darkMode ? 'text-[#C9EA63]' : 'text-[#008a5e]'}`}><Clock size={10} /> Detenidos en Lab</div>
                <div className="flex items-end gap-2 mt-1">
                    <h2 className={`text-3xl font-black ${textValue}`}>{stats.kpis.detenidos_laboratorio || 0}</h2>
                    <span className={`text-xs font-medium mb-1 ${darkMode ? 'text-[#C9EA63]' : 'text-[#008a5e]'}`}>equipos &gt; 2 días</span>
                </div>
              </div>
              <Clock size={24} className={`${darkMode ? 'text-[#C9EA63]/50' : 'text-[#008a5e]/50'}`} />
            </div>
        </div>

        {/* Listos para entregar */}
        <div onClick={() => navigate('/kanban')} className={`p-4 rounded-2xl border-l-4 cursor-pointer transition-transform hover:-translate-y-1 hover:shadow-lg ${darkMode ? 'border-[#C9EA63]' : 'border-[#008a5e]'} ${boxBg}`}>
            <div className="flex justify-between items-start">
              <div>
                <div className={`text-[10px] font-black tracking-widest uppercase flex items-center gap-1 ${darkMode ? 'text-[#C9EA63]' : 'text-[#008a5e]'}`}><CheckCircle size={10} /> Listos Sin Notificar</div>
                <div className="flex items-end gap-2 mt-1">
                    <h2 className={`text-3xl font-black ${textValue}`}>{stats.kpis.listos_sin_notificar || 0}</h2>
                    <span className={`text-xs font-medium mb-1 ${darkMode ? 'text-[#C9EA63]' : 'text-[#008a5e]'}`}>equipos listos</span>
                </div>
              </div>
              <CheckCircle size={24} className={`${darkMode ? 'text-[#C9EA63]/50' : 'text-[#008a5e]/50'}`} />
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
                    <div>
                        <span>Atención: Hay congestión (</span>
                        <b>{stats.kpis.clientes_esperando || 0}</b>
                        <span> chats esperando). Sugiero activar modo IA automatizado.</span>
                    </div>
                </div>
                )}
                {stats.kpis.cotizaciones_bot_pendientes > 0 && (
                <div 
                  onClick={() => navigate('/flujos-whatsapp')}
                  className={`p-3 rounded-lg text-sm font-bold flex items-start gap-2 shadow-sm cursor-pointer transition-all hover:scale-[1.02] ${darkMode ? 'bg-amber-900/30 text-amber-300 border border-amber-500/20' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}
                >
                    <Bot size={16} className="mt-0.5 animate-bounce" />
                    <div>
                        <span>Tienes </span>
                        <b>{stats.kpis.cotizaciones_bot_pendientes || 0}</b>
                        <span> cotización(es) de WhatsApp pendientes por despachar.</span>
                    </div>
                </div>
                )}
                {stats.kpis.clientes_esperando > 0 && (
                <div 
                  onClick={() => navigate('/conversaciones')}
                  className={`p-3 rounded-lg text-sm font-bold flex items-start gap-2 shadow-sm cursor-pointer transition-all hover:scale-[1.02] ${darkMode ? 'bg-rose-900/30 text-rose-300 border border-rose-500/20' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}
                >
                    <Users size={16} className="mt-0.5 animate-pulse" />
                    <div>
                        <span>Hay </span>
                        <b>{stats.kpis.clientes_esperando || 0}</b>
                        <span> cliente(s) esperando atención de un asesor humano.</span>
                    </div>
                </div>
                )}
                {stats.kpis.listos_sin_notificar > 0 && (
                <div className={`p-3 rounded-lg text-sm flex items-start gap-2 shadow-sm cursor-pointer transition-all hover:scale-[1.02] ${darkMode ? 'bg-emerald-900/30 text-emerald-300 border border-emerald-500/20' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`} onClick={() => navigate('/kanban')}>
                    <Activity size={16} className="mt-0.5" />
                    <div>
                        <span>Tienes </span>
                        <b>{stats.kpis.listos_sin_notificar || 0}</b>
                        <span> equipo(s) listo(s). Recuerda notificar a los clientes.</span>
                    </div>
                </div>
                )}
                <div className={`p-3 rounded-lg text-sm flex items-start gap-2 ${darkMode ? 'bg-[#1b2b10] text-[#C9EA63]' : 'bg-emerald-50 text-emerald-700'}`}>
                    <Clock size={16} className="mt-0.5" />
                    <div className="flex items-center gap-1">
                        <span>Tu tiempo de respuesta humano es de </span>
                        <b>{Number(stats?.kpis?.tiempo_promedio_min || 0)}</b>
                        <span> minutos en promedio.</span>
                    </div>
                </div>
            </div>
        </div>

        {/* PIPELINE BARS (Kpis visuales) */}
        <div className={`p-6 rounded-2xl border flex flex-col lg:col-span-2 ${boxBg}`}>
            <div className="flex justify-between items-end mb-6">
                <div>
                    <h3 className={`text-lg font-black ${textValue}`}>Pipeline Operativo</h3>
                    <div className={`text-xs ${textBody}`}>Volumen de equipos por fase</div>
                </div>
                <button onClick={() => navigate('/kanban')} className={`text-xs font-bold px-3 py-1 flex items-center gap-1 transition-colors rounded-full ${darkMode ? 'bg-[#1b2b10] text-[#F2F6F0] hover:bg-[#C9EA63] hover:text-[#141f0b]' : 'bg-slate-100 text-slate-700 hover:bg-[#008a5e] hover:text-white'}`}>
                    Ver Tablero Kanban <ArrowRight size={12}/>
                </button>
            </div>
            
            <div className="space-y-5 flex-1 mt-2">
                {[
                    {label: 'Recepción', count: stats.kpis.pipeline?.recepcion || 0, max: 50, color: 'bg-blue-500'},
                    {label: 'Laboratorio', count: stats.kpis.pipeline?.laboratorio || 0, max: 50, color: 'bg-amber-500'},
                    {label: 'Certificación / Papelería', count: stats.kpis.pipeline?.certificacion || 0, max: 50, color: darkMode ? 'bg-[#C9EA63]' : 'bg-[#008a5e]'},
                    {label: 'Listo / En Almacén', count: stats.kpis.pipeline?.listo || 0, max: 50, color: darkMode ? 'bg-[#C9EA63]' : 'bg-[#008a5e]'}
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
            <div className={`text-xs mb-6 ${textBody}`}>Días vs Horas de Operación (identifica saturación)</div>
            
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

        {/* Gráfico 7-day trend optimizado (Comentado temporalmente por diagnóstico) */}
        <div className={`p-6 rounded-2xl border ${boxBg}`}>
            <h3 className={`text-lg font-black mb-1 ${textValue}`}>Tendencia de Operación (7 días)</h3>
            <div className={`text-xs mb-6 ${textBody}`}>Equipos recibidos y entregados</div>
            <div className="h-64 w-full mt-4">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={stats.chartData || []}>
                        <defs>
                            <linearGradient id="colorTrend" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={darkMode ? '#C9EA63' : '#008a5e'} stopOpacity={0.3}/>
                                <stop offset="95%" stopColor={darkMode ? '#C9EA63' : '#008a5e'} stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#ffffff10' : '#00000005'} vertical={false} />
                        <XAxis dataKey="fecha" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: darkMode ? '#ffffff60' : '#00000040'}} />
                        <YAxis hide />
                        <RechartsTooltip 
                            contentStyle={{ 
                                backgroundColor: darkMode ? '#141f0b' : '#fff', 
                                borderRadius: '12px', 
                                border: 'none', 
                                boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' 
                            }} 
                        />
                        <Area type="monotone" dataKey="recibidos" stroke={darkMode ? '#C9EA63' : '#008a5e'} strokeWidth={3} fillOpacity={1} fill="url(#colorTrend)" />
                        <Area type="monotone" dataKey="entregados" stroke="#3b82f6" strokeWidth={3} fillOpacity={0} />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>

      </div>
    </div>
  );
};

export default Dashboard;
