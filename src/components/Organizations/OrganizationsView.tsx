import React, { useState, useEffect, useCallback } from 'react';
import {
  Building2,
  Plus,
  ChevronDown,
  ChevronRight,
  Users,
  MapPin,
  Hash,
  ShieldCheck,
  Loader2,
  Copy,
  Check,
  ExternalLink,
  X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { UserProfile } from '../../types';

/* ------------------------------------------------------------------ */
/*  Tipos internos                                                      */
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
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
}

/* ------------------------------------------------------------------ */
/*  Componente principal                                                */
/* ------------------------------------------------------------------ */

interface OrganizationsViewProps {
  user: UserProfile;
}

export const OrganizationsView: React.FC<OrganizationsViewProps> = ({ user }) => {
  /* ---------- state ---------- */
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [branchesMap, setBranchesMap] = useState<Record<string, BranchRow[]>>({});
  const [usersMap, setUsersMap] = useState<Record<string, UserRow[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* modal de criação */
  const [showModal, setShowModal] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdResult, setCreatedResult] = useState<{
    name: string;
    adminEmail: string;
    adminPassword: string;
    orgId: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  /* ---------- fetch ---------- */
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.rpc('admin_list_organizations');
      if (err) throw new Error(err.message);
      setOrgs(data || []);
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar organizações');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ---------- expandir para ver filiais/usuários ---------- */
  const toggleExpand = async (orgId: string) => {
    if (expanded.has(orgId)) {
      setExpanded((prev) => { const n = new Set(prev); n.delete(orgId); return n; });
      return;
    }

    // Expandir — buscar branches e users se ainda não carregados
    setExpanded((prev) => { const n = new Set(prev); n.add(orgId); return n; });

    if (!branchesMap[orgId]) {
      const { data: branches } = await supabase.rpc('admin_list_branches', { p_org_id: orgId });
      setBranchesMap((prev) => ({ ...prev, [orgId]: branches || [] }));
    }
    if (!usersMap[orgId]) {
      const { data: users } = await supabase.rpc('admin_list_users', { p_org_id: orgId });
      setUsersMap((prev) => ({ ...prev, [orgId]: users || [] }));
    }
  };

  /* ---------- criar organização ---------- */
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim() || !newAdminName.trim() || !newAdminEmail.trim()) return;

    setCreating(true);
    setCreatedResult(null);
    try {
      const { data, error: err } = await supabase.rpc('admin_create_organization', {
        p_name: newOrgName.trim(),
        p_admin_email: newAdminEmail.trim().toLowerCase(),
        p_admin_name: newAdminName.trim(),
      });

      if (err) throw new Error(err.message);

      const result = data?.[0];
      if (!result?.success) {
        throw new Error(result?.message || 'Erro ao criar organização');
      }

      setCreatedResult({
        name: newOrgName.trim(),
        adminEmail: newAdminEmail.trim().toLowerCase(),
        adminPassword: result.password,
        orgId: result.org_id,
      });

      // Recarregar lista
      fetchData();
    } catch (e: any) {
      setError(e.message || 'Erro ao criar organização');
    } finally {
      setCreating(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setNewOrgName('');
    setNewAdminName('');
    setNewAdminEmail('');
    setCreatedResult(null);
    setCopied(false);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* fallback */ }
  };

  /* ---------- render ---------- */
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

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <Building2 className="w-6 h-6 text-indigo-500" />
            Organizações
          </h1>
          <p className="text-xs text-slate-500 dark:text-[#a1a1aa] mt-1">
            Gerencie todas as empresas do sistema — apenas superadmin
          </p>
        </div>
        <button
          onClick={() => { setShowModal(true); setCreatedResult(null); }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/20 transition-all min-h-[44px]"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Nova Empresa</span>
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs flex items-start gap-2.5">
          <X className="w-4 h-4 shrink-0 mt-0.5 cursor-pointer" onClick={() => setError(null)} />
          <span>{error}</span>
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-3xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-12 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
            <span className="ml-3 text-xs text-slate-500">Carregando organizações...</span>
          </div>
        ) : orgs.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400 dark:text-[#52525b]">
            Nenhuma organização encontrada.
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-[#27272a]">
            {/* Header row (desktop) */}
            <div className="hidden sm:grid grid-cols-12 gap-4 px-6 py-3 bg-slate-50 dark:bg-[#09090b]/40 text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-[#52525b]">
              <div className="col-span-4">Empresa</div>
              <div className="col-span-2 text-center">Filiais</div>
              <div className="col-span-2 text-center">Usuários</div>
              <div className="col-span-2 text-center">Criada em</div>
              <div className="col-span-2" />
            </div>

            {orgs.map((org) => {
              const isExpanded = expanded.has(org.id);
              const branches = branchesMap[org.id];
              const users = usersMap[org.id];

              return (
                <div key={org.id}>
                  {/* Org row */}
                  <button
                    onClick={() => toggleExpand(org.id)}
                    className="w-full grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 px-4 sm:px-6 py-4 text-left hover:bg-slate-50 dark:hover:bg-[#09090b]/40 transition-colors min-h-[56px]"
                  >
                    <div className="col-span-4 flex items-center gap-2.5">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 shrink-0 text-slate-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 shrink-0 text-slate-400" />
                      )}
                      <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                        <Building2 className="w-4 h-4 text-indigo-500" />
                      </div>
                      <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {org.name}
                      </span>
                    </div>
                    <div className="col-span-2 flex items-center justify-start sm:justify-center gap-1.5 text-xs text-slate-500 dark:text-[#a1a1aa]">
                      <Hash className="w-3 h-3" />
                      {org.branch_count}
                    </div>
                    <div className="col-span-2 flex items-center justify-start sm:justify-center gap-1.5 text-xs text-slate-500 dark:text-[#a1a1aa]">
                      <Users className="w-3 h-3" />
                      {org.user_count}
                    </div>
                    <div className="col-span-2 flex items-center justify-start sm:justify-center text-xs text-slate-400 dark:text-[#71717a]">
                      {new Date(org.created_at).toLocaleDateString('pt-BR')}
                    </div>
                    <div className="col-span-2 flex items-center justify-end gap-2">
                      <span className="text-[10px] text-indigo-500 font-semibold">
                        {isExpanded ? 'Recolher' : 'Detalhes'}
                      </span>
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-4 sm:px-12 pb-4 space-y-4">
                      {/* Filiais */}
                      <div>
                        <h4 className="text-xs font-bold text-slate-500 dark:text-[#71717a] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <MapPin className="w-3 h-3" />
                          Filiais
                        </h4>
                        {!branches ? (
                          <div className="flex items-center gap-2 text-xs text-slate-400">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Carregando...
                          </div>
                        ) : branches.length === 0 ? (
                          <p className="text-xs text-slate-400 dark:text-[#52525b]">Nenhuma filial cadastrada.</p>
                        ) : (
                          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[#27272a]">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-slate-50 dark:bg-[#09090b]/40 text-slate-400 dark:text-[#52525b] uppercase tracking-wider font-bold">
                                  <th className="px-4 py-2 text-left">Nome</th>
                                  <th className="px-4 py-2 text-left">Código</th>
                                  <th className="px-4 py-2 text-left">Cidade/UF</th>
                                  <th className="px-4 py-2 text-center">Matriz</th>
                                  <th className="px-4 py-2 text-center">Ativa</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-[#27272a]">
                                {branches.map((b) => (
                                  <tr key={b.id} className="text-slate-700 dark:text-[#a1a1aa]">
                                    <td className="px-4 py-2 font-medium">{b.name}</td>
                                    <td className="px-4 py-2">{b.code}</td>
                                    <td className="px-4 py-2">{[b.city, b.state].filter(Boolean).join('/') || '—'}</td>
                                    <td className="px-4 py-2 text-center">{b.is_headquarters ? '✅' : '—'}</td>
                                    <td className="px-4 py-2 text-center">
                                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${b.active ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'}`}>
                                        {b.active ? 'SIM' : 'NÃO'}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      {/* Usuários */}
                      <div>
                        <h4 className="text-xs font-bold text-slate-500 dark:text-[#71717a] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <Users className="w-3 h-3" />
                          Usuários
                        </h4>
                        {!users ? (
                          <div className="flex items-center gap-2 text-xs text-slate-400">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Carregando...
                          </div>
                        ) : users.length === 0 ? (
                          <p className="text-xs text-slate-400 dark:text-[#52525b]">Nenhum usuário cadastrado.</p>
                        ) : (
                          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[#27272a]">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-slate-50 dark:bg-[#09090b]/40 text-slate-400 dark:text-[#52525b] uppercase tracking-wider font-bold">
                                  <th className="px-4 py-2 text-left">Nome</th>
                                  <th className="px-4 py-2 text-left">E-mail</th>
                                  <th className="px-4 py-2 text-left">Perfil</th>
                                  <th className="px-4 py-2 text-center">Ativo</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-[#27272a]">
                                {users.map((u) => (
                                  <tr key={u.id} className="text-slate-700 dark:text-[#a1a1aa]">
                                    <td className="px-4 py-2 font-medium">{u.name}</td>
                                    <td className="px-4 py-2 text-slate-400">{u.email}</td>
                                    <td className="px-4 py-2">
                                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                        u.role === 'admin'
                                          ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                                          : 'bg-slate-500/10 text-slate-600 dark:text-slate-400'
                                      }`}>
                                        {u.role === 'admin' ? 'Admin' : u.role}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2 text-center">
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
            })}
          </div>
        )}
      </div>

      {/* ---------- Modal de criação ---------- */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[10vh] bg-slate-950/60 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-lg bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-gradient-to-br from-indigo-900 via-slate-900 to-black p-5 text-white relative overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.2),transparent_50%)] pointer-events-none" />
              <div className="flex items-center justify-between relative z-10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center">
                    <Plus className="w-5 h-5 text-indigo-300" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold">Nova Organização</h2>
                    <p className="text-xs text-slate-300">Criar uma nova empresa independente</p>
                  </div>
                </div>
                <button onClick={closeModal} className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-5 space-y-4">
              {createdResult ? (
                /* --- Resultado da criação --- */
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
                    <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mb-1">
                      ✅ Organização criada com sucesso!
                    </p>
                    <p className="text-xs text-slate-500 dark:text-[#a1a1aa]">
                      A empresa <strong className="text-slate-700 dark:text-white">{createdResult.name}</strong> está pronta.
                      O admin já pode acessar:
                    </p>
                  </div>

                  <div className="space-y-2.5 bg-slate-50 dark:bg-[#09090b] rounded-2xl p-4 border border-slate-200 dark:border-[#27272a]">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-500 dark:text-[#71717a]">E-mail do admin:</span>
                      <span className="text-xs font-mono font-bold text-slate-900 dark:text-white">{createdResult.adminEmail}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-500 dark:text-[#71717a]">Senha temporária:</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-lg">
                          {createdResult.adminPassword}
                        </span>
                        <button
                          onClick={() => copyToClipboard(createdResult.adminPassword)}
                          className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-[#27272a] transition-colors"
                          title="Copiar senha"
                        >
                          {copied ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-slate-400" />
                          )}
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-500 dark:text-[#71717a]">ID da Organização:</span>
                      <span className="text-xs font-mono text-slate-400 truncate max-w-[200px]" title={createdResult.orgId}>
                        {createdResult.orgId}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-400 space-y-1">
                    <p>⚠️ Esta senha <strong>não foi salva no banco de dados</strong> — é a única vez que você a verá.</p>
                    <p>O admin precisa ser criado manualmente no <strong>Supabase Auth</strong> (Authentication → Users → Invite) com este e-mail e senha para que o login funcione.</p>
                  </div>

                  <button
                    onClick={closeModal}
                    className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all"
                  >
                    Fechar
                  </button>
                </div>
              ) : (
                /* --- Formulário --- */
                <form onSubmit={handleCreate} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Nome da Empresa *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: HD-System Comércio"
                      value={newOrgName}
                      onChange={(e) => setNewOrgName(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 dark:border-[#27272a] bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Nome do Administrador *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: João Silva"
                      value={newAdminName}
                      onChange={(e) => setNewAdminName(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 dark:border-[#27272a] bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      E-mail do Administrador *
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="Ex: admin@empresa.com"
                      value={newAdminEmail}
                      onChange={(e) => setNewAdminEmail(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 dark:border-[#27272a] bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                    />
                  </div>

                  <div className="p-3 rounded-2xl bg-indigo-500/5 border border-indigo-500/20 text-[10px] text-slate-500 dark:text-[#a1a1aa] space-y-1">
                    <p>🔒 Serão criados automaticamente:</p>
                    <ul className="list-disc pl-4 space-y-0.5">
                      <li>Organização (empresa)</li>
                      <li>Filial padrão (Matriz)</li>
                      <li>Usuário admin com e-mail e senha temporária</li>
                    </ul>
                  </div>

                  <div className="flex gap-3 pt-1">
                    <button
                      type="button"
                      onClick={closeModal}
                      className="flex-1 py-2.5 rounded-xl border border-slate-300 dark:border-[#27272a] text-xs font-semibold text-slate-600 dark:text-[#a1a1aa] hover:bg-slate-50 dark:hover:bg-[#09090b] transition-all"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={creating}
                      className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/20 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                      {creating ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Criando...
                        </>
                      ) : (
                        'Criar Organização'
                      )}
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
