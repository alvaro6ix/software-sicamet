import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import axios from 'axios';
import Dashboard from './components/Dashboard';
import Registro from './components/Registro';
import ListaEquipos from './components/ListaEquipos';
import Clientes from './components/Clientes';
import CatalogoInstrumentos from './components/CatalogoInstrumentos';
import Marcas from './components/Marcas';
import Modelos from './components/Modelos';
import FlujosWhatsapp from './components/FlujosWhatsapp';
import Conversaciones from './components/Conversaciones';
import PosiblesClientes from './components/PosiblesClientes';
import WhatsappQR from './components/WhatsappQR';
import TableroKanban from './components/TableroKanban';
import GestionUsuarios from './components/GestionUsuarios';
import Login from './components/Login';
import MetrologiaDashboard from './components/MetrologiaDashboard';
import Validacion from './components/Validacion';
import Entregas from './components/Entregas';
import GestionGrupo from './components/GestionGrupo';
import AseguramientoCertificados from './components/AseguramientoCertificados';
import BusquedaGlobal from './components/BusquedaGlobal';
import NotificacionesBell from './components/NotificacionesBell';
import AseguramientoDashboard from './components/AseguramientoDashboard';
import MiBandeja from './components/MiBandeja';
import CorreccionesMetrologia from './components/CorreccionesMetrologia';
import SinCertificado from './components/SinCertificado';
import FeedbackBot from './components/FeedbackBot';
import OrdenDetalle from './components/OrdenDetalle';
import BandejaAsignacion from './components/BandejaAsignacion';
import MisEnvios from './components/MisEnvios';
import MisDecisiones from './components/MisDecisiones';
import io from 'socket.io-client';

import { Toaster, toast } from 'sonner';
import { PermisosProvider, usePermisos } from './hooks/usePermisos';

window.alert = (msg) => {
  if (!msg) return;
  const lowerMsg = String(msg).toLowerCase();
  if (lowerMsg.includes('error')) toast.error(msg);
  else if (lowerMsg.includes('éxito') || lowerMsg.includes('correctamente') || lowerMsg.includes('exitosamente')) toast.success(msg);
  else toast.info ? toast.info(msg) : toast(msg);
};

// Configurar axios con token automáticamente
axios.interceptors.request.use(config => {
  const token = localStorage.getItem('crm_token');
  if (token) config.headers['Authorization'] = `Bearer ${token}`;
  return config;
});

// Interceptor de errores HTTP:
//  401 → token expirado, fuerza re-login.
//  403 → permiso insuficiente. Toast amigable (deduplicado para no spammear).
let lastForbiddenToastAt = 0;
axios.interceptors.response.use(
  response => response,
  error => {
    const status = error.response?.status;
    if (status === 401) {
      localStorage.removeItem('crm_token');
      localStorage.removeItem('crm_usuario');
      window.location.reload();
    } else if (status === 403) {
      const ahora = Date.now();
      if (ahora - lastForbiddenToastAt > 2000) {
        lastForbiddenToastAt = ahora;
        const msg = error.response?.data?.error || 'No tienes permiso para esta acción.';
        try { toast.error('Acción bloqueada', { description: msg }); } catch (_) {}
      }
    }
    return Promise.reject(error);
  }
);

import {
  LayoutDashboard, FileText, List, Moon, Sun, Menu, X, Bell,
  Users, BookOpen, Tag, Package, MessageSquare, Search, Truck,
  Bot, ScanLine, Target, LogOut, ShieldCheck, UserCircle, Save, FileCheck,
  AlertTriangle, FileText as FileTextIcon, Inbox
} from 'lucide-react';

