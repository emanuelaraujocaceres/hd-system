import React, { useState } from 'react';
import { ShieldCheck, UserCheck, Lock, AlertCircle, ArrowRight, Building2, CheckCircle, Sparkles, LogIn, KeyRound } from 'lucide-react';
import { UserProfile } from '../../types';
import { storageService } from '../../services/storageService';

interface GoogleLoginModalProps {
  onLoginSuccess: (user: UserProfile) => void;
}

export const GoogleLoginModal: React.FC<GoogleLoginModalProps> = ({ onLoginSuccess }) => {
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [quickPasswords, setQuickPasswords] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const registeredUsers = storageService.getUsers();

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!emailInput.trim()) return;

    if (!passwordInput.trim()) {
      setErrorMessage('Senha obrigatória');
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      const user = storageService.getUserByEmail(emailInput);
      if (!user) {
        setIsLoading(false);
        setErrorMessage('Usuário não encontrado.');
        return;
      }
      if (!user.password || user.password !== passwordInput) {
        setIsLoading(false);
        setErrorMessage('Senha incorreta. Tente novamente.');
        return;
      }

      const res = storageService.loginWithGoogle(emailInput);
      setIsLoading(false);
      if (res.success && res.user) {
        onLoginSuccess(res.user);
      } else {
        setErrorMessage(res.message || 'Erro ao realizar login.');
      }
    }, 400);
  };

  const handleQuickLogin = (user: UserProfile) => {
    setErrorMessage(null);
    const pwd = quickPasswords[user.id] || '';
    if (!pwd.trim()) {
      setErrorMessage(`Digite a senha para acessar como ${user.name}.`);
      return;
    }
    if (!user.password || user.password !== pwd) {
      setErrorMessage('Senha incorreta. Tente novamente.');
      return;
    }
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
            <ShieldCheck className="w-6 h-6 text-indigo-300" />
          </div>

          <h2 className="text-xl font-bold tracking-tight text-white">
            Acesso ao Sistema
          </h2>
          <p className="text-xs text-slate-300 mt-1 max-w-xs mx-auto">
            Entre com sua conta cadastrada no sistema
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

          {/* Primary: Email + Password Login Form */}
          <form onSubmit={handleLoginSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                E-mail:
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

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Senha:
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="password"
                  required
                  placeholder="Digite sua senha"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 text-xs rounded-xl border border-slate-300 dark:border-[#27272a] bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/20 transition-all flex items-center justify-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              <span>{isLoading ? 'Verificando Conta...' : 'Entrar'}</span>
            </button>
          </form>

          {/* Quick Demo Switcher */}
          <div className="pt-2 border-t border-slate-200 dark:border-[#27272a] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 dark:text-[#a1a1aa] uppercase tracking-wider">
                Contas Cadastradas para Teste Rápido:
              </span>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {registeredUsers.map((u) => {
                const isAdmin = u.role === 'admin';
                return (
                  <div
                    key={u.id}
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] transition-all"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={u.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'}
                        alt={u.name}
                        className="w-8 h-8 rounded-full object-cover ring-1 ring-slate-300 dark:ring-slate-700"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {u.name}
                        </p>
                        <p className="text-[10px] text-slate-500 dark:text-[#71717a] truncate font-mono">
                          {u.email}
                        </p>
                      </div>
                      <span
                        className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border shrink-0 ${
                          isAdmin
                            ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20'
                            : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
                        }`}
                      >
                        {isAdmin ? 'ADMIN' : 'COLABORADOR'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mt-2">
                      <div className="relative flex-1">
                        <KeyRound className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
                        <input
                          type="password"
                          placeholder="Senha"
                          value={quickPasswords[u.id] || ''}
                          onChange={(e) => setQuickPasswords(prev => ({ ...prev, [u.id]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleQuickLogin(u); }}
                          className="w-full pl-8 pr-2 py-1.5 text-[11px] rounded-lg border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleQuickLogin(u)}
                        disabled={isLoading}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold transition-all flex items-center gap-1 shrink-0"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                        Entrar
                      </button>
                    </div>
                  </div>
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
