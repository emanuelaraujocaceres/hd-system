import React, { useState, useRef, useEffect } from 'react';
import { ShieldCheck, Lock, AlertCircle, LogIn, Wifi, WifiOff } from 'lucide-react';
import { UserProfile } from '../../types';
import { storageService } from '../../services/storageService';
import { supabase } from '../../lib/supabase';

interface LoginModalProps {
  onLoginSuccess: (user: UserProfile) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onLoginSuccess }) => {
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [authMode, setAuthMode] = useState<'supabase' | 'local'>('supabase');
  const isOnline = navigator.onLine;

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!emailInput.trim()) return;
    if (!passwordInput.trim()) {
      setErrorMessage('Senha obrigatória');
      return;
    }

    setIsLoading(true);

    // Tentativa de login local (fallback ou modo offline)
    const tryLocalLogin = (): boolean => {
      const user = storageService.getUserByEmail(emailInput);
      if (!user) {
        setErrorMessage('Usuário não encontrado no sistema local.');
        return false;
      }
      if (user.password && user.password !== passwordInput) {
        setErrorMessage('Senha incorreta. Tente novamente.');
        return false;
      }
      const res = storageService.loginWithGoogle(emailInput, passwordInput);
      if (res.success && res.user) {
        onLoginSuccess(res.user);
        return true;
      } else {
        setErrorMessage(res.message || 'Erro ao realizar login.');
        return false;
      }
    };

    try {
      if (authMode === 'supabase' && isOnline) {
        // TENTATIVA 1: Supabase Auth (JWT real, RLS funcional)
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: emailInput.trim().toLowerCase(),
          password: passwordInput,
        });

        if (authError) {
          // Se erro de credenciais ou usuário não existe no Auth, cai no fallback
          console.warn('[Login] Supabase Auth failed, falling back to local:', authError.message);
          setAuthMode('local');
          if (tryLocalLogin()) return;
          throw authError;
        }

        if (authData.user) {
          // Buscar profile completo do system_users
          const { data: profileData, error: profileError } = await supabase
            .from('system_users')
            .select('*')
            .eq('email', emailInput.trim().toLowerCase())
            .maybeSingle();

          if (profileData && !profileError) {
            const userProfile: UserProfile = {
              id: profileData.id,
              name: profileData.name,
              email: profileData.email,
              role: profileData.role,
              avatarUrl: profileData.avatar_url || undefined,
              organizationId: profileData.organization_id,
              storeBranchId: profileData.store_branch_id,
              superadmin: profileData.superadmin || false,
              permissions: profileData.permissions || {
                pdv: true, inventory: true, crm: true,
                finance: false, dashboard: false, settings: false,
              },
              active: profileData.active,
              createdAt: profileData.created_at,
              password: undefined,
            };
            storageService.saveUserProfile(userProfile);
            setIsLoading(false);
            onLoginSuccess(userProfile);
            return;
          }

          // Profile não encontrado no system_users — fallback do auth metadata
          const meta = authData.user.user_metadata || {};
          const fallbackProfile: UserProfile = {
            id: authData.user.id,
            name: (meta.name as string) || emailInput.trim().toLowerCase().split('@')[0],
            email: emailInput.trim().toLowerCase(),
            role: (meta.role as 'admin' | 'collaborator') || 'collaborator',
            organizationId: storageService.getCurrentOrgId(),
            storeBranchId: storageService.getSelectedBranchId(),
            permissions: { pdv: true, inventory: true, crm: true, finance: false, dashboard: false, settings: false },
            active: true,
          };
          storageService.saveUserProfile(fallbackProfile);
          setIsLoading(false);
          onLoginSuccess(fallbackProfile);
          return;
        }
      }

      // TENTATIVA 2: Local storage (offline ou Supabase Auth indisponível)
      tryLocalLogin();

    } catch (err: any) {
      setIsLoading(false);
      setErrorMessage(err?.message || 'Erro ao realizar login.');
    }
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
            Entre com sua conta cadastrada
          </p>

          {/* Status badge */}
          <div className="mt-2 flex items-center justify-center gap-1.5">
            {isOnline ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] border border-emerald-500/30">
                <Wifi className="w-3 h-3" />
                Online
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] border border-amber-500/30">
                <WifiOff className="w-3 h-3" />
                Offline — modo local
              </span>
            )}
            {authMode === 'local' && isOnline && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] border border-amber-500/30">
                Login local
              </span>
            )}
          </div>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-5">
          {errorMessage && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs flex gap-2.5 items-start">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

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
              className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <LogIn className="w-4 h-4" />
              <span>{isLoading ? 'Verificando...' : 'Entrar'}</span>
            </button>
          </form>

          {!isOnline && (
            <p className="text-[10px] text-center text-slate-400">
              Você está offline. O login usará dados locais.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
