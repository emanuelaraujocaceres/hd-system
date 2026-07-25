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
} from '../data/mockData';
import { syncService } from './syncService';
import { supabase } from '../lib/supabase';

const KEYS = {
  PRODUCTS: 'hd_system_products',
  CATEGORIES: 'hd_system_categories',
  CUSTOMERS: 'hd_system_customers',
  SUPPLIERS: 'hd_system_suppliers',
  SALES: 'hd_system_sales',
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
};

class StorageService {
  private listeners: Set<() => void> = new Set();

  public subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }

  // ─── SUPABASE SYNC HELPERS ────────────────────────────────────────
  // Fire-and-forget sync to Supabase. localStorage is always the source of truth locally.
  // When Supabase Realtime delivers remote changes, they update localStorage via syncRemoteToLocal().

  private syncProduct(p: Product) {
    syncService.upsertRow('products', {
      id: p.id,
      organization_id: '00000000-0000-0000-0000-000000000001',
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
    });
  }

  private syncCategory(c: Category) {
    syncService.upsertRow('categories', {
      id: c.id,
      organization_id: '00000000-0000-0000-0000-000000000001',
      name: c.name,
      color: c.color || '#6366f1',
      store_branch_id: (c as any).storeBranchId || null,
    });
  }

  private syncCustomer(c: Customer) {
    syncService.upsertRow('customers', {
      id: c.id,
      organization_id: '00000000-0000-0000-0000-000000000001',
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
      organization_id: '00000000-0000-0000-0000-000000000001',
      corporate_name: s.companyName,
      trade_name: s.tradeName,
      cnpj: s.cnpj,
      contact_person: s.contactName,
      email: s.email,
      phone: s.phone,
      store_branch_id: (s as any).storeBranchId || null,
    });
  }

  private syncSale(s: Sale) {
    syncService.upsertRow('sales', {
      id: s.id,
      organization_id: '00000000-0000-0000-0000-000000000001',
      store_branch_id: s.storeBranchId,
      user_id: s.operatorId,
      customer_id: s.customerId || null,
      code: s.code,
      subtotal: s.subtotal,
      discount: s.discount,
      total: s.total,
      payment_method: s.payments[0]?.method || 'cash',
      status: s.status,
      notes: s.customerName || null,
    });
    // Also sync sale items
    if (s.items && s.items.length > 0) {
      const items = s.items.map((item) => ({
        id: `${s.id}-${item.productId}`,
        sale_id: s.id,
        product_id: item.productId,
        product_name: item.productName || '',
        quantity: item.quantity,
        unit_price: item.unitPrice,
        total_price: item.total,
      }));
      syncService.upsertRows('sale_items', items);
    }
  }

  private syncBranch(b: StoreBranch) {
    syncService.upsertRow('store_branches', {
      id: b.id,
      organization_id: '00000000-0000-0000-0000-000000000001',
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
      organization_id: '00000000-0000-0000-0000-000000000001',
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
      organization_id: '00000000-0000-0000-0000-000000000001',
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
      organization_id: '00000000-0000-0000-0000-000000000001',
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
      organization_id: '00000000-0000-0000-0000-000000000001',
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
      id: '00000000-0000-0000-0000-000000000001',
      organization_id: '00000000-0000-0000-0000-000000000001',
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
      sku: row.sku || '',
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
    };
    const idx = products.findIndex((p) => p.id === mapped.id);
    if (idx >= 0) products[idx] = mapped;
    else products.unshift(mapped);
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
      operatorName: existing?.operatorName || 'Sistema',
      customerId: row.customer_id || undefined,
      customerName: row.notes || undefined,
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

  updateUserFromRemote(row: any) {
    const users = this.getUsers();
    const mapped: UserProfile = {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role || 'collaborator',
      organizationId: '00000000-0000-0000-0000-000000000001',
      storeBranchId: row.store_branch_id || '',
      permissions: row.permissions || { pdv: true, inventory: true, crm: true, finance: true, dashboard: true, settings: true },
      active: row.active !== false,
      avatarUrl: row.avatar_url || undefined,
    };
    const idx = users.findIndex((u) => u.id === mapped.id);
    if (idx >= 0) users[idx] = mapped;
    else users.unshift(mapped);
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

      // Only overwrite localStorage if Supabase has data
      if (products.length > 0) {
        const mapped = products.map((r: any) => ({
          id: r.id,
          sku: r.sku || '',
          barcode: r.barcode || '',
          name: r.name,
          category: r.category || 'Geral',
          unit: r.unit || 'un',
          costPrice: parseFloat(r.cost_price) || 0,
          salePrice: parseFloat(r.sale_price) || 0,
          currentStock: parseInt(r.stock_quantity) || 0,
          minStock: parseInt(r.min_stock_quantity) || 5,
          maxStock: 100,
          imageUrl: r.image_url || '',
          active: r.is_active !== false,
          updatedAt: r.updated_at || new Date().toISOString(),
          storeBranchId: r.store_branch_id || undefined,
        }));
        this.set(KEYS.PRODUCTS, mapped);
      }

      if (categories.length > 0) {
        const mapped = categories.map((r: any) => ({ id: r.id, name: r.name, color: r.color || '#6366f1' }));
        this.set(KEYS.CATEGORIES, mapped);
      }

      if (customers.length > 0) {
        const mapped = customers.map((r: any) => ({
          id: r.id, name: r.name, cpfCnpj: r.cpf_cnpj || '', email: r.email || '', phone: r.phone || '',
          creditLimit: parseFloat(r.credit_limit) || 0, currentBalance: 0, loyaltyPoints: 0,
          city: '', state: '', createdAt: r.created_at || new Date().toISOString(),
        }));
        this.set(KEYS.CUSTOMERS, mapped);
      }

      if (suppliers.length > 0) {
        const mapped = suppliers.map((r: any) => ({
          id: r.id, companyName: r.corporate_name || '', tradeName: r.trade_name || '',
          cnpj: r.cnpj || '', contactName: r.contact_person || '', email: r.email || '', phone: r.phone || '',
        }));
        this.set(KEYS.SUPPLIERS, mapped);
      }

      if (sales.length > 0) {
        // Group sale_items by sale_id
        const itemsBySaleId: Record<string, any[]> = {};
        if (saleItems && saleItems.length > 0) {
          for (const item of saleItems) {
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

        const mapped = sales.map((r: any) => {
          const saleItems = itemsBySaleId[r.id] || [];
          return {
            id: r.id, code: r.code, date: r.created_at || new Date().toISOString(),
            operatorId: r.user_id || '', operatorName: 'Sistema',
            customerId: r.customer_id || undefined, customerName: r.notes || undefined,
            storeBranchId: r.store_branch_id || '',
            items: saleItems,
            subtotal: parseFloat(r.subtotal) || 0, discount: parseFloat(r.discount) || 0,
            total: parseFloat(r.total) || 0,
            payments: [{ method: r.payment_method || 'cash', amount: parseFloat(r.total) || 0 }],
            status: r.status || 'completed',
          };
        });
        this.set(KEYS.SALES, mapped);
      }

      if (branches.length > 0) {
        const mapped = branches.map((r: any) => ({
          id: r.id, name: r.name, code: r.code, cnpj: r.cnpj || '',
          city: r.city || '', state: r.state || '', address: r.address || '',
          phone: r.phone || '', isHeadquarters: r.is_headquarters || false,
          active: r.active !== false,
        }));
        this.set(KEYS.BRANCHES, mapped);
      }

      if (financial.length > 0) {
        const mapped = financial.map((r: any) => ({
          id: r.id, title: r.description, type: r.type, category: r.category,
          amount: parseFloat(r.amount) || 0, dueDate: r.due_date,
          paidDate: r.payment_date || undefined, status: r.status,
          recipientOrPayer: r.notes || '', storeBranchId: r.store_branch_id || undefined,
        }));
        this.set(KEYS.FINANCIAL, mapped);
      }

      if (users.length > 0) {
        const mapped = users.map((r: any) => ({
          id: r.id, name: r.name, email: r.email, role: r.role || 'collaborator',
          organizationId: '00000000-0000-0000-0000-000000000001',
          storeBranchId: r.store_branch_id || '',
          permissions: r.permissions || { pdv: true, inventory: true, crm: true, finance: true, dashboard: true, settings: true },
          active: r.active !== false, avatarUrl: r.avatar_url || undefined,
        }));
        this.set(KEYS.USERS_LIST, mapped);
      }

      if (movements.length > 0) {
        const mapped = movements.map((r: any) => ({
          id: r.id, productId: r.product_id, productName: r.product_name || '',
          type: r.type, quantity: r.quantity, previousStock: r.previous_stock || 0,
          newStock: r.new_stock || 0, reason: r.reason || '',
          date: r.created_at || new Date().toISOString(),
          operatorName: r.operator_name || '', storeBranchId: r.store_branch_id || undefined,
        }));
        this.set(KEYS.MOVEMENTS, mapped);
      }

      // Caixa session — cash_sessions can have multiple rows, pick the most relevant one
      if (caixa.length > 0) {
        let filtered = caixa;
        if (branchId) {
          filtered = caixa.filter((r: any) => r.store_branch_id === branchId);
        }
        if (filtered.length === 0) {
          filtered = caixa; // Fallback to any available session
        }
        // Sort: open sessions first, then by opened_at descending
        const sorted = [...filtered].sort((a: any, b: any) => {
          if (a.status === 'open' && b.status !== 'open') return -1;
          if (a.status !== 'open' && b.status === 'open') return 1;
          return new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime();
        });
        const s = sorted[0];
        this.set(KEYS.CAIXA, {
          id: s.id,
          openedAt: s.opened_at,
          closedAt: s.closed_at || undefined,
          operatorId: s.user_id || '',
          operatorName: s.operator_name || '',
          initialCash: parseFloat(s.opening_balance) || 0,
          currentCashBalance: parseFloat(s.expected_balance) || 0,
          totalSalesCash: parseFloat(s.total_sales_cash) || 0,
          totalSalesPix: parseFloat(s.total_sales_pix) || 0,
          totalSalesCard: parseFloat(s.total_sales_card) || 0,
          totalSalesCreditAccount: parseFloat(s.total_sales_credit_account) || 0,
          suprimentos: parseFloat(s.suprimentos) || 0,
          sangrias: parseFloat(s.sangrias) || 0,
          status: s.status,
          notes: s.notes || undefined,
          storeBranchId: s.store_branch_id || undefined,
        });
      }

      // Settings is a single JSONB row
      if (settings.length > 0 && settings[0].settings) {
        this.set(KEYS.SETTINGS, settings[0].settings);
      }

      console.log('[HD-Sync] Cloud hydration complete');

      // ─── SYNC LOCAL DATA TO CLOUD IF CLOUD WAS EMPTY ──────────
      // If Supabase returned no data for a table but we have local data,
      // push it up so the cloud is populated.
      const localProducts = this.getProducts();
      if (products.length === 0 && localProducts.length > 0) {
        console.log(`[HD-Sync] ☁️→☁️ Syncing ${localProducts.length} local products to cloud...`);
        localProducts.forEach((p) => this.syncProduct(p));
      }

      if (categories.length === 0 && this.getCategories().length > 0) {
        console.log(`[HD-Sync] ☁️→☁️ Syncing ${this.getCategories().length} local categories to cloud...`);
        this.getCategories().forEach((c) => this.syncCategory(c));
      }

      if (customers.length === 0 && this.getCustomers().length > 0) {
        console.log(`[HD-Sync] ☁️→☁️ Syncing ${this.getCustomers().length} local customers to cloud...`);
        this.getCustomers().forEach((c) => this.syncCustomer(c));
      }

      if (suppliers.length === 0 && this.getSuppliers().length > 0) {
        console.log(`[HD-Sync] ☁️→☁️ Syncing ${this.getSuppliers().length} local suppliers to cloud...`);
        this.getSuppliers().forEach((s) => this.syncSupplier(s));
      }

      if (sales.length === 0 && this.getSales().length > 0) {
        console.log(`[HD-Sync] ☁️→☁️ Syncing ${this.getSales().length} local sales to cloud...`);
        this.getSales().forEach((s) => this.syncSale(s));
      }

      if (branches.length === 0 && this.getBranches().length > 0) {
        console.log(`[HD-Sync] ☁️→☁️ Syncing ${this.getBranches().length} local branches to cloud...`);
        this.getBranches().forEach((b) => this.syncBranch(b));
      }

      if (financial.length === 0 && this.getFinancialAccounts().length > 0) {
        console.log(`[HD-Sync] ☁️→☁️ Syncing ${this.getFinancialAccounts().length} local financial accounts to cloud...`);
        this.getFinancialAccounts().forEach((a) => this.syncFinancialAccount(a));
      }

      if (users.length === 0 && this.getUsers().length > 0) {
        console.log(`[HD-Sync] ☁️→☁️ Syncing ${this.getUsers().length} local users to cloud...`);
        this.getUsers().forEach((u) => this.syncSystemUser(u));
      }

      if (movements.length === 0 && this.getMovements().length > 0) {
        console.log(`[HD-Sync] ☁️→☁️ Syncing ${this.getMovements().length} local stock movements to cloud...`);
        this.getMovements().forEach((m) => this.syncStockMovement(m));
      }

      // Caixa session: only sync if we have an open session locally but none in cloud
      if (caixa.length === 0) {
        const localCaixa = this.getActiveCaixaSession();
        if (localCaixa && localCaixa.status === 'open') {
          console.log(`[HD-Sync] ☁️→☁️ Syncing active cash session to cloud...`);
          this.syncCaixaSession(localCaixa);
        }
      }

      // Settings: sync local settings if cloud table is empty
      if (settings.length === 0) {
        const localSettings = this.getSettings();
        console.log(`[HD-Sync] ☁️→☁️ Syncing local settings to cloud...`);
        this.syncSettings(localSettings);
      }

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
    return this.get<Product[]>(KEYS.PRODUCTS, INITIAL_PRODUCTS);
  }

  saveProduct(product: Product): Product {
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
    const products = this.getProducts().filter((p) => p.id !== id);
    this.set(KEYS.PRODUCTS, products);
    syncService.deleteRow('products', id);
  }

  deleteSale(id: string) {
    const sales = this.getSales().filter((s) => s.id !== id);
    this.set(KEYS.SALES, sales);
    syncService.deleteRow('sales', id);
  }

  updateStock(productId: string, quantityDelta: number, reason: string, operatorName: string) {
    const products = this.getProducts();
    const prod = products.find((p) => p.id === productId);
    if (prod) {
      const prevStock = prod.currentStock;
      prod.currentStock = Math.max(0, prod.currentStock + quantityDelta);
      prod.updatedAt = new Date().toISOString();
      this.set(KEYS.PRODUCTS, products);

      // Log stock movement
      const movements = this.getMovements();
      const newMov: StockMovement = {
        id: `mov-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
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
    }
  }

  // --- MOVEMENTS ---
  getMovements(): StockMovement[] {
    return this.get<StockMovement[]>(KEYS.MOVEMENTS, []);
  }

  // --- CATEGORIES ---
  getCategories(): Category[] {
    return this.get<Category[]>(KEYS.CATEGORIES, INITIAL_CATEGORIES);
  }

  saveCategory(category: Category) {
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
    return this.get<Customer[]>(KEYS.CUSTOMERS, INITIAL_CUSTOMERS);
  }

  saveCustomer(customer: Customer) {
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
    return this.get<Supplier[]>(KEYS.SUPPLIERS, INITIAL_SUPPLIERS);
  }

  saveSupplier(supplier: Supplier) {
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
    return this.get<Sale[]>(KEYS.SALES, INITIAL_SALES);
  }

  addSale(sale: Sale) {
    const sales = this.getSales();
    sales.unshift(sale);
    this.set(KEYS.SALES, sales);
    this.syncSale(sale);

    // Deduces stock automatically
    sale.items.forEach((item) => {
      this.updateStock(item.productId, -item.quantity, `Venda PDV #${sale.code}`, sale.operatorName);
    });

    // Updates active cash register balance
    const session = this.getActiveCaixaSession();
    if (session && session.status === 'open') {
      sale.payments.forEach((p) => {
        if (p.method === 'cash') session.totalSalesCash += p.amount;
        else if (p.method === 'pix') session.totalSalesPix += p.amount;
        else if (p.method === 'credit_card' || p.method === 'debit_card') session.totalSalesCard += p.amount;
        else if (p.method === 'credit_account') session.totalSalesCreditAccount += p.amount;
      });

      // Recalculate cash in drawer
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
    this.set(KEYS.CAIXA, session);
    this.syncCaixaSession(session);
  }

  closeCaixaSession(notes?: string) {
    const session = this.getActiveCaixaSession();
    if (session) {
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
      id: `cx-${Date.now()}`,
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
    return this.get<FinancialAccount[]>(KEYS.FINANCIAL, INITIAL_FINANCIAL_ACCOUNTS);
  }

  saveFinancialAccount(acc: FinancialAccount) {
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
    return this.get<StoreBranch[]>(KEYS.BRANCHES, INITIAL_BRANCHES);
  }

  saveBranch(branch: StoreBranch) {
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
    return branches[0] || { id: 'br-01', name: 'HD-System Matriz São Paulo', code: 'SP-01', cnpj: '12.345.678/0001-90', city: 'São Paulo', state: 'SP', address: 'Av. Paulista, 1000', phone: '(11) 3000-0000', isHeadquarters: true, active: true };
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
    return this.get<UserProfile[]>(KEYS.USERS_LIST, INITIAL_USERS);
  }

  saveUser(user: UserProfile) {
    const users = this.getUsers();
    const idx = users.findIndex((u) => u.id === user.id || u.email.toLowerCase() === user.email.toLowerCase());
    if (idx >= 0) {
      users[idx] = { ...users[idx], ...user };
    } else {
      users.unshift(user);
    }
    this.set(KEYS.USERS_LIST, users);
    this.syncSystemUser(user);

    // If active logged in user updated, refresh profile
    const activeEmail = localStorage.getItem(KEYS.LOGGED_IN_EMAIL);
    if (activeEmail && activeEmail.toLowerCase() === user.email.toLowerCase()) {
      this.saveUserProfile(user);
    }
  }

  deleteUser(id: string) {
    const users = this.getUsers().filter((u) => u.id !== id);
    this.set(KEYS.USERS_LIST, users);
    syncService.deleteRow('system_users', id);
  }

  getUserByEmail(email: string): UserProfile | undefined {
    const users = this.getUsers();
    return users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
  }

  getUserProfile(): UserProfile | null {
    const activeEmail = localStorage.getItem(KEYS.LOGGED_IN_EMAIL);
    if (activeEmail === 'LOGGED_OUT') return null;

    if (activeEmail) {
      const found = this.getUserByEmail(activeEmail);
      if (found) return found;
    }
    
    // Default to initial user (Admin)
    return this.get<UserProfile>(KEYS.USER, INITIAL_USER);
  }

  saveUserProfile(user: UserProfile) {
    this.set(KEYS.USER, user);
    localStorage.setItem(KEYS.LOGGED_IN_EMAIL, user.email);
    this.notify();
  }

  loginWithGoogle(email: string): { success: boolean; user?: UserProfile; message?: string } {
    const user = this.getUserByEmail(email);
    if (!user) {
      return {
        success: false,
        message: `A conta do Google (${email}) não está cadastrada no sistema. Peça a um Administrador para adicionar este e-mail no painel de Usuários & Permissões.`,
      };
    }

    if (!user.active) {
      return {
        success: false,
        message: `A conta (${email}) está inativa no momento. Entre em contato com o Administrador.`,
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
    this.notify();
  }
}

export const storageService = new StorageService();
