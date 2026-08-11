import React, { useState, useEffect, useCallback } from 'react';
import {
  Building2, Plus, ChevronDown, ChevronRight, Users, MapPin,
  ShieldCheck, Loader2, Copy, Check, X, Mail, UserPlus, LogIn,
  Store, AlertCircle, ArrowRightFromLine, Trash2, Power,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { callServerApi } from '../../lib/serverApi';
import { storageService } from '../../services/storageService';
import { backupService, BackupRecord } from '../../services/backupService';
import { DEFAULT_ORG_ID } from '../../data/mockData';
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
  active: boolean;
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

  return <OrganizationsManager user={user} onEnterOrg={onEnterOrg} />;
};

/* ================================================================== */
/*  OrganizationsManager (inner component, no guard check)              */
/* ================================================================== */

const OrganizationsManager: React.FC<{ user: UserProfile; onEnterOrg?: (orgId: string) => void }> = ({ user, onEnterOrg }) => {
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

  // Backup state
  const [backupsMap, setBackupsMap] = useState<Record<string, BackupRecord[]>>({});
  const [loadingBackups, setLoadingBackups] = useState<Record<string, boolean>>({});
  const [creatingBackup, setCreatingBackup] = useState<string | null>(null);
  const [restoringBackup, setRestoringBackup] = useState<string | null>(null);
  const [showBackupHistory, setShowBackupHistory] = useState<string | null>(null);
  const [backupSuccess, setBackupSuccess] = useState<string | null>(null);

  // Load backups when expanding an org
  useEffect(() => {
    for (const orgId of expanded) {
      const branches = branchesMap[orgId] || [];
      for (const branch of branches) {
        if (!backupsMap[branch.id] && !loadingBackups[branch.id]) {
          loadBackups(branch.id);
        }
      }
    }
  }, [expanded, branchesMap]);

  /* ---------- backup handlers ---------- */
  const loadBackups = async (branchId: string) => {
    setLoadingBackups(prev => ({ ...prev, [branchId]: true }));
    try {
      const backups = await backupService.getBackups(branchId);
      setBackupsMap(prev => ({ ...prev, [branchId]: backups }));
    } catch (e) {
      console.error('[Backup] Failed to load:', e);
    } finally {
      setLoadingBackups(prev => ({ ...prev, [branchId]: false }));
    }
  };

  const handleCreateBackup = async (branchId: string, branchName: string) => {
    setCreatingBackup(branchId);
    try {
      const name = `Backup Manual - ${branchName} - ${new Date().toLocaleDateString('pt-BR')}`;
      await backupService.createBackup(branchId, name, false);
      await loadBackups(branchId);
      setBackupSuccess(branchId);
      setTimeout(() => setBackupSuccess(null), 3000);
    } catch (e: any) {
      addToast('error', `Erro ao criar backup: ${e?.message || 'erro desconhecido'}`);
    } finally {
      setCreatingBackup(null);
    }
  };

  const handleRestoreBackup = async (backupId: string, branchId: string) => {
    if (!confirm('⚠️ ATENÇÃO: Isso irá substituir TODOS os dados atuais da filial pelos dados do backup. Esta ação não pode ser desfeita. Continuar?')) {
      return;
    }
    setRestoringBackup(backupId);
    try {
      const success = await backupService.restoreBackup(backupId);
      if (success) {
        addToast('success', 'Backup restaurado com sucesso! Os dados serão sincronizados em todos os dispositivos.');
        await loadBackups(branchId);
      } else {
        addToast('error', 'Erro ao restaurar backup. Tente novamente.');
      }
    } catch (e: any) {
      addToast('error', `Erro ao restaurar: ${e?.message || 'erro desconhecido'}`);
    } finally {
      setRestoringBackup(null);
    }
  };

  // Modal de excluir organização
  const [deleteOrgTarget, setDeleteOrgTarget] = useState<OrgRow | null>(null);
  const [deleteOrgConfirm, setDeleteOrgConfirm] = useState('');
  const [deletingOrg, setDeletingOrg] = useState(false);
  const [deleteOrgError, setDeleteOrgError] = useState<string | null>(null);

  // Modal de desativar/reativar (interruptor de acesso online)
  const [toggleOrgTarget, setToggleOrgTarget] = useState<OrgRow | null>(null);
  const [togglingOrg, setTogglingOrg] = useState(false);
  const [toggleOrgError, setToggleOrgError] = useState<string | null>(null);

  // Bloqueio remoto de usuário (admin/colaborador)
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);

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

  /* ---------- excluir organização ---------- */
  const openDeleteOrg = (org: OrgRow) => {
    setDeleteOrgTarget(org);
    setDeleteOrgConfirm('');
    setDeleteOrgError(null);
  };

  const handleDeleteOrg = async () => {
    if (!deleteOrgTarget) return;
    if (deleteOrgConfirm.trim() !== deleteOrgTarget.name.trim()) {
      setDeleteOrgError('O nome digitado não confere. Nada foi excluído.');
      return;
    }
    setDeletingOrg(true); setDeleteOrgError(null);
    try {
      const { data, error } = await callServerApi<{ success: boolean; message: string }>(
        '/api/admin/delete-organization',
        { organization_id: deleteOrgTarget.id, confirm_name: deleteOrgConfirm.trim() }
      );
      if (error) {
        setDeleteOrgError(error);
        return;
      }
      if (!data?.success) {
        setDeleteOrgError(data?.message || 'Falha ao excluir organização.');
        return;
      }
      // Sucesso: remove da lista e limpa mapas
      setOrgs((prev) => prev.filter((o) => o.id !== deleteOrgTarget.id));
      setBranchesMap((prev) => { const n = { ...prev }; delete n[deleteOrgTarget.id]; return n; });
      setUsersMap((prev) => { const n = { ...prev }; delete n[deleteOrgTarget.id]; return n; });
      // Se a org excluída era a que estava sendo visualizada, sai dela
      if (localStorage.getItem('hd_system_viewing_org') === deleteOrgTarget.id) {
        storageService.superadminSetViewingOrg(null);
      }
      addToast('success', data.message);
      setDeleteOrgTarget(null); setDeleteOrgConfirm('');
    } catch (e: any) {
      setDeleteOrgError(e?.message || 'Erro ao excluir organização.');
    } finally { setDeletingOrg(false); }
  };

  /* ---------- desativar / reativar organização (interruptor de acesso online) ---------- */
  const openToggleOrg = (org: OrgRow) => {
    setToggleOrgTarget(org);
    setToggleOrgError(null);
  };

  const handleToggleOrg = async () => {
    if (!toggleOrgTarget) return;
    const nextActive = !toggleOrgTarget.active;
    setTogglingOrg(true); setToggleOrgError(null);
    try {
      const { data, error } = await callServerApi<{ success: boolean; message: string }>(
        '/api/admin/set-organization-active',
        { organization_id: toggleOrgTarget.id, active: nextActive }
      );
      if (error) {
        setToggleOrgError(error);
        return;
      }
      if (!data?.success) {
        setToggleOrgError(data?.message || 'Falha ao atualizar o acesso da organização.');
        return;
      }
      // Sucesso: atualiza a lista na tela
      setOrgs((prev) => prev.map((o) => o.id === toggleOrgTarget.id ? { ...o, active: nextActive } : o));
      addToast(nextActive ? 'success' : 'warning', data.message);
      setToggleOrgTarget(null);
    } catch (e: any) {
      setToggleOrgError(e?.message || 'Erro ao atualizar o acesso da organização.');
    } finally { setTogglingOrg(false); }
  };

  /* ---------- desativar / reativar usuário (bloqueio remoto de conta) ---------- */
  const handleToggleUser = async (u: UserRow) => {
    if (togglingUserId) return;
    const nextActive = !u.active;
    setTogglingUserId(u.id);
    try {
      const { data, error } = await callServerApi<{ success: boolean; message: string }>(
        '/api/admin/set-user-active',
        { user_id: u.id, active: nextActive }
      );
      if (error) { addToast('error', error); return; }
      if (!data?.success) { addToast('error', data?.message || 'Falha ao atualizar o usuário.'); return; }
      // Sucesso: atualiza a lista na tela
      setUsersMap((prev) => {
        const updated = { ...prev };
        for (const orgId of Object.keys(updated)) {
          updated[orgId] = updated[orgId].map((x) => x.id === u.id ? { ...x, active: nextActive } : x);
        }
        return updated;
      });
      addToast(nextActive ? 'success' : 'warning', data.message);
    } catch (e: any) {
      addToast('error', e?.message || 'Erro ao atualizar o usuário.');
    } finally { setTogglingUserId(null); }
  };

  // Load backups when expanding an org
  useEffect(() => {
    for (const orgId of expanded) {
      const branches = branchesMap[orgId] || [];
      for (const branch of branches) {
        if (!backupsMap[branch.id] && !loadingBackups[branch.id]) {
          loadBackups(branch.id);
        }
      }
    }
  }, [expanded, branchesMap]);

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
                {/* Status do acesso online */}
                {org.active === false ? (
                  <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-bold border border-amber-500/20">
                    <Power className="w-3 h-3" />Acesso offline
                  </span>
                ) : (
                  <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold border border-emerald-500/20">
                    <ShieldCheck className="w-3 h-3" />Online
                  </span>
                )}
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
          {/* Botão interruptor — desativar/reativar acesso online (protegido para org padrão) */}
          <button
            onClick={() => openToggleOrg(org)}
            disabled={org.id === DEFAULT_ORG_ID}
            className="flex items-center gap-1.5 px-3 py-2 m-3 ml-0 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold text-xs transition-all shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
            title={org.id === DEFAULT_ORG_ID
              ? 'A organização padrão do sistema não pode ser desativada'
              : org.active === false ? 'Reativar acesso online (Realtime + sincronização)' : 'Desativar acesso online (app continua local)'}
          >
            <Power className="w-3.5 h-3.5" />
          </button>
          {/* Botão Excluir — protegido: org padrão do sistema não pode ser excluída */}
          <button
            onClick={() => openDeleteOrg(org)}
            disabled={org.id === DEFAULT_ORG_ID}
            className="flex items-center gap-1.5 px-3 py-2 m-3 ml-0 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 font-bold text-xs transition-all shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
            title={org.id === DEFAULT_ORG_ID ? 'A organização padrão do sistema não pode ser excluída' : 'Excluir organização (irreversível)'}
          >
            <Trash2 className="w-3.5 h-3.5" />
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
                      <div className="mt-3 flex flex-col gap-2 pt-3 border-t border-slate-200 dark:border-[#27272a]">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openAddUser(org.id, b.id)}
                            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] transition-all"
                          >
                            <UserPlus className="w-3 h-3" />
                            <span>Add Admin</span>
                          </button>
                          <button
                            onClick={() => handleCreateBackup(b.id, b.name)}
                            disabled={creatingBackup === b.id}
                            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold text-[10px] transition-all"
                            title="Criar Backup"
                          >
                            {creatingBackup === b.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                              </svg>
                            )}
                            <span>Backup</span>
                          </button>
                        </div>
                        {backupSuccess === b.id && (
                          <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                            ✅ Backup criado com sucesso!
                          </p>
                        )}
                        {/* Backup History */}
                        {backupsMap[b.id] && backupsMap[b.id].length > 0 && (
                          <div className="mt-1">
                            <button
                              onClick={() => setShowBackupHistory(b.id)}
                              className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
                            >
                              📋 Ver histórico ({backupsMap[b.id].length} backup{backupsMap[b.id].length > 1 ? 's' : ''})
                            </button>
                          </div>
                        )}
                        {loadingBackups[b.id] && (
                          <p className="text-[10px] text-slate-400">
                            <Loader2 className="w-3 h-3 inline animate-spin" /> Carregando backups...
                          </p>
                        )}
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
                        <th className="px-4 py-2.5 text-center">Ação</th>
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
                          <td className="px-4 py-2.5 text-center">
                            <button
                              onClick={() => handleToggleUser(u)}
                              disabled={togglingUserId !== null || u.id === user.id}
                              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                                u.active === false
                                  ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                                  : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400'
                              }`}
                              title={u.id === user.id
                                ? 'Você não pode desativar a sua própria conta'
                                : u.active === false ? 'Reativar acesso deste usuário' : 'Desativar — derruba o aparelho dele em até 30s quando ficar online'}
                            >
                              {togglingUserId === u.id
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : <Power className="w-3 h-3" />}
                              <span>{u.active === false ? 'Reativar' : 'Desativar'}</span>
                            </button>
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

      {/* ============================================================ */}
      {/* MODAL: Excluir Organização                                   */}
      {/* ============================================================ */}
      {deleteOrgTarget && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[15vh] bg-slate-950/60 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-md bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-gradient-to-br from-rose-950 via-slate-900 to-black p-5 text-white relative overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(244,63,94,0.25),transparent_50%)] pointer-events-none" />
              <div className="flex items-center justify-between relative z-10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center"><Trash2 className="w-5 h-5 text-rose-300" /></div>
                  <div><h2 className="text-lg font-bold">Excluir Organização</h2><p className="text-xs text-slate-300">Ação irreversível</p></div>
                </div>
                <button onClick={() => setDeleteOrgTarget(null)} className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 transition-colors"><X className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="p-5 space-y-4">
              <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30">
                <p className="text-sm font-bold text-rose-600 dark:text-rose-400 mb-1">⚠️ Você está excluindo <strong className="break-words">{deleteOrgTarget.name}</strong></p>
                <p className="text-xs text-slate-500 dark:text-[#a1a1aa] mt-1">
                  Tudo será removido permanentemente do banco: {deleteOrgTarget.branch_count} filial(is), {deleteOrgTarget.user_count} usuário(s), produtos, vendas, caixa, financeiro e mais. <strong>Não é possível desfazer.</strong>
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Digite o nome da organização para confirmar
                </label>
                <input
                  type="text"
                  placeholder={deleteOrgTarget.name}
                  value={deleteOrgConfirm}
                  onChange={(e) => setDeleteOrgConfirm(e.target.value)}
                  autoFocus
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 dark:border-[#27272a] bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500 font-medium"
                />
              </div>
              {deleteOrgError && (
                <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-600 dark:text-rose-400">
                  {deleteOrgError}
                </div>
              )}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setDeleteOrgTarget(null)} disabled={deletingOrg}
                  className="flex-1 py-2.5 rounded-xl border border-slate-300 dark:border-[#27272a] text-xs font-semibold text-slate-600 dark:text-[#a1a1aa] hover:bg-slate-50 dark:hover:bg-[#09090b] transition-all disabled:opacity-60">
                  Cancelar
                </button>
                <button type="button" onClick={handleDeleteOrg}
                  disabled={deletingOrg || deleteOrgConfirm.trim() !== deleteOrgTarget.name.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md shadow-rose-600/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                  {deletingOrg ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Excluindo...</> : <><Trash2 className="w-3.5 h-3.5" /> Excluir Definitivamente</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* ============================================================ */}
      {/* MODAL: Desativar / Reativar acesso online (interruptor)      */}
      {/* ============================================================ */}
      {toggleOrgTarget && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[15vh] bg-slate-950/60 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-md bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className={toggleOrgTarget.active === false
              ? 'bg-gradient-to-br from-emerald-950 via-slate-900 to-black p-5 text-white relative overflow-hidden'
              : 'bg-gradient-to-br from-amber-950 via-slate-900 to-black p-5 text-white relative overflow-hidden'}>
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.2),transparent_50%)] pointer-events-none" />
              <div className="flex items-center justify-between relative z-10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center"><Power className="w-5 h-5 text-amber-300" /></div>
                  <div>
                    <h2 className="text-lg font-bold">{toggleOrgTarget.active === false ? 'Reativar acesso online' : 'Desativar acesso online'}</h2>
                    <p className="text-xs text-slate-300">Organização: <strong className="break-words">{toggleOrgTarget.name}</strong></p>
                  </div>
                </div>
                <button onClick={() => setToggleOrgTarget(null)} className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 transition-colors"><X className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="p-5 space-y-4">
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                {toggleOrgTarget.active === false ? (
                  <>
                    <p className="text-sm font-bold text-amber-600 dark:text-amber-400 mb-1">Reativar <strong className="break-words">{toggleOrgTarget.name}</strong>?</p>
                    <p className="text-xs text-slate-500 dark:text-[#a1a1aa] mt-1">
                      O acesso online volta imediatamente: tempo real, sincronização e backup na nuvem. Os apps dos
                      clientes reconectam sozinhos (verificação automática a cada 30s) e a fila de operações feita
                      offline durante a suspensão é enviada para o banco sem perda de dados.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-bold text-amber-600 dark:text-amber-400 mb-1">⚠️ Desativar <strong className="break-words">{toggleOrgTarget.name}</strong>?</p>
                    <p className="text-xs text-slate-500 dark:text-[#a1a1aa] mt-1">
                      O app desta organização passa a funcionar <strong>apenas localmente</strong>: tempo real e sincronização
                      em nuvem são cortados. Nenhum dado é apagado — nem no app, nem no banco. As operações feitas
                      offline ficam guardadas no dispositivo e são enviadas automaticamente quando você reativar.
                    </p>
                  </>
                )}
              </div>
              <div className="flex items-start gap-2 p-3 rounded-2xl bg-slate-100 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a]">
                <AlertCircle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-slate-500 dark:text-[#a1a1aa]">
                  Use o interruptor para gerenciar o acesso online por mensalidade: assinatura em dia = organização
                  <strong className="text-emerald-600 dark:text-emerald-400"> Online</strong>; atraso/cancelamento = organização
                  <strong className="text-amber-600 dark:text-amber-400"> Acesso offline</strong>. O cliente continua usando o app
                  local para sempre, mesmo com acesso online cortado.
                </p>
              </div>
              {toggleOrgError && (
                <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-600 dark:text-rose-400">
                  {toggleOrgError}
                </div>
              )}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setToggleOrgTarget(null)} disabled={togglingOrg}
                  className="flex-1 py-2.5 rounded-xl border border-slate-300 dark:border-[#27272a] text-xs font-semibold text-slate-600 dark:text-[#a1a1aa] hover:bg-slate-50 dark:hover:bg-[#09090b] transition-all disabled:opacity-60">
                  Cancelar
                </button>
                <button type="button" onClick={handleToggleOrg}
                  disabled={togglingOrg}
                  className={`flex-1 py-2.5 rounded-xl text-white font-bold text-xs shadow-md transition-all disabled:opacity-50 flex items-center justify-center gap-2 ${
                    toggleOrgTarget.active === false
                      ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20'
                      : 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/20'}`}>
                  {togglingOrg ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Salvando...</> : toggleOrgTarget.active === false
                    ? <><Power className="w-3.5 h-3.5" /> Reativar Acesso</>
                    : <><Power className="w-3.5 h-3.5" /> Desativar Acesso</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* ============================================================ */}
      {/* MODAL: Histórico de Backups                                */}
      {/* ============================================================ */}
      {showBackupHistory && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[10vh] bg-slate-950/60 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-lg bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-gradient-to-br from-amber-950 via-slate-900 to-black p-5 text-white relative overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.2),transparent_50%)] pointer-events-none" />
              <div className="flex items-center justify-between relative z-10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
                    <svg className="w-5 h-5 text-amber-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-lg font-bold">Histórico de Backups</h2>
                    <p className="text-xs text-slate-300">
                      {backupsMap[showBackupHistory]?.length || 0} backup{backupsMap[showBackupHistory]?.length !== 1 ? 's' : ''} disponível{backupsMap[showBackupHistory]?.length !== 1 ? 'is' : ''}
                    </p>
                  </div>
                </div>
                <button onClick={() => setShowBackupHistory(null)} className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-5 max-h-[60vh] overflow-y-auto">
              {backupsMap[showBackupHistory]?.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-8">Nenhum backup encontrado para esta filial.</p>
              ) : (
                <div className="space-y-3">
                  {backupsMap[showBackupHistory]?.map((backup) => (
                    <div key={backup.id} className="p-4 rounded-2xl bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a]">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{backup.backup_name}</p>
                            {backup.is_automatic && (
                              <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[9px] font-bold">AUTO</span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-500 mt-1">
                            {new Date(backup.created_at).toLocaleString('pt-BR')}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {backup.record_count} registros • {(backup.data_size_bytes / 1024).toFixed(1)} KB
                          </p>
                        </div>
                        <button
                          onClick={() => handleRestoreBackup(backup.id, showBackupHistory)}
                          disabled={restoringBackup === backup.id}
                          className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-[10px] font-bold flex items-center gap-1.5 transition-all"
                        >
                          {restoringBackup === backup.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                          )}
                          Restaurar
                        </button>
                      </div>
                      {backup.restored_at && (
                        <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-2 font-bold">
                          ✅ Restaurado em {new Date(backup.restored_at).toLocaleString('pt-BR')}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
