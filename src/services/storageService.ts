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
  ScannedBoleto,
  CreditPayment,
  NFRecord,
  FooterMessage,
  MediaDevice,
  Printer,
  Table,
  CustomerSession,
  DigitalMenuConfig,
  BranchTheme,
  ApiKey,
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
import { asArray, mapRows, safeParseJson } from '../lib/safeSync';

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
  SCANNED_BOLETOS: 'hd_system_scanned_boletos',
  NF_RECORDS: 'hd_system_nf_records',
  // Frentes TV/impressora (agosto/2026)
  FOOTER_MESSAGES: 'hd_system_footer_messages',
  MEDIA_DEVICES: 'hd_system_media_devices',
  PRINTERS: 'hd_system_printers',
  // Cardápio Digital / Comandas (2026)
  TABLES: 'hd_system_tables',
  CUSTOMER_SESSIONS: 'hd_system_customer_sessions',
  DIGITAL_MENU_CONFIG: 'hd_system_digital_menu_config',
  BRANCH_THEMES: 'hd_system_branch_themes',
  API_KEYS: 'hd_system_api_keys',
  // Delivery (2026)
  DELIVERY_SETTINGS: 'hd_system_delivery_settings',
  DELIVERY_NEIGHBORHOODS: 'hd_system_delivery_neighborhoods',
  DELIVERY_DISTANCE_RATES: 'hd_system_delivery_distance_rates',
  DELIVERY_ORDERS: 'hd_system_delivery_orders',
  VIEWING_ORG: 'hd_system_viewing_org',
};

class StorageService {
  private listeners: Set<() => void> = new Set();
  private notifyTimer: ReturnType<typeof setTimeout> | null = null;
  private migrated = false;
  private _saleUpdateVersions: Record<string, number> = {}; // CONSIST-03: race condition guard

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

  /** Status da TV/vitrine derivado do heartbeat: online se last_seen_at < 60s. */
  static mediaStatusFrom(lastSeenAt?: string | null): 'online' | 'offline' | 'pending' {
    if (!lastSeenAt) return 'pending';
    const ageMs = Date.now() - new Date(lastSeenAt).getTime();
    return Number.isFinite(ageMs) && ageMs <= 60000 ? 'online' : 'offline';
  }

  /** Acesso via instância (singleton storageService). */
  mediaStatusFrom(lastSeenAt?: string | null): 'online' | 'offline' | 'pending' {
    return StorageService.mediaStatusFrom(lastSeenAt);
  }

  /** Valida se uma string é um UUID válido (v3, v4 ou v5). */
  isValidUuid(value: string | undefined | null): boolean {
    return !!value && StorageService.UUID_RE.test(value);
  }

