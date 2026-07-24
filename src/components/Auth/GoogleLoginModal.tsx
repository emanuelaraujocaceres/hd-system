import React, { useState } from 'react';
import { ShieldCheck, UserCheck, Lock, AlertCircle, ArrowRight, Building2, CheckCircle, Sparkles, LogIn } from 'lucide-react';
import { UserProfile } from '../../types';
import { storageService } from '../../services/storageService';

interface GoogleLoginModalProps {
  onLoginSuccess: (user: UserProfile) => void;
}

export const GoogleLoginModal: React.FC<GoogleLoginModalProps> = ({ onLoginSuccess }) => {
  const [emailInput, setEmailInput] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const registeredUsers = storageService.getUsers();

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!emailInput.trim()) return;

    setIsLoading(true);
    setTimeout(() => {
      const res = storageService.loginWithGoogle(emailInput);
      setIsLoading(false);
      if (res.success && res.user) {
        onLoginSuccess(res.user);
      } else {
        setErrorMessage(res.message || 'Erro ao realizar login com o Google.');
      }
    }, 400);
  };

  const handleQuickLogin = (user: UserProfile) => {
    setErrorMessage(null);
    setIsLoading(true);
    setTimeout(() => {
      const res = storageService.loginWithGoogle(user.email);
      setIsLoading(false);
      if (res.success && res.user) {
        onLoginSuccess(res.user);
      }
    }, 300);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="w-full max-w-md bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Top Header Banner */}
        <div className="bg-gradient-to-br from-indigo-900 via-slate-900 to-black p-6 text-white text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.2),transparent_50%)] pointer-events-none" />
          
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-white/10 border border-white/20 backdrop-blur-md mb-3 shadow-inner">
            {/* Google G Logo SVG */}
            <svg className="w-6 h-6" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
          </div>

          <h2 className="text-xl font-bold tracking-tight text-white">
            Acesso Corporativo Google
          </h2>
          <p className="text-xs text-slate-300 mt-1 max-w-xs mx-auto">
            Faça login com a sua conta do Google cadastrada no sistema
          </p>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-5">
          {errorMessage && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs flex gap-2.5 items-start">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Form manual Google email login */}
          <form onSubmit={handleLoginSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Digite seu E-mail do Google:
              </label>
              <div className="relative">
                <input
                  type="email"
                  required
                  placeholder="ex: usuario@gmail.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 dark:border-[#27272a] bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/20 transition-all flex items-center justify-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              <span>{isLoading ? 'Verificando Conta...' : 'Entrar com Conta do Google'}</span>
            </button>
          </form>

          {/* Quick Demo Switcher */}
          <div className="pt-2 border-t border-slate-200 dark:border-[#27272a] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 dark:text-[#a1a1aa] uppercase tracking-wider">
                Contas Cadastradas para Teste Rápido:
              </span>
              <span className="text-[10px] text-indigo-500 font-semibold">Clique para entrar</span>
            </div>

            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {registeredUsers.map((u) => {
                const isAdmin = u.role === 'admin';
                return (
                  <button
                    key={u.id}
                    onClick={() => handleQuickLogin(u)}
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-[#09090b] hover:bg-indigo-500/10 dark:hover:bg-indigo-500/10 border border-slate-200 dark:border-[#27272a] hover:border-indigo-500/40 transition-all text-left flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={u.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'}
                        alt={u.name}
                        className="w-8 h-8 rounded-full object-cover ring-1 ring-slate-300 dark:ring-slate-700"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                          {u.name}
                        </p>
                        <p className="text-[10px] text-slate-500 dark:text-[#71717a] truncate font-mono">
                          {u.email}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border ${
                          isAdmin
                            ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20'
                            : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
                        }`}
                      >
                        {isAdmin ? 'ADMIN (TUDO)' : 'COLABORADOR'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="text-[10px] text-center text-slate-400 dark:text-[#71717a] pt-1">
            Administradores podem adicionar novos colaboradores e definir permissões de acesso em <strong className="text-slate-600 dark:text-slate-300">Configurações &gt; Equipe</strong>.
          </div>
        </div>
      </div>
    </div>
  );
};
