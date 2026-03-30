import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Lock, Mail, Eye, EyeOff, Loader2, Moon, Sun } from 'lucide-react';

const API = 'http://localhost:3001';

/* ─── Animated SICAMET Compass Logo ─────────────────────────────── */
const SicametLogo = ({ darkMode }) => (
  <svg
    viewBox="0 0 120 120"
    className="w-full h-full"
    xmlns="http://www.w3.org/2000/svg"
  >
    <style>{`
      @keyframes spin-slow {
        from { transform: rotate(0deg); }
        to   { transform: rotate(360deg); }
      }
      @keyframes spin-reverse {
        from { transform: rotate(0deg); }
        to   { transform: rotate(-360deg); }
      }
      @keyframes pulse-ring {
        0%,100% { opacity: 0.3; r: 44; }
        50%      { opacity: 0.7; r: 46; }
      }
      @keyframes needle-swing {
        0%   { transform: rotate(-18deg); }
        50%  { transform: rotate(18deg); }
        100% { transform: rotate(-18deg); }
      }
      @keyframes glow-dot {
        0%,100% { opacity: 1;   r: 4;   }
        50%      { opacity: 0.5; r: 5.5; }
      }
      @keyframes dash-draw {
        from { stroke-dashoffset: 283; }
        to   { stroke-dashoffset: 0; }
      }
      .ring-outer {
        transform-origin: 60px 60px;
        animation: spin-slow 12s linear infinite;
      }
      .ring-mid {
        transform-origin: 60px 60px;
        animation: spin-reverse 8s linear infinite;
      }
      .needle {
        transform-origin: 60px 60px;
        animation: needle-swing 3s ease-in-out infinite;
      }
      .pulse-ring {
        animation: pulse-ring 2.5s ease-in-out infinite;
        transform-origin: 60px 60px;
      }
      .glow-dot {
        animation: glow-dot 2s ease-in-out infinite;
      }
      .draw-arc {
        stroke-dasharray: 283;
        stroke-dashoffset: 283;
        animation: dash-draw 2s ease-out forwards;
      }
    `}</style>

    {/* Outer glow */}
    <circle cx="60" cy="60" r="56" fill="none" stroke={darkMode ? "#C9EA63" : "#10b981"} strokeWidth="0.5" opacity="0.15" />

    {/* Animated pulse ring */}
    <circle className="pulse-ring" cx="60" cy="60" r="44" fill="none" stroke={darkMode ? "#C9EA63" : "#10b981"} strokeWidth="1" opacity="0.3" />

    {/* Outer rotating dashed ring */}
    <g className="ring-outer">
      <circle cx="60" cy="60" r="50" fill="none" stroke={darkMode ? "#C9EA63" : "#10b981"} strokeWidth="1"
        strokeDasharray="4 6" opacity="0.5" />
      {/* Cardinal tick marks */}
      {[0, 90, 180, 270].map(a => {
        const rad = (a * Math.PI) / 180;
        const x1 = 60 + 46 * Math.sin(rad);
        const y1 = 60 - 46 * Math.cos(rad);
        const x2 = 60 + 52 * Math.sin(rad);
        const y2 = 60 - 52 * Math.cos(rad);
        return <line key={a} x1={x1} y1={y1} x2={x2} y2={y2} stroke={darkMode ? "#C9EA63" : "#10b981"} strokeWidth="2" strokeLinecap="round" opacity="0.8" />;
      })}
    </g>

    {/* Inner circle bg */}
    <circle cx="60" cy="60" r="28" fill={darkMode ? "#0f1a07" : "#f1f5f9"} stroke={darkMode ? "#C9EA63" : "#10b981"} strokeWidth="1" opacity="0.9" />

    {/* Animated compass needle */}
    <g className="needle">
      <polygon points="60,34 57,60 60,57 63,60" fill={darkMode ? "#C9EA63" : "#059669"} opacity="0.95" />
      <polygon points="60,86 57,60 60,63 63,60" fill={darkMode ? "#C9EA63" : "#10b981"} opacity="0.3" />
    </g>

    {/* Center dot */}
    <circle className="glow-dot" cx="60" cy="60" r="4" fill={darkMode ? "#C9EA63" : "#059669"} />
  </svg>
);

