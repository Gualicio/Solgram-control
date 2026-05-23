import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, X, Send, Loader2, Bot } from 'lucide-react';
import { useApp } from '../AppContext';
import { cn } from '../lib/utils';
import { auth } from '../firebase';
import ReactMarkdown from 'react-markdown';

export default function SolgramiaChat() {
  const { state, updateState } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const messages = state.chatHistory || [];

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput('');
    
    const newUserEntry = { 
      role: 'user' as const, 
      message: userMsg, 
      timestamp: new Date().toISOString() 
    };
    
    const newHistory = [...messages, newUserEntry];
    updateState({ chatHistory: newHistory });
    setIsLoading(true);

    // ----- Modo DEMO: respuesta local sin /api/chat ------------------
    if (import.meta.env.VITE_DEMO_MODE === 'true') {
      const recent = (state.dailyReports || []).slice(-3).reverse();
      const onDuty = state.personnelData?.onDutyCount ?? 0;
      const total  = state.personnelData?.totalWorkers ?? 0;
      const avance = state.scheduleData?.stats
        ? Math.round(((state.scheduleData.stats.sumActualHrs || 0) /
            Math.max(state.scheduleData.stats.sumTotalHrs || 1, 1)) * 100)
        : 0;

      const canned = [
        `Según los reportes diarios actuales, el avance físico real está en **${avance}%** (curva acumulada).\n\nLa actividad crítica esta semana es **${state.scheduleData?.tasks?.find(t => t.status === 'TK_Active')?.name || 'la tarea activa'}**.`,
        `Hoy hay **${onDuty} de ${total}** trabajadores en turno.\nLa rotación es **${state.shiftConfig?.cycleDays || 14}×${state.shiftConfig?.cycleDays || 14}** y el grupo activo está definido por la fecha base (${state.shiftConfig?.anchorDate || 'sin definir'}).`,
        recent.length
          ? `Últimos reportes diarios:\n\n${recent.map(r => `• ${r.tipo} — ${r.hours} HH (${r.status})`).join('\n')}`
          : 'Aún no hay reportes diarios registrados.',
        `Tu pregunta fue: "${userMsg}".\n\n_(Estás en la vista demo. La respuesta es generada localmente con datos del navegador, sin llamar a Gemini.)_`,
      ];
      const reply = canned[Math.floor(Math.random() * canned.length)];

      await new Promise(r => setTimeout(r, 600));
      const modelEntry = {
        role: 'model' as const,
        message: reply,
        timestamp: new Date().toISOString(),
      };
      updateState({ chatHistory: [...newHistory, modelEntry] });
      setIsLoading(false);
      return;
    }

    try {
      // Optimize context: Only send essential data to avoid hitting payload limits
      const appStateContext = {
        meta: state.syncMeta,
        schedule: state.scheduleData ? {
           name: state.scheduleData.name,
           tasksSummary: state.scheduleData.tasks.filter(t => t.status === 'TK_Active').slice(0, 50).map(t => ({
             n: t.name,
             w: t.wbsName,
             s: t.startDate,
             e: t.endDate
           })),
           primaryLabors: state.scheduleData.primaryLabors.slice(0, 30).map(l => ({
             n: l.name,
             d: l.durationHrs,
             s: l.startDate,
             f: l.endDate,
             st: l.status
           }))
        } : null,
        personnelCount: state.personnelData?.allWorkers?.length || 0,
        dailyReportsCount: state.dailyReports.length,
        shiftConfig: state.shiftConfig,
        recentReports: state.dailyReports.slice(-10),
        workerHours: state.totalReportedHours,
        licenses: state.licenses.length
      };

      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      if (!idToken) {
        throw new Error('Sesión no iniciada. Refresca la página e intenta de nuevo.');
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          message: userMsg,
          chatHistory: messages.map(m => ({ role: m.role, message: m.message })),
          appStateContext
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Error de comunicación con el servidor');
      }

      const modelEntry = { 
        role: 'model' as const, 
        message: data.text, 
        timestamp: new Date().toISOString() 
      };
      updateState({ chatHistory: [...newHistory, modelEntry] });
    } catch (err: any) {
      console.error("Chat Client Error:", err);
      const errorMessage = typeof err === 'string' ? err : (err.message || "Error desconocido");
      const errorEntry = { 
        role: 'model' as const, 
        message: `⚠️ **Error:** ${errorMessage}\n\nPor favor, verifica la conexión o contacta a soporte.`,
        timestamp: new Date().toISOString()
      };
      updateState({ chatHistory: [...newHistory, errorEntry] });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          "fixed bottom-6 right-6 p-4 rounded-full shadow-2xl transition-transform hover:scale-110 z-[100]",
          state.theme === 'dark' 
            ? "bg-[#ffb703] text-[#1a1a1a]" 
            : "bg-[#0f6fff] text-white"
        )}
      >
        <MessageSquare size={24} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "fixed bottom-24 right-6 w-[350px] max-w-[calc(100vw-3rem)] h-[500px] max-h-[calc(100vh-8rem)] rounded-2xl shadow-2xl flex flex-col overflow-hidden z-[100] border",
              state.theme === 'dark' ? "bg-[#11151c] border-[#1f2a44]" : "bg-white border-gray-200"
            )}
          >
            {/* Header */}
            <div className={cn(
              "px-4 py-3 flex items-center justify-between border-b",
              state.theme === 'dark' ? "bg-[#1a2440] border-[#1f2a44]" : "bg-gray-50 border-gray-200"
            )}>
              <div className="flex items-center gap-2">
                <div className={cn(
                  "p-1.5 rounded-lg",
                  state.theme === 'dark' ? "bg-[#ffb703] text-black" : "bg-[#0f6fff] text-white"
                )}>
                  <Bot size={18} />
                </div>
                <div>
                  <h3 className={cn("font-bold text-sm", state.theme === 'dark' ? "text-white" : "text-gray-900")}>Solgramia</h3>
                  <p className={cn("text-[10px]", state.theme === 'dark' ? "text-gray-400" : "text-gray-500")}>Asistente IA</p>
                </div>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className={cn(
                  "p-2 rounded-lg transition-colors",
                  state.theme === 'dark' ? "hover:bg-[#23315a] text-gray-400" : "hover:bg-gray-200 text-gray-500"
                )}
              >
                <X size={18} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center px-4">
                  <div className={cn(
                    "w-16 h-16 rounded-full mb-4 flex items-center justify-center",
                    state.theme === 'dark' ? "bg-[#1a2440] text-[#ffb703]" : "bg-blue-50 text-[#0f6fff]"
                  )}>
                    <Bot size={32} />
                  </div>
                  <h4 className={cn("font-bold mb-2", state.theme === 'dark' ? "text-white" : "text-gray-900")}>¡Hola! Soy Solgramia</h4>
                  <p className={cn("text-xs text-balance", state.theme === 'dark' ? "text-gray-400" : "text-gray-500")}>
                    Estoy aquí para ayudarte con la información del proyecto y responder tus consultas sobre el control de personal y carta Gantt.
                  </p>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={cn("flex", m.role === 'user' ? "justify-end" : "justify-start")}>
                  <div className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
                    m.role === 'user' 
                      ? (state.theme === 'dark' ? "bg-[#ffb703] text-black" : "bg-[#0f6fff] text-white")
                      : (state.theme === 'dark' ? "bg-[#1a2440] text-gray-200" : "bg-gray-100 text-gray-800")
                  )}>
                    {m.role === 'user' ? (
                      m.message
                    ) : (
                      <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-snug prose-p:my-1 prose-a:text-blue-500">
                        <ReactMarkdown>{m.message}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className={cn(
                    "rounded-2xl px-4 py-2.5 flex flex-col gap-2 items-center text-sm",
                    state.theme === 'dark' ? "bg-[#1a2440] text-gray-400" : "bg-gray-100 text-gray-500"
                  )}>
                    <Loader2 size={16} className="animate-spin" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className={cn(
              "p-3 border-t flex gap-2 items-end",
              state.theme === 'dark' ? "bg-[#11151c] border-[#1f2a44]" : "bg-white border-gray-200"
            )}>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Pregúntale a Solgramia..."
                className={cn(
                  "flex-1 resize-none h-[40px] max-h-[120px] rounded-xl px-3 py-2 text-sm focus:outline-none",
                  state.theme === 'dark' 
                    ? "bg-[#1a2440] text-white border border-[#1f2a44] focus:border-[#ffb703] placeholder-gray-500" 
                    : "bg-gray-50 text-gray-900 border border-gray-200 focus:border-[#0f6fff] placeholder-gray-400"
                )}
                rows={1}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className={cn(
                  "p-2 rounded-xl transition-colors shrink-0 mb-[2px]",
                  !input.trim() || isLoading
                    ? (state.theme === 'dark' ? "bg-[#1a2440] text-gray-600 cursor-not-allowed" : "bg-gray-100 text-gray-400 cursor-not-allowed")
                    : (state.theme === 'dark' ? "bg-[#ffb703] text-black hover:bg-[#ffb703]/90" : "bg-[#0f6fff] text-white hover:bg-[#0f6fff]/90")
                )}
              >
                <Send size={18} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
