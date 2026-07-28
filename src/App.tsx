import React, { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { Sidebar } from './components/Navigation/Sidebar';
import { Header } from './components/Navigation/Header';
import { PDVView } from './components/PDV/PDVView';
import { DashboardView } from './components/Dashboard/DashboardView';
import { NFHistoryView } from './components/Inventory/NFHistoryView';
import { FinanceView } from './components/Finance/FinanceView';
import { SalesHistoryView } from './components/Finance/SalesHistoryView';
import { CRMView } from './components/CRM/CRMView';
import { FiadosView } from './components/CRM/FiadosView';
import { SettingsView } from './components/Settings/SettingsView';
import { TVShowcaseView } from './components/TV/TVShowcaseView';
import { CaixaModal } from './components/PDV/CaixaModal';
import { LoginModal } from './components/Auth/LoginModal';
import { UserProfileModal } from './components/Auth/UserProfileModal';
import { SyncBanner } from './components/Sync/SyncBanner';
import { storageService } from './services/storageService';
import { syncService } from './services/syncService';
import { syncQueue } from './services/syncQueueService';
import { posAudio } from './services/audioService';
import { Lock, ShieldAlert, Wifi, WifiOff, ArrowLeft, Loader2 } from 'lucide-react';
import { GlobalSearch } from './components/shared/GlobalSearch';
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
import { ToastProvider } from './components/shared/Toast';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

// Lazy-loaded views for code splitting (reduces TDZ risk from scope-hoisting)
const InventoryView = lazy(() => import('./components/Inventory/InventoryView'));

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>(() => {
    const saved = localStorage.getItem('hd_system_active_tab');
    return saved || 'pdv';
  });
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('hd_system_dark_mode');
    if (saved !== null) return saved === 'true';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('hd_system_sound_enabled');
    return saved !== null ? saved === 'true' : true;
  });
  const [isCaixaModalOpen, setIsCaixaModalOpen] = useState<boolean>(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(false);
  const [isMobileOpen, setIsMobileOpen] = useState<boolean>(false);
  const [navHistory, setNavHistory] = useState<string[]>(['pdv']);
  const [initialBarcodeForNewProduct, setInitialBarcodeForNewProduct] = useState<string | null>(null);
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);

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
    localStorage.setItem('hd_system_active_tab', tab);
    if (navHistory[navHistory.length - 1] !== tab) {
      setNavHistory(prev => {
        const next = [...prev, tab];
        // Keep max 50 entries to prevent unbounded memory growth
        if (next.length > 50) next.splice(0, next.length - 50);
        return next;
      });
      window.history.pushState({ tab }, '', window.location.pathname);
    }
    setIsMobileOpen(false);
  };

  const handleNavigateToNewProduct = (barcode: string) => {
    setInitialBarcodeForNewProduct(barcode);
    handleTabChange('inventory');
  };

  const handleClearInitialBarcode = () => {
    setInitialBarcodeForNewProduct(null);
  };

  // App State loaded synchronously from localStorage to survive F5 refresh
  const [products, setProducts] = useState<Product[]>(() => storageService.getProducts());
  const [categories, setCategories] = useState<Category[]>(() => storageService.getCategories());
  const [customers, setCustomers] = useState<Customer[]>(() => storageService.getCustomers());
  const [suppliers, setSuppliers] = useState<Supplier[]>(() => storageService.getSuppliers());
  const [sales, setSales] = useState<Sale[]>(() => storageService.getSales());
  const [caixaSession, setCaixaSession] = useState<CashRegisterSession>(() => storageService.getActiveCaixaSession());
  const [financialAccounts, setFinancialAccounts] = useState<FinancialAccount[]>(() => storageService.getFinancialAccounts());
  const [settings, setSettings] = useState<SystemSettings>(() => storageService.getSettings());
  const [branches, setBranches] = useState<StoreBranch[]>(() => storageService.getBranches());
  const [currentBranch, setCurrentBranch] = useState<StoreBranch>(() => storageService.getSelectedBranch());
  const [user, setUser] = useState<UserProfile | null>(() => storageService.getUserProfile());

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

    // Dynamic import to make syncTest.ts available from console as window.__syncTest
    import('./services/syncTest').catch(() => {});

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

  // Listen for system preference changes
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setDarkMode(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Persist sound state to localStorage and sync with audioService
  useEffect(() => {
    posAudio.enabled = soundEnabled;
    localStorage.setItem('hd_system_sound_enabled', String(soundEnabled));
  }, [soundEnabled]);

  // ─── SUPABASE REALTIME + OFFLINE-FIRST SYNC ────────────────────
  const [isSyncConnected, setIsSyncConnected] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date());
  const [syncPendingCount, setSyncPendingCount] = useState<number>(0);
  const [syncStatus, setSyncStatus] = useState<'offline' | 'connecting' | 'syncing' | 'online' | 'error'>('connecting');

  // Refs to avoid stale closures in intervals
  const isOnlineRef = useRef(isOnline);
  const syncPendingCountRef = useRef(syncPendingCount);

  // Keep refs in sync
  useEffect(() => { isOnlineRef.current = isOnline; }, [isOnline]);
  useEffect(() => { syncPendingCountRef.current = syncPendingCount; }, [syncPendingCount]);

  // Listen for connection changes from syncService
  useEffect(() => {
    const unsub = syncService.subscribeConnection((online) => {
      setIsOnline(online);
      isOnlineRef.current = online;
      if (online) {
        setSyncStatus('connecting');
      } else {
        setSyncStatus('offline');
      }
    });
    return unsub;
  }, []);

  // Listen for browser online/offline events
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Listen for pending count changes from syncQueue
  useEffect(() => {
    const unsub = syncQueue.subscribe((count) => {
      setSyncPendingCount(count);
      syncPendingCountRef.current = count;
    });
    return unsub;
  }, []);

  useEffect(() => {
    // Handler for remote changes from Supabase Realtime
    const handleRemoteChange = (table: string, payload: any) => {
      // If we're receiving remote changes, we're connected
      setIsSyncConnected(true);
      setIsOnline(true);
      isOnlineRef.current = true;
      setSyncStatus('online');
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
          if (event === 'DELETE') storageService.removeBranchFromRemote(row.id);
          else storageService.updateBranchFromRemote(row);
          break;
        case 'stock_movements':
          if (event === 'DELETE') storageService.removeStockMovementFromRemote(row.id);
          else storageService.updateStockMovementFromRemote(row);
          break;
        case 'system_users':
          if (event === 'DELETE') storageService.removeUserFromRemote(row.id);
          else storageService.updateUserFromRemote(row);
          break;
        case 'system_settings':
          storageService.updateSettingsFromRemote(row);
          break;
        case 'sale_items':
          // sale_items are nested inside sales — forward to updateSaleFromRemote
          if (event !== 'DELETE') {
            storageService.updateSaleFromRemote({ id: row.sale_id });
          }
          break;
      }

      setLastSyncTime(new Date());
    };

    // Subscribe to Realtime
    syncService.subscribeRealtime(handleRemoteChange);

    // Check connection health periodically (use refs to avoid stale closures)
    const checkConnection = async () => {
      const healthy = await syncService.testConnection();
      const nowConnected = healthy || syncService.connected;
      setIsSyncConnected(nowConnected);
      setIsOnline(navigator.onLine);

      if (nowConnected) {
        const pending = syncPendingCountRef.current;
        setSyncStatus(pending > 0 ? 'syncing' : 'online');
        // If we just came back online and there are pending operations, process them
        if (!isOnlineRef.current && pending > 0) {
          console.log(`[HD-Sync] 🔄 Connection restored — processing ${pending} pending operations`);
          syncService.processPendingQueue().then((result) => {
            setSyncStatus('online');
            setLastSyncTime(new Date());
            if (result.failed > 0) {
              setSyncStatus('error');
              console.warn(`[HD-Sync] ${result.failed} operations still pending`);
            }
          });
        }
        isOnlineRef.current = true;
      } else {
        setSyncStatus('offline');
        isOnlineRef.current = false;
      }
    };
    checkConnection();
    const healthInterval = setInterval(checkConnection, 30000);

    // Initial hydration from Supabase (load cloud data into localStorage)
    const branchId = storageService.getSelectedBranchId();
    storageService.hydrateFromCloud(branchId || undefined).then((ok) => {
      if (ok) {
        console.log('[HD-Sync] Initial cloud hydration OK');
        setIsSyncConnected(true);
        setIsOnline(true);
        isOnlineRef.current = true;
        setSyncStatus('online');
      } else {
        // Hydration failed — we might be offline on first load
        console.log('[HD-Sync] Cloud hydration skipped — using local data');
        setSyncStatus('offline');
      }
    });

    return () => {
      clearInterval(healthInterval);
      syncService.unsubscribeRealtime(handleRemoteChange);
    };
  }, []);

  // Process pending queue when coming back online
  useEffect(() => {
    if (isOnline && syncPendingCount > 0) {
      setSyncStatus('syncing');
      syncService.processPendingQueue().then((result) => {
        setSyncStatus(result.failed > 0 ? 'error' : 'online');
        setLastSyncTime(new Date());
      });
    }
  }, [isOnline]);

  // Update lastSyncTime every 30s for UI display
  useEffect(() => {
    const interval = setInterval(() => setLastSyncTime(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = () => {
    storageService.logout();
    setUser(null);
  };

  const handleLoginSuccess = (loggedUser: UserProfile) => {
    setUser(loggedUser);
    // Redirect to the first permitted tab
    if (loggedUser.role !== 'admin') {
      const allowedTabs = ['pdv', 'inventory', 'finance', 'crm', 'dashboard', 'settings'] as const;
      const perms = loggedUser.permissions;
      const hasAccess = (tab: string): boolean => {
        if (tab === 'pdv') return !!perms?.pdv;
        if (tab === 'inventory') return !!perms?.inventory;
        if (tab === 'finance') return !!perms?.finance;
        if (tab === 'crm') return !!perms?.crm;
        if (tab === 'dashboard') return !!perms?.dashboard;
        if (tab === 'settings') return !!perms?.settings;
        return false;
      };
      const firstAllowed = allowedTabs.find(t => hasAccess(t));
      if (firstAllowed) {
        setActiveTab(firstAllowed);
      }
    }
  };

  // Keyboard shortcuts
  const shortcuts = useMemo(() => [
    {
      key: 'n',
      ctrl: true,
      handler: () => {
        if (activeTab === 'inventory') {
          window.dispatchEvent(new CustomEvent('hd:new-product'));
        }
      },
    },
    {
      key: 'f',
      ctrl: true,
      handler: () => {
        const input = document.querySelector<HTMLInputElement>('[data-search-input]');
        if (input) { input.focus(); input.select(); }
      },
    },
    {
      key: 'F11',
      handler: () => {
        if (activeTab === 'tv-showcase') {
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
          } else {
            document.exitFullscreen().catch(() => {});
          }
        }
      },
      global: true,
    },
    {
      key: 'k',
      ctrl: true,
      handler: () => setIsGlobalSearchOpen(prev => !prev),
      global: true,
    },
  ], [activeTab]);

  useKeyboardShortcuts(shortcuts, [activeTab]);

  // If no user is logged in, show Google Auth Modal
  if (!user) {
    return <LoginModal onLoginSuccess={handleLoginSuccess} />;
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
    if (tab === 'tv-showcase') return perms.tvShowcase !== false;
    if (tab === 'settings') return !!perms.settings;
    return false;
  };

  return (
    <ToastProvider>
      {/* Connection indicator */}
      {!isOnline && (
        <div className="fixed top-2 right-2 z-[9998] px-3 py-1.5 rounded-xl bg-rose-600 text-white text-[10px] font-bold shadow-lg flex items-center gap-1.5 animate-fadeIn">
          <WifiOff className="w-3 h-3" />
          <span>Sem conexão</span>
        </div>
      )}
      {isOnline && (
        <div className="fixed top-2 right-2 z-[9998] px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[9px] font-medium shadow-sm no-print flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>Sync {Math.floor((Date.now() - lastSyncTime.getTime()) / 60000)}min</span>
        </div>
      )}
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
        onOpenProfile={() => setIsProfileModalOpen(true)}
        isMobileOpen={isMobileOpen}
        setIsMobileOpen={setIsMobileOpen}
        isTvMode={activeTab === 'tv-showcase'}
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
        {/* Header Bar — hidden on TV mode */}
        {activeTab !== 'tv-showcase' && (
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
            syncStatus={syncStatus}
            syncPendingCount={syncPendingCount}
          />
        )}

        {/* Sync Status Banner — hidden on TV mode */}
        {activeTab !== 'tv-showcase' && (
          <SyncBanner
            status={syncStatus}
            pendingCount={syncPendingCount}
            onRetry={() => {
              setSyncStatus('syncing');
              syncService.retryFailed();
            }}
            onDismiss={() => {
              if (syncStatus === 'error') setSyncStatus('online');
            }}
          />
        )}

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
              {(() => {
                const fallbackTab = (['pdv', 'inventory', 'finance', 'crm', 'dashboard', 'settings'] as const)
                  .find(t => hasAccessToTab(t)) || 'pdv';
                return (
                  <button
                    onClick={() => setActiveTab(fallbackTab)}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/20 transition-all"
                  >
                    Voltar para o {fallbackTab === 'pdv' ? 'PDV' : fallbackTab === 'inventory' ? 'Estoque' : fallbackTab === 'finance' ? 'Financeiro' : fallbackTab === 'crm' ? 'CRM' : fallbackTab === 'dashboard' ? 'Dashboard' : 'Configurações'}
                  </button>
                );
              })()}
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
                  onNavigateToNewProduct={handleNavigateToNewProduct}
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
                <Suspense fallback={
                  <div className="p-6 space-y-4 animate-pulse">
                    <div className="h-8 bg-slate-200 dark:bg-[#27272a] rounded-xl w-48" />
                    <div className="h-12 bg-slate-200 dark:bg-[#27272a] rounded-xl w-full" />
                    <div className="space-y-3">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="h-16 bg-slate-200 dark:bg-[#27272a] rounded-xl w-full" />
                      ))}
                    </div>
                  </div>
                }>
                  <InventoryView
                    products={products}
                    categories={categories}
                    suppliers={suppliers}
                    settings={settings}
                    user={user}
                    initialBarcode={initialBarcodeForNewProduct}
                    onClearInitialBarcode={handleClearInitialBarcode}
                  />
                </Suspense>
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

              {activeTab === 'tv-showcase' && (
                <TVShowcaseView
                  products={products}
                  currentBranch={currentBranch}
                  settings={settings}
                  onCloseTVMode={() => handleTabChange('pdv')}
                />
              )}
            </>
          )}
        </main>

        {/* Footer Info Bar — hidden on TV mode */}
        {activeTab !== 'tv-showcase' && (
          <footer className="h-8 md:h-9 safe-area-bottom bg-white dark:bg-[#09090b] border-t border-slate-200 dark:border-[#27272a] px-3 sm:px-6 flex items-center justify-between text-[9px] md:text-[10px] text-slate-500 dark:text-[#52525b] uppercase tracking-widest font-bold select-none shrink-0">
            <div className="flex items-center gap-3 sm:gap-6">
              <span className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${isSyncConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></span>
                <span className="hidden sm:inline">Sync:</span> {isSyncConnected ? 'Online' : 'Offline'}
              </span>
              <span className="hidden sm:inline">Conectado ({user.email})</span>
              <span className="hidden md:inline">Perfil: {user.role === 'admin' ? 'Administrador' : 'Colaborador Restrito'}</span>
            </div>
            <div className="hidden sm:block">
              &copy; 2026 HD-System ERP PDV
            </div>
          </footer>
        )}
      </div>

      {/* Cash Register (Caixa) Modal */}
      <CaixaModal
        isOpen={isCaixaModalOpen}
        onClose={() => setIsCaixaModalOpen(false)}
        caixaSession={caixaSession}
        user={user}
      />

      {/* User Profile Modal */}
      <UserProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        user={user}
        onUserUpdated={(updatedUser) => {
          setUser(updatedUser);
        }}
      />
    </div>
    </ToastProvider>
  );
};

export default App;
