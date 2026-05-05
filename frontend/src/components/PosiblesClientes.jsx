// Sprint 13-E — Módulo dividido en 2 tabs:
//   • Posibles Clientes (chat_leads): números nuevos detectados por el bot
//     o agregados manualmente. Aún no validados.
//   • Clientes del Bot (clientes_bot): pasaron el flujo y entregaron empresa+teléfono.
//     Pendientes de promover a cat_clientes (catálogo oficial usado por Recepción).

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Target, Search, Plus, Phone, CheckCircle, Mail, Building2, Trash2, ArrowRight, Bot, UserCheck, Clock, RotateCw } from 'lucide-react';
import { toast } from 'sonner';
import { confirmar } from '../hooks/alertas';
import { formatearFecha, relativeTime } from '../hooks/fechas';

const PosiblesClientes = ({ darkMode }) => {
    const [tab, setTab] = useState('leads'); // 'leads' | 'clientes_bot'
    const [leads, setLeads] = useState([]);
    const [clientesBot, setClientesBot] = useState([]);
    const [busqueda, setBusqueda] = useState('');
    const [modalAbierto, setModalAbierto] = useState(false);
    const [nuevoLead, setNuevoLead] = useState({ nombre: '', telefono: '', interes: '' });
    const [cargando, setCargando] = useState(true);

    const boxBg = darkMode ? 'bg-[#253916] border-[#C9EA63]/20' : 'bg-white border-gray-100 shadow-xl';
    const cardBg = darkMode ? 'bg-[#141f0b] border-[#C9EA63]/15' : 'bg-white border-slate-200';
    const textTitle = darkMode ? 'text-[#F2F6F0]' : 'text-slate-800';
    const textMuted = darkMode ? 'text-[#F2F6F0]/50' : 'text-slate-400';
    const inputBg = darkMode ? 'bg-[#141f0b] border-[#C9EA63]/40 text-[#F2F6F0]' : 'bg-slate-50 border-gray-200 text-slate-800';

    const cargar = async () => {
        setCargando(true);
        try {
            const [r1, r2] = await Promise.all([
                axios.get('/api/leads'),
                axios.get('/api/clientes-bot').catch(() => ({ data: [] }))
            ]);
            setLeads(r1.data || []);
            setClientesBot(r2.data || []);
        } catch (err) {
            toast.error('Error cargando: ' + (err.response?.data?.error || err.message));
        } finally { setCargando(false); }
    };
    useEffect(() => { cargar(); }, []);

    // ── Acciones de leads ─────────────────────────────────────────────────────
    const handleAgregarLead = async () => {
        if (!nuevoLead.nombre || !nuevoLead.telefono) return toast.error('Falta nombre o teléfono');
        try {
            await axios.post('/api/leads', { ...nuevoLead, origen: 'manual' });
            setModalAbierto(false);
            setNuevoLead({ nombre: '', telefono: '', interes: '' });
            cargar();
            toast.success('Lead capturado');
        } catch (err) { toast.error(err.response?.data?.error || err.message); }
    };

    const cambiarEstadoLead = async (id, estado) => {
        try {
            await axios.put(`/api/leads/${id}/estado`, { estado });
            cargar();
        } catch (err) { toast.error(err.response?.data?.error || err.message); }
    };

    const eliminarLead = async (id) => {
        if (!(await confirmar('Eliminar lead', '¿Seguro? Esta acción no se puede deshacer.', { danger: true }))) return;
        try {
            await axios.delete(`/api/leads/${id}`);
            cargar();
        } catch (err) { toast.error(err.response?.data?.error || err.message); }
    };

    // ── Acciones de clientes del bot ──────────────────────────────────────────
    const promoverACliente = async (cb) => {
        if (cb.catalogo_cliente_id) return toast.info('Ya está promovido');
        if (!(await confirmar(
            'Promover a Cliente Oficial',
            `Se creará "${cb.empresa || cb.contacto_nombre}" en cat_clientes para que Recepción pueda registrar OS para este cliente. ¿Confirmas?`,
            { confirmText: 'Sí, promover' }
        ))) return;
        try {
            await axios.post(`/api/clientes-bot/${cb.id}/promover`);
            toast.success('Promovido a cliente oficial');
            cargar();
        } catch (err) { toast.error(err.response?.data?.error || err.message); }
    };

    const cambiarEstadoCB = async (id, estado) => {
        try {
            await axios.put(`/api/clientes-bot/${id}/estado`, { estado });
            cargar();
        } catch (err) { toast.error(err.response?.data?.error || err.message); }
    };

    const eliminarClienteBot = async (id) => {
        if (!(await confirmar('Eliminar cliente del bot', 'Solo lo borra del módulo del bot. No afecta cat_clientes.', { danger: true }))) return;
        try {
            await axios.delete(`/api/clientes-bot/${id}`);
            cargar();
        } catch (err) { toast.error(err.response?.data?.error || err.message); }
    };

    // ── KPIs ──────────────────────────────────────────────────────────────────
    const ahora = new Date();
    const hace24h = new Date(ahora.getTime() - 24*60*60*1000);
    const haceSemana = new Date(ahora.getTime() - 7*24*60*60*1000);
    const leadsHoy = leads.filter(l => new Date(l.fecha) >= new Date(ahora.toDateString())).length;
    const leadsSinContactar24h = leads.filter(l => l.estado === 'Pendiente' && new Date(l.fecha) <= hace24h).length;
    const convertidosSemana = leads.filter(l => l.estado === 'Convertido' && new Date(l.fecha) >= haceSemana).length;
    const tasaConversion = leads.length > 0 ? Math.round((leads.filter(l => l.estado === 'Convertido').length / leads.length) * 100) : 0;

    const cbPendientesPromover = clientesBot.filter(c => !c.catalogo_cliente_id).length;
    const cbAprobados = clientesBot.filter(c => c.catalogo_cliente_id).length;

    // ── Filtros ───────────────────────────────────────────────────────────────
    const filtrar = (lista, campos) => {
        if (!busqueda) return lista;
        const q = busqueda.toLowerCase();
        return lista.filter(it => campos.some(c => (it[c] || '').toString().toLowerCase().includes(q)));
    };
    const leadsFiltrados = filtrar(leads, ['nombre', 'telefono', 'interes']);
    const cbFiltrados = filtrar(clientesBot, ['empresa', 'telefono', 'contacto_nombre', 'contacto_email']);

    return (
        <div className="w-full space-y-6 relative animate-in fade-in">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-6 border-opacity-20 border-[#C9EA63]">
                <div>
                    <h2 className={`text-3xl font-bold flex items-center gap-3 ${textTitle}`}>
                        <Target className={darkMode ? 'text-[#C9EA63]' : 'text-emerald-600'} size={32} />
                        Posibles Clientes
                    </h2>
                    <p className={`mt-2 text-sm ${darkMode ? 'text-[#F2F6F0]/70' : 'text-gray-500'}`}>
                        Leads capturados por el bot y clientes que pasaron el flujo "Soy Cliente".
                    </p>
                </div>
                <div className="flex gap-2">
                    <button onClick={cargar} className={`p-2 rounded-lg border ${darkMode ? 'border-[#C9EA63]/20 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`} title="Refrescar">
                        <RotateCw size={18} className={cargando ? 'animate-spin' : ''} />
                    </button>
                    {tab === 'leads' && (
                        <button onClick={() => setModalAbierto(true)} className={`px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 shadow-md ${darkMode ? 'bg-[#C9EA63] text-[#141f0b] hover:bg-[#b0d14b]' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}>
                            <Plus size={16}/> Capturar Lead
                        </button>
                    )}
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className={`p-4 rounded-xl border-l-4 border-emerald-500 ${boxBg}`}>
                    <div className="text-[10px] font-black uppercase tracking-widest text-emerald-500 flex items-center gap-1"><Target size={12}/> Leads hoy</div>
                    <div className={`text-3xl font-black mt-1 ${textTitle}`}>{leadsHoy}</div>
                </div>
                <div className={`p-4 rounded-xl border-l-4 border-rose-500 ${boxBg}`}>
                    <div className="text-[10px] font-black uppercase tracking-widest text-rose-500 flex items-center gap-1"><Clock size={12}/> Sin contactar &gt;24h</div>
                    <div className={`text-3xl font-black mt-1 ${textTitle}`}>{leadsSinContactar24h}</div>
                </div>
                <div className={`p-4 rounded-xl border-l-4 border-sky-500 ${boxBg}`}>
                    <div className="text-[10px] font-black uppercase tracking-widest text-sky-500 flex items-center gap-1"><CheckCircle size={12}/> Convertidos sem.</div>
                    <div className={`text-3xl font-black mt-1 ${textTitle}`}>{convertidosSemana}</div>
                </div>
                <div className={`p-4 rounded-xl border-l-4 border-amber-500 ${boxBg}`}>
                    <div className="text-[10px] font-black uppercase tracking-widest text-amber-500 flex items-center gap-1"><Target size={12}/> Tasa conversión</div>
                    <div className={`text-3xl font-black mt-1 ${textTitle}`}>{tasaConversion}%</div>
                </div>
                <div className={`p-4 rounded-xl border-l-4 border-violet-500 ${boxBg}`}>
                    <div className="text-[10px] font-black uppercase tracking-widest text-violet-500 flex items-center gap-1"><Bot size={12}/> Clientes Bot</div>
                    <div className={`text-3xl font-black mt-1 ${textTitle}`}>{clientesBot.length}</div>
                </div>
                <div className={`p-4 rounded-xl border-l-4 border-orange-500 ${boxBg}`}>
                    <div className="text-[10px] font-black uppercase tracking-widest text-orange-500 flex items-center gap-1"><UserCheck size={12}/> Por promover</div>
                    <div className={`text-3xl font-black mt-1 ${textTitle}`}>{cbPendientesPromover}</div>
                </div>
            </div>

            {/* Tabs */}
            <div className={`inline-flex p-1 rounded-xl ${darkMode ? 'bg-[#141f0b]' : 'bg-slate-100'}`}>
                <button
                    onClick={() => setTab('leads')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all ${tab === 'leads' ? (darkMode ? 'bg-[#C9EA63] text-[#141f0b]' : 'bg-white text-emerald-700 shadow-md') : (darkMode ? 'text-[#F2F6F0]/60' : 'text-slate-500')}`}
                >
                    <Target size={16}/> Posibles Clientes ({leads.length})
                </button>
                <button
                    onClick={() => setTab('clientes_bot')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all ${tab === 'clientes_bot' ? (darkMode ? 'bg-[#C9EA63] text-[#141f0b]' : 'bg-white text-emerald-700 shadow-md') : (darkMode ? 'text-[#F2F6F0]/60' : 'text-slate-500')}`}
                >
                    <Bot size={16}/> Clientes del Bot ({clientesBot.length})
                </button>
            </div>

            {/* Buscador */}
            <div className={`p-3 rounded-xl border flex items-center gap-2 ${boxBg}`}>
                <Search size={16} className={textMuted} />
                <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
                    placeholder={tab === 'leads' ? 'Buscar lead por nombre, teléfono o interés...' : 'Buscar cliente por empresa, teléfono o contacto...'}
                    className={`flex-1 bg-transparent outline-none text-sm ${textTitle}`}
                />
            </div>

            {/* ─── TAB POSIBLES CLIENTES ─── */}
            {tab === 'leads' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {leadsFiltrados.length === 0 && (
                        <div className={`col-span-full p-12 text-center rounded-2xl border ${cardBg}`}>
                            <Target size={48} className="mx-auto mb-3 opacity-30" />
                            <p className={`font-bold ${textTitle}`}>{leads.length === 0 ? 'Aún no hay leads' : 'Sin coincidencias'}</p>
                            <p className={`text-xs mt-1 ${textMuted}`}>Cuando un número desconocido escriba al bot se capturará automáticamente.</p>
                        </div>
                    )}
                    {leadsFiltrados.map(lead => (
                        <div key={lead.id} className={`p-5 border rounded-xl flex flex-col justify-between ${cardBg}`}>
                            <div>
                                <div className="flex justify-between items-start mb-3 gap-2">
                                    <span className={`px-2 py-1 text-[10px] uppercase font-bold rounded-md ${
                                        lead.estado === 'Convertido' ? 'bg-emerald-500 text-white' :
                                        lead.estado === 'Contactado' ? 'bg-sky-500 text-white' :
                                        (darkMode ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700')
                                    }`}>{lead.estado}</span>
                                    <span className={`px-2 py-0.5 text-[9px] uppercase font-bold rounded-md flex items-center gap-1 ${lead.origen === 'bot' ? (darkMode ? 'bg-violet-500/20 text-violet-300' : 'bg-violet-100 text-violet-700') : (darkMode ? 'bg-slate-600/30 text-slate-400' : 'bg-slate-100 text-slate-500')}`}>
                                        {lead.origen === 'bot' ? <><Bot size={9}/> bot</> : 'manual'}
                                    </span>
                                </div>
                                <h3 className={`font-bold text-lg mb-1 leading-tight ${textTitle}`}>{lead.nombre || 'Sin nombre'}</h3>
                                <p className={`text-xs mb-3 italic ${textMuted}`}>
                                    {lead.interes ? `"${lead.interes.slice(0, 80)}${lead.interes.length > 80 ? '...' : ''}"` : 'Sin interés especificado'}
                                </p>
                                <div className={`flex items-center gap-2 text-xs ${textTitle}`}><Phone size={12}/> <a href={`https://wa.me/${(lead.telefono || '').replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="hover:underline">{lead.telefono}</a></div>
                                <div className={`text-[10px] mt-1 ${textMuted}`}>Capturado: {relativeTime(lead.ultima_interaccion || lead.fecha)}</div>
                            </div>
                            <div className="flex flex-col gap-1.5 pt-4">
                                {lead.estado === 'Pendiente' && (
                                    <button onClick={() => cambiarEstadoLead(lead.id, 'Contactado')} className={`w-full py-1.5 rounded-lg text-xs font-bold ${darkMode ? 'bg-sky-500/20 text-sky-300 hover:bg-sky-500/30' : 'bg-sky-50 text-sky-700 hover:bg-sky-100'}`}>
                                        Marcar Contactado
                                    </button>
                                )}
                                {lead.estado !== 'Convertido' && (
                                    <button onClick={() => cambiarEstadoLead(lead.id, 'Convertido')} className={`w-full py-1.5 rounded-lg text-xs font-bold ${darkMode ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}>
                                        ✓ Convertido
                                    </button>
                                )}
                                <button onClick={() => eliminarLead(lead.id)} className={`w-full py-1.5 rounded-lg text-xs font-bold ${darkMode ? 'text-rose-400 hover:bg-rose-500/10' : 'text-rose-500 hover:bg-rose-50'}`}>
                                    <Trash2 size={11} className="inline mr-1"/> Descartar
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ─── TAB CLIENTES DEL BOT ─── */}
            {tab === 'clientes_bot' && (
                <div className={`rounded-2xl border overflow-hidden ${boxBg}`}>
                    {cbFiltrados.length === 0 && (
                        <div className="p-12 text-center">
                            <Bot size={48} className="mx-auto mb-3 opacity-30" />
                            <p className={`font-bold ${textTitle}`}>{clientesBot.length === 0 ? 'Aún no hay clientes del bot' : 'Sin coincidencias'}</p>
                            <p className={`text-xs mt-1 ${textMuted}`}>Cuando un cliente complete el flujo de cotización con empresa+teléfono, aparecerá aquí.</p>
                        </div>
                    )}
                    {cbFiltrados.length > 0 && (
                        <table className="w-full text-sm">
                            <thead className={`text-[10px] uppercase tracking-widest ${darkMode ? 'bg-[#141f0b] text-[#C9EA63]' : 'bg-slate-100 text-slate-600'}`}>
                                <tr>
                                    <th className="px-4 py-3 text-left">Empresa / Contacto</th>
                                    <th className="px-4 py-3 text-left">Teléfono</th>
                                    <th className="px-4 py-3 text-left">Estado</th>
                                    <th className="px-4 py-3 text-left">Última interacción</th>
                                    <th className="px-4 py-3 text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className={darkMode ? 'divide-y divide-[#C9EA63]/10' : 'divide-y divide-slate-100'}>
                                {cbFiltrados.map(cb => (
                                    <tr key={cb.id} className={darkMode ? 'hover:bg-white/5' : 'hover:bg-slate-50'}>
                                        <td className="px-4 py-3">
                                            <div className={`font-bold ${textTitle}`}>{cb.empresa || '—'}</div>
                                            <div className={`text-xs ${textMuted}`}>
                                                {cb.contacto_nombre && <span><span className="opacity-60">Contacto:</span> {cb.contacto_nombre}</span>}
                                                {cb.contacto_email && <span> · {cb.contacto_email}</span>}
                                            </div>
                                            {cb.catalogo_cliente_nombre && (
                                                <div className={`text-[10px] mt-1 inline-flex items-center gap-1 ${darkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>
                                                    <CheckCircle size={10}/> Promovido a cat_clientes: {cb.catalogo_cliente_nombre}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <a href={`https://wa.me/${cb.telefono}`} target="_blank" rel="noreferrer" className={`text-xs hover:underline ${textTitle}`}>{cb.telefono}</a>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                                cb.estado === 'Aprobado' ? 'bg-emerald-500 text-white' :
                                                cb.estado === 'Cotizado' ? 'bg-sky-500 text-white' :
                                                (darkMode ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700')
                                            }`}>{cb.estado}</span>
                                        </td>
                                        <td className={`px-4 py-3 text-xs ${textMuted}`}>{relativeTime(cb.ultima_interaccion || cb.created_at)}</td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex justify-end gap-1">
                                                {!cb.catalogo_cliente_id && (
                                                    <button onClick={() => promoverACliente(cb)} className={`px-3 py-1 rounded-lg text-[11px] font-bold ${darkMode ? 'bg-[#C9EA63] text-[#141f0b] hover:bg-[#b0d14b]' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`} title="Crea el cliente en cat_clientes">
                                                        🎉 Promover
                                                    </button>
                                                )}
                                                <button onClick={() => eliminarClienteBot(cb.id)} className={`p-1.5 rounded-lg ${darkMode ? 'hover:bg-rose-500/20 text-rose-400' : 'hover:bg-rose-50 text-rose-500'}`} title="Quitar del módulo">
                                                    <Trash2 size={14}/>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* Modal Nuevo Lead */}
            {modalAbierto && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm p-4">
                    <div className={`p-6 rounded-2xl w-full max-w-sm border shadow-2xl ${boxBg}`}>
                        <h3 className={`text-xl font-bold mb-4 ${textTitle}`}>Capturar Lead Manual</h3>
                        <div className="space-y-4">
                            <div>
                                <label className={`block text-xs font-bold mb-1 ${darkMode ? 'text-[#C9EA63]' : 'text-slate-500'}`}>Nombre o Empresa</label>
                                <input type="text" className={`w-full p-2 rounded-lg border text-sm ${inputBg}`}
                                    value={nuevoLead.nombre} onChange={e => setNuevoLead({...nuevoLead, nombre: e.target.value})} />
                            </div>
                            <div>
                                <label className={`block text-xs font-bold mb-1 ${darkMode ? 'text-[#C9EA63]' : 'text-slate-500'}`}>Teléfono WhatsApp</label>
                                <input type="text" className={`w-full p-2 rounded-lg border text-sm ${inputBg}`}
                                    value={nuevoLead.telefono} onChange={e => setNuevoLead({...nuevoLead, telefono: e.target.value})} />
                            </div>
                            <div>
                                <label className={`block text-xs font-bold mb-1 ${darkMode ? 'text-[#C9EA63]' : 'text-slate-500'}`}>Área de Interés</label>
                                <input type="text" placeholder="Ej: Calibración de masas" className={`w-full p-2 rounded-lg border text-sm ${inputBg}`}
                                    value={nuevoLead.interes} onChange={e => setNuevoLead({...nuevoLead, interes: e.target.value})} />
                            </div>
                        </div>
                        <div className="flex gap-3 justify-end mt-6">
                            <button onClick={() => setModalAbierto(false)} className={`px-4 py-2 rounded-lg text-sm font-bold ${darkMode ? 'text-[#F2F6F0] hover:bg-[#141f0b]' : 'text-slate-600 hover:bg-slate-100'}`}>Cancelar</button>
                            <button onClick={handleAgregarLead} className={`px-4 py-2 rounded-lg text-sm font-bold ${darkMode ? 'bg-[#C9EA63] text-[#141f0b]' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}>Guardar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PosiblesClientes;
