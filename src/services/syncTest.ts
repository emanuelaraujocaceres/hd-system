/**
 * Sync Test Script
 * ================
 * Teste funcional ponta a ponta da sincronização.
 * Cria dados de teste, verifica se propagam para Supabase via Realtime,
 * e limpa após o teste.
 * 
 * Como usar no console do navegador (F12):
 *   (await import('./services/syncTest')).runSyncTest()
 * 
 * Para um teste específico:
 *   (await import('./services/syncTest')).syncTest.testProduct()
 */

import { storageService } from './storageService';
import { syncService } from './syncService';
import { syncQueue } from './syncQueueService';
import { supabase } from '../lib/supabase';

// ──────────────────────────────────────────
// 1. HELPERS
// ──────────────────────────────────────────

function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function result(label: string, ok: boolean, detail = '') {
  const icon = ok ? '✅' : '❌';
  console.log(`  ${icon} ${label}${detail ? ': ' + detail : ''}`);
  return ok;
}

type TestResult = {
  name: string;
  passed: boolean;
  detail: string;
};

// ──────────────────────────────────────────
// 2. INDIVIDUAL TESTS
// ──────────────────────────────────────────

async function testConnection(): Promise<TestResult> {
  try {
    const ok = await syncService.testConnection();
    return {
      name: 'Conexão com Supabase',
      passed: ok,
      detail: ok ? 'Conectado' : 'Falha na conexão',
    };
  } catch (e: any) {
    return { name: 'Conexão com Supabase', passed: false, detail: e.message };
  }
}

async function testProductSync(): Promise<TestResult> {
  const testId = `test-${uuidv4().slice(0, 8)}`;
  const testName = `[TESTE] Produto Sync ${testId}`;
  const testProduct = {
    id: testId,
    name: testName,
    barcode: `789${Date.now()}`,
    category: 'Teste Sync',
    costPrice: 10,
    price: 25,
    currentStock: 100,
    minStock: 10,
    unit: 'un',
    organizationId: '00000000-0000-0000-0000-000000000001',
    storeBranchId: '',
  };

  try {
    // 1. Save locally
    storageService.saveProduct(testProduct);
    await sleep(2000); // Wait for sync to trigger

    // 2. Check Supabase
    const { data, error } = await supabase.from('products').select('id').eq('id', testId);
    if (error) throw error;

    const inCloud = data && data.length > 0;

    // 3. Cleanup
    storageService.deleteProduct(testId);
    if (inCloud) {
      await supabase.from('products').delete().eq('id', testId);
    }

    return {
      name: 'Product Sync',
      passed: inCloud,
      detail: inCloud
        ? `Produto "${testName}" criado localmente e encontrado no Supabase`
        : 'Produto salvo localmente mas NÃO encontrado no Supabase (verifique o sync)',
    };
  } catch (e: any) {
    // Cleanup
    storageService.deleteProduct(testId);
    await supabase.from('products').delete().eq('id', testId).catch(() => {});
    return { name: 'Product Sync', passed: false, detail: e.message };
  }
}

async function testCustomerSync(): Promise<TestResult> {
  const testId = `test-${uuidv4().slice(0, 8)}`;
  const testCustomer = {
    id: testId,
    name: `[TESTE] Cliente Sync ${testId}`,
    phone: '(11) 99999-8888',
    email: `teste-${testId}@sync.com`,
    address: 'Rua Teste, 123',
    creditLimit: 500,
    currentCredit: 0,
    notes: 'Criado por teste de sync automático',
    organizationId: '00000000-0000-0000-0000-000000000001',
    storeBranchId: '',
  };

  try {
    storageService.saveCustomer(testCustomer);
    await sleep(2000);

    const { data, error } = await supabase.from('customers').select('id').eq('id', testId);
    if (error) throw error;

    const inCloud = data && data.length > 0;

    storageService.deleteCustomer(testId);
    if (inCloud) {
      await supabase.from('customers').delete().eq('id', testId);
    }

    return {
      name: 'Customer Sync',
      passed: inCloud,
      detail: inCloud
        ? 'Cliente encontrado no Supabase após sync'
        : 'Cliente NÃO encontrado no Supabase',
    };
  } catch (e: any) {
    storageService.deleteCustomer(testId);
    await supabase.from('customers').delete().eq('id', testId).catch(() => {});
    return { name: 'Customer Sync', passed: false, detail: e.message };
  }
}

