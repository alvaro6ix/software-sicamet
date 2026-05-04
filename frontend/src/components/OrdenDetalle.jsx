// Sprint 3 / S3-A — vista dedicada de una OS.
// Ruta: /orden/:os
// Muestra cabecera (cliente, fechas, SLA), equipos con sus fases y SLA individual,
// timeline de auditoría y rechazos. Una sola llamada a /api/ordenes/:os hidrata todo.

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import {
    ArrowLeft, Package, Calendar, Building2, User, Mail, MapPin, Tag,
    Clock, CheckCircle, AlertTriangle, FileText, MessageSquare,
    Activity, ChevronRight, RefreshCw, Hash, Truck, FileCheck, GitBranch, Plus, X, Settings2
} from 'lucide-react';
import { usePermisos } from '../hooks/usePermisos';

const FASES = [
    { id: 'Recepción',     icono: Package,        color: 'sky' },
    { id: 'Laboratorio',   icono: Clock,          color: 'amber' },
    { id: 'Aseguramiento', icono: AlertTriangle,  color: 'blue' },
    { id: 'Certificación', icono: FileCheck,      color: 'purple' },
    { id: 'Facturación',   icono: CheckCircle,    color: 'emerald' },
    { id: 'Entregado',     icono: Truck,          color: 'gray' }
];

