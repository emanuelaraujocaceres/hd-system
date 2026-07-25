/**
 * Sync Diagnostic Tool
 * =====================
 * Ferramenta de diagnóstico para verificar a integridade do sync em todas as tabelas.
 * 
 * Como usar no console do navegador (F12):
 *   1. Importe: import { syncDiagnostic } from './services/syncDiagnostic';
 *   2. Execute: await syncDiagnostic.runAll()
 * 
 * Ou cole no console:
 *   const script = document.createElement('script');
 *   script.src = '/src/services/syncDiagnostic.ts';
 *   document.head.appendChild(script);
 * 
 * Para uso direto no console (após o app carregar):
 *   (await import('./services/syncDiagnostic')).syncDiagnostic.runAll()
 */

import { storageService } from './storageService';
import { syncService } from './syncService';
import { supabase } from '../lib/supabase';

type TableTestResult = {
  table: string;
  localStorageKey: string;
  hasLocalData: boolean;
  hasSyncFunction: boolean;
  hasHydrateMapping: boolean;
  hasLocalToCloudSync: boolean;
  hasRealtimeHandler: boolean;
  hasUpdateHandler: boolean;
  hasDeleteHandler: boolean;
  supabaseRowCount: number;
  status: '✅ OK' | '⚠️ PARCIAL' | '❌ FALHA';
  notes: string;
};

type DiagnosticResults = {
  timestamp: string;
  online: boolean;
  supabaseReachable: boolean;
  tables: TableTestResult[];
  summary: {
    total: number;
    ok: number;
    partial: number;
    failed: number;
  };
};