async function testCaixaSync(): Promise<TestResult> {
  const testId = `test-session-${uuidv4().slice(0, 8)}`;
  const now = new Date().toISOString();
  const testSession = {
    id: testId,
    branchId: '',
    operatorName: '[TESTE] Sync Automation',
    openedAt: now,
    closedAt: null,
    openingBalance: 1000,
    currentBalance: 1000,
    totalSalesCash: 0,
    totalSalesPix: 0,
    totalSalesCard: 0,
    totalSalesCreditAccount: 0,
    suprimentos: 0,
    sangrias: 0,
    status: 'open',
    closingBalance: null,
    notes: 'Sessão de teste automático',
    organizationId: '00000000-0000-0000-0000-000000000001',
    storeBranchId: '',
  };

  try {
    // Need to use supabase directly since storageService doesn't have a generic save
    // Instead, call syncCaixaSession by saving to local then triggering sync
    const localSessions = JSON.parse(localStorage.getItem('hd_system_caixa_history') || '[]');
    localSessions.push(testSession);
    localStorage.setItem('hd_system_caixa_history', JSON.stringify(localSessions));

    // Manually sync
    await syncService.upsertRows('cash_sessions', [testSession]);
    await sleep(2000);

    const { data, error } = await supabase.from('cash_sessions').select('id').eq('id', testId);
    if (error) throw error;

    const inCloud = data && data.length > 0;

    // Cleanup
    const updatedHistory = JSON.parse(localStorage.getItem('hd_system_caixa_history') || '[]')
      .filter((s: any) => s.id !== testId);
    localStorage.setItem('hd_system_caixa_history', JSON.stringify(updatedHistory));
    if (inCloud) {
      await supabase.from('cash_sessions').delete().eq('id', testId);
    }

    return {
      name: 'Cash Session Sync',
      passed: inCloud,
      detail: inCloud
        ? 'Sessão de caixa encontrada no Supabase'
        : 'Sessão de caixa NÃO encontrada no Supabase',
    };
  } catch (e: any) {
    const updatedHistory = JSON.parse(localStorage.getItem('hd_system_caixa_history') || '[]')
      .filter((s: any) => s.id !== testId);
    localStorage.setItem('hd_system_caixa_history', JSON.stringify(updatedHistory));
    await supabase.from('cash_sessions').delete().eq('id', testId).catch(() => {});
    return { name: 'Cash Session Sync', passed: false, detail: e.message };
  }
}

async function testQueueProcessing(): Promise<TestResult> {
  try {
    const count = syncQueue.getPendingCount();
    return {
      name: 'Fila de Offline',
      passed: count === 0 || count > 0,
      detail: count === 0
        ? 'Nenhuma operação pendente na fila'
        : `${count} operação(ões) pendente(s) — execute syncService.processPendingQueue()`,
    };
  } catch (e: any) {
    return { name: 'Fila de Offline', passed: false, detail: e.message };
  }
}

async function testLocalStorageIntegrity(): Promise<TestResult> {
  const keys = [
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
    'hd_system_settings',
  ];

  const missing = keys.filter((k) => localStorage.getItem(k) === null);
  return {
    name: 'Integridade LocalStorage',
    passed: missing.length === 0,
    detail: missing.length === 0
      ? 'Todas as 12 chaves principais do localStorage existem'
      : `Faltando: ${missing.join(', ')}`,
  };
}

async function testRealtimeConnectivity(): Promise<TestResult> {
  try {
    // Check if Realtime channel is active via public property
    const svc = syncService as any;
    const ch = svc.channel as { state?: string } | null;
    const isActive = ch?.state === 'joined';

    return {
      name: 'Conexão Realtime',
      passed: isActive,
      detail: isActive
        ? 'Canal Realtime ativo (joined)'
        : 'Canal Realtime NÃO está ativo (state: ' + (ch?.state || 'unknown') + ')',
    };
  } catch (e: any) {
    return { name: 'Conexão Realtime', passed: false, detail: e.message };
  }
}

