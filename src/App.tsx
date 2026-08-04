import React, { useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense } from 'react';
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
import { OrganizationsView } from './components/Organizations/OrganizationsView';
import { CaixaModal } from './components/PDV/CaixaModal';
import { LoginModal } from './components/Auth/LoginModal';
import { UserProfileModal } from './components/Auth/UserProfileModal';
import { SyncBanner } from './components/Sync/SyncBanner';
import { storageService } from './services/storageService';
import { syncService } from './services/syncService';
import { syncQueue } from './services/syncQueueService';
import { supabase } from './lib/supabase';
import { posAudio } from './services/audioService';
import { Lock, ShieldAlert, ArrowLeft, Loader2, Store, X } from 'lucide-react';
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
import { PermissionEngine } from './lib/iam';

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

  // Filtra filiais usando PermissionEngine:
  // - Developer (superadmin): vê todas as filiais (ou de uma org específica via override)
  // - Admin: vê todas as filiais da sua organização
  // - Collaborator: vê APENAS sua filial atribuída
  const userBranches = React.useMemo(() => {
    if (!user) return branches;
    const permEngine = new PermissionEngine(user);
    if (permEngine.isDeveloper()) {
      const viewingOrg = localStorage.getItem('hd_system_viewing_org');
      if (viewingOrg) return branches.filter(b => b.organizationId === viewingOrg);
      return branches; // sem override → vê tudo
    }
    if (permEngine.isAdmin()) {
      // Admin: vê todas as filiais da sua organização
      const orgId = user.organizationId;
      return branches.filter(b => !b.organizationId || b.organizationId === orgId);
    }
    // Collaborator: vê APENAS sua filial
    return branches.filter(b => b.id === user.storeBranchId);
  }, [branches, user]);

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
    // Segurança: não deixa selecionar filial de outra organização
    if (!user?.superadmin && branch.organizationId && user?.organizationId && branch.organizationId !== user.organizationId) {
      console.warn('[Branch] Tentativa de acessar filial de outra organização:', branch.id);
      return;
    }
    storageService.setSelectedBranchId(branch.id);
    setCurrentBranch(branch);
    posAudio.click();

    // Re-hidratar dados do cloud com a nova filial para garantir isolamento
    // Completo (limpa dados da filial anterior, carrega dados da nova filial)
    const resolvedBranchId = storageService.resolveBranchId(branch.id);
    storageService.hydrateFromCloud(resolvedBranchId).then((result) => {
      if (result.ok) {
        // Armazenar branch resolvido para defense-in-depth no Realtime handler
        resolvedBranchIdRef.current = result.resolvedBranchId;
        // Forçar refresh imediato do React state após hidratação
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
        console.log(`[Branch] ✅ Dados re-carregados para filial: ${branch.name}`);

        // Re-subscribe Realtime com a nova filial para receber apenas eventos dela
        if (result.resolvedBranchId) {
          const orgId = storageService.getCurrentOrgId() || undefined;
          syncService.resubscribeRealtime(orgId, result.resolvedBranchId);
          console.log(`[Branch] Realtime re-subscribed for branch: ${branch.name}`);
        }
      }
    }).catch(() => {
      // Fallback: refresh local mesmo se cloud falhar
      setProducts(storageService.getProducts());
      setSales(storageService.getSales());
      setCaixaSession(storageService.getActiveCaixaSession());
    });
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
  // Resolved branch UUID — set after hydrateFromCloud resolves short codes.
  // Used by handleRemoteChange for branch isolation (defense-in-depth).
  const resolvedBranchIdRef = useRef<string | undefined>(undefined);

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
    // Inicializa a contagem com o que já está na fila do localStorage
    // (após F5, sem esperar um novo enqueue para o número aparecer)
    const initialCount = syncService.getPendingCount();
    setSyncPendingCount(initialCount);
    syncPendingCountRef.current = initialCount;

    const unsub = syncQueue.subscribe((count) => {
      setSyncPendingCount(count);
      syncPendingCountRef.current = count;
    });
    return unsub;
  }, []);

  // Hidrata o localStorage com os dados do Supabase e força o refresh de todo o
  // estado da UI. Extraído para ser reutilizado no LOGIN (e na restauração de
  // sessão): sem isso, orgs não-default (ex.: Plantão da Cerveja) só carregavam
  // dados após F5, porque a hidratação rodava uma única vez no mount, antes de
  // o perfil/organização do usuário estar disponível.
  const runHydration = useCallback(async () => {
    // Ler branch ID direto do localStorage (sem validação) — antes das branches
    // serem carregadas, getSelectedBranchId() retornaria '' porque getBranches()
    // ainda está vazio, causando "branch: ALL" mesmo com filial selecionada.
    const rawBranchId = storageService.getRawBranchId();
    const result = await storageService.hydrateFromCloud(rawBranchId || undefined);
    // Armazenar o branch UUID resolvido para use no Realtime e defense-in-depth
    resolvedBranchIdRef.current = result.resolvedBranchId;
    if (result.ok) {
      console.log('[HD-Sync] Cloud hydration OK');
      setIsSyncConnected(true);
      setIsOnline(true);
      isOnlineRef.current = true;
      setSyncStatus('online');
      // Force state refresh after hydration — ensures products/sales
      // loaded from cloud appear in the UI immediately (not just after F5)
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

      // Re-subscribe Realtime com o branch UUID resolvido.
      // O useEffect inicial pode ter subscrito com '' (antes da hidratação).
      if (result.resolvedBranchId) {
        const orgId = storageService.getCurrentOrgId() || undefined;
        syncService.resubscribeRealtime(orgId, result.resolvedBranchId);
        console.log(`[HD-Sync] Realtime re-subscribed with branch: ${result.resolvedBranchId}`);
      }
    } else {
      // Hydration failed — we might be offline on first load
      console.log('[HD-Sync] Cloud hydration skipped — using local data');
      setSyncStatus('offline');
    }
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

      // Regra preventiva (safeSync): payload malformado não pode derrubar o sync.
      // Um único payload null/undefined já quebrou handlers que liam row.id direto.
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        console.warn(`[HD-Sync] Ignorando payload inválido em ${table}:`, payload);
        return;
      }

      // Organization isolation: defense-in-depth no cliente
      // Se o payload tem organization_id, verificar se corresponde à org atual
      if (row?.organization_id && !storageService.isSuperAdmin()) {
        const currentOrgId = storageService.getCurrentOrgId();
        if (row.organization_id !== currentOrgId) {
          console.log(`[HD-Sync] Ignoring cross-org ${event} on ${table} (org: ${row.organization_id})`);
          return;
        }
      }
      // Branch isolation: only accept changes that belong to current branch (or have no branch)
      // Use resolvedBranchIdRef (UUID after hydration) instead of getSelectedBranchId()
      // which may return '' or a short code that doesn't match the UUID in the payload.
      const currentBranchId = resolvedBranchIdRef.current || storageService.getSelectedBranchId();
      if (currentBranchId && row?.store_branch_id) {
        // Resolve short codes (e.g. "br-01") to their UUID for comparison,
        // since Supabase now stores UUIDs but localStorage may still have short codes
        let resolvedBranchId = currentBranchId;
        if (!storageService.isUuid(currentBranchId)) {
          const branches = storageService.getBranches();
          const matched = branches.find(b => b.id === currentBranchId || b.code === currentBranchId);
          if (matched) resolvedBranchId = matched.id;
        }
        if (row.store_branch_id !== resolvedBranchId && row.store_branch_id !== null) {
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
          // sale_items are nested inside sales — a venda precisa ser buscada
          // COMPLETA no cloud antes de aplicar: o payload de sale_items só tem
          // { sale_id }, e updateSaleFromRemote com payload parcial zerava a
          // venda local (code/total/date sobrescritos com undefined/0).
          if (event !== 'DELETE' && row?.sale_id) {
            supabase.from('sales').select('*').eq('id', row.sale_id).maybeSingle().then(({ data: sale, error: saleError }) => {
              if (saleError || !sale) {
                console.warn(`[HD-Sync] ⚠️ Sale ${row.sale_id} not found for sale_items event — skipping remote update`, saleError?.message);
                return;
              }
              storageService.updateSaleFromRemote(sale);
              setLastSyncTime(new Date());
            });
          }
          break;
      }

      setLastSyncTime(new Date());
    };

    // Subscribe to Realtime — only when a user is logged in.
    // Without a logged-in user (bootstrap/offline preview), there is no
    // Supabase JWT, so server-side filters (org_id + branch_id) trigger RLS
    // errors → CHANNEL_ERROR in reconnect loop. Defer Realtime until login.
    if (user) {
      const realtimeOrgId = storageService.isSuperAdmin()
        ? (storageService.getSuperadminViewingOrg() || undefined)
        : (storageService.getCurrentOrgId() || undefined);
      const realtimeBranchId = storageService.isSuperAdmin()
        ? (storageService.getSuperadminViewingOrg() ? storageService.getSelectedBranchId() : undefined)
        : (storageService.getSelectedBranchId() || undefined);
      syncService.subscribeRealtime(handleRemoteChange, realtimeOrgId, realtimeBranchId);
    } else {
      console.log('[App] Realtime deferred — no logged-in user (bootstrap mode)');
      syncService.unsubscribeRealtime(handleRemoteChange);
    }

    // Check connection health periodically (use refs to avoid stale closures)
    const checkConnection = async () => {
      // Garante sessão Supabase válida antes do testConnection (re-login
      // silencioso com credenciais locais quando o login foi offline e não
      // deixou JWT) — sem isso, após F5 com sessão morta, o testConnection
      // falha com PGRST301 e a fila pendente nunca drena.
      await syncService.ensureSession();
      const healthy = await syncService.testConnection();
      const nowConnected = healthy || syncService.connected;
      setIsSyncConnected(nowConnected);
      setIsOnline(navigator.onLine);

      if (nowConnected) {
        const pending = syncPendingCountRef.current;
        setSyncStatus(pending > 0 ? 'syncing' : 'online');
        // Processa pendentes SEMPRE que houver e a conexão estiver OK — não
        // apenas na transição offline→online. Antes, no F5 (com isOnline já
        // true no mount), a fila existente nunca era processada: cada nova
        // escrita falhada entrava e a fila só crescia (o "541 pendentes").
        if (pending > 0) {
          console.log(`[HD-Sync] 🔄 Processing ${pending} pending operations...`);
          syncService.processPendingQueue().then((result) => {
            if (result.failed > 0) {
              setSyncStatus('error');
              console.warn(`[HD-Sync] ${result.failed} operations still pending`);
            } else {
              setSyncStatus('online');
              setLastSyncTime(new Date());
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
    runHydration();

    return () => {
      clearInterval(healthInterval);
      syncService.unsubscribeRealtime(handleRemoteChange);
    };
  }, [runHydration]);

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

  // ─── SUPABASE AUTH SESSION ──────────────────────────────────────────
  // On mount, check for existing Supabase Auth session.
  // Listen for auth state changes (sign out, token refresh, etc.).
  useEffect(() => {
    // Restore user from Supabase session — SEMPRE revalida o perfil no banco
    // (evita que uma org antiga/errada continue no localStorage após o login)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        supabase
          .rpc('get_my_profile')
        .then(({ data, error }) => {
          if (error) {
            // Falha de rede/banco: mantém o perfil local (offline-first)
            console.warn('[Auth] get_my_profile indisponível, mantendo perfil local:', error.message);
            return;
          }
          if (!data) {
            // Sessão sem registro em system_users: limpa e volta para o login
            storageService.logout();
            setUser(null);
            return;
          }
          const orgId = data.organization_id || undefined;
          if (!orgId) {
            // Conta sem organização: fail-closed — não permite operar
            console.error('[Auth] Usuário sem organização configurada. Encerrando sessão:', session.user.email);
            storageService.logout();
            setUser(null);
            return;
          }
          const restoredProfile: UserProfile = {
            id: data.id,
            name: data.name,
            email: data.email,
            role: data.role,
            organizationId: orgId,
            storeBranchId: data.store_branch_id,
            superadmin: data.superadmin || false,
            permissions: data.permissions || {
              pdv: true, inventory: true, crm: true,
              finance: false, dashboard: false, settings: false,
            },
            active: data.active,
            createdAt: data.created_at,
          };
          storageService.saveUserProfile(restoredProfile);
          setUser(restoredProfile);
          // Se a organização revalidada difere da que o mount hidratou,
          // re-hidrata (mesma classe do bug do login: as chaves da nova org
          // ainda não estão populadas no localStorage).
          const prevOrg = storageService.getCurrentOrgId();
          if (prevOrg !== orgId) {
            runHydration();
          }
        });
      }
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        storageService.logout();
        setUser(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [runHydration]);

  const handleLogout = async () => {
    await supabase.auth.signOut().catch(() => {});
    storageService.logout();
    setUser(null);
  };

  const handleLoginSuccess = (loggedUser: UserProfile) => {
    setUser(loggedUser);
    // Re-hidrata com a organização do usuário recém-logado — corrige orgs
    // não-default (ex.: Plantão da Cerveja) que só carregavam dados após F5
    // (a hidratação do mount rodava antes do perfil existir).
    runHydration();
    // IAM: redirect to the first permitted tab using PermissionEngine
    const permEngine = new PermissionEngine(loggedUser);
    if (!permEngine.isDeveloper() && !permEngine.isAdmin()) {
      const allowedTabs = ['pdv', 'inventory', 'finance', 'crm', 'dashboard', 'settings'] as const;
      const firstAllowed = allowedTabs.find(t => permEngine.canAccessTab(t));
      if (firstAllowed) {
        setActiveTab(firstAllowed);
      }
    }
  };

  // Keyboard shortcuts
  const shortcuts = useMemo(() => {
    const permEngine = user ? new PermissionEngine(user) : null;
    const canAccess = (tab: string): boolean => {
      if (!permEngine) return false;
      return permEngine.canAccessTab(tab);
    };
    // Navega para uma aba e foca a busca assim que a tela montar
    const goto = (tab: string) => {
      handleTabChange(tab);
      setTimeout(() => {
        const input = document.querySelector<HTMLInputElement>('[data-search-input]');
        if (input) { input.focus(); input.select(); }
      }, 150);
    };
    return [
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
      // Atalhos de navegação rápida: Ctrl+Shift+1 → PDV, 2 → Estoque,
      // 3 → Financeiro, 4 → Clientes (respeita permissões do usuário)
      {
        key: '1',
        ctrl: true,
        shift: true,
        handler: () => { if (canAccess('pdv')) goto('pdv'); },
        global: true,
      },
      {
        key: '2',
        ctrl: true,
        shift: true,
        handler: () => { if (canAccess('inventory')) goto('inventory'); },
        global: true,
      },
      {
        key: '3',
        ctrl: true,
        shift: true,
        handler: () => { if (canAccess('finance')) goto('finance'); },
        global: true,
      },
      {
        key: '4',
        ctrl: true,
        shift: true,
        handler: () => { if (canAccess('crm')) goto('crm'); },
        global: true,
      },
    ];
  }, [activeTab, user, handleTabChange]);

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
    if (tab === 'organizations') return !!user.superadmin;
    return false;
  };

  return (
    <ToastProvider>
    <div className={`min-h-screen font-sans bg-slate-100 dark:bg-[#09090b] text-slate-900 dark:text-[#fafafa] flex flex-col md:flex-row transition-colors duration-200`}>
      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={activeTab}
        setCurrentTab={handleTabChange}
        branches={userBranches}
        currentBranch={currentBranch}
        onSelectBranch={handleSelectBranch}
        user={user}
        caixaSession={caixaSession}
        onOpenCaixaModal={() => setIsCaixaModalOpen(true)}
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
            branches={userBranches}
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

        {/* Global viewing org indicator (superadmin) */}
        {user?.superadmin && activeTab !== 'tv-showcase' && activeTab !== 'organizations' && localStorage.getItem('hd_system_viewing_org') && (
          <div className="flex items-center justify-between px-4 sm:px-6 py-2 bg-indigo-500/10 border-b border-indigo-500/20">
            <div className="flex items-center gap-2 text-xs text-indigo-700 dark:text-indigo-300">
              <Store className="w-3.5 h-3.5" />
              <span>Visualizando organização: <strong className="font-bold">{localStorage.getItem('hd_system_viewing_org')}</strong></span>
            </div>
            <button
              onClick={() => {
                storageService.superadminSetViewingOrg(null);
                handleTabChange('organizations');
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] transition-all"
            >
              <X className="w-3 h-3" />
              <span>Sair</span>
            </button>
          </div>
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
                  financialAccounts={financialAccounts}
                  caixaSession={caixaSession}
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
                <SettingsView settings={settings} branches={userBranches} user={user} />
              )}

              {activeTab === 'tv-showcase' && (
                <TVShowcaseView
                  products={products}
                  currentBranch={currentBranch}
                  settings={settings}
                  onCloseTVMode={() => handleTabChange('pdv')}
                />
              )}

              {activeTab === 'organizations' && (
                <OrganizationsView
                  user={user}
                  onEnterOrg={(orgId) => {
                    // Trocou a org em visualização (superadmin): re-hidratar do
                    // cloud para a nova org. Antes era só visual — as partições
                    // da nova org ficavam vazias e o fallback global exibia
                    // dados stale da org anterior até o F5.
                    handleTabChange('dashboard');
                    setTimeout(() => runHydration(), 50);
                  }}
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