class SyncDiagnostic {
  /**
   * Run ALL diagnostic tests and return a comprehensive report.
   * Paste in browser console:
   *   (await import('./services/syncDiagnostic')).syncDiagnostic.runAll()
   */
  async runAll(): Promise<DiagnosticResults> {
    console.log('%c🔍 HD-SYSTEM SYNC DIAGNOSTIC', 'font-size: 20px; font-weight: bold; color: #6366f1;');
    console.log('%cVerificando integridade do sync em todas as tabelas...\n', 'font-size: 14px;');

    const supabaseReachable = await syncService.testConnection();

    const results: DiagnosticResults = {
      timestamp: new Date().toISOString(),
      online: navigator.onLine,
      supabaseReachable,
      tables: [],
      summary: { total: 0, ok: 0, partial: 0, failed: 0 },
    };

    // Define all tables to test
    const tables: {
      table: string;
      localStorageKey: string;
      hasSyncFn: boolean;
      hasHydrateMapping: boolean;
      hasLocalToCloud: boolean;
      hasRealtimeHandler: boolean;
      hasUpdateHandler: boolean;
      hasDeleteHandler: boolean;
      getLocalData: () => any;
      getSupabaseTable: () => string;
    }[] = [
      {
        table: 'products',
        localStorageKey: 'hd_system_products',
        hasSyncFn: true,
        hasHydrateMapping: true,
        hasLocalToCloud: true,
        hasRealtimeHandler: true,
        hasUpdateHandler: true,
        hasDeleteHandler: true,
        getLocalData: () => storageService.getProducts(),
        getSupabaseTable: () => 'products',
      },
      {
        table: 'categories',
        localStorageKey: 'hd_system_categories',
        hasSyncFn: true,
        hasHydrateMapping: true,
        hasLocalToCloud: true,
        hasRealtimeHandler: true,
        hasUpdateHandler: true,
        hasDeleteHandler: true,
        getLocalData: () => storageService.getCategories(),
        getSupabaseTable: () => 'categories',
      },
      {
        table: 'customers',
        localStorageKey: 'hd_system_customers',
        hasSyncFn: true,
        hasHydrateMapping: true,
        hasLocalToCloud: true,
        hasRealtimeHandler: true,
        hasUpdateHandler: true,
        hasDeleteHandler: true,
        getLocalData: () => storageService.getCustomers(),
        getSupabaseTable: () => 'customers',
      },
      {
        table: 'suppliers',
        localStorageKey: 'hd_system_suppliers',
        hasSyncFn: true,
        hasHydrateMapping: true,
        hasLocalToCloud: true,
        hasRealtimeHandler: true,
        hasUpdateHandler: true,
        hasDeleteHandler: true,
        getLocalData: () => storageService.getSuppliers(),
        getSupabaseTable: () => 'suppliers',
      },
      {
        table: 'sales',
        localStorageKey: 'hd_system_sales',
        hasSyncFn: true,
        hasHydrateMapping: true,
        hasLocalToCloud: true,
        hasRealtimeHandler: true,
        hasUpdateHandler: true,
        hasDeleteHandler: true,
        getLocalData: () => storageService.getSales(),
        getSupabaseTable: () => 'sales',
      },
      {
        table: 'sale_items',
        localStorageKey: 'N/A (nested in sales)',
        hasSyncFn: true,
        hasHydrateMapping: true,
        hasLocalToCloud: true,
        hasRealtimeHandler: false,
        hasUpdateHandler: false,
        hasDeleteHandler: false,
        getLocalData: () => {
          const sales = storageService.getSales();
          return sales.reduce((count, s) => count + s.items.length, 0);
        },
        getSupabaseTable: () => 'sale_items',
      },
      {
        table: 'cash_sessions',
        localStorageKey: 'hd_system_caixa_session',
        hasSyncFn: true,
        hasHydrateMapping: true,
        hasLocalToCloud: true,
        hasRealtimeHandler: true,
        hasUpdateHandler: true,
        hasDeleteHandler: true,
        getLocalData: () => storageService.getActiveCaixaSession(),
        getSupabaseTable: () => 'cash_sessions',
      },
      {
        table: 'stock_movements',
        localStorageKey: 'hd_system_stock_movements',
        hasSyncFn: true,
        hasHydrateMapping: true,
        hasLocalToCloud: true,
        hasRealtimeHandler: true,
        hasUpdateHandler: true,
        hasDeleteHandler: false,
        getLocalData: () => storageService.getMovements(),
        getSupabaseTable: () => 'stock_movements',
      },
      {
        table: 'financial_transactions',
        localStorageKey: 'hd_system_financial_accounts',
        hasSyncFn: true,
        hasHydrateMapping: true,
        hasLocalToCloud: true,
        hasRealtimeHandler: true,
        hasUpdateHandler: true,
        hasDeleteHandler: true,
        getLocalData: () => storageService.getFinancialAccounts(),
        getSupabaseTable: () => 'financial_transactions',
      },
      {
        table: 'store_branches',
        localStorageKey: 'hd_system_branches',
        hasSyncFn: true,
        hasHydrateMapping: true,
        hasLocalToCloud: true,
        hasRealtimeHandler: true,
        hasUpdateHandler: true,
        hasDeleteHandler: true, // FIXED: now has removeBranchFromRemote
        getLocalData: () => storageService.getBranches(),
        getSupabaseTable: () => 'store_branches',
      },
      {
        table: 'system_users',
        localStorageKey: 'hd_system_users_list',
        hasSyncFn: true,
        hasHydrateMapping: true,
        hasLocalToCloud: true,
        hasRealtimeHandler: true,
        hasUpdateHandler: true,
        hasDeleteHandler: true,
        getLocalData: () => storageService.getUsers(),
        getSupabaseTable: () => 'system_users',
      },
      {
        table: 'system_settings',
        localStorageKey: 'hd_system_settings',
        hasSyncFn: true,
        hasHydrateMapping: true,
        hasLocalToCloud: true, // FIXED: now has local→cloud sync
        hasRealtimeHandler: true,
        hasUpdateHandler: true,
        hasDeleteHandler: false,
        getLocalData: () => storageService.getSettings(),
        getSupabaseTable: () => 'system_settings',
      },
    ];

    // Test each table
    for (const t of tables) {
      const result = await this.testTable(t, supabaseReachable);
      results.tables.push(result);
      if (result.status === '✅ OK') results.summary.ok++;
      else if (result.status === '⚠️ PARCIAL') results.summary.partial++;
      else results.summary.failed++;
    }
    results.summary.total = results.tables.length;

    this.printReport(results);
    return results;
  }