const Sidebar = ({ darkMode, toggleDarkMode, mobileOpen, setMobileOpen, usuario, onLogout, counts, sidebarOculta, setSidebarOculta }) => {
  const location = useLocation();
  const esAdmin = usuario?.rol === 'admin';
  const { tiene, listo: permisosListos } = usePermisos();

  // Cada item declara qué permiso atómico lo activa.
  // Admin tiene acceso a todo implícitamente (manejado por usePermisos).
  const navItems = [
    { name: 'Dashboard',                path: '/',                          icon: LayoutDashboard, permiso: 'dashboard.ver' },
    { name: 'Registro Ágil',            path: '/registro',                  icon: FileText,        permiso: 'registro.ver' },
    { name: 'Entregas',                 path: '/entregas',                  icon: Truck,           permiso: 'entregas.ver' },
    { name: 'Dashboard Aseguramiento',  path: '/aseguramiento-dashboard',   icon: LayoutDashboard, permiso: 'dashboard.aseguramiento.ver' },
    { name: 'Gestión Operativa',        path: '/validacion',                icon: FileCheck,       permiso: 'aseguramiento.ver' },
    { name: 'Mis Decisiones',           path: '/mis-decisiones',            icon: ShieldCheck,     permiso: 'aseguramiento.ver' },
    { name: 'Certificación Ágil',       path: '/certificacion-agil',        icon: FileCheck,       permiso: 'certificacion.ver' },
    { name: 'Lista Gral. Equipos',      path: '/equipos',                   icon: List,            permiso: 'equipos.ver' },
    { name: 'Pipelines Kanban',         path: '/kanban',                    icon: Package,         permiso: 'kanban.ver' },
    { name: 'Bandeja Jefe Metrología',  path: '/asignacion',                icon: Inbox,           permiso: 'metrologia.bandeja_jefe' },
    { name: 'Mi Bandeja',               path: '/mi-bandeja',                icon: Inbox,           permiso: 'metrologia.bandeja.ver' },
    { name: 'Mis Envíos',               path: '/mis-envios',                icon: Package,         permiso: 'metrologia.bandeja.ver' },
    { name: 'Centro Metrología',        path: '/metrologia',                icon: Package,         permiso: 'metrologia.centro.ver' },
    { name: 'Correcciones',             path: '/correcciones-metrologia',   icon: AlertTriangle,   permiso: 'metrologia.correcciones.ver' },
    { name: 'Sin Certificado',          path: '/sin-certificado',           icon: FileTextIcon,    permiso: 'sin_certificado.ver' },
    { name: 'Clientes',                 path: '/clientes',                  icon: Users,           permiso: 'clientes.ver' },
    { name: 'Catálogo Inst.',           path: '/catalogo-instrumentos',     icon: BookOpen,        permiso: 'catalogos.ver' },
    { name: 'Catálogo Marcas',          path: '/marcas',                    icon: Tag,             permiso: 'catalogos.ver' },
    { name: 'Catálogo Modelos',         path: '/modelos',                   icon: Package,         permiso: 'catalogos.ver' },
    { name: 'Flujos WhatsApp',          path: '/flujos-whatsapp',           icon: Bot,             permiso: 'bot.flujos.ver' },
    { name: 'Conversaciones WA',        path: '/conversaciones',            icon: MessageSquare,   permiso: 'bot.conversaciones.ver' },
    { name: 'Posibles Clientes',        path: '/leads',                     icon: Target,          permiso: 'leads.ver' },
    { name: 'Vincular WhatsApp',        path: '/whatsapp-qr',               icon: ScanLine,        permiso: 'bot.qr.ver' },
    { name: 'Feedback Bot',             path: '/feedback-bot',              icon: MessageSquare,   permiso: 'bot.feedback.ver' },
    { name: 'Gestión Usuarios',         path: '/usuarios',                  icon: Users,           permiso: 'usuarios.ver' },
  ].filter(item => permisosListos && tiene(item.permiso));

  const NavContent = () => (
    <div className="flex flex-col h-full overflow-y-auto custom-scrollbar relative">
      <div className={`p-6 sticky top-0 z-10 flex justify-between items-start ${darkMode ? 'bg-[#141f0b]' : 'bg-[#F2F6F0]'}`}>
        <div>
          <h2 className={`text-2xl font-black tracking-tighter ${darkMode ? 'text-[#C9EA63]' : 'text-[#008a5e]'}`}>
            SICAMET <span className={darkMode ? 'text-[#F2F6F0]' : 'text-[#253916]'}>CRM</span>
          </h2>
          <div className={`flex items-center gap-1.5 mt-1 ${darkMode ? 'text-[#C9EA63]/60' : 'text-[#253916]/50'} text-xs`}>
            <ShieldCheck size={12} />
            <span>{
              usuario?.rol === 'admin' ? 'Administrador'
              : usuario?.rol === 'operador' ? 'Metrólogo'
              : usuario?.rol
                ? usuario.rol.charAt(0).toUpperCase() + usuario.rol.slice(1)
                : 'Usuario'
            }</span>
          </div>
        </div>
        {/* Toggle para ocultar en PC */}
        <button 
          onClick={() => setSidebarOculta(true)} 
          className={`hidden lg:flex p-1.5 rounded-lg transition-colors ${darkMode ? 'hover:bg-[#253916] text-[#C9EA63]' : 'hover:bg-gray-200 text-gray-500'}`}
          title="Colapsar menú"
        >
          <Menu size={20} />
        </button>
      </div>

      <nav className="flex-1 px-4 space-y-1 mt-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all duration-200 text-sm ${
                isActive 
                  ? (darkMode ? 'bg-[#C9EA63] text-[#141f0b] shadow-md font-bold' : 'bg-[#008a5e] text-white shadow-md font-bold')
                  : (darkMode ? 'text-[#F2F6F0]/70 hover:bg-[#253916] hover:text-[#C9EA63]' : 'text-[#253916]/70 hover:bg-[#008a5e]/10 hover:text-[#008a5e]')
              }`}
            >
              <item.icon size={18} />
              <span className="flex-1">{item.name}</span>
              
              {/* BADGES UNIFICADOS */}
              {item.name === 'Flujos WhatsApp' && counts.cots > 0 && (
                <span className="bg-rose-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full shadow-lg animate-pulse border border-white/20">
                  {counts.cots}
                </span>
              )}
              {item.name === 'Conversaciones WA' && counts.escalados > 0 && (
                <span className="bg-rose-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full shadow-lg animate-pulse border border-white/20">
                  {counts.escalados}
                </span>
              )}
              {item.name === 'Entregas' && counts.listosEntrega > 0 && (
                <span className="bg-[#C9EA63] text-[#141f0b] text-[10px] font-black px-1.5 py-0.5 rounded-full shadow-lg border border-[#141f0b]/10">
                  {counts.listosEntrega}
                </span>
              )}
              {item.name === 'Aseguramiento' && counts.pendientesValidacion > 0 && (
                <span className="bg-amber-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full shadow-lg border border-white/20">
                  {counts.pendientesValidacion}
                </span>
              )}
              {item.name === 'Centro Metrología' && (
                (() => {
                  const metroCount = usuario.rol === 'admin'
                    ? Object.values(counts.metrologiaAreaCounts || {}).reduce((a, b) => a + b, 0)
                    : (counts.metrologiaAreaCounts?.[usuario.area] || 0);
                  return metroCount > 0 ? (
                    <span className="bg-sky-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full shadow-lg border border-white/20">
                      {metroCount}
                    </span>
                  ) : null;
                })()
              )}
              {item.name === 'Correcciones' && counts.correcciones > 0 && (
                <span className="bg-rose-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full shadow-lg border border-white/20 animate-pulse">
                  {counts.correcciones}
                </span>
              )}
              {item.name === 'Sin Certificado' && counts.sin_certificado > 0 && (
                <span className="bg-amber-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full shadow-lg border border-white/20 animate-pulse">
                  {counts.sin_certificado}
                </span>
              )}
              {item.name === 'Feedback Bot' && counts.feedback_nuevos > 0 && (
                <span className="bg-violet-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full shadow-lg border border-white/20">
                  {counts.feedback_nuevos}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className={`p-4 mt-auto sticky bottom-0 border-t space-y-2 ${darkMode ? 'border-[#C9EA63]/10' : 'border-[#253916]/10'}`}
        style={{ backgroundColor: darkMode ? '#141f0b' : '#F2F6F0' }}>
        
        {/* Usuario logueado */}
        <div className={`flex items-center gap-3 px-3 py-2 rounded-xl ${darkMode ? 'bg-[#253916]/50' : 'bg-white/60'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${darkMode ? 'bg-[#C9EA63] text-[#141f0b]' : 'bg-[#008a5e] text-white'}`}>
            {usuario?.nombre?.charAt(0) || 'U'}
          </div>
          <div className="min-w-0">
            <div className={`text-xs font-semibold truncate ${darkMode ? 'text-[#F2F6F0]' : 'text-[#253916]'}`}>{usuario?.nombre}</div>
            <div className={`text-xs truncate ${darkMode ? 'text-[#F2F6F0]/40' : 'text-[#253916]/50'}`}>{usuario?.email}</div>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={toggleDarkMode}
            className={`flex-1 flex items-center justify-center gap-2 p-2.5 rounded-xl shadow-sm transition-all text-xs font-bold ${
              darkMode ? 'bg-[#253916] text-[#C9EA63] hover:bg-[#314a1c]' : 'bg-white text-[#253916] hover:bg-gray-50'
            }`}
          >
            {darkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button
            onClick={onLogout}
            className={`flex-1 flex items-center justify-center gap-2 p-2.5 rounded-xl shadow-sm transition-all text-xs font-bold ${
              darkMode ? 'bg-rose-900/40 text-rose-400 hover:bg-rose-900/60' : 'bg-rose-50 text-rose-600 hover:bg-rose-100'
            }`}
            title="Cerrar sesión"
          >
            <LogOut size={16} />
            <span>Salir</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: ${darkMode ? '#253916' : '#E2E8F0'}; border-radius: 10px; }
      `}</style>
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
      )}
      <aside className={`fixed inset-y-0 left-0 z-50 w-72 transform transition-transform duration-300 ease-in-out ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      } ${sidebarOculta ? 'lg:-translate-x-full lg:fixed' : 'lg:translate-x-0 lg:static'} ${darkMode ? 'bg-[#141f0b] border-r border-[#C9EA63]/10' : 'bg-[#F2F6F0] border-r border-[#253916]/5'}`}>
        <NavContent />
      </aside>
    </>
  );
};

