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
import PanelSLA from './PanelSLA';
import ChatEquipo from './ChatEquipo';

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
    // tabCorreccion eliminado: usábamos dos estados (tabCorreccion / tabMonitor) que se
    // desincronizaban. Ahora usamos solo tabMonitor para todo el panel de correcciones.
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

            {/* KPI Grid — cards de acciones rápidas (sin duplicar buckets de SLA del panel) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <KPICard
                    title="Por Validar"
                    value={stats.pendientes_aseguramiento}
                    icon={Package}
                    isDark={darkMode}
                    subtitle="Pase QA"
                    onClick={() => navigate('/validacion')}
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

            {/* Panel SLA — buckets por proximidad de vencimiento, fase Aseguramiento.
                Sustituye al card "SLA Crítico" duplicado: aquí se ve granular por bucket. */}
            <PanelSLA
                darkMode={darkMode}
                fase="Aseguramiento"
                titulo="Carga de Aseguramiento por SLA"
                descripcion="Equipos en aseguramiento agrupados por urgencia. Click en una tarjeta abre la lista filtrada."
            />

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
                    <div className="w-full">
                        <ResponsiveContainer width="100%" height={256} minWidth={0}>
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
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none">
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

            {/* Monitor de Correcciones eliminado: la información ahora vive en
                "Mis Decisiones" (Aprobados/Rechazados con tu nombre). Esto evita
                duplicidad y mantiene este dashboard enfocado en KPIs y gráficas. */}

            {/* Chat reutilizable (mismo lógica que Mis Decisiones / Mis Envíos) */}
            {comentariosActivos && (
                <ChatEquipo
                    darkMode={darkMode}
                    equipoId={comentariosActivos}
                    equipoNombre={(stats.en_correccion || []).concat(stats.corregidos || []).find(e => e.id === comentariosActivos)?.nombre_instrumento}
                    onClose={() => setComentariosActivos(null)}
                />
            )}
        </div>
    );
};

export default AseguramientoDashboard;
