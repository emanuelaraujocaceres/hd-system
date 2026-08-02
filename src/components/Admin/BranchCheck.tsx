import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Check, Copy, RefreshCw } from 'lucide-react';

interface UserBranchInfo {
  id: string;
  name: string;
  email: string;
  role: string;
  branchId: string | null;
  branchName: string | null;
  branchCity: string | null;
  branchState: string | null;
  isHeadquarters: boolean;
}

export const BranchCheck: React.FC = () => {
  const [users, setUsers] = useState<UserBranchInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchBranches = async () => {
    setLoading(true);
    try {
      const { data: branches, error: bErr } = await supabase
        .from('store_branches')
        .select('id, name, city, state, is_headquarters');

      if (bErr) throw bErr;

      const branchMap = new Map(
        (branches ?? []).map((b) => [b.id, b])
      );

      const { data: usersData, error: uErr } = await supabase
        .from('system_users')
        .select('id, name, email, role, store_branch_id');

      if (uErr) throw uErr;

      const result: UserBranchInfo[] = (usersData ?? []).map((u) => {
        const branch = u.store_branch_id ? branchMap.get(u.store_branch_id) : null;
        return {
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          branchId: u.store_branch_id ?? null,
          branchName: branch?.name ?? null,
          branchCity: branch?.city ?? null,
          branchState: branch?.state ?? null,
          isHeadquarters: branch?.is_headquarters ?? false,
        };
      });

      setUsers(result);
    } catch (e) {
      console.error('[BranchCheck] Erro:', e);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    const text = users
      .map((u) => {
        const branch = u.branchName
          ? `${u.branchName} (${u.branchCity} - ${u.branchState})${u.isHeadquarters ? ' [Matriz]' : ''}`
          : 'SEM FILIAL';
        return `${u.name.padEnd(25)} | ${u.role.padEnd(10)} | ${branch}`;
      })
      .join('\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-2xl p-6 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
          Filial Atual de Cada Usuário
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchBranches}
            disabled={loading}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Buscando...' : 'Atualizar'}
          </button>
          {users.length > 0 && (
            <button
              onClick={copyToClipboard}
              className="px-3 py-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold flex items-center gap-1.5"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copiado!' : 'Copiar'}
            </button>
          )}
        </div>
      </div>

      {users.length === 0 ? (
        <p className="text-xs text-slate-400 dark:text-[#71717a]">
          Clique em "Atualizar" para ver a filial de cada usuário.
        </p>
      ) : (
        <div className="space-y-2">
          {users.map((u) => {
            const branchLabel = u.branchName
              ? `${u.branchName} (${u.branchCity} - ${u.branchState})${u.isHeadquarters ? ' [Matriz]' : ''}`
              : 'SEM FILIAL ATRIBUÍDA';
            return (
              <div
                key={u.id}
                className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-xs font-bold text-indigo-600 dark:text-indigo-400">
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">{u.name}</p>
                    <p className="text-[10px] text-slate-400 dark:text-[#71717a]">{u.email}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    u.isHeadquarters
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700'
                  }`}>
                    {u.isHeadquarters && '🏢 '}
                    {branchLabel}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