const Layout = () => {
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('crm_dark_mode');
    if (saved !== null) return saved === 'true';
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarOculta, setSidebarOculta] = useState(false);
  const [usuario, setUsuario] = useState(null);
  const [verificando, setVerificando] = useState(true);

  useEffect(() => {
    localStorage.setItem('crm_dark_mode', darkMode);
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  const toggleDarkMode = () => {
    if (!document.startViewTransition) {
      setDarkMode(!darkMode);
      return;
    }
    document.startViewTransition(() => {
      setDarkMode(!darkMode);
    });
  };

  useEffect(() => {
    const token = localStorage.getItem('crm_token');
    if (token) {
      axios.get('/api/auth/me')
        .then(res => {
          setUsuario(res.data.usuario);
          localStorage.setItem('crm_usuario', JSON.stringify(res.data.usuario));
        })
        .catch(() => {
          // Si el token es súper viejo o no auth, se maneja por el interceptor
        })
        .finally(() => setVerificando(false));
    } else {
      setVerificando(false);
    }
  }, []);

  const handleLogin = (usr) => setUsuario(usr);
  
  const [pendingCounts, setPendingCounts] = useState({
    cots: 0,
    escalados: 0,
    listosEntrega: 0,
    pendientesValidacion: 0,
    metrologiaAreaCounts: {},
    sin_certificado: 0,
    feedback_nuevos: 0
  });

  useEffect(() => {
    if (usuario) {
      // Conectar socket
      const socket = io();
      
      socket.on('nueva_cotizacion', (data) => {
        toast.info(`🔔 ¡Nueva Cotización! de ${data.empresa}`, { 
          position: "top-right",
          autoClose: 10000,
          theme: "colored"
        });
        fetchGlobalStats();
      });

      socket.on('actualizacion_cotizacion', () => {
        fetchGlobalStats();
      });
      
      socket.on('actualizacion_operativa', () => {
        fetchGlobalStats();
        window.dispatchEvent(new CustomEvent('crm:refresh'));
      });

      fetchGlobalStats();

      return () => socket.disconnect();
    }
  }, [usuario]);

  const fetchGlobalStats = async () => {
    try {
      const res = await axios.get('/api/bot/stats');
      setPendingCounts({
        cots: res.data.pendientesCotizacion || 0,
        escalados: res.data.escaladosPendientes || 0,
        listosEntrega: res.data.listosEntrega || 0,
        pendientesValidacion: res.data.pendientesValidacion || 0,
        metrologiaAreaCounts: res.data.metrologiaAreaCounts || {},
        sin_certificado: res.data.sin_certificado || 0,
        feedback_nuevos: res.data.feedback_nuevos || 0,
        correcciones: res.data.correccionesTotal || 0
      });
    } catch (e) { console.error("Error global stats", e); }
  };

  const onLogout = () => {
    localStorage.removeItem('crm_token');
    localStorage.removeItem('crm_usuario');
    setUsuario(null);
  };

  if (verificando) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${darkMode ? 'bg-[#141f0b]' : 'bg-slate-50'}`}>
        <div className={`w-8 h-8 border-2 border-opacity-30 rounded-full animate-spin ${darkMode ? 'border-[#C9EA63] border-t-[#C9EA63]' : 'border-[#008a5e] border-t-[#008a5e]'}`} />
      </div>
    );
  }

  if (!usuario) return <Login onLogin={handleLogin} darkMode={darkMode} setDarkMode={setDarkMode} />;

  return (
    <PermisosProvider usuario={usuario}>
    <Router>
      <Toaster
        position="top-center"
        theme={darkMode ? 'dark' : 'light'}
        richColors
        closeButton
        toastOptions={{ style: { fontFamily: 'inherit' } }}
      />
      <div translate="no" className={`flex h-screen overflow-hidden transition-all duration-300 ${darkMode ? 'bg-[#141f0b] text-[#F2F6F0]' : 'bg-slate-50 text-[#253916]'}`}>
        
        {/* Botón Flotante para reabrir Sidebar */}
        {sidebarOculta && (
          <button 
            onClick={() => setSidebarOculta(false)}
            className={`fixed top-4 left-4 z-[60] p-2 rounded-xl shadow-lg transition-all border animate-in slide-in-from-left duration-300 ${darkMode ? 'bg-[#C9EA63] text-[#141f0b] border-[#C9EA63]/30' : 'bg-[#008a5e] text-white border-white/20'}`}
            title="Mostrar menú"
          >
            <Menu size={24} />
          </button>
        )}

        <Sidebar 
            darkMode={darkMode} 
            toggleDarkMode={toggleDarkMode} 
            mobileOpen={mobileOpen} 
            setMobileOpen={setMobileOpen} 
            usuario={usuario}
            onLogout={onLogout}
            counts={pendingCounts}
            sidebarOculta={sidebarOculta}
            setSidebarOculta={setSidebarOculta}
          />

        <div className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ${sidebarOculta ? 'w-full' : ''}`}>
          {/* Header mobile */}
          <header className={`lg:hidden flex items-center justify-between p-4 shadow-sm z-30 ${darkMode ? 'bg-[#141f0b] border-b border-[#C9EA63]/10' : 'bg-[#F2F6F0] border-b border-[#253916]/5'}`}>
            <h2 className={`text-xl font-bold tracking-tight ${darkMode ? 'text-[#C9EA63]' : 'text-[#008a5e]'}`}>SICAMET</h2>
            <div className="flex items-center gap-1">
              <BusquedaGlobal darkMode={darkMode} />
              <NotificacionesBell darkMode={darkMode} />
              <button onClick={() => setMobileOpen(true)} className={`p-2 rounded-lg ${darkMode ? 'bg-[#253916] text-[#C9EA63]' : 'bg-white text-[#253916] shadow-sm'}`}>
                <Menu size={24} />
              </button>
            </div>
          </header>

          {/* Header desktop */}
          <header className={`hidden lg:flex items-center justify-between px-6 py-3 border-b z-30 ${darkMode ? 'bg-[#141f0b] border-[#C9EA63]/10' : 'bg-white border-slate-100 shadow-sm'}`}>
            <BusquedaGlobal darkMode={darkMode} />
            <div className="flex items-center gap-2">
              <NotificacionesBell darkMode={darkMode} />
              <button
                onClick={toggleDarkMode}
                className={`p-2 rounded-xl transition-all ${darkMode ? 'hover:bg-[#253916] text-[#F2F6F0]/60 hover:text-[#C9EA63]' : 'hover:bg-slate-100 text-slate-500 hover:text-slate-700'}`}
                title={darkMode ? 'Modo claro' : 'Modo oscuro'}
              >
                {darkMode ? <Sun size={18} /> : <Moon size={18} />}
              </button>
            </div>
          </header>

          <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-8">
            <Routes>
              <Route path="/" element={
                usuario?.rol === 'aseguramiento' || usuario?.rol === 'validacion' 
                  ? <Navigate to="/aseguramiento-dashboard" replace /> 
                  : <Dashboard darkMode={darkMode} />
              } />
              <Route path="/aseguramiento-dashboard" element={<AseguramientoDashboard darkMode={darkMode} />} />
              <Route path="/registro" element={<Registro darkMode={darkMode} />} />
              <Route path="/certificacion-agil" element={<AseguramientoCertificados darkMode={darkMode} />} />
              <Route path="/equipos" element={<ListaEquipos darkMode={darkMode} />} />
              <Route path="/kanban" element={<TableroKanban darkMode={darkMode} />} />
              <Route path="/equipos/grupo/:oc" element={<GestionGrupo darkMode={darkMode} usuario={usuario} />} />
              <Route path="/orden/:os" element={<OrdenDetalle darkMode={darkMode} />} />
              <Route path="/asignacion" element={<BandejaAsignacion darkMode={darkMode} />} />
              <Route path="/mis-envios" element={<MisEnvios darkMode={darkMode} usuario={usuario} />} />
              <Route path="/mis-decisiones" element={<MisDecisiones darkMode={darkMode} usuario={usuario} />} />
              <Route path="/metrologia" element={<MetrologiaDashboard darkMode={darkMode} usuario={usuario} />} />
              <Route path="/mi-bandeja" element={<MiBandeja darkMode={darkMode} usuario={usuario} />} />
              <Route path="/correcciones-metrologia" element={<CorreccionesMetrologia darkMode={darkMode} usuario={usuario} />} />
              <Route path="/sin-certificado" element={<SinCertificado darkMode={darkMode} usuario={usuario} />} />
              <Route path="/feedback-bot" element={<FeedbackBot darkMode={darkMode} />} />
              <Route path="/validacion" element={<Validacion darkMode={darkMode} usuario={usuario} />} />
              <Route path="/entregas" element={<Entregas darkMode={darkMode} usuario={usuario} />} />
              <Route path="/clientes" element={<Clientes darkMode={darkMode} />} />
              <Route path="/catalogo-instrumentos" element={<CatalogoInstrumentos darkMode={darkMode} />} />
              <Route path="/marcas" element={<Marcas darkMode={darkMode} />} />
              <Route path="/modelos" element={<Modelos darkMode={darkMode} />} />
              <Route path="/flujos-whatsapp" element={<FlujosWhatsapp darkMode={darkMode} usuario={usuario} />} />
              <Route path="/conversaciones" element={<Conversaciones darkMode={darkMode} usuario={usuario} />} />
              <Route path="/leads" element={<PosiblesClientes darkMode={darkMode} />} />
              <Route path="/whatsapp-qr" element={<WhatsappQR darkMode={darkMode} />} />
              <Route path="/usuarios" element={<GestionUsuarios darkMode={darkMode} />} />
            </Routes>
          </main>
        </div>
      </div>
    </Router>
    </PermisosProvider>
  );
};

export default Layout;
