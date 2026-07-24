import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Navigation/Sidebar';
import { Header } from './components/Navigation/Header';
import { PDVView } from './components/PDV/PDVView';
import { DashboardView } from './components/Dashboard/DashboardView';
import { InventoryView } from './components/Inventory/InventoryView';
import { FinanceView } from './components/Finance/FinanceView';
import { CRMView } from './components/CRM/CRMView';
import { SettingsView } from './components/Settings/SettingsView';
import { CaixaModal } from './components/PDV/CaixaModal';
import { GoogleLoginModal } from './components/Auth/GoogleLoginModal';
import { storageService } from './services/storageService';
import { posAudio } from './services/audioService';
import { Lock, ShieldAlert } from 'lucide-react';
import {
  Product,
  Category,
  Customer,
  Supplier,
  Sale,
  CashRegisterSession,
  FinancialAccount,
  SystemSettings,
  StoreBranch,
  UserProfile,
} from './types';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('pdv');
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('hd_system_dark_mode');
    return saved !== null ? saved === 'true' : true;
  });
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('hd_system_sound_enabled');
    return saved !== null ? saved === 'true' : true;
  });
  const [isCaixaModalOpen, setIsCaixaModalOpen] = useState<boolean>(false);
  const [isMobileOpen, setIsMobileOpen] = useState<boolean>(false);

  // App State loaded from storageService
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [caixaSession, setCaixaSession] = useState<CashRegisterSession>(storageService.getActiveCaixaSession());
  const [financialAccounts, setFinancialAccounts] = useState<FinancialAccount[]>([]);
  const [settings, setSettings] = useState<SystemSettings>(storageService.getSettings());
  const [branches, setBranches] = useState<StoreBranch[]>([]);
  const [currentBranch, setCurrentBranch] = useState<StoreBranch>(storageService.getSelectedBranch());
  const [user, setUser] = useState<UserProfile | null>(storageService.getUserProfile());

  // Load initial state and subscribe to reactive storage updates
  useEffect(() => {
    const refreshState = () => {
      setProducts(storageService.getProducts());
      setCategories(storageService.getCategories());
      setCustomers(storageService.getCustomers());
      setSuppliers(storageService.getSuppliers());
      setSales(storageService.getSales());
      setCaixaSession(storageService.getActiveCaixaSession());
      setFinancialAccounts(storageService.getFinancialAccounts());
      setSettings(storageService.getSettings());
      setBranches(storageService.getBranches());
      setCurrentBranch(storageService.getSelectedBranch());
      setUser(storageService.getUserProfile());
    };

    refreshState();
    const unsubscribe = storageService.subscribe(refreshState);
    return () => { unsubscribe(); };
  }, []);

  const handleSelectBranch = (branch: StoreBranch) => {
    storageService.setSelectedBranchId(branch.id);
    setCurrentBranch(branch);
    posAudio.click();
  };

  // Sync dark mode class on document element + persist to localStorage
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('hd_system_dark_mode', String(darkMode));
  }, [darkMode]);

  // Persist sound state to localStorage and sync with audioService
  useEffect(() => {
    posAudio.enabled = soundEnabled;
    localStorage.setItem('hd_system_sound_enabled', String(soundEnabled));
  }, [soundEnabled]);

  const handleLogout = () => {
    storageService.logout();
    setUser(null);
  };

  const handleLoginSuccess = (loggedUser: UserProfile) => {
    setUser(loggedUser);
    // If collaborator doesn't have permission for current activeTab, reset to pdv
    if (loggedUser.role !== 'admin') {
      const perms = loggedUser.permissions;
      if (activeTab === 'settings' && !perms?.settings) setActiveTab('pdv');
      if (activeTab === 'pdv' && !perms?.pdv) setActiveTab('inventory');
    }
  };

  // If no user is logged in, show Google Auth Modal
  if (!user) {
    return <GoogleLoginModal onLoginSuccess={handleLoginSuccess} />;
  }

  // Check current user permissions
  const isAdmin = user.role === 'admin';
  const perms = user.permissions || {
    pdv: true,
    inventory: true,
    crm: true,
    finance: true,
    dashboard: true,
    settings: true,
  };

  const hasAccessToTab = (tab: string): boolean => {
    if (isAdmin) return true;
    if (tab === 'pdv') return !!perms.pdv;
    if (tab === 'dashboard') return !!perms.dashboard;
    if (tab === 'inventory') return !!perms.inventory;
    if (tab === 'finance') return !!perms.finance;
    if (tab === 'crm') return !!perms.crm;
    if (tab === 'settings') return !!perms.settings;
    return false;
  };

  return (
    <div className={`min-h-screen font-sans bg-slate-100 dark:bg-[#09090b] text-slate-900 dark:text-[#fafafa] flex flex-col md:flex-row transition-colors duration-200`}>
      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={activeTab}
        setCurrentTab={setActiveTab}
        branches={branches}
        currentBranch={currentBranch}
        onSelectBranch={handleSelectBranch}
        user={user}
        caixaSession={caixaSession}
        onOpenCaixaModal={() => setIsCaixaModalOpen(true)}
        onResetDemo={() => storageService.resetDemoData()}
        onLogout={handleLogout}
        isMobileOpen={isMobileOpen}
        setIsMobileOpen={setIsMobileOpen}
      />

      {/* Mobile backdrop overlay when sidebar is open */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/60 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden bg-slate-50 dark:bg-[#09090b]">
        {/* Header Bar */}
        <Header
          onToggleMobileMenu={() => setIsMobileOpen((prev) => !prev)}
          currentTab={activeTab}
          setCurrentTab={setActiveTab}
          products={products}
          caixaSession={caixaSession}
          onOpenCaixaModal={() => setIsCaixaModalOpen(true)}
          soundEnabled={soundEnabled}
          setSoundEnabled={setSoundEnabled}
          darkMode={darkMode}
          setDarkMode={setDarkMode}
          user={user}
          branches={branches}
          currentBranch={currentBranch}
          onSelectBranch={handleSelectBranch}
          onLogout={handleLogout}
        />

        {/* Dynamic Main View Area */}
        <main className="flex-1 overflow-y-auto">
          {!hasAccessToTab(activeTab) ? (
            <div className="p-12 text-center space-y-4 max-w-md mx-auto my-12 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-3xl shadow-xl">
              <div className="w-16 h-16 rounded-3xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center mx-auto">
                <Lock className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Acesso Restrito
              </h3>
              <p className="text-xs text-slate-500 dark:text-[#a1a1aa]">
                Você está conectado como <strong className="text-indigo-500">{user.name}</strong> (Colaborador). Seu perfil não possui permissão para acessar o módulo <span className="uppercase font-bold">{activeTab}</span>.
              </p>
              <button
                onClick={() => setActiveTab('pdv')}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/20 transition-all"
              >
                Voltar para o PDV
              </button>
            </div>
          ) : (
            <>
              {activeTab === 'pdv' && (
                <PDVView
                  products={products}
                  categories={categories}
                  customers={customers}
                  caixaSession={caixaSession}
                  onOpenCaixaModal={() => setIsCaixaModalOpen(true)}
                  onNavigateTab={(tab) => setActiveTab(tab)}
                  settings={settings}
                  user={user}
                />
              )}

              {activeTab === 'dashboard' && (
                <DashboardView
                  sales={sales}
                  products={products}
                  caixaSession={caixaSession}
                  financialAccounts={financialAccounts}
                  onNavigateTab={(tab) => setActiveTab(tab)}
                  onOpenCaixaModal={() => setIsCaixaModalOpen(true)}
                />
              )}

              {activeTab === 'inventory' && (
                <InventoryView
                  products={products}
                  categories={categories}
                  suppliers={suppliers}
                  settings={settings}
                  user={user}
                />
              )}

              {activeTab === 'finance' && (
                <FinanceView
                  financialAccounts={financialAccounts}
                  sales={sales}
                  products={products}
                />
              )}

              {activeTab === 'crm' && (
                <CRMView customers={customers} suppliers={suppliers} />
              )}

              {activeTab === 'settings' && (
                <SettingsView settings={settings} branches={branches} user={user} />
              )}
            </>
          )}
        </main>

        {/* Footer Info Bar */}
        <footer className="h-8 md:h-9 bg-white dark:bg-[#09090b] border-t border-slate-200 dark:border-[#27272a] px-3 sm:px-6 flex items-center justify-between text-[9px] md:text-[10px] text-slate-500 dark:text-[#52525b] uppercase tracking-widest font-bold select-none shrink-0">
          <div className="flex items-center gap-3 sm:gap-6">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="hidden sm:inline">Status:</span> Operacional
            </span>
            <span className="hidden sm:inline">Google Auth: Conectado ({user.email})</span>
            <span className="hidden md:inline">Perfil: {user.role === 'admin' ? 'Administrador' : 'Colaborador Restrito'}</span>
          </div>
          <div className="hidden sm:block">
            &copy; 2026 HD-System ERP PDV
          </div>
        </footer>
      </div>

      {/* Cash Register (Caixa) Modal */}
      <CaixaModal
        isOpen={isCaixaModalOpen}
        onClose={() => setIsCaixaModalOpen(false)}
        caixaSession={caixaSession}
        user={user}
      />
    </div>
  );
};

export default App;
