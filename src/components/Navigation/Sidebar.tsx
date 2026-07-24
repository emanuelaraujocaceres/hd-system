import React from 'react';
import {
  ShoppingCart,
  LayoutDashboard,
  Package,
  DollarSign,
  Users,
  FileText,
  Settings,
  Building2,
  Lock,
  Unlock,
  ChevronDown,
  Sparkles,
  RefreshCw,
  LogOut,
} from 'lucide-react';
import { StoreBranch, UserProfile, CashRegisterSession } from '../../types';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  branches: StoreBranch[];
  currentBranch: StoreBranch;
  onSelectBranch: (branch: StoreBranch) => void;
  user: UserProfile;
  caixaSession: CashRegisterSession;
  onOpenCaixaModal: () => void;
  onResetDemo: () => void;
  isMobileOpen?: boolean;
  setIsMobileOpen?: (open: boolean) => void;
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
  onResetDemo,
  isMobileOpen,
  setIsMobileOpen,
}) => {
  const isCaixaOpen = caixaSession && caixaSession.status === 'open';

  const menuItems = [
    { id: 'pdv', label: 'PDV / Vendas', icon: ShoppingCart, badge: isCaixaOpen ? 'ABERTO' : 'FECHADO', badgeColor: isCaixaOpen ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20' },
    { id: 'dashboard', label: 'Dashboard ERP', icon: LayoutDashboard },
    { id: 'inventory', label: 'Estoque & Produtos', icon: Package },
    { id: 'finance', label: 'Financeiro & DRE', icon: DollarSign },
    { id: 'crm', label: 'Clientes & CRM', icon: Users },
    { id: 'settings', label: 'Configurações', icon: Settings },
  ];

  const handleNavClick = (id: string) => {
    setCurrentTab(id);
    if (setIsMobileOpen) setIsMobileOpen(false);
  };

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 dark:bg-[#09090b] text-slate-100 dark:text-[#fafafa] flex flex-col border-r border-slate-800 dark:border-[#27272a] transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 ${
        isMobileOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      {/* Brand & Store Selector */}
      <div className="p-4 border-b border-slate-800 dark:border-[#27272a] flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center font-bold text-white shadow-md shadow-indigo-600/30">
              S
            </div>
            <div>
              <h1 className="font-serif-italic text-lg font-semibold tracking-tight text-slate-900 dark:text-white leading-tight flex items-center gap-1.5">
                SaaS ERP <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 font-sans font-bold">PRO</span>
              </h1>
            </div>
          </div>
        </div>

        {/* Store Branch Dropdown */}
        <div className="relative">
          <select
            value={currentBranch.id}
            onChange={(e) => {
              const b = branches.find((branch) => branch.id === e.target.value);
              if (b) onSelectBranch(b);
            }}
            className="w-full text-xs font-medium bg-slate-800/90 dark:bg-[#18181b] text-slate-200 dark:text-[#a1a1aa] border border-slate-700/80 dark:border-[#27272a] rounded-lg px-3 py-2 pr-8 appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id} className="bg-slate-900 dark:bg-[#09090b] text-slate-200">
                {b.name} ({b.city})
              </option>
            ))}
          </select>
          <Building2 className="w-3.5 h-3.5 text-slate-400 dark:text-[#71717a] absolute right-2.5 top-2.5 pointer-events-none" />
        </div>
      </div>

      {/* Caixa Status Quick Box */}
      <div className="p-3 mx-3 my-3 bg-slate-800/60 dark:bg-[#18181b] rounded-xl border border-slate-700/60 dark:border-[#27272a] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className={`p-1.5 rounded-lg ${isCaixaOpen ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
            {isCaixaOpen ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
          </div>
          <div>
            <p className="text-[11px] font-medium text-slate-400 dark:text-[#71717a]">Status do Caixa</p>
            <p className={`text-xs font-bold ${isCaixaOpen ? 'text-emerald-400' : 'text-rose-400'}`}>
              {isCaixaOpen ? `Aberto (R$ ${caixaSession.currentCashBalance.toFixed(2)})` : 'Caixa Fechado'}
            </p>
          </div>
        </div>
        <button
          onClick={onOpenCaixaModal}
          className="text-[11px] font-semibold px-2.5 py-1.5 rounded-md bg-slate-700 dark:bg-[#27272a] hover:bg-slate-600 dark:hover:bg-[#3f3f46] text-slate-200 dark:text-white transition-colors border border-slate-600/80 dark:border-transparent"
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
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-600 dark:bg-[#18181b] text-white border border-indigo-500 dark:border-[#27272a] font-semibold shadow-sm'
                  : 'text-slate-300 dark:text-[#a1a1aa] hover:text-white hover:bg-slate-800/80 dark:hover:bg-[#18181b]/60'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-4 h-4 rounded-md border flex items-center justify-center ${isActive ? 'border-indigo-400 dark:border-indigo-500 bg-indigo-500/20' : 'border-slate-600 dark:border-[#3f3f46]'}`}>
                  <Icon className={`w-3 h-3 ${isActive ? 'text-white' : 'text-slate-400 dark:text-[#a1a1aa]'}`} />
                </div>
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${item.badgeColor}`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* User Info & Demo Reset */}
      <div className="p-3 border-t border-slate-800 dark:border-[#27272a] space-y-2">
        <div className="flex items-center gap-3 p-2 rounded-lg bg-slate-800/40 dark:bg-[#18181b] border border-slate-800 dark:border-[#27272a] hover:bg-slate-800/80 dark:hover:bg-[#27272a]/50 cursor-pointer transition-colors">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 ring-1 ring-indigo-500/30 shrink-0 overflow-hidden">
            <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
          </div>
          <div className="overflow-hidden">
            <p className="text-xs font-medium truncate text-slate-200 dark:text-white">{user.name}</p>
            <p className="text-[10px] text-slate-400 dark:text-[#71717a] truncate">Admin Enterprise</p>
          </div>
        </div>

        <button
          onClick={onResetDemo}
          title="Restaurar dados iniciais de demonstração"
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-400 dark:text-[#71717a] hover:text-slate-200 dark:hover:text-white hover:bg-slate-800/60 dark:hover:bg-[#18181b] border border-slate-800/60 dark:border-[#27272a] transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Resetar Dados Demo</span>
        </button>
      </div>
    </aside>
  );
};
