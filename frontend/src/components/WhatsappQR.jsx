import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import { ScanLine, Smartphone, CheckCircle, RefreshCw } from 'lucide-react';

const WhatsappQR = ({ darkMode }) => {
  const [vinculado, setVinculado] = useState(false);
  const [qrCode, setQrCode] = useState('');

  useEffect(() => {
    // Estado inicial
    const checkStatus = async () => {
      try {
        const res = await axios.get('http://localhost:3001/api/whatsapp/status');
        setVinculado(res.data.connected);
        if (res.data.qr) setQrCode(res.data.qr);
      } catch (err) {
        console.error("Error al obtener estado inicial del bot");
      }
    };
    checkStatus();

    // Conexión Socket para tiempo real
    const socket = io('http://localhost:3001');

    socket.on('connect', () => {
      console.log("🟢 Conectado al servidor de Sockets");
    });

    socket.on('qr', (qr) => {
      console.log("Nuevo QR recibido por evento:", qr);
      setQrCode(qr);
      setVinculado(false);
    });

    socket.on('bot_status', (status) => {
      console.log("Estado de bot recibido:", status);
      setVinculado(status.connected);
      if (status.qr) setQrCode(status.qr);
      if (status.connected) setQrCode('');
    });

    return () => {
      socket.disconnect();
    };
  }, []);

    const [reiniciando, setReiniciando] = useState(false);

    const handleReset = async () => {
        if (!window.confirm("¿Estás seguro de que deseas cerrar sesión y reiniciar el bot? Esto borrará la sesión actual.")) return;
        setReiniciando(true);
        try {
            await axios.post('http://localhost:3001/api/whatsapp/reset');
            alert("Sesión reiniciada. Por favor espera a que se genere un nuevo código QR.");
        } catch (err) {
            alert("Error al reiniciar sesión");
        } finally {
            setReiniciando(false);
        }
    };

    const boxBg = darkMode ? 'bg-[#253916] border-[#C9EA63]/20' : 'bg-white border-gray-100 shadow-xl';
    const textTitle = darkMode ? 'text-[#F2F6F0]' : 'text-slate-800';

    return (
        <div className="w-full max-w-none space-y-8">
            <div className="text-center max-w-2xl mx-auto mb-8">
                <ScanLine className={`mx-auto mb-4 ${darkMode ? 'text-[#C9EA63]' : 'text-emerald-500'}`} size={48} />
                <h2 className={`text-3xl font-black mb-2 ${textTitle}`}>Vincular WhatsApp CRM</h2>
                <p className={`${darkMode ? 'text-[#F2F6F0]/70' : 'text-gray-500'}`}>
                    Escanea el código QR con el celular de SICAMET para conectar la línea oficial al CRM.
                </p>
            </div>

            <div className={`rounded-3xl border p-8 md:p-12 transition-colors duration-300 md:flex items-center gap-12 ${boxBg}`}>
                <div className="flex-1 space-y-6">
                    <h3 className={`text-xl font-bold flex items-center gap-2 ${darkMode ? 'text-[#C9EA63]' : 'text-emerald-700'}`}>
                        <Smartphone size={24} /> Instrucciones
                    </h3>
                    <ol className={`space-y-4 font-medium text-sm ${darkMode ? 'text-[#F2F6F0]/80' : 'text-slate-600'}`}>
                        <li className="flex gap-3">
                            <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs text-white ${darkMode ? 'bg-[#C9EA63] text-[#141f0b]' : 'bg-emerald-500'}`}>1</span>
                            Abre WhatsApp en tu teléfono.
                        </li>
                        <li className="flex gap-3">
                            <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs text-white ${darkMode ? 'bg-[#C9EA63] text-[#141f0b]' : 'bg-emerald-500'}`}>2</span>
                            Toca el Menú de los tres puntos o Configuración y selecciona Dispositivos Vinculados.
                        </li>
                        <li className="flex gap-3">
                            <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs text-white ${darkMode ? 'bg-[#C9EA63] text-[#141f0b]' : 'bg-emerald-500'}`}>3</span>
                            Toca "Vincular un dispositivo".
                        </li>
                        <li className="flex gap-3">
                            <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs text-white ${darkMode ? 'bg-[#C9EA63] text-[#141f0b]' : 'bg-emerald-500'}`}>4</span>
                            Apunta la cámara a la pantalla para escanear el código.
                        </li>
                    </ol>

                    <div className="pt-6 border-t border-inherit">
                        <button 
                            onClick={handleReset} 
                            disabled={reiniciando}
                            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all ${darkMode ? 'bg-rose-950 text-rose-300 border border-rose-800/50 hover:bg-rose-900' : 'bg-rose-50 text-rose-600 border border-rose-100 hover:bg-rose-100 shadow-sm'}`}
                        >
                            {reiniciando ? <RefreshCw className="animate-spin" size={18} /> : <RefreshCw size={18} />}
                            {vinculado ? "Cerrar Sesión / Desvincular" : "Forzar Reinicio de Motor"}
                        </button>
                    </div>
                </div>

                <div className="flex-1 mt-8 md:mt-0 flex flex-col items-center justify-center border-l border-dashed border-inherit pl-0 md:pl-12">
                    {!vinculado ? (
                        <div className="text-center relative">
                            <div className={`w-64 h-64 mx-auto rounded-3xl flex items-center justify-center relative overflow-hidden ${darkMode ? 'bg-white p-4 shadow-lg shadow-[#C9EA63]/10' : 'bg-white border-2 border-slate-100 shadow-xl'}`}>
                                {qrCode ? (
                                    <img src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qrCode)}&size=256x256`} alt="QR Code WhatsApp" className="w-full h-full" />
                                ) : (
                                    <>
                                        <img src="https://upload.wikimedia.org/wikipedia/commons/d/d0/QR_code_for_mobile_English_Wikipedia.svg" alt="Placeholder QR" className="w-full h-full opacity-10" />
                                        <div className="absolute inset-0 bg-white/80 flex flex-col items-center justify-center backdrop-blur-[2px]">
                                            <RefreshCw className="animate-spin text-emerald-500 mb-2" size={32} />
                                            <span className="font-bold text-slate-800">Generando QR...</span>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="text-center space-y-4">
                            <div className="w-32 h-32 mx-auto bg-emerald-100 rounded-full flex items-center justify-center text-emerald-500 mb-6">
                                <CheckCircle size={64} />
                            </div>
                            <h3 className={`text-2xl font-bold ${darkMode ? 'text-[#C9EA63]' : 'text-emerald-600'}`}>¡Conectado!</h3>
                            <p className={`text-sm ${darkMode ? 'text-[#F2F6F0]/70' : 'text-slate-500'}`}>WhatsApp Bot está activo y escuchando.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default WhatsappQR;
