import React, { useState } from 'react';
import {
  ShoppingCart,
  LayoutDashboard,
  Package,
  DollarSign,
  Users,
  Settings,
  Building2,
  Lock,
  Unlock,
  LogOut,
  Receipt,
  FileText,
  Tv,
} from 'lucide-react';
import { StoreBranch, UserProfile, CashRegisterSession } from '../../types';
import { ResetDataButton } from '../shared/ResetDataButton';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { useToast } from '../shared/Toast';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  branches: StoreBranch[];
  currentBranch: StoreBranch;
  onSelectBranch: (branch: StoreBranch) => void;
  user: UserProfile;
  caixaSession: CashRegisterSession;
  onOpenCaixaModal: () => void;
  onLogout: () => void;
  onOpenProfile: () => void;
  isMobileOpen?: boolean;
  setIsMobileOpen?: (open: boolean) => void;
  isTvMode?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  setCurrentTab,
  branches,
  currentBranch,
  onSelectBranch,
  user,
  caixaSession,
  onOpenCaixaModal,
  onLogout,
  onOpenProfile,
  isMobileOpen,
  setIsMobileOpen,
  isTvMode,
}) => {
  const isCaixaOpen = caixaSession && caixaSession.status === 'open';
  const isAdmin = user.role === 'admin';
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [pendingBranch, setPendingBranch] = useState<StoreBranch | null>(null);
  const { addToast } = useToast();

  // Matriz (isHeadquarters) sempre primeiro, demais seguem a ordem original
  const sortedBranches = [...branches].sort((a, b) => {
    if (a.isHeadquarters && !b.isHeadquarters) return -1;
    if (!a.isHeadquarters && b.isHeadquarters) return 1;
    return 0;
  });
  const perms = user.permissions || {
    pdv: true,
    inventory: true,
    crm: true,
    finance: true,
    dashboard: true,
    settings: true,
    tvShowcase: true,
  };

  const allMenuItems = [
    { id: 'pdv', label: 'Caixa', icon: ShoppingCart, permKey: 'pdv' as const, badge: isCaixaOpen ? 'ABERTO' : 'FECHADO', badgeColor: isCaixaOpen ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20' },
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, permKey: 'dashboard' as const },
    { id: 'inventory', label: 'Estoque', icon: Package, permKey: 'inventory' as const },
    { id: 'nf-history', label: 'Nota Fiscal', icon: FileText, permKey: 'inventory' as const },
    { id: 'tv-showcase', label: 'Ofertas / TV', icon: Tv, permKey: 'tvShowcase' as const, badge: 'AO VIVO', badgeColor: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
    { id: 'finance', label: 'Financeiro', icon: DollarSign, permKey: 'finance' as const },
    { id: 'crm', label: 'Clientes/Fornecedores', icon: Users, permKey: 'crm' as const },
    { id: 'fiados', label: 'Fiados', icon: Receipt, permKey: 'crm' as const },
    { id: 'settings', label: 'Configurações', icon: Settings, permKey: 'settings' as const },
    { id: 'organizations', label: 'Organizações', icon: Building2, permKey: 'settings' as const },
  ];

  const menuItems = allMenuItems.filter((item) => {
    if (item.id === 'organizations') return !!user.superadmin;
    if (isAdmin) return true;
    if (item.id === 'settings') return perms.settings;
    if (item.id === 'tv-showcase') return perms.tvShowcase !== false;
    return perms[item.permKey];
  });

  const handleNavClick = (id: string) => {
    setCurrentTab(id);
    if (setIsMobileOpen) setIsMobileOpen(false);
  };

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 dark:bg-[#09090b] text-slate-100 dark:text-[#fafafa] flex flex-col border-r border-slate-800 dark:border-[#27272a] transition-all duration-300 ease-in-out lg:static ${
        isTvMode
          ? 'lg:hidden -translate-x-full'
          : isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}
    >
      {/* Brand & Store Selector */}
      <div className="p-4 border-b border-slate-800 dark:border-[#27272a] flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center font-bold text-white shadow-md shadow-indigo-600/30">
              HD
            </div>
            <div>
              <h1 className="font-serif-italic text-lg font-semibold tracking-tight text-slate-900 dark:text-white leading-tight flex items-center gap-1.5">
                HD-System
              </h1>
            </div>
          </div>
        </div>

        {/* Store Branch Dropdown — Admin Only */}
        {isAdmin && (
          <div className="relative">
            <select
              value={currentBranch.id}
              onChange={(e) => {
                const b = sortedBranches.find((branch) => branch.id === e.target.value);
                if (b && b.id !== currentBranch.id) setPendingBranch(b);
              }}
              className="w-full text-xs font-medium bg-slate-800/90 dark:bg-[#18181b] text-slate-200 dark:text-[#a1a1aa] border border-slate-700/80 dark:border-[#27272a] rounded-lg px-3 py-2 pr-8 appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              {sortedBranches.map((b) => (
                <option key={b.id} value={b.id} className="bg-slate-900 dark:bg-[#09090b] text-slate-200">
                  {b.isHeadquarters ? '(Matriz) ' : ''}{b.name} ({b.city})
                </option>
              ))}
            </select>
            <Building2 className="w-3.5 h-3.5 text-slate-400 dark:text-[#71717a] absolute right-2.5 top-2.5 pointer-events-none" />
          </div>
        )}
      </div>

      {/* Caixa Status Quick Box */}
      <div className="p-3 mx-3 my-3 bg-slate-800/60 dark:bg-[#18181b] rounded-xl border border-slate-700/60 dark:border-[#27272a] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className={`p-1.5 rounded-lg ${isCaixaOpen ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
            {isCaixaOpen ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
          </div>
          <div>
            <p className="text-xs lg:text-[11px] font-medium text-slate-400 dark:text-[#71717a]">Status do Caixa</p>
            <p className={`text-sm lg:text-xs font-bold ${isCaixaOpen ? 'text-emerald-400' : 'text-rose-400'}`}>
              {isCaixaOpen ? `Aberto (R$ ${caixaSession.currentCashBalance.toFixed(2)})` : 'Caixa Fechado'}
            </p>
          </div>
        </div>
        <button
          onClick={onOpenCaixaModal}
          className="text-xs lg:text-[11px] font-semibold px-2.5 py-2.5 rounded-md bg-slate-700 dark:bg-[#27272a] hover:bg-slate-600 dark:hover:bg-[#3f3f46] text-slate-200 dark:text-white transition-colors border border-slate-600/80 dark:border-transparent min-h-[44px] flex items-center justify-center"
        >
          {isCaixaOpen ? 'Gerenciar' : 'Abrir'}
        </button>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
        <p className="px-3 text-[10px] uppercase tracking-widest text-slate-500 dark:text-[#71717a] font-bold mb-2">Menu Principal</p>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className={`w-full flex items-center justify-between px-4 py-3 lg:px-3 lg:py-2.5 min-h-[44px] rounded-md text-base lg:text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-600 dark:bg-[#18181b] text-white border border-indigo-500 dark:border-[#27272a] font-semibold shadow-sm'
                  : 'text-slate-300 dark:text-[#a1a1aa] hover:text-white hover:bg-slate-800/80 dark:hover:bg-[#18181b]/60'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-6 h-6 lg:w-4 lg:h-4 rounded-md border flex items-center justify-center ${isActive ? 'border-indigo-400 dark:border-indigo-500 bg-indigo-500/20' : 'border-slate-600 dark:border-[#3f3f46]'}`}>
                  <Icon className={`w-4 h-4 lg:w-3 lg:h-3 ${isActive ? 'text-white' : 'text-slate-400 dark:text-[#a1a1aa]'}`} />
                </div>
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span className={`text-[10px] lg:text-[9px] font-bold px-2 py-0.5 rounded-full border ${item.badgeColor}`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* User Info & Actions */}
      <div className="p-3 border-t border-slate-800 dark:border-[#27272a] space-y-2">
        <div className="flex items-center justify-between p-2 rounded-xl bg-slate-800/40 dark:bg-[#18181b] border border-slate-800 dark:border-[#27272a]">
          <button
            onClick={onOpenProfile}
            className="flex items-center gap-2.5 min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 ring-1 ring-indigo-500/30 shrink-0 overflow-hidden">
              <img src={user.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'} alt={user.name} className="w-full h-full object-cover" />
            </div>
            <div className="overflow-hidden min-w-0">
              <p className="text-sm lg:text-xs font-bold truncate text-slate-200 dark:text-white">{user.name}</p>
              <p className="text-xs lg:text-[10px] text-indigo-400 font-mono truncate">
                {user.superadmin ? 'SUPER ADMIN' : isAdmin ? 'ADMINISTRADOR' : 'COLABORADOR'}
              </p>
            </div>
          </button>

          <button
            onClick={() => setConfirmLogout(true)}
            title="Sair da Conta (Logout)"
            className="p-2.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-colors shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        <ResetDataButton />

        {/* Confirm: trocar de filial */}
        <ConfirmDialog
          isOpen={!!pendingBranch}
          title="Trocar de filial?"
          message={
            pendingBranch
              ? `Deseja mudar o contexto para "${pendingBranch.name} (${pendingBranch.city})"? O estoque, vendas e financeiro passarão a exibir os dados desta filial.`
              : ''
          }
          confirmLabel="Trocar"
          onConfirm={() => {
            if (pendingBranch) {
              onSelectBranch(pendingBranch);
              addToast('success', `Filial alterada para "${pendingBranch.name}".`);
            }
            setPendingBranch(null);
          }}
          onCancel={() => setPendingBranch(null)}
        />

        {/* Confirm: sair da conta */}
        <ConfirmDialog
          isOpen={confirmLogout}
          title="Sair da conta?"
          message="Você precisará entrar novamente para usar o sistema."
          confirmLabel="Sair"
          onConfirm={() => {
            setConfirmLogout(false);
            onLogout();
          }}
          onCancel={() => setConfirmLogout(false)}
        />
      </div>
    </aside>
  );
};
