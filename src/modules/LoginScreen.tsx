import { useState } from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, UserCircle, Lock, Mail, AlertCircle, ArrowRight, Loader2 } from 'lucide-react';
import { useApp } from '../AppContext';
import { cn } from '../lib/utils';
import { auth, db } from '../firebase';
import { signInWithEmailAndPassword, signInAnonymously } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

/**
 * Pantalla de acceso.
 *
 * - Supervisor (worker): inicia sesión anónima en Firebase. Sólo puede crear
 *   reportes y consultar; no puede modificar configuración ni borrar datos.
 * - Administrador: inicia sesión con email + contraseña (Firebase Auth).
 *   Después comprueba que su uid exista en /admins/{uid} para conceder el
 *   rol. Esa colección sólo se administra desde el backend (Admin SDK).
 */
export default function LoginScreen() {
  const { state, updateState, notify } = useApp();
  const [view, setView] = useState<'selection' | 'admin-login'>('selection');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleAdminAuth = async () => {
    setError('');

    if (!email.trim() || !password) {
      setError('Ingresa email y contraseña');
      return;
    }

    setSubmitting(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);

      // Comprobar que el usuario está en la lista de administradores.
      const adminSnap = await getDoc(doc(db, 'admins', cred.user.uid));
      if (!adminSnap.exists()) {
        await auth.signOut();
        // Volver a sesión anónima para que la app siga funcionando.
        await signInAnonymously(auth).catch(() => {});
        throw new Error('Esta cuenta no tiene permisos de administrador.');
      }

      updateState({ userRole: 'admin', activeTab: 'resumen' });
    } catch (err: any) {
      const code = err?.code || '';
      let msg = err?.message || 'Error al iniciar sesión.';
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        msg = 'Email o contraseña incorrectos.';
      } else if (code === 'auth/too-many-requests') {
        msg = 'Demasiados intentos fallidos. Intenta más tarde.';
      } else if (code === 'auth/network-request-failed') {
        msg = 'Sin conexión a la red.';
      }
      setError(msg);
      notify('error', msg);
      setTimeout(() => setError(''), 4000);
    } finally {
      setSubmitting(false);
    }
  };

  const handleWorkerEntry = async () => {
    setSubmitting(true);
    try {
      if (!auth.currentUser) {
        await signInAnonymously(auth);
      }
      updateState({ userRole: 'worker', activeTab: 'periodo' });
    } catch (err: any) {
      const msg = err?.message || 'No se pudo iniciar sesión como supervisor.';
      setError(msg);
      notify('error', msg);
      setTimeout(() => setError(''), 4000);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={cn(
      "fixed inset-0 z-[100] flex items-center justify-center p-4",
      state.theme === 'dark' ? "bg-[#0d1117]" : "bg-gray-50"
    )}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "max-w-md w-full p-8 rounded-3xl border shadow-2xl backdrop-blur-xl",
          state.theme === 'dark' ? "bg-[#161b22]/80 border-[#30363d]" : "bg-white/80 border-gray-200"
        )}
      >
        <div className="text-center mb-8">
          <div className="inline-flex p-3 rounded-2xl bg-blue-500/10 mb-4">
            <ShieldCheck className="text-blue-500" size={32} />
          </div>
          <h1 className={cn(
            "text-2xl font-black mb-2",
            state.theme === 'dark' ? "text-white" : "text-gray-900"
          )}>
            Bienvenido al Sistema
          </h1>
          <p className={cn(
            "text-sm",
            state.theme === 'dark' ? "text-gray-400" : "text-gray-500"
          )}>
            Selecciona tu perfil de acceso para continuar
          </p>
        </div>

        {view === 'selection' ? (
          <div className="space-y-4">
            <button
              onClick={handleWorkerEntry}
              disabled={submitting}
              className={cn(
                "group w-full flex items-center gap-4 p-5 rounded-2xl border transition-all text-left disabled:opacity-50",
                state.theme === 'dark'
                  ? "bg-[#21262d] border-[#30363d] hover:border-orange-500/50 hover:bg-orange-500/5"
                  : "bg-white border-gray-200 hover:border-orange-500/50 hover:bg-orange-50"
              )}
            >
              <div className="p-3 rounded-xl bg-orange-500/10 text-orange-500 group-hover:scale-110 transition-transform">
                {submitting ? <Loader2 size={24} className="animate-spin" /> : <UserCircle size={24} />}
              </div>
              <div className="flex-1">
                <h3 className={cn("text-sm font-bold uppercase", state.theme === 'dark' ? "text-white" : "text-gray-900")}>
                  Supervisor
                </h3>
                <p className="text-[10px] text-gray-500 font-medium">Ver Reportes y Actividades</p>
              </div>
              <ArrowRight size={18} className="text-gray-600 group-hover:translate-x-1 transition-transform" />
            </button>

            <button
              onClick={() => { setView('admin-login'); setError(''); }}
              disabled={submitting}
              className={cn(
                "group w-full flex items-center gap-4 p-5 rounded-2xl border transition-all text-left disabled:opacity-50",
                state.theme === 'dark'
                  ? "bg-[#21262d] border-[#30363d] hover:border-blue-500/50 hover:bg-blue-500/5"
                  : "bg-white border-gray-200 hover:border-blue-500/50 hover:bg-blue-50"
              )}
            >
              <div className="p-3 rounded-xl bg-blue-500/10 text-blue-500 group-hover:scale-110 transition-transform">
                <ShieldCheck size={24} />
              </div>
              <div className="flex-1">
                <h3 className={cn("text-sm font-bold uppercase", state.theme === 'dark' ? "text-white" : "text-gray-900")}>
                  Administrador de Obra
                </h3>
                <p className="text-[10px] text-gray-500 font-medium">Acceso total a la información</p>
              </div>
              <ArrowRight size={18} className="text-gray-600 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-500">
                <Mail size={16} />
              </div>
              <input
                type="email"
                value={email}
                autoFocus
                autoComplete="email"
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email del administrador"
                className={cn(
                  "w-full pl-11 pr-4 py-3.5 rounded-2xl border text-sm focus:outline-none transition-all",
                  state.theme === 'dark'
                    ? "bg-[#0d1117] border-[#30363d] text-white focus:border-blue-500"
                    : "bg-gray-50 border-gray-200 text-gray-900 focus:border-blue-500"
                )}
              />
            </div>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-500">
                <Lock size={16} />
              </div>
              <input
                type="password"
                value={password}
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !submitting && handleAdminAuth()}
                placeholder="Contraseña"
                className={cn(
                  "w-full pl-11 pr-4 py-3.5 rounded-2xl border text-sm focus:outline-none transition-all",
                  state.theme === 'dark'
                    ? "bg-[#0d1117] border-[#30363d] text-white focus:border-blue-500"
                    : "bg-gray-50 border-gray-200 text-gray-900 focus:border-blue-500"
                )}
              />
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center justify-center gap-2 text-red-500 text-xs font-bold"
              >
                <AlertCircle size={14} />
                {error}
              </motion.div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setView('selection'); setEmail(''); setPassword(''); setError(''); }}
                disabled={submitting}
                className={cn(
                  "flex-1 py-3.5 rounded-2xl font-bold text-xs uppercase tracking-wider border disabled:opacity-50",
                  state.theme === 'dark' ? "border-[#30363d] text-gray-400" : "border-gray-200 text-gray-500"
                )}
              >
                Atrás
              </button>
              <button
                onClick={handleAdminAuth}
                disabled={submitting}
                className="flex-3 bg-blue-600 text-white py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-blue-500/20 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting ? (<><Loader2 size={14} className="animate-spin" /> Verificando…</>) : 'Ingresar'}
              </button>
            </div>
          </div>
        )}

        <div className="mt-8 pt-6 border-t border-gray-500/10 text-center">
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
            Control de Gestión Solgram
          </p>
        </div>
      </motion.div>
    </div>
  );
}
