import React from 'react';
import {
  Menu,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  AlertTriangle,
  ShoppingCart,
  Sun,
  Moon,
  Lock,
  Unlock,
  LogOut,
} from 'lucide-react';
import { Product, CashRegisterSession, UserProfile, StoreBranch } from '../../types';
import { posAudio } from '../../services/audioService';

interface HeaderProps {
  onToggleMobileMenu: () => void;
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  products: Product[];
  caixaSession: CashRegisterSession;
  onOpenCaixaModal: () => void;
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
  darkMode: boolean;
  setDarkMode: (dark: boolean) => void;
  user: UserProfile;
  branches?: StoreBranch[];
  currentBranch?: StoreBranch;
  onSelectBranch?: (b: StoreBranch) => void;
  onLogout: () => void;
  isSyncConnected?: boolean;
  lastSyncTime?: Date | null;
}

export const Header: React.FC<HeaderProps> = ({
  onToggleMobileMenu,
  currentTab,
  setCurrentTab,
  products,
  caixaSession,
  onOpenCaixaModal,
  soundEnabled,
  setSoundEnabled,
  darkMode,
  setDarkMode,
  user,
  branches = [],
  currentBranch,
  onSelectBranch,
  onLogout,
  isSyncConnected = false,
  lastSyncTime = null,
}) => {
  const [isFullscreen, setIsFullscreen] = React.useState(false);

  const lowStockCount = products.filter((p) => p.currentStock <= p.minStock).length;
  const isCaixaOpen = caixaSession && caixaSession.status === 'open';

  const tabTitles: Record<string, { title: string; subtitle: string }> = {
    pdv: { title: 'Ponto de Venda (PDV)', subtitle: 'Frente de caixa rápida com leitor de código de barras' },
    dashboard: { title: 'Painel Executivo ERP', subtitle: 'Visão geral de faturamento, vendas e relatórios IA' },
    inventory: { title: 'Gestão de Estoque & Catalog', subtitle: 'Cadastro de produtos, movimentações e código de barras' },
    finance: { title: 'Financeiro & Fluxo de Caixa', subtitle: 'Contas a pagar, contas a receber e DRE gerencial' },
    crm: { title: 'Clientes & Fornecedores (CRM)', subtitle: 'Cadastro de clientes, limite de crédito e parceiros' },
    settings: { title: 'Configurações do ERP', subtitle: 'Dados da empresa, impressoras e assinatura Stripe HD-System' },
  };

  const currentInfo = tabTitles[currentTab] || { title: 'HD-System ERP', subtitle: 'Sistema de Gestão & PDV' };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        setIsFullscreen(false);
      }
    }
  };

  const handleSoundToggle = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    posAudio.enabled = next;
    if (next) posAudio.beep();
  };

  return (
    <header className="h-14 md:h-16 border-b border-slate-200 dark:border-[#27272a] bg-white/80 dark:bg-[#09090b]/80 backdrop-blur-md px-3 sm:px-5 md:px-8 flex items-center justify-between sticky top-0 z-30 transition-colors shrink-0">
      <div className="flex items-center gap-2 md:gap-4 min-w-0">
        {/* Mobile menu trigger */}
        <button
          onClick={onToggleMobileMenu}
          className="lg:hidden p-2.5 md:p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#18181b] transition-colors shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="Menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Page Title & Status Pill */}
        <div className="flex flex-wrap items-center gap-1.5 md:gap-2.5 min-w-0">
          <h2 className="font-serif-italic text-sm md:text-lg lg:text-xl text-slate-900 dark:text-white leading-tight truncate">
            {currentInfo.title}
          </h2>
          <span className={`hidden sm:inline-block px-2 py-0.5 rounded-full border text-[10px] font-bold tracking-wider uppercase shrink-0 ${
            isSyncConnected
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-500'
          }`}>
            {isSyncConnected ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-1.5 sm:gap-3 md:gap-5 shrink-0">
        <div className="hidden lg:flex items-center gap-2 text-xs text-slate-500 dark:text-[#a1a1aa]">
          <span className={`w-2 h-2 rounded-full ${isSyncConnected ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
          Sync: {isSyncConnected
            ? lastSyncTime
              ? `Agora`
              : 'Online'
            : 'Offline'
          }
        </div>

        {/* Quick PDV Shortcut Button */}
        {currentTab !== 'pdv' ? (
          <button
            onClick={() => setCurrentTab('pdv')}
            className="px-2.5 sm:px-4 py-1.5 sm:py-2 bg-slate-900 dark:bg-white text-white dark:text-black text-[10px] sm:text-xs font-bold rounded-full hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors shadow-sm flex items-center gap-1.5 sm:gap-2"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">ABRIR PDV</span>
            <span className="sm:hidden">PDV</span>
          </button>
        ) : (
          <button
            onClick={onOpenCaixaModal}
            className="px-2.5 sm:px-4 py-1.5 sm:py-2 bg-indigo-600 text-white text-[10px] sm:text-xs font-bold rounded-full hover:bg-indigo-500 transition-colors shadow-sm flex items-center gap-1.5 sm:gap-2"
          >
            {isCaixaOpen ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">CAIXA {isCaixaOpen ? 'ABERTO' : 'FECHADO'}</span>
            <span className="sm:hidden">{isCaixaOpen ? 'ABERTO' : 'FECHADO'}</span>
          </button>
        )}

        {/* Low Stock Warning Button */}
        {lowStockCount > 0 && (
          <button
            onClick={() => setCurrentTab('inventory')}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-500/30 text-xs font-semibold hover:bg-amber-500/20 transition-all"
            title={`${lowStockCount} produtos com estoque baixo`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 animate-pulse" />
            <span>{lowStockCount} Alerta{lowStockCount > 1 ? 's' : ''}</span>
          </button>
        )}

        {/* Sound FX Toggle */}
        <button
          onClick={handleSoundToggle}
          className="p-2.5 md:p-2 rounded-xl text-slate-600 dark:text-[#a1a1aa] hover:bg-slate-100 dark:hover:bg-[#18181b] transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          title={soundEnabled ? 'Sons do PDV Ativados' : 'Sons Mutos'}
        >
          {soundEnabled ? <Volume2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
        </button>

        {/* Dark/Light Theme Toggle */}
        <button
          onClick={() => setDarkMode(!darkMode)}
          className="p-2.5 md:p-2 rounded-xl text-slate-600 dark:text-[#a1a1aa] hover:bg-slate-100 dark:hover:bg-[#18181b] transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          title={darkMode ? 'Modo Claro' : 'Modo Escuro'}
        >
          {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-600" />}
        </button>

        {/* User Account & Logout */}
        <div className="pl-1.5 sm:pl-2 border-l border-slate-200 dark:border-[#27272a] flex items-center gap-1 sm:gap-2">
          <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a]">
            <img
              src={user.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'}
              alt={user.name}
              className="w-5 h-5 rounded-full object-cover"
            />
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 max-w-[100px] truncate">
              {user.name.split(' ')[0]}
            </span>
            <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              {user.role === 'admin' ? 'ADMIN' : 'COLAB'}
            </span>
          </div>

          <button
            onClick={onLogout}
            className="p-2.5 md:p-2 rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors flex items-center gap-1 text-xs font-bold min-w-[44px] min-h-[44px] justify-center"
            title="Sair da Conta (Logout)"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden md:inline">Sair</span>
          </button>
        </div>
      </div>
    </header>
  );
};
