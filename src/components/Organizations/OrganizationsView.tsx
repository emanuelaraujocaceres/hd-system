import React, { useState, useEffect, useCallback } from 'react';
import {
  Building2, Plus, ChevronDown, ChevronRight, Users, MapPin,
  ShieldCheck, Loader2, Copy, Check, X, Mail, UserPlus, LogIn,
  Store, AlertCircle, ArrowRightFromLine,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { callServerApi } from '../../lib/serverApi';
import { storageService } from '../../services/storageService';
import { UserProfile } from '../../types';
import { useToast } from '../shared/Toast';

/* ------------------------------------------------------------------ */
/*  Helpers de API                                                     */
/* ------------------------------------------------------------------ */

/** Chama uma rota da API do servidor Express / Cloudflare Pages Functions */

interface CreateUserResult {
  success: boolean; message: string; user_id?: string; password?: string;
}

interface CreateOrgResult {
  success: boolean; message: string; org_id?: string; admin_id?: string; password?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

/** O Supabase client retorna JSON de RPC como string ou já parseado.
 *  Esta função garante que o resultado seja um array. */
function parseJsonResponse<T>(raw: any): T[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as T[];
  if (typeof raw === 'string') {
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; }
    catch { return []; }
  }
  return [];
}

/* ------------------------------------------------------------------ */
/*  Tipos                                                               */
/* ------------------------------------------------------------------ */

interface OrgRow {
  id: string;
  name: string;
  created_at: string;
  branch_count: number;
  user_count: number;
}

interface BranchRow {
  id: string;
  name: string;
  code: string;
  city: string | null;
  state: string | null;
  is_headquarters: boolean;
  active: boolean;
  organization_id?: string;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
}

/* ================================================================== */
/*  OrganizationsView                                                   */
/* ================================================================== */

interface Props {
  user: UserProfile;
  /** Called when superadmin selects an org to view */
  onEnterOrg?: (orgId: string) => void;
}

export const OrganizationsView: React.FC<Props> = ({ user, onEnterOrg }) => {
  /* ---------- guards ---------- */
  if (!user.superadmin) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <div className="text-center space-y-3 max-w-sm mx-auto bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-3xl p-8 shadow-xl">
          <ShieldCheck className="w-12 h-12 text-rose-500 mx-auto" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Acesso Restrito</h2>
          <p className="text-xs text-slate-500 dark:text-[#a1a1aa]">
            Apenas o superadmin (desenvolvedor) pode gerenciar organizações.
          </p>
        </div>
      </div>
    );
  }

  return <OrganizationsManager onEnterOrg={onEnterOrg} />;
};

/* ================================================================== */
/*  OrganizationsManager (inner component, no guard check)              */
/* ================================================================== */