/* ─── Main Login Component ───────────────────────────────────────── */
const Login = ({ onLogin, darkMode, setDarkMode }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(t);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await axios.post(`${API}/api/auth/login`, { email, password });
      localStorage.setItem('crm_token', data.token);
      localStorage.setItem('crm_usuario', JSON.stringify(data.usuario));
      onLogin(data.usuario);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`min-h-screen flex items-center justify-center relative transition-colors duration-500 overflow-hidden px-4 ${darkMode ? 'bg-[#0d1608]' : 'bg-slate-50'}`}>

      {/* ── Floating Theme Toggle ── */}
      <button
        onClick={() => setDarkMode(!darkMode)}
        className={`absolute top-6 right-6 p-3 rounded-2xl shadow-xl transition-all duration-300 z-50 ${darkMode
            ? 'bg-[#182810] text-[#C9EA63] border border-[#C9EA63]/20 hover:bg-[#253916]'
            : 'bg-white text-emerald-600 border border-emerald-100 hover:bg-emerald-50'
          }`}
      >
        {darkMode ? <Sun size={20} /> : <Moon size={20} />}
      </button>

      {/* Grid Pattern */}
      <svg className={`absolute inset-0 w-full h-full opacity-[0.05] pointer-events-none ${darkMode ? 'text-[#C9EA63]' : 'text-emerald-900'}`} xmlns="http://www.w3.org/2000/svg">
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="0.8" />
        </pattern>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      {/* Ambient Glows */}
      {darkMode && (
        <>
          <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(201,234,99,0.06) 0%, transparent 70%)', transform: 'translate(20%,-20%)' }} />
          <div className="absolute bottom-0 left-0 w-[500px] h-[500px] rounded-full pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(201,234,99,0.04) 0%, transparent 70%)', transform: 'translate(-20%,20%)' }} />
        </>
      )}

      {/* ── Card ── */}
      <div
        className="relative w-full max-w-sm sm:max-w-md transition-all duration-700"
        style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateY(0)' : 'translateY(20px)',
        }}
      >
        {/* Glow border (Dark Mode Only) */}
        {darkMode && (
          <div className="absolute -inset-px rounded-3xl pointer-events-none"
            style={{ background: 'linear-gradient(135deg, rgba(201,234,99,0.25), rgba(201,234,99,0.05), rgba(201,234,99,0.15))', borderRadius: '1.5rem' }} />
        )}

        <div className={`relative rounded-3xl overflow-hidden transition-all duration-300 shadow-2xl border ${darkMode
            ? 'bg-[#121c0b] border-[#C9EA63]/12'
            : 'bg-white border-emerald-100'
          }`}>

          {/* Top accent bar */}
          <div className={`h-px w-full ${darkMode ? 'bg-gradient-to-r from-transparent via-[#C9EA63]/50 to-transparent' : 'bg-emerald-100'}`} />

          <div className="px-6 sm:px-10 py-10">

            {/* ── Logo Section ── */}
            <div className="flex flex-col items-center mb-8">
              <div className="relative mb-5">
                {darkMode && (
                  <div className="absolute inset-0 rounded-full blur-xl opacity-40"
                    style={{ background: 'radial-gradient(circle, #C9EA63 0%, transparent 70%)' }} />
                )}
                <div className="relative w-24 h-24 sm:w-28 sm:h-28">
                  <SicametLogo darkMode={darkMode} />
                </div>
              </div>

              <div className="text-center">
                <h1
                  className="font-black tracking-[0.25em] text-3xl sm:text-4xl leading-none"
                  style={{
                    color: darkMode ? '#C9EA63' : '#047857',
                    fontFamily: "'Bebas Neue', 'Impact', sans-serif",
                    textShadow: darkMode ? '0 0 30px rgba(201,234,99,0.4)' : 'none',
                    letterSpacing: '0.28em',
                  }}
                >
                  SICAMET
                </h1>

                {/* Divider */}
                <div className="flex items-center gap-2 my-2 justify-center">
                  <div className={`h-px flex-1 max-w-[60px] ${darkMode ? 'bg-gradient-to-r from-transparent to-[#C9EA63]/30' : 'bg-emerald-100'}`} />
                  <div className={`w-1.5 h-1.5 rounded-full ${darkMode ? 'bg-[#C9EA63]/70' : 'bg-emerald-500'}`} />
                  <div className={`h-px flex-1 max-w-[60px] ${darkMode ? 'bg-gradient-to-l from-transparent to-[#C9EA63]/30' : 'bg-emerald-100'}`} />
                </div>

                <p className={`text-[10px] sm:text-xs tracking-[0.15em] uppercase font-bold transition-colors ${darkMode ? 'text-[#F2F6F0]/40' : 'text-emerald-700/60'}`}>
                  Sistema CRM bot Sicamet
                </p>
              </div>
            </div>

            {/* ── Form ── */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="group">
                <label className={`block text-[10px] sm:text-[11px] font-bold uppercase tracking-widest mb-2 ${darkMode ? 'text-[#F2F6F0]/50' : 'text-emerald-900/60'}`}>
                  Correo electrónico
                </label>
                <div className="relative">
                  <Mail size={15} className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: darkMode ? 'rgba(201,234,99,0.4)' : '#10b981' }} />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="usuario@sicamet.mx"
                    required
                    className={`w-full text-sm rounded-xl pl-11 pr-4 py-3 outline-none transition-all duration-200 border ${darkMode
                        ? 'bg-[#0a1205]/70 border-[#C9EA63]/20 text-[#F2F6F0] focus:border-[#C9EA63]/60'
                        : 'bg-slate-50 border-emerald-100 text-slate-800 focus:border-emerald-400 focus:bg-white'
                      }`}
                  />
                </div>
              </div>

              <div className="group">
                <label className={`block text-[10px] sm:text-[11px] font-bold uppercase tracking-widest mb-2 ${darkMode ? 'text-[#F2F6F0]/50' : 'text-emerald-900/60'}`}>
                  Contraseña
                </label>
                <div className="relative">
                  <Lock size={15} className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: darkMode ? 'rgba(201,234,99,0.4)' : '#10b981' }} />
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••••"
                    required
                    className={`w-full text-sm rounded-xl pl-11 pr-12 py-3 outline-none transition-all duration-200 border ${darkMode
                        ? 'bg-[#0a1205]/70 border-[#C9EA63]/20 text-[#F2F6F0] focus:border-[#C9EA63]/60'
                        : 'bg-slate-50 border-emerald-100 text-slate-800 focus:border-emerald-400 focus:bg-white'
                      }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 transition-colors duration-200"
                    style={{ color: darkMode ? 'rgba(201,234,99,0.35)' : '#94a3b8' }}
                  >
                    {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className={`rounded-xl px-4 py-3 text-sm flex items-center gap-2.5 border ${darkMode ? 'bg-rose-500/10 border-rose-500/30 text-rose-300' : 'bg-rose-50 border-rose-200 text-rose-600'
                  }`}>
                  <span>⚠</span>
                  <span>{error}</span>
                </div>
              )}

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className={`relative w-full font-bold py-3.5 rounded-xl text-sm tracking-wider uppercase transition-all duration-300 flex items-center justify-center gap-2.5 overflow-hidden shadow-lg ${darkMode
                      ? 'bg-[#C9EA63] text-[#0d1608] hover:bg-[#d4ef70] shadow-[#C9EA63]/20'
                      : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-700/20'
                    }`}
                >
                  {loading
                    ? <><Loader2 size={16} className="animate-spin" /> Verificando...</>
                    : <><Lock size={16} /> Iniciar Sesión</>
                  }
                </button>
              </div>
            </form>
          </div>

          {/* Bottom Colored Strip */}
          <div className={`h-1.5 w-full opacity-60 ${darkMode ? 'bg-gradient-to-r from-transparent via-[#C9EA63] to-transparent' : 'bg-emerald-600'}`} />
        </div>

        {/* Side label */}

      </div>
    </div>
  );
};

export default Login;