  private async testTable(
    t: {
      table: string;
      localStorageKey: string;
      hasSyncFn: boolean;
      hasHydrateMapping: boolean;
      hasLocalToCloud: boolean;
      hasRealtimeHandler: boolean;
      hasUpdateHandler: boolean;
      hasDeleteHandler: boolean;
      getLocalData: () => any;
      getSupabaseTable: () => string;
    },
    supabaseReachable: boolean,
  ): Promise<TableTestResult> {
    const notes: string[] = [];
    let hasLocalData = false;

    // Check localStorage
    try {
      const raw = localStorage.getItem(t.localStorageKey);
      if (raw && t.localStorageKey !== 'N/A (nested in sales)') {
        const parsed = JSON.parse(raw);
        hasLocalData = Array.isArray(parsed) ? parsed.length > 0 : true;
      } else if (t.table === 'sale_items') {
        // sale_items: check nested in sales
        const itemCount = t.getLocalData();
        hasLocalData = itemCount > 0;
      }
    } catch {
      // localStorage key might not exist (returning default)
      const data = t.getLocalData();
      hasLocalData = Array.isArray(data) ? data.length > 0 : data !== null && data !== undefined;
    }

    // Check Supabase
    let supabaseRowCount = -1;
    if (supabaseReachable) {
      try {
        const { count, error } = await supabase
          .from(t.getSupabaseTable())
          .select('*', { count: 'exact', head: true });
        if (!error) supabaseRowCount = count || 0;
      } catch {
        supabaseRowCount = -1;
      }
    }

    // Determine status
    let allGood = true;
    let someIssues = false;

    // Keys existence
    if (!hasLocalData && t.table !== 'sale_items') {
      notes.push('Sem dados locais');
      someIssues = true;
    }

    // Determine status algorithm
    const checks = [
      t.hasSyncFn,
      t.hasHydrateMapping,
      t.hasLocalToCloud,
      t.hasRealtimeHandler,
      t.hasUpdateHandler,
      t.hasDeleteHandler,
    ];

    const failedChecks = checks.filter(Boolean).length; // Count true (expected) checks
    const totalExpected = checks.length;
    const allPresent = checks.every(Boolean);

    if (allPresent) {
      if (supabaseReachable && supabaseRowCount === 0 && hasLocalData) {
        notes.push('Dados locais existem mas Supabase vazio (será syncado no próximo hydrate)');
      } else if (supabaseReachable && supabaseRowCount > 0) {
        notes.push(`${supabaseRowCount} registro(s) no Supabase`);
      }
      if (notes.length === 0) notes.push('Completo');
      return {
        table: t.table,
        localStorageKey: t.localStorageKey,
        hasLocalData,
        hasSyncFunction: t.hasSyncFn,
        hasHydrateMapping: t.hasHydrateMapping,
        hasLocalToCloudSync: t.hasLocalToCloud,
        hasRealtimeHandler: t.hasRealtimeHandler,
        hasUpdateHandler: t.hasUpdateHandler,
        hasDeleteHandler: t.hasDeleteHandler,
        supabaseRowCount,
        status: '✅ OK',
        notes: notes.join('; '),
      };
    }

    // Missing items
    const missing: string[] = [];
    if (!t.hasSyncFn) missing.push('syncFn');
    if (!t.hasHydrateMapping) missing.push('hydrateMapping');
    if (!t.hasLocalToCloud) missing.push('localToCloud');
    if (!t.hasRealtimeHandler) missing.push('realtime');
    if (!t.hasUpdateHandler) missing.push('updateHandler');
    if (!t.hasDeleteHandler) missing.push('deleteHandler');

    let status: '✅ OK' | '⚠️ PARCIAL' | '❌ FALHA';
    if (missing.length <= 2) {
      status = '⚠️ PARCIAL';
    } else {
      status = '❌ FALHA';
    }

    return {
      table: t.table,
      localStorageKey: t.localStorageKey,
      hasLocalData,
      hasSyncFunction: t.hasSyncFn,
      hasHydrateMapping: t.hasHydrateMapping,
      hasLocalToCloudSync: t.hasLocalToCloud,
      hasRealtimeHandler: t.hasRealtimeHandler,
      hasUpdateHandler: t.hasUpdateHandler,
      hasDeleteHandler: t.hasDeleteHandler,
      supabaseRowCount,
      status,
      notes: `Faltando: ${missing.join(', ')}`,
    };
  }

  private printReport(results: DiagnosticResults) {
    const border = '='.repeat(100);
    const divider = '-'.repeat(100);

    console.log(`\n${border}`);
    console.log(`📊 RELATÓRIO COMPLETO DE SINCRONIZAÇÃO`);
    console.log(`🕐 ${results.timestamp}`);
    console.log(`🌐 Online: ${results.online ? '✅' : '❌'} | Supabase: ${results.supabaseReachable ? '✅' : '❌'}`);
    console.log(`${border}\n`);

    // Table header
    console.log(
      '%-18s %-30s %-8s %-8s %-8s %-8s %-10s %-10s %s',
      'TABELA',
      'CHAVE LOCALSTORAGE',
      'LOCAL',
      'SYNC',
      'HYDRATE',
      'LOCAL→CLOUD',
      'REALTIME',
      'HANDLER',
      'SUPABASE'
    );
    console.log(divider);

    for (const t of results.tables) {
      const localIcon = t.hasLocalData ? '📦' : '⬜';
      const syncIcon = t.hasSyncFunction ? '✅' : '❌';
      const hydrateIcon = t.hasHydrateMapping ? '✅' : '❌';
      const l2cIcon = t.hasLocalToCloudSync ? '✅' : '❌';
      const rtIcon = t.hasRealtimeHandler ? '✅' : '❌';
      const hIcon = `${t.hasUpdateHandler ? '✅' : '❌'}${t.hasDeleteHandler ? '✅' : '❌'}`;
      const supabaseStr = t.supabaseRowCount >= 0 ? `${t.supabaseRowCount}` : '?';

      console.log(
        '%-18s %-30s %-8s %-8s %-8s %-8s %-10s %-10s %s',
        t.table,
        t.localStorageKey,
        localIcon,
        syncIcon,
        hydrateIcon,
        l2cIcon,
        rtIcon,
        hIcon,
        supabaseStr
      );
    }

    console.log(`\n${divider}`);
    console.log(
      `📋 RESUMO: ${results.summary.ok} ✅ OK | ${results.summary.partial} ⚠️ PARCIAL | ${results.summary.failed} ❌ FALHA (de ${results.summary.total})`
    );
    console.log(`${border}\n`);

    // Notes for non-OK tables
    const nonOk = results.tables.filter((t) => t.status !== '✅ OK');
    if (nonOk.length > 0) {
      console.log('⚠️ TABELAS COM PROBLEMAS:');
      for (const t of nonOk) {
        console.log(`  ${t.status} ${t.table}: ${t.notes}`);
      }
      console.log();
    }

    // Test instructions
    console.log('🧪 PRÓXIMOS PASSOS:');
    console.log('  1. Abra o caixa em um dispositivo e verifique se aparece no outro');
    console.log('  2. Cadastre um cliente e verifique se aparece nos outros dispositivos');
    console.log('  3. Faça uma venda e verifique se o estoque atualiza em todos');
    console.log('  4. Para testar o sync manualmente, execute:');
    console.log('     await syncService.processPendingQueue()');
    console.log('  5. Para verificar fila de pendências:');
    console.log('     syncService.getPendingCount()');
    console.log();
  }

