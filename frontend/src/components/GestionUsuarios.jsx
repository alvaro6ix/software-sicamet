import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Users, UserPlus, Shield, Trash2, Edit2, Lock, Unlock,
  Mail, User, X, Save, Search, Loader2, Package, Plus,
  FlaskConical, MapPin, ChevronRight, CheckCircle, AlertCircle
} from 'lucide-react';
import { confirmar } from '../hooks/alertas';

const GestionUsuarios = ({ darkMode }) => {
  const [tab, setTab] = useState('usuarios'); // 'usuarios' | 'areas'
  const [usuarios, setUsuarios] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);

  // Áreas
  const [areas, setAreas] = useState([]);
  const [cargandoAreas, setCargandoAreas] = useState(false);
  const [modalArea, setModalArea] = useState(false);
  const [editandoArea, setEditandoArea] = useState(null);
  const [formArea, setFormArea] = useState({ nombre: '', descripcion: '' });

  const [modalAbierto, setModalAbierto] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState({ nombre: '', email: '', password: '', rol: 'recepcionista', area: '', permisos: [], es_lider_area: false });
  const [rolPersonalizado, setRolPersonalizado] = useState(false);
  const [rolesBase, setRolesBase] = useState(['admin', 'recepcionista', 'metrologo', 'aseguramiento']);

  // Catálogo de permisos atómicos servido por el backend.
  // Cada item: { clave, grupo, descripcion }
  const [permisosCatalogo, setPermisosCatalogo] = useState([]);
  useEffect(() => {
    axios.get('/api/permisos/catalogo')
      .then(res => setPermisosCatalogo(res.data?.permisos || []))
      .catch(() => setPermisosCatalogo([]));
  }, []);

  // Agrupar permisos por sección para la UI.
  const permisosPorGrupo = permisosCatalogo.reduce((acc, p) => {
    if (!acc[p.grupo]) acc[p.grupo] = [];
    acc[p.grupo].push(p);
    return acc;
  }, {});

  const boxBg = darkMode ? 'bg-[#253916] border-[#C9EA63]/20' : 'bg-white border-gray-100 shadow-xl';
  const textTitle = darkMode ? 'text-[#F2F6F0]' : 'text-slate-800';
  const inputBg = darkMode ? 'bg-[#141f0b] border-[#C9EA63]/40 text-[#F2F6F0]' : 'bg-slate-50 border-gray-200 text-slate-800';

  const fetchUsuarios = async () => {
    try {
      setCargando(true);
      const res = await axios.get('/api/usuarios');
      setUsuarios(res.data);
    } catch (error) {
      console.error("Error al obtener usuarios", error);
    } finally {
      setCargando(false);
    }
  };

  const fetchAreas = async () => {
    try {
      setCargandoAreas(true);
      const res = await axios.get('/api/areas');
      setAreas(res.data);
    } catch (err) {
      console.error("Error al obtener áreas", err);
    } finally {
      setCargandoAreas(false);
    }
  };

  useEffect(() => {
    fetchUsuarios();
    fetchAreas();
  }, []);

  const handleGuardar = async (e) => {
    e.preventDefault();
    try {
      if (editandoId) {
        await axios.put(`/api/usuarios/${editandoId}`, form);
        alert("Usuario actualizado exitosamente");
      } else {
        await axios.post('/api/usuarios', form);
        alert("Usuario creado exitosamente");
      }
      setModalAbierto(false);
      setEditandoId(null);
      setForm({ nombre: '', email: '', password: '', rol: 'recepcionista', area: '', permisos: [], es_lider_area: false });
      fetchUsuarios();
    } catch (err) {
      alert(err.response?.data?.error || "Error al procesar usuario");
    }
  };

  const toggleActivo = async (id, estadoActual) => {
    try {
      await axios.put(`/api/usuarios/${id}/activo`, { activo: !estadoActual });
      fetchUsuarios();
    } catch (err) { console.error(err); }
  };

  const eliminarUsuario = async (id) => {
    if (!(await confirmar('Eliminar usuario', '¿Eliminar permanentemente? No se puede deshacer.', { danger: true, confirmText: 'Sí, eliminar' }))) return;
    try {
      await axios.delete(`/api/usuarios/${id}`);
      alert("Usuario eliminado");
      fetchUsuarios();
    } catch (err) { console.error(err); }
  };

  const abrirEditar = (u) => {
    setEditandoId(u.id);
    let permisosParsed = [];
    try {
        if (u.permisos) permisosParsed = typeof u.permisos === 'string' ? JSON.parse(u.permisos) : u.permisos;
    } catch(e) {}
    setForm({ nombre: u.nombre, email: u.email, password: '', rol: u.rol || 'recepcionista', area: u.area || '', permisos: permisosParsed, es_lider_area: !!u.es_lider_area });
    setModalAbierto(true);
  };

  // ─── ÁREAS CRUD ───────────────────────────────────────────────────────────────
  const handleGuardarArea = async (e) => {
    e.preventDefault();
    try {
      if (editandoArea) {
        await axios.put(`/api/areas/${editandoArea.id}`, formArea);
      } else {
        await axios.post('/api/areas', formArea);
      }
      setModalArea(false);
      setEditandoArea(null);
      setFormArea({ nombre: '', descripcion: '' });
      fetchAreas();
    } catch (err) {
      alert(err.response?.data?.error || "Error al guardar área");
    }
  };

  const eliminarArea = async (id) => {
    if (!(await confirmar('Eliminar área', 'Los equipos asignados a ella no se verán afectados.', { danger: true, confirmText: 'Sí, eliminar' }))) return;
    try {
      await axios.delete(`/api/areas/${id}`);
      fetchAreas();
    } catch (err) { alert(err.response?.data?.error || "Error al eliminar"); }
  };

  const abrirEditarArea = (area) => {
    setEditandoArea(area);
    setFormArea({ nombre: area.nombre, descripcion: area.descripcion || '' });
    setModalArea(true);
  };

  const usuariosFiltrados = usuarios.filter(u =>
    u.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    u.email.toLowerCase().includes(busqueda.toLowerCase())
  );

  const rolesUnicos = [...new Set(usuarios.map(u => u.rol))].filter(Boolean);
  const todosLosRoles = [...new Set([...rolesBase, ...rolesUnicos])];

  const eliminarRolDelLista = (rolAEliminar) => {
    if (['admin', 'recepcionista', 'metrologo', 'aseguramiento'].includes(rolAEliminar)) return;
    setRolesBase(prev => prev.filter(r => r !== rolAEliminar));
    if (form.rol === rolAEliminar) setForm(f => ({ ...f, rol: 'recepcionista' }));
  };

  const rolNecesitaArea = ['metrologo', 'operador'].includes(form.rol) || form.rol?.includes('metrolog');

  const getRolBadgeStyle = (rol, dark) => {
    const map = {
      admin: dark ? 'bg-[#C9EA63] text-[#141f0b]' : 'bg-emerald-600 text-white shadow-sm',
      metrologo: dark ? 'bg-blue-900/60 text-blue-300' : 'bg-blue-100 text-blue-700',
      operador: dark ? 'bg-blue-900/60 text-blue-300' : 'bg-blue-100 text-blue-700',
      aseguramiento: dark ? 'bg-purple-900/60 text-purple-300' : 'bg-purple-100 text-purple-700',
      validacion: dark ? 'bg-purple-900/60 text-purple-300' : 'bg-purple-100 text-purple-700',
    };
    return map[rol] || (dark ? 'bg-[#314a1c] text-[#C9EA63]' : 'bg-slate-200 text-slate-700');
  };

  return (
    <div className="w-full space-y-6 md:space-y-8 relative animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-6 border-opacity-20 border-[#C9EA63]">
        <div>
          <h2 className={`text-2xl md:text-3xl font-bold flex items-center gap-3 ${textTitle}`}>
            <Users className={darkMode ? 'text-[#C9EA63]' : 'text-emerald-600'} size={32} />
            Gestión de Personal
          </h2>
          <p className={`mt-1 md:mt-2 text-xs md:text-sm ${darkMode ? 'text-[#F2F6F0]/70' : 'text-gray-500'}`}>
            Administra accesos, roles, áreas y permisos del equipo SICAMET.
          </p>
        </div>

        {/* Tabs */}
        <div className={`flex rounded-xl p-1 ${darkMode ? 'bg-[#141f0b]' : 'bg-slate-100'}`}>
          <button
            onClick={() => setTab('usuarios')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all ${tab === 'usuarios' ? (darkMode ? 'bg-[#C9EA63] text-[#141f0b]' : 'bg-white text-emerald-700 shadow-md') : (darkMode ? 'text-[#F2F6F0]/60' : 'text-slate-500')}`}
          >
            <Users size={16}/> Usuarios
          </button>
          <button
            onClick={() => setTab('areas')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all ${tab === 'areas' ? (darkMode ? 'bg-[#C9EA63] text-[#141f0b]' : 'bg-white text-emerald-700 shadow-md') : (darkMode ? 'text-[#F2F6F0]/60' : 'text-slate-500')}`}
          >
            <MapPin size={16}/> Áreas Lab.
            {areas.length > 0 && <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-black ${darkMode ? 'bg-[#253916] text-[#C9EA63]' : 'bg-emerald-100 text-emerald-700'}`}>{areas.length}</span>}
          </button>
        </div>
      </div>

      {/* ══════ TAB USUARIOS ══════ */}
      {tab === 'usuarios' && (
        <>
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className={`flex items-center gap-2 w-full max-w-md px-4 py-2.5 border rounded-xl ${inputBg}`}>
              <Search size={18} className={darkMode ? 'text-[#F2F6F0]/50' : 'text-slate-400'} />
              <input
                type="text" placeholder="Buscar por nombre o correo..."
                className="bg-transparent border-none outline-none w-full text-sm"
                value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>
            <button
              onClick={() => { setEditandoId(null); setForm({ nombre: '', email: '', password: '', rol: 'recepcionista', area: '', permisos: [] }); setRolPersonalizado(false); setModalAbierto(true); }}
              className={`w-full sm:w-auto px-4 py-3 sm:py-2 rounded-xl font-bold text-sm transition-all focus:outline-none flex items-center justify-center gap-2 shadow-md ${darkMode ? 'bg-[#C9EA63] text-[#141f0b] hover:bg-[#b0d14b]' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
            >
              <UserPlus size={18} /> Nuevo Usuario
            </button>
          </div>

          <div className={`rounded-xl md:rounded-2xl border transition-colors duration-300 ${boxBg}`}>
            {/* Vista Mobile: Cards */}
            <div className="grid grid-cols-1 gap-4 md:hidden p-4">
              {usuariosFiltrados.map(u => (
                <div key={u.id} className={`p-4 rounded-xl border ${darkMode ? 'bg-[#141f0b] border-[#C9EA63]/10' : 'bg-slate-50 border-slate-200 shadow-sm'}`}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg ${darkMode ? 'bg-[#C9EA63] text-[#141f0b]' : 'bg-emerald-100 text-emerald-700'}`}>
                      {u.nombre.charAt(0)}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className={`font-bold truncate ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>{u.nombre}</span>
                      <span className={`text-xs truncate ${darkMode ? 'text-[#F2F6F0]/60' : 'text-slate-500'}`}>{u.email}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between py-3 border-t border-b border-inherit mb-4">
                    <div className="flex flex-col gap-1">
                      <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider w-fit ${getRolBadgeStyle(u.rol, darkMode)}`}>
                        {u.rol}
                      </span>
                      {u.area && <span className={`text-[10px] ${darkMode ? 'text-[#C9EA63]/70' : 'text-emerald-600'}`}>📍 {u.area}</span>}
                    </div>
                    <span className={`text-[10px] font-bold ${u.activo ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {u.activo ? '● ACTIVO' : '○ BLOQUEADO'}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => abrirEditar(u)} className={`flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2 font-bold text-xs ${darkMode ? 'bg-[#253916] text-[#C9EA63]' : 'bg-white border border-slate-200 text-slate-600'}`}>
                      <Edit2 size={14} /> Editar
                    </button>
                    <button onClick={() => toggleActivo(u.id, u.activo)} className={`flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2 font-bold text-xs ${u.activo ? (darkMode ? 'bg-rose-950/30 text-rose-400' : 'bg-rose-50 text-rose-600') : (darkMode ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-50 text-emerald-600')}`}>
                      {u.activo ? <Lock size={14} /> : <Unlock size={14} />} {u.activo ? 'Bloquear' : 'Activar'}
                    </button>
                    <button onClick={() => eliminarUsuario(u.id)} className={`p-2.5 rounded-lg flex items-center justify-center ${darkMode ? 'bg-red-950/30 text-red-500' : 'bg-red-50 text-red-600'}`}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Vista Desktop: Tabla */}
            <div className={`hidden md:block border rounded-xl overflow-hidden shadow-sm ${darkMode ? 'border-[#C9EA63]/20' : 'border-slate-200'}`}>
              <table className="w-full text-sm text-left">
                <thead className={`text-xs uppercase border-b ${darkMode ? 'bg-[#141f0b] text-[#C9EA63]' : 'bg-slate-100 text-slate-600'}`}>
                  <tr>
                    <th className="px-6 py-4">Colaborador</th>
                    <th className="px-6 py-4">Rol</th>
                    <th className="px-6 py-4">Área Laboratorio</th>
                    <th className="px-6 py-4 text-center">Estatus</th>
                    <th className="px-6 py-4 text-center text-xs">Acciones</th>
                  </tr>
                </thead>
                <tbody className={darkMode ? 'divide-y divide-[#C9EA63]/10 text-[#F2F6F0]/90' : 'divide-y divide-slate-100 text-slate-700'}>
                  {usuariosFiltrados.map(u => (
                    <tr key={u.id} className={`transition-colors ${darkMode ? 'bg-[#253916] hover:bg-[#314a1c]' : 'bg-white hover:bg-emerald-50/50'}`}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${darkMode ? 'bg-[#141f0b] text-[#C9EA63]' : 'bg-emerald-100 text-emerald-700'}`}>
                            {u.nombre.charAt(0)}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-bold truncate">{u.nombre}</span>
                            <span className="text-xs opacity-60 flex items-center gap-1 truncate"><Mail size={12} /> {u.email}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 w-fit ${getRolBadgeStyle(u.rol, darkMode)}`}>
                          {u.rol === 'admin' ? <Shield size={12} /> : (['metrologo','operador'].includes(u.rol) ? <FlaskConical size={12} /> : <User size={12} />)}
                          {u.rol}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {u.area ? (
                          <span className={`flex items-center gap-1.5 text-sm ${darkMode ? 'text-[#C9EA63]/80' : 'text-emerald-700'}`}>
                            <MapPin size={13} /> {u.area}
                          </span>
                        ) : (
                          <span className="text-xs opacity-30 italic">Sin área</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${u.activo ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {u.activo ? 'ACTIVO' : 'BLOQUEADO'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-center gap-1 md:gap-2">
                           <button onClick={() => abrirEditar(u)} className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-[#141f0b] text-[#C9EA63]' : 'hover:bg-emerald-50 text-emerald-600'}`} title="Editar Perfil"><Edit2 size={16} /></button>
                           <button onClick={() => toggleActivo(u.id, u.activo)} className={`p-2 rounded-lg transition-colors ${u.activo ? (darkMode ? 'hover:bg-rose-900/30 text-rose-400' : 'hover:bg-rose-50 text-rose-500') : (darkMode ? 'hover:bg-emerald-900/30 text-emerald-400' : 'hover:bg-emerald-50 text-emerald-600')}`} title={u.activo ? 'Bloquear Acceso' : 'Permitir Acceso'}>
                             {u.activo ? <Lock size={16} /> : <Unlock size={16} />}
                           </button>
                           <button onClick={() => eliminarUsuario(u.id)} className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-red-900/40 text-red-400' : 'hover:bg-red-50 text-red-500'}`} title="Eliminar definitivamente"><Trash2 size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {(usuariosFiltrados.length === 0 && !cargando) && (
              <div className="py-12 text-center opacity-60">
                <Users size={48} className="mx-auto mb-3 opacity-20" />
                No se encontraron usuarios registrados.
              </div>
            )}
            {cargando && (
              <div className="py-12 text-center text-xs">
                <Loader2 className="animate-spin mx-auto text-[#C9EA63] mb-2" size={32} />
                Cargando personal...
              </div>
            )}
          </div>
        </>
      )}

      {/* ══════ TAB ÁREAS ══════ */}
      {tab === 'areas' && (
        <>
          <div className="flex justify-between items-center">
            <div>
              <h3 className={`text-lg font-bold ${textTitle}`}>Áreas del Laboratorio</h3>
              <p className={`text-xs mt-0.5 ${darkMode ? 'text-[#F2F6F0]/60' : 'text-slate-500'}`}>
                Las áreas se muestran en el formulario de Registro para asignar equipos.
              </p>
            </div>
            <button
              onClick={() => { setEditandoArea(null); setFormArea({ nombre: '', descripcion: '' }); setModalArea(true); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm shadow-md transition-all ${darkMode ? 'bg-[#C9EA63] text-[#141f0b] hover:bg-[#b0d14b]' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
            >
              <Plus size={16} /> Nueva Área
            </button>
          </div>

          {cargandoAreas ? (
            <div className="py-12 text-center">
              <Loader2 className="animate-spin mx-auto text-[#C9EA63]" size={32} />
            </div>
          ) : areas.length === 0 ? (
            <div className={`rounded-2xl border p-12 text-center ${boxBg}`}>
              <MapPin size={48} className="mx-auto mb-4 opacity-20" />
              <p className={`font-bold mb-1 ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-700'}`}>Sin áreas configuradas</p>
              <p className={`text-sm mb-4 ${darkMode ? 'text-[#F2F6F0]/50' : 'text-slate-400'}`}>
                Crea las áreas del laboratorio para asignar equipos y metrólogos.
              </p>
              <button
                onClick={() => { setEditandoArea(null); setFormArea({ nombre: '', descripcion: '' }); setModalArea(true); }}
                className={`px-6 py-3 rounded-xl font-bold text-sm ${darkMode ? 'bg-[#C9EA63] text-[#141f0b]' : 'bg-emerald-600 text-white'}`}
              >
                <Plus size={16} className="inline mr-2" /> Crear Primera Área
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {areas.map(area => {
                const metrologosEnArea = usuarios.filter(u => u.area === area.nombre && ['metrologo','operador'].includes(u.rol));
                return (
                  <div key={area.id} className={`rounded-2xl border p-5 transition-all hover:shadow-md ${darkMode ? 'bg-[#253916] border-[#C9EA63]/20 hover:border-[#C9EA63]/40' : 'bg-white border-slate-200 hover:border-emerald-300 shadow-sm'}`}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${darkMode ? 'bg-[#C9EA63]/15 text-[#C9EA63]' : 'bg-emerald-100 text-emerald-600'}`}>
                          <FlaskConical size={20} />
                        </div>
                        <div>
                          <h4 className={`font-black text-base ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>{area.nombre}</h4>
                          <span className={`text-[10px] ${area.activa ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {area.activa ? '● Activa' : '○ Inactiva'}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => abrirEditarArea(area)} className={`p-2 rounded-lg ${darkMode ? 'hover:bg-[#141f0b] text-[#C9EA63]' : 'hover:bg-emerald-50 text-emerald-600'}`}><Edit2 size={14}/></button>
                        <button onClick={() => eliminarArea(area.id)} className={`p-2 rounded-lg ${darkMode ? 'hover:bg-red-900/30 text-red-400' : 'hover:bg-red-50 text-red-500'}`}><Trash2 size={14}/></button>
                      </div>
                    </div>
                    {area.descripcion && (
                      <p className={`text-xs mb-3 ${darkMode ? 'text-[#F2F6F0]/50' : 'text-slate-500'}`}>{area.descripcion}</p>
                    )}
                    <div className={`pt-3 border-t ${darkMode ? 'border-[#C9EA63]/10' : 'border-slate-100'}`}>
                      <p className={`text-[10px] font-bold uppercase tracking-wide mb-2 ${darkMode ? 'text-[#F2F6F0]/40' : 'text-slate-400'}`}>
                        Metrólogos asignados ({metrologosEnArea.length})
                      </p>
                      {metrologosEnArea.length > 0 ? (
                        <div className="space-y-1">
                          {metrologosEnArea.slice(0, 3).map(m => (
                            <div key={m.id} className={`flex items-center gap-2 text-xs ${darkMode ? 'text-[#F2F6F0]/70' : 'text-slate-600'}`}>
                              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${darkMode ? 'bg-[#141f0b] text-[#C9EA63]' : 'bg-emerald-100 text-emerald-700'}`}>{m.nombre.charAt(0)}</div>
                              {m.nombre}
                            </div>
                          ))}
                          {metrologosEnArea.length > 3 && (
                            <p className={`text-[10px] italic ${darkMode ? 'text-[#F2F6F0]/30' : 'text-slate-400'}`}>+{metrologosEnArea.length - 3} más...</p>
                          )}
                        </div>
                      ) : (
                        <p className={`text-[10px] italic ${darkMode ? 'text-[#F2F6F0]/30' : 'text-slate-400'}`}>Sin metrólogos asignados</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ══════ MODAL USUARIO ══════ */}
      {modalAbierto && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex justify-center items-center z-[100] p-4">
          <div className={`rounded-3xl shadow-2xl w-full max-w-lg relative border-t-4 flex flex-col max-h-[95vh] animate-in zoom-in duration-200 ${darkMode ? 'bg-[#141f0b] border-[#C9EA63]' : 'bg-white border-emerald-600'}`}>
            <div className="p-6 md:p-8 flex-1 overflow-y-auto custom-scrollbar">
              <button onClick={() => setModalAbierto(false)} className={`absolute top-4 right-4 ${darkMode ? 'text-gray-400 hover:text-[#C9EA63]' : 'text-gray-400 hover:text-gray-800'}`}>
                <X size={24} />
              </button>

              <h2 className={`text-xl md:text-2xl font-bold mb-6 flex items-center gap-2 ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>
                {editandoId ? <Edit2 className="text-[#C9EA63]" size={20} /> : <UserPlus className="text-[#C9EA63]" size={20} />}
                {editandoId ? 'Editar Perfil' : 'Alta de Colaborador'}
              </h2>

              <form onSubmit={handleGuardar} className="space-y-4 md:space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-[10px] font-black mb-1.5 uppercase tracking-wider ${darkMode ? 'text-[#F2F6F0]/60' : 'text-slate-500'}`}>Nombre Completo</label>
                    <div className="relative">
                      <User size={16} className="absolute left-3 top-3 opacity-40" />
                      <input required type="text" placeholder="Juan Pérez" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} className={`w-full pl-10 p-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-[#C9EA63] outline-none transition-all ${inputBg}`} />
                    </div>
                  </div>
                  <div>
                    <label className={`block text-[10px] font-black mb-1.5 uppercase tracking-wider ${darkMode ? 'text-[#F2F6F0]/60' : 'text-slate-500'}`}>Correo Electrónico</label>
                    <div className="relative">
                      <Mail size={16} className="absolute left-3 top-3 opacity-40" />
                      <input required type="email" placeholder="juan@sicamet.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={`w-full pl-10 p-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-[#C9EA63] outline-none transition-all ${inputBg}`} />
                    </div>
                  </div>
                </div>

                <div>
                  <label className={`block text-[10px] font-black mb-1.5 uppercase tracking-wider ${darkMode ? 'text-[#F2F6F0]/60' : 'text-slate-500'}`}>
                    {editandoId ? 'Nueva Contraseña (Opcional)' : 'Contraseña Inicial'}
                  </label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-3 opacity-40" />
                    <input required={!editandoId} type="password" placeholder="••••••••" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className={`w-full pl-10 p-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-[#C9EA63] outline-none transition-all ${inputBg}`} />
                  </div>
                  {editandoId && <p className="text-[10px] mt-1.5 opacity-40 italic">Mantenlo vacío para conservar la actual.</p>}
                </div>

                {/* Rol */}
                <div className="pt-1">
                  <label className={`block text-[10px] font-black mb-3 uppercase tracking-wider ${darkMode ? 'text-[#F2F6F0]/60' : 'text-slate-500'}`}>Rol / Puesto</label>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {todosLosRoles.map(rol => (
                      <div key={rol} className="relative group">
                        <button
                          type="button"
                          onClick={() => { setForm({ ...form, rol }); setRolPersonalizado(false); }}
                          className={`pl-3 pr-7 py-1.5 rounded-full text-xs font-bold border transition-all ${
                            form.rol === rol && !rolPersonalizado
                              ? (darkMode ? 'bg-[#C9EA63] text-[#141f0b] border-[#C9EA63]' : 'bg-emerald-600 text-white border-emerald-600')
                              : (darkMode ? 'border-[#C9EA63]/30 text-[#F2F6F0]/70 hover:bg-[#C9EA63]/10' : 'border-slate-300 text-slate-600 hover:bg-slate-100')
                          }`}
                        >
                          {rol === 'admin' && <Shield size={10} className="inline mr-1" />}
                          {['metrologo','operador'].includes(rol) && <FlaskConical size={10} className="inline mr-1" />}
                          {rol === 'aseguramiento' && <CheckCircle size={10} className="inline mr-1" />}
                          {rol}
                        </button>
                        {!['admin','recepcionista','metrologo','aseguramiento'].includes(rol) && (
                          <button
                            type="button"
                            title={`Quitar rol "${rol}" de la lista`}
                            onClick={e => { e.stopPropagation(); eliminarRolDelLista(rol); }}
                            className={`absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity ${
                              form.rol === rol && !rolPersonalizado ? 'bg-black/20 hover:bg-black/40 text-white' : (darkMode ? 'bg-[#C9EA63]/20 hover:bg-rose-500/60 text-rose-300' : 'bg-slate-200 hover:bg-rose-100 text-rose-500')
                            }`}
                          >
                            <X size={9} />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => { setRolPersonalizado(true); setForm({ ...form, rol: '' }); }}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all flex items-center gap-1 ${
                        rolPersonalizado
                          ? (darkMode ? 'bg-[#C9EA63] text-[#141f0b] border-[#C9EA63]' : 'bg-emerald-600 text-white border-emerald-600')
                          : (darkMode ? 'border-dashed border-[#C9EA63]/40 text-[#C9EA63]/70 hover:bg-[#C9EA63]/10' : 'border-dashed border-emerald-400 text-emerald-600 hover:bg-emerald-50')
                      }`}
                    >
                      <Plus size={10} /> Nuevo rol...
                    </button>
                  </div>
                  {rolPersonalizado && (
                    <div className="relative">
                      <User size={16} className="absolute left-3 top-3 opacity-40" />
                      <input
                        required autoFocus type="text"
                        placeholder="Ej. validador, supervisor..."
                        value={form.rol}
                        onChange={e => setForm({ ...form, rol: e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') })}
                        className={`w-full pl-10 p-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-[#C9EA63] outline-none transition-all ${inputBg}`}
                      />
                    </div>
                  )}
                </div>

                {/* Área de Laboratorio — solo para metrólogos */}
                {(rolNecesitaArea || form.area) && (
                  <div className={`p-4 rounded-xl border ${darkMode ? 'bg-[#1b2b10]/60 border-[#C9EA63]/20' : 'bg-emerald-50 border-emerald-200'}`}>
                    <label className={`block text-[10px] font-black mb-2 uppercase tracking-wider flex items-center gap-1.5 ${darkMode ? 'text-[#C9EA63]' : 'text-emerald-700'}`}>
                      <MapPin size={12}/> Área de Laboratorio
                      {rolNecesitaArea && <span className="text-rose-500">*</span>}
                    </label>
                    <select
                      required={rolNecesitaArea}
                      value={form.area}
                      onChange={e => setForm({ ...form, area: e.target.value })}
                      className={`w-full p-2.5 border rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#C9EA63] transition-all ${inputBg}`}
                    >
                      <option value="">-- Sin área asignada --</option>
                      {areas.map(a => (
                        <option key={a.id} value={a.nombre}>{a.nombre}</option>
                      ))}
                    </select>
                    {areas.length === 0 && (
                      <p className={`text-[10px] mt-1.5 italic ${darkMode ? 'text-yellow-400/70' : 'text-orange-500'}`}>
                        ⚠️ Primero crea las áreas en la pestaña "Áreas Lab."
                      </p>
                    )}
                  </div>
                )}

                {/* Permisos atómicos por grupo */}
                {form.rol !== 'admin' && (
                  <div className="pt-1">
                    <div className="flex items-center justify-between mb-2">
                      <label className={`block text-[10px] font-black uppercase tracking-wider ${darkMode ? 'text-[#F2F6F0]/60' : 'text-slate-500'}`}>Permisos Detallados</label>
                      <div className="flex gap-2 text-[10px]">
                        <button type="button" onClick={() => setForm({...form, permisos: permisosCatalogo.map(p => p.clave)})} className={`px-2 py-0.5 rounded font-bold ${darkMode ? 'bg-[#C9EA63]/20 text-[#C9EA63] hover:bg-[#C9EA63]/30' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'}`}>Todos</button>
                        <button type="button" onClick={() => setForm({...form, permisos: []})} className={`px-2 py-0.5 rounded font-bold ${darkMode ? 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30' : 'bg-rose-100 text-rose-700 hover:bg-rose-200'}`}>Ninguno</button>
                      </div>
                    </div>
                    <p className={`text-[10px] mb-3 italic ${darkMode ? 'text-[#F2F6F0]/40' : 'text-slate-400'}`}>
                      Si dejas todo vacío, se aplicarán los permisos por defecto del rol seleccionado.
                    </p>
                    <div className="space-y-3 max-h-[420px] overflow-y-auto pr-2 custom-scrollbar">
                      {Object.entries(permisosPorGrupo).map(([grupo, items]) => {
                        const todosEnGrupo = items.every(p => form.permisos.includes(p.clave));
                        return (
                          <div key={grupo} className={`p-3 rounded-xl border ${darkMode ? 'border-[#C9EA63]/15 bg-[#1b2b10]/50' : 'border-slate-200 bg-slate-50/50'}`}>
                            <div className="flex items-center justify-between mb-2">
                              <h4 className={`text-[11px] font-black uppercase tracking-wider ${darkMode ? 'text-[#C9EA63]' : 'text-emerald-700'}`}>{grupo}</h4>
                              <button
                                type="button"
                                onClick={() => {
                                  const claves = items.map(p => p.clave);
                                  if (todosEnGrupo) {
                                    setForm({...form, permisos: form.permisos.filter(p => !claves.includes(p))});
                                  } else {
                                    setForm({...form, permisos: [...new Set([...form.permisos, ...claves])]});
                                  }
                                }}
                                className={`text-[9px] font-bold px-2 py-0.5 rounded ${darkMode ? 'text-[#F2F6F0]/60 hover:text-[#C9EA63]' : 'text-slate-500 hover:text-emerald-700'}`}
                              >
                                {todosEnGrupo ? 'Quitar grupo' : 'Marcar grupo'}
                              </button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                              {items.map(p => {
                                const seleccionado = form.permisos.includes(p.clave);
                                return (
                                  <button
                                    key={p.clave}
                                    type="button"
                                    onClick={() => {
                                      if (seleccionado) setForm({...form, permisos: form.permisos.filter(x => x !== p.clave)});
                                      else setForm({...form, permisos: [...form.permisos, p.clave]});
                                    }}
                                    className={`text-left p-2 rounded-lg border text-[11px] transition-all flex items-start gap-2 ${seleccionado ? (darkMode ? 'bg-[#C9EA63] text-[#141f0b] border-[#C9EA63]' : 'bg-emerald-100 text-emerald-800 border-emerald-300') : (darkMode ? 'bg-transparent border-[#C9EA63]/20 text-[#F2F6F0]/60 hover:border-[#C9EA63]/40' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50')}`}
                                    title={p.clave}
                                  >
                                    <div className={`w-3 h-3 flex-shrink-0 mt-0.5 rounded flex items-center justify-center border ${seleccionado ? (darkMode ? 'bg-[#141f0b] border-transparent' : 'bg-emerald-600 border-emerald-600 text-white') : (darkMode ? 'border-[#C9EA63]/40' : 'border-slate-300')}`}>
                                      {seleccionado && <div className={`w-1.5 h-1.5 rounded-sm ${darkMode ? 'bg-[#C9EA63]' : 'bg-white'}`} />}
                                    </div>
                                    <span className="font-semibold leading-tight">{p.descripcion}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Líder de Área toggle — solo para metrólogos/operadores */}
                {['metrologo', 'operador'].includes(form.rol) && (
                  <div className={`flex items-center justify-between p-4 rounded-2xl border transition-all cursor-pointer ${
                    form.es_lider_area
                      ? (darkMode ? 'bg-[#C9EA63]/15 border-[#C9EA63]/50' : 'bg-emerald-50 border-emerald-300')
                      : (darkMode ? 'bg-[#1b2b10] border-[#C9EA63]/15' : 'bg-slate-50 border-slate-200')
                  }`}
                    onClick={() => setForm({ ...form, es_lider_area: !form.es_lider_area })}
                  >
                    <div>
                      <p className={`text-xs font-black ${darkMode ? (form.es_lider_area ? 'text-[#C9EA63]' : 'text-white') : (form.es_lider_area ? 'text-emerald-700' : 'text-slate-700')}`}>
                        ⭐ Líder de Área
                      </p>
                      <p className={`text-[10px] mt-0.5 ${darkMode ? 'text-white/40' : 'text-slate-400'}`}>
                        Puede ver todos los equipos de su área en el Dashboard de Metrología.
                      </p>
                    </div>
                    <div className={`w-11 h-6 rounded-full transition-all flex-shrink-0 flex items-center px-0.5 ${
                      form.es_lider_area ? 'bg-emerald-500 justify-end' : (darkMode ? 'bg-white/10 justify-start' : 'bg-slate-200 justify-start')
                    }`}>
                      <div className="w-5 h-5 rounded-full bg-white shadow-sm" />
                    </div>
                  </div>
                )}

                <div className="pt-4 flex gap-3">
                  <button type="button" onClick={() => setModalAbierto(false)} className={`hidden sm:block flex-1 font-bold py-3 px-4 rounded-xl transition-all ${darkMode ? 'text-[#F2F6F0]/60 hover:text-[#C9EA63]' : 'text-slate-400 hover:text-slate-600'}`}>
                    Cancelar
                  </button>
                  <button type="submit" className={`flex-[2] font-black py-4 px-6 rounded-xl flex justify-center items-center gap-2 shadow-lg transition-all transform hover:scale-[1.01] active:scale-95 ${darkMode ? 'bg-[#C9EA63] text-[#141f0b] hover:bg-[#b0d14b]' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}>
                    <Save size={20} /> {editandoId ? 'Guardar Cambios' : 'Registrar Colaborador'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ══════ MODAL ÁREA ══════ */}
      {modalArea && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex justify-center items-center z-[100] p-4">
          <div className={`rounded-3xl shadow-2xl w-full max-w-md relative border-t-4 animate-in zoom-in duration-200 ${darkMode ? 'bg-[#141f0b] border-[#C9EA63]' : 'bg-white border-emerald-600'}`}>
            <div className="p-6 md:p-8">
              <button onClick={() => setModalArea(false)} className={`absolute top-4 right-4 ${darkMode ? 'text-gray-400 hover:text-[#C9EA63]' : 'text-gray-400 hover:text-gray-800'}`}>
                <X size={24} />
              </button>
              <h2 className={`text-xl font-bold mb-6 flex items-center gap-2 ${darkMode ? 'text-[#F2F6F0]' : 'text-slate-800'}`}>
                <MapPin className="text-[#C9EA63]" size={20} />
                {editandoArea ? 'Editar Área' : 'Nueva Área de Laboratorio'}
              </h2>
              <form onSubmit={handleGuardarArea} className="space-y-4">
                <div>
                  <label className={`block text-[10px] font-black mb-1.5 uppercase tracking-wider ${darkMode ? 'text-[#F2F6F0]/60' : 'text-slate-500'}`}>Nombre del Área</label>
                  <input
                    required type="text"
                    placeholder="Ej: Masa, Dimensional, Presión..."
                    value={formArea.nombre}
                    onChange={e => setFormArea({ ...formArea, nombre: e.target.value })}
                    className={`w-full p-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-[#C9EA63] outline-none transition-all ${inputBg}`}
                  />
                </div>
                <div>
                  <label className={`block text-[10px] font-black mb-1.5 uppercase tracking-wider ${darkMode ? 'text-[#F2F6F0]/60' : 'text-slate-500'}`}>Descripción (opcional)</label>
                  <textarea
                    rows={2}
                    placeholder="Breve descripción del área..."
                    value={formArea.descripcion}
                    onChange={e => setFormArea({ ...formArea, descripcion: e.target.value })}
                    className={`w-full p-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-[#C9EA63] outline-none transition-all ${inputBg}`}
                  />
                </div>
                <div className="pt-3 flex gap-3">
                  <button type="button" onClick={() => setModalArea(false)} className={`flex-1 font-bold py-3 px-4 rounded-xl transition-all ${darkMode ? 'text-[#F2F6F0]/60 hover:text-[#C9EA63]' : 'text-slate-400 hover:text-slate-600'}`}>
                    Cancelar
                  </button>
                  <button type="submit" className={`flex-[2] font-black py-3 px-6 rounded-xl flex justify-center items-center gap-2 shadow-lg ${darkMode ? 'bg-[#C9EA63] text-[#141f0b]' : 'bg-emerald-600 text-white'}`}>
                    <Save size={18} /> {editandoArea ? 'Guardar Cambios' : 'Crear Área'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GestionUsuarios;
