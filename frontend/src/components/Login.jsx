import React, { useState } from 'react';
import axios from 'axios';
import { Lock, Mail, Eye, EyeOff, Loader2 } from 'lucide-react';

const API = 'http://localhost:3001';

const Login = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#141f0b] via-[#1e3010] to-[#253916] relative overflow-hidden">
      {/* Fondo decorativo */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-[#C9EA63]/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-[#C9EA63]/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#C9EA63]/3 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md px-4">
        {/* Card */}
        <div className="bg-[#1a2e10]/80 backdrop-blur-xl border border-[#C9EA63]/15 rounded-3xl p-8 shadow-2xl">
          
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#C9EA63]/10 border border-[#C9EA63]/20 mb-4">
              <svg viewBox="0 0 40 40" className="w-8 h-8 text-[#C9EA63]" fill="currentColor">
                <circle cx="20" cy="20" r="18" stroke="currentColor" strokeWidth="2" fill="none" />
                <path d="M10 20 Q15 10 20 20 Q25 30 30 20" strokeWidth="2.5" stroke="currentColor" fill="none" strokeLinecap="round" />
                <circle cx="20" cy="20" r="2.5" />
              </svg>
            </div>
            <h1 className="text-3xl font-black text-[#C9EA63] tracking-tighter">SICAMET</h1>
            <p className="text-[#F2F6F0]/50 text-sm mt-1">Sistema CRM · Gestión de Calibración</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="text-[#F2F6F0]/70 text-xs font-semibold uppercase tracking-wider block mb-2">
                Correo electrónico
              </label>
              <div className="relative">
                <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#F2F6F0]/30" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="admin@sicamet.mx"
                  required
                  className="w-full bg-[#141f0b] border border-[#C9EA63]/20 rounded-xl pl-11 pr-4 py-3 text-[#F2F6F0] placeholder-[#F2F6F0]/25 text-sm outline-none focus:border-[#C9EA63]/60 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="text-[#F2F6F0]/70 text-xs font-semibold uppercase tracking-wider block mb-2">
                Contraseña
              </label>
              <div className="relative">
                <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#F2F6F0]/30" />
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••••"
                  required
                  className="w-full bg-[#141f0b] border border-[#C9EA63]/20 rounded-xl pl-11 pr-12 py-3 text-[#F2F6F0] placeholder-[#F2F6F0]/25 text-sm outline-none focus:border-[#C9EA63]/60 transition-colors"
                />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#F2F6F0]/30 hover:text-[#F2F6F0]/70 transition-colors">
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl px-4 py-3 text-rose-400 text-sm flex items-center gap-2">
                <span className="text-rose-400">⚠️</span> {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#C9EA63] hover:bg-[#b8d94d] text-[#141f0b] font-bold py-3 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed mt-2 shadow-lg shadow-[#C9EA63]/20"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Lock size={18} />}
              {loading ? 'Verificando...' : 'Iniciar Sesión'}
            </button>
          </form>

          {/* Footer */}
          <p className="text-center text-[#F2F6F0]/25 text-xs mt-6">
            SICAMET CRM v2.0 · Uso interno exclusivo
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
