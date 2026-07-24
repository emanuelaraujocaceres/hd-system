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
  Sparkles,
  Lock,
  Unlock,
} from 'lucide-react';
import { Product, CashRegisterSession } from '../../types';
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
}) => {
  const [isFullscreen, setIsFullscreen] = React.useState(false);

  const lowStockCount = products.filter((p) => p.currentStock <= p.minStock).length;
  const isCaixaOpen = caixaSession && caixaSession.status === 'open';

  const tabTitles: Record<string, { title: string; subtitle: string }> = {
    pdv: { title: 'Ponto de Venda (PDV)', subtitle: 'Frente de caixa rápida com leitor e emissão NFC-e' },
    dashboard: { title: 'Painel Executivo ERP', subtitle: 'Visão geral de faturamento, vendas e relatórios IA' },
    inventory: { title: 'Gestão de Estoque & Catalog', subtitle: 'Cadastro de produtos, movimentações e código de barras' },
    finance: { title: 'Financeiro & Fluxo de Caixa', subtitle: 'Contas a pagar, contas a receber e DRE gerencial' },
    crm: { title: 'Clientes & Fornecedores (CRM)', subtitle: 'Cadastro de clientes, limite de crédito e parceiros' },
    fiscal: { title: 'Módulo Fiscal & NFC-e', subtitle: 'Histórico de cupons fiscais emitidos e DANFE' },
    settings: { title: 'Configurações do ERP', subtitle: 'Dados da empresa, impressoras e dados do SaaS' },
  };

  const currentInfo = tabTitles[currentTab] || { title: 'Nexus ERP', subtitle: 'Sistema de Gestão SaaS' };

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
    <header className="h-16 border-b border-slate-200 dark:border-[#27272a] bg-white/80 dark:bg-[#09090b]/80 backdrop-blur-md px-6 md:px-8 flex items-center justify-between sticky top-0 z-30 transition-colors">
      <div className="flex items-center gap-4">
        {/* Mobile menu trigger */}
        <button
          onClick={onToggleMobileMenu}
          className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#18181b] transition-colors"
          aria-label="Menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Page Title & Status Pill */}
        <div className="flex items-center gap-3">
          <h2 className="font-serif-italic text-xl text-slate-900 dark:text-white leading-tight">
            {currentInfo.title}
          </h2>
          <span className="px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-500 text-[10px] font-bold tracking-wider uppercase">
            ONLINE
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3 md:gap-5">
        <div className="hidden lg:flex items-center gap-2 text-xs text-slate-500 dark:text-[#a1a1aa]">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          Sincronizado: Agora
        </div>

        {/* Quick PDV Shortcut Button */}
        {currentTab !== 'pdv' ? (
          <button
            onClick={() => setCurrentTab('pdv')}
            className="px-4 py-2 bg-slate-900 dark:bg-white text-white dark:text-black text-xs font-bold rounded-full hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors shadow-sm flex items-center gap-2"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>ABRIR PDV</span>
          </button>
        ) : (
          <button
            onClick={onOpenCaixaModal}
            className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-full hover:bg-indigo-500 transition-colors shadow-sm flex items-center gap-2"
          >
            {isCaixaOpen ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
            <span>CAIXA {isCaixaOpen ? 'ABERTO' : 'FECHADO'}</span>
          </button>
        )}

        {/* Low Stock Warning Button */}
        {lowStockCount > 0 && (
          <button
            onClick={() => setCurrentTab('inventory')}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-500/30 text-xs font-semibold hover:bg-amber-500/20 transition-all"
            title={`${lowStockCount} produtos com estoque baixo`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 animate-pulse" />
            <span>{lowStockCount} Alerta{lowStockCount > 1 ? 's' : ''}</span>
          </button>
        )}

        {/* Sound FX Toggle */}
        <button
          onClick={handleSoundToggle}
          className="p-2 rounded-xl text-slate-600 dark:text-[#a1a1aa] hover:bg-slate-100 dark:hover:bg-[#18181b] transition-colors"
          title={soundEnabled ? 'Sons do PDV Ativados' : 'Sons Mutos'}
        >
          {soundEnabled ? <Volume2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
        </button>

        {/* Fullscreen Mode */}
        <button
          onClick={toggleFullscreen}
          className="p-2 rounded-xl text-slate-600 dark:text-[#a1a1aa] hover:bg-slate-100 dark:hover:bg-[#18181b] transition-colors hidden sm:block"
          title={isFullscreen ? 'Sair da Tela Cheia' : 'Modo Tela Cheia (PDV)'}
        >
          {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
        </button>

        {/* Dark/Light Theme Toggle */}
        <button
          onClick={() => setDarkMode(!darkMode)}
          className="p-2 rounded-xl text-slate-600 dark:text-[#a1a1aa] hover:bg-slate-100 dark:hover:bg-[#18181b] transition-colors"
          title={darkMode ? 'Modo Claro' : 'Modo Escuro'}
        >
          {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-600" />}
        </button>
      </div>
    </header>
  );
};
