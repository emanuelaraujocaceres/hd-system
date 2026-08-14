/**
 * BackupService - Sistema de Backup/Restore por filial
 * 
 * Funcionalidades:
 * - Criar backup manual de uma filial
 * - Restaurar backup de uma filial
 * - Backup automático semanal
 * - Isolamento por filial (dados não vazam)
 * - Sincronização em tempo real via Realtime
 */

import { storageService } from './storageService';
import { supabase } from '../lib/supabase';

export interface BackupData {
  products: any[];
  categories: any[];
  customers: any[];
  suppliers: any[];
  sales: any[];
  saleItems: any[];
  financialTransactions: any[];
  cashSessions: any[];
  stockMovements: any[];
  tables: any[];
  customerSessions: any[];
  moduleVisibility: any[];
  branchThemes: any[];
  systemSettings: any[];
  footerMessages: any[];
  mediaDevices: any[];
  printers: any[];
  recordCount: number;
}

export interface BackupRecord {
  id: string;
  organizationId: string;
  storeBranchId: string;
  backupName: string;
  dataSizeBytes: number;
  recordCount: number;
  createdAt: string;
  isAutomatic: boolean;
  restoredAt?: string;
}

class BackupServiceClass {
  private backupListeners: Set<(backups: BackupRecord[]) => void> = new Set();
  private autoBackupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.initAutoBackup();
    this.initRealtimeListener();
  }

  /**
   * Initialize automatic weekly backup
   */
  private initAutoBackup() {
    // Check if we need to run auto-backup (once per week)
    const lastAutoBackup = localStorage.getItem('hd_system_last_auto_backup');
    const now = Date.now();
    const oneWeek = 7 * 24 * 60 * 60 * 1000;

    if (!lastAutoBackup || now - parseInt(lastAutoBackup) > oneWeek) {
      // Schedule for next Sunday at 3 AM
      this.scheduleWeeklyBackup();
    }

    // Check every hour if it's time for backup
    this.autoBackupInterval = setInterval(() => {
      this.checkAndRunAutoBackup();
    }, 60 * 60 * 1000); // Every hour
  }

  /**
   * Schedule weekly backup for 3 AM Sunday
   */
  private scheduleWeeklyBackup() {
    const now = new Date();
    const nextSunday = new Date(now);
    nextSunday.setDate(now.getDate() + ((7 - now.getDay()) % 7));
    nextSunday.setHours(3, 0, 0, 0);

    const delay = nextSunday.getTime() - now.getTime();
    setTimeout(() => {
      this.runAutoBackupForAllFilials();
    }, delay);
  }

  /**
   * Check if it's time for auto-backup
   */
  private checkAndRunAutoBackup() {
    const now = new Date();
    // Run at 3 AM on Sunday
    if (now.getDay() === 0 && now.getHours() === 3) {
      const lastAutoBackup = localStorage.getItem('hd_system_last_auto_backup');
      const oneDay = 24 * 60 * 60 * 1000;
      if (!lastAutoBackup || now.getTime() - parseInt(lastAutoBackup) > oneDay) {
        this.runAutoBackupForAllFilials();
      }
    }
  }

  /**
   * Run auto-backup for all filials in current org
   */
  private async runAutoBackupForAllFilials() {
    const branches = storageService.getBranches();
    const orgId = storageService.getCurrentOrgId();

    for (const branch of branches) {
      if (branch.organizationId === orgId) {
        try {
          await this.createBackup(branch.id, `Backup Automático - ${new Date().toLocaleDateString('pt-BR')}`, true);
        } catch (e) {
          console.warn(`[Backup] Auto-backup failed for branch ${branch.name}:`, e);
        }
      }
    }

    localStorage.setItem('hd_system_last_auto_backup', Date.now().toString());
  }

  /**
   * Collect all data for a filial
   */
  private collectFilialData(branchId: string): BackupData {
    const allProducts = storageService.getProducts();
    const allCategories = storageService.getCategories();
    const allCustomers = storageService.getCustomers();
    const allSuppliers = storageService.getSuppliers();
    const allSales = storageService.getSales();
    const allSaleItems = storageService.getSaleItems();
    const allFinancial = storageService.getFinancialAccounts();
    const allCashSessions = storageService.getCaixaSessions ? storageService.getCaixaSessions() : [];
    const allStockMovements = storageService.getMovements();
    const allTables = storageService.getTables();
    const allCustomerSessions = storageService.getCustomerSessions();
    const allModuleVisibility = storageService.getAllModuleVisibility();
    const allBranchThemes = storageService.getAllBranchThemes();
    const allSettings = storageService.getAllSettings ? storageService.getAllSettings() : [];
    const allFooterMessages = storageService.getFooterMessages();
    const allMediaDevices = storageService.getMediaDevices();
    const allPrinters = storageService.getPrinters();

    // Filter by branch
    const filterByBranch = (items: any[]) =>
      items.filter((item) => !item.storeBranchId || item.storeBranchId === branchId);

    const data: BackupData = {
      products: filterByBranch(allProducts),
      categories: filterByBranch(allCategories),
      customers: filterByBranch(allCustomers),
      suppliers: filterByBranch(allSuppliers),
      sales: filterByBranch(allSales),
      saleItems: filterByBranch(allSaleItems),
      financialTransactions: filterByBranch(allFinancial),
      cashSessions: filterByBranch(allCashSessions),
      stockMovements: filterByBranch(allStockMovements),
      tables: filterByBranch(allTables),
      customerSessions: filterByBranch(allCustomerSessions),
      moduleVisibility: allModuleVisibility.filter((m) => m.storeBranchId === branchId),
      branchThemes: allBranchThemes.filter((t) => t.storeBranchId === branchId),
      systemSettings: allSettings.filter((s) => s.storeBranchId === branchId),
      footerMessages: allFooterMessages.filter((m) => m.storeBranchId === branchId),
      mediaDevices: allMediaDevices.filter((d) => d.storeBranchId === branchId),
      printers: allPrinters.filter((p) => !p.storeBranchId || p.storeBranchId === branchId),
      recordCount: 0,
    };

    // Count total records
    data.recordCount = Object.values(data).reduce((sum, arr) => {
      return Array.isArray(arr) ? sum + arr.length : sum;
    }, 0);

    return data;
  }

  /**
   * Create a backup for a filial
   */
  async createBackup(branchId: string, name: string, isAutomatic: false): Promise<string> {
    const orgId = storageService.getCurrentOrgId();
    const data = this.collectFilialData(branchId);
    const backupData = { ...data, exportedAt: new Date().toISOString() };

    // Save to Supabase via RPC
    const { data: result, error } = await supabase.rpc('create_filial_backup', {
      p_organization_id: orgId,
      p_store_branch_id: branchId,
      p_backup_name: name,
      p_backup_data: backupData,
      p_is_automatic: isAutomatic,
    });

    if (error) {
      console.error('[Backup] Failed to create backup:', error);
      throw error;
    }

    // Notify listeners
    this.notifyListeners();

    return result;
  }

  /**
   * Get all backups for a filial
   */
  async getBackups(branchId: string): Promise<BackupRecord[]> {
    const { data, error } = await supabase
      .from('filial_backups')
      .select('*')
      .eq('store_branch_id', branchId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('[Backup] Failed to get backups:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Restore a backup to a filial
   */
  async restoreBackup(backupId: string): Promise<boolean> {
    const { data: backup, error } = await supabase
      .from('filial_backups')
      .select('*')
      .eq('id', backupId)
      .single();

    if (error || !backup) {
      console.error('[Backup] Failed to get backup:', error);
      return false;
    }

    const backupData = backup.backup_data;

    try {
      // Restore each data type
      if (Array.isArray(backupData.products)) {
        this.restoreDataType('products', backupData.products, backup.store_branch_id);
      }
      if (Array.isArray(backupData.categories)) {
        this.restoreDataType('categories', backupData.categories, backup.store_branch_id);
      }
      if (Array.isArray(backupData.customers)) {
        this.restoreDataType('customers', backupData.customers, backup.store_branch_id);
      }
      if (Array.isArray(backupData.suppliers)) {
        this.restoreDataType('suppliers', backupData.suppliers, backup.store_branch_id);
      }
      if (Array.isArray(backupData.sales)) {
        this.restoreDataType('sales', backupData.sales, backup.store_branch_id);
      }
      if (Array.isArray(backupData.saleItems)) {
        this.restoreDataType('sale_items', backupData.saleItems, backup.store_branch_id);
      }
      if (Array.isArray(backupData.financialTransactions)) {
        this.restoreDataType('financial_transactions', backupData.financialTransactions, backup.store_branch_id);
      }
      if (Array.isArray(backupData.cashSessions)) {
        this.restoreDataType('cash_sessions', backupData.cashSessions, backup.store_branch_id);
      }
      if (Array.isArray(backupData.stockMovements)) {
        this.restoreDataType('stock_movements', backupData.stockMovements, backup.store_branch_id);
      }
      if (Array.isArray(backupData.tables)) {
        this.restoreDataType('tables', backupData.tables, backup.store_branch_id);
      }
      if (Array.isArray(backupData.moduleVisibility)) {
        this.restoreDataType('module_visibility', backupData.moduleVisibility, backup.store_branch_id);
      }
      if (Array.isArray(backupData.branchThemes)) {
        this.restoreDataType('branch_themes', backupData.branchThemes, backup.store_branch_id);
      }
      if (Array.isArray(backupData.footerMessages)) {
        this.restoreDataType('footer_messages', backupData.footerMessages, backup.store_branch_id);
      }
      if (Array.isArray(backupData.mediaDevices)) {
        this.restoreDataType('media_devices', backupData.mediaDevices, backup.store_branch_id);
      }
      if (Array.isArray(backupData.printers)) {
        this.restoreDataType('printers', backupData.printers, backup.store_branch_id);
      }

      // Mark backup as restored
      await supabase
        .from('filial_backups')
        .update({
          restored_at: new Date().toISOString(),
          restored_by: supabase.auth.getUser()?.data?.user?.id,
        })
        .eq('id', backupId);

      // Notify listeners
      this.notifyListeners();

      return true;
    } catch (err) {
      console.error('[Backup] Restore failed:', err);
      return false;
    }
  }

  /**
   * Restore a specific data type
   */
  private restoreDataType(tableName: string, newData: any[], branchId: string) {
    // Get existing data
    const existing = this.getDataByType(tableName);
    
    // Remove old data for this branch
    const filtered = existing.filter((item: any) => !item.storeBranchId || item.storeBranchId !== branchId);
    
    // Merge with new data
    const merged = [...filtered, ...newData];

    // Save back
    this.saveDataByType(tableName, merged);
  }

  /**
   * Get data by type name
   */
  private getDataByType(type: string): any[] {
    switch (type) {
      case 'products': return storageService.getProducts();
      case 'categories': return storageService.getCategories();
      case 'customers': return storageService.getCustomers();
      case 'suppliers': return storageService.getSuppliers();
      case 'sales': return storageService.getSales();
      case 'sale_items': return storageService.getSaleItems();
      case 'financial_transactions': return storageService.getFinancialAccounts();
      case 'cash_sessions': return [];
      case 'stock_movements': return storageService.getMovements();
      case 'tables': return storageService.getTables();
      case 'customer_sessions': return storageService.getCustomerSessions();
      case 'module_visibility': return storageService.getAllModuleVisibility();
      case 'branch_themes': return storageService.getAllBranchThemes();
      case 'footer_messages': return storageService.getFooterMessages();
      case 'media_devices': return storageService.getMediaDevices();
      case 'printers': return storageService.getPrinters();
      default: return [];
    }
  }

  /**
   * Save data by type name
   */
  private saveDataByType(type: string, data: any[]) {
    switch (type) {
      case 'products':
        localStorage.setItem('hd_system_products', JSON.stringify(data));
        break;
      case 'categories':
        localStorage.setItem('hd_system_categories', JSON.stringify(data));
        break;
      case 'customers':
        localStorage.setItem('hd_system_customers', JSON.stringify(data));
        break;
      case 'suppliers':
        localStorage.setItem('hd_system_suppliers', JSON.stringify(data));
        break;
      case 'sales':
        localStorage.setItem('hd_system_sales', JSON.stringify(data));
        break;
      case 'sale_items':
        localStorage.setItem('hd_system_sale_items', JSON.stringify(data));
        break;
      case 'financial_transactions':
        localStorage.setItem('hd_system_financial', JSON.stringify(data));
        break;
      case 'stock_movements':
        localStorage.setItem('hd_system_movements', JSON.stringify(data));
        break;
      case 'tables':
        localStorage.setItem('hd_system_tables', JSON.stringify(data));
        break;
      case 'customer_sessions':
        localStorage.setItem('hd_system_customer_sessions', JSON.stringify(data));
        break;
      case 'module_visibility':
        localStorage.setItem('hd_system_module_visibility', JSON.stringify(data));
        break;
      case 'branch_themes':
        localStorage.setItem('hd_system_branch_themes', JSON.stringify(data));
        break;
      case 'footer_messages':
        localStorage.setItem('hd_system_footer_messages', JSON.stringify(data));
        break;
      case 'media_devices':
        localStorage.setItem('hd_system_media_devices', JSON.stringify(data));
        break;
      case 'printers':
        localStorage.setItem('hd_system_printers', JSON.stringify(data));
        break;
    }
    storageService.notify();
  }

  /**
   * Initialize Realtime listener for cross-device sync
   */
  private initRealtimeListener() {
    const branchId = storageService.getSelectedBranchId();
    supabase
      .channel('filial_backups_realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'filial_backups',
          ...(branchId ? { filter: `store_branch_id=eq.${branchId}` } : {}),
        },
        () => {
          this.notifyListeners();
        }
      )
      .subscribe();
  }

  /**
   * Subscribe to backup changes
   */
  subscribe(listener: (backups: BackupRecord[]) => void) {
    this.backupListeners.add(listener);
    return () => this.backupListeners.delete(listener);
  }

  /**
   * Notify all listeners
   */
  private async notifyListeners() {
    const branchId = storageService.getSelectedBranchId();
    for (const listener of this.backupListeners) {
      try {
        // Isolamento estrito por filial: só busca backups da filial selecionada.
        // Superadmin em modo global (sem filial) vê todos (RLS por org).
        let query = supabase
          .from('filial_backups')
          .select('*')
          .order('created_at', { ascending: false });
        if (branchId) query = query.eq('store_branch_id', branchId);
        const { data } = await query;
        listener(data || []);
      } catch {
        // Ignore errors
      }
    }
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.autoBackupInterval) {
      clearInterval(this.autoBackupInterval);
    }
  }
}

export const backupService = new BackupServiceClass();
