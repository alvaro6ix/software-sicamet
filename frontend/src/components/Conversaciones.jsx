import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { MessageSquare, Phone, Search, Send, User, Bot, Plus, X, Paperclip, FileText, CheckCircle, AlertTriangle } from 'lucide-react';

const Conversaciones = ({ darkMode }) => {
  const [mensaje, setMensaje] = useState('');
  const [botActivo, setBotActivo] = useState(false);
  
  // Atajos (Cargados de localStorage para persistencia)
  const defaultAtajos = [
      { id: '1', titulo: 'Pedir O.S.', texto: 'Por favor, indícame tu número de Orden de Servicio o Cotización (ej. C26-0449).' },
      { id: '2', titulo: 'Formato Listo', texto: 'Te informamos que tu equipo ya se encuentra listo y calibrado.' },
      { id: '3', titulo: 'Aviso Demora', texto: 'Una disculpa por la demora, tu equipo tomará más tiempo del esperado debido a carga de trabajo en laboratorio.' }
  ];
  const [atajos, setAtajos] = useState(() => {
      const g = localStorage.getItem('sicamet_atajos');
      return g ? JSON.parse(g) : defaultAtajos;
  });

  const [modalAtajo, setModalAtajo] = useState(false);
  const [nuevoAtajo, setNuevoAtajo] = useState({ titulo: '', texto: '' });
  const fileInputRef = useRef(null);

  useEffect(() => {
      localStorage.setItem('sicamet_atajos', JSON.stringify(atajos));
  }, [atajos]);

  const guardarAtajo = () => {
      if(!nuevoAtajo.titulo || !nuevoAtajo.texto) return alert("Llena los campos");
      setAtajos([...atajos, { id: Date.now().toString(), ...nuevoAtajo }]);
      setModalAtajo(false);
      setNuevoAtajo({ titulo: '', texto: '' });
  };

  const eliminarAtajo = (id) => {
      setAtajos(atajos.filter(a => a.id !== id));
  };

  const enviarArchivo = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const numeroDestino = '5215512345678@c.us'; // Por ahora Mock del número en vista
      const formData = new FormData();
      formData.append('archivo', file);
      formData.append('numero', numeroDestino);

      try {
          alert('Subiendo y enviando archivo...');
          await axios.post('http://localhost:3001/api/whatsapp/send-media', formData, {
              headers: { 'Content-Type': 'multipart/form-data' }
          });
          alert('¡Archivo enviado exitosamente!');
      } catch (err) {
          console.error(err);
          alert('Error al enviar el archivo. Revisa que el bot esté conectado.');
      }
      e.target.value = null; // reset
  };

  const boxBg = darkMode ? 'bg-[#253916] border-[#C9EA63]/20' : 'bg-white border-gray-100 shadow-xl';
  const textTitle = darkMode ? 'text-[#F2F6F0]' : 'text-slate-800';
  const inputBg = darkMode ? 'bg-[#141f0b] border-[#C9EA63]/40 text-[#F2F6F0]' : 'bg-slate-50 border-gray-200 text-slate-800';

  return (
    <div className={`h-[calc(100vh-8rem)] flex flex-col md:flex-row rounded-2xl border overflow-hidden ${boxBg} relative`}>
      {/* Sidebar de Chats */}
      <div className={`w-full md:w-1/3 h-1/4 md:h-full border-b md:border-b-0 md:border-r flex flex-col shrink-0 overflow-y-auto ${darkMode ? 'border-[#C9EA63]/20' : 'border-slate-200'}`}>
        <div className="p-4 border-b border-inherit bg-inherit shrink-0">
            <h2 className={`font-bold text-lg flex items-center gap-2 mb-4 ${textTitle}`}>
                <MessageSquare size={20} className={darkMode ? 'text-[#C9EA63]' : 'text-emerald-500'} /> Chats Activos
            </h2>
            <div className={`flex items-center gap-2 w-full px-3 py-2 border rounded-xl ${inputBg}`}>
                <Search size={16} className={darkMode ? 'text-[#F2F6F0]/50' : 'text-slate-400'} />
                <input type="text" placeholder="Buscar..." className="bg-transparent border-none outline-none w-full text-sm" />
            </div>
        </div>
        <div className="flex-1 overflow-y-auto">
            <div className={`p-4 border-b cursor-pointer transition-colors ${darkMode ? 'border-[#C9EA63]/10 hover:bg-[#314a1c] bg-[#314a1c]/50' : 'border-slate-100 hover:bg-slate-50 bg-emerald-50/30'}`}>
                <div className="flex justify-between items-start mb-1">
                    <h4 className={`font-bold text-sm ${textTitle}`}>TechLab SA de CV</h4>
                    <span className="text-xs text-emerald-500 font-medium">10:42 AM</span>
                </div>
                <p className={`text-xs truncate ${darkMode ? 'text-[#F2F6F0]/70' : 'text-slate-500'}`}>Carlos: ¿Cuándo está listo mi...?</p>
            </div>
        </div>
      </div>

      {/* Área de Chat Principal */}
      <div className="flex-1 min-h-0 md:h-full flex flex-col relative">
        <div className={`p-4 border-b flex justify-between items-center ${darkMode ? 'border-[#C9EA63]/20 bg-[#141f0b]/50' : 'border-slate-200 bg-slate-50/50'}`}>
            <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${darkMode ? 'bg-[#253916] text-[#C9EA63]' : 'bg-emerald-100 text-emerald-600'}`}>
                    <User size={20} />
                </div>
                <div>
                    <h3 className={`font-bold text-sm ${textTitle}`}>TechLab SA de CV</h3>
                    <p className="text-xs text-emerald-500 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span> En línea (+52 55 1234 5678)
                    </p>
                </div>
            </div>
            <button className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-[#253916] text-[#C9EA63]' : 'hover:bg-slate-200 text-slate-600'}`}>
                <Phone size={18} />
            </button>
        </div>

        {/* Mensajes */}
        <div className={`flex-1 overflow-y-auto p-6 space-y-4 ${darkMode ? 'bg-[#141f0b]' : 'bg-[#e5ddd5]/20'}`}>
            <div className="flex justify-start">
                <div className={`max-w-[70%] p-3 rounded-2xl rounded-tl-none shadow-sm text-sm ${darkMode ? 'bg-[#253916] text-[#F2F6F0]' : 'bg-white text-slate-800'}`}>
                    Hola buen día. ¿Me podrían indicar para cuándo está listo el equipo de cotización C26-0449?
                    <div className="text-[10px] text-right mt-1 opacity-50">10:42 AM</div>
                </div>
            </div>
        </div>

        {/* Atajos Rápidos Dinámicos */}
        <div className={`p-2 flex gap-2 border-t overflow-x-auto custom-scrollbar ${darkMode ? 'border-[#C9EA63]/20 bg-[#1b2b10]' : 'border-slate-200 bg-white'}`}>
            <button onClick={() => setBotActivo(!botActivo)} className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold transition-colors shadow-sm whitespace-nowrap ${botActivo ? (darkMode ? 'bg-[#C9EA63] text-[#141f0b]' : 'bg-emerald-500 text-white') : (darkMode ? 'bg-red-900/40 text-red-400' : 'bg-red-50 text-red-600')}`}>
                <Bot size={14}/> {botActivo ? 'BOT: ENCENDIDO' : 'BOT: APAGADO'}
            </button>
            <div className={`w-px h-6 mx-1 my-auto ${darkMode ? 'bg-[#F2F6F0]/20' : 'bg-gray-300'}`}></div>

            {atajos.map(atajo => (
                <div key={atajo.id} className="group relative flex items-center whitespace-nowrap">
                    <button onClick={() => setMensaje(atajo.texto)} className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors shadow-sm ${darkMode ? 'bg-[#253916] text-[#F2F6F0] border border-[#C9EA63]/30 hover:bg-[#314a1c]' : 'bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100'}`}>
                        {atajo.titulo}
                    </button>
                    {/* Botón minúsculo para borrar atajo */}
                    <button onClick={() => eliminarAtajo(atajo.id)} className="absolute -top-1 -right-1 hidden group-hover:flex w-4 h-4 bg-red-500 text-white rounded-full items-center justify-center text-[10px] font-bold shadow-md z-10" title="Eliminar Atajo">×</button>
                </div>
            ))}
            
            <button onClick={() => setModalAtajo(true)} className={`flex items-center justify-center min-w-8 h-8 rounded-full transition-colors shadow-sm ${darkMode ? 'bg-indigo-900/50 text-indigo-300 hover:bg-indigo-900' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'}`} title="Nuevo Atajo">
                <Plus size={16}/>
            </button>
        </div>

        {/* Input */}
        <div className={`p-4 border-t ${darkMode ? 'border-[#C9EA63]/20 bg-[#253916]' : 'border-slate-200 bg-white'}`}>
            <div className={`flex items-center gap-2 w-full px-2 py-2 border rounded-full ${inputBg}`}>
                <button onClick={() => fileInputRef.current.click()} className={`p-2 rounded-full transition-colors ${darkMode ? 'text-[#C9EA63] hover:bg-[#141f0b]' : 'text-slate-500 hover:bg-slate-100'}`} title="Adjuntar Archivo (PDF, Img)">
                    <Paperclip size={20} />
                </button>
                <input type="file" className="hidden" ref={fileInputRef} onChange={enviarArchivo} />
                
                <input 
                    type="text" 
                    placeholder="Escribe un mensaje..." 
                    className="bg-transparent border-none outline-none w-full text-sm px-2"
                    value={mensaje}
                    onChange={(e) => setMensaje(e.target.value)}
                />
                
                <button className={`p-2 rounded-full transition-transform hover:scale-105 shadow-sm ${darkMode ? 'bg-[#C9EA63] text-[#141f0b]' : 'bg-emerald-600 text-white'}`}>
                    <Send size={16} className="ml-0.5" />
                </button>
            </div>
            <div className="mt-2 text-center">
                <p className={`text-[10px] ${darkMode ? 'text-[#C9EA63]/70' : 'text-slate-400'}`}>
                    {botActivo ? 'El bot está atendiendo automáticamente al usuario.' : 'El bot está ausente, conversación en modo manual.'}
                </p>
            </div>
        </div>
      </div>

      {modalAtajo && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className={`p-6 rounded-2xl w-full max-w-sm shadow-2xl ${darkMode ? 'bg-[#1b2b10] border border-[#C9EA63]/30' : 'bg-white border'}`}>
                  <h3 className={`text-xl font-bold mb-4 ${textTitle}`}>Crear Atajo Rápido</h3>
                  <div className="space-y-4">
                      <div>
                          <label className={`block text-xs font-bold mb-1 ${darkMode ? 'text-[#C9EA63]' : 'text-slate-500'}`}>Título del Botón</label>
                          <input type="text" maxLength={15} placeholder="Ej. Horarios" className={`w-full p-2 rounded-lg border text-sm ${inputBg}`} value={nuevoAtajo.titulo} onChange={e=>setNuevoAtajo({...nuevoAtajo, titulo: e.target.value})}/>
                      </div>
                      <div>
                          <label className={`block text-xs font-bold mb-1 ${darkMode ? 'text-[#C9EA63]' : 'text-slate-500'}`}>Texto a enviar</label>
                          <textarea rows={3} placeholder="Texto de la plantilla..." className={`w-full p-2 rounded-lg border text-sm resize-none ${inputBg}`} value={nuevoAtajo.texto} onChange={e=>setNuevoAtajo({...nuevoAtajo, texto: e.target.value})}/>
                      </div>
                  </div>
                  <div className="mt-6 flex justify-end gap-3">
                      <button onClick={() => setModalAtajo(false)} className={`px-4 py-2 text-sm font-bold rounded-lg ${darkMode ? 'text-[#F2F6F0] hover:bg-white/10' : 'text-slate-600 hover:bg-slate-100'}`}>Cancelar</button>
                      <button onClick={guardarAtajo} className={`px-4 py-2 text-sm font-bold rounded-lg shadow-md ${darkMode ? 'bg-[#C9EA63] text-[#141f0b]' : 'bg-emerald-600 text-white'}`}>Guardar</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default Conversaciones;