  // Retorna o organization_id do usuário logado.
  // Super Admin (developer) SEM organizationId: fail-OPEN — acesso global.
  // Outros usuários sem org: fail-CLOSED — escrita bloqueada.
  // O fallback para DEFAULT_ORG_ID só ocorre sem perfil salvo (bootstrap/offline).
getCurrentOrgId(): string {
    // Superadmin override (visualizando outra org)
    if (this.isSuperAdmin()) {
      const override = localStorage.getItem(KEYS.VIEWING_ORG);
      if (override) {
        // Se o override é DEFAULT_ORG_ID, não precisa logar warning
        return override;
      }
      // Super Admin sem override: acesso global (organization_id = NULL no Supabase)
      // Retornar '' para indicar "sem filtro de organização" — o superadmin vê tudo.
      // Mas mantemos compatibilidade: se o perfil ainda tem organizationId salvo
      // no localStorage (de um login anterior), usamos o valor salvo apenas
      // para operações que exigem um org específico (como criar novos registros).
      try {
        const raw = localStorage.getItem('hd_system_user_profile');
        if (raw) {
          const profile = JSON.parse(raw);
          if (profile?.organizationId) return profile.organizationId;
        }
      } catch {
        console.error('[Storage] getCurrentOrgId: error parsing user profile from localStorage');
      }
      // Sem organizationId salvo: retornar '' para acesso global
      console.log('[Storage] getCurrentOrgId() — superadmin sem organizationId: acesso global');
      return '';
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
    } catch (err) {
      console.error('[Storage] getCurrentOrgId: error reading user profile from localStorage', err);
    }
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
  // NÃO aparecem quando uma filial específica está selecionada — evita
  // que dados de outra filial vazem para a filial atual.
  private filterBySelectedBranch<T extends { storeBranchId?: string }>(items: T[]): T[] {
    const branchId = this.getSelectedBranchId();
    if (!branchId) return [];
    return items.filter((i) => i.storeBranchId === branchId);
  }

  /**
   * Verifica se um registro remoto pertence à filial atual.
   * Usado nos *FromRemote() como defense-in-depth (o filtro primário
   * é o Realtime no App.tsx, mas se um evento passar, este check bloqueia).
   */
  private isRemoteFromCurrentBranch(row: any): boolean {
    const rawBranchId = this.getRawBranchId();
    if (!rawBranchId || !row?.store_branch_id) return true; // sem filtro: aceitar
    let resolved = rawBranchId;
    if (!StorageService.UUID_RE.test(resolved)) {
      const branches = this.getBranches();
      const matched = branches.find((b) => b.id === resolved || b.code === resolved);
      if (matched) resolved = matched.id;
    }
    return row.store_branch_id === resolved;
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

  public subscribe(listener: (key?: string, source?: 'local' | 'sync' | 'hydration' | 'remote') => void) {
    this.listeners.add(listener as any);
    return () => this.listeners.delete(listener as any);
  }

  // ─── CHANGE SOURCE TRACKING ────────────────────────────────────
  // Track where changes come from to filter notifications properly
  private changeSource: 'local' | 'sync' | 'hydration' | 'remote' = 'local';

  /**
   * Set the source of changes (to filter notifications)
   * - 'local': User action in this device → trigger notifications
   * - 'sync': Sync from cloud/hydration → don't trigger notifications
   * - 'hydration': Initial data load → don't trigger notifications
   * - 'remote': Real-time update from another device → trigger notifications
   */
  setChangeSource(source: 'local' | 'sync' | 'hydration' | 'remote') {
    this.changeSource = source;
  }

  /**
   * Get the current change source
   */
  getChangeSource(): 'local' | 'sync' | 'hydration' | 'remote' {
    return this.changeSource;
  }

  private notify(key?: string, source?: 'local' | 'sync' | 'hydration' | 'remote', payload?: any) {
    // FILA (não single-slot): o debounce original com `if (this.notifyTimer) return`
    // DROPAVA qualquer notificação que chegasse enquanto um timer estava pendente.
    // Em rajadas do Realtime (venda + item + caixa chegam juntos), a notificação da
    // VENDA era engolida → "não notifica nada". Agora enfileiramos TODAS e despachamos
    // o lote num microtask (setTimeout 0), respeitando o diferimento que evita o React
    // error #306, mas sem perder nenhum evento. O dedupe por (kind,id) no
    // globalNotificationService impede toasts/chimes duplicados do mesmo registro.
    // Handlers REMOTOS passam source='remote' EXPLÍCITO e o payload (o registro que
    // mudou): entre setChangeSource('remote') e notify() pode haver await.
    this._notifyQueue.push({ key, source: source || this.changeSource, payload });
    if (this.notifyTimer) return;
    this.notifyTimer = setTimeout(() => {
      this.notifyTimer = null;
      const batch = this._notifyQueue;
      this._notifyQueue = [];
      batch.forEach(({ key, source, payload }) => {
        this.listeners.forEach((fn) => {
          try { fn(key, source, payload); } catch (e) { console.warn('[HD-Sync] notify listener error', e); }
        });
      });
    }, 0);
  }

  private _notifyQueue: { key?: string; source?: 'local' | 'sync' | 'hydration' | 'remote'; payload?: any }[] = [];

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
    // Resolve store_branch_id: use product's value, or fall back to selected branch
    let branchId = p.storeBranchId || this.getSelectedBranchId() || '';
    if (branchId && !StorageService.UUID_RE.test(branchId)) {
      const resolved = this.resolveBranchId(branchId);
      if (resolved) branchId = resolved;
    }
    if (!branchId) {
      console.error('❌ syncProduct: Nenhuma filial selecionada!', p.id);
      return;
    }
    syncService.upsertRow('products', {
      id: p.id,
      organization_id: this.getCurrentOrgId(),
      store_branch_id: branchId,
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
      show_on_cardapio: p.showOnCardapio || false,
      tv_promo_price: p.tvPromoPrice || null,
      tv_highlight_tag: p.tvHighlightTag || null,
      wholesale_options: p.wholesaleOptions || null,
      expiration_date: p.expirationDate || null,
      is_composite: p.isComposite || false,
    });
  }

  private syncCategory(c: Category) {
    let branchId = c.storeBranchId || this.getSelectedBranchId() || '';
    if (branchId && !StorageService.UUID_RE.test(branchId)) {
      const resolved = this.resolveBranchId(branchId);
      if (resolved) branchId = resolved;
    }
    if (!branchId) {
      console.error('❌ syncCategory: Nenhuma filial selecionada!', c.id);
      return;
    }
    syncService.upsertRow('categories', {
      id: c.id,
      organization_id: this.getCurrentOrgId(),
      name: c.name,
      color: c.color || '#6366f1',
      store_branch_id: branchId,
    });
  }

  private syncCustomer(c: Customer) {
    let branchId = c.storeBranchId || this.getSelectedBranchId() || '';
    if (branchId && !StorageService.UUID_RE.test(branchId)) {
      const resolved = this.resolveBranchId(branchId);
      if (resolved) branchId = resolved;
    }
    if (!branchId) {
      console.error('❌ syncCustomer: Nenhuma filial selecionada!', c.id);
      return;
    }
    syncService.upsertRow('customers', {
      id: c.id,
      organization_id: this.getCurrentOrgId(),
      name: c.name,
      cpf_cnpj: c.cpfCnpj,
      email: c.email,
      phone: c.phone,
      credit_limit: c.creditLimit,
      store_branch_id: branchId,
    });
  }

  private syncSupplier(s: Supplier) {
    let branchId = s.storeBranchId || this.getSelectedBranchId() || '';
    if (branchId && !StorageService.UUID_RE.test(branchId)) {
      const resolved = this.resolveBranchId(branchId);
      if (resolved) branchId = resolved;
    }
    if (!branchId) {
      console.error('❌ syncSupplier: Nenhuma filial selecionada!', s.id);
      return;
    }
    syncService.upsertRow('suppliers', {
      id: s.id,
      organization_id: this.getCurrentOrgId(),
      corporate_name: s.companyName,
      trade_name: s.tradeName,
      cnpj: s.cnpj,
      contact_person: s.contactName,
      email: s.email,
      phone: s.phone,
      store_branch_id: branchId,
    });
  }

  private async syncSale(s: Sale) {
    try {
      // Normalize storeBranchId to UUID (resolve short codes like "br-01" to UUID)
      let branchUuid = s.storeBranchId || '';
      if (branchUuid && !StorageService.UUID_RE.test(branchUuid)) {
        const branches = this.getBranches();
        const matched = branches.find((b) => b.code === branchUuid || b.id === branchUuid);
        if (matched) branchUuid = matched.id;
      }
      // Organização da venda: resolve a partir da FILIAL (autoritativa) para que
      // pedidos do cardápio feitos por visitante anon (sem login → getCurrentOrgId()
      // retorna a org PADRÃO) cheguem ao Realtime da filial correta do operador.
      // Sem isso, o canal do operador filtra a venda por organization_id e o
      // bip/toast nunca dispara (pedido aparece em Pedidos, mas sem notificação).
      // Fallback: sale.organizationId (cardápio carrega a org da filial) e, por
      // fim, getCurrentOrgId() (PDV logado — sem alteração de comportamento).
      let orgId = this.getCurrentOrgId();
      if (branchUuid) {
        const branch = this.getBranches().find((b) => b.id === branchUuid);
        if (branch?.organizationId) orgId = branch.organizationId;
      }
      if (!orgId) orgId = s.organizationId || this.getCurrentOrgId();
      // First upsert the parent sale — wait for it to complete
      await syncService.upsertRow('sales', {
        id: s.id,
        organization_id: orgId,
        store_branch_id: branchUuid,
        user_id: s.operatorId && StorageService.UUID_RE.test(s.operatorId) ? s.operatorId : null,
        customer_id: s.customerId || null,
        table_id: s.tableId || null,
        customer_session_id: s.customerSessionId || null,
        code: s.code,
        created_at: s.date,                    // timestamp do momento da finalização
        operator_name: s.operatorName,         // nome real do usuário logado
        subtotal: s.subtotal,
        discount: s.discount,
        total: s.total,
        payment_method: s.payments[0]?.method || 'cash',
        payments_json: (s.payments && s.payments.length > 0)
          ? JSON.stringify(s.payments.map((p: any) => ({
              method: p.method,
              amount: p.amount,
              cashGiven: p.cashGiven,
              changeDue: p.changeDue,
            })))
          : JSON.stringify([{ method: 'cash', amount: s.total || 0 }]),
        order_source: s.orderSource || 'pdv',
        kitchen_status: s.kitchenStatus || 'pending',
        status: s.status,
        notes: s.notes || s.customerName || null,
        customer_name: s.customerName || null,
});
        // NOTA: sale_items NÃO são upsertados aqui — são IMUTÁVEIS e criados apenas
        // uma vez no addSale(). Re-sincronizar a cada mudança de status (kitchenStatus)
        // causava inserções duplicadas no Supabase (novos IDs a cada saveSale).
        // O addSale() já faz o upsert inicial dos itens com IDs estáveis.
        // NOTA: o caixa NÃO é atualizado aqui. O syncCaixaSession() (chamado por
      // saveActiveCaixaSession) grava os totais ABSOLUTOS da sessão local no
      // cloud. Somar a venda incrementalmente por cima (updateCaixaFromSale)
      // aplicava a venda DUAS vezes (ex.: caixa 101.90 + venda 79.90 = 181.80).
      // Vendas de outros dispositivos atualizam os contadores locais via
      // _updateCaixaFromSale() (realtime), sem escrever no cloud.
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
      // Recorrência / parcelamento (colunas novas — migração 20260810)
      is_recurring: a.isRecurring || false,
      is_installment: a.isInstallment || false,
      recurrence_type: a.recurrenceType || null,
      recurrence_count: a.recurrenceCount || null,
      recurrence_parent_id: a.recurrenceParentId || null,
      installment_number: a.installmentNumber || null,
      recurrences_json: JSON.stringify(a.recurrences || []),
      installments_json: JSON.stringify(a.installments || []),
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
    let branchId = m.storeBranchId || this.getSelectedBranchId() || '';
    if (branchId && !StorageService.UUID_RE.test(branchId)) {
      const resolved = this.resolveBranchId(branchId);
      if (resolved) branchId = resolved;
    }
    if (!branchId) {
      console.error('❌ syncStockMovement: Nenhuma filial selecionada!', m.id);
      return;
    }
    syncService.upsertRow('stock_movements', {
      id: m.id,
      organization_id: this.getCurrentOrgId(),
      store_branch_id: branchId,
      product_id: m.productId && StorageService.UUID_RE.test(m.productId) ? m.productId : null,
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
    let branchId = u.storeBranchId || this.getSelectedBranchId() || '';
    if (branchId && !StorageService.UUID_RE.test(branchId)) {
      const resolved = this.resolveBranchId(branchId);
      if (resolved) branchId = resolved;
    }
    if (!branchId) {
      console.error('❌ syncSystemUser: Nenhuma filial selecionada!', u.id);
      return;
    }
    syncService.upsertRow('system_users', {
      id: u.id,
      organization_id: this.getCurrentOrgId(),
      store_branch_id: branchId,
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
    let branchId = this.getSelectedBranchId() || '';
    if (!branchId) {
      console.error('❌ syncSettings: Nenhuma filial selecionada!');
      return;
    }
    syncService.upsertRow('system_settings', {
      id: this.getCurrentOrgId(),
      organization_id: this.getCurrentOrgId(),
      settings: s,
      updated_at: new Date().toISOString(),
      store_branch_id: branchId,
    });
  }

  // ─── REMOTE → LOCAL UPDATE HANDLERS ──────────────────────────────
  // Called by App.tsx when Supabase Realtime delivers a remote change.
  // These convert Supabase row format back to our app types and update localStorage.

  updateProductFromRemote(row: any) {
    this.setChangeSource('remote');
    // Branch isolation: reject remote products from other branches
    if (!this.isRemoteFromCurrentBranch(row)) {
      console.log(`[HD-Sync] Ignoring remote product from other branch: ${row.store_branch_id}`);
      return;
    }

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
      imageUrl: row.image_url || 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=300&auto=format&fit=crop&q=80',
      active: row.is_active !== false,
      updatedAt: row.updated_at || new Date().toISOString(),
      storeBranchId: row.store_branch_id || undefined,
      showOnTV: row.show_on_tv || false,
      showOnCardapio: row.show_on_cardapio || false,
      tvPromoPrice: parseFloat(row.tv_promo_price) || undefined,
      tvHighlightTag: row.tv_highlight_tag || undefined,
      organizationId: row.organization_id || undefined,
      wholesaleOptions: row.wholesale_options || undefined,
      expirationDate: row.expiration_date || undefined,
      isComposite: row.is_composite || false,
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
    this.notify(KEYS.PRODUCTS, 'remote');
  }

  removeProductFromRemote(id: string) {
    const products = this.get<Product[]>(KEYS.PRODUCTS, this.isDefaultOrg() ? INITIAL_PRODUCTS : []).filter((p) => p.id !== id);
    this.set(KEYS.PRODUCTS, products);
    this.notify();
  }

  removeSaleFromRemote(id: string) {
    const sales = this.get<Sale[]>(KEYS.SALES, this.isDefaultOrg() ? INITIAL_SALES : []).filter((s) => s.id !== id);
    this.set(KEYS.SALES, sales);
    this.notify();
  }

  removeCaixaFromRemote(id: string) {
    // Only clear if it matches current session
    const session = this.getActiveCaixaSession();
    if (session && session.id === id) {
      this.set(KEYS.CAIXA, { ...session, status: 'closed' });
      this.notify();
    }
  }

  removeUserFromRemote(id: string) {
    const users = this.get<UserProfile[]>(KEYS.USERS_LIST, []).filter((u) => u.id !== id);
    this.set(KEYS.USERS_LIST, users);
    this.notify();
  }

  updateCategoryFromRemote(row: any) {
    const categories = this.get<Category[]>(KEYS.CATEGORIES, this.isDefaultOrg() ? INITIAL_CATEGORIES : []);
    const branchId = this.getSelectedBranchId();
    const mapped: Category = {
      id: row.id,
      name: row.name,
      color: row.color || '#6366f1',
      organizationId: row.organization_id || undefined,
      storeBranchId: row.store_branch_id || branchId,
    };
    const idx = categories.findIndex((c) => c.id === mapped.id);
    if (idx >= 0) categories[idx] = mapped;
    else categories.push(mapped);
    this.set(KEYS.CATEGORIES, categories);
    this.notify();
  }

  removeCategoryFromRemote(id: string) {
    const categories = this.get<Category[]>(KEYS.CATEGORIES, this.isDefaultOrg() ? INITIAL_CATEGORIES : []).filter((c) => c.id !== id);
    this.set(KEYS.CATEGORIES, categories);
    this.notify();
  }

  updateSaleFromRemote(row: any, eventType?: string) {
    this.setChangeSource('remote');
    // Branch isolation: reject remote sales from other branches
    if (!this.isRemoteFromCurrentBranch(row)) {
      console.log(`[HD-Sync] Ignoring remote sale from other branch: ${row.store_branch_id}`);
      return;
    }

    const sales = this.get<Sale[]>(KEYS.SALES, this.isDefaultOrg() ? INITIAL_SALES : []);
    const existing = sales.find((s) => s.id === row.id);
    console.log(`[HD-Sync] 🔄 updateSaleFromRemote: id=${row.id}, exists=${!!existing}, row.customer_name=${row.customer_name}, row.notes=${row.notes}`);

    // CONSIST-03 fix: capture a snapshot version to detect race conditions.
    // If another update arrives before fetchItems() completes, we skip
    // the stale result to prevent overwriting newer data.
    const updateVersion = Date.now();
    this._saleUpdateVersions = this._saleUpdateVersions || {};
    this._saleUpdateVersions[row.id] = updateVersion;

    // Try to fetch sale items from Supabase
    const fetchItems = async () => {
      try {
        const { data } = await supabase.from('sale_items').select('*').eq('sale_id', row.id);
        // CONSIST-03: check if a newer update arrived while we were fetching
        if (this._saleUpdateVersions?.[row.id] !== updateVersion) {
          console.log(`[HD-Sync] ⚠️ Stale fetchItems for sale ${row.id} — a newer update arrived, skipping`);
          return null; // Signal to caller: don't apply
        }
        if (data && data.length > 0) {
          const mapped = data.map((item: any) => ({
            productId: item.product_id,
            productName: item.product_name || '',
            unitPrice: parseFloat(item.unit_price) || 0,
            quantity: item.quantity || 1,
            total: parseFloat(item.total_price) || 0,
          }));
          // Defensive dedupe: builds antigos podiam inserir sale_items duplicados
          // no cloud. Sem isto, o realtime puxaria as duplicatas e multiplicaria
          // os itens do pedido a cada transição de status (1→2→4→8).
          const seen = new Set<string>();
          return mapped.filter((it: any) => {
            const key = `${it.productId}|${it.quantity}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
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
      tableId: row.table_id || existing?.tableId || undefined,
      customerSessionId: row.customer_session_id || existing?.customerSessionId || undefined,
      items: existing?.items ? [...existing.items] : [],
      subtotal: row.subtotal !== undefined && row.subtotal !== null ? parseFloat(row.subtotal) : (existing?.subtotal ?? 0),
      discount: row.discount !== undefined && row.discount !== null ? parseFloat(row.discount) : (existing?.discount ?? 0),
      total: row.total !== undefined && row.total !== null ? parseFloat(row.total) : (existing?.total ?? 0),
      payments: row.payments_json
        ? safeParseJson(row.payments_json).map((p: any) => ({
            method: p.method || 'cash',
            amount: parseFloat(p.amount) || 0,
            cashGiven: p.cashGiven,
            changeDue: p.changeDue,
          }))
        : (existing?.payments || [{ method: (row.payment_method as any) || 'cash', amount: parseFloat(row.total) || 0 }]),
      orderSource: row.order_source || existing?.orderSource || 'pdv',
      kitchenStatus: row.kitchen_status || existing?.kitchenStatus || 'pending',
      status: row.status || 'completed',
      organizationId: row.organization_id || existing?.organizationId || undefined,
    };

    const idx = sales.findIndex((s) => s.id === mapped.id);
    if (idx >= 0) sales[idx] = mapped;
    else sales.unshift(mapped);
    this.set(KEYS.SALES, sales);
    // Só notifica (bip/toast) em INSERT remoto — uma venda NOVA chegou de
    // outro dispositivo. UPDATEs (ex.: operador marcando "Entregue" ou fechando
    // comanda) ecoam pelo Realtime e gerariam bip/toast DUPLICADO da ação local.
    if (eventType === 'INSERT') this.notify(KEYS.SALES, 'remote', mapped);

    // ── Update caixa session in real-time ──────────────────
    // When a sale is synced from another device, update the
    // local caixa counters so the dashboard reflects the
    // latest totals without waiting for a cash_sessions event.
    this._updateCaixaFromSale(mapped);

    // Fetch items async and update if we get data back
    fetchItems().then((items) => {
      if (items === null) return; // CONSIST-03: stale fetch — skip
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

  /**
   * Updates the active caixa session counters when a sale is synced
   * from another device via Realtime. Recalculates caixa totals
   * from all completed sales of the current branch to avoid
   * double-counting or missed updates.
   */
  private _updateCaixaFromSale(sale: Sale) {
    // Only update for completed sales
    if (sale.status !== 'completed') return;

    // Only update if the sale belongs to the current branch
    const rawBranchId = this.getRawBranchId();
    if (rawBranchId && sale.storeBranchId && sale.storeBranchId !== rawBranchId) {
      let resolvedBranchId = rawBranchId;
      if (!StorageService.UUID_RE.test(resolvedBranchId)) {
        const branches = this.getBranches();
        const matched = branches.find((b) => b.id === resolvedBranchId || b.code === resolvedBranchId);
        if (matched) resolvedBranchId = matched.id;
      }
      if (sale.storeBranchId !== resolvedBranchId) return;
    }

    // Get the active caixa session (if any)
    const session = this.getActiveCaixaSession();

    // Recalculate caixa totals from ALL completed sales of this branch.
    // This avoids double-counting (if the same sale event arrives twice)
    // and ensures accuracy even if events arrive out of order.
    const allSales = this.getSales();
    const branchSales = allSales.filter((s) => s.status === 'completed');

    let totalCash = 0;
    let totalPix = 0;
    let totalCard = 0;
    let totalCredit = 0;

    for (const s of branchSales) {
      for (const p of s.payments || []) {
        const amount = p.amount || 0;
        switch (p.method) {
          case 'cash':
            totalCash += amount;
            break;
          case 'pix':
            totalPix += amount;
            break;
          case 'credit_card':
          case 'debit_card':
            totalCard += amount;
            break;
          case 'credit_account':
            totalCredit += amount;
            break;
        }
      }
    }

    if (session && session.status === 'open') {
      // Update the open session in-place
      session.totalSalesCash = totalCash;
      session.totalSalesPix = totalPix;
      session.totalSalesCard = totalCard;
      session.totalSalesCreditAccount = totalCredit;
      session.currentCashBalance =
        session.initialCash + session.totalSalesCash + session.suprimentos - session.sangrias;
      this.set(KEYS.CAIXA, session);
    } else {
      // No open session locally — store the recalculated totals
      // so that when the user opens the caixa, it starts with correct values.
      // Also update the caixa in Supabase so other devices get the correct totals.
      console.log(
        `[HD-Sync] 🔄 Caixa recalculated from ${branchSales.length} sales (no open session locally): cash=R$${totalCash.toFixed(2)} pix=R$${totalPix.toFixed(2)} card=R$${totalCard.toFixed(2)}`,
      );
    }
  }

  updateCustomerFromRemote(row: any) {
    this.setChangeSource('remote');
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
      city: row.address_city || row.city || '',
      state: row.address_state || row.state || '',
      createdAt: row.created_at || new Date().toISOString(),
      storeBranchId: row.store_branch_id || undefined,
      organizationId: row.organization_id || undefined,
      // Campos de Delivery (2026)
      birthDate: row.birth_date || undefined,
      whatsapp: row.whatsapp || '',
      addressStreet: row.address_street || '',
      addressNumber: row.address_number || '',
      addressComplement: row.address_complement || '',
      addressNeighborhood: row.address_neighborhood || '',
      addressCity: row.address_city || '',
      addressState: row.address_state || '',
      addressZip: row.address_zip || '',
      googleId: row.google_id || undefined,
      passwordHash: row.password_hash || undefined,
      customerType: row.customer_type || 'walkin',
    };
    const idx = customers.findIndex((c) => c.id === mapped.id);
    if (idx >= 0) customers[idx] = mapped;
    else customers.unshift(mapped);
    this.set(KEYS.CUSTOMERS, customers);
    this.notify(KEYS.CUSTOMERS, 'remote');
  }

  removeCustomerFromRemote(id: string) {
    const customers = this.get<Customer[]>(KEYS.CUSTOMERS, this.isDefaultOrg() ? INITIAL_CUSTOMERS : []).filter((c) => c.id !== id);
    this.set(KEYS.CUSTOMERS, customers);
    this.notify();
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
      storeBranchId: row.store_branch_id || undefined,
      organizationId: row.organization_id || undefined,
    };
    const idx = suppliers.findIndex((s) => s.id === mapped.id);
    if (idx >= 0) suppliers[idx] = mapped;
    else suppliers.unshift(mapped);
    this.set(KEYS.SUPPLIERS, suppliers);
    this.notify();
  }

  removeSupplierFromRemote(id: string) {
    const suppliers = this.get<Supplier[]>(KEYS.SUPPLIERS, this.isDefaultOrg() ? INITIAL_SUPPLIERS : []).filter((s) => s.id !== id);
    this.set(KEYS.SUPPLIERS, suppliers);
    this.notify();
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
      // Recorrência / parcelamento (colunas novas)
      isRecurring: row.is_recurring || undefined,
      isInstallment: row.is_installment || undefined,
      recurrenceType: row.recurrence_type || undefined,
      recurrenceCount: row.recurrence_count || undefined,
      recurrenceParentId: row.recurrence_parent_id || undefined,
      installmentNumber: row.installment_number || undefined,
    };
    const idx = accounts.findIndex((a) => a.id === mapped.id);
    if (idx >= 0) accounts[idx] = mapped;
    else accounts.unshift(mapped);
    this.set(KEYS.FINANCIAL, accounts);
    this.notify();
  }

  removeFinancialFromRemote(id: string) {
    const accounts = this.get<FinancialAccount[]>(KEYS.FINANCIAL, this.isDefaultOrg() ? INITIAL_FINANCIAL_ACCOUNTS : []).filter((a) => a.id !== id);
    this.set(KEYS.FINANCIAL, accounts);
    this.notify();
  }

  updateCaixaFromRemote(row: any) {
    // Branch isolation: não sobrescrever caixa local se o evento é de outra filial
    // Usar getRawBranchId() + resolver UUID para comparação correta
    const rawBranchId = this.getRawBranchId();
    if (rawBranchId && row.store_branch_id) {
      let resolvedBranchId = rawBranchId;
      if (!StorageService.UUID_RE.test(resolvedBranchId)) {
        const branches = this.getBranches();
        const matched = branches.find((b) => b.id === resolvedBranchId || b.code === resolvedBranchId);
        if (matched) resolvedBranchId = matched.id;
      }
      if (row.store_branch_id !== resolvedBranchId) {
        console.log(`[HD-Sync] Ignoring caixa remote de outra filial (remote: ${row.store_branch_id}, current: ${resolvedBranchId})`);
        return;
      }
    }

    const localSession = this.getActiveCaixaSession();

    // Same session, both open → adopt remote counters (cloud is authoritative).
    // Using Math.max previously kept stale local values (e.g., R$ 54,00 from
    // old data) instead of the correct cloud totals (R$ 23,00).
    // Se o cloud diz que a sessão FECHOU (fechada manualmente em outro
    // dispositivo), o caixa local também fecha — antes o spread de
    // localSession preservava status:'open' e o caixa nunca fechava nos
    // demais dispositivos da filial.
    if (localSession && localSession.id === row.id && localSession.status === 'open') {
      const remoteCash = parseFloat(row.total_sales_cash) || 0;
      const remotePix = parseFloat(row.total_sales_pix) || 0;
      const remoteCard = parseFloat(row.total_sales_card) || 0;
      const remoteCredit = parseFloat(row.total_sales_credit_account) || 0;
      const remoteSuprimentos = parseFloat(row.suprimentos) || 0;
      const remoteSangrias = parseFloat(row.sangrias) || 0;
      const remoteClosed = row.status === 'closed';

      const adopted = {
        ...localSession,
        totalSalesCash: remoteCash,
        totalSalesPix: remotePix,
        totalSalesCard: remoteCard,
        totalSalesCreditAccount: remoteCredit,
        suprimentos: remoteSuprimentos,
        sangrias: remoteSangrias,
        // Fechamento manual em outro dispositivo propaga para este
        status: remoteClosed ? 'closed' : localSession.status,
        closedAt: remoteClosed ? (row.closed_at || new Date().toISOString()) : localSession.closedAt,
      };
      adopted.currentCashBalance = remoteClosed
        ? (parseFloat(row.expected_balance) || adopted.currentCashBalance)
        : adopted.initialCash + adopted.totalSalesCash + adopted.suprimentos - adopted.sangrias;
      this.set(KEYS.CAIXA, adopted);
      this.notify();
      console.log(`[HD-Sync] 🔄 Caixa ${remoteClosed ? 'FECHADO via cloud' : 'adotado do cloud'}: cash=R$${adopted.totalSalesCash.toFixed(2)} pix=R$${adopted.totalSalesPix.toFixed(2)} card=R$${adopted.totalSalesCard.toFixed(2)}`);
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
    this.notify();
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
      // Campos de Delivery (2026)
      fullAddress: row.full_address || undefined,
      whatsappPhone: row.whatsapp_phone || undefined,
      latitude: row.latitude || undefined,
      longitude: row.longitude || undefined,
      deliveryEnabled: row.delivery_enabled || false,
      pickupEnabled: row.pickup_enabled !== false,
    };
    const idx = branches.findIndex((b) => b.id === mapped.id);
    if (idx >= 0) branches[idx] = mapped;
    else branches.push(mapped);
    this.set(KEYS.BRANCHES, branches);
    this.notify();
  }

  removeBranchFromRemote(id: string) {
    const branches = this.get<StoreBranch[]>(KEYS.BRANCHES, this.isDefaultOrg() ? INITIAL_BRANCHES : []).filter((b) => b.id !== id);
    this.set(KEYS.BRANCHES, branches);
    this.notify();
  }

  updateSettingsFromRemote(row: any) {
    if (row.settings) {
      this.set(KEYS.SETTINGS, row.settings);
      this.notify();
    }
  }

  updateStockMovementFromRemote(row: any) {
    this.setChangeSource('remote');
    // Branch isolation: reject remote movements from other branches
    if (!this.isRemoteFromCurrentBranch(row)) {
      console.log(`[HD-Sync] Ignoring remote stock movement from other branch: ${row.store_branch_id}`);
      return;
    }

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
    this.notify(KEYS.MOVEMENTS, 'remote');
  }

  removeStockMovementFromRemote(id: string) {
    const movements = this.getMovements().filter((m) => m.id !== id);
    this.set(KEYS.MOVEMENTS, movements);
    this.notify();
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
    this.notify();

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

async hydrateFromCloud(branchId?: string): Promise<{ ok: boolean; resolvedBranchId?: string }> {
    try {
      // ✅ Mark as hydration to prevent false notifications
      this.setChangeSource('hydration');
      
      // Log inicio da hydratacao
      console.log('[HD-Sync] 🔄 Iniciando hydrateFromCloud', { branchId, isSuper: this.isSuperAdmin() });
      
      // PASSO 1: Buscar branches do Supabase PRIMEIRO para poder resolver
      // short codes (e.g. "br-01") → UUID. Antes, a resolução usava
      // getBranches() do localStorage que podia estar vazio (org não-default).
      const cloudBranches = await syncService.fetchRows('store_branches');
      
      // Monitor: verifica se conseguimos buscar branches
      if (cloudBranches === undefined || cloudBranches === null) {
        console.error('[HD-Sync] ❌ hydrateFromCloud: falha ao buscar branches do cloud');
        return { ok: false };
      }
      console.log('[HD-Sync] ✅ Buscado', cloudBranches.length, 'rows from store_branches');

      // Merge branches into localStorage para que getBranches() retorne dados atualizados
      if (cloudBranches.length > 0) {
        // REGRA 1 (cloud = fonte da verdade): filiais locais que NÃO existem no
        // cloud são podadas (seed mock INITIAL_BRANCHES, filiais apagadas do banco,
        // fantasmas de outros aparelhos). Antes o merge era aditivo e nunca removia,
        // então as 3 filiais do seed "HD-System" voltavam a cada limpeza de dados.
        const cloudIds = new Set(cloudBranches.map((r) => r.id));
        const localBranches = this.get<StoreBranch[]>(KEYS.BRANCHES, this.isDefaultOrg() ? INITIAL_BRANCHES : []);
        const merged = localBranches.filter((b) => cloudIds.has(b.id));
        for (const row of cloudBranches) {
          const mapped: StoreBranch = {
            id: row.id, name: row.name, code: row.code,
            cnpj: row.cnpj || '', city: row.city || '', state: row.state || '',
            address: row.address || '', phone: row.phone || '',
            isHeadquarters: row.is_headquarters || false,
            active: row.active !== false,
            organizationId: row.organization_id || undefined,
          };
          const idx = merged.findIndex((b) => b.id === mapped.id);
          if (idx >= 0) merged[idx] = mapped;
          else merged.push(mapped);
        }
        this.set(KEYS.BRANCHES, merged);
      }

      // PASSO 2: Agora resolver o branchId com branches disponíveis
      let resolvedBranchId: string | undefined = branchId;
      if (resolvedBranchId && !StorageService.UUID_RE.test(resolvedBranchId)) {
        const branches = this.getBranches();
        const matched = branches.find((b) => b.id === resolvedBranchId || b.code === resolvedBranchId);
        resolvedBranchId = matched ? matched.id : undefined;
      }
      // Se branchId era short code mas não resolveu, tentar com as branches do cloud
      if (branchId && !resolvedBranchId && cloudBranches.length > 0) {
        const matched = cloudBranches.find((b: any) => b.id === branchId || b.code === branchId);
        if (matched) resolvedBranchId = matched.id;
      }

      console.log(`[HD-Sync] 🔄 Hydrating with branch: ${resolvedBranchId || 'ALL (no branch filter)'}`);

      // PASSO 3: Buscar todos os dados filtrados pela filial
      // Todas as tabelas agora têm store_branch_id NOT NULL (banco convertido).
      // store_branches: já buscado no PASSO 1 (precisamos de TODAS para o seletor)
      const [products, categories, customers, suppliers, sales, financial, settings, users, movements, caixa, saleItems, boletos, creditPayments, nfRecords, footerMessages, mediaDevices, printers, tables, customerSessions, digitalMenuConfig, branchThemes, apiKeys, deliverySettings, deliveryNeighborhoods, deliveryDistanceRates, deliveryOrders, moduleVisibility] =
        await Promise.all([
          syncService.fetchRows('products', resolvedBranchId),
          syncService.fetchRows('categories', resolvedBranchId),
          syncService.fetchRows('customers', resolvedBranchId),
          syncService.fetchRows('suppliers', resolvedBranchId),
          syncService.fetchRows('sales', resolvedBranchId),
          syncService.fetchRows('financial_transactions', resolvedBranchId),
          syncService.fetchRows('system_settings', resolvedBranchId),
          syncService.fetchRows('system_users', resolvedBranchId),
          syncService.fetchRows('stock_movements', resolvedBranchId),
          syncService.fetchRows('cash_sessions', resolvedBranchId),
          syncService.fetchRows('sale_items', resolvedBranchId),
          syncService.fetchRows('scanned_boletos', resolvedBranchId),
          syncService.fetchRows('credit_payments', resolvedBranchId),
          syncService.fetchRows('nf_records', resolvedBranchId),
          syncService.fetchRows('footer_messages', resolvedBranchId),
          syncService.fetchRows('media_devices', resolvedBranchId),
          syncService.fetchRows('printers', resolvedBranchId),
          // Cardápio Digital / Comandas (2026)
          syncService.fetchRows('tables', resolvedBranchId),
          syncService.fetchRows('customer_sessions', resolvedBranchId),
          syncService.fetchRows('digital_menu_config', resolvedBranchId),
          syncService.fetchRows('branch_themes', resolvedBranchId),
          syncService.fetchRows('api_keys', resolvedBranchId),
          // Delivery (2026)
          syncService.fetchRows('delivery_settings', resolvedBranchId),
          syncService.fetchRows('delivery_neighborhoods', resolvedBranchId),
          syncService.fetchRows('delivery_distance_rates', resolvedBranchId),
          syncService.fetchRows('delivery_orders', resolvedBranchId),
          // Visibilidade de Módulos (2026)
          syncService.fetchRows('module_visibility', resolvedBranchId),
        ]);

      // ── HELPER: merge cloud rows into local data by ID ──────────
      // Keeps ALL local records. Cloud records override matching by ID.
      // Also syncs local-only records to Supabase so they aren't lost on future hydrations.
      // Returns null when neither local nor cloud has real data (prevents INITIAL_* from being written).
      const mergeBy = <T extends { storeBranchId?: string }>(
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

        // CRITICAL: Add local-only records not in cloud, but ONLY if they
        // belong to the current branch. Prevents cross-branch data leaks
        // (e.g. customers from Campinas appearing in São Paulo).
        for (const item of local) {
          if (!cloudIds.has(getId(item))) {
            // If resolved branch is set, only keep local items from this branch
            if (resolvedBranchId && item.storeBranchId && item.storeBranchId !== resolvedBranchId) {
              continue; // skip cross-branch local-only items
            }
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
             imageUrl: r.image_url || 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=300&auto=format&fit=crop&q=80',
            active: r.is_active !== false,
            updatedAt: r.updated_at || new Date().toISOString(),
            storeBranchId: r.store_branch_id || undefined,
            showOnTV: r.show_on_tv || false,
            showOnCardapio: r.show_on_cardapio || false,
            tvPromoPrice: parseFloat(r.tv_promo_price) || undefined,
            tvHighlightTag: r.tv_highlight_tag || undefined,
            organizationId: r.organization_id || this.getCurrentOrgId(),
            wholesaleOptions: r.wholesale_options || undefined,
            expirationDate: r.expiration_date || undefined,
            isComposite: r.is_composite || false,
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
            storeBranchId: r.store_branch_id || undefined,
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
            storeBranchId: r.store_branch_id || undefined,
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
            storeBranchId: r.store_branch_id || undefined,
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
              payments: r.payments_json
                ? safeParseJson(r.payments_json).map((p: any) => ({
                    method: p.method || 'cash',
                    amount: parseFloat(p.amount) || 0,
                    cashGiven: p.cashGiven,
                    changeDue: p.changeDue,
                  }))
                : [{ method: r.payment_method || 'cash', amount: fixedTotal }],
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
              payments: r.payments_json
                ? safeParseJson(r.payments_json).map((p: any) => ({
                    method: p.method || 'cash',
                    amount: parseFloat(p.amount) || 0,
                    cashGiven: p.cashGiven,
                    changeDue: p.changeDue,
                  }))
                : [{ method: r.payment_method || 'cash', amount: fixedTotal }],
              status: r.status || 'completed',
              updatedAt: r.updated_at || new Date().toISOString(),
            };
          });
// CRITICAL: Filter local-only sales by resolved branch to prevent
            // cross-branch data leaks (e.g. Campinas sales appearing in São Paulo).
            // However, preserve sales from active customer sessions (comandas em aberto),
            // para que pedidos não sumam da comanda ao mudar de filial ou recarregar o app.
            const activeSessions = this.getCustomerSessions()
              .filter((s) => s.status === 'active')
              .map((s) => s.id);
            const mergedSales = [
              ...cloudMapped,
              ...localSales.filter((s) => {
                // Sempre preservar vendas de sessões de cliente ativas (comandas em aberto)
                // activeSessions é um array (string[]), usar includes e não has
                if (activeSessions.includes(s.customerSessionId)) return true;
                if (cloudSaleIds.has(s.id)) return false; // já no cloud
                // If we have a resolved branch, only keep local sales from THIS branch
                if (resolvedBranchId) return s.storeBranchId === resolvedBranchId;
                return true; // no branch filter: keep all (edge case)
              }),
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

      // ── BRANCHES (já mergeadas no início do hydrateFromCloud) ──────
      // Branches são carregadas PRIMEIRO para resolver short codes → UUID.
      // O merge já foi feito no PASSO 1. Esta seção está aqui apenas para
      // compatibilidade com o mergeBy existente — não sobrescreve o que já foi salvo.
      // (removido: branches já foram merged no início)

      // ── FINANCIAL ACCOUNTS ────────────────────────────────────────
      {
         const local = this.get<FinancialAccount[]>(KEYS.FINANCIAL, this.isDefaultOrg() ? INITIAL_FINANCIAL_ACCOUNTS : []);
         console.log(`[HD-Sync] 📊 Financial hydration: local=${local.length}, cloud=${financial.length}`);
         // Contas cuja recorrência existe só no local (criadas antes da migração
         // 20260810) precisam ser re-enviadas ao cloud após o merge preservá-la.
         const needsRecurrenceResync: FinancialAccount[] = [];
         const merged = mergeBy(KEYS.FINANCIAL, local, financial,
          (r: any) => ({
            id: r.id, title: r.description, type: r.type, category: r.category,
            amount: parseFloat(r.amount) || 0, dueDate: r.due_date,
            paidDate: r.payment_date || undefined, status: r.status,
            recipientOrPayer: r.notes || '', storeBranchId: r.store_branch_id || undefined,
            organizationId: r.organization_id || undefined,
            isRecurring: r.is_recurring || undefined,
            isInstallment: r.is_installment || undefined,
            recurrenceType: r.recurrence_type || undefined,
            recurrenceCount: r.recurrence_count || undefined,
            recurrenceParentId: r.recurrence_parent_id || undefined,
             installmentNumber: r.installment_number || undefined,
             recurrences: safeParseJson(r.recurrences_json) || undefined,
             installments: safeParseJson(r.installments_json) || undefined,
           }),
          (a) => this.syncFinancialAccount(a),
          (a) => a.id,
          (loc, cm) => {
            // Cloud ainda sem os campos de recorrência (pré-migração)? Preservar
            // os valores locais e marcar para re-sync — senão a ocorrência futura
            // perderia a flag e voltaria a inflar os totais no outro dispositivo.
            const localHadRecurrence = loc.isRecurring || loc.isInstallment || loc.recurrenceParentId;
            if (localHadRecurrence && !cm.isRecurring && !cm.isInstallment && !cm.recurrenceParentId) {
              const restored: FinancialAccount = {
                ...cm,
                isRecurring: loc.isRecurring,
                isInstallment: loc.isInstallment,
                recurrenceType: loc.recurrenceType,
                recurrenceCount: loc.recurrenceCount,
                recurrenceParentId: loc.recurrenceParentId,
                installmentNumber: loc.installmentNumber,
              };
              needsRecurrenceResync.push(restored);
              return restored;
            }
            return cm;
          },
        );
        if (merged !== null) {
          this.set(KEYS.FINANCIAL, merged);
          // Subir os campos de recorrência preservados para o banco (idempotente)
          for (const acc of needsRecurrenceResync) this.syncFinancialAccount(acc);
        } else {
          // Se não há dados no cloud nem no local, salva array vazio para evitar null
          this.set(KEYS.FINANCIAL, []);
        }
      }

      // ── SCANNED BOLETOS (histórico de leituras) ───────────────────
      {
        const local = this.get<ScannedBoleto[]>(KEYS.SCANNED_BOLETOS, []);
        const merged = mergeBy(KEYS.SCANNED_BOLETOS, local, boletos,
          (r: any) => ({
            id: r.id, linhaDigitavel: r.linha_digitavel || '',
            barcode: r.barcode || '', amount: parseFloat(r.amount) || 0,
            dueDate: r.due_date || undefined, payer: r.payer || '',
            scanDate: r.scan_date || r.created_at || new Date().toISOString(),
            financialAccountId: r.financial_account_id || undefined,
            status: r.status || 'pending',
            storeBranchId: r.store_branch_id || undefined,
            organizationId: r.organization_id || undefined,
          }),
          (b) => this.syncScannedBoleto(b),
        );
        if (merged !== null) this.set(KEYS.SCANNED_BOLETOS, merged);
      }

      // ── CREDIT PAYMENTS (pagamentos de fiado) ─────────────────────
      {
        const local = this.get<CreditPayment[]>(KEYS.CREDIT_PAYMENTS, []);
        const merged = mergeBy(KEYS.CREDIT_PAYMENTS, local, creditPayments,
          (r: any) => ({
            id: r.id, saleId: r.sale_id, customerId: r.customer_id || undefined,
            customerName: r.customer_name || '', amount: parseFloat(r.amount) || 0,
            date: r.paid_at || r.created_at || new Date().toISOString(),
            paymentMethod: r.payment_method || undefined,
            storeBranchId: r.store_branch_id || undefined,
            organizationId: r.organization_id || undefined,
          }),
          (p) => this.syncCreditPayment(p),
        );
        if (merged !== null) this.set(KEYS.CREDIT_PAYMENTS, merged);
      }

      // ── NF RECORDS (notas fiscais importadas) ─────────────────────
      {
        const local = this.get<NFRecord[]>(KEYS.NF_RECORDS, []);
        const merged = mergeBy(KEYS.NF_RECORDS, local, nfRecords,
          (r: any) => ({
            id: r.id, scanDate: r.scan_date || r.created_at || new Date().toISOString(),
            supplierName: r.supplier_name || '',
            items: Array.isArray(r.items) ? r.items : [],
            totalValue: parseFloat(r.total_amount) || 0,
            note: r.note || '',
            storeBranchId: r.store_branch_id || undefined,
            organizationId: r.organization_id || undefined,
          }),
          (nf) => this.syncNFRecord(nf),
        );
        if (merged !== null) this.set(KEYS.NF_RECORDS, merged);
      }

      // ── FOOTER MESSAGES (rodapé da vitrine de TV) ─────────────────
      {
        const local = this.get<FooterMessage[]>(KEYS.FOOTER_MESSAGES, []);
        const merged = mergeBy(KEYS.FOOTER_MESSAGES, local, footerMessages,
          (r: any) => ({
            id: r.id, message: r.message || '',
            active: r.active !== false,
            sortOrder: parseInt(r.sort_order) || 0,
            storeBranchId: r.store_branch_id || undefined,
            organizationId: r.organization_id || this.getCurrentOrgId(),
          }),
          (f) => this.syncFooterMessage(f),
        );
        if (merged !== null) this.set(KEYS.FOOTER_MESSAGES, merged);
      }

      // ── MEDIA DEVICES (TVs/vitrines pareadas) ─────────────────────
      {
        const local = this.get<MediaDevice[]>(KEYS.MEDIA_DEVICES, []);
        const merged = mergeBy(KEYS.MEDIA_DEVICES, local, mediaDevices,
          (r: any): MediaDevice => ({
            id: r.id, name: r.name || '',
            deviceType: r.device_type === 'vitrine' ? 'vitrine' : 'tv',
            address: r.address || undefined,
            pairingCode: r.pairing_code || '',
            active: r.is_active !== false,
            status: StorageService.mediaStatusFrom(r.last_seen_at),
            lastSeenAt: r.last_seen_at || undefined,
            storeBranchId: r.store_branch_id || undefined,
            organizationId: r.organization_id || this.getCurrentOrgId(),
          }),
          (d) => this.syncMediaDevice(d),
        );
        if (merged !== null) this.set(KEYS.MEDIA_DEVICES, merged);
      }

      // ── PRINTERS (impressoras configuradas) ───────────────────────
      {
        const local = this.get<Printer[]>(KEYS.PRINTERS, []);
        const merged = mergeBy(KEYS.PRINTERS, local, printers,
          (r: any) => ({
            id: r.id, name: r.name || '',
            model: r.model || undefined,
            transport: (r.transport === 'webusb' || r.transport === 'serial' || r.transport === 'os' ? r.transport : 'network'),
            role: (r.role === 'bar' || r.role === 'cozinha' || r.role === 'outro' ? r.role : 'caixa'),
            categoryId: r.category_id || undefined,
            ipAddress: r.ip_address || undefined,
            port: parseInt(r.port) || undefined,
            isDefault: r.is_default === true,
            status: r.status || 'offline',
            lastSeenAt: r.last_seen_at || undefined,
            storeBranchId: r.store_branch_id || undefined,
            organizationId: r.organization_id || this.getCurrentOrgId(),
          }),
          (p) => this.syncPrinter(p),
        );
        if (merged !== null) this.set(KEYS.PRINTERS, merged);
      }

      // ── TABLES (mesas do cardápio digital) ───────────────────────
      {
        const local = this.get<Table[]>(KEYS.TABLES, []);
        const merged = mergeBy(KEYS.TABLES, local, tables,
          (r: any): Table => ({
            id: r.id, name: r.name || '',
            number: parseInt(r.number) || undefined,
            qrToken: r.qr_token || '',
            status: r.status || 'active',
            storeBranchId: r.store_branch_id || undefined,
            organizationId: r.organization_id || this.getCurrentOrgId(),
            createdAt: r.created_at || new Date().toISOString(),
            updatedAt: r.updated_at || new Date().toISOString(),
          }),
          (t) => this.syncTable(t),
        );
        if (merged !== null) this.set(KEYS.TABLES, merged);
      }

      // ── CUSTOMER SESSÕES (controle 1 celular por mesa) ──────────
      {
        const local = this.get<CustomerSession[]>(KEYS.CUSTOMER_SESSIONS, []);
        const merged = mergeBy(KEYS.CUSTOMER_SESSIONS, local, customerSessions,
          (r: any): CustomerSession => ({
            id: r.id, tableId: r.table_id || '',
            sessionToken: r.session_token || '',
            status: r.status || 'active',
            openedAt: r.opened_at || new Date().toISOString(),
            closedAt: r.closed_at || undefined,
            deviceFingerprint: r.device_fingerprint || undefined,
            customerName: r.customer_name || undefined,
            storeBranchId: r.store_branch_id || undefined,
            organizationId: r.organization_id || this.getCurrentOrgId(),
            createdAt: r.created_at || new Date().toISOString(),
            updatedAt: r.updated_at || new Date().toISOString(),
          }),
          (s) => this.syncCustomerSession(s),
        );
        if (merged !== null) this.set(KEYS.CUSTOMER_SESSIONS, merged);
      }

      // ── DIGITAL MENU CONFIG (config do cardápio por filial) ──────
      {
        const local = this.get<DigitalMenuConfig[]>(KEYS.DIGITAL_MENU_CONFIG, []);
        const merged = mergeBy(KEYS.DIGITAL_MENU_CONFIG, local, digitalMenuConfig,
          (r: any): DigitalMenuConfig => ({
            id: r.id, title: r.title || 'Cardápio Digital',
            subtitle: r.subtitle || undefined,
            logoUrl: r.logo_url || undefined,
            bannerUrl: r.banner_url || undefined,
            layoutMode: r.layout_mode === 'list' ? 'list' : 'grid',
            showPrices: r.show_prices !== false,
            storeBranchId: r.store_branch_id || undefined,
            organizationId: r.organization_id || this.getCurrentOrgId(),
            updatedAt: r.updated_at || new Date().toISOString(),
          }),
          (c) => this.syncDigitalMenuConfig(c),
        );
        if (merged !== null) this.set(KEYS.DIGITAL_MENU_CONFIG, merged);
      }

      // ── BRANCH THEMES (paleta de cores por filial) ───────────────
      {
        const local = this.get<BranchTheme[]>(KEYS.BRANCH_THEMES, []);
        const merged = mergeBy(KEYS.BRANCH_THEMES, local, branchThemes,
          (r: any): BranchTheme => ({
            id: r.id,
            primaryColor: r.primary_color || '#4f46e5',
            secondaryColor: r.secondary_color || '#6366f1',
            accentColor: r.accent_color || '#f59e0b',
            bgColor: r.bg_color || '#09090b',
            logoUrl: r.logo_url || undefined,
            faviconUrl: r.favicon_url || undefined,
            storeBranchId: r.store_branch_id || undefined,
            organizationId: r.organization_id || this.getCurrentOrgId(),
            updatedAt: r.updated_at || new Date().toISOString(),
          }),
          (t) => this.syncBranchTheme(t),
        );
        if (merged !== null) this.set(KEYS.BRANCH_THEMES, merged);
      }

      // ── API KEYS (chaves de API por filial) ──────────────────────
      {
        const local = this.get<ApiKey[]>(KEYS.API_KEYS, []);
        const merged = mergeBy(KEYS.API_KEYS, local, apiKeys,
          (r: any): ApiKey => ({
            id: r.id, name: r.name || '',
            keyHash: r.key_hash || '',
            keyPrefix: r.key_prefix || '',
            permissions: r.permissions || ['read:products'],
            isActive: r.is_active !== false,
            lastUsedAt: r.last_used_at || undefined,
            expiresAt: r.expires_at || undefined,
            storeBranchId: r.store_branch_id || undefined,
            organizationId: r.organization_id || this.getCurrentOrgId(),
            createdAt: r.created_at || new Date().toISOString(),
            updatedAt: r.updated_at || new Date().toISOString(),
          }),
          (k) => this.syncApiKey(k),
        );
        if (merged !== null) this.set(KEYS.API_KEYS, merged);
      }

      // ── MODULE VISIBILITY (visibilidade de módulos por filial) ──
      {
        const local = this.get<any[]>('hd_system_module_visibility', []);
        const settings = moduleVisibility.length > 0 ? moduleVisibility[0] : null;
        if (settings) {
          const mapped = {
            id: settings.id,
            organizationId: settings.organization_id || this.getCurrentOrgId(),
            storeBranchId: settings.store_branch_id || '',
            modulePdv: settings.module_pdv ?? true,
            moduleInventory: settings.module_inventory ?? true,
            moduleFiado: settings.module_fiado ?? false,
            moduleCrm: settings.module_crm ?? false,
            moduleDashboard: settings.module_dashboard ?? true,
            moduleFinance: settings.module_finance ?? false,
            moduleKds: settings.module_kds ?? false,
            moduleDelivery: settings.module_delivery ?? false,
            moduleCardapioDigital: settings.module_cardapio_digital ?? false,
            moduleCardapioPreview: settings.module_cardapio_preview ?? false,
            moduleTvShowcase: settings.module_tv_showcase ?? false,
            moduleTvConnect: settings.module_tv_connect ?? false,
          };
          // ✅ Preserve other branches, update/add current branch
          const idx = local.findIndex(v => v.storeBranchId === mapped.storeBranchId);
          if (idx >= 0) local[idx] = { ...local[idx], ...mapped };
          else local.push(mapped);
          this.set('hd_system_module_visibility', local);
        } else if (local.length > 0) {
          this.set('hd_system_module_visibility', local);
        }
      }

      // ── DELIVERY SETTINGS (configurações de delivery por filial) ──
      {
        const local = this.get<DeliverySettings | null>(KEYS.DELIVERY_SETTINGS, null);
        const settings = deliverySettings.length > 0 ? deliverySettings[0] : null;
        if (settings) {
          const mapped: DeliverySettings = {
            id: settings.id,
            organizationId: settings.organization_id || this.getCurrentOrgId(),
            storeBranchId: settings.store_branch_id || '',
            isActive: settings.is_active !== false,
            deliveryEnabled: settings.delivery_enabled !== false,
            pickupEnabled: settings.pickup_enabled !== false,
            operatingHours: settings.operating_hours || {},
            feeCalculationType: settings.fee_calculation_type || 'free',
            fixedFee: parseFloat(settings.fixed_fee) || 0,
            minimumOrderValue: parseFloat(settings.minimum_order_value) || 0,
            estimatedDeliveryTime: settings.estimated_delivery_time || 45,
            maxDeliveryDistanceKm: settings.max_delivery_distance_km || 15,
            branchLatitude: settings.branch_latitude || undefined,
            branchLongitude: settings.branch_longitude || undefined,
            whatsappPhone: settings.whatsapp_phone || undefined,
            fullAddress: settings.full_address || undefined,
            createdAt: settings.created_at || new Date().toISOString(),
            updatedAt: settings.updated_at || new Date().toISOString(),
          };
          this.set(KEYS.DELIVERY_SETTINGS, mapped);
        } else if (local) {
          // Não sobrescrever config local se cloud não tem
          this.set(KEYS.DELIVERY_SETTINGS, local);
        }
      }

      // ── DELIVERY NEIGHBORHOODS (bairros com taxas) ───────────────
      {
        const local = this.get<DeliveryNeighborhood[]>(KEYS.DELIVERY_NEIGHBORHOODS, []);
        const merged = mergeBy(KEYS.DELIVERY_NEIGHBORHOODS, local, deliveryNeighborhoods,
          (r: any): DeliveryNeighborhood => ({
            id: r.id,
            organizationId: r.organization_id || this.getCurrentOrgId(),
            storeBranchId: r.store_branch_id || '',
            neighborhood: r.neighborhood || '',
            fee: parseFloat(r.fee) || 0,
            estimatedTimeMinutes: r.estimated_time_minutes || 45,
            isActive: r.is_active !== false,
            createdAt: r.created_at || new Date().toISOString(),
            updatedAt: r.updated_at || new Date().toISOString(),
          }),
          (n) => this.syncDeliveryNeighborhood(n),
        );
        if (merged !== null) this.set(KEYS.DELIVERY_NEIGHBORHOODS, merged);
      }

      // ── DELIVERY DISTANCE RATES (faixas de distância) ─────────────
      {
        const local = this.get<DeliveryDistanceRate[]>(KEYS.DELIVERY_DISTANCE_RATES, []);
        const merged = mergeBy(KEYS.DELIVERY_DISTANCE_RATES, local, deliveryDistanceRates,
          (r: any): DeliveryDistanceRate => ({
            id: r.id,
            organizationId: r.organization_id || this.getCurrentOrgId(),
            storeBranchId: r.store_branch_id || '',
            minKm: parseFloat(r.min_km) || 0,
            maxKm: parseFloat(r.max_km) || 0,
            fee: parseFloat(r.fee) || 0,
            estimatedTimeMinutes: r.estimated_time_minutes || 45,
            isActive: r.is_active !== false,
            createdAt: r.created_at || new Date().toISOString(),
            updatedAt: r.updated_at || new Date().toISOString(),
          }),
          (r) => this.syncDeliveryDistanceRate(r),
        );
        if (merged !== null) this.set(KEYS.DELIVERY_DISTANCE_RATES, merged);
      }

      // ── DELIVERY ORDERS (pedidos de delivery) ─────────────────────
      {
        const local = this.get<DeliveryOrder[]>(KEYS.DELIVERY_ORDERS, []);
        const merged = mergeBy(KEYS.DELIVERY_ORDERS, local, deliveryOrders,
          (r: any): DeliveryOrder => ({
            id: r.id,
            organizationId: r.organization_id || this.getCurrentOrgId(),
            storeBranchId: r.store_branch_id || '',
            customerId: r.customer_id || undefined,
            orderNumber: r.order_number || 0,
            orderType: r.order_type || 'delivery',
            status: r.status || 'pending',
            items: r.items_json || [],
            subtotal: parseFloat(r.subtotal) || 0,
            deliveryFee: parseFloat(r.delivery_fee) || 0,
            discount: parseFloat(r.discount) || 0,
            total: parseFloat(r.total) || 0,
            paymentMethod: r.payment_method || undefined,
            changeAmount: parseFloat(r.change_amount) || undefined,
            deliveryAddress: r.delivery_address || undefined,
            customerName: r.customer_name || '',
            customerWhatsapp: r.customer_whatsapp || undefined,
            customerEmail: r.customer_email || undefined,
            notes: r.notes || undefined,
            estimatedDeliveryTime: r.estimated_delivery_time || undefined,
            confirmedAt: r.confirmed_at || undefined,
            preparingAt: r.preparing_at || undefined,
            readyAt: r.ready_at || undefined,
            outForDeliveryAt: r.out_for_delivery_at || undefined,
            deliveredAt: r.delivered_at || undefined,
            cancelledAt: r.cancelled_at || undefined,
            cancelledReason: r.cancelled_reason || undefined,
            whatsappSent: r.whatsapp_sent || false,
            whatsappSentAt: r.whatsapp_sent_at || undefined,
            deliveredBy: r.delivered_by || undefined,
            createdAt: r.created_at || new Date().toISOString(),
            updatedAt: r.updated_at || new Date().toISOString(),
          }),
          (o) => this.syncDeliveryOrder(o),
        );
        if (merged !== null) this.set(KEYS.DELIVERY_ORDERS, merged);
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
            const sorted = [...filtered].sort((a: any, b: any) => {
              if (a.status === 'open' && b.status !== 'open') return -1;
              if (a.status !== 'open' && b.status === 'open') return 1;
              return new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime();
            });
            const s = sorted[0];
            // O cloud é a fonte da verdade: adota expected_balance/totais como estão.
            // (Antes havia um "reset de dia anterior" aqui que zerava as vendas e
            // voltava o saldo para o opening_balance quando a sessão tinha sido
            // aberta em um dia anterior — só LOCALMENTE, sem gravar no cloud. Isso
            // fazia cada dispositivo mostrar um valor diferente para a MESMA sessão:
            // quem tinha a sessão local mantinha o total, quem hidratava depois caía
            // no reset e mostrava só o valor inicial.)
            const expectedBalance = parseFloat(s.expected_balance) || 0;
            const totalSalesCash = parseFloat(s.total_sales_cash) || 0;
            const suprimentos = parseFloat(s.suprimentos) || 0;
            const sangrias = parseFloat(s.sangrias) || 0;
            const initialCash = parseFloat(s.opening_balance) || 0;
            this.set(KEYS.CAIXA, {
              id: s.id, openedAt: s.opened_at, closedAt: s.closed_at || undefined,
              operatorId: s.user_id || '', operatorName: s.operator_name || '',
              initialCash: initialCash,
              currentCashBalance: expectedBalance,
              totalSalesCash: totalSalesCash,
              totalSalesPix: parseFloat(s.total_sales_pix) || 0,
              totalSalesCard: parseFloat(s.total_sales_card) || 0,
              totalSalesCreditAccount: parseFloat(s.total_sales_credit_account) || 0,
              suprimentos: suprimentos,
              sangrias: sangrias,
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
              // Mesma sessão aberta localmente — o cloud é a fonte da verdade
              // (mesma regra do updateCaixaFromRemote no realtime):
              // 1. Se o cloud diz que ela FECHOU (fechada manualmente em outro
              //    dispositivo), fecha aqui também, para o fechamento propagar
              //    para toda a filial.
              // 2. Se continua aberta, ADOTA os contadores do cloud. Antes
              //    mantinha os dados locais ("prefer local open session") e o
              //    caixa de um dispositivo ficava travado num valor velho mesmo
              //    após F5 (ex.: R$ 639,20 local vs R$ 632,10 no cloud) — o F5
              //    atualizava as vendas mas nunca o caixa.
              if (s.status === 'closed') {
                const fechado = {
                  ...localSession,
                  status: 'closed' as const,
                  closedAt: s.closed_at || new Date().toISOString(),
                  currentCashBalance: parseFloat(s.expected_balance) || localSession.currentCashBalance,
                };
                this.set(KEYS.CAIXA, fechado);
                console.log(`[HD-Sync] 🔄 Caixa "${s.id}" FECHADO via hidratação (fechado em outro dispositivo)`);
              } else {
                const adopted = {
                  ...localSession,
                  totalSalesCash: parseFloat(s.total_sales_cash) || 0,
                  totalSalesPix: parseFloat(s.total_sales_pix) || 0,
                  totalSalesCard: parseFloat(s.total_sales_card) || 0,
                  totalSalesCreditAccount: parseFloat(s.total_sales_credit_account) || 0,
                  suprimentos: parseFloat(s.suprimentos) || 0,
                  sangrias: parseFloat(s.sangrias) || 0,
                };
                adopted.currentCashBalance =
                  adopted.initialCash + adopted.totalSalesCash + adopted.suprimentos - adopted.sangrias;
                this.set(KEYS.CAIXA, adopted);
                console.log(`[HD-Sync] 🔄 Caixa "${s.id}" adotado do cloud (hidratação): cash=R$${adopted.totalSalesCash.toFixed(2)} saldo=R$${adopted.currentCashBalance.toFixed(2)}`);
              }
            } else {
              // Sessão local não bate com a do cloud (ou não existe) → adota o
              // cloud como está, sem reset de dia anterior (mesmo motivo acima:
              // reset local sem gravar no cloud divergia os dispositivos).
              const initialCash = parseFloat(s.opening_balance) || 0;
              this.set(KEYS.CAIXA, {
                id: s.id, openedAt: s.opened_at, closedAt: s.closed_at || undefined,
                operatorId: s.user_id || '', operatorName: s.operator_name || '',
                initialCash: initialCash,
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
      // Vendas fiado (novas ou antigas) → garantir conta a receber vinculada
      this.setChangeSource("local"); this.backfillReceivablesFromSales();
      // Força notify para garantir que o React state seja atualizado
      // com o merge completo (não com dados parciais de um notify anterior).
      if (this.notifyTimer) {
        clearTimeout(this.notifyTimer);
        this.notifyTimer = null;
      }
      this.listeners.forEach((fn) => { try { fn(); } catch {} });
      return { ok: true, resolvedBranchId };
    } catch (e) {
      console.warn('[HD-Sync] Cloud hydration failed, using localStorage', e);
      return { ok: false };
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
    } catch (e: any) {
      // OFFLINE-01 fix: handle QuotaExceededError gracefully
      if (e?.name === 'QuotaExceededError' || e?.code === 22 || e?.code === 1014) {
        console.error(`[Storage] ⚠️ localStorage QUOTA EXCEEDED writing key "${key}". Attempting emergency cleanup...`);
        this._emergencyCleanup();
        // Retry once after cleanup
        try {
          localStorage.setItem(this.getStorageKey(key), JSON.stringify(value));
          this.notify();
          console.log(`[Storage] ✅ Retry succeeded after cleanup for key "${key}"`);
        } catch (retryErr) {
          console.error(`[Storage] ❌ CRITICAL: localStorage still full after cleanup. Data for key "${key}" was NOT saved.`, retryErr);
        }
      } else {
        console.error('Error writing to localStorage:', e);
      }
    }
  }

  /**
   * Emergency cleanup: remove old backups and non-essential data
   * to free localStorage space when quota is exceeded.
   */
  private _emergencyCleanup() {
    // 1. Remove old backups (keep only the most recent)
    const backupKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('hd_system_backup_')) backupKeys.push(key);
    }
    backupKeys.sort().reverse();
    for (const oldKey of backupKeys.slice(1)) localStorage.removeItem(oldKey);

    // 2. Remove the sync queue (will be rebuilt on next sync)
    localStorage.removeItem('hd_system_sync_queue');

    console.log(`[Storage] 🧹 Emergency cleanup freed space. Removed ${backupKeys.length - 1} old backups + sync queue.`);
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
    // Validação UUID: resolver short codes para UUIDs
    if (product.storeBranchId && !this.isValidUuid(product.storeBranchId)) {
      const resolved = this.resolveBranchId(product.storeBranchId);
      if (resolved) product.storeBranchId = resolved;
    }
    // 🔥 VALIDAÇÃO OBRIGATÓRIA: store_branch_id deve estar definido
    if (!product.storeBranchId) {
      console.error('❌ saveProduct: Nenhuma filial selecionada!', product.id);
      throw new Error('saveProduct: Nenhuma filial selecionada');
    }
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
    // Defense-in-depth: só permite deletar se o produto pertence à org E filial atual
    if (product && !this.isSuperAdmin()) {
      const filtered = this.filterByOrg([product]);
      if (filtered.length === 0) {
        console.warn(`[Storage] Blocked delete of product ${id} from another org`);
        return;
      }
      // Branch isolation: não permitir excluir produto de outra filial
      const currentBranchId = this.getSelectedBranchId();
      if (currentBranchId && product.storeBranchId && product.storeBranchId !== currentBranchId) {
        console.warn(`[Storage] Blocked delete of product ${id} from another branch`);
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
    // Defense-in-depth: só permite deletar se a venda pertence à org E filial atual
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
      // Branch isolation: não permitir excluir venda de outra filial
      const currentBranchId = this.getSelectedBranchId();
      if (currentBranchId && saleToDelete.storeBranchId && saleToDelete.storeBranchId !== currentBranchId) {
        console.warn(`[Storage] Blocked delete of sale ${id} from another branch`);
        return;
      }
    }
    const sales = allSales.filter((s) => s.id !== id);
    this.set(KEYS.SALES, sales);
    syncService.deleteRow('sales', id);
    // Venda fiado excluída → remover a conta a receber vinculada (mesmo id)
    const accounts = this.get<FinancialAccount[]>(KEYS.FINANCIAL, this.isDefaultOrg() ? INITIAL_FINANCIAL_ACCOUNTS : []);
    const linked = accounts.find((a) => a.id === id && a.type === 'receivable' && (a.title || '').startsWith('Fiado'));
    if (linked) {
      this.set(KEYS.FINANCIAL, accounts.filter((a) => a.id !== id));
      syncService.deleteRow('financial_transactions', id);
    }
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

  /**
   * Deduct stock LOCALLY ONLY (no RPC call).
   * Used by addSale() where process_sale_transaction RPC already handles
   * server-side stock deduction — calling ajustar_estoque here would
   * deduct stock TWICE (the "double deduction" bug CALC-02).
   */
  private deductStockLocal(productId: string, quantityDelta: number, reason: string, operatorName: string): void {
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
  }

  /**
   * Update stock with BOTH local update AND server-side RPC (ajustar_estoque).
   * Used for manual stock adjustments from InventoryView (NOT from sales,
   * which use process_sale_transaction instead).
   */
  async updateStock(productId: string, quantityDelta: number, reason: string, operatorName: string) {
    // Local update for instant UI
    this.deductStockLocal(productId, quantityDelta, reason, operatorName);

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

  saveStockMovement(movement: StockMovement) {
    movement.id = StorageService.ensureUuid(movement.id);
    movement.organizationId = movement.organizationId || this.getCurrentOrgId();
    movement.storeBranchId = movement.storeBranchId || this.getSelectedBranchId() || undefined;
    const all = this.get<StockMovement[]>(KEYS.MOVEMENTS, []);
    const idx = all.findIndex((m) => m.id === movement.id);
    if (idx >= 0) all[idx] = movement;
    else all.unshift(movement);
    this.set(KEYS.MOVEMENTS, all);
    this.syncStockMovement(movement);
  }

  // --- CATEGORIES ---
  getCategories(): Category[] {
    const fallback = this.isDefaultOrg() ? INITIAL_CATEGORIES : [];
    const all = this.get<Category[]>(KEYS.CATEGORIES, fallback);
    // Deduplica por nome (evita mock + banco com mesmo nome) mantendo a do banco quando houver storeBranchId
    const seen = new Set<string>();
    const deduped = all.filter((c) => {
      const key = (c.name || '').toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    // categories agora tem store_branch_id NOT NULL — filtrar por filial
    return this.filterBySelectedBranch<Category>(this.filterByOrg<Category>(deduped));
  }

  saveCategory(category: Category) {
    category.id = StorageService.ensureUuid(category.id);
    category.organizationId = this.getCurrentOrgId();
    // store_branch_id agora é NOT NULL no banco
    const branchId = this.getSelectedBranchId();
    if (branchId) category.storeBranchId = branchId;
    // 🔥 VALIDAÇÃO OBRIGATÓRIA: store_branch_id deve estar definido
    if (!category.storeBranchId) {
      console.error('❌ saveCategory: Nenhuma filial selecionada!', category.id);
      throw new Error('saveCategory: Nenhuma filial selecionada');
    }
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
    // Validação UUID
    if (customer.storeBranchId && !this.isValidUuid(customer.storeBranchId)) {
      const resolved = this.resolveBranchId(customer.storeBranchId);
      if (resolved) customer.storeBranchId = resolved;
    }
    // 🔥 VALIDAÇÃO OBRIGATÓRIA: store_branch_id deve estar definido
    if (!customer.storeBranchId) {
      console.error('❌ saveCustomer: Nenhuma filial selecionada!', customer.id);
      throw new Error('saveCustomer: Nenhuma filial selecionada');
    }
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
    // Validação UUID
    if (supplier.storeBranchId && !this.isValidUuid(supplier.storeBranchId)) {
      const resolved = this.resolveBranchId(supplier.storeBranchId);
      if (resolved) supplier.storeBranchId = resolved;
    }
    // 🔥 VALIDAÇÃO OBRIGATÓRIA: store_branch_id deve estar definido
    if (!supplier.storeBranchId) {
      console.error('❌ saveSupplier: Nenhuma filial selecionada!', supplier.id);
      throw new Error('saveSupplier: Nenhuma filial selecionada');
    }
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

  getCreditPayments(): CreditPayment[] {
    const all = this.get<CreditPayment[]>(KEYS.CREDIT_PAYMENTS, []);
    // Filtra por vendas que pertencem à org atual
    // CreditPayment usa camelCase (saleId), não snake_case (sale_id)
    const sales = this.getSales();
    const validSaleIds = new Set(sales.map(s => s.id));
    return all.filter(p => validSaleIds.has(p.saleId));
  }

  saveCreditPayments(payments: any[]) {
    this.set(KEYS.CREDIT_PAYMENTS, payments);
  }

  async addSale(sale: Sale) {
    sale.id = StorageService.ensureUuid(sale.id);
    // Preserva o organizationId definido por quem criou a venda (ex.: cardápio
    // digital usa o da filial da mesa). Só cai no getCurrentOrgId() se ausente.
    sale.organizationId = sale.organizationId || this.getCurrentOrgId();
    let cloudSaleItems: any[] = [];
    // CONFIA no storeBranchId já presente na venda (vem do seletor de filial no PDV).
    // Só usa getSelectedBranchId() como fallback para vendas criadas sem filial explícita.
    if (!sale.storeBranchId) {
      const branchId = this.getSelectedBranchId();
      if (branchId) {
        sale.storeBranchId = branchId;
      } else {
        // Última defesa: primeira filial visível da org atual. Nunca deixar a
        // venda sem filial — o banco (trigger) e o guard de sync rejeitam ''.
        const firstBranch = this.getBranches()[0];
        if (firstBranch) sale.storeBranchId = firstBranch.id;
      }
    }

    // Validação UUID: store_branch_id DEVE ser UUID válido (banco convertido)
    if (sale.storeBranchId && !this.isValidUuid(sale.storeBranchId)) {
      // Tentar resolver short code → UUID
      const resolved = this.resolveBranchId(sale.storeBranchId);
      if (resolved) {
        sale.storeBranchId = resolved;
      } else {
        console.error(`[Storage] ❌ addSale: store_branch_id inválido "${sale.storeBranchId}" — venda bloqueada`);
        return;
      }
    }
    // Save sale_items to separate localStorage key FIRST (with stable IDs)
    // so syncSale can read them and upsert with onConflict: 'id' deduplication.
    if (sale.items && sale.items.length > 0) {
      const existingItems = this.get<any[]>(KEYS.SALE_ITEMS, []);
      const newItems = sale.items.map((item) => ({
        id: StorageService.newId(),
        sale_id: sale.id,
        product_id: item.productId && StorageService.UUID_RE.test(item.productId) ? item.productId : null,
        product_name: item.productName || '',
        quantity: item.quantity,
        unit_price: item.unitPrice,
        total_price: item.total,
        // 🔥 store_branch_id OBRIGATÓRIO: a trigger do banco rejeita
        // sale_items sem filial ("Tentativa de salvar sale_items sem
        // store_branch_id"). Reaproveita o UUID já validado na venda.
        store_branch_id: sale.storeBranchId || this.getSelectedBranchId() || null,
      }));
      const filtered = existingItems.filter((i: any) => i.sale_id !== sale.id);
      this.set(KEYS.SALE_ITEMS, [...newItems, ...filtered]);
      cloudSaleItems = newItems;
    }

    const sales = this.get<Sale[]>(KEYS.SALES, this.isDefaultOrg() ? INITIAL_SALES : []);
    sales.unshift(sale);
    this.set(KEYS.SALES, sales);
    await this.syncSale(sale);

    // 🔥 Sincroniza sale_items ao cloud. O canal realtime de sale_items NÃO tem
    // filtro de org/filial, então entrega o pedido AO VIVO para TODOS os operadores,
    // inclusive pedidos do cardápio (anon), cuja venda é filtrada pelo canal de sales.
    // Antes os itens nunca iam pro cloud → pedido só aparecia após reload e sem os
    // itens no dispositivo do operador.
    cloudSaleItems.forEach((it: any) => syncService.upsertRow('sale_items', it));
    // Venda fiado → criar conta a receber vinculada (id da conta = id da venda)
    this.createReceivableFromSale(sale);

    // ─── Deduce stock LOCALLY ONLY (instant UI) ────────────────
    // Uses deductStockLocal() instead of updateStock() to avoid calling
    // ajustar_estoque RPC — the process_sale_transaction RPC below
    // already handles server-side stock deduction atomically.
    for (const item of sale.items || []) {
      this.deductStockLocal(item.productId, -item.quantity, `Venda PDV #${sale.code}`, sale.operatorName);
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

      // SANITIZAÇÃO RPC: getCurrentOrgId() retorna '' para superadmin sem org
      // salva (acesso global). PostgREST tenta cast ''::uuid → 22P02
      // "invalid input syntax for type uuid: """ — EXATAMENTE o erro observado.
      // Regra igual ao upsertRow: org inválida → null para superadmin, skip p/ comum.
      const rpcOrgId = this.getCurrentOrgId();
      const rpcOrgParam = rpcOrgId && StorageService.UUID_RE.test(rpcOrgId) ? rpcOrgId : null;
      const rpcProductId = sale.items?.[0]?.productId && StorageService.UUID_RE.test(sale.items[0].productId)
        ? sale.items[0].productId
        : null;

      if (rpcOrgParam || this.isSuperAdmin()) {
        const { data, error } = await supabase.rpc('process_sale_transaction', {
          p_sale_id: sale.id,
          p_product_id: rpcProductId,
          p_quantity: sale.items?.reduce((sum, i) => sum + i.quantity, 0) || 0,
          p_unit_price: sale.items?.[0]?.unitPrice || sale.total,
          p_discount: sale.discount || 0,
          p_total: sale.total,
          p_reason: `Venda PDV #${sale.code}`,
          p_operator_name: sale.operatorName,
          p_organization_id: rpcOrgParam,
          p_store_branch_id: branchUuid,
          p_sale_items: saleItemsJson,
        });

        if (error) {
          console.warn('[HD-Sync] process_sale_transaction RPC failed:', error.message);
          await this.insertDLQ('INSERT', 'sales', sale.id, { sale, saleItemsJson }, error.message);
        }
      } else {
        console.warn('[HD-Sync] process_sale_transaction RPC skipped — organization_id inválido');
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

// ─── saveSale: atualiza uma venda existente (usado pela ComandaView/KDS) ──
  // REGRA CRÍTICA: NUNCA recriar sale_items aqui. Itens de venda são IMUTÁVEIS
  // após criação (addSale). Apenas atualiza header: kitchenStatus, status, payments, etc.
  // Recriar itens a cada mudança de status causava duplicação exponencial
  // (BUG: quantity multiplicava a cada transição pending→preparing→ready→delivered).
  saveSale(sale: Sale) {
    sale.id = StorageService.ensureUuid(sale.id);
    sale.organizationId = sale.organizationId || this.getCurrentOrgId();
    sale.storeBranchId = sale.storeBranchId || this.getSelectedBranchId() || undefined;
    if (!sale.updatedAt) sale.updatedAt = new Date().toISOString();

    // Atualiza APENAS o header da venda no array local
    const sales = this.get<Sale[]>(KEYS.SALES, this.isDefaultOrg() ? INITIAL_SALES : []);
    const idx = sales.findIndex((s) => s.id === sale.id);
    if (idx >= 0) {
      // Preserva itens originais da venda local - NUNCA sobrescreve com sale.items
      // que pode vir com estrutura diferente (ex.: do realtime updateSaleFromRemote)
      const existingSale = sales[idx];
      sales[idx] = {
        ...existingSale,
        ...sale,
        items: existingSale.items, // SEMPRE mantém itens originais
      };
    } else {
      // Nova venda (fallback) - mantém itens recebidos
      sales.unshift(sale);
    }
    this.set(KEYS.SALES, sales);

    // Sync com o cloud (envia header atualizado; sale_items NÃO são reenviados)
    this.syncSale(sales[idx] || sale);
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

      // ✅ Store the closing balance for next opening
      const closingBalance = session.currentCashBalance;
      localStorage.setItem('hd_system_last_closed_balance', JSON.stringify({
        balance: closingBalance,
        closedAt: session.closedAt,
        branchId: session.storeBranchId,
      }));

      // Archive in history
      const history = this.get<CashRegisterSession[]>(KEYS.CAIXA_HISTORY, []);
      history.unshift(session);
      this.set(KEYS.CAIXA_HISTORY, history);

      // Save updated state
      this.saveActiveCaixaSession(session);
    }
  }

  /**
   * Get the last closed balance for the current branch
   */
  getLastClosedBalance(): number {
    try {
      const data = localStorage.getItem('hd_system_last_closed_balance');
      if (data) {
        const parsed = JSON.parse(data);
        const branchId = this.getSelectedBranchId();
        // Only return balance if it's from the same branch
        if (parsed.branchId === branchId) {
          return parsed.balance || 0;
        }
      }
    } catch {}
    return 0;
  }

  /**
   * Fechamento Definitivo - Zera todos os contadores (apenas admin)
   * Armazena backup antes de zerar
   */
  async fechamentoDefinitivo(notes?: string): Promise<void> {
    const session = this.getActiveCaixaSession();
    if (!session) return;

    // Archive the final session in history
    const history = this.get<CashRegisterSession[]>(KEYS.CAIXA_HISTORY, []);
    const finalSession = {
      ...session,
      status: 'final_closed' as const,
      closedAt: new Date().toISOString(),
      notes: notes || 'Fechamento definitivo realizado.',
    };
    history.unshift(finalSession);
    this.set(KEYS.CAIXA_HISTORY, history);

    // Clear the last closed balance
    localStorage.removeItem('hd_system_last_closed_balance');

    // Reset caixa session
    this.set(KEYS.CAIXA, {
      ...INITIAL_CAIXA_SESSION,
      id: '00000000-0000-0000-0000-000000000000',
      status: 'closed',
      organizationId: this.getCurrentOrgId(),
      operatorId: '',
      operatorName: '',
      openedAt: new Date().toISOString(),
      notes: '',
    });

    this.notify();
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
      // Cloud indisponível (offline) — verificar caixa local antes de criar novo
      console.warn('[HD-Caixa] Falha ao consultar caixa aberto no cloud — verificando localStorage:', e);
    }

    // 🔥 Offline: verificar se já existe caixa aberto LOCAL para esta filial
    // Evita criar sessão duplicada quando o dispositivo fica offline
    if (branchId) {
      const localSession = this.getActiveCaixaSession();
      if (localSession && localSession.status === 'open' && localSession.storeBranchId === branchId) {
        console.log(`[HD-Caixa] 🔄 Offline — reutilizando caixa local existente (id=${localSession.id}, saldo=R$ ${localSession.currentCashBalance.toFixed(2)})`);
        return localSession;
      }
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

  saveFinancialAccounts(accounts: FinancialAccount[]) {
    this.set(KEYS.FINANCIAL, accounts);
  }

  saveFinancialAccount(acc: FinancialAccount) {
    acc.id = StorageService.ensureUuid(acc.id);
    acc.organizationId = this.getCurrentOrgId();
    const branchId = this.getSelectedBranchId();
    if (branchId) acc.storeBranchId = branchId;
    // Validação UUID
    if (acc.storeBranchId && !this.isValidUuid(acc.storeBranchId)) {
      const resolved = this.resolveBranchId(acc.storeBranchId);
      if (resolved) acc.storeBranchId = resolved;
    }
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

  // ─── FIADO → CONTAS A RECEBER ────────────────────────────────────
  // A conta a receber de uma venda fiado usa o MESMO id da venda — vínculo
  // determinístico em qualquer dispositivo, sem coluna nova e sem migração.
  // O amount da conta é SEMPRE o saldo RESTANTE: cada pagamento desconta,
  // e quando zera a conta vai para 'paid' e sai das pendentes no Financeiro.

  private getFiadoAmount(sale: Sale): number {
    return Math.round(
      (sale.payments || [])
        .filter((p) => p.method === 'credit_account')
        .reduce((sum, p) => sum + (p.amount || 0), 0) * 100,
    ) / 100;
  }

  private getTotalPaidForSale(saleId: string): number {
    return this.get<CreditPayment[]>(KEYS.CREDIT_PAYMENTS, [])
      .filter((cp) => cp.saleId === saleId)
      .reduce((sum, cp) => sum + (cp.amount || 0), 0);
  }

  // Cria (ou atualiza) a conta a receber vinculada a uma venda fiado.
  // Idempotente: re-syncs só quando o saldo realmente mudou.
  private createReceivableFromSale(sale: Sale) {
    try {
      const fiadoAmount = this.getFiadoAmount(sale);
      if (fiadoAmount <= 0) return;
      const totalPaid = this.getTotalPaidForSale(sale.id);
      const remaining = Math.max(0, Math.round((fiadoAmount - totalPaid) * 100) / 100);

      const accounts = this.get<FinancialAccount[]>(KEYS.FINANCIAL, this.isDefaultOrg() ? INITIAL_FINANCIAL_ACCOUNTS : []);
      const existing = accounts.find((a) => a.id === sale.id);
      if (existing) {
        // Nunca reabrir uma conta já quitada/cancelada
        if (existing.status === 'paid' || existing.status === 'cancelled') return;
        const changed = Math.abs((existing.amount || 0) - remaining) > 0.01;
        existing.amount = remaining;
        if (!existing.title) existing.title = `Fiado ${sale.code || ''} — ${sale.customerName || 'Cliente'}`;
        if (!existing.recipientOrPayer) existing.recipientOrPayer = sale.customerName || '';
        if (changed) {
          this.set(KEYS.FINANCIAL, accounts);
          this.syncFinancialAccount(existing);
        }
        return;
      }

      const acc: FinancialAccount = {
        id: sale.id,
        title: `Fiado ${sale.code || ''} — ${sale.customerName || 'Cliente'}`,
        type: 'receivable',
        category: 'fiado',
        amount: remaining,
        dueDate: sale.date ? sale.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
        status: 'pending',
        recipientOrPayer: sale.customerName || '',
        storeBranchId: sale.storeBranchId,
        organizationId: sale.organizationId,
      };
      accounts.unshift(acc);
      this.set(KEYS.FINANCIAL, accounts);
      this.syncFinancialAccount(acc);
      console.log(`[HD-Sync] 🧾 Conta a receber criada para fiado ${sale.code}: R$${remaining.toFixed(2)}`);
    } catch (e: any) {
      console.warn('[HD-Sync] createReceivableFromSale failed:', e?.message);
    }
  }

  // Dá baixa na conta a receber vinculada à venda após salvar/excluir um
  // pagamento. Usa getFiadoAmount(sale) como valor ORIGINAL (nunca acc.amount,
  // que já é o restante). remaining = original - totalPaid.
private updateReceivableFromPayments(saleId: string) {
    try {
      const accounts = this.get<FinancialAccount[]>(KEYS.FINANCIAL, this.isDefaultOrg() ? INITIAL_FINANCIAL_ACCOUNTS : []);
      const acc = accounts.find((a) => a.id === saleId);
      const sale = this.get<Sale[]>(KEYS.SALES, []).find((s) => s.id === saleId);
      const totalPaid = this.getTotalPaidForSale(saleId);

      // Usar o fiadoAmount da própria venda (source of truth) se existir
      const fiadoAmount = sale ? this.getFiadoAmount(sale) : 0;

      // MONITORAMENTO: log do cálculo do fiado (BUG-003: antes calculava errado usando acc.amount como baseline)
      if (sale && sale.payments && sale.payments.length > 0) {
        const creditCount = sale.payments.filter((p: any) => p.method === 'credit_account').length;
        console.log(`[HD-Sync] 💳 Fiado calculado: sale=${sale.code}, credit_payments=${creditCount}, fiadoAmount=R$${fiadoAmount.toFixed(2)}`);
      }

      // Se a venda tem credit_account no payments, usa o valor da venda;
      // senão, tenta calcular a partir dos pagamentos locais salvos
      const fiadoFromSale = sale && sale.payments?.length > 0 ? fiadoAmount : (acc ? acc.amount + totalPaid : totalPaid);
      const remaining = Math.max(0, Math.round((fiadoFromSale - totalPaid) * 100) / 100);

      if (!acc) {
        // Conta não existe localmente — cria a partir da venda
        if (sale) this.createReceivableFromSale(sale);
        return;
      }
      if (acc.status === 'cancelled') return;

      if (remaining <= 0.01) {
        acc.status = 'paid';
        acc.amount = 0;
        acc.paidDate = new Date().toISOString();
      } else {
        acc.status = 'pending';
        acc.amount = remaining;
      }
      this.set(KEYS.FINANCIAL, accounts);
      this.syncFinancialAccount(acc);
      console.log(`[HD-Sync] 🧾 Baixa fiado ${saleId}: pago=R$${totalPaid.toFixed(2)} restante=R$${remaining.toFixed(2)} (${acc.status})`);
    } catch (e: any) {
      console.warn('[HD-Sync] updateReceivableFromPayments failed:', e?.message);
    }
  }

  // Garante que toda venda fiado tenha conta a receber — cobre vendas feitas
  // antes desta feature e dispositivos que perderam a conta local. Roda no
  // fim da hidratação (depois do merge de sales, finance e credit_payments).
  private backfillReceivablesFromSales() {
    const sales = this.get<Sale[]>(KEYS.SALES, []);
    for (const sale of sales) {
      if (this.getFiadoAmount(sale) > 0) {
        this.createReceivableFromSale(sale);
      }
    }
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

  // --- SCANNED BOLETOS (histórico de leituras) ---
  getScannedBoletos(): ScannedBoleto[] {
    const all = this.get<ScannedBoleto[]>(KEYS.SCANNED_BOLETOS, []);
    return this.filterBySelectedBranch(this.filterByOrg(all));
  }

  saveScannedBoleto(b: ScannedBoleto) {
    b.id = StorageService.ensureUuid(b.id);
    b.organizationId = this.getCurrentOrgId();
    const branchId = this.getSelectedBranchId();
    if (branchId) b.storeBranchId = branchId;
    const all = this.get<ScannedBoleto[]>(KEYS.SCANNED_BOLETOS, []);
    const idx = all.findIndex((x) => x.id === b.id);
    if (idx >= 0) all[idx] = b;
    else all.unshift(b);
    this.set(KEYS.SCANNED_BOLETOS, all);
    this.syncScannedBoleto(b);
  }

  deleteScannedBoleto(id: string) {
    const all = this.get<ScannedBoleto[]>(KEYS.SCANNED_BOLETOS, []).filter((x) => x.id !== id);
    this.set(KEYS.SCANNED_BOLETOS, all);
    syncService.deleteRow('scanned_boletos', id);
  }

  private syncScannedBoleto(b: ScannedBoleto) {
    syncService.upsertRow('scanned_boletos', {
      id: b.id,
      organization_id: this.getCurrentOrgId(),
      store_branch_id: b.storeBranchId || null,
      barcode: b.barcode || null,
      linha_digitavel: b.linhaDigitavel,
      amount: b.amount,
      due_date: b.dueDate || null,
      payer: b.payer || null,
      scan_date: b.scanDate,
      financial_account_id: b.financialAccountId || null,
      status: b.status || 'pending',
    });
  }

  updateScannedBoletoFromRemote(row: any) {
    const all = this.get<ScannedBoleto[]>(KEYS.SCANNED_BOLETOS, []);
    const mapped: ScannedBoleto = {
      id: row.id, linhaDigitavel: row.linha_digitavel || '',
      barcode: row.barcode || '', amount: parseFloat(row.amount) || 0,
      dueDate: row.due_date || undefined, payer: row.payer || '',
      scanDate: row.scan_date || row.created_at || new Date().toISOString(),
      financialAccountId: row.financial_account_id || undefined,
      status: row.status || 'pending',
      storeBranchId: row.store_branch_id || undefined,
      organizationId: row.organization_id || undefined,
    };
    const idx = all.findIndex((x) => x.id === mapped.id);
    if (idx >= 0) all[idx] = mapped;
    else all.unshift(mapped);
    this.set(KEYS.SCANNED_BOLETOS, all);
    this.notify();
  }

  removeScannedBoletoFromRemote(id: string) {
    const all = this.get<ScannedBoleto[]>(KEYS.SCANNED_BOLETOS, []).filter((x) => x.id !== id);
    this.set(KEYS.SCANNED_BOLETOS, all);
    this.notify();
  }

  // --- CREDIT PAYMENTS (pagamentos de fiado) ---
  saveCreditPayment(p: CreditPayment) {
    p.id = StorageService.ensureUuid(p.id);
    p.organizationId = this.getCurrentOrgId();
    const branchId = this.getSelectedBranchId();
    if (branchId) p.storeBranchId = branchId;
    const all = this.get<CreditPayment[]>(KEYS.CREDIT_PAYMENTS, []);
    const idx = all.findIndex((x) => x.id === p.id);
    if (idx >= 0) all[idx] = p;
    else all.unshift(p);
    this.set(KEYS.CREDIT_PAYMENTS, all);
    this.syncCreditPayment(p);
    // Baixa (parcial ou total) na conta a receber vinculada à venda fiado
    if (p.saleId) this.updateReceivableFromPayments(p.saleId);
  }

  deleteCreditPayment(id: string) {
    const all = this.get<CreditPayment[]>(KEYS.CREDIT_PAYMENTS, []);
    const removed = all.find((x) => x.id === id);
    this.set(KEYS.CREDIT_PAYMENTS, all.filter((x) => x.id !== id));
    syncService.deleteRow('credit_payments', id);
    // Pagamento removido → devolver o valor ao saldo da conta a receber
    if (removed?.saleId) this.updateReceivableFromPayments(removed.saleId);
  }

  private syncCreditPayment(p: CreditPayment) {
    syncService.upsertRow('credit_payments', {
      id: p.id,
      organization_id: this.getCurrentOrgId(),
      store_branch_id: p.storeBranchId || null,
      sale_id: p.saleId && StorageService.UUID_RE.test(p.saleId) ? p.saleId : null,
      customer_id: p.customerId && StorageService.UUID_RE.test(p.customerId) ? p.customerId : null,
      customer_name: p.customerName || null,
      amount: p.amount,
      paid_at: p.date,
      payment_method: p.paymentMethod || null,
    });
  }

  updateCreditPaymentFromRemote(row: any) {
    this.setChangeSource('remote');
    const all = this.get<CreditPayment[]>(KEYS.CREDIT_PAYMENTS, []);
    const mapped: CreditPayment = {
      id: row.id, saleId: row.sale_id, customerId: row.customer_id || undefined,
      customerName: row.customer_name || '', amount: parseFloat(row.amount) || 0,
      date: row.paid_at || row.created_at || new Date().toISOString(),
      paymentMethod: row.payment_method || undefined,
      storeBranchId: row.store_branch_id || undefined,
      organizationId: row.organization_id || undefined,
    };
    const idx = all.findIndex((x) => x.id === mapped.id);
    if (idx >= 0) all[idx] = mapped;
    else all.unshift(mapped);
    this.set(KEYS.CREDIT_PAYMENTS, all);
    this.notify(KEYS.CREDIT_PAYMENTS, 'remote', mapped);
  }

  removeCreditPaymentFromRemote(id: string) {
    const all = this.get<CreditPayment[]>(KEYS.CREDIT_PAYMENTS, []).filter((x) => x.id !== id);
    this.set(KEYS.CREDIT_PAYMENTS, all);
    this.notify();
  }

  // --- NF RECORDS (notas fiscais importadas) ---
  getNFRecords(): NFRecord[] {
    const all = this.get<NFRecord[]>(KEYS.NF_RECORDS, []);
    return this.filterBySelectedBranch(this.filterByOrg(all));
  }

  saveNFRecord(nf: NFRecord) {
    nf.id = StorageService.ensureUuid(nf.id);
    nf.organizationId = this.getCurrentOrgId();
    const branchId = this.getSelectedBranchId();
    if (branchId) nf.storeBranchId = branchId;
    const all = this.get<NFRecord[]>(KEYS.NF_RECORDS, []);
    const idx = all.findIndex((x) => x.id === nf.id);
    if (idx >= 0) all[idx] = nf;
    else all.unshift(nf);
    this.set(KEYS.NF_RECORDS, all);
    this.syncNFRecord(nf);
  }

  deleteNFRecord(id: string) {
    const all = this.get<NFRecord[]>(KEYS.NF_RECORDS, []).filter((x) => x.id !== id);
    this.set(KEYS.NF_RECORDS, all);
    syncService.deleteRow('nf_records', id);
  }

  private syncNFRecord(nf: NFRecord) {
    syncService.upsertRow('nf_records', {
      id: nf.id,
      organization_id: this.getCurrentOrgId(),
      store_branch_id: nf.storeBranchId || null,
      supplier_name: nf.supplierName,
      total_amount: nf.totalValue,
      scan_date: nf.scanDate,
      items: nf.items || [],
      note: nf.note || null,
    });
  }

  updateNFRecordFromRemote(row: any) {
    const all = this.get<NFRecord[]>(KEYS.NF_RECORDS, []);
    const mapped: NFRecord = {
      id: row.id, scanDate: row.scan_date || row.created_at || new Date().toISOString(),
      supplierName: row.supplier_name || '',
      items: Array.isArray(row.items) ? row.items : [],
      totalValue: parseFloat(row.total_amount) || 0,
      note: row.note || '',
      storeBranchId: row.store_branch_id || undefined,
      organizationId: row.organization_id || undefined,
    };
    const idx = all.findIndex((x) => x.id === mapped.id);
    if (idx >= 0) all[idx] = mapped;
    else all.unshift(mapped);
    this.set(KEYS.NF_RECORDS, all);
    this.notify();
  }

  removeNFRecordFromRemote(id: string) {
    const all = this.get<NFRecord[]>(KEYS.NF_RECORDS, []).filter((x) => x.id !== id);
    this.set(KEYS.NF_RECORDS, all);
    this.notify();
  }

  // --- FOOTER MESSAGES (rodapé da vitrine de TV) ---
  getFooterMessages(): FooterMessage[] {
    const all = this.get<FooterMessage[]>(KEYS.FOOTER_MESSAGES, []);
    return this.filterBySelectedBranch(this.filterByOrg(all));
  }

  saveFooterMessage(f: FooterMessage) {
    f.id = StorageService.ensureUuid(f.id);
    f.organizationId = this.getCurrentOrgId();
    const branchId = this.getSelectedBranchId();
    if (branchId) f.storeBranchId = branchId;
    const all = this.get<FooterMessage[]>(KEYS.FOOTER_MESSAGES, []);
    const idx = all.findIndex((x) => x.id === f.id);
    if (idx >= 0) all[idx] = f;
    else all.unshift(f);
    this.set(KEYS.FOOTER_MESSAGES, all);
    this.syncFooterMessage(f);
  }

  deleteFooterMessage(id: string) {
    const all = this.get<FooterMessage[]>(KEYS.FOOTER_MESSAGES, []).filter((x) => x.id !== id);
    this.set(KEYS.FOOTER_MESSAGES, all);
    syncService.deleteRow('footer_messages', id);
  }

  private syncFooterMessage(f: FooterMessage) {
    syncService.upsertRow('footer_messages', {
      id: f.id,
      organization_id: this.getCurrentOrgId(),
      store_branch_id: f.storeBranchId || null,
      message: f.message,
      active: f.active,
      sort_order: f.sortOrder || 0,
    });
  }

  updateFooterMessageFromRemote(row: any) {
    const all = this.get<FooterMessage[]>(KEYS.FOOTER_MESSAGES, []);
    const mapped: FooterMessage = {
      id: row.id, message: row.message || '',
      active: row.active !== false,
      sortOrder: parseInt(row.sort_order) || 0,
      storeBranchId: row.store_branch_id || undefined,
      organizationId: row.organization_id || undefined,
    };
    const idx = all.findIndex((x) => x.id === mapped.id);
    if (idx >= 0) all[idx] = mapped;
    else all.unshift(mapped);
    this.set(KEYS.FOOTER_MESSAGES, all);
    this.notify();
  }

  removeFooterMessageFromRemote(id: string) {
    const all = this.get<FooterMessage[]>(KEYS.FOOTER_MESSAGES, []).filter((x) => x.id !== id);
    this.set(KEYS.FOOTER_MESSAGES, all);
    this.notify();
  }

  // --- MEDIA DEVICES (TVs/vitrines pareadas) ---
  getMediaDevices(): MediaDevice[] {
    const all = this.get<MediaDevice[]>(KEYS.MEDIA_DEVICES, []);
    return this.filterBySelectedBranch(this.filterByOrg(all));
  }

  /**
   * Busca um dispositivo de mídia pelo código de pareamento de 6 dígitos,
   * SEM filtrar por filial — usado na tela "Conectar TV" (o aparelho da TV
   * pode ainda não ter filial selecionada). Escopo: organização atual apenas.
   */
  findMediaDeviceByPairingCode(code: string): MediaDevice | undefined {
    const clean = (code || '').trim().replace(/\D/g, '');
    if (!clean) return undefined;
    const all = this.get<MediaDevice[]>(KEYS.MEDIA_DEVICES, []);
    return all.find(
      (d) => (d.pairingCode || '').replace(/\D/g, '') === clean
        && d.organizationId === this.getCurrentOrgId(),
    );
  }

  saveMediaDevice(d: MediaDevice) {
    d.id = StorageService.ensureUuid(d.id);
    d.organizationId = this.getCurrentOrgId();
    const branchId = this.getSelectedBranchId();
    if (branchId) d.storeBranchId = branchId;
    const all = this.get<MediaDevice[]>(KEYS.MEDIA_DEVICES, []);
    const idx = all.findIndex((x) => x.id === d.id);
    if (idx >= 0) all[idx] = d;
    else all.unshift(d);
    this.set(KEYS.MEDIA_DEVICES, all);
    this.syncMediaDevice(d);
  }

  deleteMediaDevice(id: string) {
    const all = this.get<MediaDevice[]>(KEYS.MEDIA_DEVICES, []).filter((x) => x.id !== id);
    this.set(KEYS.MEDIA_DEVICES, all);
    syncService.deleteRow('media_devices', id);
  }

  private syncMediaDevice(d: MediaDevice) {
    syncService.upsertRow('media_devices', {
      id: d.id,
      organization_id: this.getCurrentOrgId(),
      store_branch_id: d.storeBranchId || null,
      name: d.name,
      device_type: d.deviceType,
      address: d.address || null,
      pairing_code: d.pairingCode,
      is_active: d.active,
      // last_seen_at NÃO é escrito aqui: é gerenciado pelo heartbeat RPC no
      // servidor (throttle 15s) — sobrescrever quebraria o status online/offline.
    });
  }

  updateMediaDeviceFromRemote(row: any) {
    const all = this.get<MediaDevice[]>(KEYS.MEDIA_DEVICES, []);
    const mapped: MediaDevice = {
      id: row.id, name: row.name || '',
      deviceType: (row.device_type === 'vitrine' ? 'vitrine' : 'tv'),
      address: row.address || undefined,
      pairingCode: row.pairing_code || '',
      active: row.is_active !== false,
      status: StorageService.mediaStatusFrom(row.last_seen_at),
      lastSeenAt: row.last_seen_at || undefined,
      storeBranchId: row.store_branch_id || undefined,
      organizationId: row.organization_id || undefined,
    };
    const idx = all.findIndex((x) => x.id === mapped.id);
    if (idx >= 0) all[idx] = mapped;
    else all.unshift(mapped);
    this.set(KEYS.MEDIA_DEVICES, all);
    this.notify();
  }

  removeMediaDeviceFromRemote(id: string) {
    const all = this.get<MediaDevice[]>(KEYS.MEDIA_DEVICES, []).filter((x) => x.id !== id);
    this.set(KEYS.MEDIA_DEVICES, all);
    this.notify();
  }

  // --- PRINTERS (impressoras configuradas) ---
  getPrinters(): Printer[] {
    const all = this.get<Printer[]>(KEYS.PRINTERS, []);
    return this.filterBySelectedBranch(this.filterByOrg(all));
  }

  savePrinter(p: Printer) {
    p.id = StorageService.ensureUuid(p.id);
    p.organizationId = this.getCurrentOrgId();
    const branchId = this.getSelectedBranchId();
    if (branchId) p.storeBranchId = branchId;
    const all = this.get<Printer[]>(KEYS.PRINTERS, []);
    const idx = all.findIndex((x) => x.id === p.id);
    if (idx >= 0) all[idx] = p;
    else all.unshift(p);
    this.set(KEYS.PRINTERS, all);
    this.syncPrinter(p);
  }

  deletePrinter(id: string) {
    const all = this.get<Printer[]>(KEYS.PRINTERS, []).filter((x) => x.id !== id);
    this.set(KEYS.PRINTERS, all);
    syncService.deleteRow('printers', id);
  }

  private syncPrinter(p: Printer) {
    syncService.upsertRow('printers', {
      id: p.id,
      organization_id: this.getCurrentOrgId(),
      store_branch_id: p.storeBranchId || null,
      name: p.name,
      model: p.model || null,
      transport: p.transport,
      role: p.role || 'caixa',
      category_id: p.categoryId || null,
      ip_address: p.ipAddress || null,
      port: p.port || null,
      is_default: p.isDefault,
      status: p.status || 'offline',
      // last_seen_at é gerenciado pelo servidor — não sobrescrever.
    });
  }

  private syncTable(t: Table) {
    syncService.upsertRow('tables', {
      id: t.id,
      organization_id: this.getCurrentOrgId(),
      store_branch_id: t.storeBranchId || null,
      name: t.name,
      number: t.number || null,
      qr_token: t.qrToken,
      status: t.status || 'active',
    });
  }

  private syncCustomerSession(s: CustomerSession) {
    syncService.upsertRow('customer_sessions', {
      id: s.id,
      table_id: s.tableId || null,
      organization_id: this.getCurrentOrgId(),
      store_branch_id: s.storeBranchId || null,
      session_token: s.sessionToken,
      status: s.status || 'active',
      device_fingerprint: s.deviceFingerprint || null,
      customer_name: s.customerName || null,
    });
  }

  private syncDigitalMenuConfig(c: DigitalMenuConfig) {
    syncService.upsertRow('digital_menu_config', {
      id: c.id,
      organization_id: this.getCurrentOrgId(),
      store_branch_id: c.storeBranchId || null,
      title: c.title,
      subtitle: c.subtitle || null,
      logo_url: c.logoUrl || null,
      banner_url: c.bannerUrl || null,
      layout_mode: c.layoutMode || 'grid',
      show_prices: c.showPrices !== false,
    });
  }

  private syncBranchTheme(t: BranchTheme) {
    syncService.upsertRow('branch_themes', {
      id: t.id,
      organization_id: this.getCurrentOrgId(),
      store_branch_id: t.storeBranchId || null,
      primary_color: t.primaryColor,
      secondary_color: t.secondaryColor,
      accent_color: t.accentColor,
      bg_color: t.bgColor,
      logo_url: t.logoUrl || null,
      favicon_url: t.faviconUrl || null,
    });
  }

  private syncApiKey(k: ApiKey) {
    syncService.upsertRow('api_keys', {
      id: k.id,
      organization_id: this.getCurrentOrgId(),
      store_branch_id: k.storeBranchId || null,
      name: k.name,
      key_hash: k.keyHash,
      key_prefix: k.keyPrefix,
      permissions: JSON.stringify(k.permissions || []),
      is_active: k.isActive !== false,
      expires_at: k.expiresAt || null,
    });
  }

  // ── DELIVERY SYNC METHODS ──────────────────────────────────────────
  private syncDeliverySettings(s: DeliverySettings) {
    syncService.upsertRow('delivery_settings', {
      id: s.id,
      organization_id: s.organizationId,
      store_branch_id: s.storeBranchId,
      is_active: s.isActive,
      delivery_enabled: s.deliveryEnabled,
      pickup_enabled: s.pickupEnabled,
      operating_hours: JSON.stringify(s.operatingHours),
      fee_calculation_type: s.feeCalculationType,
      fixed_fee: s.fixedFee,
      minimum_order_value: s.minimumOrderValue,
      estimated_delivery_time: s.estimatedDeliveryTime,
      max_delivery_distance_km: s.maxDeliveryDistanceKm,
      branch_latitude: s.branchLatitude || null,
      branch_longitude: s.branchLongitude || null,
      whatsapp_phone: s.whatsappPhone || null,
      full_address: s.fullAddress || null,
    });
  }

  private syncDeliveryNeighborhood(n: DeliveryNeighborhood) {
    syncService.upsertRow('delivery_neighborhoods', {
      id: n.id,
      organization_id: n.organizationId,
      store_branch_id: n.storeBranchId,
      neighborhood: n.neighborhood,
      fee: n.fee,
      estimated_time_minutes: n.estimatedTimeMinutes,
      is_active: n.isActive,
    });
  }

  private syncDeliveryDistanceRate(r: DeliveryDistanceRate) {
    syncService.upsertRow('delivery_distance_rates', {
      id: r.id,
      organization_id: r.organizationId,
      store_branch_id: r.storeBranchId,
      min_km: r.minKm,
      max_km: r.maxKm,
      fee: r.fee,
      estimated_time_minutes: r.estimatedTimeMinutes,
      is_active: r.isActive,
    });
  }

  private syncDeliveryOrder(o: DeliveryOrder) {
    syncService.upsertRow('delivery_orders', {
      id: o.id,
      organization_id: o.organizationId,
      store_branch_id: o.storeBranchId,
      customer_id: o.customerId || null,
      order_type: o.orderType,
      status: o.status,
      items_json: JSON.stringify(o.items),
      subtotal: o.subtotal,
      delivery_fee: o.deliveryFee,
      discount: o.discount,
      total: o.total,
      payment_method: o.paymentMethod || null,
      change_amount: o.changeAmount || null,
      delivery_address: o.deliveryAddress ? JSON.stringify(o.deliveryAddress) : null,
      customer_name: o.customerName,
      customer_whatsapp: o.customerWhatsapp || null,
      customer_email: o.customerEmail || null,
      notes: o.notes || null,
      estimated_delivery_time: o.estimatedDeliveryTime || null,
      whatsapp_sent: o.whatsappSent,
      delivered_by: o.deliveredBy || null,
    });
  }

  updatePrinterFromRemote(row: any) {
    const all = this.get<Printer[]>(KEYS.PRINTERS, []);
    const mapped: Printer = {
      id: row.id, name: row.name || '',
      model: row.model || undefined,
      transport: (row.transport === 'webusb' || row.transport === 'serial' || row.transport === 'os' ? row.transport : 'network'),
      role: row.role || 'caixa',
      categoryId: row.category_id || undefined,
      ipAddress: row.ip_address || undefined,
      port: parseInt(row.port) || undefined,
      isDefault: row.is_default === true,
      status: row.status || 'offline',
      lastSeenAt: row.last_seen_at || undefined,
      storeBranchId: row.store_branch_id || undefined,
      organizationId: row.organization_id || undefined,
    };
    const idx = all.findIndex((x) => x.id === mapped.id);
    if (idx >= 0) all[idx] = mapped;
    else all.unshift(mapped);
    this.set(KEYS.PRINTERS, all);
    this.notify();
  }

  removePrinterFromRemote(id: string) {
    const all = this.get<Printer[]>(KEYS.PRINTERS, []).filter((x) => x.id !== id);
    this.set(KEYS.PRINTERS, all);
    this.notify();
  }

  // --- TABLES (mesas) ---
  getTables(): Table[] {
    return this.get<Table[]>(KEYS.TABLES, []);
  }

  saveTable(table: Table) {
    table.id = StorageService.ensureUuid(table.id);
    table.organizationId = this.getCurrentOrgId();
    const all = this.get<Table[]>(KEYS.TABLES, []);
    const idx = all.findIndex((t) => t.id === table.id);
    if (idx >= 0) all[idx] = table;
    else all.push(table);
    this.set(KEYS.TABLES, all);
    this.syncTable(table);
  }

  deleteTable(id: string) {
    const all = this.get<Table[]>(KEYS.TABLES, []).filter((x) => x.id !== id);
    this.set(KEYS.TABLES, all);
    syncService.deleteRow('tables', id);
  }

  updateTableFromRemote(row: any) {
    const all = this.get<Table[]>(KEYS.TABLES, []);
    const mapped: Table = {
      id: row.id, name: row.name || '',
      number: parseInt(row.number) || undefined,
      qrToken: row.qr_token || '',
      status: row.status || 'active',
      storeBranchId: row.store_branch_id || undefined,
      organizationId: row.organization_id || undefined,
      createdAt: row.created_at || new Date().toISOString(),
      updatedAt: row.updated_at || new Date().toISOString(),
    };
    const idx = all.findIndex((x) => x.id === mapped.id);
    if (idx >= 0) all[idx] = mapped;
    else all.unshift(mapped);
    this.set(KEYS.TABLES, all);
    this.notify(); // Notificar listeners (UI atualiza em tempo real)
  }

  removeTableFromRemote(id: string) {
    const all = this.get<Table[]>(KEYS.TABLES, []).filter((x) => x.id !== id);
    this.set(KEYS.TABLES, all);
    this.notify(); // Notificar listeners (UI atualiza em tempo real)
  }

  // --- CUSTOMER SESSIONS ---
  getCustomerSessions(): CustomerSession[] {
    return this.get<CustomerSession[]>(KEYS.CUSTOMER_SESSIONS, []);
  }

  saveCustomerSession(session: CustomerSession) {
    session.id = StorageService.ensureUuid(session.id);
    session.organizationId = this.getCurrentOrgId();
    const all = this.get<CustomerSession[]>(KEYS.CUSTOMER_SESSIONS, []);
    const idx = all.findIndex((s) => s.id === session.id);
    if (idx >= 0) all[idx] = session;
    else all.push(session);
    this.set(KEYS.CUSTOMER_SESSIONS, all);
    this.syncCustomerSession(session);
  }

  updateCustomerSessionFromRemote(row: any) {
    const all = this.get<CustomerSession[]>(KEYS.CUSTOMER_SESSIONS, []);
    const mapped: CustomerSession = {
      id: row.id, tableId: row.table_id || '',
      sessionToken: row.session_token || '',
      status: row.status || 'active',
      openedAt: row.opened_at || new Date().toISOString(),
      closedAt: row.closed_at || undefined,
      deviceFingerprint: row.device_fingerprint || undefined,
      customerName: row.customer_name || undefined,
      storeBranchId: row.store_branch_id || undefined,
      organizationId: row.organization_id || undefined,
      createdAt: row.created_at || new Date().toISOString(),
      updatedAt: row.updated_at || new Date().toISOString(),
    };
    const idx = all.findIndex((x) => x.id === mapped.id);
    if (idx >= 0) all[idx] = mapped;
    else all.unshift(mapped);
    this.set(KEYS.CUSTOMER_SESSIONS, all);
    this.notify();
  }

  removeCustomerSessionFromRemote(id: string) {
    const all = this.get<CustomerSession[]>(KEYS.CUSTOMER_SESSIONS, []).filter((x) => x.id !== id);
    this.set(KEYS.CUSTOMER_SESSIONS, all);
    this.notify();
  }

  // --- DIGITAL MENU CONFIG ---
  getDigitalMenuConfig(): DigitalMenuConfig | null {
    const all = this.get<DigitalMenuConfig[]>(KEYS.DIGITAL_MENU_CONFIG, []);
    return all[0] || null;
  }

  saveDigitalMenuConfig(config: DigitalMenuConfig) {
    config.id = StorageService.ensureUuid(config.id);
    config.organizationId = this.getCurrentOrgId();
    const all = this.get<DigitalMenuConfig[]>(KEYS.DIGITAL_MENU_CONFIG, []);
    const idx = all.findIndex((c) => c.id === config.id);
    if (idx >= 0) all[idx] = config;
    else all.unshift(config);
    this.set(KEYS.DIGITAL_MENU_CONFIG, all);
    this.syncDigitalMenuConfig(config);
  }

  updateDigitalMenuConfigFromRemote(row: any) {
    const all = this.get<DigitalMenuConfig[]>(KEYS.DIGITAL_MENU_CONFIG, []);
    const mapped: DigitalMenuConfig = {
      id: row.id, title: row.title || 'Cardápio Digital',
      subtitle: row.subtitle || undefined,
      logoUrl: row.logo_url || undefined,
      bannerUrl: row.banner_url || undefined,
      layoutMode: row.layout_mode === 'list' ? 'list' : 'grid',
      showPrices: row.show_prices !== false,
      storeBranchId: row.store_branch_id || undefined,
      organizationId: row.organization_id || undefined,
      updatedAt: row.updated_at || new Date().toISOString(),
    };
    const idx = all.findIndex((x) => x.id === mapped.id);
    if (idx >= 0) all[idx] = mapped;
    else all.unshift(mapped);
    this.set(KEYS.DIGITAL_MENU_CONFIG, all);
    this.notify();
  }

  removeDigitalMenuConfigFromRemote(id: string) {
    const all = this.get<DigitalMenuConfig[]>(KEYS.DIGITAL_MENU_CONFIG, []).filter((x) => x.id !== id);
    this.set(KEYS.DIGITAL_MENU_CONFIG, all);
    this.notify();
  }

  // --- BRANCH THEMES ---
  getBranchTheme(): BranchTheme | null {
    const all = this.get<BranchTheme[]>(KEYS.BRANCH_THEMES, []);
    const currentOrgId = this.getCurrentOrgId();
    const currentBranchId = this.getSelectedBranchId();
    // Filter by current organization AND branch
    const filtered = all.filter(
      (t) => t.organizationId === currentOrgId && t.storeBranchId === currentBranchId
    );
    return filtered[0] || null;
  }

  saveBranchTheme(theme: BranchTheme) {
    theme.id = StorageService.ensureUuid(theme.id);
    theme.organizationId = this.getCurrentOrgId();
    const all = this.get<BranchTheme[]>(KEYS.BRANCH_THEMES, []);
    const idx = all.findIndex((t) => t.id === theme.id);
    if (idx >= 0) all[idx] = theme;
    else all.unshift(theme);
    this.set(KEYS.BRANCH_THEMES, all);
    this.syncBranchTheme(theme);
  }

  updateBranchThemeFromRemote(row: any) {
    const all = this.get<BranchTheme[]>(KEYS.BRANCH_THEMES, []);
    const mapped: BranchTheme = {
      id: row.id,
      primaryColor: row.primary_color || '#4f46e5',
      secondaryColor: row.secondary_color || '#6366f1',
      accentColor: row.accent_color || '#f59e0b',
      bgColor: row.bg_color || '#09090b',
      logoUrl: row.logo_url || undefined,
      faviconUrl: row.favicon_url || undefined,
      storeBranchId: row.store_branch_id || undefined,
      organizationId: row.organization_id || undefined,
      updatedAt: row.updated_at || new Date().toISOString(),
    };
    const idx = all.findIndex((x) => x.id === mapped.id);
    if (idx >= 0) all[idx] = mapped;
    else all.unshift(mapped);
    this.set(KEYS.BRANCH_THEMES, all);
    this.notify();
  }

  removeBranchThemeFromRemote(id: string) {
    const all = this.get<BranchTheme[]>(KEYS.BRANCH_THEMES, []).filter((x) => x.id !== id);
    this.set(KEYS.BRANCH_THEMES, all);
    this.notify();
  }

  // --- API KEYS ---
  getApiKeys(): ApiKey[] {
    return this.get<ApiKey[]>(KEYS.API_KEYS, []);
  }

  saveApiKey(key: ApiKey) {
    key.id = StorageService.ensureUuid(key.id);
    key.organizationId = this.getCurrentOrgId();
    const all = this.get<ApiKey[]>(KEYS.API_KEYS, []);
    const idx = all.findIndex((k) => k.id === key.id);
    if (idx >= 0) all[idx] = key;
    else all.push(key);
    this.set(KEYS.API_KEYS, all);
    this.syncApiKey(key);
  }

  updateApiKeyFromRemote(row: any) {
    const all = this.get<ApiKey[]>(KEYS.API_KEYS, []);
    const mapped: ApiKey = {
      id: row.id, name: row.name || '',
      keyHash: row.key_hash || '',
      keyPrefix: row.key_prefix || '',
      permissions: row.permissions || ['read:products'],
      isActive: row.is_active !== false,
      lastUsedAt: row.last_used_at || undefined,
      expiresAt: row.expires_at || undefined,
      storeBranchId: row.store_branch_id || undefined,
      organizationId: row.organization_id || undefined,
      createdAt: row.created_at || new Date().toISOString(),
      updatedAt: row.updated_at || new Date().toISOString(),
    };
    const idx = all.findIndex((x) => x.id === mapped.id);
    if (idx >= 0) all[idx] = mapped;
    else all.unshift(mapped);
    this.set(KEYS.API_KEYS, all);
    this.notify();
  }

  removeApiKeyFromRemote(id: string) {
    const all = this.get<ApiKey[]>(KEYS.API_KEYS, []).filter((x) => x.id !== id);
    this.set(KEYS.API_KEYS, all);
    this.notify();
  }

  // --- DELIVERY SETTINGS ---
  getDeliverySettings(): DeliverySettings | null {
    return this.get<DeliverySettings | null>(KEYS.DELIVERY_SETTINGS, null);
  }

  saveDeliverySettings(settings: DeliverySettings) {
    settings.id = StorageService.ensureUuid(settings.id);
    settings.organizationId = this.getCurrentOrgId();
    this.set(KEYS.DELIVERY_SETTINGS, settings);
    this.syncDeliverySettings(settings);
  }

  updateDeliverySettingsFromRemote(row: any) {
    const mapped: DeliverySettings = {
      id: row.id,
      organizationId: row.organization_id || this.getCurrentOrgId(),
      storeBranchId: row.store_branch_id || '',
      isActive: row.is_active !== false,
      deliveryEnabled: row.delivery_enabled !== false,
      pickupEnabled: row.pickup_enabled !== false,
      operatingHours: row.operating_hours || {},
      feeCalculationType: row.fee_calculation_type || 'free',
      fixedFee: parseFloat(row.fixed_fee) || 0,
      minimumOrderValue: parseFloat(row.minimum_order_value) || 0,
      estimatedDeliveryTime: row.estimated_delivery_time || 45,
      maxDeliveryDistanceKm: row.max_delivery_distance_km || 15,
      branchLatitude: row.branch_latitude || undefined,
      branchLongitude: row.branch_longitude || undefined,
      whatsappPhone: row.whatsapp_phone || undefined,
      fullAddress: row.full_address || undefined,
      createdAt: row.created_at || new Date().toISOString(),
      updatedAt: row.updated_at || new Date().toISOString(),
    };
    this.set(KEYS.DELIVERY_SETTINGS, mapped);
    this.notify();
  }

  // --- DELIVERY NEIGHBORHOODS ---
  getDeliveryNeighborhoods(): DeliveryNeighborhood[] {
    return this.get<DeliveryNeighborhood[]>(KEYS.DELIVERY_NEIGHBORHOODS, []);
  }

  saveDeliveryNeighborhood(neighborhood: DeliveryNeighborhood) {
    neighborhood.id = StorageService.ensureUuid(neighborhood.id);
    neighborhood.organizationId = this.getCurrentOrgId();
    const all = this.get<DeliveryNeighborhood[]>(KEYS.DELIVERY_NEIGHBORHOODS, []);
    const idx = all.findIndex((n) => n.id === neighborhood.id);
    if (idx >= 0) all[idx] = neighborhood;
    else all.push(neighborhood);
    this.set(KEYS.DELIVERY_NEIGHBORHOODS, all);
    this.syncDeliveryNeighborhood(neighborhood);
  }

  deleteDeliveryNeighborhood(id: string) {
    const all = this.get<DeliveryNeighborhood[]>(KEYS.DELIVERY_NEIGHBORHOODS, []).filter((x) => x.id !== id);
    this.set(KEYS.DELIVERY_NEIGHBORHOODS, all);
    syncService.deleteRow('delivery_neighborhoods', id);
  }

  updateDeliveryNeighborhoodFromRemote(row: any) {
    const all = this.get<DeliveryNeighborhood[]>(KEYS.DELIVERY_NEIGHBORHOODS, []);
    const mapped: DeliveryNeighborhood = {
      id: row.id,
      organizationId: row.organization_id || this.getCurrentOrgId(),
      storeBranchId: row.store_branch_id || '',
      neighborhood: row.neighborhood || '',
      fee: parseFloat(row.fee) || 0,
      estimatedTimeMinutes: row.estimated_time_minutes || 45,
      isActive: row.is_active !== false,
      createdAt: row.created_at || new Date().toISOString(),
      updatedAt: row.updated_at || new Date().toISOString(),
    };
    const idx = all.findIndex((x) => x.id === mapped.id);
    if (idx >= 0) all[idx] = mapped;
    else all.unshift(mapped);
    this.set(KEYS.DELIVERY_NEIGHBORHOODS, all);
    this.notify();
  }

  removeDeliveryNeighborhoodFromRemote(id: string) {
    const all = this.get<DeliveryNeighborhood[]>(KEYS.DELIVERY_NEIGHBORHOODS, []).filter((x) => x.id !== id);
    this.set(KEYS.DELIVERY_NEIGHBORHOODS, all);
    this.notify();
  }

  // --- DELIVERY DISTANCE RATES ---
  getDeliveryDistanceRates(): DeliveryDistanceRate[] {
    return this.get<DeliveryDistanceRate[]>(KEYS.DELIVERY_DISTANCE_RATES, []);
  }

  saveDeliveryDistanceRate(rate: DeliveryDistanceRate) {
    rate.id = StorageService.ensureUuid(rate.id);
    rate.organizationId = this.getCurrentOrgId();
    const all = this.get<DeliveryDistanceRate[]>(KEYS.DELIVERY_DISTANCE_RATES, []);
    const idx = all.findIndex((r) => r.id === rate.id);
    if (idx >= 0) all[idx] = rate;
    else all.push(rate);
    this.set(KEYS.DELIVERY_DISTANCE_RATES, all);
    this.syncDeliveryDistanceRate(rate);
  }

  deleteDeliveryDistanceRate(id: string) {
    const all = this.get<DeliveryDistanceRate[]>(KEYS.DELIVERY_DISTANCE_RATES, []).filter((x) => x.id !== id);
    this.set(KEYS.DELIVERY_DISTANCE_RATES, all);
    syncService.deleteRow('delivery_distance_rates', id);
  }

  updateDeliveryDistanceRateFromRemote(row: any) {
    const all = this.get<DeliveryDistanceRate[]>(KEYS.DELIVERY_DISTANCE_RATES, []);
    const mapped: DeliveryDistanceRate = {
      id: row.id,
      organizationId: row.organization_id || this.getCurrentOrgId(),
      storeBranchId: row.store_branch_id || '',
      minKm: parseFloat(row.min_km) || 0,
      maxKm: parseFloat(row.max_km) || 0,
      fee: parseFloat(row.fee) || 0,
      estimatedTimeMinutes: row.estimated_time_minutes || 45,
      isActive: row.is_active !== false,
      createdAt: row.created_at || new Date().toISOString(),
      updatedAt: row.updated_at || new Date().toISOString(),
    };
    const idx = all.findIndex((x) => x.id === mapped.id);
    if (idx >= 0) all[idx] = mapped;
    else all.unshift(mapped);
    this.set(KEYS.DELIVERY_DISTANCE_RATES, all);
    this.notify();
  }

  removeDeliveryDistanceRateFromRemote(id: string) {
    const all = this.get<DeliveryDistanceRate[]>(KEYS.DELIVERY_DISTANCE_RATES, []).filter((x) => x.id !== id);
    this.set(KEYS.DELIVERY_DISTANCE_RATES, all);
    this.notify();
  }

  // --- DELIVERY ORDERS ---
  getDeliveryOrders(): DeliveryOrder[] {
    return this.get<DeliveryOrder[]>(KEYS.DELIVERY_ORDERS, []);
  }

  getDeliveryOrdersByCustomer(customerId: string): DeliveryOrder[] {
    return this.getDeliveryOrders().filter((o) => o.customerId === customerId);
  }

  getDeliveryOrdersByStatus(status: string): DeliveryOrder[] {
    return this.getDeliveryOrders().filter((o) => o.status === status);
  }

  saveDeliveryOrder(order: DeliveryOrder) {
    order.id = StorageService.ensureUuid(order.id);
    order.organizationId = this.getCurrentOrgId();
    const all = this.get<DeliveryOrder[]>(KEYS.DELIVERY_ORDERS, []);
    const idx = all.findIndex((o) => o.id === order.id);
    if (idx >= 0) all[idx] = order;
    else all.unshift(order);
    this.set(KEYS.DELIVERY_ORDERS, all);
    this.syncDeliveryOrder(order);
  }

  updateDeliveryOrderStatus(orderId: string, status: string, extraData?: Partial<DeliveryOrder>) {
    const all = this.get<DeliveryOrder[]>(KEYS.DELIVERY_ORDERS, []);
    const idx = all.findIndex((o) => o.id === orderId);
    if (idx >= 0) {
      all[idx] = { ...all[idx], status, ...extraData, updatedAt: new Date().toISOString() };
      this.set(KEYS.DELIVERY_ORDERS, all);
      this.syncDeliveryOrder(all[idx]);
    }
  }

  deleteDeliveryOrder(id: string) {
    const all = this.get<DeliveryOrder[]>(KEYS.DELIVERY_ORDERS, []).filter((x) => x.id !== id);
    this.set(KEYS.DELIVERY_ORDERS, all);
    syncService.deleteRow('delivery_orders', id);
  }

  updateDeliveryOrderFromRemote(row: any, eventType?: string) {
    this.setChangeSource('remote');
    const all = this.get<DeliveryOrder[]>(KEYS.DELIVERY_ORDERS, []);
    const mapped: DeliveryOrder = {
      id: row.id,
      organizationId: row.organization_id || this.getCurrentOrgId(),
      storeBranchId: row.store_branch_id || '',
      customerId: row.customer_id || undefined,
      orderNumber: row.order_number || 0,
      orderType: row.order_type || 'delivery',
      status: row.status || 'pending',
      items: row.items_json || [],
      subtotal: parseFloat(row.subtotal) || 0,
      deliveryFee: parseFloat(row.delivery_fee) || 0,
      discount: parseFloat(row.discount) || 0,
      total: parseFloat(row.total) || 0,
      paymentMethod: row.payment_method || undefined,
      changeAmount: parseFloat(row.change_amount) || undefined,
      deliveryAddress: row.delivery_address || undefined,
      customerName: row.customer_name || '',
      customerWhatsapp: row.customer_whatsapp || undefined,
      customerEmail: row.customer_email || undefined,
      notes: row.notes || undefined,
      estimatedDeliveryTime: row.estimated_delivery_time || undefined,
      confirmedAt: row.confirmed_at || undefined,
      preparingAt: row.preparing_at || undefined,
      readyAt: row.ready_at || undefined,
      outForDeliveryAt: row.out_for_delivery_at || undefined,
      deliveredAt: row.delivered_at || undefined,
      cancelledAt: row.cancelled_at || undefined,
      cancelledReason: row.cancelled_reason || undefined,
      whatsappSent: row.whatsapp_sent || false,
      whatsappSentAt: row.whatsapp_sent_at || undefined,
      deliveredBy: row.delivered_by || undefined,
      createdAt: row.created_at || new Date().toISOString(),
      updatedAt: row.updated_at || new Date().toISOString(),
    };
    const idx = all.findIndex((x) => x.id === mapped.id);
    if (idx >= 0) all[idx] = mapped;
    else all.unshift(mapped);
    this.set(KEYS.DELIVERY_ORDERS, all);
    // Só notifica (bip/toast) em INSERT remoto — pedido NOVO chegou de outro
    // dispositivo. UPDATEs de status (ex.: operador marcando "Entregue") ecoam
    // pelo Realtime e gerariam bip/toast DUPLICADO da ação local.
    if (eventType === 'INSERT') this.notify(KEYS.DELIVERY_ORDERS, 'remote', mapped);
  }

  removeDeliveryOrderFromRemote(id: string) {
    const all = this.get<DeliveryOrder[]>(KEYS.DELIVERY_ORDERS, []).filter((x) => x.id !== id);
    this.set(KEYS.DELIVERY_ORDERS, all);
    this.notify();
  }

  // --- MODULE VISIBILITY ---
  /**
   * Get module visibility for current branch
   * Stored as array of records (one per branch)
   * ✅ Backward compatible: handles old single-object format
   */
  getModuleVisibility(): any | null {
    const data = this.get<any>('hd_system_module_visibility', null);
    
    // ✅ Handle old single-object format (convert to array)
    if (data && !Array.isArray(data)) {
      const arr = [data];
      this.set('hd_system_module_visibility', arr);
      const currentBranchId = this.getSelectedBranchId();
      if (!currentBranchId) return arr[0] || null;
      return arr.find(v => v.storeBranchId === currentBranchId) || arr[0];
    }
    
    const all = Array.isArray(data) ? data : [];
    const currentBranchId = this.getSelectedBranchId();
    if (!currentBranchId) return all[0] || null;
    return all.find(v => v.storeBranchId === currentBranchId) || null;
  }

  /**
   * Get all module visibility records (for sync)
   */
  getAllModuleVisibility(): any[] {
    const data = this.get<any>('hd_system_module_visibility', []);
    
    // ✅ Handle old single-object format
    if (data && !Array.isArray(data)) {
      return [data];
    }
    
    return Array.isArray(data) ? data : [];
  }

  /**
   * Get all branch themes (for backup/sync)
   */
  getAllBranchThemes(): any[] {
    const data = this.get<any>('hd_system_branch_themes', []);
    if (data && !Array.isArray(data)) {
      return [data];
    }
    return Array.isArray(data) ? data : [];
  }

  /**
   * Get all system settings (for backup/sync)
   */
  getAllSettings(): any[] {
    const data = this.get<any>('hd_system_settings', []);
    if (data && !Array.isArray(data)) {
      return [data];
    }
    return Array.isArray(data) ? data : [];
  }

  /**
   * Get all caixa sessions (for backup/sync)
   */
  getCaixaSessions(): any[] {
    const data = this.get<any>('hd_system_caixa_session', []);
    if (data && !Array.isArray(data)) {
      return [data];
    }
    return Array.isArray(data) ? data : [];
  }

  saveModuleVisibility(settings: any) {
    settings.id = StorageService.ensureUuid(settings.id);
    settings.organizationId = this.getCurrentOrgId();
    
    // ✅ Store as array (one record per branch)
    const all = this.get<any[]>('hd_system_module_visibility', []);
    const idx = all.findIndex(v => v.storeBranchId === settings.storeBranchId);
    if (idx >= 0) {
      // ✅ Preserve the existing ID to avoid UNIQUE constraint violation
      settings.id = all[idx].id;
      all[idx] = { ...all[idx], ...settings };
    } else {
      all.push(settings);
    }
    
    this.set('hd_system_module_visibility', all);
    syncService.upsertRow('module_visibility', {
      id: settings.id,
      organization_id: settings.organizationId,
      store_branch_id: settings.storeBranchId,
      module_pdv: settings.modulePdv ?? true,
      module_inventory: settings.moduleInventory ?? true,
      module_fiado: settings.moduleFiado ?? false,
      module_crm: settings.moduleCrm ?? false,
      module_dashboard: settings.moduleDashboard ?? true,
      module_finance: settings.moduleFinance ?? false,
      module_kds: settings.moduleKds ?? false,
      module_delivery: settings.moduleDelivery ?? false,
      module_cardapio_digital: settings.moduleCardapioDigital ?? false,
      module_cardapio_preview: settings.moduleCardapioPreview ?? false,
      module_tv_showcase: settings.moduleTvShowcase ?? false,
      module_tv_connect: settings.moduleTvConnect ?? false,
    });
  }

  updateModuleVisibilityFromRemote(row: any) {
    const mapped: any = {
      id: row.id,
      organizationId: row.organization_id || this.getCurrentOrgId(),
      storeBranchId: row.store_branch_id || '',
      modulePdv: row.module_pdv ?? true,
      moduleInventory: row.module_inventory ?? true,
      moduleFiado: row.module_fiado ?? false,
      moduleCrm: row.module_crm ?? false,
      moduleDashboard: row.module_dashboard ?? true,
      moduleFinance: row.module_finance ?? false,
      moduleKds: row.module_kds ?? false,
      moduleDelivery: row.module_delivery ?? false,
      moduleCardapioDigital: row.module_cardapio_digital ?? false,
      moduleCardapioPreview: row.module_cardapio_preview ?? false,
      moduleTvShowcase: row.module_tv_showcase ?? false,
      moduleTvConnect: row.module_tv_connect ?? false,
    };
    
    // ✅ Get data, handle old single-object format
    const data = this.get<any>('hd_system_module_visibility', []);
    let all: any[];
    
    if (data && !Array.isArray(data)) {
      // Convert old single-object format to array
      all = [data];
    } else {
      all = Array.isArray(data) ? data : [];
    }
    
    // ✅ Update array (one record per branch)
    const idx = all.findIndex(v => v.id === mapped.id || v.storeBranchId === mapped.storeBranchId);
    if (idx >= 0) all[idx] = { ...all[idx], ...mapped };
    else all.push(mapped);
    
    this.set('hd_system_module_visibility', all);
    this.notify();
  }

  removeModuleVisibilityFromRemote(id: string) {
    const data = this.get<any>('hd_system_module_visibility', []);
    let all: any[];
    
    // ✅ Handle old single-object format
    if (data && !Array.isArray(data)) {
      all = [data];
    } else {
      all = Array.isArray(data) ? data : [];
    }
    
    const filtered = all.filter(v => v.id !== id);
    this.set('hd_system_module_visibility', filtered);
    this.notify();
  }

  // --- INTEGRATIONS (Bancos & Meios de Pagamento) ---
  getIntegration(): any | null {
    const all = this.get<any[]>('hd_system_integrations', []);
    const currentBranchId = this.getSelectedBranchId();
    if (!currentBranchId) return all[0] || null;
    return all.find(v => v.storeBranchId === currentBranchId) || null;
  }

  getAllIntegrations(): any[] {
    return this.get<any[]>('hd_system_integrations', []);
  }

  saveIntegration(config: any) {
    config.id = StorageService.ensureUuid(config.id);
    config.organizationId = this.getCurrentOrgId();
    
    const all = this.get<any[]>('hd_system_integrations', []);
    const idx = all.findIndex(v => v.storeBranchId === config.storeBranchId);
    if (idx >= 0) {
      config.id = all[idx].id; // Preserve existing ID
      all[idx] = { ...all[idx], ...config };
    } else {
      all.push(config);
    }
    
    this.set('hd_system_integrations', all);
    this.notify();
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
    if (found) return found.id;
    // Janela de boot: getBranches() ainda vazio (hidratação do cloud em
    // andamento) fazia este método retornar '' e TODAS as escritas iam com
    // store_branch_id vazio ("invalid input syntax for type uuid: ''").
    // Se o valor salvo já é um UUID válido (definido pelo seletor de filial
    // ou pelo login), confia nele até as branches chegarem do cloud.
    // Não afeta o caso do superadmin trocando de org: aí getBranches() tem
    // linhas e a validação continua rejeitando UUID de outra organização.
    if (branches.length === 0 && this.isValidUuid(savedId)) return savedId;
    return '';
  }

  /**
   * Retorna o branch ID salvo no localStorage SEM validação.
   * Usado no runHydration() ANTES das branches serem carregadas do cloud.
   * getSelectedBranchId() valida contra getBranches() que pode estar vazio
   * antes da hidratação — causando "branch: ALL" mesmo com filial selecionada.
   */
  getRawBranchId(): string {
    return localStorage.getItem('hd_system_selected_branch_id') || '';
  }

  setSelectedBranchId(id: string) {
    localStorage.setItem('hd_system_selected_branch_id', id);
    this.notify();
  }

  /**
   * Resolve short code (e.g. "br-01") to UUID.
   * Used when switching branches to ensure cloud queries use the correct UUID.
   */
  resolveBranchId(branchId: string): string | undefined {
    if (!branchId) return undefined;
    if (StorageService.UUID_RE.test(branchId)) return branchId;
    const branches = this.getBranches();
    const matched = branches.find((b) => b.id === branchId || b.code === branchId);
    return matched ? matched.id : undefined;
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
    // Ensure organizationId and storeBranchId are always persisted
    // so that getCurrentOrgId() can read them and avoid DEFAULT_ORG_ID fallback,
    // which would cause 401 Unauthorized errors on API calls.
    const updatedUser = {
      ...user,
      organizationId: user.organizationId || DEFAULT_ORG_ID,
      storeBranchId: user.storeBranchId || undefined,
    };
    // Monitor: log when organizationId falls back to DEFAULT_ORG_ID
    if (user.organizationId !== updatedUser.organizationId) {
      console.warn('[Storage] saveUserProfile: organizationId fell back to DEFAULT_ORG_ID',
        { original: user.organizationId, applied: updatedUser.organizationId });
    }
    if (user.storeBranchId !== updatedUser.storeBranchId) {
      console.warn('[Storage] saveUserProfile: storeBranchId was undefined, applying fallback');
    }
    this.set(KEYS.USER, updatedUser);
    localStorage.setItem(KEYS.LOGGED_IN_EMAIL, user.email);
    this.notify();
  }

  /**
   * Guarda a senha digitada no login online (Supabase) como senha LOCAL do
   * usuário, permitindo o login offline com as mesmas credenciais após o
   * primeiro login com internet. Senhas só existem neste dispositivo
   * (localStorage) — o Supabase nunca as armazena; por isso o merge do
   * Realtime (applyRemoteUserUpdate) preserva a senha local.
   */
  /**
   * Gera hash SHA-256 de uma senha para armazenamento seguro no localStorage.
   * Usa Web Crypto API (disponível em todos browsers modernos).
   */
  static async hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + 'hd-system-salt-v1'); // salt fixo para rainbow table
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  setLocalPassword(user: UserProfile, password: string) {
    // Hash da senha antes de salvar no localStorage (nunca plaintext)
    StorageService.hashPassword(password).then((hashedPassword) => {
      const users = this.get<UserProfile[]>(KEYS.USERS_LIST, []);
      const idx = users.findIndex(
        (u) => (u.email || '').toLowerCase() === (user.email || '').toLowerCase(),
      );
      const entry = { ...user, password: hashedPassword };
      if (idx >= 0) {
        // Preserva campos locais que não vêm do perfil (ex.: superadmin local)
        users[idx] = { ...users[idx], ...entry, password: hashedPassword };
      } else {
        users.unshift(entry);
      }
      this.set(KEYS.USERS_LIST, users);

      // Mantém o perfil ativo (KEYS.USER) consistente com a senha recém-capturada
      const activeEmail = localStorage.getItem(KEYS.LOGGED_IN_EMAIL);
      if (activeEmail && activeEmail.toLowerCase() === (user.email || '').toLowerCase()) {
        const current = this.get<UserProfile | null>(KEYS.USER, null);
        if (current) this.saveUserProfile({ ...current, password: hashedPassword });
      }
    });
  }

  async loginWithGoogle(email: string, password?: string): Promise<{ success: boolean; user?: UserProfile; message?: string }> {
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
    if (user.password && password) {
      const inputHash = await StorageService.hashPassword(password);
      // Comparar hash vs hash (senhas armazenadas agora são hashes)
      // Fallback: compatibilidade com senhas em plaintext de versões anteriores
      if (inputHash !== user.password && password !== user.password) {
        return {
          success: false,
          message: 'Senha incorreta. Tente novamente.',
        };
      }
      // Se a senha em plaintext ainda estava armazenada, re-hash para segurança
      if (password === user.password && inputHash !== user.password) {
        this.setLocalPassword(user, password);
      }
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

        // Salvar dados do administrador atual antes de resetar
        const currentUser = this.getUserProfile();
        const currentEmail = localStorage.getItem(KEYS.LOGGED_IN_EMAIL);

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

        // Restaurar apenas o administrador que clicou no botão
        if (currentUser && currentUser.role === 'admin') {
          this.saveUserProfile(currentUser);
          if (currentEmail) {
            localStorage.setItem(KEYS.LOGGED_IN_EMAIL, currentEmail);
          }
        }

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