  /**
   * Quick check: test a single table's localStorage and Supabase.
   */
  async checkTable(tableName: string) {
    console.log(`\n🔍 Verificando tabela: ${tableName}`);
    
    // Check localStorage
    const keyMap: Record<string, string> = {
      products: 'hd_system_products',
      categories: 'hd_system_categories',
      customers: 'hd_system_customers',
      suppliers: 'hd_system_suppliers',
      sales: 'hd_system_sales',
      cash_sessions: 'hd_system_caixa_session',
      stock_movements: 'hd_system_stock_movements',
      financial_transactions: 'hd_system_financial_accounts',
      store_branches: 'hd_system_branches',
      system_users: 'hd_system_users_list',
      system_settings: 'hd_system_settings',
    };

    const lsKey = keyMap[tableName];
    if (lsKey) {
      const raw = localStorage.getItem(lsKey);
      if (raw) {
        try {
          const data = JSON.parse(raw);
          const count = Array.isArray(data) ? data.length : 1;
          console.log(`  📦 localStorage [${lsKey}]: ${count} registro(s)`);
        } catch {
          console.log(`  📦 localStorage [${lsKey}]: ${raw.slice(0, 100)}...`);
        }
      } else {
        console.log(`  📦 localStorage [${lsKey}]: ❌ NÃO ENCONTRADO`);
      }
    }

    // Check Supabase
    const online = await syncService.testConnection();
    if (online) {
      try {
        const { data, error } = await supabase.from(tableName).select('id').limit(5);
        if (!error) {
          console.log(`  ☁️  Supabase [${tableName}]: ${data?.length || 0} registro(s)`);
          if (data && data.length > 0) {
            console.log(`     IDs: ${data.map((r: any) => r.id).join(', ')}`);
          }
        } else {
          console.log(`  ☁️  Supabase [${tableName}]: ❌ ERRO: ${error.message}`);
        }
      } catch (e) {
        console.log(`  ☁️  Supabase [${tableName}]: ❌ EXCEÇÃO: ${e}`);
      }
    } else {
      console.log(`  ☁️  Supabase: ❌ OFFLINE`);
    }
  }

  /**
   * Verify all localStorage keys are correct.
   */
  checkKeys() {
    console.log('\n🔑 VERIFICANDO CHAVES DO LOCALSTORAGE:');
    const expectedKeys = [
      'hd_system_products',
      'hd_system_categories',
      'hd_system_customers',
      'hd_system_suppliers',
      'hd_system_sales',
      'hd_system_caixa_session',
      'hd_system_caixa_history',
      'hd_system_financial_accounts',
      'hd_system_stock_movements',
      'hd_system_branches',
      'hd_system_users_list',
      'hd_system_logged_in_email',
      'hd_system_settings',
      'hd_system_user_profile',
      'hd_system_subscription',
      'hd_system_selected_branch_id',
      'hd_system_dark_mode',
      'hd_system_sound_enabled',
    ];

    for (const key of expectedKeys) {
      const exists = localStorage.getItem(key) !== null;
      console.log(`  ${exists ? '✅' : '⬜'} ${key}`);
    }
  }
}

export const syncDiagnostic = new SyncDiagnostic();
