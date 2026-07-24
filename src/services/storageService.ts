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
  INITIAL_SETTINGS,
} from '../data/mockData';

const KEYS = {
  PRODUCTS: 'nexus_erp_products',
  CATEGORIES: 'nexus_erp_categories',
  CUSTOMERS: 'nexus_erp_customers',
  SUPPLIERS: 'nexus_erp_suppliers',
  SALES: 'nexus_erp_sales',
  CAIXA: 'nexus_erp_caixa_session',
  CAIXA_HISTORY: 'nexus_erp_caixa_history',
  FINANCIAL: 'nexus_erp_financial_accounts',
  MOVEMENTS: 'nexus_erp_stock_movements',
  BRANCHES: 'nexus_erp_branches',
  USER: 'nexus_erp_user_profile',
  SETTINGS: 'nexus_erp_settings',
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
    return product;
  }

  deleteProduct(id: string) {
    const products = this.getProducts().filter((p) => p.id !== id);
    this.set(KEYS.PRODUCTS, products);
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
  }

  // --- SALES & PDV ---
  getSales(): Sale[] {
    return this.get<Sale[]>(KEYS.SALES, INITIAL_SALES);
  }

  addSale(sale: Sale) {
    const sales = this.getSales();
    sales.unshift(sale);
    this.set(KEYS.SALES, sales);

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
  }

  // --- BRANCHES & USER ---
  getBranches(): StoreBranch[] {
    return this.get<StoreBranch[]>(KEYS.BRANCHES, INITIAL_BRANCHES);
  }

  getUserProfile(): UserProfile {
    return this.get<UserProfile>(KEYS.USER, INITIAL_USER);
  }

  saveUserProfile(user: UserProfile) {
    this.set(KEYS.USER, user);
  }

  // --- SETTINGS ---
  getSettings(): SystemSettings {
    return this.get<SystemSettings>(KEYS.SETTINGS, INITIAL_SETTINGS);
  }

  saveSettings(settings: SystemSettings) {
    this.set(KEYS.SETTINGS, settings);
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
    localStorage.removeItem(KEYS.SETTINGS);
    this.notify();
  }
}

export const storageService = new StorageService();
