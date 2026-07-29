import {
  Product,
  Category,
  Customer,
  Supplier,
  Sale,
  CashRegisterSession,
  FinancialAccount,
  StoreBranch,
  SystemSettings,
  UserProfile,
  StockMovement,
  SubscriptionInfo,
} from '../types';
import {
  INITIAL_PRODUCTS,
  INITIAL_CATEGORIES,
  INITIAL_CUSTOMERS,
  INITIAL_SUPPLIERS,
  INITIAL_SALES,
  INITIAL_CAIXA_SESSION,
  INITIAL_FINANCIAL_ACCOUNTS,
  INITIAL_BRANCHES,
  INITIAL_USER,
  INITIAL_USERS,
  INITIAL_SETTINGS,
  INITIAL_SUBSCRIPTION,
  DEFAULT_ORG_ID,
  BRANCH_UUIDS,
  PRODUCT_UUIDS,
  CATEGORY_UUIDS,
  CUSTOMER_UUIDS,
  SUPPLIER_UUIDS,
  SALE_UUIDS,
  USER_UUIDS,
  CASH_SESSION_UUIDS,
  FINANCIAL_UUIDS,
} from '../data/mockData';
import { syncService } from './syncService';
import { supabase } from '../lib/supabase';
import { undoManager } from '../lib/undoManager';

const KEYS = {
  PRODUCTS: 'hd_system_products',
  CATEGORIES: 'hd_system_categories',
  CUSTOMERS: 'hd_system_customers',
  SUPPLIERS: 'hd_system_suppliers',
  SALES: 'hd_system_sales',
  SALE_ITEMS: 'hd_system_sale_items',
  CAIXA: 'hd_system_caixa_session',
  CAIXA_HISTORY: 'hd_system_caixa_history',
  FINANCIAL: 'hd_system_financial_accounts',
  MOVEMENTS: 'hd_system_stock_movements',
  BRANCHES: 'hd_system_branches',
  USER: 'hd_system_user_profile',
  USERS_LIST: 'hd_system_users_list',
  LOGGED_IN_EMAIL: 'hd_system_logged_in_email',
  SETTINGS: 'hd_system_settings',
  SUBSCRIPTION: 'hd_system_subscription',
  CREDIT_PAYMENTS: 'hd_system_credit_payments',
};

class StorageService {
  private listeners: Set<() => void> = new Set();
  private notifyTimer: ReturnType<typeof setTimeout> | null = null;
  private migrated = false;

  // ─── UUID HELPERS ──────────────────────────────────────────────────────
  // Gera um UUID v4 para novos registros (browser e Node 19+)
  private static newId(): string {
    return crypto.randomUUID();
  }

  // Regex para validar UUID (versão 3, 4, ou 5)
  private static UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // Retorna o ID como UUID válido: se já for UUID, mantém; senão gera um novo.
  // AVISO: IDs TEXT legados que não constam no mapa de migração serão
  // convertidos para UUIDs aleatórios, perdendo a referência textual.
  private static ensureUuid(id: string | undefined | null): string {
    if (id && StorageService.UUID_RE.test(id)) return id;
    return StorageService.newId();
  }

  // Retorna o organization_id do usuário logado, ou o DEFAULT_ORG_ID
  getCurrentOrgId(): string {
    try {
      const raw = localStorage.getItem('hd_system_user_profile');
      if (raw) {
        const profile = JSON.parse(raw);
        if (profile?.organizationId) return profile.organizationId;
      }
    } catch {}
    if (localStorage.getItem('hd_system_logged_in_email') !== 'LOGGED_OUT') {
      console.warn('[Storage] getCurrentOrgId() fallback to DEFAULT_ORG_ID — usuário logado sem organizationId no perfil');
    }
    return DEFAULT_ORG_ID;
  }

  // Retorna true se a organização atual for a DEFAULT_ORG_ID (Adega dos Parças)
  private isDefaultOrg(): boolean {
    return this.getCurrentOrgId() === DEFAULT_ORG_ID;
  }

  // Verifica se o usuário logado é superadmin
  private isSuperAdmin(): boolean {
    try {
      const raw = localStorage.getItem('hd_system_user_profile');
      if (raw) {
        const profile = JSON.parse(raw);
        return profile?.superadmin === true;
      }
    } catch {}
    return false;
  }

  // Filtra um array pelo organization_id atual. Itens sem organizationId são exibidos
  // apenas na organização padrão (para compatibilidade com dados legados).
  // Superadmin vê TODOS os itens (cross-org).
  private filterByOrg<T extends { organizationId?: string }>(items: T[]): T[] {
    if (this.isSuperAdmin()) return items; // superadmin vê tudo
    const orgId = this.getCurrentOrgId();
    return items.filter((item) => {
      if (!item.organizationId) return this.isDefaultOrg(); // legado: só na org padrão
      return item.organizationId === orgId;
    });
  }

  // ─── MIGRAÇÃO LEGACY: TEXT → UUID (uma única vez) ─────────────────────
  private static MIGRATION_KEY = 'hd_system_uuid_migration_done_v2';

  private migrateLegacyIds() {
    if (this.migrated) return;
    if (localStorage.getItem(StorageService.MIGRATION_KEY)) {
      this.migrated = true;
      return;
    }

    console.log('[HD-Migration] 🔄 Converting legacy TEXT IDs to UUID...');

    // Mapa completo de conversão: old TEXT ID → novo UUID
    // Usa o mesmo algoritmo determinístico do SQL e mockData
    const legacyMap = new Map<string, string>([
      ...Object.entries(BRANCH_UUIDS),
      ...Object.entries(PRODUCT_UUIDS),
      ...Object.entries(CATEGORY_UUIDS),
      ...Object.entries(CUSTOMER_UUIDS),
      ...Object.entries(SUPPLIER_UUIDS),
      ...Object.entries(SALE_UUIDS),
      ...Object.entries(USER_UUIDS),
      ...Object.entries(CASH_SESSION_UUIDS),
      ...Object.entries(FINANCIAL_UUIDS),
    ]);

    type MigrationSpec = {
      key: string;
      idField: string;
      refFields?: string[]; // campos que contêm IDs de outras tabelas
    };

    const specs: MigrationSpec[] = [
      { key: KEYS.PRODUCTS, idField: 'id', refFields: ['storeBranchId', 'supplierId'] },
      { key: KEYS.CATEGORIES, idField: 'id' },
      { key: KEYS.CUSTOMERS, idField: 'id' },
      { key: KEYS.SUPPLIERS, idField: 'id' },
      { key: KEYS.SALES, idField: 'id', refFields: ['operatorId', 'customerId', 'storeBranchId'] },
      { key: KEYS.SALE_ITEMS, idField: 'id', refFields: ['sale_id', 'product_id', 'saleId', 'productId'] },
      { key: KEYS.FINANCIAL, idField: 'id', refFields: ['storeBranchId'] },
      { key: KEYS.CAIXA, idField: 'id', refFields: ['operatorId', 'storeBranchId'] },
      { key: KEYS.CAIXA_HISTORY, idField: 'id', refFields: ['operatorId', 'storeBranchId'] },
      { key: KEYS.MOVEMENTS, idField: 'id', refFields: ['productId', 'storeBranchId'] },
      { key: KEYS.BRANCHES, idField: 'id' },
      { key: KEYS.USERS_LIST, idField: 'id', refFields: ['storeBranchId'] },
    ];

    const convertId = (oldId: string | undefined | null): string => {
      if (!oldId) return StorageService.newId();
      if (StorageService.UUID_RE.test(oldId)) return oldId;
      return legacyMap.get(oldId) || StorageService.newId();
    };

    const convertObject = (obj: any, spec: MigrationSpec) => {
      if (!obj || typeof obj !== 'object') return;
      // Converte o próprio ID
      if (obj[spec.idField]) {
        obj[spec.idField] = convertId(obj[spec.idField]);
      }
      // Converte campos que referenciam outras tabelas
      for (const ref of spec.refFields || []) {
        if (obj[ref]) {
          obj[ref] = convertId(obj[ref]);
        }
      }
      // Converte IDs aninhados (ex: sale.items[].productId)
      if (obj.items && Array.isArray(obj.items)) {
        for (const item of obj.items) {
          if (item.productId) item.productId = convertId(item.productId);
        }
      }
      // Converte IDs aninhados em sale_items storage
      if (spec.key === KEYS.SALE_ITEMS || spec.key === KEYS.CREDIT_PAYMENTS) {
        if (obj.sale_id) obj.sale_id = convertId(obj.sale_id);
        if (obj.product_id) obj.product_id = convertId(obj.product_id);
        if (obj.productId) obj.productId = convertId(obj.productId);
      }
    };

    for (const spec of specs) {
      try {
        const raw = localStorage.getItem(spec.key);
        if (!raw) continue;
        const data = JSON.parse(raw);
        if (Array.isArray(data)) {
          for (const item of data) convertObject(item, spec);
          localStorage.setItem(spec.key, JSON.stringify(data));
        } else if (typeof data === 'object') {
          convertObject(data, spec);
          localStorage.setItem(spec.key, JSON.stringify(data));
        }
      } catch (e) {
        console.warn(`[HD-Migration] ⚠️ Error migrating ${spec.key}:`, e);
      }
    }

    localStorage.setItem(StorageService.MIGRATION_KEY, 'done');
    this.migrated = true;
    console.log('[HD-Migration] ✅ Legacy TEXT → UUID migration complete');
  }

  constructor() {
    this.migrateLegacyIds();
  }

