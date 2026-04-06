import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Users, UserPlus, Shield, Trash2, Edit2, Lock, Unlock,
  Mail, User, X, Save, Search, Loader2, Package
} from 'lucide-react';

const GestionUsuarios = ({ darkMode }) => {
  const [usuarios, setUsuarios] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);

  const [modalAbierto, setModalAbierto] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState({ nombre: '', email: '', password: '', rol: 'recepcionista', permisos: [] });

  const MODULOS_DISPONIBLES = [
    { id: '/', nombre: 'Dashboard' },
    { id: '/registro', nombre: 'Registro Ágil' },
    { id: '/equipos', nombre: 'Lista Gral. Equipos' },
    { id: '/kanban', nombre: 'Pipeline Kanban' },
    { id: '/metrologia', nombre: 'Centro Metrología' },
    { id: '/validacion', nombre: 'Aseguramiento' },
    { id: '/clientes', nombre: 'Clientes' },
    { id: '/catalogo-instrumentos', nombre: 'Catálogos' },
    { id: '/flujos-whatsapp', nombre: 'Flujos WhatsApp' },
    { id: '/conversaciones', nombre: 'Conversaciones WA' },
    { id: '/leads', nombre: 'Posibles Clientes' },
    { id: '/marcas', nombre: 'Catálogo Marcas' },
    { id: '/modelos', nombre: 'Catálogo Modelos' },
    { id: '/whatsapp-qr', nombre: 'Vincular WhatsApp' },
    { id: '/usuarios', nombre: 'Gestión Usuarios' }
  ];

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

  useEffect(() => {
    fetchUsuarios();
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
      setForm({ nombre: '', email: '', password: '', rol: 'recepcionista', permisos: [] });
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
    if (!window.confirm("¿Estás seguro de eliminar permanentemente a este usuario?")) return;
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
    setForm({ nombre: u.nombre, email: u.email, password: '', rol: u.rol || 'recepcionista', permisos: permisosParsed });
    setModalAbierto(true);
  };

  const usuariosFiltrados = usuarios.filter(u =>
    u.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    u.email.toLowerCase().includes(busqueda.toLowerCase())
  );

  const rolesUnicos = [...new Set(usuarios.map(u => u.rol))].filter(Boolean);

  return (
    <div className="w-full space-y-6 md:space-y-8 relative animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-6 border-opacity-20 border-[#C9EA63]">
        <div>
          <h2 className={`text-2xl md:text-3xl font-bold flex items-center gap-3 ${textTitle}`}>
            <Users className={darkMode ? 'text-[#C9EA63]' : 'text-emerald-600'} size={32} />
            Gestión de Personal
          </h2>
          <p className={`mt-1 md:mt-2 text-xs md:text-sm ${darkMode ? 'text-[#F2F6F0]/70' : 'text-gray-500'}`}>
            Administra los accesos y permisos de los colaboradores del CRM.
          </p>
        </div>

        <button
          onClick={() => { setEditandoId(null); setForm({ nombre: '', email: '', password: '', rol: 'recepcionista', permisos: [] }); setModalAbierto(true); }}
          className={`w-full sm:w-auto px-4 py-3 sm:py-2 rounded-xl font-bold text-sm transition-all focus:outline-none flex items-center justify-center gap-2 shadow-md ${darkMode ? 'bg-[#C9EA63] text-[#141f0b] hover:bg-[#b0d14b]' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
        >
          <UserPlus size={18} /> Nuevo Usuario
        </button>
      </div>

      <div className={`rounded-xl md:rounded-2xl border p-4 md:p-6 transition-colors duration-300 ${boxBg}`}>
        <div className="mb-6">
          <div className={`flex items-center gap-2 w-full max-w-md px-4 py-2.5 border rounded-xl ${inputBg}`}>
            <Search size={18} className={darkMode ? 'text-[#F2F6F0]/50' : 'text-slate-400'} />
            <input
              type="text"
              placeholder="Buscar por nombre o correo..."
              className="bg-transparent border-none outline-none w-full text-sm"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
        </div>

        {/* Vista Mobile: Cards */}
        <div className="grid grid-cols-1 gap-4 md:hidden">
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
                <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 ${u.rol === 'admin'
                    ? (darkMode ? 'bg-[#C9EA63] text-[#141f0b]' : 'bg-emerald-600 text-white')
                    : (darkMode ? 'bg-[#314a1c] text-[#C9EA63]' : 'bg-slate-200 text-slate-700')
                  }`}>
                  {u.rol === 'admin' ? <Shield size={12} /> : (u.rol === 'operador' ? <Package size={12} /> : <User size={12} />)}
                  {u.rol === 'operador' ? 'Metrologo' : u.rol}
                </span>
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
                <th className="px-6 py-4">Rol / Permisos</th>
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
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 w-fit ${u.rol === 'admin'
                        ? (darkMode ? 'bg-[#C9EA63] text-[#141f0b]' : 'bg-emerald-600 text-white shadow-sm')
                        : (darkMode ? 'bg-[#314a1c] text-[#C9EA63]' : 'bg-slate-200 text-slate-700')
                      }`}>
                      {u.rol === 'admin' ? <Shield size={12} /> : (u.rol === 'operador' ? <Package size={12} /> : <User size={12} />)}
                      {u.rol === 'operador' ? 'Metrologo' : u.rol}
                    </span>
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

        {/* Empty State / Loading */}
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

      {/* Modal CRUD */}
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

              <form onSubmit={handleGuardar} className="space-y-4 md:space-y-6">
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

                <div className="pt-2">
                  <label className={`block text-[10px] font-black mb-3 uppercase tracking-wider ${darkMode ? 'text-[#F2F6F0]/60' : 'text-slate-500'}`}>Rol / Puesto (Escribe o Selecciona)</label>
                  <div className="relative">
                    <User size={16} className="absolute left-3 top-3 opacity-40" />
                    <input 
                      required 
                      type="text" 
                      list="roles-sugeridos"
                      placeholder="Ej. admin, finanzas, validador..." 
                      value={form.rol} 
                      onChange={e => setForm({ ...form, rol: e.target.value.toLowerCase().replace(/\s+/g, '_') })} 
                      className={`w-full pl-10 p-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-[#C9EA63] outline-none transition-all ${inputBg}`} 
                    />
                    <datalist id="roles-sugeridos">
                      {rolesUnicos.map(rol => (
                        <option key={rol} value={rol} />
                      ))}
                      {!rolesUnicos.includes('admin') && <option value="admin" />}
                      {!rolesUnicos.includes('recepcionista') && <option value="recepcionista" />}
                      {!rolesUnicos.includes('operador') && <option value="operador" />}
                    </datalist>
                  </div>
                  <p className="text-[10px] mt-1.5 opacity-60 italic">
                    Escribe <span className="font-bold">admin</span> para otorgar acceso total. Escribe un texto nuevo para crear un rol y asígnale permisos abajo.
                  </p>
                </div>

                {form.rol !== 'admin' && (
                <div className="pt-2">
                  <label className={`block text-[10px] font-black mb-3 uppercase tracking-wider ${darkMode ? 'text-[#F2F6F0]/60' : 'text-slate-500'}`}>Permisos de Módulos (Opcional)</label>
                  <p className={`text-[10px] mb-2 italic ${darkMode ? 'text-[#F2F6F0]/40' : 'text-slate-400'}`}>Si no seleccionas ninguno, el usuario usará los de su rol.</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {MODULOS_DISPONIBLES.map(mod => {
                        const seleccionado = form.permisos.includes(mod.id);
                        return (
                            <button
                                key={mod.id}
                                type="button"
                                onClick={() => {
                                    if (seleccionado) {
                                        setForm({...form, permisos: form.permisos.filter(p => p !== mod.id)});
                                    } else {
                                        setForm({...form, permisos: [...form.permisos, mod.id]});
                                    }
                                }}
                                className={`text-left p-2 rounded-lg border text-[11px] font-bold transition-all flex items-center gap-2 ${seleccionado ? (darkMode ? 'bg-[#C9EA63] text-[#141f0b] border-[#C9EA63]' : 'bg-emerald-100 text-emerald-800 border-emerald-300') : (darkMode ? 'bg-transparent border-[#C9EA63]/20 text-[#F2F6F0]/60 hover:border-[#C9EA63]/40' : 'bg-transparent border-slate-200 text-slate-500 hover:bg-slate-50')}`}
                            >
                                <div className={`w-3 h-3 flex-shrink-0 rounded flex items-center justify-center border ${seleccionado ? (darkMode ? 'bg-[#141f0b] border-transparent' : 'bg-emerald-600 border-emerald-600 text-white') : (darkMode ? 'border-[#C9EA63]/40' : 'border-slate-300')}`}>
                                    {seleccionado && <div className={`w-1.5 h-1.5 rounded-sm ${darkMode ? 'bg-[#C9EA63]' : 'bg-white'}`} />}
                                </div>
                                <span className="truncate">{mod.nombre}</span>
                            </button>
                        );
                    })}
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
    </div>
  );
};

export default GestionUsuarios;
