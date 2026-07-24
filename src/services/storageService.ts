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

  saveCategory(category: Category) {
    const categories = this.getCategories();
    const idx = categories.findIndex((c) => c.id === category.id);
    if (idx >= 0) {
      categories[idx] = category;
    } else {
      categories.push(category);
    }
    this.set(KEYS.CATEGORIES, categories);
  }

  deleteCategory(id: string) {
    const categories = this.getCategories().filter((c) => c.id !== id);
    this.set(KEYS.CATEGORIES, categories);
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
  }

  deleteBranch(id: string) {
    const branches = this.getBranches().filter((b) => b.id !== id);
    this.set(KEYS.BRANCHES, branches);
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

    // If active logged in user updated, refresh profile
    const activeEmail = localStorage.getItem(KEYS.LOGGED_IN_EMAIL);
    if (activeEmail && activeEmail.toLowerCase() === user.email.toLowerCase()) {
      this.saveUserProfile(user);
    }
  }

  deleteUser(id: string) {
    const users = this.getUsers().filter((u) => u.id !== id);
    this.set(KEYS.USERS_LIST, users);
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
