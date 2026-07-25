import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Navigation/Sidebar';
import { Header } from './components/Navigation/Header';
import { PDVView } from './components/PDV/PDVView';
import { DashboardView } from './components/Dashboard/DashboardView';
import { InventoryView } from './components/Inventory/InventoryView';
import { NFHistoryView } from './components/Inventory/NFHistoryView';
import { FinanceView } from './components/Finance/FinanceView';
import { SalesHistoryView } from './components/Finance/SalesHistoryView';
import { CRMView } from './components/CRM/CRMView';
import { FiadosView } from './components/CRM/FiadosView';
import { SettingsView } from './components/Settings/SettingsView';
import { CaixaModal } from './components/PDV/CaixaModal';
import { GoogleLoginModal } from './components/Auth/GoogleLoginModal';
import { storageService } from './services/storageService';
import { syncService } from './services/syncService';
import { posAudio } from './services/audioService';
import { Lock, ShieldAlert, Wifi, WifiOff, ArrowLeft } from 'lucide-react';
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
  const [navHistory, setNavHistory] = useState<string[]>(['pdv']);

  // Handle mobile back button - navigate to previous page instead of closing app
  useEffect(() => {
    const handleBackButton = (e: PopStateEvent) => {
      if (navHistory.length > 1) {
        e.preventDefault();
        const previousTab = navHistory[navHistory.length - 2];
        setActiveTab(previousTab);
        setNavHistory(prev => prev.slice(0, -1));
      }
    };
    window.addEventListener('popstate', handleBackButton);
    return () => window.removeEventListener('popstate', handleBackButton);
  }, [navHistory]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (navHistory[navHistory.length - 1] !== tab) {
      setNavHistory(prev => [...prev, tab]);
      window.history.pushState({ tab }, '', window.location.pathname);
    }
    setIsMobileOpen(false);
  };

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

  // ─── SUPABASE REALTIME SYNC ──────────────────────────────────────
  const [isSyncConnected, setIsSyncConnected] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  useEffect(() => {
    // Handler for remote changes from Supabase Realtime
    const handleRemoteChange = (table: string, payload: any) => {
      // If we're receiving remote changes, we're connected
      setIsSyncConnected(true);
      const event = payload.eventType; // INSERT, UPDATE, DELETE
      const row = payload.new || payload.old;

      // Branch isolation: only accept changes that belong to current branch (or have no branch)
      const currentBranchId = storageService.getSelectedBranchId();
      if (currentBranchId && row?.store_branch_id) {
        if (row.store_branch_id !== currentBranchId && row.store_branch_id !== null) {
          console.log(`[HD-Sync] Ignoring cross-branch ${event} on ${table} (branch: ${row.store_branch_id})`);
          return;
        }
      }

      console.log(`[HD-Sync] Remote ${event} on ${table}:`, row?.id);

      switch (table) {
        case 'products':
          if (event === 'DELETE') storageService.removeProductFromRemote(row.id);
          else storageService.updateProductFromRemote(row);
          break;
        case 'categories':
          if (event === 'DELETE') storageService.removeCategoryFromRemote(row.id);
          else storageService.updateCategoryFromRemote(row);
          break;
        case 'customers':
          if (event === 'DELETE') storageService.removeCustomerFromRemote(row.id);
          else storageService.updateCustomerFromRemote(row);
          break;
        case 'suppliers':
          if (event === 'DELETE') storageService.removeSupplierFromRemote(row.id);
          else storageService.updateSupplierFromRemote(row);
          break;
        case 'sales':
          if (event === 'DELETE') storageService.removeSaleFromRemote(row.id);
          else storageService.updateSaleFromRemote(row);
          break;
        case 'financial_transactions':
          if (event === 'DELETE') storageService.removeFinancialFromRemote(row.id);
          else storageService.updateFinancialFromRemote(row);
          break;
        case 'cash_sessions':
          if (event === 'DELETE') storageService.removeCaixaFromRemote(row.id);
          else storageService.updateCaixaFromRemote(row);
          break;
        case 'store_branches':
          storageService.updateBranchFromRemote(row);
          break;
        case 'stock_movements':
          storageService.updateStockMovementFromRemote(row);
          break;
        case 'system_users':
          if (event === 'DELETE') storageService.removeUserFromRemote(row.id);
          else storageService.updateUserFromRemote(row);
          break;
        case 'system_settings':
          storageService.updateSettingsFromRemote(row);
          break;
      }

      setLastSyncTime(new Date());
    };

    // Subscribe to Realtime
    syncService.subscribeRealtime(handleRemoteChange);

    // Check connection health periodically
    const checkConnection = async () => {
      const healthy = await syncService.testConnection();
      // Consider connected if either the health check passed or the realtime channel is active
      setIsSyncConnected(healthy || syncService.connected);
    };
    checkConnection();
    const healthInterval = setInterval(checkConnection, 30000);

    // Initial hydration from Supabase (load cloud data into localStorage)
    const branchId = storageService.getSelectedBranchId();
    storageService.hydrateFromCloud(branchId || undefined).then((ok) => {
      if (ok) {
        console.log('[HD-Sync] Initial cloud hydration OK');
        setIsSyncConnected(true);
      }
    });

    return () => {
      clearInterval(healthInterval);
      syncService.unsubscribeRealtime(handleRemoteChange);
    };
  }, []);

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
    if (tab === 'nf-history') return !!perms.inventory;
    if (tab === 'finance') return !!perms.finance;
    if (tab === 'sales-history') return !!perms.finance;
    if (tab === 'crm') return !!perms.crm;
    if (tab === 'fiados') return !!perms.crm;
    if (tab === 'settings') return !!perms.settings;
    return false;
  };

  return (
    <div className={`min-h-screen font-sans bg-slate-100 dark:bg-[#09090b] text-slate-900 dark:text-[#fafafa] flex flex-col md:flex-row transition-colors duration-200`}>
      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={activeTab}
        setCurrentTab={handleTabChange}
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
      <div className="flex-1 flex flex-col min-w-0 h-dynamic overflow-hidden bg-slate-50 dark:bg-[#09090b]">
        {/* Header Bar */}
        <Header
          onToggleMobileMenu={() => setIsMobileOpen((prev) => !prev)}
          currentTab={activeTab}
          setCurrentTab={handleTabChange}
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
          isSyncConnected={isSyncConnected}
          lastSyncTime={lastSyncTime}
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
                  onNavigateTab={handleTabChange}
                  settings={settings}
                  user={user}
                />
              )}

              {activeTab === 'dashboard' && (
                <DashboardView
                  sales={sales}
                  products={products}
                  user={user}
                  onNavigateTab={handleTabChange}
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

              {activeTab === 'nf-history' && (
                <NFHistoryView products={products} suppliers={suppliers} />
              )}

              {activeTab === 'finance' && (
                <FinanceView
                  financialAccounts={financialAccounts}
                  sales={sales}
                  products={products}
                  user={user}
                  onNavigateTab={handleTabChange}
                />
              )}

              {activeTab === 'sales-history' && (
                <SalesHistoryView sales={sales} user={user} />
              )}

              {activeTab === 'crm' && (
                <CRMView customers={customers} suppliers={suppliers} user={user} />
              )}

              {activeTab === 'fiados' && (
                <FiadosView sales={sales} customers={customers} user={user} />
              )}

              {activeTab === 'settings' && (
                <SettingsView settings={settings} branches={branches} user={user} />
              )}
            </>
          )}
        </main>

        {/* Footer Info Bar */}
        <footer className="h-8 md:h-9 safe-area-bottom bg-white dark:bg-[#09090b] border-t border-slate-200 dark:border-[#27272a] px-3 sm:px-6 flex items-center justify-between text-[9px] md:text-[10px] text-slate-500 dark:text-[#52525b] uppercase tracking-widest font-bold select-none shrink-0">
          <div className="flex items-center gap-3 sm:gap-6">
            <span className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${isSyncConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></span>
              <span className="hidden sm:inline">Sync:</span> {isSyncConnected ? 'Online' : 'Offline'}
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
