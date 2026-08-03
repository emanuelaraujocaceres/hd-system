import React, { useState, useRef, useEffect } from 'react';
import { Lock, AlertCircle, LogIn, Wifi, WifiOff, Eye, EyeOff, Loader2 } from 'lucide-react';
import { UserProfile } from '../../types';
import { storageService } from '../../services/storageService';
import { supabase } from '../../lib/supabase';
import { syncQueue } from '../../services/syncQueueService';
import { friendlyErrorMessage } from '../../lib/friendlyError';

interface LoginModalProps {
  onLoginSuccess: (user: UserProfile) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onLoginSuccess }) => {
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [authMode, setAuthMode] = useState<'supabase' | 'local'>('supabase');
  const [showPassword, setShowPassword] = useState(false);
  const isOnline = navigator.onLine;
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    const email = emailInput.trim();
    const password = passwordInput.trim();
    if (!email) return;
    if (!password) {
      setErrorMessage('Senha obrigatória');
      return;
    }

    setIsLoading(true);

    // Tentativa de login local (fallback ou modo offline)
    // SEGURANÇA: usuários sincronizados do cloud não possuem senha local
    // (o Supabase nunca armazena senha). Permitir login local sem exigir
    // senha permitiria acesso com QUALQUER senha digitada — validação
    // passa a exigir senha local obrigatória. Login sem senha local só é
    // possível via Supabase Auth (fluxo online).
    const tryLocalLogin = (): boolean => {
      const user = storageService.getUserByEmail(email);
      if (!user) {
        setErrorMessage('Usuário não encontrado no sistema local.');
        return false;
      }
      if (!user.active) {
        setErrorMessage(`A conta (${email}) está inativa no momento. Entre em contato com o Administrador.`);
        return false;
      }
      if (!user.password) {
        setErrorMessage('Conta sem senha local definida. Faça login online ou defina uma senha em Usuários & Permissões.');
        return false;
      }
      if (user.password !== password) {
        setErrorMessage('Senha incorreta. Tente novamente.');
        return false;
      }
      const res = storageService.loginWithGoogle(email, password);
      if (res.success && res.user) {
        // Auto-selecionar filial do usuário no login local
        if (res.user.storeBranchId) {
          storageService.setSelectedBranchId(res.user.storeBranchId);
        }
        syncQueue.clearQueue(); // Limpa operações pendentes de sessão anterior
        setIsLoading(false);
        onLoginSuccess(res.user);
        return true;
      } else {
        setErrorMessage(res.message || 'Erro ao realizar login.');
        return false;
      }
    };

    try {
      const online = navigator.onLine;
      if (authMode === 'supabase' && online) {
        // TENTATIVA 1: Supabase Auth (JWT real, RLS funcional)
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: email.toLowerCase(),
          password,
        });

        if (authError) {
          // Se erro de credenciais ou usuário não existe no Auth, cai no fallback
          console.warn('[Login] Supabase Auth failed, falling back to local:', authError.message);
          setAuthMode('local');
          if (tryLocalLogin()) { setIsLoading(false); return; }
          throw authError;
        }

        if (authData.user) {
          // Buscar perfil completo via RPC get_my_profile() — independe de RLS
          // e resolve a organização SEMPRE pelo banco (nunca herda org de outra sessão).
          const { data: profileData, error: profileError } = await supabase.rpc('get_my_profile');

          if (profileError) {
            console.error('[Login] Erro ao buscar perfil no Supabase:', profileError.message);
            setAuthMode('local');
            if (tryLocalLogin()) { setIsLoading(false); return; }
          }

          if (profileData && !profileError) {
            // Fail-closed: sem organização definida no banco, o login é BLOQUEADO.
            // (antes, caía na org padrão e gravava dados na organização errada)
            const orgId = profileData.organization_id || undefined;
            if (!orgId) {
              console.error('[Login] Usuário sem organização configurada no banco:', email);
              setErrorMessage('Sua conta ainda não está vinculada a uma organização. Fale com o administrador do sistema.');
              setIsLoading(false);
              return;
            }
            // Usuário inativo não pode entrar mesmo com Supabase Auth válido
            if (profileData.active === false) {
              console.warn('[Login] Usuário inativo bloqueado no Supabase:', email);
              setErrorMessage(`A conta (${email}) está inativa no momento. Entre em contato com o Administrador.`);
              setIsLoading(false);
              return;
            }
            const userProfile: UserProfile = {
              id: profileData.id,
              name: profileData.name,
              email: profileData.email,
              role: profileData.role,
              avatarUrl: profileData.avatar_url || undefined,
              organizationId: orgId,
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
            // Auto-selecionar filial do usuário no login
            if (userProfile.storeBranchId) {
              storageService.setSelectedBranchId(userProfile.storeBranchId);
            }
            syncQueue.clearQueue(); // Limpa fila de sessão anterior (org diferente)
            setIsLoading(false);
            onLoginSuccess(userProfile);
            return;
          }

          // Usuário autenticado no Supabase mas sem registro em system_users:
          // sem organização não é possível operar com segurança → bloqueia.
          console.error('[Login] Usuário autenticado sem registro em system_users:', email);
          setErrorMessage('Sua conta não está cadastrada no sistema de usuários. Fale com o administrador.');
          setIsLoading(false);
          return;
        }
      }

      // TENTATIVA 2: Local storage (offline ou Supabase Auth indisponível)
      if (tryLocalLogin()) { setIsLoading(false); return; }
      // Se o login local também falhou (senha errada / sem senha local),
      // resetar o loading — antes o botão ficava "Verificando..." para sempre
      // porque o fluxo saía do try sem return nem throw.
      setIsLoading(false);

    } catch (err: any) {
      setIsLoading(false);
      setErrorMessage(friendlyErrorMessage(err, 'Não foi possível fazer login. Verifique sua conexão e tente novamente.'));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="w-full max-w-md bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Top Header Banner */}
        <div className="bg-gradient-to-br from-indigo-900 via-slate-900 to-black p-12 pb-8 text-white text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.2),transparent_50%)] pointer-events-none" />
          
          <div className="flex justify-center">
            <img
              src="/logo-hd-system/logo-login.png"
              alt="HD-System"
              className="w-80 h-80 max-w-full object-contain rounded-3xl border-2 border-white/20 backdrop-blur-md mb-5 shadow-xl"
            />
          </div>

          <h2 className="text-xl font-bold tracking-tight text-white">
            Acesso ao Sistema
          </h2>
          <p className="text-xs text-slate-300 mt-2 max-w-xs mx-auto">
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
        <div className="p-6 space-y-6">
          {errorMessage && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs flex gap-2.5 items-start">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleLoginSubmit} className="space-y-5">
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
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="Digite sua senha"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className="w-full pl-9 pr-10 py-2.5 text-xs rounded-xl border border-slate-300 dark:border-[#27272a] bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Entrando...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Entrar</span>
                </>
              )}
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