const OrganizationsManager: React.FC<{ onEnterOrg?: (orgId: string) => void }> = ({ onEnterOrg }) => {
  const { addToast } = useToast();
  /* ---------- state ---------- */
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [branchesMap, setBranchesMap] = useState<Record<string, BranchRow[]>>({});
  const [usersMap, setUsersMap] = useState<Record<string, UserRow[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal de criação
  const [showNewOrg, setShowNewOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdResult, setCreatedResult] = useState<{
    name: string; adminEmail: string; adminPassword: string; orgId: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Modal de adicionar admin a filial
  const [showAddUser, setShowAddUser] = useState(false);
  const [addUserOrgId, setAddUserOrgId] = useState('');
  const [addUserBranchId, setAddUserBranchId] = useState('');
  const [addUserName, setAddUserName] = useState('');
  const [addUserEmail, setAddUserEmail] = useState('');
  const [addingUser, setAddingUser] = useState(false);
  const [addUserResult, setAddUserResult] = useState<{ success: boolean; message: string } | null>(null);

  /* ---------- fetch orgs (RPC JSON → imune a type mismatch) ---------- */
  const fetchOrgs = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data, error: err } = await supabase.rpc('admin_fetch_organizations');
      if (err) throw new Error(err.message);
      setOrgs(parseJsonResponse<OrgRow>(data));
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar organizações');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchOrgs(); }, [fetchOrgs]);

  /* ---------- expandir ---------- */
  const toggleExpand = async (orgId: string) => {
    if (expanded.has(orgId)) {
      setExpanded((prev) => { const n = new Set(prev); n.delete(orgId); return n; });
      return;
    }
    setExpanded((prev) => { const n = new Set(prev); n.add(orgId); return n; });
    try {
      if (!branchesMap[orgId]) {
        const { data, error: brErr } = await supabase.rpc('admin_fetch_branches', { p_org_id: orgId });
        if (brErr) throw new Error(brErr.message);
        setBranchesMap((prev) => ({ ...prev, [orgId]: parseJsonResponse<BranchRow>(data) }));
      }
      if (!usersMap[orgId]) {
        const { data, error: usrErr } = await supabase.rpc('admin_fetch_users', { p_org_id: orgId });
        if (usrErr) throw new Error(usrErr.message);
        setUsersMap((prev) => ({ ...prev, [orgId]: parseJsonResponse<UserRow>(data) }));
      }
    } catch (e: any) {
      addToast('error', e?.message || 'Erro ao carregar dados da organização.');
    }
  };

  /* ---------- criar org ---------- */
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim() || !newAdminName.trim() || !newAdminEmail.trim()) {
      addToast('error', 'Preencha todos os campos obrigatórios.');
      return;
    }
    setCreating(true); setCreatedResult(null);
    try {
      // Tenta servidor primeiro (cria Auth + system_users)
      const { data, error } = await callServerApi<CreateOrgResult>('/api/admin/create-organization', {
        org_name: newOrgName.trim(), admin_name: newAdminName.trim(), admin_email: newAdminEmail.trim().toLowerCase(),
      });
      if (data?.success) {
        setCreatedResult({ name: newOrgName.trim(), adminEmail: newAdminEmail.trim().toLowerCase(), adminPassword: data.password!, orgId: data.org_id! });
        fetchOrgs(); return;
      }
      throw new Error(
        'Servidor não disponível. Para criar organizações, inicie o servidor Express:\n' +
        '  > npx tsx server.ts\n' +
        'O servidor cria a conta Supabase Auth + registro no banco corretamente.'
      );
    } catch (e: any) { setError(e.message); }
    finally { setCreating(false); }
  };

  /* ---------- adicionar admin ---------- */
  const openAddUser = (orgId: string, branchId: string) => {
    setAddUserOrgId(orgId); setAddUserBranchId(branchId);
    setAddUserName(''); setAddUserEmail(''); setAddUserResult(null);
    setShowAddUser(true);
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addUserName.trim() || !addUserEmail.trim()) {
      addToast('error', 'Preencha nome e e-mail do administrador.');
      return;
    }
    setAddingUser(true); setAddUserResult(null);
    try {
      // Tenta servidor primeiro (cria Auth + system_users)
      const { data, error } = await callServerApi<CreateUserResult>('/api/admin/create-user', {
        name: addUserName.trim(), email: addUserEmail.trim().toLowerCase(),
        role: 'admin', organization_id: addUserOrgId, store_branch_id: addUserBranchId,
      });
      if (data?.success) {
        setAddUserResult({ success: true, message: `Usuário criado! Senha: ${data.password}. Ele pode logar em qualquer dispositivo.` });
        const { data: users } = await supabase.rpc('admin_fetch_users', { p_org_id: addUserOrgId });
        setUsersMap((prev) => ({ ...prev, [addUserOrgId]: parseJsonResponse<UserRow>(users) }));
        return;
      }
      throw new Error(
        'Servidor não disponível. Para adicionar usuários, inicie o servidor Express:\n' +
        '  > npx tsx server.ts\n' +
        'O servidor cria a conta Supabase Auth + registro no banco corretamente.'
      );
    } catch (e: any) { setAddUserResult({ success: false, message: e.message }); }
    finally { setAddingUser(false); }
  };

  const copyText = async (t: string) => {
    try { await navigator.clipboard.writeText(t); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { /* */ }
  };

  /* ---------- viewing org state ---------- */
  const viewingOrgId = localStorage.getItem('hd_system_viewing_org');
  const viewingOrgName = viewingOrgId ? orgs.find(o => o.id === viewingOrgId)?.name : null;

  /* ---------- render ---------- */

  /* ---- Botão Nova Empresa ---- */
  const HeaderSection = () => (
    <div className="flex items-center justify-between gap-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
          <Building2 className="w-6 h-6 text-indigo-500" />
          Organizações
        </h1>
        <p className="text-xs text-slate-500 dark:text-[#a1a1aa] mt-1">
          Gerencie todas as empresas do sistema
        </p>
      </div>
      <button
        onClick={() => { setShowNewOrg(true); setCreatedResult(null); }}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/20 transition-all min-h-[44px]"
      >
        <Plus className="w-4 h-4" />
        <span className="hidden sm:inline">Nova Empresa</span>
      </button>
    </div>
  );

  /* ---- Card de Organização ---- */
  const OrgCard = ({ org }: { org: OrgRow }) => {
    const handleEnterOrg = () => {
      storageService.superadminSetViewingOrg(org.id);
      onEnterOrg?.(org.id);
    };
    const isExpanded = expanded.has(org.id);
    const branches = branchesMap[org.id];
    const users = usersMap[org.id];

    return (
      <div className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
        {/* Header do card */}
        <div className="flex items-stretch">
          <button
            onClick={() => toggleExpand(org.id)}
            className="flex-1 flex items-center justify-between p-5 text-left hover:bg-slate-50 dark:hover:bg-[#09090b]/40 transition-colors gap-4 min-w-0"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 shadow-md">
                <Building2 className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">{org.name}</h3>
                <p className="text-[11px] text-slate-500 dark:text-[#71717a] mt-0.5">
                  Criada em {new Date(org.created_at).toLocaleDateString('pt-BR')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <div className="hidden sm:flex items-center gap-3 text-xs text-slate-500 dark:text-[#71717a]">
                <span className="flex items-center gap-1"><Store className="w-3.5 h-3.5" />{org.branch_count} filiais</span>
                <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{org.user_count} usuários</span>
              </div>
              {isExpanded ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
            </div>
          </button>
          {/* Botão Entrar — superadmin visualiza dados desta org */}
          <button
            onClick={handleEnterOrg}
            className="flex items-center gap-1.5 px-4 py-2 m-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all shrink-0 shadow-md shadow-indigo-600/20"
            title="Visualizar dados desta organização"
          >
            <ArrowRightFromLine className="w-3.5 h-3.5" />
            <span>Entrar</span>
          </button>
        </div>

        {/* Expandido: filiais + usuários */}
        {isExpanded && (
          <div className="px-5 pb-5 space-y-5 border-t border-slate-100 dark:border-[#27272a] pt-4">
            {/* Filiais */}
            <div>
              <h4 className="text-xs font-bold text-slate-500 dark:text-[#71717a] uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" /> Filiais
              </h4>
              {!branches ? (
                <div className="flex items-center gap-2 text-xs text-slate-400"><Loader2 className="w-3 h-3 animate-spin" />Carregando...</div>
              ) : branches.length === 0 ? (
                <p className="text-xs text-slate-400 dark:text-[#52525b]">Nenhuma filial cadastrada.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {branches.map((b) => (
                    <div key={b.id} className="p-4 rounded-2xl bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{b.name}</p>
                          <p className="text-[10px] text-slate-400 dark:text-[#52525b] mt-0.5">
                            {b.code} {b.city ? `• ${b.city}/${b.state || ''}` : ''}
                          </p>
                        </div>
                        {b.is_headquarters && (
                          <span className="shrink-0 px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[9px] font-bold border border-indigo-500/20">MATRIZ</span>
                        )}
                      </div>
                      {!b.active && <span className="mt-2 inline-block px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[9px] font-bold">INATIVA</span>}

                      {/* Ações da filial */}
                      <div className="mt-3 flex items-center gap-2 pt-3 border-t border-slate-200 dark:border-[#27272a]">
                        <button
                          onClick={() => openAddUser(org.id, b.id)}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] transition-all"
                        >
                          <UserPlus className="w-3 h-3" />
                          <span>Add Admin</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Usuários */}
            <div>
              <h4 className="text-xs font-bold text-slate-500 dark:text-[#71717a] uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" /> Usuários
              </h4>
              {!users ? (
                <div className="flex items-center gap-2 text-xs text-slate-400"><Loader2 className="w-3 h-3 animate-spin" />Carregando...</div>
              ) : users.length === 0 ? (
                <p className="text-xs text-slate-400 dark:text-[#52525b]">Nenhum usuário cadastrado.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[#27272a]">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-[#09090b]/40 text-slate-400 dark:text-[#52525b] uppercase tracking-wider font-bold">
                        <th className="px-4 py-2.5 text-left">Nome</th>
                        <th className="px-4 py-2.5 text-left">E-mail</th>
                        <th className="px-4 py-2.5 text-left">Perfil</th>
                        <th className="px-4 py-2.5 text-center">Ativo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-[#27272a]">
                      {users.map((u) => (
                        <tr key={u.id} className="text-slate-700 dark:text-[#a1a1aa]">
                          <td className="px-4 py-2.5 font-medium">{u.name}</td>
                          <td className="px-4 py-2.5 text-slate-400">{u.email}</td>
                          <td className="px-4 py-2.5">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              u.role === 'admin' ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' : 'bg-slate-500/10 text-slate-600 dark:text-slate-400'
                            }`}>{u.role === 'admin' ? 'Admin' : u.role}</span>
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${u.active ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'}`}>
                              {u.active ? 'SIM' : 'NÃO'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  /* ================================================================ */
  /*  JSX Principal                                                    */
  /* ================================================================ */
  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">
      <HeaderSection />

      {error && (
        <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs flex items-start gap-2.5">
          <X className="w-4 h-4 shrink-0 mt-0.5 cursor-pointer" onClick={() => setError(null)} />
          <span>{error}</span>
        </div>
      )}

      {/* Barra indicadora: superadmin visualizando uma org específica */}
      {viewingOrgId && (
        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/30">
          <div className="flex items-center gap-2.5 text-xs text-indigo-700 dark:text-indigo-300">
            <ArrowRightFromLine className="w-4 h-4" />
            <span>Visualizando dados de: <strong className="font-bold">{viewingOrgName || viewingOrgId}</strong></span>
          </div>
          <button
            onClick={() => storageService.superadminSetViewingOrg(null)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] transition-all"
          >
            <X className="w-3 h-3" />
            <span>Sair</span>
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
          <span className="ml-3 text-xs text-slate-500">Carregando organizações...</span>
        </div>
      ) : orgs.length === 0 ? (
        <div className="py-20 text-center text-xs text-slate-400 dark:text-[#52525b]">
          Nenhuma organização encontrada.
        </div>
      ) : (
        <div className="space-y-4">
          {orgs.map((org) => <OrgCard key={org.id} org={org} />)}
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: Nova Organização                                       */}
      {/* ============================================================ */}
      {showNewOrg && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[10vh] bg-slate-950/60 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-lg bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-gradient-to-br from-indigo-900 via-slate-900 to-black p-5 text-white relative overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.2),transparent_50%)] pointer-events-none" />
              <div className="flex items-center justify-between relative z-10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center"><Plus className="w-5 h-5 text-indigo-300" /></div>
                  <div><h2 className="text-lg font-bold">Nova Organização</h2><p className="text-xs text-slate-300">Criar uma nova empresa independente</p></div>
                </div>
                <button onClick={() => setShowNewOrg(false)} className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 transition-colors"><X className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="p-5 space-y-4">
              {createdResult ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
                    <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mb-1">✅ Organização criada com sucesso!</p>
                    <p className="text-xs text-slate-500 dark:text-[#a1a1aa]">A empresa <strong className="text-slate-700 dark:text-white">{createdResult.name}</strong> está pronta.</p>
                  </div>
                  <div className="space-y-2.5 bg-slate-50 dark:bg-[#09090b] rounded-2xl p-4 border border-slate-200 dark:border-[#27272a]">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-500 dark:text-[#71717a]">E-mail do admin:</span>
                      <span className="text-xs font-mono font-bold text-slate-900 dark:text-white">{createdResult.adminEmail}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-500 dark:text-[#71717a]">Senha temporária:</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-lg">{createdResult.adminPassword}</span>
                        <button onClick={() => copyText(createdResult.adminPassword)} className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-[#27272a] transition-colors">
                          {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-500 dark:text-[#71717a]">ID da Organização:</span>
                      <span className="text-xs font-mono text-slate-400 truncate max-w-[200px]" title={createdResult.orgId}>{createdResult.orgId}</span>
                    </div>
                  </div>
                  <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-400 space-y-1">
                    <p>⚠️ A senha <strong>não foi salva</strong> — copie agora.</p>
                    <p>Para o admin conseguir logar, crie a conta dele no <strong>Supabase Dashboard → Authentication → Users → Invite</strong> com este e-mail e senha.</p>
                  </div>
                  <button onClick={() => setShowNewOrg(false)} className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all">Fechar</button>
                </div>
              ) : (
                <form onSubmit={handleCreate} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Nome da Empresa *</label>
                    <input type="text" required placeholder="Ex: Adega dos Parças" value={newOrgName} onChange={(e) => setNewOrgName(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 dark:border-[#27272a] bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Nome do Administrador *</label>
                    <input type="text" required placeholder="Ex: João Silva" value={newAdminName} onChange={(e) => setNewAdminName(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 dark:border-[#27272a] bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">E-mail do Administrador *</label>
                    <input type="email" required placeholder="Ex: admin@adega.com" value={newAdminEmail} onChange={(e) => setNewAdminEmail(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 dark:border-[#27272a] bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium" />
                  </div>
                  <div className="p-3 rounded-2xl bg-indigo-500/5 border border-indigo-500/20 text-[10px] text-slate-500 dark:text-[#a1a1aa] space-y-1">
                    <p>🔒 Serão criados automaticamente: organização, filial Matriz e usuário admin.</p>
                    <p>⚡ A senha é gerada e mostrada uma única vez (não fica salva).</p>
                  </div>
                  <div className="flex gap-3 pt-1">
                    <button type="button" onClick={() => setShowNewOrg(false)}
                      className="flex-1 py-2.5 rounded-xl border border-slate-300 dark:border-[#27272a] text-xs font-semibold text-slate-600 dark:text-[#a1a1aa] hover:bg-slate-50 dark:hover:bg-[#09090b] transition-all">Cancelar</button>
                    <button type="submit" disabled={creating}
                      className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/20 transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                      {creating ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Criando...</> : 'Criar Organização'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: Adicionar Admin a uma Filial                            */}
      {/* ============================================================ */}
      {showAddUser && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[20vh] bg-slate-950/60 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-md bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-gradient-to-br from-emerald-900 via-slate-900 to-black p-5 text-white relative overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.2),transparent_50%)] pointer-events-none" />
              <div className="flex items-center justify-between relative z-10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center"><UserPlus className="w-5 h-5 text-emerald-300" /></div>
                  <div><h2 className="text-lg font-bold">Adicionar Admin</h2><p className="text-xs text-slate-300">Vincula um admin a esta filial</p></div>
                </div>
                <button onClick={() => setShowAddUser(false)} className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 transition-colors"><X className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="p-5 space-y-4">
              {addUserResult ? (
                <div className="space-y-4">
                  <div className={`p-4 rounded-2xl ${addUserResult.success ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-rose-500/10 border border-rose-500/30'}`}>
                    <p className={`text-sm font-bold ${addUserResult.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {addUserResult.success ? '✅ Admin adicionado!' : '❌ Erro'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-[#a1a1aa] mt-1 whitespace-pre-wrap">{addUserResult.message}</p>
                  </div>
                  {/* Aviso sobre Auth: só aparece se veio do RPC fallback (sem senha) */}
                  {addUserResult.success && !addUserResult.message.includes('Senha:') && (
                    <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-400 space-y-1">
                      <p>⚠️ O admin foi criado no sistema, mas para ele conseguir logar, você precisa criar a conta dele no <strong>Supabase Dashboard → Authentication → Users → Invite User</strong>.</p>
                    </div>
                  )}
                  <button onClick={() => setShowAddUser(false)}
                    className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all">Fechar</button>
                </div>
              ) : (
                <form onSubmit={handleAddUser} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Nome do Admin *</label>
                    <input type="text" required placeholder="Ex: Maria Santos" value={addUserName} onChange={(e) => setAddUserName(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 dark:border-[#27272a] bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">E-mail do Admin *</label>
                    <input type="email" required placeholder="Ex: maria@adega.com" value={addUserEmail} onChange={(e) => setAddUserEmail(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 dark:border-[#27272a] bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium" />
                  </div>
                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] text-[10px] text-slate-500 dark:text-[#a1a1aa]">
                    🔒 O admin será vinculado a esta filial específica. Ele precisará de uma conta no Supabase Auth para logar.
                  </div>
                  <div className="flex gap-3 pt-1">
                    <button type="button" onClick={() => setShowAddUser(false)}
                      className="flex-1 py-2.5 rounded-xl border border-slate-300 dark:border-[#27272a] text-xs font-semibold text-slate-600 dark:text-[#a1a1aa] hover:bg-slate-50 dark:hover:bg-[#09090b] transition-all">Cancelar</button>
                    <button type="submit" disabled={addingUser}
                      className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                      {addingUser ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Adicionando...</> : 'Adicionar Admin'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
