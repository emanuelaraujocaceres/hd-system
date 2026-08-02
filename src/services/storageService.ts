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
import { asArray, mapRows } from '../lib/safeSync';

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
  CREDIT_PAYMENTS: 'hd_system_credit_payments',
  VIEWING_ORG: 'hd_system_viewing_org',
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

  // Retorna o organization_id do usuário logado.
  // FAIL-CLOSED: se o perfil existe mas não tem organizationId, retorna ''
  // (escrever fica bloqueado em vez de gravar na organização errada).
  // O fallback para DEFAULT_ORG_ID só ocorre sem perfil salvo (bootstrap/offline).
  getCurrentOrgId(): string {
    // Superadmin override (visualizando outra org)
    if (this.isSuperAdmin()) {
      const override = localStorage.getItem(KEYS.VIEWING_ORG);
      if (override) {
        // Se o override é DEFAULT_ORG_ID, não precisa logar warning
        return override;
      }
    }
    try {
      const raw = localStorage.getItem('hd_system_user_profile');
      if (raw) {
        const profile = JSON.parse(raw);
        if (profile?.organizationId) return profile.organizationId;
        // Perfil existe mas SEM org: bloquear em vez de poluir outra organização
        console.error('[Storage] getCurrentOrgId() — usuário logado sem organizationId. Falha fechada: escrita bloqueada até o perfil ser corrigido.');
        return '';
      }
    } catch {}
    if (localStorage.getItem('hd_system_logged_in_email') !== 'LOGGED_OUT') {
      console.warn('[Storage] getCurrentOrgId() fallback to DEFAULT_ORG_ID — bootstrap/offline sem perfil salvo');
    }
    return DEFAULT_ORG_ID;
  }

  // Define um override de organização para superadmin (visualizar dados de outra org)
  superadminSetViewingOrg(orgId: string | null): void {
    if (!this.isSuperAdmin()) {
      console.warn('[Storage] Apenas superadmin pode definir viewing org');
      return;
    }
    if (orgId) {
      localStorage.setItem(KEYS.VIEWING_ORG, orgId);
    } else {
      localStorage.removeItem(KEYS.VIEWING_ORG);
    }
    // Chama listeners SÍNCRONA E ASSINCRONAMENTE para garantir que a UI
    // atualize imediatamente (evita depender do setTimeout do notify()).
    this.listeners.forEach((fn) => { try { fn(); } catch {} });
    this.notify();
  }

  // Retorna a organização que o superadmin está visualizando, ou null
  getSuperadminViewingOrg(): string | null {
    if (!this.isSuperAdmin()) return null;
    return localStorage.getItem(KEYS.VIEWING_ORG);
  }

  // Retorna true se a organização atual for a DEFAULT_ORG_ID (Adega dos Parças)
  private isDefaultOrg(): boolean {
    return this.getCurrentOrgId() === DEFAULT_ORG_ID;
  }

  // Verifica se o usuário logado é superadmin
  isSuperAdmin(): boolean {
    try {
      const raw = localStorage.getItem('hd_system_user_profile');
      if (raw) {
        const profile = JSON.parse(raw);
        return profile?.superadmin === true;
      }
    } catch {}
    return false;
  }

  // Verifica se um ID já é UUID (usado pelo App.tsx na resolução de filiais)
  isUuid(value: string | undefined | null): boolean {
    return !!value && StorageService.UUID_RE.test(value);
  }

  // Filtra um array pelo organization_id atual. Itens sem organizationId são exibidos
  // apenas na organização padrão (para compatibilidade com dados legados).
  // Superadmin vê TODOS os itens (cross-org), a menos que tenha um override ativo.
  private filterByOrg<T extends { organizationId?: string }>(items: T[]): T[] {
    if (this.isSuperAdmin()) {
      const viewingOrg = this.getSuperadminViewingOrg();
      if (!viewingOrg) return items; // sem override → vê tudo
      // Com override → filtrar para aquela org
      return items.filter((item) => {
        if (!item.organizationId) return false; // dados sem org só aparecem sem override
        return item.organizationId === viewingOrg;
      });
    }
    const orgId = this.getCurrentOrgId();
    return items.filter((item) => {
      if (!item.organizationId) return this.isDefaultOrg(); // legado: só na org padrão
      return item.organizationId === orgId;
    });
  }

  // Isolamento por filial: itens COM storeBranchId só aparecem na filial
  // selecionada no seletor. Itens SEM storeBranchId (legado / dados mock)
  // são tratados como compartilhados da org e ficam visíveis em qualquer filial.
  private filterBySelectedBranch<T extends { storeBranchId?: string }>(items: T[]): T[] {
    const branchId = this.getSelectedBranchId();
    if (!branchId) return items;
    return items.filter((i) => !i.storeBranchId || i.storeBranchId === branchId);
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
      store_branch_id: c.storeBranchId || null,
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
      store_branch_id: s.storeBranchId || null,
    });
  }

  private async syncSale(s: Sale) {
    try {
      // Normalize storeBranchId to UUID (resolve short codes like "br-01" to UUID)
      let branchUuid = s.storeBranchId || '';
      if (branchUuid && !StorageService.UUID_RE.test(branchUuid)) {
        const branches = this.getBranches();
        const matched = branches.find(b => b.code === branchUuid || b.id === branchUuid);
        if (matched) branchUuid = matched.id;
      }
      // First upsert the parent sale — wait for it to complete
      await syncService.upsertRow('sales', {
        id: s.id,
        organization_id: this.getCurrentOrgId(),
        store_branch_id: branchUuid,
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
      // Items are read from KEYS.SALE_ITEMS (which have stable IDs set by addSale),
      // so upsert with onConflict: 'id' correctly deduplicates instead of inserting.
      const allItems = this.get<any[]>(KEYS.SALE_ITEMS, []);
      const items = allItems.filter((i: any) => i.sale_id === s.id);
      if (items.length > 0) {
        await syncService.upsertRows('sale_items', items);
      }

      // Atualizar caixa em tempo real: somar a venda aos totais da sessão ativa
      await this.updateCaixaFromSale(s, branchUuid);
    } catch (err) {
      console.warn('[HD-Sync] syncSale failed (will retry via queue):', err);
    }
  }

  /**
   * Atualiza os totais da sessão de caixa ativa quando uma venda
   * é sincronizada de outro dispositivo.
   */
  private async updateCaixaFromSale(s: Sale, branchUuid: string) {
    try {
      const orgId = this.getCurrentOrgId();
      if (!orgId) return;

      // Buscar a sessão de caixa ativa da filial
      const { data: activeSession, error: sessionError } = await supabase
        .from('cash_sessions')
        .select('*')
        .eq('organization_id', orgId)
        .eq('store_branch_id', branchUuid || null)
        .eq('status', 'open')
        .maybeSingle();

      if (sessionError || !activeSession) return;

      // Calcular o valor da venda por método de pagamento
      const paymentTotals: Record<string, number> = {};
      s.payments.forEach((p) => {
        const method = p.method || 'cash';
        paymentTotals[method] = (paymentTotals[method] || 0) + (p.amount || 0);
      });

      // Atualizar os totais da sessão de caixa
      const updatedSession = {
        ...activeSession,
        total_sales_cash: (parseFloat(activeSession.total_sales_cash) || 0) + (paymentTotals['cash'] || 0),
        total_sales_pix: (parseFloat(activeSession.total_sales_pix) || 0) + (paymentTotals['pix'] || 0),
        total_sales_card: (parseFloat(activeSession.total_sales_card) || 0) + (paymentTotals['card'] || 0),
        total_sales_credit_account: (parseFloat(activeSession.total_sales_credit_account) || 0) + (paymentTotals['credit_account'] || 0),
        expected_balance: (parseFloat(activeSession.expected_balance) || 0) + s.total,
      };

      await syncService.upsertRow('cash_sessions', updatedSession);
      console.log(`[HD-Sync] 🔄 Caixa atualizado em tempo real: venda R$${s.total.toFixed(2)}`);
    } catch (err) {
      console.warn('[HD-Sync] updateCaixaFromSale failed (non-critical):', err);
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
    // Garantir que o ID seja UUID válido (pode vir do localStorage com ID legado TEXT)
    s.id = StorageService.ensureUuid(s.id);
    // Normalize storeBranchId to UUID
    let branchUuid = s.storeBranchId || '';
    if (branchUuid && !StorageService.UUID_RE.test(branchUuid)) {
      const branches = this.getBranches();
      const matched = branches.find(b => b.code === branchUuid || b.id === branchUuid);
      if (matched) branchUuid = matched.id;
    }
    const orgId = this.getCurrentOrgId();
    // Defensive: se organization_id for inválido, não tenta upsert
    if (!orgId || orgId === '' || orgId === 'undefined' || orgId === 'null' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orgId)) {
      console.warn(`[HD-Sync] ⚠️ syncCaixaSession skipped — organization_id inválido (${orgId})`);
      return;
    }
    syncService.upsertRow('cash_sessions', {
      id: s.id,
      organization_id: orgId,
      store_branch_id: branchUuid || null,
      user_id: s.operatorId && StorageService.UUID_RE.test(s.operatorId) ? s.operatorId : null,
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
      superadmin: u.superadmin === true,
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
    const products = this.get<Product[]>(KEYS.PRODUCTS, this.isDefaultOrg() ? INITIAL_PRODUCTS : []);
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
      organizationId: row.organization_id || undefined,
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
    const products = this.get<Product[]>(KEYS.PRODUCTS, this.isDefaultOrg() ? INITIAL_PRODUCTS : []).filter((p) => p.id !== id);
    this.set(KEYS.PRODUCTS, products);
  }

  removeSaleFromRemote(id: string) {
    const sales = this.get<Sale[]>(KEYS.SALES, this.isDefaultOrg() ? INITIAL_SALES : []).filter((s) => s.id !== id);
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
    const users = this.get<UserProfile[]>(KEYS.USERS_LIST, []).filter((u) => u.id !== id);
    this.set(KEYS.USERS_LIST, users);
  }

  updateCategoryFromRemote(row: any) {
    const categories = this.get<Category[]>(KEYS.CATEGORIES, this.isDefaultOrg() ? INITIAL_CATEGORIES : []);
    const mapped: Category = {
      id: row.id,
      name: row.name,
      color: row.color || '#6366f1',
      organizationId: row.organization_id || undefined,
    };
    const idx = categories.findIndex((c) => c.id === mapped.id);
    if (idx >= 0) categories[idx] = mapped;
    else categories.push(mapped);
    this.set(KEYS.CATEGORIES, categories);
  }

  removeCategoryFromRemote(id: string) {
    const categories = this.get<Category[]>(KEYS.CATEGORIES, this.isDefaultOrg() ? INITIAL_CATEGORIES : []).filter((c) => c.id !== id);
    this.set(KEYS.CATEGORIES, categories);
  }

  updateSaleFromRemote(row: any) {
    const sales = this.get<Sale[]>(KEYS.SALES, this.isDefaultOrg() ? INITIAL_SALES : []);
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
    // Fallbacks defensivos com existing?. — se o payload vier parcial (ex:
    // via realtime), os campos faltantes NUNCA zeram a venda local.
    const mapped: Sale = {
      id: row.id,
      code: row.code ?? existing?.code,
      date: row.created_at || existing?.date || new Date().toISOString(),
      operatorId: row.user_id ?? existing?.operatorId ?? '',
      operatorName: row.operator_name || existing?.operatorName || 'Sistema',
      customerId: row.customer_id || existing?.customerId || undefined,
      customerName: (row.customer_name ?? row.notes) || existing?.customerName || undefined,
      storeBranchId: row.store_branch_id ?? existing?.storeBranchId ?? '',
      items: existing?.items || [],
      subtotal: row.subtotal !== undefined && row.subtotal !== null ? parseFloat(row.subtotal) : (existing?.subtotal ?? 0),
      discount: row.discount !== undefined && row.discount !== null ? parseFloat(row.discount) : (existing?.discount ?? 0),
      total: row.total !== undefined && row.total !== null ? parseFloat(row.total) : (existing?.total ?? 0),
      payments: existing?.payments || [{ method: (row.payment_method as any) || 'cash', amount: parseFloat(row.total) || 0 }],
      status: row.status || 'completed',
      organizationId: row.organization_id || existing?.organizationId || undefined,
    };

    const idx = sales.findIndex((s) => s.id === mapped.id);
    if (idx >= 0) sales[idx] = mapped;
    else sales.unshift(mapped);
    this.set(KEYS.SALES, sales);

    // Fetch items async and update if we get data back
    fetchItems().then((items) => {
      if (items.length > 0) {
        const updated = this.get<Sale[]>(KEYS.SALES, this.isDefaultOrg() ? INITIAL_SALES : []);
        const found = updated.find((s) => s.id === row.id);
        if (found) {
          found.items = items;
          this.set(KEYS.SALES, updated);
        }
      }
    });
  }

  updateCustomerFromRemote(row: any) {
    const customers = this.get<Customer[]>(KEYS.CUSTOMERS, this.isDefaultOrg() ? INITIAL_CUSTOMERS : []);
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
      organizationId: row.organization_id || undefined,
    };
    const idx = customers.findIndex((c) => c.id === mapped.id);
    if (idx >= 0) customers[idx] = mapped;
    else customers.unshift(mapped);
    this.set(KEYS.CUSTOMERS, customers);
  }

  removeCustomerFromRemote(id: string) {
    const customers = this.get<Customer[]>(KEYS.CUSTOMERS, this.isDefaultOrg() ? INITIAL_CUSTOMERS : []).filter((c) => c.id !== id);
    this.set(KEYS.CUSTOMERS, customers);
  }

  updateSupplierFromRemote(row: any) {
    const suppliers = this.get<Supplier[]>(KEYS.SUPPLIERS, this.isDefaultOrg() ? INITIAL_SUPPLIERS : []);
    const mapped: Supplier = {
      id: row.id,
      companyName: row.corporate_name || '',
      tradeName: row.trade_name || '',
      cnpj: row.cnpj || '',
      contactName: row.contact_person || '',
      email: row.email || '',
      phone: row.phone || '',
      organizationId: row.organization_id || undefined,
    };
    const idx = suppliers.findIndex((s) => s.id === mapped.id);
    if (idx >= 0) suppliers[idx] = mapped;
    else suppliers.unshift(mapped);
    this.set(KEYS.SUPPLIERS, suppliers);
  }

  removeSupplierFromRemote(id: string) {
    const suppliers = this.get<Supplier[]>(KEYS.SUPPLIERS, this.isDefaultOrg() ? INITIAL_SUPPLIERS : []).filter((s) => s.id !== id);
    this.set(KEYS.SUPPLIERS, suppliers);
  }

  updateFinancialFromRemote(row: any) {
    const accounts = this.get<FinancialAccount[]>(KEYS.FINANCIAL, this.isDefaultOrg() ? INITIAL_FINANCIAL_ACCOUNTS : []);
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
      organizationId: row.organization_id || undefined,
    };
    const idx = accounts.findIndex((a) => a.id === mapped.id);
    if (idx >= 0) accounts[idx] = mapped;
    else accounts.unshift(mapped);
    this.set(KEYS.FINANCIAL, accounts);
  }

  removeFinancialFromRemote(id: string) {
    const accounts = this.get<FinancialAccount[]>(KEYS.FINANCIAL, this.isDefaultOrg() ? INITIAL_FINANCIAL_ACCOUNTS : []).filter((a) => a.id !== id);
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
      organizationId: row.organization_id || undefined,
    };
    this.set(KEYS.CAIXA, session);
  }

  updateBranchFromRemote(row: any) {
    const branches = this.get<StoreBranch[]>(KEYS.BRANCHES, this.isDefaultOrg() ? INITIAL_BRANCHES : []);
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
      organizationId: row.organization_id || undefined,
    };
    const idx = branches.findIndex((b) => b.id === mapped.id);
    if (idx >= 0) branches[idx] = mapped;
    else branches.push(mapped);
    this.set(KEYS.BRANCHES, branches);
  }

  removeBranchFromRemote(id: string) {
    const branches = this.get<StoreBranch[]>(KEYS.BRANCHES, this.isDefaultOrg() ? INITIAL_BRANCHES : []).filter((b) => b.id !== id);
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
      organizationId: row.organization_id || undefined,
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
    // Superadmin é nível de sistema — não sincronizar como membro de org.
    // Compara por id OU email: após a migração de IDs para auth.uid(),
    // o id do banco difere dos UUIDs determinísticos (ex: usr-01), então
    // a comparação por id sozinha deixava o superadmin vazar para as orgs.
    const isSuperadminRemote = row?.superadmin === true
      || INITIAL_USERS.some((u) => u.id === row?.id || (u.email || '').toLowerCase() === (row?.email || '').toLowerCase());
    if (isSuperadminRemote) {
      console.log(`[HD-Sync] Ignorando update remoto de superadmin ${row?.email || row?.id} na lista de org`);
      return;
    }

    const users = this.get<UserProfile[]>(KEYS.USERS_LIST, []);
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
      mapped.superadmin = users[idx].superadmin; // preserve flag por segurança
      users[idx] = mapped;
    } else {
      // New user from cloud — no local password exists (can't login without one)
      // Still add them so they appear in the user list, but they'll need a password set locally
      users.unshift(mapped);
    }
    this.set(KEYS.USERS_LIST, users);

    // Se o usuário atualizado é o logado, atualiza também o perfil dedicado
    // (KEYS.USER) — ex: foto de perfil trocada em outro dispositivo aparece
    // na sidebar/header em tempo real.
    const activeEmail = localStorage.getItem(KEYS.LOGGED_IN_EMAIL);
    if (activeEmail && activeEmail !== 'LOGGED_OUT' && (mapped.email || '').toLowerCase() === activeEmail.toLowerCase()) {
      const current = this.get<UserProfile | null>(KEYS.USER, null);
      if (current) {
        this.saveUserProfile({ ...current, ...mapped, password: current.password || mapped.password });
      }
    }
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
        const hasLocalData = localStorage.getItem(key) !== null
          || (this.getStorageKey(key) !== key && localStorage.getItem(this.getStorageKey(key)) !== null);

        // SANITIZAÇÃO (regra preventiva): linhas inválidas da nuvem
        // (null/undefined/parciais) são descartadas ANTES de qualquer
        // mapeamento. Antes, um único registro inválido derrubava a
        // hidratação inteira: TypeError: Cannot read properties of
        // undefined (reading 'id') — e o app caía para localStorage.
        const safeCloud = mapRows(cloud, mapCloud, key);

        // First-time init: localStorage was never written (using INITIAL_* defaults).
        // If cloud has data, replace local with it (discard mock data).
        // If cloud is empty too, skip entirely (keep INITIAL_* defaults).
        if (!hasLocalData) {
          if (safeCloud.length === 0) return null;
          return safeCloud;
        }

        // Normal merge: local data is real (user-created)
        const cloudMapped = safeCloud;
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
         const local = this.get<Product[]>(KEYS.PRODUCTS, this.isDefaultOrg() ? INITIAL_PRODUCTS : []);
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
         const local = this.get<Category[]>(KEYS.CATEGORIES, this.isDefaultOrg() ? INITIAL_CATEGORIES : []);
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
         const local = this.get<Customer[]>(KEYS.CUSTOMERS, this.isDefaultOrg() ? INITIAL_CUSTOMERS : []);
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
         const local = this.get<Supplier[]>(KEYS.SUPPLIERS, this.isDefaultOrg() ? INITIAL_SUPPLIERS : []);
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
        // Regra preventiva: descarta linhas inválidas antes de qualquer uso
        const safeSales = asArray<any>(sales);
        const safeSaleItems = asArray<any>(saleItems);
        const salesKey = KEYS.SALES;
        const hasLocalSales = localStorage.getItem(salesKey) !== null
          || (this.getStorageKey(salesKey) !== salesKey && localStorage.getItem(this.getStorageKey(salesKey)) !== null);
        const localSalesBefore = this.get<Sale[]>(KEYS.SALES, this.isDefaultOrg() ? INITIAL_SALES : []);
        console.log(`[HD-Sync] 📊 Sales hydration: hasLocalSales=${hasLocalSales}, localCount=${localSalesBefore.length}, cloudCount=${safeSales.length}`);
        if (localSalesBefore.length > 0) {
          console.log(`[HD-Sync] 📊 Local sale IDs:`, localSalesBefore.map(s => `${s.id} (customer: ${s.customerName || 'N/A'})`));
        }

        // Handle sale_items first (they're needed for sales merge)
        if (safeSaleItems.length > 0) {
          this.set(KEYS.SALE_ITEMS, safeSaleItems);
        }

        // Group sale_items by sale_id
        const itemsBySaleId: Record<string, any[]> = {};
        let effectiveItems = safeSaleItems.length > 0 ? safeSaleItems : null;
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

        if (!hasLocalSales && safeSales.length === 0) {
          // Neither real local data nor cloud — skip (keep INITIAL_SALES)
        } else if (!hasLocalSales && safeSales.length > 0) {
          // First time: replace INITIAL_SALES with cloud data
          const cloudMapped = safeSales.map((r: any) => {
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
          const localSales = this.get<Sale[]>(KEYS.SALES, this.isDefaultOrg() ? INITIAL_SALES : []);
          const localSalesById = new Map(localSales.map((s) => [s.id, s]));
          const cloudSaleIds = new Set(safeSales.map((r: any) => r.id));

          // Sync local-only sales to cloud
          for (const s of localSales) {
            if (!cloudSaleIds.has(s.id)) {
              this.syncSale(s);
            }
          }

          // Merge: map cloud sales preserving local items when cloud has none
          const cloudMapped = safeSales.map((r: any) => {
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
          // Sort: newest first by date (defensive — cloud ORDER BY + local safety net)
          mergedSales.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
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
         const local = this.get<StoreBranch[]>(KEYS.BRANCHES, this.isDefaultOrg() ? INITIAL_BRANCHES : []);
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
         const local = this.get<FinancialAccount[]>(KEYS.FINANCIAL, this.isDefaultOrg() ? INITIAL_FINANCIAL_ACCOUNTS : []);
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
        const existing = this.get<UserProfile[]>(KEYS.USERS_LIST, []);
        const safeUsers = asArray<any>(users);
        const cloudIds = new Set(safeUsers.map((r: any) => r.id));
        const orgId = this.getCurrentOrgId();

        // NOTE: Não fazemos sync de local-only users para o cloud aqui.
        // system_users é gerenciado pelo servidor (server.ts), que usa o
        // Auth UUID real. IDs determinísticos do frontend nunca bateriam
        // com auth.uid() e o RLS bloquearia.

        // Só inclui usuários do cloud que pertencem à org atual.
        // Superadmins globais (INITIAL_USERS com superadmin) nunca entram
        // na lista de membros de uma org — nem pelo id (que mudou para
        // auth.uid() pós-migração) nem pelo email.
        const isSuperadminRemote = (r: any) =>
          r?.superadmin === true
          || INITIAL_USERS.some((u) => u.superadmin && ((u.id === r?.id) || (u.email || '').toLowerCase() === (r?.email || '').toLowerCase()));
        const cloudUsersInOrg = safeUsers.filter((r: any) =>
          !isSuperadminRemote(r)
          && (r.organization_id === orgId || (!r.organization_id && this.isDefaultOrg()))
        );

        const mapped = cloudUsersInOrg.map((r: any) => ({
          id: r.id, name: r.name, email: r.email, role: r.role || 'collaborator',
          organizationId: r.organization_id || orgId,
          storeBranchId: r.store_branch_id || '',
          permissions: r.permissions || { pdv: true, inventory: true, crm: true, finance: true, dashboard: true, settings: true },
          active: r.active !== false, avatarUrl: r.avatar_url || undefined,
        }));
        const initialIds = new Set(INITIAL_USERS.filter(u => u.organizationId === orgId || (!u.organizationId && this.isDefaultOrg())).map((u) => u.id));
        const initialByEmail = new Map(
          INITIAL_USERS.filter(u => u.email)
            .map((u) => [(u.email || '').toLowerCase(), u]),
        );
        const merged = mapped.map((m: any) => {
          const local = existing.find((u) => u.id === m.id || (u.email || '').toLowerCase() === (m.email || '').toLowerCase());
          const initialUser = initialIds.has(m.id) ? INITIAL_USERS.find((u) => u.id === m.id)
            : initialByEmail.get((m.email || '').toLowerCase());
          if (initialUser) {
            return {
              ...(initialUser || m),
              name: m.name || initialUser.name,
              avatarUrl: m.avatarUrl || initialUser.avatarUrl,
              permissions: m.permissions || initialUser.permissions,
              active: m.active !== undefined ? m.active : (initialUser.active ?? true),
              storeBranchId: m.storeBranchId || initialUser.storeBranchId,
              superadmin: initialUser.superadmin === true,
            };
          }
          return { ...m, password: local?.password || m.password };
        });
        // Keep local users not in cloud (sem fazer upsert), da mesma org
        const isSuper = this.isSuperAdmin();
        for (const e of existing) {
          if (e.superadmin === true) continue; // superadmin global não entra na lista de org
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
        const safeCaixa = asArray<any>(caixa);
        const caixaKey = KEYS.CAIXA;
        const hasLocalCaixa = localStorage.getItem(caixaKey) !== null
          || (this.getStorageKey(caixaKey) !== caixaKey && localStorage.getItem(this.getStorageKey(caixaKey)) !== null);

        if (safeCaixa.length > 0) {
          if (!hasLocalCaixa) {
            // First time: replace INITIAL_CAIXA with cloud data
            let filtered = safeCaixa;
            if (branchId) {
              filtered = safeCaixa.filter((r: any) => r.store_branch_id === branchId);
            }
            if (filtered.length === 0 && branchId) filtered = safeCaixa;
            const sorted = [...filtered].sort((a: any, b: any) => {
              if (a.status === 'open' && b.status !== 'open') return -1;
              if (a.status !== 'open' && b.status === 'open') return 1;
              return new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime();
            });
            const s = sorted[0];
            // Se o caixa foi aberto em um dia ANTERIOR, reinicia o saldo para o dia atual
            const openedDate = new Date(s.opened_at).toDateString();
            const today = new Date().toDateString();
            const isPreviousDay = openedDate !== today;
            // Recalcula o saldo: se sessão de hoje, usa expected_balance; se de dia anterior, reinicia
            const expectedBalance = parseFloat(s.expected_balance) || 0;
            const totalSalesCash = parseFloat(s.total_sales_cash) || 0;
            const suprimentos = parseFloat(s.suprimentos) || 0;
            const sangrias = parseFloat(s.sangrias) || 0;
            const initialCash = parseFloat(s.opening_balance) || 0;
            this.set(KEYS.CAIXA, {
              id: s.id, openedAt: s.opened_at, closedAt: s.closed_at || undefined,
              operatorId: s.user_id || '', operatorName: s.operator_name || '',
              initialCash: initialCash,
              currentCashBalance: isPreviousDay ? initialCash : expectedBalance,
              totalSalesCash: isPreviousDay ? 0 : totalSalesCash,
              totalSalesPix: isPreviousDay ? 0 : (parseFloat(s.total_sales_pix) || 0),
              totalSalesCard: isPreviousDay ? 0 : (parseFloat(s.total_sales_card) || 0),
              totalSalesCreditAccount: isPreviousDay ? 0 : (parseFloat(s.total_sales_credit_account) || 0),
              suprimentos: isPreviousDay ? 0 : suprimentos,
              sangrias: isPreviousDay ? 0 : sangrias,
              status: s.status, notes: s.notes || undefined,
              storeBranchId: s.store_branch_id || undefined,
            });
          } else {
            // Normal: prefer local open session over cloud
            let filtered = safeCaixa;
            if (branchId) filtered = safeCaixa.filter((r: any) => r.store_branch_id === branchId);
            else filtered = safeCaixa;
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
              // Se o caixa foi aberto em um dia ANTERIOR, reinicia o saldo para o dia atual
              const openedDate = new Date(s.opened_at).toDateString();
              const today = new Date().toDateString();
              const isPreviousDay = openedDate !== today;
              const initialCash = parseFloat(s.opening_balance) || 0;
              this.set(KEYS.CAIXA, {
                id: s.id, openedAt: s.opened_at, closedAt: s.closed_at || undefined,
                operatorId: s.user_id || '', operatorName: s.operator_name || '',
                initialCash: initialCash,
                currentCashBalance: isPreviousDay ? initialCash : (parseFloat(s.expected_balance) || 0),
                totalSalesCash: isPreviousDay ? 0 : (parseFloat(s.total_sales_cash) || 0),
                totalSalesPix: isPreviousDay ? 0 : (parseFloat(s.total_sales_pix) || 0),
                totalSalesCard: isPreviousDay ? 0 : (parseFloat(s.total_sales_card) || 0),
                totalSalesCreditAccount: isPreviousDay ? 0 : (parseFloat(s.total_sales_credit_account) || 0),
                suprimentos: isPreviousDay ? 0 : (parseFloat(s.suprimentos) || 0),
                sangrias: isPreviousDay ? 0 : (parseFloat(s.sangrias) || 0),
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
        // Regra preventiva: primeiro elemento pode ser null/undefined
        const firstSetting = asArray(settings)[0];
        if (firstSetting && firstSetting.settings) {
          // Merge: cloud settings override, but keep any local-only keys
          const localSettings = this.getSettings();
          const merged = { ...localSettings, ...firstSetting.settings };
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

  // Chaves que NÃO devem ser particionadas por organização (globais do usuário/sessão)
  private static GLOBAL_KEYS = new Set<string>([
    'hd_system_user_profile',
    'hd_system_logged_in_email',
    'hd_system_viewing_org',
  ]);

  // Retorna a chave de storage particionada por organização.
  // Chaves globais (perfil, sessão) não são prefixadas.
  // Superadmin sem override usa chave global (vê dados de todas as orgs).
  private getStorageKey(rawKey: string): string {
    if (StorageService.GLOBAL_KEYS.has(rawKey)) return rawKey;
    // Superadmin sem override: usa chave global (cross-org)
    if (this.isSuperAdmin() && !this.getSuperadminViewingOrg()) return rawKey;
    const orgId = this.getCurrentOrgId();
    return `${rawKey}_${orgId}`;
  }

  private get<T>(key: string, defaultValue: T): T {
    try {
      const storageKey = this.getStorageKey(key);
      let item = localStorage.getItem(storageKey);
      if (item !== null) return JSON.parse(item);
      // Fallback: tentar chave global (existente antes da partição)
      if (storageKey !== key) {
        item = localStorage.getItem(key);
        if (item !== null) return JSON.parse(item);
      }
      return defaultValue;
    } catch {
      return defaultValue;
    }
  }

  private set<T>(key: string, value: T) {
    try {
      localStorage.setItem(this.getStorageKey(key), JSON.stringify(value));
      this.notify();
    } catch (e) {
      console.error('Error writing to localStorage:', e);
    }
  }

  // --- PRODUCTS ---
  getProducts(): Product[] {
    const fallback = this.isDefaultOrg() ? INITIAL_PRODUCTS : [];
    const all = this.get<Product[]>(KEYS.PRODUCTS, fallback);
    return this.filterBySelectedBranch<Product>(this.filterByOrg<Product>(all));
  }

  saveProduct(product: Product): Product {
    product.id = StorageService.ensureUuid(product.id);
    product.organizationId = this.getCurrentOrgId();
    // Isolamento por filial: produto criado/alterado pertence à filial selecionada
    const branchId = this.getSelectedBranchId();
    if (branchId) product.storeBranchId = branchId;
    const products = this.get<Product[]>(KEYS.PRODUCTS, this.isDefaultOrg() ? INITIAL_PRODUCTS : []);
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
    const allProducts = this.get<Product[]>(KEYS.PRODUCTS, this.isDefaultOrg() ? INITIAL_PRODUCTS : []);
    const product = allProducts.find((p) => p.id === id);
    // Defense-in-depth: só permite deletar se o produto pertence à org atual
    if (product && !this.isSuperAdmin()) {
      const filtered = this.filterByOrg([product]);
      if (filtered.length === 0) {
        console.warn(`[Storage] Blocked delete of product ${id} from another org`);
        return;
      }
    }
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
    const allSales = this.get<Sale[]>(KEYS.SALES, this.isDefaultOrg() ? INITIAL_SALES : []);
    const saleToDelete = allSales.find((s) => s.id === id);
    // Defense-in-depth: só permite deletar se a venda pertence à org atual
    if (saleToDelete && !this.isSuperAdmin()) {
      if (saleToDelete.organizationId && saleToDelete.organizationId !== this.getCurrentOrgId()) {
        console.warn(`[Storage] Blocked delete of sale ${id} from another org`);
        return;
      }
      // Para vendas sem organizationId (legado), verificar pela filial
      if (!saleToDelete.organizationId) {
        const targetOrgId = this.getCurrentOrgId();
        const branchIds = new Set(this.getBranches().filter(b => b.organizationId === targetOrgId).map(b => b.id));
        if (!branchIds.has(saleToDelete.storeBranchId)) {
          console.warn(`[Storage] Blocked delete of sale ${id} from another org (branch check)`);
          return;
        }
      }
    }
    const sales = allSales.filter((s) => s.id !== id);
    this.set(KEYS.SALES, sales);
    syncService.deleteRow('sales', id);
    // Also delete sale_items from Supabase to prevent orphaned records
    if (saleToDelete && saleToDelete.items) {
      // Delete sale_items from Supabase (we don't have individual IDs — delete by sale_id)
      (async () => {
        try {
          await supabase.from('sale_items').delete().eq('sale_id', id);
        } catch (err: any) {
          console.warn('[Storage] Erro ao limpar sale_items do Supabase:', err?.message);
        }
      })();
    }
    // Also remove from separate localStorage key
    const existingItems = this.get<any[]>(KEYS.SALE_ITEMS, []);
    const filtered = existingItems.filter((i: any) => i.sale_id !== id);
    this.set(KEYS.SALE_ITEMS, filtered);
    if (saleToDelete) {
      undoManager.push({
        type: 'delete-sale',
        description: `Excluir venda ${saleToDelete.code || saleToDelete.id}`,
        undo: () => {
          const sales = this.get<Sale[]>(KEYS.SALES, this.isDefaultOrg() ? INITIAL_SALES : []);
          if (!sales.some((s) => s.id === saleToDelete.id)) {
            sales.push(saleToDelete);
            this.set(KEYS.SALES, sales);
            syncService.upsertRow('sales', saleToDelete);
          }
        },
        timestamp: Date.now(),
      });
    }
  }

  async updateStock(productId: string, quantityDelta: number, reason: string, operatorName: string) {
    const products = this.get<Product[]>(KEYS.PRODUCTS, this.isDefaultOrg() ? INITIAL_PRODUCTS : []);
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
      storeBranchId: prod.storeBranchId,
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
        p_organization_id: this.getCurrentOrgId(),
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
    const all = this.get<StockMovement[]>(KEYS.MOVEMENTS, []);
    const viewingOrg = this.getSuperadminViewingOrg();
    let result: StockMovement[];
    // Superadmin sem override: vê tudo
    if (this.isSuperAdmin() && !viewingOrg) result = all;
    // Com override: filtrar pelas filiais da org
    else if (viewingOrg) {
      const branchIds = new Set(this.getBranches().filter(b => b.organizationId === viewingOrg).map(b => b.id));
      result = all.filter(m => m.storeBranchId ? branchIds.has(m.storeBranchId) : false);
    }
    // Usuário comum: filtrar pelas filiais da sua org
    else {
      const targetOrgId = this.getCurrentOrgId();
      const branchIds = new Set(this.getBranches().filter(b => b.organizationId === targetOrgId).map(b => b.id));
      result = all.filter(m => {
        if (!m.storeBranchId) return this.isDefaultOrg();
        return branchIds.has(m.storeBranchId);
      });
    }
    // Isolamento: dentro do escopo da org, mostra só a filial selecionada
    return this.filterBySelectedBranch(result);
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
    const categories = this.get<Category[]>(KEYS.CATEGORIES, this.isDefaultOrg() ? INITIAL_CATEGORIES : []);
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
    const categories = this.get<Category[]>(KEYS.CATEGORIES, this.isDefaultOrg() ? INITIAL_CATEGORIES : []).filter((c) => c.id !== id);
    this.set(KEYS.CATEGORIES, categories);
    syncService.deleteRow('categories', id);
  }

  // --- CUSTOMERS ---
  getCustomers(): Customer[] {
    const fallback = this.isDefaultOrg() ? INITIAL_CUSTOMERS : [];
    const all = this.get<Customer[]>(KEYS.CUSTOMERS, fallback);
    return this.filterBySelectedBranch<Customer>(this.filterByOrg<Customer>(all));
  }

  saveCustomer(customer: Customer) {
    customer.id = StorageService.ensureUuid(customer.id);
    customer.organizationId = this.getCurrentOrgId();
    const branchId = this.getSelectedBranchId();
    if (branchId) customer.storeBranchId = branchId;
    const customers = this.get<Customer[]>(KEYS.CUSTOMERS, this.isDefaultOrg() ? INITIAL_CUSTOMERS : []);
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
    const customers = this.get<Customer[]>(KEYS.CUSTOMERS, this.isDefaultOrg() ? INITIAL_CUSTOMERS : []).filter((c) => c.id !== id);
    this.set(KEYS.CUSTOMERS, customers);
    syncService.deleteRow('customers', id);
  }

  // --- SUPPLIERS ---
  getSuppliers(): Supplier[] {
    const fallback = this.isDefaultOrg() ? INITIAL_SUPPLIERS : [];
    const all = this.get<Supplier[]>(KEYS.SUPPLIERS, fallback);
    return this.filterBySelectedBranch<Supplier>(this.filterByOrg<Supplier>(all));
  }

  saveSupplier(supplier: Supplier) {
    supplier.id = StorageService.ensureUuid(supplier.id);
    supplier.organizationId = this.getCurrentOrgId();
    const branchId = this.getSelectedBranchId();
    if (branchId) supplier.storeBranchId = branchId;
    const suppliers = this.get<Supplier[]>(KEYS.SUPPLIERS, this.isDefaultOrg() ? INITIAL_SUPPLIERS : []);
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
    const suppliers = this.get<Supplier[]>(KEYS.SUPPLIERS, this.isDefaultOrg() ? INITIAL_SUPPLIERS : []).filter((s) => s.id !== id);
    this.set(KEYS.SUPPLIERS, suppliers);
    syncService.deleteRow('suppliers', id);
  }

  // --- SALES & PDV ---
  getSales(): Sale[] {
    const fallback = this.isDefaultOrg() ? INITIAL_SALES : [];
    const all = this.get<Sale[]>(KEYS.SALES, fallback);
    const viewingOrg = this.getSuperadminViewingOrg();
    const sortDesc = (arr: Sale[]) => arr.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    let result: Sale[];
    // Superadmin sem override: vê tudo
    if (this.isSuperAdmin() && !viewingOrg) result = all;
    // Com override (superadmin vendo org específica): filtrar pelas filiais da org
    else if (viewingOrg) {
      const branchIds = new Set(this.getBranches().filter(b => b.organizationId === viewingOrg).map(b => b.id));
      result = all.filter(s => branchIds.has(s.storeBranchId));
    }
    // Usuário comum (qualquer org, incluindo default): filtrar pelas filiais da sua org
    else {
      const targetOrgId = this.getCurrentOrgId();
      const branchIds = new Set(this.getBranches().filter(b => b.organizationId === targetOrgId).map(b => b.id));
      result = all.filter(s => {
        if (!s.storeBranchId) return this.isDefaultOrg(); // legado: só na org padrão
        return branchIds.has(s.storeBranchId);
      });
    }
    // Isolamento: dentro do escopo da org, mostra só a filial selecionada
    return sortDesc(this.filterBySelectedBranch(result));
  }

  getSaleItems(): any[] {
    const all = this.get<any[]>(KEYS.SALE_ITEMS, []);
    // Filtra por vendas que pertencem à org atual (defense-in-depth)
    const sales = this.getSales();
    const validSaleIds = new Set(sales.map(s => s.id));
    return all.filter(item => validSaleIds.has(item.sale_id));
  }

  getCreditPayments(): any[] {
    const all = this.get<any[]>(KEYS.CREDIT_PAYMENTS, []);
    // Filtra por vendas que pertencem à org atual
    const sales = this.getSales();
    const validSaleIds = new Set(sales.map(s => s.id));
    return all.filter(p => validSaleIds.has(p.sale_id));
  }

  saveCreditPayments(payments: any[]) {
    this.set(KEYS.CREDIT_PAYMENTS, payments);
  }

  async addSale(sale: Sale) {
    sale.id = StorageService.ensureUuid(sale.id);
    sale.organizationId = this.getCurrentOrgId();
    // Isolamento por filial: a venda pertence à filial selecionada no PDV
    const branchId = this.getSelectedBranchId();
    if (branchId) sale.storeBranchId = branchId;
    // Save sale_items to separate localStorage key FIRST (with stable IDs)
    // so syncSale can read them and upsert with onConflict: 'id' deduplication.
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

    const sales = this.get<Sale[]>(KEYS.SALES, this.isDefaultOrg() ? INITIAL_SALES : []);
    sales.unshift(sale);
    this.set(KEYS.SALES, sales);
    this.syncSale(sale);

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

      // Resolve storeBranchId from short code (e.g. "br-01") to UUID for RPC
      let branchUuid = sale.storeBranchId || null;
      if (branchUuid && !StorageService.UUID_RE.test(branchUuid)) {
        const branches = this.getBranches();
        const matched = branches.find(b => b.code === branchUuid || b.id === branchUuid);
        if (matched) branchUuid = matched.id;
      }

      const { data, error } = await supabase.rpc('process_sale_transaction', {
        p_sale_id: sale.id,
        p_product_id: sale.items?.[0]?.productId || '',
        p_quantity: sale.items?.reduce((sum, i) => sum + i.quantity, 0) || 0,
        p_unit_price: sale.items?.[0]?.unitPrice || sale.total,
        p_discount: sale.discount || 0,
        p_total: sale.total,
        p_reason: `Venda PDV #${sale.code}`,
        p_operator_name: sale.operatorName,
        p_organization_id: this.getCurrentOrgId(),
        p_store_branch_id: branchUuid,
        p_sale_items: saleItemsJson,
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
    // Leitura direta da chave particionada (sem o fallback do get<> para a
    // chave global, que poderia vazar o caixa de outra org para esta).
    const storageKey = this.getStorageKey(KEYS.CAIXA);
    try {
      const item = localStorage.getItem(storageKey);
      if (item !== null) {
        const session = JSON.parse(item) as CashRegisterSession;
        if (session?.id) {
          // Isolamento por filial: o caixa aberto pertence à filial em que
          // foi aberto. Se o usuário trocou de filial, NÃO mostra o caixa
          // da outra (cada filial tem seu caixa único).
          const branchId = this.getSelectedBranchId();
          if (branchId && session.storeBranchId && session.storeBranchId !== branchId) {
            // Caixa de outra filial → retorna sessão fechada (fail-closed)
            return {
              ...INITIAL_CAIXA_SESSION,
              id: '00000000-0000-0000-0000-000000000000',
              status: 'closed',
              organizationId: this.getCurrentOrgId(),
              operatorId: '',
              operatorName: '',
              openedAt: new Date().toISOString(),
              notes: '',
            };
          }
          return session;
        }
      }
    } catch {}
    // FAIL-CLOSED: sem caixa aberto salvo nesta org, retorna uma sessão
    // FECHADA e vazia — NUNCA o INITIAL_CAIXA_SESSION. Antes, a org default
    // (Adega) mostrava um "caixa aberto fantasma" com R$ 0,00 em dispositivos
    // que ainda não haviam aberto caixa (ex: celular), divergindo do caixa
    // real aberto em outro dispositivo (ex: PC com R$ 250).
    return {
      ...INITIAL_CAIXA_SESSION,
      id: '00000000-0000-0000-0000-000000000000',
      status: 'closed',
      organizationId: this.getCurrentOrgId(),
      operatorId: '',
      operatorName: '',
      openedAt: new Date().toISOString(),
      notes: '',
    };
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

  /**
   * Abre (ou ADOTA) o caixa da filial atual — caixa único por filial.
   *
   * Antes: cada dispositivo gerava UUID próprio ao abrir caixa, criando
   * sessões duplicadas na mesma filial — o realtime/hydrate acabava
   * sobrescrevendo uma pela outra (ex: R$ 250 no PC vs R$ 0 no celular).
   *
   * Agora: se já existe caixa ABERTO na mesma filial (no cloud), este
   * dispositivo adota essa sessão (mesmo id, mesmos contadores) em vez
   * de criar duplicata. Ambos passam a operar o MESMO caixa em tempo real.
   * Offline: cria nova sessão local (subirá ao cloud quando reconectar).
   */
  async openNewCaixaSession(operatorId: string, operatorName: string, initialCash: number, notes?: string): Promise<CashRegisterSession> {
    const orgId = this.getCurrentOrgId();
    // Resolver a filial atual (short code → UUID), como syncCaixaSession faz
    let branchId = this.getSelectedBranchId();
    if (branchId && !StorageService.UUID_RE.test(branchId)) {
      const branches = this.getBranches();
      const matched = branches.find(b => b.id === branchId || b.code === branchId);
      if (matched) branchId = matched.id;
    }

    // Tentativa de adotar caixa aberto existente na mesma filial (cloud)
    try {
      let query = supabase
        .from('cash_sessions')
        .select('*')
        .eq('organization_id', orgId)
        .eq('status', 'open');
      if (branchId) query = query.eq('store_branch_id', branchId);
      const { data } = await query.order('opened_at', { ascending: false }).limit(1);
      if (data && data.length > 0) {
        const s = data[0];
        const adopted: CashRegisterSession = {
          id: s.id,
          openedAt: s.opened_at,
          closedAt: s.closed_at || undefined,
          operatorId: s.user_id || operatorId,
          operatorName: s.operator_name || operatorName,
          initialCash: parseFloat(s.opening_balance) || 0,
          currentCashBalance: parseFloat(s.expected_balance) || 0,
          totalSalesCash: parseFloat(s.total_sales_cash) || 0,
          totalSalesPix: parseFloat(s.total_sales_pix) || 0,
          totalSalesCard: parseFloat(s.total_sales_card) || 0,
          totalSalesCreditAccount: parseFloat(s.total_sales_credit_account) || 0,
          suprimentos: parseFloat(s.suprimentos) || 0,
          sangrias: parseFloat(s.sangrias) || 0,
          status: 'open',
          organizationId: orgId,
          storeBranchId: s.store_branch_id || branchId || undefined,
          notes: s.notes || notes || `Caixa adotado por ${operatorName}.`,
        };
        console.log(`[HD-Caixa] 🔄 Caixa único por filial — adotando sessão existente (id=${adopted.id}, operador=${adopted.operatorName}, saldo=R$ ${adopted.currentCashBalance.toFixed(2)})`);
        this.saveActiveCaixaSession(adopted);
        return adopted;
      }
    } catch (e) {
      console.warn('[HD-Caixa] Falha ao consultar caixa aberto no cloud — criando nova sessão local:', e);
    }

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
      organizationId: orgId,
      storeBranchId: branchId || undefined,
      notes: notes || 'Caixa aberto com sucesso.',
    };
    this.saveActiveCaixaSession(newSession);
    return newSession;
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
    const viewingOrg = this.getSuperadminViewingOrg();
    let result: FinancialAccount[];
    // Superadmin sem override: vê tudo
    if (this.isSuperAdmin() && !viewingOrg) result = all;
    // Com override: filtrar pelas filiais da org
    else if (viewingOrg) {
      const branchIds = new Set(this.getBranches().filter(b => b.organizationId === viewingOrg).map(b => b.id));
      result = all.filter(a => a.storeBranchId ? branchIds.has(a.storeBranchId) : false);
    }
    // Usuário comum (qualquer org): filtrar pelas filiais da sua org
    else {
      const targetOrgId = this.getCurrentOrgId();
      const branchIds = new Set(this.getBranches().filter(b => b.organizationId === targetOrgId).map(b => b.id));
      result = all.filter(a => a.storeBranchId ? branchIds.has(a.storeBranchId) : false);
    }
    // Isolamento: dentro do escopo da org, mostra só a filial selecionada
    return this.filterBySelectedBranch(result);
  }

  saveFinancialAccount(acc: FinancialAccount) {
    acc.id = StorageService.ensureUuid(acc.id);
    acc.organizationId = this.getCurrentOrgId();
    const branchId = this.getSelectedBranchId();
    if (branchId) acc.storeBranchId = branchId;
    const accounts = this.get<FinancialAccount[]>(KEYS.FINANCIAL, this.isDefaultOrg() ? INITIAL_FINANCIAL_ACCOUNTS : []);
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
    const allAccounts = this.get<FinancialAccount[]>(KEYS.FINANCIAL, this.isDefaultOrg() ? INITIAL_FINANCIAL_ACCOUNTS : []);
    const accToDelete = allAccounts.find(a => a.id === id);
    // Defense-in-depth: só permite deletar se pertence à org atual
    if (accToDelete && !this.isSuperAdmin()) {
      if (accToDelete.organizationId && accToDelete.organizationId !== this.getCurrentOrgId()) {
        console.warn(`[Storage] Blocked delete of financial account ${id} from another org`);
        return;
      }
      if (!accToDelete.organizationId) {
        const targetOrgId = this.getCurrentOrgId();
        const branchIds = new Set(this.getBranches().filter(b => b.organizationId === targetOrgId).map(b => b.id));
        if (accToDelete.storeBranchId && !branchIds.has(accToDelete.storeBranchId)) {
          console.warn(`[Storage] Blocked delete of financial account ${id} from another org (branch check)`);
          return;
        }
      }
    }
    const accounts = allAccounts.filter((a) => a.id !== id);
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
    const branches = this.get<StoreBranch[]>(KEYS.BRANCHES, this.isDefaultOrg() ? INITIAL_BRANCHES : []);
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
    const branches = this.get<StoreBranch[]>(KEYS.BRANCHES, this.isDefaultOrg() ? INITIAL_BRANCHES : []).filter((b) => b.id !== id);
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
    const savedId = localStorage.getItem('hd_system_selected_branch_id');
    if (!savedId) return '';
    // Valida contra as filiais visíveis no escopo atual (org em foco).
    // Antes retornava o valor bruto — ao trocar de org (override do
    // superadmin), o filtro usava a filial de outra org e zerava as listas.
    const branches = this.getBranches();
    const found = branches.find((b) => b.id === savedId || b.code === savedId);
    return found ? found.id : '';
  }

  setSelectedBranchId(id: string) {
    localStorage.setItem('hd_system_selected_branch_id', id);
    this.notify();
  }

  // --- USERS & GOOGLE COLLABORATORS ---
  getUsers(): UserProfile[] {
    const orgId = this.getCurrentOrgId();
    const isSuper = this.isSuperAdmin();
    const viewingOrg = this.getSuperadminViewingOrg();
    const stored = this.get<UserProfile[]>(KEYS.USERS_LIST, []);
    // Ensure initial users always exist (merge by id)
    // CRITICAL: For INITIAL_USERS entries, NEVER let stored data overwrite email or password.
    // The stored/Supabase data may have stale emails from previous syncs.
    // Only include initial users whose org matches the current org (or has no org = legacy = default org)
    // Superadmin vê todos os INITIAL_USERS (a menos que tenha override ativo).
    const filteredInitials = (isSuper && !viewingOrg) ? INITIAL_USERS : INITIAL_USERS.filter((u) => {
      if (!u.organizationId) return this.isDefaultOrg();
      return u.organizationId === orgId;
    });
    const merged = [...filteredInitials];
    const initialIds = new Set(filteredInitials.map((u) => u.id));
    const initialByEmail = new Map(filteredInitials.filter((u) => u.email).map((u) => [(u.email || '').toLowerCase(), u]));
    for (const s of stored) {
      // Skip stored users from other orgs
      if (!isSuper || viewingOrg) {
        if (s.organizationId && s.organizationId !== orgId) continue;
        if (!s.organizationId && !this.isDefaultOrg()) continue;
      }
      const initialUser = initialIds.has(s.id) ? filteredInitials.find((u) => u.id === s.id)
        : initialByEmail.get((s.email || '').toLowerCase());
      if (initialUser) {
        // Initial user — only merge non-auth fields (name, avatar, permissions, etc.)
        const idx = merged.findIndex((u) => u.id === initialUser.id);
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
    // Superadmin é nível de sistema, não membro de organização alguma.
    // Remove superadmins da lista de usuários de org — pela flag OU por
    // correspondência de email com os perfis globais (cobre o caso de o
    // id ter sido migrado para auth.uid() e a flag não ter vindo da nuvem).
    const superEmails = new Set(
      INITIAL_USERS.filter((u) => u.superadmin && u.email).map((u) => (u.email || '').toLowerCase()),
    );
    const superIds = new Set(INITIAL_USERS.filter((u) => u.superadmin).map((u) => u.id));
    return merged.filter(
      (u) => !u.superadmin && !superIds.has(u.id) && !superEmails.has((u.email || '').toLowerCase()),
    );
  }

  saveUser(user: UserProfile) {
    user.id = StorageService.ensureUuid(user.id);
    user.organizationId = this.getCurrentOrgId();
    const users = this.get<UserProfile[]>(KEYS.USERS_LIST, []);
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
    const users = this.get<UserProfile[]>(KEYS.USERS_LIST, []).filter((u) => u.id !== id);
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
      // 1. Tentar o perfil dedicado (KEYS.USER) — salvo por saveUserProfile no login
      const savedProfile = this.get<UserProfile | null>(KEYS.USER, null);
      if (savedProfile && (savedProfile.email || '').toLowerCase() === activeEmail.trim().toLowerCase()) {
        return savedProfile;
      }
      // 2. Fallback: buscar na lista syncada (INITIAL_USERS + KEYS.USERS_LIST)
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
  // Faz backup completo do localStorage (JSON) antes de apagar, para recuperação
  resetDemoData(): { backupKey: string } | null {
    // Backup em JSON de todas as chaves hd_system_*
    let backupCount = 0;
    try {
      const backup: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('hd_system_')) {
          backup[key] = localStorage.getItem(key) || '';
          backupCount++;
        }
      }
      if (backupCount > 0) {
        const backupKey = `hd_system_backup_${Date.now()}`;
        localStorage.setItem(backupKey, JSON.stringify(backup));
        // Mantém só os 3 backups mais recentes
        const backupKeys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('hd_system_backup_')) backupKeys.push(key);
        }
        backupKeys.sort().reverse();
        for (const oldKey of backupKeys.slice(3)) localStorage.removeItem(oldKey);

        const dataKeys = [
          KEYS.PRODUCTS, KEYS.CATEGORIES, KEYS.CUSTOMERS, KEYS.SUPPLIERS,
          KEYS.SALES, KEYS.SALE_ITEMS, KEYS.CAIXA, KEYS.CAIXA_HISTORY,
          KEYS.FINANCIAL, KEYS.MOVEMENTS, KEYS.BRANCHES, KEYS.USERS_LIST,
          KEYS.SETTINGS, KEYS.CREDIT_PAYMENTS,
        ];
        // Remove chaves globais + chaves particionadas por org
        const orgId = this.getCurrentOrgId();
        for (const key of dataKeys) {
          localStorage.removeItem(key); // chave global (legado)
          localStorage.removeItem(`${key}_${orgId}`); // chave particionada
        }
        // Chaves que são sempre globais (não particionadas)
        localStorage.removeItem(KEYS.USER);
        localStorage.removeItem(KEYS.LOGGED_IN_EMAIL);
        localStorage.removeItem(StorageService.MIGRATION_KEY);
        this.migrated = false;
        this.notify();
        return { backupKey };
      }
    } catch (err) {
      console.error('[Storage] Backup before reset failed', err);
    }
    return null;
  }

  // Restaura um backup hd_system_backup_* salvo anteriormente
  restoreBackup(backupKey: string): boolean {
    try {
      const raw = localStorage.getItem(backupKey);
      if (!raw) return false;
      const backup: Record<string, string> = JSON.parse(raw);
      for (const [key, value] of Object.entries(backup)) {
        if (key.startsWith('hd_system_')) localStorage.setItem(key, value);
      }
      this.migrated = false;
      this.notify();
      return true;
    } catch (err) {
      console.error('[Storage] Restore backup failed', err);
      return false;
    }
  }

  // Lista backups disponíveis (mais recente primeiro)
  listBackups(): string[] {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('hd_system_backup_')) keys.push(key);
    }
    return keys.sort().reverse();
  }
}

export const storageService = new StorageService();