function badgeSLA(slaRestante, darkMode) {
    if (slaRestante == null) return null;
    let label = `${slaRestante}d`;
    let cls = darkMode ? 'bg-emerald-900/40 text-emerald-300' : 'bg-emerald-100 text-emerald-700';
    if (slaRestante <= 0) {
        label = 'Vencido';
        cls = darkMode ? 'bg-rose-900/50 text-rose-300' : 'bg-rose-100 text-rose-700';
    } else if (slaRestante <= 3) {
        cls = darkMode ? 'bg-amber-900/40 text-amber-300' : 'bg-amber-100 text-amber-800';
    }
    return <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${cls}`}>{label}</span>;
}

function formatearFecha(f) {
    if (!f) return '—';
    const d = new Date(f);
    if (isNaN(d.getTime())) return f;
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

const OrdenDetalle = ({ darkMode }) => {
    const { os } = useParams();
    const navigate = useNavigate();
    const { tiene } = usePermisos();
    const puedeVersionar = tiene('equipos.editar');
    const [data, setData] = useState(null);
    const [responsables, setResponsables] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState(null);
    const [tab, setTab] = useState('equipos');
    const [modalVersion, setModalVersion] = useState(false);
    const [verForm, setVerForm] = useState({ version_numero: '', dias_extra: 0, motivo: '' });
    const [guardandoVer, setGuardandoVer] = useState(false);

    const cargar = async () => {
        setCargando(true);
        setError(null);
        try {
            const [resOrden, resResp] = await Promise.all([
                axios.get(`/api/ordenes/${encodeURIComponent(os)}`),
                axios.get(`/api/ordenes/${encodeURIComponent(os)}/responsables`).catch(() => ({ data: { etapas: [] } }))
            ]);
            setData(resOrden.data);
            setResponsables(resResp.data?.etapas || []);
        } catch (err) {
            setError(err.response?.status === 404 ? 'Orden no encontrada' : (err.response?.data?.error || err.message));
        } finally {
            setCargando(false);
        }
    };

    useEffect(() => { cargar(); }, [os]);

    const boxBg = darkMode ? 'bg-[#141f0b] border-[#C9EA63]/20' : 'bg-white border-slate-200';
    const cardBg = darkMode ? 'bg-[#1b2b10] border-[#C9EA63]/15' : 'bg-slate-50 border-slate-200';
    const textTitle = darkMode ? 'text-[#F2F6F0]' : 'text-slate-800';
    const textBody = darkMode ? 'text-[#F2F6F0]/70' : 'text-slate-600';
    const textMuted = darkMode ? 'text-[#F2F6F0]/40' : 'text-slate-400';
    const accent = darkMode ? 'text-[#C9EA63]' : 'text-emerald-600';

    if (cargando) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <RefreshCw className={`animate-spin ${accent}`} size={32} />
                <p className={`mt-3 text-sm font-bold ${textMuted}`}>Cargando orden {os}...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className={`p-8 rounded-2xl border ${boxBg}`}>
                <div className="flex items-center gap-3 mb-4">
                    <button onClick={() => navigate(-1)} className={`p-2 rounded-lg ${darkMode ? 'hover:bg-white/5' : 'hover:bg-slate-100'}`}>
                        <ArrowLeft size={20} />
                    </button>
                    <h2 className={`text-xl font-black ${textTitle}`}>OS {os}</h2>
                </div>
                <div className={`p-6 rounded-xl border ${darkMode ? 'border-rose-500/30 bg-rose-900/20 text-rose-300' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
                    <AlertTriangle size={20} className="mb-2" />
                    <p className="font-bold">{error}</p>
                </div>
            </div>
        );
    }

    const { cabecera, equipos, historial, rechazos, versiones = [] } = data;
    const versionActiva = cabecera.version_activa || 1;

    const abrirModalVersion = () => {
        setVerForm({ version_numero: String(versionActiva + 1), dias_extra: 0, motivo: '' });
        setModalVersion(true);
    };

    const crearVersion = async () => {
        const num = parseInt(verForm.version_numero, 10);
        const dias = Math.max(0, parseInt(verForm.dias_extra || 0, 10));
        if (!Number.isFinite(num) || num <= versionActiva) {
            toast.error(`El número debe ser mayor a la versión activa (${versionActiva})`);
            return;
        }
        setGuardandoVer(true);
        try {
            await axios.post(`/api/ordenes/${encodeURIComponent(os)}/versiones`, {
                version_numero: num,
                dias_extra: dias,
                motivo: verForm.motivo || null
            });
            toast.success(`Versión v${num} creada`);
            setModalVersion(false);
            await cargar();
        } catch (err) {
            toast.error(err.response?.data?.error || err.message);
        } finally {
            setGuardandoVer(false);
        }
    };

    return (
        <div className="w-full space-y-6">
            {/* Header con back */}
            <div className="flex items-center gap-3 flex-wrap">
                <button onClick={() => navigate(-1)} className={`p-2 rounded-lg ${darkMode ? 'hover:bg-white/5' : 'hover:bg-slate-100'}`} title="Volver">
                    <ArrowLeft size={20} />
                </button>
                <div className="flex-1 min-w-0">
                    <p className={`text-[11px] font-black uppercase tracking-widest ${textMuted}`}>Orden de Servicio</p>
                    <div className="flex items-center gap-3 flex-wrap">
                        <h1 className={`text-2xl sm:text-3xl font-black ${accent} truncate`}>{cabecera.orden_cotizacion}</h1>
                        <span className={`text-sm font-black px-3 py-1 rounded-full ${darkMode ? 'bg-[#C9EA63]/20 text-[#C9EA63]' : 'bg-emerald-100 text-emerald-700'}`}>
                            v{versionActiva}
                        </span>
                        {cabecera.total_versiones > 1 && (
                            <span className={`text-[11px] font-bold ${textMuted}`}>
                                ({cabecera.total_versiones} versiones registradas)
                            </span>
                        )}
                    </div>
                </div>
                {puedeVersionar && (
                    <button
                        onClick={() => navigate(`/equipos/grupo/${encodeURIComponent(cabecera.orden_cotizacion)}`)}
                        className={`px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 ${darkMode ? 'bg-[#C9EA63] text-[#141f0b] hover:bg-[#b0d14b]' : 'bg-[#008a5e] text-white hover:bg-[#007b55]'}`}
                        title="Gestionar la orden completa: agregar equipos, crear nueva versión, etc."
                    >
                        <Settings2 size={16}/> Gestionar Orden
                    </button>
                )}
                <button onClick={cargar} className={`p-2 rounded-lg ${darkMode ? 'hover:bg-white/5' : 'hover:bg-slate-100'}`} title="Refrescar">
                    <RefreshCw size={18} />
                </button>
            </div>

            {/* Resumen cabecera */}
            <div className={`p-6 rounded-2xl border grid grid-cols-1 lg:grid-cols-3 gap-6 ${boxBg}`}>
                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-amber-500">
                        <Building2 size={14} /> Cliente
                    </div>
                    <p className={`text-lg font-black ${textTitle} leading-tight`}>{cabecera.empresa || '—'}</p>
                    {cabecera.persona && <div className={`text-xs flex items-center gap-1.5 ${textBody}`}><User size={12}/> {cabecera.persona}</div>}
                    {cabecera.contacto_email && <div className={`text-xs flex items-center gap-1.5 ${textBody}`}><Mail size={12}/> {cabecera.contacto_email}</div>}
                    {cabecera.direccion && <div className={`text-xs flex items-start gap-1.5 ${textBody}`}><MapPin size={12} className="mt-0.5 flex-shrink-0"/> <span className="line-clamp-2">{cabecera.direccion}</span></div>}
                </div>

                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-emerald-500">
                        <Calendar size={14} /> Fechas y SLA
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className={`p-2 rounded-lg ${cardBg}`}>
                            <div className={`text-[9px] uppercase font-bold ${textMuted}`}>Fecha de OS</div>
                            <div className={`font-bold ${textTitle}`}>{formatearFecha(cabecera.fecha_recepcion_parsed || cabecera.fecha_recepcion)}</div>
                        </div>
                        <div className={`p-2 rounded-lg ${cardBg}`}>
                            <div className={`text-[9px] uppercase font-bold ${textMuted}`}>Subida al sistema</div>
                            <div className={`font-bold ${textTitle}`}>{formatearFecha(cabecera.fecha_ingreso)}</div>
                        </div>
                        <div className={`p-2 rounded-lg ${cardBg}`}>
                            <div className={`text-[9px] uppercase font-bold ${textMuted}`}>SLA total</div>
                            <div className={`font-bold ${textTitle}`}>
                                {cabecera.sla_total} días
                                {cabecera.sla_dias_extra > 0 && <span className={`ml-1 text-[10px] font-bold ${accent}`}>(+{cabecera.sla_dias_extra} extra)</span>}
                            </div>
                        </div>
                        <div className={`p-2 rounded-lg ${cardBg}`}>
                            <div className={`text-[9px] uppercase font-bold ${textMuted}`}>Vence</div>
                            <div className={`font-bold ${textTitle}`}>{formatearFecha(cabecera.sla_fecha_vencimiento)}</div>
                        </div>
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-purple-500">
                        <Activity size={14} /> Distribución por fase
                    </div>
                    <div className="space-y-1.5">
                        {FASES.map(f => {
                            const count = cabecera.equipos_por_fase?.[f.id] || 0;
                            if (count === 0) return null;
                            const Icono = f.icono;
                            return (
                                <div key={f.id} className={`flex items-center justify-between p-2 rounded-lg ${cardBg}`}>
                                    <div className={`flex items-center gap-2 text-xs font-bold text-${f.color}-500`}>
                                        <Icono size={14}/>
                                        <span>{f.id}</span>
                                    </div>
                                    <span className={`text-sm font-black ${textTitle}`}>{count}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b overflow-x-auto custom-scrollbar" style={{ borderColor: darkMode ? 'rgba(201,234,99,0.15)' : '#e2e8f0' }}>
                {[
                    { id: 'equipos',      label: `Equipos (${equipos.length})` },
                    { id: 'responsables', label: `Responsables` },
                    { id: 'historial',    label: `Historial (${historial.length})` },
                    { id: 'rechazos',     label: `Rechazos (${rechazos.length})` },
                    { id: 'versiones',    label: `Versiones (${versiones.length || 1})` }
                ].map(t => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={`px-4 py-2 text-sm font-bold transition-colors border-b-2 ${tab === t.id ? `${accent} ${darkMode ? 'border-[#C9EA63]' : 'border-emerald-600'}` : `${textMuted} border-transparent hover:${textBody}`}`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Tab: Equipos */}
            {tab === 'equipos' && (
                <div className={`rounded-2xl border ${boxBg} overflow-x-auto custom-scrollbar`}>
                    <table className="w-full text-sm min-w-[760px]">
                        <thead>
                            <tr className={`text-[10px] font-black uppercase tracking-wider ${textMuted}`}>
                                <th className="text-left p-3">Instrumento</th>
                                <th className="text-left p-3">Marca / Modelo</th>
                                <th className="text-left p-3">Fase</th>
                                <th className="text-left p-3">Asignados</th>
                                <th className="text-left p-3">SLA</th>
                                <th className="text-left p-3">Comentarios</th>
                                <th className="text-left p-3">Cert.</th>
                            </tr>
                        </thead>
                        <tbody>
                            {equipos.map(e => {
                                const fase = FASES.find(f => f.id === e.estatus_actual);
                                return (
                                    <tr key={e.id} className={`border-t ${darkMode ? 'border-[#C9EA63]/10 hover:bg-[#1b2b10]/50' : 'border-slate-100 hover:bg-slate-50'}`}>
                                        <td className="p-3">
                                            <div className={`font-bold ${textTitle}`}>{e.nombre_instrumento || '—'}</div>
                                            {e.no_serie && <div className={`text-[10px] ${textMuted}`}>S/N: {e.no_serie}</div>}
                                            {e.identificacion && <div className={`text-[10px] ${textMuted}`}>ID: {e.identificacion}</div>}
                                        </td>
                                        <td className={`p-3 text-xs ${textBody}`}>
                                            {e.marca || '—'}{e.modelo ? ` / ${e.modelo}` : ''}
                                        </td>
                                        <td className="p-3">
                                            <div className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg bg-${fase?.color || 'gray'}-500/10 text-${fase?.color || 'gray'}-500`}>
                                                {fase?.icono && React.createElement(fase.icono, { size: 12 })}
                                                {e.estatus_actual}
                                            </div>
                                        </td>
                                        <td className="p-3">
                                            {e.metrologos_asignados?.length > 0 ? (
                                                <div className="flex flex-wrap gap-1">
                                                    {e.metrologos_asignados.map(m => (
                                                        <span key={m.id} className={`text-[10px] font-bold px-2 py-0.5 rounded ${darkMode ? 'bg-[#253916] text-[#C9EA63]' : 'bg-emerald-100 text-emerald-700'}`}>
                                                            {m.nombre}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : <span className={textMuted}>—</span>}
                                        </td>
                                        <td className="p-3">{badgeSLA(e.slaRestante, darkMode)}</td>
                                        <td className={`p-3 text-xs ${textBody}`}>
                                            {e.comentarios_count > 0 && <span className="inline-flex items-center gap-1"><MessageSquare size={11}/> {e.comentarios_count}</span>}
                                            {e.rechazos_count > 0 && <span className="ml-2 inline-flex items-center gap-1 text-rose-500"><AlertTriangle size={11}/> {e.rechazos_count}</span>}
                                        </td>
                                        <td className="p-3">
                                            {e.certificado_url ? (
                                                <a href={e.certificado_url} target="_blank" rel="noreferrer" className={`text-xs font-bold ${accent} hover:underline inline-flex items-center gap-1`}>
                                                    <FileText size={12}/> Ver
                                                </a>
                                            ) : <span className={`text-[10px] ${textMuted}`}>—</span>}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Tab: Responsables — quién hizo qué en cada etapa */}
            {tab === 'responsables' && (
                <div className={`rounded-2xl border ${boxBg} p-4 space-y-2`}>
                    <p className={`text-xs italic mb-3 ${textMuted}`}>
                        Cadena de responsabilidad de esta OS. Útil para auditorías: si algo se equivocó, sabes a quién consultar.
                    </p>
                    {responsables.length === 0 ? (
                        <p className={`text-center py-8 italic ${textMuted}`}>Sin información de responsables.</p>
                    ) : (
                        <div className="space-y-2">
                            {responsables.map((r, i) => (
                                <div key={i} className={`p-4 rounded-xl border flex items-center gap-4 ${cardBg}`}>
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm ${darkMode ? 'bg-[#C9EA63]/20 text-[#C9EA63]' : 'bg-emerald-100 text-emerald-700'}`}>
                                        {i + 1}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-3 flex-wrap">
                                            <p className={`text-sm font-black ${textTitle}`}>{r.etapa}</p>
                                            <span className={`text-[10px] uppercase font-bold ${textMuted}`}>{r.rol}</span>
                                        </div>
                                        <p className={`text-sm mt-0.5 ${r.usuario === 'Pendiente' || r.usuario === 'Sin asignar' || r.usuario === 'No registrado' ? textMuted + ' italic' : textBody}`}>
                                            {r.usuario}
                                        </p>
                                    </div>
                                    {r.fecha && (
                                        <span className={`text-[10px] font-bold ${textMuted}`}>
                                            {formatearFecha(r.fecha)}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Tab: Historial */}
            {tab === 'historial' && (
                <div className={`rounded-2xl border ${boxBg} p-4 space-y-2 max-h-[600px] overflow-y-auto custom-scrollbar`}>
                    {historial.length === 0 && <p className={`text-center py-8 italic ${textMuted}`}>Sin eventos registrados.</p>}
                    {historial.map(h => (
                        <div key={h.id} className={`p-3 rounded-xl border ${cardBg} flex items-start gap-3`}>
                            <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${darkMode ? 'bg-[#253916]' : 'bg-emerald-100'}`}>
                                <Activity size={14} className={accent}/>
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <p className={`text-sm font-bold ${textTitle}`}>{h.accion?.replaceAll('_', ' ')}</p>
                                    <span className={`text-[10px] font-bold ${textMuted}`}>{formatearFecha(h.fecha)}</span>
                                </div>
                                <p className={`text-xs ${textBody}`}>
                                    {h.usuario_nombre || 'Sistema'} {h.usuario_rol ? <span className={textMuted}>({h.usuario_rol})</span> : null}
                                    {h.nombre_instrumento ? <span className={textMuted}> · {h.nombre_instrumento}</span> : null}
                                </p>
                                {h.detalles && (
                                    <pre className={`mt-1 text-[10px] ${textMuted} font-mono whitespace-pre-wrap break-words`}>
                                        {typeof h.detalles === 'object' ? JSON.stringify(h.detalles, null, 2) : String(h.detalles)}
                                    </pre>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Tab: Rechazos */}
            {tab === 'rechazos' && (
                <div className={`rounded-2xl border ${boxBg} p-4 space-y-3 max-h-[600px] overflow-y-auto custom-scrollbar`}>
                    {rechazos.length === 0 && <p className={`text-center py-8 italic ${textMuted}`}>Sin rechazos registrados.</p>}
                    {rechazos.map(r => (
                        <div key={r.id} className={`p-4 rounded-xl border ${darkMode ? 'border-rose-500/20 bg-rose-900/10' : 'border-rose-200 bg-rose-50'}`}>
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <AlertTriangle size={14} className="text-rose-500"/>
                                    <span className={`text-sm font-bold ${textTitle}`}>{r.nombre_instrumento}</span>
                                </div>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${r.estatus === 'pendiente' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                    {r.estatus}
                                </span>
                            </div>
                            <p className={`text-xs ${textBody} whitespace-pre-wrap`}>{r.motivo}</p>
                            <div className={`mt-2 text-[10px] ${textMuted}`}>
                                Por <b>{r.usuario_rechaza_nombre || 'Sistema'}</b> · {formatearFecha(r.fecha_rechazo)}
                                {r.fecha_correccion && <span> · Corregido {formatearFecha(r.fecha_correccion)}</span>}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Tab: Versiones */}
            {tab === 'versiones' && (
                <div className={`rounded-2xl border ${boxBg} p-4 space-y-3`}>
                    {versiones.length === 0 ? (
                        <div className={`p-6 rounded-xl border ${cardBg}`}>
                            <p className={`text-sm font-bold ${textTitle}`}>Sin versionados todavía</p>
                            <p className={`text-xs mt-1 ${textBody}`}>Esta OS está en su versión inicial (v1). Cuando crees una nueva versión, el historial aparecerá aquí.</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {versiones.map(v => (
                                <div key={v.id} className={`p-4 rounded-xl border ${v.es_activa ? (darkMode ? 'border-[#C9EA63]/40 bg-[#C9EA63]/5' : 'border-emerald-300 bg-emerald-50') : cardBg}`}>
                                    <div className="flex items-center justify-between gap-3 flex-wrap">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-black ${v.es_activa ? (darkMode ? 'bg-[#C9EA63] text-[#141f0b]' : 'bg-emerald-600 text-white') : (darkMode ? 'bg-[#1b2b10] text-[#F2F6F0]/60' : 'bg-slate-200 text-slate-600')}`}>
                                                v{v.version_numero}
                                            </div>
                                            <div>
                                                <p className={`text-sm font-bold ${textTitle}`}>
                                                    {v.es_activa ? 'Versión activa' : 'Histórica'}
                                                </p>
                                                <p className={`text-[11px] ${textMuted}`}>
                                                    {v.usuario_nombre || 'Sistema'} · {formatearFecha(v.created_at)}
                                                </p>
                                            </div>
                                        </div>
                                        {v.dias_extra > 0 && (
                                            <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${darkMode ? 'bg-amber-900/40 text-amber-300' : 'bg-amber-100 text-amber-800'}`}>
                                                +{v.dias_extra} días al SLA
                                            </span>
                                        )}
                                    </div>
                                    {v.motivo && (
                                        <p className={`mt-2 text-xs ${textBody} whitespace-pre-wrap pl-13`}>{v.motivo}</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Modal: Crear nueva versión */}
            {modalVersion && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in">
                    <div className={`w-full max-w-md rounded-3xl shadow-2xl border ${boxBg}`}>
                        <div className={`p-5 border-b flex items-start justify-between gap-3 ${darkMode ? 'border-[#C9EA63]/15' : 'border-slate-200'}`}>
                            <div>
                                <p className={`text-[10px] font-black uppercase tracking-widest ${textMuted}`}>Nueva versión de OS</p>
                                <h3 className={`text-lg font-black ${textTitle}`}>{cabecera.orden_cotizacion}</h3>
                                <p className={`text-[11px] mt-0.5 ${textMuted}`}>Versión activa actual: v{versionActiva}</p>
                            </div>
                            <button onClick={() => setModalVersion(false)} className={`p-2 rounded-lg ${darkMode ? 'hover:bg-white/5' : 'hover:bg-slate-100'}`}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <label className={`block text-[10px] font-black uppercase tracking-wider mb-1.5 ${textMuted}`}>Número de versión nueva</label>
                                <input
                                    type="number"
                                    min={versionActiva + 1}
                                    step="1"
                                    value={verForm.version_numero}
                                    onChange={e => setVerForm({...verForm, version_numero: e.target.value})}
                                    className={`w-full p-3 rounded-xl text-lg font-black border outline-none ${darkMode ? 'bg-[#1b2b10] border-[#C9EA63]/20 text-[#C9EA63]' : 'bg-slate-50 border-slate-200 text-emerald-700'}`}
                                />
                                <p className={`text-[10px] mt-1 ${textMuted}`}>Debe ser mayor a {versionActiva}. Es manual: tú decides el número.</p>
                            </div>
                            <div>
                                <label className={`block text-[10px] font-black uppercase tracking-wider mb-1.5 ${textMuted}`}>Días extra al SLA (opcional)</label>
                                <input
                                    type="number" min="0" step="1"
                                    value={verForm.dias_extra}
                                    onChange={e => setVerForm({...verForm, dias_extra: e.target.value})}
                                    className={`w-full p-3 rounded-xl text-sm font-bold border outline-none ${darkMode ? 'bg-[#1b2b10] border-[#C9EA63]/20 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`}
                                />
                                <p className={`text-[10px] mt-1 ${textMuted}`}>Se SUMAN al SLA actual de todos los equipos. La fecha de origen no cambia.</p>
                            </div>
                            <div>
                                <label className={`block text-[10px] font-black uppercase tracking-wider mb-1.5 ${textMuted}`}>Motivo</label>
                                <textarea
                                    rows={3}
                                    value={verForm.motivo}
                                    onChange={e => setVerForm({...verForm, motivo: e.target.value})}
                                    placeholder="Ej: cliente agregó equipo, error en cantidad, reescaneo del PDF..."
                                    className={`w-full p-3 rounded-xl text-sm border outline-none resize-none ${darkMode ? 'bg-[#1b2b10] border-[#C9EA63]/20 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`}
                                />
                            </div>
                        </div>
                        <div className={`p-4 border-t flex gap-2 ${darkMode ? 'border-[#C9EA63]/15' : 'border-slate-200'}`}>
                            <button onClick={() => setModalVersion(false)} className={`flex-1 py-2.5 rounded-xl font-bold text-sm ${darkMode ? 'bg-[#1b2b10] text-[#F2F6F0]/70 hover:bg-[#253916]' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                Cancelar
                            </button>
                            <button
                                onClick={crearVersion}
                                disabled={guardandoVer || !verForm.version_numero}
                                className={`flex-[2] py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${darkMode ? 'bg-[#C9EA63] text-[#141f0b] hover:bg-[#b0d14b]' : 'bg-[#008a5e] text-white hover:bg-[#007b55]'}`}
                            >
                                {guardandoVer ? 'Creando...' : <>Crear v{verForm.version_numero || '?'} <GitBranch size={14}/></>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default OrdenDetalle;