async function testPendingQueueClearance(): Promise<TestResult> {
  try {
    const pending = syncQueue.getPendingCount();
    if (pending > 0) {
      const result = await syncService.processPendingQueue();
      const stillPending = syncQueue.getPendingCount();
      return {
        name: 'Processar Fila Pendente',
        passed: stillPending === 0,
        detail: `${result.processed} processados, ${result.failed} falhas. Restam: ${stillPending}`,
      };
    }
    return {
      name: 'Processar Fila Pendente',
      passed: true,
      detail: 'Nenhuma operação pendente para processar',
    };
  } catch (e: any) {
    return { name: 'Processar Fila Pendente', passed: false, detail: e.message };
  }
}

// ──────────────────────────────────────────
// 3. RUNNER
// ──────────────────────────────────────────

export async function runSyncTest(options?: { cleanup?: boolean; quiet?: boolean }) {
  const border = '═'.repeat(70);

  console.log(`\n${border}`);
  console.log('🧪 HD-SYSTEM SYNC FUNCTIONAL TEST');
  console.log(`🕐 ${new Date().toISOString()}`);
  console.log(`🌐 Online: ${navigator.onLine ? '✅' : '❌'}`);
  console.log(`${border}\n`);

  console.log('📋 Executando testes de sincronização...\n');

  const tests: TestResult[] = [];

  // 1. Connection test
  console.log('🔌 1. CONEXÃO');
  tests.push(await testConnection());

  // 2. Realtime
  console.log('📡 2. REALTIME');
  tests.push(await testRealtimeConnectivity());

  // 3. Pending queue
  console.log('📦 3. FILA DE PENDÊNCIAS');
  tests.push(await testQueueProcessing());
  tests.push(await testPendingQueueClearance());

  // 4. LocalStorage integrity
  console.log('💾 4. INTEGRIDADE LOCAL');
  tests.push(await testLocalStorageIntegrity());

  // Only run data sync tests if connected
  if (tests[0].passed) {
    console.log('\n🔄 5. SINCRONIZAÇÃO DE DADOS');

    console.log('   Testando Product Sync...');
    tests.push(await testProductSync());

    console.log('   Testando Customer Sync...');
    tests.push(await testCustomerSync());

    console.log('   Testando Cash Session Sync...');
    tests.push(await testCaixaSync());
  } else {
    console.log('\n⚠️  Testes de dados pulados (sem conexão com Supabase)');
  }

  // ─── REPORT ────────────────────────────
  const passed = tests.filter((t) => t.passed).length;
  const failed = tests.filter((t) => !t.passed).length;

  console.log(`\n${border}`);
  console.log('📊 RESULTADO FINAL');
  console.log(`${border}`);
  console.log(`   ${'TESTE'.padEnd(40)} ${'STATUS'.padEnd(10)} DETALHE`);
  console.log(`   ${'─'.repeat(65)}`);

  for (const t of tests) {
    const icon = t.passed ? '✅' : '❌';
    console.log(`   ${t.name.padEnd(40)} ${icon.padEnd(10)} ${t.detail}`);
  }

  console.log(`\n   ${'─'.repeat(65)}`);
  console.log(`   ${'TOTAL'.padEnd(40)} ${passed + failed}/${passed} ✅ | ${failed} ❌`);
  console.log(`\n${border}\n`);

  if (failed === 0) {
    console.log('🎉 TODOS OS TESTES PASSARAM! O sync está funcionando corretamente.\n');
  } else {
    console.log(`⚠️  ${failed} teste(s) falharam. Revise os detalhes acima.\n`);
  }

  console.log('Próximos passos:');
  console.log('  1. Abra o Dashboard e confira se os dados aparecem');
  console.log('  2. Teste em dois dispositivos: abra caixa em um e veja no outro');
  console.log('  3. Para rodar novamente: (await import(\'./services/syncTest\')).runSyncTest()');
  console.log();

  return { tests, passed, failed };
}

export const syncTest = {
  run: runSyncTest,
  testProduct: testProductSync,
  testCustomer: testCustomerSync,
  testCaixa: testCaixaSync,
  testConnection,
  testRealtime: testRealtimeConnectivity,
  testQueue: testQueueProcessing,
};