  public subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    // Debounce: batch rapid storage changes into a single notification
    // and defer past React's render cycle to prevent error #306
    if (this.notifyTimer) return;
    this.notifyTimer = setTimeout(() => {
      this.notifyTimer = null;
      this.listeners.forEach((fn) => fn());
    }, 0);
  }

  // ─── DLQ: Dead Letter Queue para operacoes RPC que falharam ──────
  private async insertDLQ(
    operationType: string,
    tableName: string,
    recordId: string,
    payload: any,
    errorMessage: string,
  ) {
    try {
      const { error } = await supabase.rpc('fn_insserir_dlq', {
        p_operation_type: operationType,
        p_table_name: tableName,
        p_record_id: recordId,
        p_payload: payload,
        p_error_message: errorMessage,
        p_source: 'frontend',
        p_browser_id: navigator.userAgent.slice(0, 50),
      });
      if (error) {
        console.warn('[HD-Sync] DLQ insert failed:', error.message);
      }
    } catch (e) {
      console.warn('[HD-Sync] DLQ insert exception:', e);
    }
  }

  // ─── SUPABASE SYNC HELPERS ────────────────────────────────────────
  // Fire-and-forget sync to Supabase. localStorage is always the source of truth locally.
  // When Supabase Realtime delivers remote changes, they update localStorage via syncRemoteToLocal().

  private syncProduct(p: Product) {
    syncService.upsertRow('products', {
      id: p.id,
      organization_id: this.getCurrentOrgId(),
      store_branch_id: p.storeBranchId || null,
      name: p.name,
      barcode: p.barcode,
      category: p.category,
      cost_price: p.costPrice,
      sale_price: p.salePrice,
      stock_quantity: p.currentStock,
      min_stock_quantity: p.minStock,
      unit: p.unit,
      image_url: p.imageUrl,
      is_active: p.active,
      show_on_tv: p.showOnTV || false,
      tv_promo_price: p.tvPromoPrice || null,
      tv_highlight_tag: p.tvHighlightTag || null,
    });
  }

  private syncCategory(c: Category) {
    syncService.upsertRow('categories', {
      id: c.id,
      organization_id: this.getCurrentOrgId(),
      name: c.name,
      color: c.color || '#6366f1',
      store_branch_id: (c as any).storeBranchId || null,
    });
  }

  private syncCustomer(c: Customer) {
    syncService.upsertRow('customers', {
      id: c.id,
      organization_id: this.getCurrentOrgId(),
      name: c.name,
      cpf_cnpj: c.cpfCnpj,
      email: c.email,
      phone: c.phone,
      credit_limit: c.creditLimit,
      store_branch_id: (c as any).storeBranchId || null,
    });
  }

  private syncSupplier(s: Supplier) {
    syncService.upsertRow('suppliers', {
      id: s.id,
      organization_id: this.getCurrentOrgId(),
      corporate_name: s.companyName,
      trade_name: s.tradeName,
      cnpj: s.cnpj,
      contact_person: s.contactName,
      email: s.email,
      phone: s.phone,
      store_branch_id: (s as any).storeBranchId || null,
    });
  }

  private async syncSale(s: Sale) {
    try {
      // First upsert the parent sale — wait for it to complete
      await syncService.upsertRow('sales', {
        id: s.id,
        organization_id: this.getCurrentOrgId(),
        store_branch_id: s.storeBranchId,
      user_id: s.operatorId || null,
        customer_id: s.customerId || null,
        code: s.code,
        created_at: s.date,                    // timestamp do momento da finalização
        operator_name: s.operatorName,         // nome real do usuário logado
        subtotal: s.subtotal,
        discount: s.discount,
        total: s.total,
        payment_method: s.payments[0]?.method || 'cash',
        status: s.status,
        notes: s.customerName || null,
        customer_name: s.customerName || null,
      });
      // Only upsert sale items AFTER the sale record exists (avoid FK violation)
      if (s.items && s.items.length > 0) {
        const items = s.items.map((item) => ({
          // id omitido — Supabase gera UUID automático (gen_random_uuid())
          sale_id: s.id,
          product_id: item.productId,
          product_name: item.productName || '',
          quantity: item.quantity,
          unit_price: item.unitPrice,
          total_price: item.total,
        }));
        await syncService.upsertRows('sale_items', items);
      }
    } catch (err) {
      console.warn('[HD-Sync] syncSale failed (will retry via queue):', err);
    }
  }

  private syncBranch(b: StoreBranch) {
    syncService.upsertRow('store_branches', {
      id: b.id,
      organization_id: b.organizationId || this.getCurrentOrgId(),
      name: b.name,
      code: b.code,
      cnpj: b.cnpj,
      city: b.city,
      state: b.state,
      address: b.address,
      phone: b.phone,
      is_headquarters: b.isHeadquarters,
      active: b.active,
    });
  }

  private syncFinancialAccount(a: FinancialAccount) {
    syncService.upsertRow('financial_transactions', {
      id: a.id,
      organization_id: this.getCurrentOrgId(),
      store_branch_id: a.storeBranchId || null,
      type: a.type,
      description: a.title,
      amount: a.amount,
      category: a.category,
      due_date: a.dueDate,
      payment_date: a.paidDate || null,
      status: a.status,
      notes: a.recipientOrPayer,
    });
  }

  private syncCaixaSession(s: CashRegisterSession) {
    syncService.upsertRow('cash_sessions', {
      id: s.id,
      organization_id: this.getCurrentOrgId(),
      store_branch_id: s.storeBranchId || null,
      user_id: s.operatorId,
      operator_name: s.operatorName,
      opening_balance: s.initialCash,
      closing_balance: s.status === 'closed' ? s.currentCashBalance : null,
      expected_balance: s.currentCashBalance,
      total_sales_cash: s.totalSalesCash,
      total_sales_pix: s.totalSalesPix,
      total_sales_card: s.totalSalesCard,
      total_sales_credit_account: s.totalSalesCreditAccount,
      suprimentos: s.suprimentos,
      sangrias: s.sangrias,
      status: s.status,
      opened_at: s.openedAt,
      closed_at: s.closedAt || null,
    });
  }

  private syncStockMovement(m: StockMovement) {
    syncService.upsertRow('stock_movements', {
      id: m.id,
      organization_id: this.getCurrentOrgId(),
      store_branch_id: m.storeBranchId || null,
      product_id: m.productId,
      product_name: m.productName,
      type: m.type,
      quantity: m.quantity,
      previous_stock: m.previousStock,
      new_stock: m.newStock,
      reason: m.reason,
      operator_name: m.operatorName,
      created_at: m.date,
    });
  }

  private syncSystemUser(u: UserProfile) {
    syncService.upsertRow('system_users', {
      id: u.id,
      organization_id: this.getCurrentOrgId(),
      store_branch_id: u.storeBranchId || null,
      name: u.name,
      email: u.email,
      role: u.role,
      permissions: u.permissions,
      avatar_url: u.avatarUrl || null,
      active: u.active,
    });
  }

  private syncSettings(s: SystemSettings) {
    syncService.upsertRow('system_settings', {
      id: this.getCurrentOrgId(),
      organization_id: this.getCurrentOrgId(),
      settings: s,
      updated_at: new Date().toISOString(),
    });
  }

  // ─── REMOTE → LOCAL UPDATE HANDLERS ──────────────────────────────
  // Called by App.tsx when Supabase Realtime delivers a remote change.
  // These convert Supabase row format back to our app types and update localStorage.

  updateProductFromRemote(row: any) {
    const products = this.getProducts();
    const mapped: Product = {
      id: row.id,
      barcode: row.barcode || '',
      name: row.name,
      category: row.category || 'Geral',
      unit: row.unit || 'un',
      costPrice: parseFloat(row.cost_price) || 0,
      salePrice: parseFloat(row.sale_price) || 0,
      currentStock: parseInt(row.stock_quantity) || 0,
      minStock: parseInt(row.min_stock_quantity) || 5,
      maxStock: 100,
      imageUrl: row.image_url || '',
      active: row.is_active !== false,
      updatedAt: row.updated_at || new Date().toISOString(),
      storeBranchId: row.store_branch_id || undefined,
      showOnTV: row.show_on_tv || false,
      tvPromoPrice: parseFloat(row.tv_promo_price) || undefined,
      tvHighlightTag: row.tv_highlight_tag || undefined,
    };
    const idx = products.findIndex((p) => p.id === mapped.id);
    if (idx >= 0) {
      // Preserve critical local fields if cloud data is stale (0 or empty)
      const local = products[idx];
      if (local.salePrice > 0 && mapped.salePrice <= 0) {
        mapped.salePrice = local.salePrice;
      }
      if (local.currentStock > 0 && mapped.currentStock <= 0) {
        mapped.currentStock = local.currentStock;
      }
      mapped.updatedAt = new Date().toISOString();
      products[idx] = mapped;
    } else {
      products.unshift(mapped);
    }
    this.set(KEYS.PRODUCTS, products);
  }

  removeProductFromRemote(id: string) {
    const products = this.getProducts().filter((p) => p.id !== id);
    this.set(KEYS.PRODUCTS, products);
  }

  removeSaleFromRemote(id: string) {
    const sales = this.getSales().filter((s) => s.id !== id);
    this.set(KEYS.SALES, sales);
  }

  removeCaixaFromRemote(id: string) {
    // Only clear if it matches current session
    const session = this.getActiveCaixaSession();
    if (session && session.id === id) {
      this.set(KEYS.CAIXA, { ...session, status: 'closed' });
    }
  }

  removeUserFromRemote(id: string) {
    const users = this.getUsers().filter((u) => u.id !== id);
    this.set(KEYS.USERS_LIST, users);
  }

  updateCategoryFromRemote(row: any) {
    const categories = this.getCategories();
    const mapped: Category = {
      id: row.id,
      name: row.name,
      color: row.color || '#6366f1',
    };
    const idx = categories.findIndex((c) => c.id === mapped.id);
    if (idx >= 0) categories[idx] = mapped;
    else categories.push(mapped);
    this.set(KEYS.CATEGORIES, categories);
  }

  removeCategoryFromRemote(id: string) {
    const categories = this.getCategories().filter((c) => c.id !== id);
    this.set(KEYS.CATEGORIES, categories);
  }

  updateSaleFromRemote(row: any) {
    const sales = this.getSales();
    const existing = sales.find((s) => s.id === row.id);
    console.log(`[HD-Sync] 🔄 updateSaleFromRemote: id=${row.id}, exists=${!!existing}, row.customer_name=${row.customer_name}, row.notes=${row.notes}`);

    // Try to fetch sale items from Supabase
    const fetchItems = async () => {
      try {
        const { data } = await supabase.from('sale_items').select('*').eq('sale_id', row.id);
        if (data && data.length > 0) {
          return data.map((item: any) => ({
            productId: item.product_id,
            productName: item.product_name || '',
            unitPrice: parseFloat(item.unit_price) || 0,
            quantity: item.quantity || 1,
            total: parseFloat(item.total_price) || 0,
          }));
        }
      } catch {}
      return existing?.items || [];
    };

    // Use existing items as fallback while items are being fetched
    const mapped: Sale = {
      id: row.id,
      code: row.code,
      date: row.created_at || new Date().toISOString(),
      operatorId: row.user_id || '',
      operatorName: row.operator_name || existing?.operatorName || 'Sistema',
      customerId: row.customer_id || existing?.customerId || undefined,
      customerName: (row.customer_name ?? row.notes) || existing?.customerName || undefined,
      storeBranchId: row.store_branch_id || '',
      items: existing?.items || [],
      subtotal: parseFloat(row.subtotal) || 0,
      discount: parseFloat(row.discount) || 0,
      total: parseFloat(row.total) || 0,
      payments: existing?.payments || [{ method: (row.payment_method as any) || 'cash', amount: parseFloat(row.total) || 0 }],
      status: row.status || 'completed',
    };

    const idx = sales.findIndex((s) => s.id === mapped.id);
    if (idx >= 0) sales[idx] = mapped;
    else sales.unshift(mapped);
    this.set(KEYS.SALES, sales);

    // Fetch items async and update if we get data back
    fetchItems().then((items) => {
      if (items.length > 0) {
        const updated = this.getSales();
        const found = updated.find((s) => s.id === row.id);
        if (found) {
          found.items = items;
          this.set(KEYS.SALES, updated);
        }
      }
    });
  }

  updateCustomerFromRemote(row: any) {
    const customers = this.getCustomers();
    const mapped: Customer = {
      id: row.id,
      name: row.name,
      cpfCnpj: row.cpf_cnpj || '',
      email: row.email || '',
      phone: row.phone || '',
      creditLimit: parseFloat(row.credit_limit) || 0,
      currentBalance: 0,
      loyaltyPoints: 0,
      city: '',
      state: '',
      createdAt: row.created_at || new Date().toISOString(),
    };
    const idx = customers.findIndex((c) => c.id === mapped.id);
    if (idx >= 0) customers[idx] = mapped;
    else customers.unshift(mapped);
    this.set(KEYS.CUSTOMERS, customers);
  }

  removeCustomerFromRemote(id: string) {
    const customers = this.getCustomers().filter((c) => c.id !== id);
    this.set(KEYS.CUSTOMERS, customers);
  }

  updateSupplierFromRemote(row: any) {
    const suppliers = this.getSuppliers();
    const mapped: Supplier = {
      id: row.id,
      companyName: row.corporate_name || '',
      tradeName: row.trade_name || '',
      cnpj: row.cnpj || '',
      contactName: row.contact_person || '',
      email: row.email || '',
      phone: row.phone || '',
    };
    const idx = suppliers.findIndex((s) => s.id === mapped.id);
    if (idx >= 0) suppliers[idx] = mapped;
    else suppliers.unshift(mapped);
    this.set(KEYS.SUPPLIERS, suppliers);
  }

  removeSupplierFromRemote(id: string) {
    const suppliers = this.getSuppliers().filter((s) => s.id !== id);
    this.set(KEYS.SUPPLIERS, suppliers);
  }

  updateFinancialFromRemote(row: any) {
    const accounts = this.getFinancialAccounts();
    const mapped: FinancialAccount = {
      id: row.id,
      title: row.description,
      type: row.type,
      category: row.category,
      amount: parseFloat(row.amount) || 0,
      dueDate: row.due_date,
      paidDate: row.payment_date || undefined,
      status: row.status,
      recipientOrPayer: row.notes || '',
      storeBranchId: row.store_branch_id || undefined,
    };
    const idx = accounts.findIndex((a) => a.id === mapped.id);
    if (idx >= 0) accounts[idx] = mapped;
    else accounts.unshift(mapped);
    this.set(KEYS.FINANCIAL, accounts);
  }

  removeFinancialFromRemote(id: string) {
    const accounts = this.getFinancialAccounts().filter((a) => a.id !== id);
    this.set(KEYS.FINANCIAL, accounts);
  }

  updateCaixaFromRemote(row: any) {
    const localSession = this.getActiveCaixaSession();

    // Same session, both open → MERGE counters (don't ignore remote)
    // Remote may have sales from other devices that local doesn't know about yet.
    // We take the MAX of each counter to avoid losing data from either device.
    if (localSession && localSession.id === row.id && localSession.status === 'open') {
      const remoteCash = parseFloat(row.total_sales_cash) || 0;
      const remotePix = parseFloat(row.total_sales_pix) || 0;
      const remoteCard = parseFloat(row.total_sales_card) || 0;
      const remoteCredit = parseFloat(row.total_sales_credit_account) || 0;
      const remoteSuprimentos = parseFloat(row.suprimentos) || 0;
      const remoteSangrias = parseFloat(row.sangrias) || 0;

      const merged = {
        ...localSession,
        totalSalesCash: Math.max(localSession.totalSalesCash, remoteCash),
        totalSalesPix: Math.max(localSession.totalSalesPix, remotePix),
        totalSalesCard: Math.max(localSession.totalSalesCard, remoteCard),
        totalSalesCreditAccount: Math.max(localSession.totalSalesCreditAccount, remoteCredit),
        suprimentos: Math.max(localSession.suprimentos, remoteSuprimentos),
        sangrias: Math.max(localSession.sangrias, remoteSangrias),
      };
      // Recalculate balance with merged values
      merged.currentCashBalance = merged.initialCash + merged.totalSalesCash + merged.suprimentos - merged.sangrias;
      this.set(KEYS.CAIXA, merged);
      console.log(`[HD-Sync] 🔄 Caixa merged: cash=R$${merged.totalSalesCash.toFixed(2)} pix=R$${merged.totalSalesPix.toFixed(2)} card=R$${merged.totalSalesCard.toFixed(2)}`);
      return;
    }

    const session: CashRegisterSession = {
      id: row.id,
      openedAt: row.opened_at,
      closedAt: row.closed_at || undefined,
      operatorId: row.user_id || '',
      operatorName: row.operator_name || 'Sistema',
      initialCash: parseFloat(row.opening_balance) || 0,
      currentCashBalance: parseFloat(row.expected_balance) || 0,
      totalSalesCash: parseFloat(row.total_sales_cash) || 0,
      totalSalesPix: parseFloat(row.total_sales_pix) || 0,
      totalSalesCard: parseFloat(row.total_sales_card) || 0,
      totalSalesCreditAccount: parseFloat(row.total_sales_credit_account) || 0,
      suprimentos: parseFloat(row.suprimentos) || 0,
      sangrias: parseFloat(row.sangrias) || 0,
      status: row.status || 'open',
      notes: row.notes || undefined,
      storeBranchId: row.store_branch_id || undefined,
    };
    this.set(KEYS.CAIXA, session);
  }

  updateBranchFromRemote(row: any) {
    const branches = this.getBranches();
    const mapped: StoreBranch = {
      id: row.id,
      name: row.name,
      code: row.code,
      cnpj: row.cnpj || '',
      city: row.city || '',
      state: row.state || '',
      address: row.address || '',
      phone: row.phone || '',
      isHeadquarters: row.is_headquarters || false,
      active: row.active !== false,
    };
    const idx = branches.findIndex((b) => b.id === mapped.id);
    if (idx >= 0) branches[idx] = mapped;
    else branches.push(mapped);
    this.set(KEYS.BRANCHES, branches);
  }

  removeBranchFromRemote(id: string) {
    const branches = this.getBranches().filter((b) => b.id !== id);
    this.set(KEYS.BRANCHES, branches);
  }

  updateSettingsFromRemote(row: any) {
    if (row.settings) {
      this.set(KEYS.SETTINGS, row.settings);
    }
  }

  updateStockMovementFromRemote(row: any) {
    const movements = this.getMovements();
    const mapped: StockMovement = {
      id: row.id,
      productId: row.product_id,
      productName: row.product_name || '',
      type: row.type,
      quantity: row.quantity,
      previousStock: row.previous_stock || 0,
      newStock: row.new_stock || 0,
      reason: row.reason || '',
      date: row.created_at || new Date().toISOString(),
      operatorName: row.operator_name || '',
      storeBranchId: row.store_branch_id || undefined,
    };
    const idx = movements.findIndex((m) => m.id === mapped.id);
    if (idx >= 0) movements[idx] = mapped;
    else movements.unshift(mapped);
    this.set(KEYS.MOVEMENTS, movements);
  }

  removeStockMovementFromRemote(id: string) {
    const movements = this.getMovements().filter((m) => m.id !== id);
    this.set(KEYS.MOVEMENTS, movements);
  }

  updateUserFromRemote(row: any) {
    const users = this.getUsers();
    const mapped: UserProfile = {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role || 'collaborator',
      organizationId: row.organization_id || this.getCurrentOrgId(),
      storeBranchId: row.store_branch_id || '',
      permissions: row.permissions || { pdv: true, inventory: true, crm: true, finance: true, dashboard: true, settings: true },
      active: row.active !== false,
      avatarUrl: row.avatar_url || undefined,
    };
    const idx = users.findIndex((u) => u.id === mapped.id);
    if (idx >= 0) {
      // CRITICAL: preserve the local password — Supabase never stores passwords,
      // so the cloud row always has no password. Without this merge, the password
      // would be stripped on every Realtime update, breaking login.
      mapped.password = users[idx].password;
      users[idx] = mapped;
    } else {
      // New user from cloud — no local password exists (can't login without one)
      // Still add them so they appear in the user list, but they'll need a password set locally
      users.unshift(mapped);
    }
    this.set(KEYS.USERS_LIST, users);
  }

  // ─── INITIAL LOAD FROM SUPABASE ──────────────────────────────────
  // Called once on app startup to hydrate localStorage from cloud.

  async hydrateFromCloud(branchId?: string): Promise<boolean> {
    try {
      const [products, categories, customers, suppliers, sales, branches, financial, settings, users, movements, caixa, saleItems] =
        await Promise.all([
          syncService.fetchRows('products', branchId),
          syncService.fetchRows('categories', branchId),
          syncService.fetchRows('customers', branchId),
          syncService.fetchRows('suppliers', branchId),
          syncService.fetchRows('sales', branchId),
          syncService.fetchRows('store_branches'),
          syncService.fetchRows('financial_transactions', branchId),
          syncService.fetchRows('system_settings'),
          syncService.fetchRows('system_users', branchId),
          syncService.fetchRows('stock_movements', branchId),
          syncService.fetchRows('cash_sessions', branchId),
          syncService.fetchRows('sale_items'),
        ]);

      // ── HELPER: merge cloud rows into local data by ID ──────────
      // Keeps ALL local records. Cloud records override matching by ID.
      // Also syncs local-only records to Supabase so they aren't lost on future hydrations.
      // Returns null when neither local nor cloud has real data (prevents INITIAL_* from being written).
      const mergeBy = <T>(
        key: string,
        local: T[],
        cloud: any[],
        mapCloud: (r: any) => T,
        syncLocal: (item: T) => void,
        getId: (item: T) => string = (item: any) => item.id,
        extraMerge?: (local: T, cloudMapped: T) => T,
      ): T[] | null => {
        const hasLocalData = localStorage.getItem(key) !== null;

        // First-time init: localStorage was never written (using INITIAL_* defaults).
        // If cloud has data, replace local with it (discard mock data).
        // If cloud is empty too, skip entirely (keep INITIAL_* defaults).
        if (!hasLocalData) {
          if (cloud.length === 0) return null;
          return cloud.map(mapCloud);
        }

        // Normal merge: local data is real (user-created)
        const cloudMapped = cloud.map(mapCloud);
        const cloudIds = new Set(cloudMapped.map(getId));

        // Sync local-only records that cloud doesn't have yet
        for (const item of local) {
          if (!cloudIds.has(getId(item))) {
            syncLocal(item);
          }
        }

        // Merge: cloud overrides matching local, local-only records stay
        const localById = new Map(local.map((l) => [getId(l), l]));
        const merged = cloudMapped.map((cm) => {
          const loc = localById.get(getId(cm));
          if (!loc) return cm;
          return extraMerge ? extraMerge(loc, cm) : cm;
        });

        // Add local-only records not in cloud
        for (const item of local) {
          if (!cloudIds.has(getId(item))) {
            merged.push(item);
          }
        }

        return merged;
      };

      // ── PRODUCTS ──────────────────────────────────────────────────
      {
        const local = this.getProducts();
        const merged = mergeBy(KEYS.PRODUCTS, local, products, (r: any) => {
          const cloudSalePrice = parseFloat(r.sale_price) || 0;
          return {
            id: r.id,
            barcode: r.barcode || '',
            name: r.name,
            category: r.category || 'Geral',
            unit: r.unit || 'un',
            costPrice: parseFloat(r.cost_price) || 0,
            salePrice: cloudSalePrice,
            currentStock: parseInt(r.stock_quantity) || 0,
            minStock: parseInt(r.min_stock_quantity) || 5,
            maxStock: 100,
            imageUrl: r.image_url || '',
            active: r.is_active !== false,
            updatedAt: r.updated_at || new Date().toISOString(),
            storeBranchId: r.store_branch_id || undefined,
            showOnTV: r.show_on_tv || false,
            tvPromoPrice: parseFloat(r.tv_promo_price) || undefined,
            tvHighlightTag: r.tv_highlight_tag || undefined,
            organizationId: r.organization_id || this.getCurrentOrgId(),
          };
        }, (p) => this.syncProduct(p), (p) => p.id, (localItem, cloudItem) => {
          // Preserve local salePrice if cloud sent 0
          if (localItem.salePrice > 0 && cloudItem.salePrice <= 0) {
            cloudItem.salePrice = localItem.salePrice;
          }
          // Preserve local stock if cloud sent 0
          if (localItem.currentStock > 0 && cloudItem.currentStock <= 0) {
            cloudItem.currentStock = localItem.currentStock;
          }
          return { ...cloudItem, updatedAt: new Date().toISOString() };
        });
        if (merged !== null) this.set(KEYS.PRODUCTS, merged);
      }

      // ── CATEGORIES ────────────────────────────────────────────────
      {
        const local = this.getCategories();
        const merged = mergeBy(KEYS.CATEGORIES, local, categories,
          (r: any) => ({
            id: r.id, name: r.name, color: r.color || '#6366f1',
            organizationId: r.organization_id || this.getCurrentOrgId(),
          }),
          (c) => this.syncCategory(c),
        );
        if (merged !== null) this.set(KEYS.CATEGORIES, merged);
      }

      // ── CUSTOMERS ─────────────────────────────────────────────────
      {
        const local = this.getCustomers();
        const merged = mergeBy(KEYS.CUSTOMERS, local, customers,
          (r: any) => ({
            id: r.id, name: r.name, cpfCnpj: r.cpf_cnpj || '', email: r.email || '', phone: r.phone || '',
            creditLimit: parseFloat(r.credit_limit) || 0, currentBalance: 0, loyaltyPoints: 0,
            city: '', state: '', createdAt: r.created_at || new Date().toISOString(),
            organizationId: r.organization_id || this.getCurrentOrgId(),
          }),
          (c) => this.syncCustomer(c),
        );
        if (merged !== null) this.set(KEYS.CUSTOMERS, merged);
      }

      // ── SUPPLIERS ─────────────────────────────────────────────────
      {
        const local = this.getSuppliers();
        const merged = mergeBy(KEYS.SUPPLIERS, local, suppliers,
          (r: any) => ({
            id: r.id, companyName: r.corporate_name || '', tradeName: r.trade_name || '',
            cnpj: r.cnpj || '', contactName: r.contact_person || '', email: r.email || '', phone: r.phone || '',
            organizationId: r.organization_id || this.getCurrentOrgId(),
          }),
          (s) => this.syncSupplier(s),
        );
        if (merged !== null) this.set(KEYS.SUPPLIERS, merged);
      }

      // ── SALES + SALE_ITEMS ────────────────────────────────────────
      {
        const salesKey = KEYS.SALES;
        const hasLocalSales = localStorage.getItem(salesKey) !== null;
        const localSalesBefore = this.getSales();
        console.log(`[HD-Sync] 📊 Sales hydration: hasLocalSales=${hasLocalSales}, localCount=${localSalesBefore.length}, cloudCount=${sales.length}`);
        if (localSalesBefore.length > 0) {
          console.log(`[HD-Sync] 📊 Local sale IDs:`, localSalesBefore.map(s => `${s.id} (customer: ${s.customerName || 'N/A'})`));
        }

        // Handle sale_items first (they're needed for sales merge)
        if (saleItems && saleItems.length > 0) {
          this.set(KEYS.SALE_ITEMS, saleItems);
        }

        // Group sale_items by sale_id
        const itemsBySaleId: Record<string, any[]> = {};
        let effectiveItems = saleItems && saleItems.length > 0 ? saleItems : null;
        if (!effectiveItems) {
          const localSaleItems = this.get<any[]>(KEYS.SALE_ITEMS, []);
          if (localSaleItems.length > 0) {
            effectiveItems = localSaleItems;
          }
        }
        if (effectiveItems && effectiveItems.length > 0) {
          for (const item of effectiveItems) {
            if (!itemsBySaleId[item.sale_id]) itemsBySaleId[item.sale_id] = [];
            itemsBySaleId[item.sale_id].push({
              productId: item.product_id,
              productName: item.product_name || '',
              unitPrice: parseFloat(item.unit_price) || 0,
              quantity: item.quantity || 1,
              total: parseFloat(item.total_price) || 0,
            });
          }
        }

        if (!hasLocalSales && sales.length === 0) {
          // Neither real local data nor cloud — skip (keep INITIAL_SALES)
        } else if (!hasLocalSales && sales.length > 0) {
          // First time: replace INITIAL_SALES with cloud data
          const cloudMapped = sales.map((r: any) => {
            const cloudItems = itemsBySaleId[r.id] || [];
            const storedTotal = parseFloat(r.total) || 0;
            const computedItemsTotal = cloudItems.reduce((sum: number, item: any) => sum + (item.total || 0), 0);
            const fixedTotal = (storedTotal === 0 && computedItemsTotal > 0) ? computedItemsTotal : storedTotal;
            return {
              id: r.id, code: r.code, date: r.created_at || new Date().toISOString(),
              operatorId: r.user_id || '', operatorName: r.operator_name || 'Sistema',
              customerId: r.customer_id || undefined, customerName: r.customer_name || r.notes || undefined,
              storeBranchId: r.store_branch_id || '',
              items: cloudItems,
              subtotal: parseFloat(r.subtotal) || fixedTotal, discount: parseFloat(r.discount) || 0,
              total: fixedTotal,
              payments: [{ method: r.payment_method || 'cash', amount: fixedTotal }],
              status: r.status || 'completed',
              updatedAt: r.updated_at || new Date().toISOString(),
            };
          });
          this.set(KEYS.SALES, cloudMapped);
        } else {
          // Normal merge: has real local data
          const localSales = this.getSales();
          const localSalesById = new Map(localSales.map((s) => [s.id, s]));
          const cloudSaleIds = new Set(sales.map((r: any) => r.id));

          // Sync local-only sales to cloud
          for (const s of localSales) {
            if (!cloudSaleIds.has(s.id)) {
              this.syncSale(s);
            }
          }

          // Merge: map cloud sales preserving local items when cloud has none
          const cloudMapped = sales.map((r: any) => {
            const cloudItems = itemsBySaleId[r.id] || [];
            const items = cloudItems.length > 0 ? cloudItems : (localSalesById.get(r.id)?.items || []);
            const storedTotal = parseFloat(r.total) || 0;
            const computedItemsTotal = items.reduce((sum: number, item: any) => sum + (item.total || 0), 0);
            const fixedTotal = (storedTotal === 0 && computedItemsTotal > 0) ? computedItemsTotal : storedTotal;
            const fixedSubtotal = parseFloat(r.subtotal) || fixedTotal;
            return {
              id: r.id, code: r.code, date: r.created_at || new Date().toISOString(),
              operatorId: r.user_id || '', operatorName: r.operator_name || 'Sistema',
              customerId: r.customer_id || localSalesById.get(r.id)?.customerId || undefined,
              customerName: (r.customer_name ?? r.notes) || localSalesById.get(r.id)?.customerName || undefined,
              storeBranchId: r.store_branch_id || '',
              items,
              subtotal: fixedSubtotal, discount: parseFloat(r.discount) || 0,
              total: fixedTotal,
              payments: [{ method: r.payment_method || 'cash', amount: fixedTotal }],
              status: r.status || 'completed',
              updatedAt: r.updated_at || new Date().toISOString(),
            };
          });
          const mergedSales = [
            ...cloudMapped,
            ...localSales.filter((s) => !cloudSaleIds.has(s.id)),
          ];
          console.log(`[HD-Sync] 📊 Merged ${mergedSales.length} sales (cloud: ${cloudMapped.length}, local-only: ${mergedSales.length - cloudMapped.length})`);
          if (cloudMapped.length > 0) console.log(`[HD-Sync] 📊 Cloud sale IDs:`, cloudMapped.map(s => `${s.id} (customer: ${s.customerName || 'N/A'})`));
          // Defensive: warn if any local sale with unique ID went missing
          const mergedIds = new Set(mergedSales.map(s => s.id));
          for (const ls of localSales) {
            if (!mergedIds.has(ls.id)) {
              console.warn(`[HD-Sync] ⚠️ Local sale ${ls.id} (${ls.customerName || 'no name'}) LOST during merge!`);
            }
          }
          this.set(KEYS.SALES, mergedSales);
        }
      }

      // ── BRANCHES ──────────────────────────────────────────────────
      {
        const local = this.getBranches();
        const merged = mergeBy(KEYS.BRANCHES, local, branches,
          (r: any) => ({
            id: r.id, name: r.name, code: r.code, cnpj: r.cnpj || '',
            city: r.city || '', state: r.state || '', address: r.address || '',
            phone: r.phone || '', isHeadquarters: r.is_headquarters || false,
            active: r.active !== false,
            organizationId: r.organization_id || this.getCurrentOrgId(),
          }),
          (b) => this.syncBranch(b),
        );
        if (merged !== null) this.set(KEYS.BRANCHES, merged);
      }

      // ── FINANCIAL ACCOUNTS ────────────────────────────────────────
      {
        const local = this.getFinancialAccounts();
        const merged = mergeBy(KEYS.FINANCIAL, local, financial,
          (r: any) => ({
            id: r.id, title: r.description, type: r.type, category: r.category,
            amount: parseFloat(r.amount) || 0, dueDate: r.due_date,
            paidDate: r.payment_date || undefined, status: r.status,
            recipientOrPayer: r.notes || '', storeBranchId: r.store_branch_id || undefined,
          }),
          (a) => this.syncFinancialAccount(a),
        );
        if (merged !== null) this.set(KEYS.FINANCIAL, merged);
      }

      // ── USERS ─────────────────────────────────────────────────────
      {
        const existing = this.getUsers();
        const cloudIds = new Set(users.map((r: any) => r.id));
        const orgId = this.getCurrentOrgId();

        // NOTE: Não fazemos sync de local-only users para o cloud aqui.
        // system_users é gerenciado pelo servidor (server.ts), que usa o
        // Auth UUID real. IDs determinísticos do frontend nunca bateriam
        // com auth.uid() e o RLS bloquearia.

        // Só inclui usuários do cloud que pertencem à org atual
        const cloudUsersInOrg = users.filter((r: any) => r.organization_id === orgId || (!r.organization_id && this.isDefaultOrg()));

        const mapped = cloudUsersInOrg.map((r: any) => ({
          id: r.id, name: r.name, email: r.email, role: r.role || 'collaborator',
          organizationId: r.organization_id || orgId,
          storeBranchId: r.store_branch_id || '',
          permissions: r.permissions || { pdv: true, inventory: true, crm: true, finance: true, dashboard: true, settings: true },
          active: r.active !== false, avatarUrl: r.avatar_url || undefined,
        }));
        const initialIds = new Set(INITIAL_USERS.filter(u => u.organizationId === orgId || (!u.organizationId && this.isDefaultOrg())).map((u) => u.id));
        const merged = mapped.map((m: any) => {
          const local = existing.find((u) => u.id === m.id || (u.email || '').toLowerCase() === (m.email || '').toLowerCase());
          if (initialIds.has(m.id)) {
            const initialUser = INITIAL_USERS.find((u) => u.id === m.id);
            return {
              ...(initialUser || m),
              name: m.name || initialUser?.name || m.name,
              avatarUrl: m.avatarUrl || initialUser?.avatarUrl,
              permissions: m.permissions || initialUser?.permissions,
              active: m.active !== undefined ? m.active : (initialUser?.active ?? true),
            };
          }
          return { ...m, password: local?.password || m.password };
        });
        // Keep local users not in cloud (sem fazer upsert), da mesma org
        const isSuper = this.isSuperAdmin();
        for (const e of existing) {
          if (!isSuper) {
            if (e.organizationId && e.organizationId !== orgId) continue;
            if (!e.organizationId && !this.isDefaultOrg()) continue;
          }
          if (!merged.find((m: any) => m.id === e.id || (m.email || '').toLowerCase() === (e.email || '').toLowerCase())) {
            merged.push(e);
          }
        }
        this.set(KEYS.USERS_LIST, merged);
      }

      // ── STOCK MOVEMENTS ───────────────────────────────────────────
      {
        const local = this.getMovements();
        const merged = mergeBy(KEYS.MOVEMENTS, local, movements,
          (r: any) => ({
            id: r.id, productId: r.product_id, productName: r.product_name || '',
            type: r.type, quantity: r.quantity, previousStock: r.previous_stock || 0,
            newStock: r.new_stock || 0, reason: r.reason || '',
            date: r.created_at || new Date().toISOString(),
            operatorName: r.operator_name || '', storeBranchId: r.store_branch_id || undefined,
          }),
          (m) => this.syncStockMovement(m),
        );
        if (merged !== null) this.set(KEYS.MOVEMENTS, merged);
      }

      // ── CAIXA SESSION ─────────────────────────────────────────────
      {
        const hasLocalCaixa = localStorage.getItem(KEYS.CAIXA) !== null;

        if (caixa.length > 0) {
          if (!hasLocalCaixa) {
            // First time: replace INITIAL_CAIXA with cloud data
            let filtered = caixa;
            if (branchId) {
              filtered = caixa.filter((r: any) => r.store_branch_id === branchId);
            }
            if (filtered.length === 0 && !branchId) filtered = caixa;
            const sorted = [...filtered].sort((a: any, b: any) => {
              if (a.status === 'open' && b.status !== 'open') return -1;
              if (a.status !== 'open' && b.status === 'open') return 1;
              return new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime();
            });
            const s = sorted[0];
            this.set(KEYS.CAIXA, {
              id: s.id, openedAt: s.opened_at, closedAt: s.closed_at || undefined,
              operatorId: s.user_id || '', operatorName: s.operator_name || '',
              initialCash: parseFloat(s.opening_balance) || 0,
              currentCashBalance: parseFloat(s.expected_balance) || 0,
              totalSalesCash: parseFloat(s.total_sales_cash) || 0,
              totalSalesPix: parseFloat(s.total_sales_pix) || 0,
              totalSalesCard: parseFloat(s.total_sales_card) || 0,
              totalSalesCreditAccount: parseFloat(s.total_sales_credit_account) || 0,
              suprimentos: parseFloat(s.suprimentos) || 0,
              sangrias: parseFloat(s.sangrias) || 0,
              status: s.status, notes: s.notes || undefined,
              storeBranchId: s.store_branch_id || undefined,
            });
          } else {
            // Normal: prefer local open session over cloud
            let filtered = caixa;
            if (branchId) filtered = caixa.filter((r: any) => r.store_branch_id === branchId);
            if (filtered.length === 0 && !branchId) filtered = caixa;
            const sorted = [...filtered].sort((a: any, b: any) => {
              if (a.status === 'open' && b.status !== 'open') return -1;
              if (a.status !== 'open' && b.status === 'open') return 1;
              return new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime();
            });
            const s = sorted[0];
            const localSession = this.getActiveCaixaSession();
            if (localSession && localSession.id === s.id && localSession.status === 'open') {
              console.log(`[HD-Sync] 🔄 Caixa session "${s.id}" já existe localmente — mantendo dados locais`);
            } else {
              this.set(KEYS.CAIXA, {
                id: s.id, openedAt: s.opened_at, closedAt: s.closed_at || undefined,
                operatorId: s.user_id || '', operatorName: s.operator_name || '',
                initialCash: parseFloat(s.opening_balance) || 0,
                currentCashBalance: parseFloat(s.expected_balance) || 0,
                totalSalesCash: parseFloat(s.total_sales_cash) || 0,
                totalSalesPix: parseFloat(s.total_sales_pix) || 0,
                totalSalesCard: parseFloat(s.total_sales_card) || 0,
                totalSalesCreditAccount: parseFloat(s.total_sales_credit_account) || 0,
                suprimentos: parseFloat(s.suprimentos) || 0,
                sangrias: parseFloat(s.sangrias) || 0,
                status: s.status, notes: s.notes || undefined,
                storeBranchId: s.store_branch_id || undefined,
              });
            }
          }
        } else if (hasLocalCaixa) {
          // No caixa in cloud but we have local data — sync local open session
          const localSession = this.getActiveCaixaSession();
          if (localSession && localSession.status === 'open') {
            console.log(`[HD-Sync] ☁️→☁️ Syncing active cash session to cloud...`);
            this.syncCaixaSession(localSession);
          }
        }
        // If neither cloud nor local has real data, keep INITIAL_CAIXA_SESSION
      }

      // ── SETTINGS ──────────────────────────────────────────────────
      {
        if (settings.length > 0 && settings[0].settings) {
          // Merge: cloud settings override, but keep any local-only keys
          const localSettings = this.getSettings();
          const merged = { ...localSettings, ...settings[0].settings };
          this.set(KEYS.SETTINGS, merged);
        } else {
          // No settings in cloud — manter só local por enquanto
          // (evita RLS error ao tentar upsert com organization_id que
          // pode não corresponder ao get_auth_user_org_id())
          console.log(`[HD-Sync] ℹ️ No cloud settings found — using local settings`);
        }
      }

      console.log('[HD-Sync] Cloud hydration complete — merge strategy preserves all local data not yet in cloud');
      // Força notify para garantir que o React state seja atualizado
      // com o merge completo (não com dados parciais de um notify anterior).
      if (this.notifyTimer) {
        clearTimeout(this.notifyTimer);
        this.notifyTimer = null;
      }
      this.listeners.forEach((fn) => { try { fn(); } catch {} });
      return true;
    } catch (e) {
      console.warn('[HD-Sync] Cloud hydration failed, using localStorage', e);
      return false;
    }
  }

  private get<T>(key: string, defaultValue: T): T {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  private set<T>(key: string, value: T) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      this.notify();
    } catch (e) {
      console.error('Error writing to localStorage:', e);
    }
  }

  // --- PRODUCTS ---
  getProducts(): Product[] {
    const fallback = this.isDefaultOrg() ? INITIAL_PRODUCTS : [];
    const all = this.get<Product[]>(KEYS.PRODUCTS, fallback);
    return this.filterByOrg<Product>(all);
  }

  saveProduct(product: Product): Product {
    product.id = StorageService.ensureUuid(product.id);
    product.organizationId = this.getCurrentOrgId();
    const products = this.getProducts();
    const index = products.findIndex((p) => p.id === product.id);
    if (index >= 0) {
      products[index] = { ...product, updatedAt: new Date().toISOString() };
    } else {
      products.unshift({ ...product, updatedAt: new Date().toISOString() });
    }
    this.set(KEYS.PRODUCTS, products);
    this.syncProduct(products[index >= 0 ? index : 0]);
    return product;
  }

  deleteProduct(id: string) {
    const allProducts = this.getProducts();
    const product = allProducts.find((p) => p.id === id);
    const products = allProducts.filter((p) => p.id !== id);
    this.set(KEYS.PRODUCTS, products);
    syncService.deleteRow('products', id);
    if (product) {
      undoManager.push({
        type: 'delete-product',
        description: `Excluir produto "${product.name}"`,
        undo: () => {
          this.saveProduct(product);
        },
        timestamp: Date.now(),
      });
    }
  }

  deleteSale(id: string) {
    const allSales = this.getSales();
    const saleToDelete = allSales.find((s) => s.id === id);
    const sales = allSales.filter((s) => s.id !== id);
    this.set(KEYS.SALES, sales);
    syncService.deleteRow('sales', id);
    // Also delete sale_items from Supabase to prevent orphaned records
    if (saleToDelete && saleToDelete.items) {
      // Delete sale_items from Supabase (we don't have individual IDs — delete by sale_id)
      supabase.from('sale_items').delete().eq('sale_id', id).then(() => {});
    }
    // Also remove from separate localStorage key
    const existingItems = this.get<any[]>(KEYS.SALE_ITEMS, []);
    const filtered = existingItems.filter((i: any) => i.sale_id !== id);
    this.set(KEYS.SALE_ITEMS, filtered);
  }

  async updateStock(productId: string, quantityDelta: number, reason: string, operatorName: string) {
    const products = this.getProducts();
    const prod = products.find((p) => p.id === productId);
    if (!prod) return;

    const prevStock = prod.currentStock;
    prod.currentStock = Math.max(0, prod.currentStock + quantityDelta);
    prod.updatedAt = new Date().toISOString();
    this.set(KEYS.PRODUCTS, products);

    // Log stock movement locally
    const movements = this.getMovements();
    const newMov: StockMovement = {
      id: StorageService.newId(),
      productId,
      productName: prod.name,
      type: quantityDelta > 0 ? 'in' : 'out',
      quantity: Math.abs(quantityDelta),
      previousStock: prevStock,
      newStock: prod.currentStock,
      reason,
      date: new Date().toISOString(),
      operatorName,
    };
    movements.unshift(newMov);
    this.set(KEYS.MOVEMENTS, movements);
    this.syncProduct(prod);
    this.syncStockMovement(newMov);

    // ─── RPC: ajustar_estoque (server-side atomic) ─────────────
    // Fire-and-forget: localStorage already updated for instant UI.
    // If RPC fails, DLQ records it for later retry.
    try {
      const type = quantityDelta > 0 ? 'in' : 'out';
      const { data, error } = await supabase.rpc('ajustar_estoque', {
        p_product_id: productId,
        p_quantity: Math.abs(quantityDelta),
        p_type: type,
        p_reason: reason,
        p_operator_name: operatorName,
      });
      if (error) {
        console.warn('[HD-Sync] ajustar_estoque RPC failed:', error.message);
        await this.insertDLQ('UPDATE', 'products', productId, { quantityDelta, reason }, error.message);
      }
    } catch (e: any) {
      console.warn('[HD-Sync] ajustar_estoque RPC exception:', e?.message);
      await this.insertDLQ('UPDATE', 'products', productId, { quantityDelta, reason }, e?.message);
    }
  }

  // --- MOVEMENTS ---
  getMovements(): StockMovement[] {
    return this.get<StockMovement[]>(KEYS.MOVEMENTS, []);
  }

  // --- CATEGORIES ---
  getCategories(): Category[] {
    const fallback = this.isDefaultOrg() ? INITIAL_CATEGORIES : [];
    const all = this.get<Category[]>(KEYS.CATEGORIES, fallback);
    return this.filterByOrg<Category>(all);
  }

  saveCategory(category: Category) {
    category.id = StorageService.ensureUuid(category.id);
    category.organizationId = this.getCurrentOrgId();
    const categories = this.getCategories();
    const idx = categories.findIndex((c) => c.id === category.id);
    if (idx >= 0) {
      categories[idx] = category;
    } else {
      categories.push(category);
    }
    this.set(KEYS.CATEGORIES, categories);
    this.syncCategory(category);
  }

  deleteCategory(id: string) {
    const categories = this.getCategories().filter((c) => c.id !== id);
    this.set(KEYS.CATEGORIES, categories);
    syncService.deleteRow('categories', id);
  }

  // --- CUSTOMERS ---
  getCustomers(): Customer[] {
    const fallback = this.isDefaultOrg() ? INITIAL_CUSTOMERS : [];
    const all = this.get<Customer[]>(KEYS.CUSTOMERS, fallback);
    return this.filterByOrg<Customer>(all);
  }

  saveCustomer(customer: Customer) {
    customer.id = StorageService.ensureUuid(customer.id);
    customer.organizationId = this.getCurrentOrgId();
    const customers = this.getCustomers();
    const idx = customers.findIndex((c) => c.id === customer.id);
    if (idx >= 0) {
      customers[idx] = customer;
    } else {
      customers.unshift(customer);
    }
    this.set(KEYS.CUSTOMERS, customers);
    this.syncCustomer(customer);
  }

  deleteCustomer(id: string) {
    const customers = this.getCustomers().filter((c) => c.id !== id);
    this.set(KEYS.CUSTOMERS, customers);
    syncService.deleteRow('customers', id);
  }

  // --- SUPPLIERS ---
  getSuppliers(): Supplier[] {
    const fallback = this.isDefaultOrg() ? INITIAL_SUPPLIERS : [];
    const all = this.get<Supplier[]>(KEYS.SUPPLIERS, fallback);
    return this.filterByOrg<Supplier>(all);
  }

  saveSupplier(supplier: Supplier) {
    supplier.id = StorageService.ensureUuid(supplier.id);
    supplier.organizationId = this.getCurrentOrgId();
    const suppliers = this.getSuppliers();
    const idx = suppliers.findIndex((s) => s.id === supplier.id);
    if (idx >= 0) {
      suppliers[idx] = supplier;
    } else {
      suppliers.unshift(supplier);
    }
    this.set(KEYS.SUPPLIERS, suppliers);
    this.syncSupplier(supplier);
  }

  deleteSupplier(id: string) {
    const suppliers = this.getSuppliers().filter((s) => s.id !== id);
    this.set(KEYS.SUPPLIERS, suppliers);
    syncService.deleteRow('suppliers', id);
  }

  // --- SALES & PDV ---
  getSales(): Sale[] {
    const fallback = this.isDefaultOrg() ? INITIAL_SALES : [];
    const all = this.get<Sale[]>(KEYS.SALES, fallback);
    if (this.isSuperAdmin()) return all;
    // Sales não têm organizationId no tipo local, mas filtramos por storeBranchId
    // que é vinculado à organização. Usuários de org não-default só veem vendas
    // cujo storeBranchId corresponde a alguma filial da sua org.
    if (this.isDefaultOrg()) return all;
    const myBranchIds = new Set(this.getBranches().map(b => b.id));
    return all.filter(s => myBranchIds.has(s.storeBranchId));
  }

  getSaleItems(): any[] {
    return this.get<any[]>(KEYS.SALE_ITEMS, []);
  }

  getCreditPayments(): any[] {
    return this.get<any[]>(KEYS.CREDIT_PAYMENTS, []);
  }

  saveCreditPayments(payments: any[]) {
    this.set(KEYS.CREDIT_PAYMENTS, payments);
  }

  async addSale(sale: Sale) {
    sale.id = StorageService.ensureUuid(sale.id);
    const sales = this.getSales();
    sales.unshift(sale);
    this.set(KEYS.SALES, sales);
    this.syncSale(sale);

    // Save sale_items to separate localStorage key
    if (sale.items && sale.items.length > 0) {
      const existingItems = this.get<any[]>(KEYS.SALE_ITEMS, []);
      const newItems = sale.items.map((item) => ({
        id: StorageService.newId(),
        sale_id: sale.id,
        product_id: item.productId,
        product_name: item.productName || '',
        quantity: item.quantity,
        unit_price: item.unitPrice,
        total_price: item.total,
      }));
      const filtered = existingItems.filter((i: any) => i.sale_id !== sale.id);
      this.set(KEYS.SALE_ITEMS, [...newItems, ...filtered]);
    }

    // ─── Deduce stock locally (instant UI) ────────────────────
    for (const item of sale.items || []) {
      await this.updateStock(item.productId, -item.quantity, `Venda PDV #${sale.code}`, sale.operatorName);
    }

    // ─── RPC: process_sale_transaction (server-side atomic) ───
    // Calls the DB function with SELECT ... FOR UPDATE + SERIALIZABLE
    try {
      const saleItemsJson = (sale.items || []).map((item) => ({
        product_id: item.productId,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        total: item.total,
        discount: 0,
      }));

      const { data, error } = await supabase.rpc('process_sale_transaction', {
        p_sale_id: sale.id,
        p_product_id: sale.items?.[0]?.productId || '',
        p_quantity: sale.items?.reduce((sum, i) => sum + i.quantity, 0) || 0,
        p_unit_price: sale.total,
        p_discount: sale.discount || 0,
        p_total: sale.total,
        p_reason: `Venda PDV #${sale.code}`,
        p_operator_name: sale.operatorName,
        p_organization_id: this.getCurrentOrgId(),
        p_store_branch_id: sale.storeBranchId || null,
      });

      if (error) {
        console.warn('[HD-Sync] process_sale_transaction RPC failed:', error.message);
        await this.insertDLQ('INSERT', 'sales', sale.id, { sale, saleItemsJson }, error.message);
      }
    } catch (e: any) {
      console.warn('[HD-Sync] process_sale_transaction RPC exception:', e?.message);
      await this.insertDLQ('INSERT', 'sales', sale.id, { sale }, e?.message);
    }

    // Updates active cash register balance
    const session = this.getActiveCaixaSession();
    if (session && session.status === 'open') {
      sale.payments.forEach((p) => {
        if (p.method === 'cash') session.totalSalesCash += p.amount;
        else if (p.method === 'pix') session.totalSalesPix += p.amount;
        else if (p.method === 'credit_card' || p.method === 'debit_card') session.totalSalesCard += p.amount;
        else if (p.method === 'credit_account') session.totalSalesCreditAccount += p.amount;
      });

      session.currentCashBalance = session.initialCash + session.totalSalesCash + session.suprimentos - session.sangrias;
      this.saveActiveCaixaSession(session);
    }

    // Add loyalty points if customer assigned
    if (sale.customerId) {
      const customers = this.getCustomers();
      const cust = customers.find((c) => c.id === sale.customerId);
      if (cust) {
        cust.loyaltyPoints += Math.floor(sale.total);
        this.saveCustomer(cust);
      }
    }
  }

  // --- CAIXA (CASH REGISTER) ---
  getActiveCaixaSession(): CashRegisterSession {
    return this.get<CashRegisterSession>(KEYS.CAIXA, INITIAL_CAIXA_SESSION);
  }

  saveActiveCaixaSession(session: CashRegisterSession) {
    session.id = StorageService.ensureUuid(session.id);
    console.log(`[HD-Sync] 💾 Salvando CAIXA localmente: id=${session.id}, status=${session.status}, caixinha R$ ${session.currentCashBalance.toFixed(2)}`);
    console.log(`[HD-Sync] 💾 Conteúdo: operadora=${session.operatorName}, suprimentos=R$${session.suprimentos}, sangrias=R$${session.sangrias}, vendas cash=R$${session.totalSalesCash}`);
    this.set(KEYS.CAIXA, session);
    console.log(`[HD-Sync] 💾 CAIXA salvo no localStorage (chave: ${KEYS.CAIXA}); agora enviando para Supabase`);
    this.syncCaixaSession(session);
    console.log(`[HD-Sync] 💾 syncCaixaSession() executado`);
  }

  closeCaixaSession(notes?: string) {
    const session = this.getActiveCaixaSession();
    if (session) {
      // Register undo before closing
      const sessionSnapshot = { ...session };
      undoManager.push({
        type: 'close-caixa',
        description: `Fechar caixa de ${session.operatorName}`,
        undo: () => {
          sessionSnapshot.status = 'open';
          sessionSnapshot.closedAt = undefined;
          this.saveActiveCaixaSession(sessionSnapshot);
          // Remove from history archive
          const history = this.get<CashRegisterSession[]>(KEYS.CAIXA_HISTORY, []);
          const filtered = history.filter((s) => s.id !== sessionSnapshot.id);
          this.set(KEYS.CAIXA_HISTORY, filtered);
        },
        timestamp: Date.now(),
      });

      session.status = 'closed';
      session.closedAt = new Date().toISOString();
      if (notes) session.notes = notes;

      // Archive in history
      const history = this.get<CashRegisterSession[]>(KEYS.CAIXA_HISTORY, []);
      history.unshift(session);
      this.set(KEYS.CAIXA_HISTORY, history);

      // Save updated state
      this.saveActiveCaixaSession(session);
    }
  }

  openNewCaixaSession(operatorId: string, operatorName: string, initialCash: number, notes?: string) {
    const newSession: CashRegisterSession = {
      id: StorageService.newId(),
      openedAt: new Date().toISOString(),
      operatorId,
      operatorName,
      initialCash,
      currentCashBalance: initialCash,
      totalSalesCash: 0,
      totalSalesPix: 0,
      totalSalesCard: 0,
      totalSalesCreditAccount: 0,
      suprimentos: 0,
      sangrias: 0,
      status: 'open',
      notes: notes || 'Caixa aberto com sucesso.',
    };
    this.saveActiveCaixaSession(newSession);
  }

  addSuprimento(amount: number, reason: string) {
    const session = this.getActiveCaixaSession();
    if (session && session.status === 'open') {
      session.suprimentos += amount;
      session.currentCashBalance += amount;
      this.saveActiveCaixaSession(session);
    }
  }

  addSangria(amount: number, reason: string) {
    const session = this.getActiveCaixaSession();
    if (session && session.status === 'open') {
      session.sangrias += amount;
      session.currentCashBalance = Math.max(0, session.currentCashBalance - amount);
      this.saveActiveCaixaSession(session);
    }
  }

  // --- FINANCIAL ---
  getFinancialAccounts(): FinancialAccount[] {
    const fallback = this.isDefaultOrg() ? INITIAL_FINANCIAL_ACCOUNTS : [];
    const all = this.get<FinancialAccount[]>(KEYS.FINANCIAL, fallback);
    if (this.isSuperAdmin()) return all;
    // Financial não tem organizationId no tipo, filtra por storeBranchId
    if (this.isDefaultOrg()) return all;
    const myBranchIds = new Set(this.getBranches().map(b => b.id));
    return all.filter(a => a.storeBranchId ? myBranchIds.has(a.storeBranchId) : false);
  }

  saveFinancialAccount(acc: FinancialAccount) {
    acc.id = StorageService.ensureUuid(acc.id);
    const accounts = this.getFinancialAccounts();
    const idx = accounts.findIndex((a) => a.id === acc.id);
    if (idx >= 0) {
      accounts[idx] = acc;
    } else {
      accounts.unshift(acc);
    }
    this.set(KEYS.FINANCIAL, accounts);
    this.syncFinancialAccount(acc);
  }

  deleteFinancialAccount(id: string) {
    const accounts = this.getFinancialAccounts().filter((a) => a.id !== id);
    this.set(KEYS.FINANCIAL, accounts);
    syncService.deleteRow('financial_transactions', id);
  }

  // --- BRANCHES ---
  getBranches(): StoreBranch[] {
    const fallback = this.isDefaultOrg() ? INITIAL_BRANCHES : [];
    const all = this.get<StoreBranch[]>(KEYS.BRANCHES, fallback);
    return this.filterByOrg<StoreBranch>(all);
  }

  saveBranch(branch: StoreBranch) {
    branch.id = StorageService.ensureUuid(branch.id);
    branch.organizationId = this.getCurrentOrgId();
    const branches = this.getBranches();
    const idx = branches.findIndex((b) => b.id === branch.id);
    if (idx >= 0) {
      branches[idx] = branch;
    } else {
      branches.push(branch);
    }

    // Ensure only 1 headquarters
    if (branch.isHeadquarters) {
      branches.forEach((b) => {
        if (b.id !== branch.id) b.isHeadquarters = false;
      });
    }

    this.set(KEYS.BRANCHES, branches);
    this.syncBranch(branch);
  }

  deleteBranch(id: string) {
    const branches = this.getBranches().filter((b) => b.id !== id);
    this.set(KEYS.BRANCHES, branches);
    syncService.deleteRow('store_branches', id);
  }

  getSelectedBranch(): StoreBranch {
    const branches = this.getBranches();
    const savedId = localStorage.getItem('hd_system_selected_branch_id');
    if (savedId) {
      const found = branches.find((b) => b.id === savedId);
      if (found) return found;
    }
    return branches[0] || { id: BRANCH_UUIDS['br-01'], name: 'HD-System Matriz São Paulo', code: 'SP-01', cnpj: '12.345.678/0001-90', city: 'São Paulo', state: 'SP', address: 'Av. Paulista, 1000', phone: '(11) 3000-0000', isHeadquarters: true, active: true, organizationId: this.getCurrentOrgId() };
  }

  getSelectedBranchId(): string {
    return localStorage.getItem('hd_system_selected_branch_id') || '';
  }

  setSelectedBranchId(id: string) {
    localStorage.setItem('hd_system_selected_branch_id', id);
    this.notify();
  }

  // --- USERS & GOOGLE COLLABORATORS ---
  getUsers(): UserProfile[] {
    const orgId = this.getCurrentOrgId();
    const isSuper = this.isSuperAdmin();
    const stored = this.get<UserProfile[]>(KEYS.USERS_LIST, []);
    // Ensure initial users always exist (merge by id)
    // CRITICAL: For INITIAL_USERS entries, NEVER let stored data overwrite email or password.
    // The stored/Supabase data may have stale emails from previous syncs.
    // Only include initial users whose org matches the current org (or has no org = legacy = default org)
    // Superadmin vê todos os INITIAL_USERS.
    const filteredInitials = isSuper ? INITIAL_USERS : INITIAL_USERS.filter((u) => {
      if (!u.organizationId) return this.isDefaultOrg();
      return u.organizationId === orgId;
    });
    const merged = [...filteredInitials];
    const initialIds = new Set(filteredInitials.map((u) => u.id));
    for (const s of stored) {
      // Skip stored users from other orgs (superadmin vê todos)
      if (!isSuper) {
        if (s.organizationId && s.organizationId !== orgId) continue;
        if (!s.organizationId && !this.isDefaultOrg()) continue;
      }
      if (initialIds.has(s.id)) {
        // Initial user — only merge non-auth fields (name, avatar, permissions, etc.)
        const idx = merged.findIndex((u) => u.id === s.id);
        if (idx >= 0) {
          merged[idx] = {
            ...merged[idx],
            name: s.name || merged[idx].name,
            avatarUrl: s.avatarUrl || merged[idx].avatarUrl,
            permissions: s.permissions || merged[idx].permissions,
            active: s.active !== undefined ? s.active : merged[idx].active,
            // email and password: ALWAYS keep from INITIAL_USERS
          };
        }
      } else {
        // Non-initial user — add as-is
        merged.push(s);
      }
    }
    return merged;
  }

  saveUser(user: UserProfile) {
    user.id = StorageService.ensureUuid(user.id);
    user.organizationId = this.getCurrentOrgId();
    const users = this.getUsers();
    const idx = users.findIndex((u) => u.id === user.id || (u.email || '').toLowerCase() === (user.email || '').toLowerCase());
    if (idx >= 0) {
      // Preserve existing password if new one isn't provided
      const merged = { ...users[idx], ...user };
      if (!merged.password && users[idx].password) {
        merged.password = users[idx].password;
      }
      users[idx] = merged;
    } else {
      users.unshift(user);
    }
    this.set(KEYS.USERS_LIST, users);
    this.syncSystemUser(user);

    // If active logged in user updated, refresh profile
    const activeEmail = localStorage.getItem(KEYS.LOGGED_IN_EMAIL);
    if (activeEmail && activeEmail.toLowerCase() === (user.email || '').toLowerCase()) {
      this.saveUserProfile(user);
    }
  }

  deleteUser(id: string) {
    const users = this.getUsers().filter((u) => u.id !== id);
    this.set(KEYS.USERS_LIST, users);
    syncService.deleteRow('system_users', id);
  }

  getUserByEmail(email: string): UserProfile | undefined {
    // Busca em TODOS os usuários (necessário para login multi-org)
    const stored = this.get<UserProfile[]>(KEYS.USERS_LIST, []);
    const all = [...INITIAL_USERS, ...stored];
    return all.find((u) => (u.email || '').toLowerCase() === email.trim().toLowerCase());
  }

  getUserProfile(): UserProfile | null {
    const activeEmail = localStorage.getItem(KEYS.LOGGED_IN_EMAIL);
    if (activeEmail === 'LOGGED_OUT') return null;

    if (activeEmail) {
      const found = this.getUserByEmail(activeEmail);
      if (found) return found;
    }
    
    // No logged-in user — force login screen
    return null;
  }

  saveUserProfile(user: UserProfile) {
    this.set(KEYS.USER, user);
    localStorage.setItem(KEYS.LOGGED_IN_EMAIL, user.email);
    this.notify();
  }

  loginWithGoogle(email: string, password?: string): { success: boolean; user?: UserProfile; message?: string } {
    const user = this.getUserByEmail(email);
    if (!user) {
      return {
        success: false,
        message: `A conta de e-mail (${email}) não está cadastrada no sistema. Peça a um Administrador para adicionar este e-mail no painel de Usuários & Permissões.`,
      };
    }

    if (!user.active) {
      return {
        success: false,
        message: `A conta (${email}) está inativa no momento. Entre em contato com o Administrador.`,
      };
    }

    // Validate password if user has one set locally
    if (user.password && password !== user.password) {
      return {
        success: false,
        message: 'Senha incorreta. Tente novamente.',
      };
    }

    this.saveUserProfile(user);
    return { success: true, user };
  }

  logout() {
    localStorage.setItem(KEYS.LOGGED_IN_EMAIL, 'LOGGED_OUT');
    this.notify();
  }

  // --- SETTINGS ---
  getSettings(): SystemSettings {
    return this.get<SystemSettings>(KEYS.SETTINGS, INITIAL_SETTINGS);
  }

  saveSettings(settings: SystemSettings) {
    this.set(KEYS.SETTINGS, settings);
    this.syncSettings(settings);
  }

  // --- SUBSCRIPTION & STRIPE ---
  getSubscription(): SubscriptionInfo {
    const sub = this.get<SubscriptionInfo>(KEYS.SUBSCRIPTION, INITIAL_SUBSCRIPTION);
    
    // Calculate dynamic days remaining
    if (sub.nextBillingDate) {
      const target = new Date(sub.nextBillingDate).getTime();
      const now = new Date().getTime();
      const diff = Math.ceil((target - now) / (1000 * 60 * 60 * 24));
      sub.daysRemaining = diff > 0 ? diff : 0;
      if (diff <= 0) {
        sub.status = 'past_due';
      }
    }
    return sub;
  }

  saveSubscription(sub: SubscriptionInfo) {
    this.set(KEYS.SUBSCRIPTION, sub);
  }

  renewSubscriptionViaStripe(paymentMethodDesc: string = 'Cartão de Crédito (Stripe)'): SubscriptionInfo {
    const sub = this.getSubscription();
    
    // Extend next billing date by 30 days
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 30);
    const nextDateIso = nextDate.toISOString().split('T')[0];

    const todayIso = new Date().toISOString().split('T')[0];
    const newInvoice = {
      id: `INV-${Date.now().toString().slice(-6)}`,
      date: todayIso,
      amount: sub.priceMonthly || 199.00,
      status: 'paid' as const,
      paymentMethod: paymentMethodDesc,
      invoiceUrl: '#',
    };

    const updatedSub: SubscriptionInfo = {
      ...sub,
      status: 'active',
      currentPeriodStart: todayIso,
      currentPeriodEnd: nextDateIso,
      nextBillingDate: nextDateIso,
      daysRemaining: 30,
      invoices: [newInvoice, ...(sub.invoices || [])],
    };

    this.saveSubscription(updatedSub);
    return updatedSub;
  }

  // --- MULTI-BRANCH METRICS & OVERVIEW ---
  getBranchMetrics(branchId: string) {
    const branch = this.getBranches().find((b) => b.id === branchId);
    const todayStr = new Date().toISOString().slice(0, 10);
    const monthStr = new Date().toISOString().slice(0, 7);

    // Sales for branch
    const allSales = this.getSales();
    const branchSales = allSales.filter((s) => !s.storeBranchId || s.storeBranchId === branchId);
    
    const todaySales = branchSales.filter((s) => s.date.startsWith(todayStr) && s.status === 'completed');
    const todaySalesAmount = todaySales.reduce((acc, s) => acc + s.total, 0);
    const todaySalesCount = todaySales.length;

    const monthlySales = branchSales.filter((s) => s.date.startsWith(monthStr) && s.status === 'completed');
    const monthlySalesAmount = monthlySales.reduce((acc, s) => acc + s.total, 0);

    // Products for branch
    const allProducts = this.getProducts();
    const branchProducts = allProducts.filter((p) => !p.storeBranchId || p.storeBranchId === branchId);
    const lowStockCount = branchProducts.filter((p) => p.currentStock <= p.minStock).length;

    // Caixa session
    const caixa = this.getActiveCaixaSession();
    const isCaixaOpen = caixa && caixa.status === 'open' && (!caixa.storeBranchId || caixa.storeBranchId === branchId);
    const caixaBalance = isCaixaOpen ? caixa.currentCashBalance : 0;

    // Users
    const users = this.getUsers();
    const activeUsersCount = users.filter((u) => u.active && (!u.storeBranchId || u.storeBranchId === branchId)).length;

    return {
      branch,
      todaySalesAmount,
      todaySalesCount,
      monthlySalesAmount,
      lowStockCount,
      totalProductsCount: branchProducts.length,
      isCaixaOpen,
      caixaBalance,
      activeUsersCount,
    };
  }

  getMultiBranchOverview() {
    const branches = this.getBranches();
    return branches.map((b) => this.getBranchMetrics(b.id));
  }

  // --- TV SHOWCASE ---
  getTVProducts(): Product[] {
    const products = this.getProducts();
    const tvProds = products.filter((p) => p.active && p.showOnTV);
    if (tvProds.length > 0) return tvProds;
    // Fallback if none explicitly checked yet: return top 6 products so TV view looks amazing immediately
    return products.slice(0, 6);
  }

  toggleProductTVShowcase(productId: string): boolean {
    const products = this.getProducts();
    const prod = products.find((p) => p.id === productId);
    if (prod) {
      prod.showOnTV = !prod.showOnTV;
      this.saveProduct(prod);
      return !!prod.showOnTV;
    }
    return false;
  }

  // --- RESET DEMO DATA ---
  resetDemoData() {
    localStorage.removeItem(KEYS.PRODUCTS);
    localStorage.removeItem(KEYS.CATEGORIES);
    localStorage.removeItem(KEYS.CUSTOMERS);
    localStorage.removeItem(KEYS.SUPPLIERS);
    localStorage.removeItem(KEYS.SALES);
    localStorage.removeItem(KEYS.SALE_ITEMS);
    localStorage.removeItem(KEYS.CAIXA);
    localStorage.removeItem(KEYS.CAIXA_HISTORY);
    localStorage.removeItem(KEYS.FINANCIAL);
    localStorage.removeItem(KEYS.MOVEMENTS);
    localStorage.removeItem(KEYS.BRANCHES);
    localStorage.removeItem(KEYS.USER);
    localStorage.removeItem(KEYS.USERS_LIST);
    localStorage.removeItem(KEYS.LOGGED_IN_EMAIL);
    localStorage.removeItem(KEYS.SETTINGS);
    localStorage.removeItem(KEYS.SUBSCRIPTION);
    localStorage.removeItem(StorageService.MIGRATION_KEY);
    this.migrated = false;
    this.notify();
  }
}

export const storageService = new StorageService();
