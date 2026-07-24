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
import { storageService } from './services/storageService';
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
  const [darkMode, setDarkMode] = useState<boolean>(true);
  const [isCaixaModalOpen, setIsCaixaModalOpen] = useState<boolean>(false);

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
  const [user, setUser] = useState<UserProfile>(storageService.getUserProfile());

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
      setUser(storageService.getUserProfile());
    };

    refreshState();
    const unsubscribe = storageService.subscribe(refreshState);
    return () => unsubscribe();
  }, []);

  // Sync dark mode class on document element
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  return (
    <div className={`min-h-screen font-sans bg-slate-100 dark:bg-[#09090b] text-slate-900 dark:text-[#fafafa] flex flex-col md:flex-row transition-colors duration-200`}>
      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={activeTab}
        setCurrentTab={setActiveTab}
        branches={branches}
        currentBranch={branches[0] || { id: 'b1', name: 'Matriz São Paulo', code: 'SP-01', city: 'São Paulo', state: 'SP', address: 'Av. Paulista, 1000', phone: '(11) 3000-0000', isHeadquarters: true }}
        onSelectBranch={() => {}}
        user={user}
        caixaSession={caixaSession}
        onOpenCaixaModal={() => setIsCaixaModalOpen(true)}
        onResetDemo={() => storageService.resetDemoData()}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden bg-slate-50 dark:bg-[#09090b]">
        {/* Header Bar */}
        <Header
          onToggleMobileMenu={() => {}}
          currentTab={activeTab}
          setCurrentTab={setActiveTab}
          products={products}
          caixaSession={caixaSession}
          onOpenCaixaModal={() => setIsCaixaModalOpen(true)}
          soundEnabled={true}
          setSoundEnabled={() => {}}
          darkMode={darkMode}
          setDarkMode={setDarkMode}
        />

        {/* Dynamic Main View Area */}
        <main className="flex-1 overflow-y-auto">
          {activeTab === 'pdv' && (
            <PDVView
              products={products}
              categories={categories}
              customers={customers}
              caixaSession={caixaSession}
              onOpenCaixaModal={() => setIsCaixaModalOpen(true)}
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
            <SettingsView settings={settings} branches={branches} />
          )}
        </main>

        {/* Footer Info Bar (Sophisticated Dark theme) */}
        <footer className="h-9 bg-white dark:bg-[#09090b] border-t border-slate-200 dark:border-[#27272a] px-6 flex items-center justify-between text-[10px] text-slate-500 dark:text-[#52525b] uppercase tracking-widest font-bold select-none shrink-0">
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Status: Operacional
            </span>
            <span className="hidden sm:inline">Latência DB: 12ms</span>
            <span className="hidden md:inline">Tenant: nexus-erp-matriz</span>
          </div>
          <div>
            &copy; 2026 NEXUS ERP PDV
          </div>
        </footer>
      </div>

      {/* Cash Register (Caixa) Modal */}
      <CaixaModal
        isOpen={isCaixaModalOpen}
        onClose={() => setIsCaixaModalOpen(false)}
        session={caixaSession}
        user={user}
      />
    </div>
  );
};

export default App;
