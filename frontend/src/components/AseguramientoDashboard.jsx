import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { 
    FileCheck, Clock, AlertTriangle, CheckCircle, 
    TrendingUp, Package, AlertCircle, Calendar,
    FileText, ArrowRight, Activity, Zap,
    MessageSquare, X, Send, RefreshCw, Paperclip, Camera
} from 'lucide-react';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, 
    Tooltip, ResponsiveContainer,
    Cell
} from 'recharts';

const cardStyle = (isDark) => `
    p-6 rounded-[2rem] border transition-all duration-300 hover:shadow-2xl 
    ${isDark ? 'bg-[#141f0b] border-[#C9EA63]/10 hover:border-[#C9EA63]/40 shadow-black/20' : 'bg-white border-slate-100 hover:border-emerald-200 shadow-slate-200/50 shadow-lg'}
`;

const KPICard = ({ title, value, icon: Icon, color, isDark, subtitle, onClick }) => (
    <div className={`${cardStyle(isDark)} ${onClick ? 'cursor-pointer' : ''}`} onClick={onClick}>
        <div className="flex justify-between items-start mb-4">
            <div className={`p-3 rounded-2xl ${isDark ? 'bg-[#253916] text-[#C9EA63]' : 'bg-slate-50 text-slate-600'}`}>
                <Icon size={24} />
            </div>
            {subtitle && (
                <span className={`text-[10px] font-black px-2 py-1 rounded-full ${isDark ? 'bg-[#C9EA63]/20 text-[#C9EA63]' : 'bg-emerald-50 text-emerald-600'}`}>
                    {subtitle}
                </span>
            )}
        </div>
        <h3 className={`text-3xl font-black mb-1 ${isDark ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>{value}</h3>
        <p className={`text-xs font-bold uppercase tracking-widest opacity-60 ${isDark ? 'text-white' : 'text-slate-500'}`}>{title}</p>
    </div>
);

const AseguramientoDashboard = ({ darkMode, usuario }) => {
    const [stats, setStats] = useState({
        pendientes_aseguramiento: 0,
        en_certificacion: 0,
        listos_hoy: 0,
        sla_critico: 0,
        sin_pdf: 0,
        en_correccion: []
    });
    const [cargando, setCargando] = useState(true);
    const [tabCorreccion, setTabCorreccion] = useState('pendientes'); // 'pendientes' | 'corregidos'
    const navigate = useNavigate();
    
    // Chat states
    const [comentariosActivos, setComentariosActivos] = useState(null);
    const [listaComentarios, setListaComentarios] = useState([]);
    const [nuevoComentario, setNuevoComentario] = useState('');
    const [archivoChat, setArchivoChat] = useState(null);
    const [enviandoChat, setEnviandoChat] = useState(false);
    const [tabMonitor, setTabMonitor] = useState('Pendientes'); // 'Pendientes' | 'Corregidos'

    const fetchStats = async () => {
        try {
            const res = await axios.get('/api/kpis_aseguramiento');
            setStats(res.data);
        } catch (error) {
            console.error("Error fetching kpis_aseguramiento:", error);
        } finally {
            setCargando(false);
        }
    };

    useEffect(() => {
        fetchStats();
        window.addEventListener('crm:refresh', fetchStats);
        return () => window.removeEventListener('crm:refresh', fetchStats);
    }, []);

    const abrirChat = async (id) => {
        try {
            setComentariosActivos(id);
            const res = await axios.get(`/api/instrumentos/${id}/comentarios`);
            setListaComentarios(res.data);
        } catch (err) { console.error(err); }
    };

    const enviarComentario = async (e) => {
        if (e) e.preventDefault();
        if ((!nuevoComentario.trim() && !archivoChat) || enviandoChat) return;
        setEnviandoChat(true);
        try {
            const fd = new FormData();
            fd.append('mensaje', nuevoComentario);
            if (archivoChat) fd.append('archivo', archivoChat);

            await axios.post(`/api/instrumentos/${comentariosActivos}/comentarios`, fd);
            setNuevoComentario('');
            setArchivoChat(null);
            const res = await axios.get(`/api/instrumentos/${comentariosActivos}/comentarios`);
            setListaComentarios(res.data);
        } catch (err) { console.error(err); } finally {
            setEnviandoChat(false);
        }
    };

    const chartData = [
        { name: 'Pendientes', value: stats.pendientes_aseguramiento, color: '#f59e0b' },
        { name: 'Certificación', value: stats.en_certificacion, color: '#6366f1' },
        { name: 'Listos Hoy', value: stats.listos_hoy, color: '#10b981' }
    ];

    if (cargando) {
        return (
            <div className="flex items-center justify-center h-[50vh]">
                <Activity className="animate-spin text-emerald-500" size={32} />
            </div>
        );
    }

    return (
        <div className="w-full space-y-8 animate-in fade-in duration-500">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className={`text-3xl md:text-4xl font-black tracking-tight flex items-center gap-3 ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>
                        <FileCheck className={darkMode ? 'text-[#C9EA63]' : 'text-emerald-500'} size={40} />
                        Consola de Aseguramiento
                    </h1>
                    <p className={`mt-2 text-sm font-medium ${darkMode ? 'text-[#F2F6F0]/60' : 'text-slate-500'}`}>
                        Métricas de control de calidad y eficiencia de certificación en tiempo real.
                    </p>
                </div>
                <div className={`px-4 py-2 rounded-2xl border flex items-center gap-2 ${darkMode ? 'bg-[#253916] border-[#C9EA63]/20 text-[#C9EA63]' : 'bg-emerald-50 border-emerald-100 text-emerald-700'}`}>
                    <Calendar size={18} />
                    <span className="text-sm font-black">{new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                </div>
            </div>

            {/* KPI Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <KPICard 
                    title="Por Validar" 
                    value={stats.pendientes_aseguramiento} 
                    icon={Package} 
                    isDark={darkMode}
                    subtitle="Pase QA"
                    onClick={() => navigate('/validacion')}
                />
                <KPICard 
                    title="SLA Crítico" 
                    value={stats.sla_critico} 
                    icon={AlertTriangle} 
                    color="rose" 
                    isDark={darkMode}
                    subtitle="< 24h"
                    onClick={() => navigate('/kanban')}
                />
                <KPICard 
                    title="En Certificación" 
                    value={stats.en_certificacion} 
                    icon={FileText} 
                    isDark={darkMode}
                    subtitle="En Proceso"
                    onClick={() => navigate('/certificacion-agil')}
                />
                <KPICard 
                    title="Listos Hoy" 
                    value={stats.listos_hoy} 
                    icon={CheckCircle} 
                    isDark={darkMode}
                    subtitle="Completado"
                    onClick={() => navigate('/entregas')}
                />
            </div>

            {/* Charts & Insights Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Workflow Progress Chart */}
                <div className={`lg:col-span-2 ${cardStyle(darkMode)}`}>
                    <div className="flex justify-between items-center mb-8">
                        <div>
                            <h4 className={`text-lg font-black ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>Distribución de Carga</h4>
                            <p className="text-xs opacity-50 font-bold uppercase tracking-wider">Flujo operativo por etapa</p>
                        </div>
                        <TrendingUp size={20} className="opacity-30" />
                    </div>
                    <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                            <BarChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={darkMode ? '#ffffff10' : '#00000010'} />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: darkMode ? '#F2F6F060' : '#64748b' }} />
                                <YAxis hide />
                                <Tooltip 
                                    contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', backgroundColor: darkMode ? '#141f0b' : '#fff' }}
                                    itemStyle={{ fontSize: 12, fontWeight: 900 }}
                                />
                                <Bar dataKey="value" radius={[10, 10, 0, 0]} barSize={40}>
                                    {chartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* AI Insights & Alerts */}
                <div className="space-y-6">
                    <div className={`${cardStyle(darkMode)} relative overflow-hidden group`}>
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <Zap size={64} fill="currentColor" className="text-amber-500" />
                        </div>
                        <h4 className={`text-sm font-black mb-4 flex items-center gap-2 ${darkMode ? 'text-[#C9EA63]' : 'text-emerald-600'}`}>
                            <Zap size={18} /> IA INSIGHTS
                        </h4>
                        <div className="space-y-4">
                            {stats.sin_pdf > 0 ? (
                                <div className={`p-4 rounded-2xl flex items-start gap-4 ${darkMode ? 'bg-rose-950/20 text-rose-400' : 'bg-rose-50 text-rose-700'}`}>
                                    <AlertCircle size={20} className="shrink-0 mt-1" />
                                    <div>
                                        <p className="text-xs font-black">DOCUMENTACIÓN FALTANTE</p>
                                        <p className="text-[10px] opacity-80 mt-1">Hay {stats.sin_pdf} equipos marcados como Listo/Certificación que no han recibido su PDF final. El Bot no podrá entregarlos.</p>
                                    </div>
                                </div>
                            ) : (
                                <div className={`p-4 rounded-2xl flex items-start gap-4 ${darkMode ? 'bg-emerald-950/20 text-emerald-400' : 'bg-emerald-50 text-emerald-700'}`}>
                                    <CheckCircle size={20} className="shrink-0 mt-1" />
                                    <div>
                                        <p className="text-xs font-black">OPERACIÓN OPTIMIZADA</p>
                                        <p className="text-[10px] opacity-80 mt-1">Todos los equipos liberados cuentan con su respaldo digital. El Bot de consulta está operando al 100%.</p>
                                    </div>
                                </div>
                            )}

                            <div className={`p-4 rounded-2xl flex items-start gap-4 ${darkMode ? 'bg-sky-950/20 text-sky-400' : 'bg-sky-50 text-sky-700'}`}>
                                <Activity size={20} className="shrink-0 mt-1" />
                                <div>
                                    <p className="text-xs font-black">CERTIFICACIÓN ÁGIL</p>
                                    <p className="text-[10px] opacity-80 mt-1">Recuerda que puedes usar el módulo de IA para subir lotes masivos de certificados y acelerar el cierre del día.</p>
                                </div>
                            </div>
                        </div>
                        <button 
                            onClick={() => window.location.href = '/certificacion-agil'}
                            className={`w-full mt-6 py-3 rounded-2xl border font-black text-[10px] transition-all flex items-center justify-center gap-2 ${darkMode ? 'border-[#C9EA63]/20 hover:bg-[#C9EA63] hover:text-[#141f0b]' : 'border-emerald-200 text-emerald-700 hover:bg-emerald-600 hover:text-white'}`}
                        >
                            REVISAR PENDIENTES <ArrowRight size={14} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Equipos en Corrección Section - TWO TABS */}
            <div className={cardStyle(darkMode)}>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                    <div>
                        <h4 className={`text-lg font-black ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>Monitor de Correcciones</h4>
                        <p className="text-xs opacity-50 font-bold uppercase tracking-wider">Seguimiento de equipos rechazados</p>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-[10px] font-black ${darkMode ? 'bg-rose-500/20 text-rose-400' : 'bg-rose-50 text-rose-600'}`}>
                        {stats.en_correccion?.length || 0} EN PROCESO
                    </div>
                </div>

                {/* Tabs */}
                <div className={`flex gap-1 p-1 rounded-2xl mb-6 ${darkMode ? 'bg-white/5' : 'bg-slate-100'}`}>
                    {[{ id: 'pendientes', label: 'Pendientes', filter: eq => eq.metrologo_estatus !== 'terminado' },
                      { id: 'corregidos', label: 'Corregidos', filter: eq => eq.metrologo_estatus === 'terminado' }]
                    .map(tab => {
                        const count = (stats.en_correccion || []).filter(tab.filter).length;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setTabCorreccion(tab.id)}
                                className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${
                                    tabCorreccion === tab.id
                                        ? (darkMode ? 'bg-[#C9EA63] text-[#141f0b] shadow-lg' : 'bg-white text-slate-800 shadow-md')
                                        : (darkMode ? 'text-white/40 hover:text-white/70' : 'text-slate-400 hover:text-slate-600')
                                }`}
                            >
                                {tab.label}
                                {count > 0 && (
                                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black ${
                                        tabCorreccion === tab.id
                                            ? (darkMode ? 'bg-[#141f0b] text-[#C9EA63]' : 'bg-emerald-600 text-white')
                                            : 'bg-rose-500 text-white'
                                    }`}>{count}</span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Equipment list */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Equipos en Corrección Section */}
                    <div className={`${darkMode ? 'bg-[#141f0b]' : 'bg-white'} rounded-2xl border ${darkMode ? 'border-[#C9EA63]/20' : 'border-slate-200'} shadow-sm overflow-hidden`}>
                        <div className="p-4 border-b flex justify-between items-center bg-slate-50/50 dark:bg-white/5">
                            <div className="flex gap-4">
                                <button 
                                    onClick={() => setTabMonitor('Pendientes')}
                                    className={`text-sm font-bold pb-2 transition-all border-b-2 ${tabMonitor === 'Pendientes' ? 'border-[#008a5e] text-[#008a5e]' : 'border-transparent opacity-50'}`}
                                >
                                    Pendientes
                                </button>
                                <button 
                                    onClick={() => setTabMonitor('Corregidos')}
                                    className={`text-sm font-bold pb-2 transition-all border-b-2 ${tabMonitor === 'Corregidos' ? 'border-[#008a5e] text-[#008a5e]' : 'border-transparent opacity-50'}`}
                                >
                                    Corregidos
                                </button>
                            </div>
                            <span className={`text-[10px] uppercase font-black opacity-40 px-2 py-0.5 rounded ${darkMode ? 'bg-[#C9EA63]/10' : 'bg-slate-200'}`}>Monitor de Calidad</span>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className={`text-[10px] uppercase font-black tracking-widest ${darkMode ? 'text-[#8696a0]' : 'text-slate-400'}`}>
                                        <th className="p-4">Equipo / OC</th>
                                        <th className="p-4">Motivo Rechazo</th>
                                        <th className="p-4">{tabMonitor === 'Pendientes' ? 'Estatus Metrología' : 'Fecha Corrección'}</th>
                                        <th className="p-4 text-center">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(tabMonitor === 'Pendientes' ? stats.en_correccion : stats.corregidos)?.length === 0 ? (
                                        <tr>
                                            <td colSpan="4" className="p-12 text-center text-xs opacity-50 italic">No hay equipos en este estado.</td>
                                        </tr>
                                    ) : (
                                        (tabMonitor === 'Pendientes' ? stats.en_correccion : stats.corregidos).map((c) => (
                                            <tr key={c.id} className={`border-t ${darkMode ? 'border-[#C9EA63]/10' : 'border-slate-50'} hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors`}>
                                                <td className="p-4">
                                                    <div className="font-bold text-sm leading-tight">{c.nombre_instrumento}</div>
                                                    <div className="text-[10px] opacity-60 mt-1 font-mono">{c.orden_cotizacion} • {c.empresa}</div>
                                                </td>
                                                <td className="p-4">
                                                    <div className="text-xs text-rose-500 font-medium max-w-[200px] line-clamp-2" title={c.motivo || c.motivo_rechazo}>
                                                        {c.motivo || c.motivo_rechazo}
                                                    </div>
                                                </td>
                                                <td className="p-4">
                                                    {tabMonitor === 'Pendientes' ? (
                                                        <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase ${c.metrologo_estatus === 'terminado' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                                            {c.metrologo_estatus || 'En espera'}
                                                        </span>
                                                    ) : (
                                                        <span className="bg-rose-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full shadow-sm">
                                                            EN CORRECCIÓN
                                                        </span>
                                                    )}
                                                    {(c.msg_count > 0) && (
                                                        <span className="bg-amber-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full flex items-center gap-1">
                                                            <MessageSquare size={8} /> {c.msg_count}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="p-4 text-center">
                                                    <button
                                                        onClick={() => abrirChat(c.id)}
                                                        className={`w-full py-2.5 rounded-xl text-[10px] font-black flex items-center justify-center gap-2 transition-all ${darkMode ? 'bg-white/5 text-[#F2F6F0] hover:bg-white/10 border border-white/10' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'}`}>
                                                        <MessageSquare size={13} /> VER CONVERSACIÓN
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            {/* Chat Modal — WhatsApp style */}
            {comentariosActivos && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex justify-end">
                    <div className={`w-full md:w-[420px] h-full shadow-2xl flex flex-col border-l animate-in slide-in-from-right duration-300 ${darkMode ? 'bg-[#0b141a] border-[#C9EA63]/20' : 'bg-[#efeae2] border-slate-200'}`}>
                        <div className={`p-4 border-b flex justify-between items-center flex-shrink-0 ${darkMode ? 'bg-[#202c33] border-slate-700' : 'bg-[#008a5e] border-transparent'}`}>
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm ${darkMode ? 'bg-[#C9EA63] text-[#141f0b]' : 'bg-white/20 text-white'}`}>AS</div>
                                <div>
                                    <h3 className={`font-black text-sm ${darkMode ? 'text-[#e9edef]' : 'text-white'}`}>Chat de Calidad</h3>
                                    <p className={`text-[10px] ${darkMode ? 'text-[#8696a0]' : 'text-white/70'}`}>Comunicación Aseguramiento ↔ Metrología</p>
                                </div>
                            </div>
                            <button onClick={() => setComentariosActivos(null)} className={`p-2 rounded-full ${darkMode ? 'hover:bg-white/10 text-[#8696a0]' : 'hover:bg-white/20 text-white'}`}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-2">
                            {listaComentarios.length === 0 ? (
                                <div className="flex justify-center mt-8">
                                    <div className={`px-4 py-2 rounded-lg text-xs shadow-sm ${darkMode ? 'bg-[#182229] text-[#8696a0]' : 'bg-[#ffeecd] text-[#54656f]'}`}>
                                        Sin mensajes aún.
                                    </div>
                                </div>
                            ) : (
                                listaComentarios.map(c => {
                                    const soyYo = Number(c.usuario_id) === Number(usuario?.id);
                                    return (
                                        <div key={c.id} className={`flex flex-col ${soyYo ? 'items-end' : 'items-start'}`}>
                                            <div className={`max-w-[85%] px-3 py-2 rounded-lg shadow-sm text-sm ${soyYo ? (darkMode ? 'bg-[#005c4b] text-[#e9edef]' : 'bg-[#d9fdd3] text-[#111b21]') : (darkMode ? 'bg-[#202c33] text-[#e9edef]' : 'bg-white text-[#111b21]')}`}>
                                                {!soyYo && <p className={`text-[10px] font-black mb-1 ${darkMode ? 'text-[#53bdeb]' : 'text-[#1fa855]'}`}>{c.usuario_nombre || 'Sistema'}</p>}
                                                <p className="whitespace-pre-wrap break-words">{c.mensaje}</p>

                                                {c.archivo_url && (
                                                    <div className="mt-2 mb-1">
                                                        {c.archivo_url.match(/\.(jpeg|jpg|gif|png|webp)$/i) ? (
                                                            <a href={c.archivo_url} target="_blank" rel="noreferrer" className="block cursor-zoom-in">
                                                                <img src={c.archivo_url} alt="Evidencia" className="rounded-lg max-w-full max-h-[250px] object-cover" />
                                                            </a>
                                                        ) : (
                                                            <a href={c.archivo_url} target="_blank" rel="noreferrer" className={`flex items-center gap-3 p-3 rounded border text-xs font-bold transition-colors ${darkMode ? 'bg-[#182229] border-[#2a3942] text-[#8696a0] hover:bg-[#202c33]' : 'bg-[#f0f2f5] border-[#d1d7db] text-[#54656f] hover:bg-[#e9edef]'}`}>
                                                                <FileText size={18}/> <span>Ver Adjunto</span>
                                                            </a>
                                                        )}
                                                    </div>
                                                )}

                                                <p className="text-[10px] opacity-40 text-right mt-1">{new Date(c.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        <form onSubmit={enviarComentario} className={`p-3 border-t flex flex-col gap-2 ${darkMode ? 'bg-[#202c33] border-slate-700' : 'bg-[#f0f2f5] border-slate-200'}`}>
                            {archivoChat && (
                                <div className={`p-2 rounded-lg flex justify-between items-center text-xs ${darkMode ? 'bg-white/5' : 'bg-white'}`}>
                                    <span className="truncate flex items-center gap-2"><Paperclip size={14}/> {archivoChat.name}</span>
                                    <button type="button" onClick={() => setArchivoChat(null)} className="text-rose-500"><X size={14}/></button>
                                </div>
                            )}
                            <div className="flex items-end gap-2">
                                <div className="flex gap-1">
                                    <label className={`p-2 rounded-full cursor-pointer transition-colors ${darkMode ? 'hover:bg-white/10 text-[#8696a0]' : 'hover:bg-white/50 text-slate-500'}`}>
                                        <Paperclip size={18} />
                                        <input type="file" className="hidden" onChange={e => setArchivoChat(e.target.files[0])} />
                                    </label>
                                    <label className={`p-2 rounded-full cursor-pointer transition-colors ${darkMode ? 'hover:bg-white/10 text-[#8696a0]' : 'hover:bg-white/50 text-slate-500'}`}>
                                        <Camera size={18} />
                                        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => setArchivoChat(e.target.files[0])} />
                                    </label>
                                </div>
                                <textarea
                                    value={nuevoComentario}
                                    onChange={e => setNuevoComentario(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarComentario(); } }}
                                    placeholder="Responder..."
                                    rows={1}
                                    className={`flex-1 p-3 rounded-2xl text-sm outline-none resize-none ${darkMode ? 'bg-[#2a3942] text-[#e9edef] placeholder:text-[#8696a0]' : 'bg-white text-[#111b21]'}`}
                                />
                                <button type="submit" disabled={(!nuevoComentario.trim() && !archivoChat) || enviandoChat} className="w-11 h-11 rounded-full bg-[#008a5e] text-white flex items-center justify-center disabled:opacity-40 hover:bg-[#007b55] transition-colors flex-shrink-0">
                                    <Send size={18} />
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AseguramientoDashboard;
