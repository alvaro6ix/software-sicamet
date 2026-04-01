import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Lock, Mail, Eye, EyeOff, Loader2, Moon, Sun } from 'lucide-react';

const API = '';

/* ─── Animated SICAMET Robot Logo ────────────────────────────────── */
const SicametLogo = ({ darkMode }) => (
  <svg viewBox="0 0 200 200" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <style>{`
        @keyframes robot-float {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-6px); }
        }
        @keyframes caliper-sway {
          0%, 100% { transform: rotate(-10deg); }
          50%       { transform: rotate(6deg); }
        }
        @keyframes compass-rotate {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes eye-blink {
          0%, 82%, 100% { opacity: 0; }
          88%, 93%       { opacity: 1; }
        }
        @keyframes eye-glow-pulse {
          0%, 100% { opacity: 0.75; }
          50%       { opacity: 1; }
        }
        @keyframes antenna-pulse {
          0%, 100% { opacity: 0.7; transform: scale(1); }
          50%       { opacity: 1; transform: scale(1.4); }
        }
        @keyframes outer-ring-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes gold-shimmer {
          0%, 100% { opacity: 0.9; }
          50%       { opacity: 1; }
        }
        @keyframes orb-glow {
          0%, 100% { opacity: 0.7; transform: scale(1); }
          50%       { opacity: 1; transform: scale(1.15); }
        }

        .g-robot {
          transform-origin: 100px 132px;
          animation: robot-float 3.2s ease-in-out infinite;
        }
        .g-caliper {
          transform-box: fill-box;
          transform-origin: 50% 78%;
          animation: caliper-sway 2.8s ease-in-out infinite;
        }
        .g-compass {
          transform-origin: 100px 76px;
          animation: compass-rotate 10s linear infinite;
        }
        .eye-blink-cover {
          animation: eye-blink 5.5s ease-in-out infinite;
        }
        .eye-glow {
          animation: eye-glow-pulse 1.8s ease-in-out infinite;
        }
        .g-outer-dashes {
          transform-origin: 100px 100px;
          animation: outer-ring-spin 28s linear infinite;
        }
        .antenna-dot {
          transform-box: fill-box;
          transform-origin: center;
          animation: antenna-pulse 2.2s ease-in-out infinite;
        }
        .gold-ring {
          animation: gold-shimmer 3s ease-in-out infinite;
        }
        .body-orb {
          transform-box: fill-box;
          transform-origin: center;
          animation: orb-glow 2s ease-in-out infinite;
        }
      `}</style>

      {/* ── Gradients ── */}
      <linearGradient id="sg-silver" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#c0ccd8" />
        <stop offset="30%" stopColor="#f0f4f8" />
        <stop offset="70%" stopColor="#909ab0" />
        <stop offset="100%" stopColor="#bcc8d8" />
      </linearGradient>
      <linearGradient id="sg-gold" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#a87820" />
        <stop offset="30%" stopColor="#f0d050" />
        <stop offset="70%" stopColor="#c09030" />
        <stop offset="100%" stopColor="#e0b840" />
      </linearGradient>
      <linearGradient id="sg-body" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#e4eff8" />
        <stop offset="100%" stopColor="#b0c2d4" />
      </linearGradient>
      <linearGradient id="sg-head" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#f2f8fc" />
        <stop offset="100%" stopColor="#c4d4e4" />
      </linearGradient>
      <linearGradient id="sg-arm" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#dde8f2" />
        <stop offset="100%" stopColor="#a8bccc" />
      </linearGradient>
      <radialGradient id="sg-eye-blue" cx="38%" cy="38%" r="65%">
        <stop offset="0%" stopColor="#90eeff" />
        <stop offset="60%" stopColor="#20b0e0" />
        <stop offset="100%" stopColor="#0078b0" />
      </radialGradient>
      <radialGradient id="sg-smile-glow" cx="50%" cy="0%" r="80%">
        <stop offset="0%" stopColor="#40c8f0" stopOpacity="0.6" />
        <stop offset="100%" stopColor="#40c8f0" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="sg-orb" cx="38%" cy="38%" r="65%">
        <stop offset="0%" stopColor="#80d0ff" />
        <stop offset="100%" stopColor="#1860a0" />
      </radialGradient>

      {/* ── Filters ── */}
      <filter id="f-shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#000c1a" floodOpacity="0.45" />
      </filter>
      <filter id="f-glow-blue" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="2.5" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id="f-glow-sm" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="1.5" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>

    {/* ════ Outer metallic ring ════ */}
    <circle cx="100" cy="100" r="99" fill="url(#sg-silver)" />
    <circle cx="100" cy="100" r="96" fill="none" stroke="white" strokeWidth="0.5" opacity="0.4" />

    {/* ════ Two-tone background ════ */}
    {/* Top dark steel blue */}
    <path d="M 4,100 A 96,96 0 0 1 196,100 Z" fill="#192e4e" />
    {/* Bottom silver-grey */}
    <path d="M 4,100 A 96,96 0 0 0 196,100 Z" fill="#728292" />

    {/* ════ Gold accent ring ════ */}
    <circle cx="100" cy="100" r="92" fill="none" stroke="url(#sg-gold)" strokeWidth="4.5" className="gold-ring" />
    <circle cx="100" cy="100" r="89.5" fill="none" stroke="#c8a030" strokeWidth="0.7" opacity="0.4" />

    {/* ════ Rotating outer dashes ════ */}
    <g className="g-outer-dashes">
      <circle cx="100" cy="100" r="85" fill="none" stroke="#b8cce0" strokeWidth="0.6" strokeDasharray="2.5,9" opacity="0.22" />
    </g>

    {/* ════ Rotating compass rose ════ */}
    <g className="g-compass">
      {/* Cardinal lines */}
      <line x1="100" y1="28" x2="100" y2="100" stroke="#c8d8ea" strokeWidth="0.9" opacity="0.45" />
      <line x1="28" y1="76" x2="172" y2="76" stroke="#c8d8ea" strokeWidth="0.9" opacity="0.45" />
      {/* Intercardinal lines */}
      <line x1="52" y1="28" x2="148" y2="124" stroke="#c8d8ea" strokeWidth="0.5" opacity="0.25" />
      <line x1="148" y1="28" x2="52" y2="124" stroke="#c8d8ea" strokeWidth="0.5" opacity="0.25" />
      {/* North arrow (prominent) */}
      <polygon points="100,28 96,52 100,46 104,52" fill="#e0ecf8" opacity="0.88" />
      {/* Other cardinal arrows (smaller) */}
      <polygon points="100,124 97,108 100,112 103,108" fill="#c0d4e8" opacity="0.45" />
      <polygon points="172,76 154,72.5 158,76 154,79.5" fill="#c0d4e8" opacity="0.45" />
      <polygon points="28,76  46,72.5  42,76  46,79.5" fill="#c0d4e8" opacity="0.45" />
      {/* Compass circles */}
      <circle cx="100" cy="76" r="30" fill="none" stroke="#90b0d0" strokeWidth="0.7" opacity="0.38" />
      <circle cx="100" cy="76" r="17" fill="none" stroke="#90b0d0" strokeWidth="0.5" opacity="0.32" />
      <circle cx="100" cy="76" r="6" fill="none" stroke="#90b0d0" strokeWidth="0.5" opacity="0.45" />
    </g>

    {/* ════ Radar / target ring under robot ════ */}
    <ellipse cx="100" cy="170" rx="36" ry="7" fill="#0c1620" opacity="0.65" />
    <circle cx="100" cy="162" r="30" fill="none" stroke="#3860a8" strokeWidth="0.8" opacity="0.32" />
    <circle cx="100" cy="162" r="18" fill="none" stroke="#3860a8" strokeWidth="0.6" opacity="0.28" />
    <circle cx="100" cy="162" r="8" fill="none" stroke="#3860a8" strokeWidth="0.5" opacity="0.28" />
    <line x1="70" y1="162" x2="130" y2="162" stroke="#3860a8" strokeWidth="0.5" opacity="0.22" />
    <line x1="100" y1="132" x2="100" y2="192" stroke="#3860a8" strokeWidth="0.5" opacity="0.22" />

    {/* ════ ROBOT GROUP (floating) ════ */}
    <g className="g-robot" filter="url(#f-shadow)">

      {/* ── Legs ── */}
      <rect x="85.5" y="148" width="11.5" height="20" rx="4.5" fill="url(#sg-body)" />
      <rect x="103" y="148" width="11.5" height="20" rx="4.5" fill="url(#sg-body)" />
      {/* Knee caps */}
      <circle cx="91.5" cy="150" r="4" fill="#b4c4d4" />
      <circle cx="108.5" cy="150" r="4" fill="#b4c4d4" />
      {/* Feet */}
      <rect x="82" y="165" width="17" height="7.5" rx="3.5" fill="#9aaaba" />
      <rect x="101" y="165" width="17" height="7.5" rx="3.5" fill="#9aaaba" />
      {/* Foot highlight */}
      <rect x="83" y="166" width="7" height="2.5" rx="1.2" fill="white" opacity="0.25" />
      <rect x="102" y="166" width="7" height="2.5" rx="1.2" fill="white" opacity="0.25" />

      {/* ── Body / Torso ── */}
      <rect x="78" y="110" width="44" height="40" rx="9" fill="url(#sg-body)" />
      {/* Body panel */}
      <rect x="83" y="116" width="34" height="24" rx="5.5" fill="#b0c2d2" opacity="0.5" />
      {/* Panel buttons */}
      <rect x="86" y="119" width="13" height="7.5" rx="3" fill="#5888b0" opacity="0.75" />
      <rect x="101" y="119" width="13" height="7.5" rx="3" fill="#5888b0" opacity="0.75" />
      {/* Button glint */}
      <rect x="87" y="120" width="5" height="2" rx="1" fill="white" opacity="0.2" />
      <rect x="102" y="120" width="5" height="2" rx="1" fill="white" opacity="0.2" />
      {/* Center orb */}
      <circle cx="100" cy="135" r="5.5" fill="url(#sg-orb)" className="body-orb" filter="url(#f-glow-sm)" />
      <circle cx="98.5" cy="133.5" r="1.8" fill="white" opacity="0.4" />

      {/* Body highlight (top sheen) */}
      <rect x="82" y="112" width="20" height="4" rx="2" fill="white" opacity="0.18" />

      {/* ── Shoulder joints ── */}
      <circle cx="78" cy="117" r="6.5" fill="#b4c4d4" />
      <circle cx="122" cy="117" r="6.5" fill="#b4c4d4" />
      <circle cx="78" cy="117" r="3" fill="#d4e4f0" opacity="0.6" />
      <circle cx="122" cy="117" r="3" fill="#d4e4f0" opacity="0.6" />

      {/* ── Left arm (relaxed) ── */}
      <rect x="66" y="113" width="12" height="27" rx="6" fill="url(#sg-arm)" />
      {/* Left hand */}
      <ellipse cx="72" cy="142" rx="7.5" ry="5.5" fill="#a0b2c4" />
      <ellipse cx="70" cy="140" rx="2.5" ry="1.5" fill="white" opacity="0.2" />

      {/* ── Right arm + caliper (raised & animated) ── */}
      <g className="g-caliper">
        {/* Upper arm (angled up) */}
        <rect x="119" y="98" width="12" height="24" rx="6" fill="url(#sg-arm)" transform="rotate(-38,125,110)" />
        {/* Forearm */}
        <rect x="127" y="85" width="11.5" height="21" rx="5.5" fill="url(#sg-arm)" transform="rotate(-18,132.5,95.5)" />
        {/* Hand */}
        <ellipse cx="136" cy="81" rx="7.5" ry="5.5" fill="#9aaaba" transform="rotate(-12,136,81)" />
        <ellipse cx="134" cy="79" rx="2.5" ry="1.5" fill="white" opacity="0.2" />

        {/* ── Caliper instrument ── */}
        <g transform="rotate(-28, 136, 70) translate(120, 36)">
          {/* Main rail */}
          <rect x="7" y="0" width="5.5" height="52" rx="2" fill="#a8b4c0" />
          <rect x="8.5" y="0" width="2" height="52" rx="1" fill="#d0dae4" opacity="0.4" />

          {/* Upper fixed jaw */}
          <rect x="12.5" y="4" width="24" height="4.5" rx="1.5" fill="#8898a8" />
          <rect x="12.5" y="10" width="19" height="3.5" rx="1.2" fill="#8898a8" />

          {/* Sliding lower jaw */}
          <rect x="12.5" y="34" width="21" height="4.5" rx="1.5" fill="#8898a8" />
          <rect x="12.5" y="39" width="15" height="3" rx="1.2" fill="#8898a8" opacity="0.7" />

          {/* Gauge dial housing */}
          <circle cx="21" cy="3" r="14" fill="#1a2c3c" stroke="#607888" strokeWidth="2" />
          <circle cx="21" cy="3" r="11" fill="#0e1c28" />
          <circle cx="21" cy="3" r="10" fill="none" stroke="#3a5060" strokeWidth="0.5" />

          {/* Gauge tick marks */}
          {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((angle, i) => {
            const rad = ((angle - 90) * Math.PI) / 180;
            const isMajor = i % 3 === 0;
            const r1 = isMajor ? 6.5 : 8;
            const r2 = 10.5;
            return (
              <line
                key={angle}
                x1={21 + r1 * Math.cos(rad)} y1={3 + r1 * Math.sin(rad)}
                x2={21 + r2 * Math.cos(rad)} y2={3 + r2 * Math.sin(rad)}
                stroke="#b0c8d8"
                strokeWidth={isMajor ? "1.2" : "0.6"}
                opacity={isMajor ? "0.85" : "0.55"}
              />
            );
          })}
          {/* Needle */}
          <line x1="21" y1="3" x2="13.5" y2="-5.5" stroke="#ff5030" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="21" cy="3" r="2" fill="#9ab0c0" />

          {/* Tip pointer (bottom) */}
          <polygon points="9.5,52 7,57 12.5,57" fill="#b8c4d0" />
        </g>
      </g>

      {/* ── Head ── */}
      <rect x="81" y="79" width="38" height="33" rx="11" fill="url(#sg-head)" />
      {/* Head top sheen */}
      <rect x="84" y="82" width="16" height="3.5" rx="1.7" fill="white" opacity="0.55" />
      {/* Side ear "ports" */}
      <rect x="78.5" y="88" width="3.5" height="11" rx="1.7" fill="#9aaabe" />
      <rect x="118" y="88" width="3.5" height="11" rx="1.7" fill="#9aaabe" />
      <rect x="79" y="90" width="2" height="3" rx="1" fill="#d0e0f0" opacity="0.5" />
      <rect x="119" y="90" width="2" height="3" rx="1" fill="#d0e0f0" opacity="0.5" />

      {/* ── Visor / Face screen ── */}
      <rect x="85" y="85" width="30" height="22" rx="7" fill="#071218" />
      {/* Visor inner bezel */}
      <rect x="86.5" y="86.5" width="27" height="19" rx="6" fill="none" stroke="#1a3040" strokeWidth="0.8" />
      {/* Visor top reflection */}
      <rect x="88" y="87.5" width="11" height="3" rx="1.5" fill="white" opacity="0.07" />

      {/* ── Eyes (glowing blue) ── */}
      <g className="eye-glow" filter="url(#f-glow-blue)">
        <ellipse cx="95" cy="96" rx="5.5" ry="5" fill="url(#sg-eye-blue)" />
        <ellipse cx="105" cy="96" rx="5.5" ry="5" fill="url(#sg-eye-blue)" />
      </g>
      {/* Eye inner sparkle */}
      <ellipse cx="93" cy="94" rx="1.8" ry="1.2" fill="white" opacity="0.65" />
      <ellipse cx="103" cy="94" rx="1.8" ry="1.2" fill="white" opacity="0.65" />
      <circle cx="97" cy="97.5" r="1" fill="white" opacity="0.3" />
      <circle cx="107" cy="97.5" r="1" fill="white" opacity="0.3" />

      {/* ── Blink overlay (covers eyes on blink animation) ── */}
      <rect
        className="eye-blink-cover"
        x="85.5" y="89" width="29" height="14"
        rx="5" fill="#071218" opacity="0"
      />

      {/* ── Smile ── */}
      <ellipse cx="100" cy="104" rx="12" ry="5" fill="url(#sg-smile-glow)" />
      <path
        d="M 92,103 Q 100,110 108,103"
        stroke="#28c0e8" strokeWidth="2.2" fill="none" strokeLinecap="round"
        opacity="0.92"
      />
      {/* Smile glow line */}
      <path
        d="M 93,103 Q 100,109 107,103"
        stroke="#80e8ff" strokeWidth="0.7" fill="none" strokeLinecap="round"
        opacity="0.45"
      />

      {/* ── Antenna ── */}
      <line x1="100" y1="79" x2="100" y2="68" stroke="#b0bece" strokeWidth="2.8" strokeLinecap="round" />
      <circle cx="100" cy="65" r="5" fill="#c4d4e4" stroke="#8898aa" strokeWidth="1.2" />
      <circle
        className="antenna-dot"
        cx="100" cy="65" r="3"
        fill="#48d0ff"
        filter="url(#f-glow-sm)"
      />
    </g>

    {/* ════ SICAMET text (solid, inside lower badge) ════ */}
    <text
      x="100" y="188"
      textAnchor="middle"
      fontFamily="'Impact', 'Arial Black', 'Franklin Gothic Heavy', sans-serif"
      fontSize="23"
      fontWeight="900"
      fill="#16284a"
      letterSpacing="4"
    >
      SICAMET
    </text>

    {/* ════ Circular arc text – full company name ════ */}
    <path id="top-arc" d="M 20,100 A 80,80 0 0 1 180,100" fill="none" />
    <text fontSize="5.2" fill="#c0d0e4" opacity="0.72" letterSpacing="1.2">
      <textPath href="#top-arc" startOffset="4%">
        SISTEMAS INTEGRALES DE CALIBRACIÓN Y ASEGURAMIENTO METROLÓGICO
      </textPath>
    </text>

    <path id="bot-arc" d="M 22,106 A 78,78 0 0 0 178,106" fill="none" />
    <text fontSize="5.2" fill="#d0dce8" opacity="0.65" letterSpacing="1.2">
      <textPath href="#bot-arc" startOffset="28%">
        S.A. DE C.V.
      </textPath>
    </text>

    {/* ════ Final chrome ring highlight ════ */}
    <circle cx="100" cy="100" r="97.5" fill="none" stroke="#e4eef8" strokeWidth="0.7" opacity="0.5" />
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
                  <div className="absolute inset-0 rounded-full blur-xl opacity-35"
                    style={{ background: 'radial-gradient(circle, #C9EA63 0%, transparent 70%)' }} />
                )}
                <div className="relative w-28 h-28 sm:w-32 sm:h-32">
                  <SicametLogo darkMode={darkMode} />
                </div>
              </div>

              <div className="text-center">
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
                <div className={`rounded-xl px-4 py-3 text-sm flex items-center gap-2.5 border ${darkMode
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  : 'bg-rose-50 border-rose-200 text-rose-600'
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
      </div>
    </div>
  );
};

export default Login;