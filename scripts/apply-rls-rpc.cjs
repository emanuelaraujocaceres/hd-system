const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://tixwhmgzibvazkqbqoev.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeHdobWd6aWJ2YXprcWJxb2V2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDg5NzI0MywiZXhwIjoyMTAwNDczMjQzfQ.j6FXodPl_xduyq_w_laaZEPE456hj_UxMcEqLevt2N0';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// SQL statements to execute one by one (avoiding deadlock)
const sqlStatements = [
  // 1. products
  `ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;`,
  `DROP POLICY IF EXISTS "products_r" ON public.products;`,
  `DROP POLICY IF EXISTS "products_a" ON public.products;`,
  `DROP POLICY IF EXISTS "products_u" ON public.products;`,
  `DROP POLICY IF EXISTS "products_d" ON public.products;`,
  `CREATE POLICY "products_r" ON public.products FOR SELECT USING (true);`,
  `CREATE POLICY "products_a" ON public.products FOR INSERT WITH CHECK (true);`,
  `CREATE POLICY "products_u" ON public.products FOR UPDATE USING (true) WITH CHECK (true);`,
  `CREATE POLICY "products_d" ON public.products FOR DELETE USING (true);`,
  
  // ... mais tabelas
];

// List of all tables to apply RLS
const tables = [
  'products', 'categories', 'customers', 'suppliers',
  'sales', 'sale_items', 'financial_transactions',
  'cash_sessions', 'stock_movements', 'store_branches',
  'system_users', 'system_settings',
  'scanned_boletos', 'credit_payments', 'nf_records',
  'footer_messages', 'media_devices', 'printers',
  'tables', 'customer_sessions', 'digital_menu_config',
  'branch_themes', 'api_keys',
  'profiles', 'organizations',
  'financial_accounts', 'caixa_sessions'
];

async function applyRLS() {
  console.log('=== APLICANDO RLS (tabela por tabela) ===\n');
  
  let success = 0;
  let failed = 0;
  
  for (const table of tables) {
    try {
      // Enable RLS
      await supabase.rpc('exec', { sql: `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;` });
      
      // Drop policies
      await supabase.rpc('exec', { sql: `DROP POLICY IF EXISTS "${table}_r" ON public.${table};` });
      await supabase.rpc('exec', { sql: `DROP POLICY IF EXISTS "${table}_a" ON public.${table};` });
      await supabase.rpc('exec', { sql: `DROP POLICY IF EXISTS "${table}_u" ON public.${table};` });
      await supabase.rpc('exec', { sql: `DROP POLICY IF EXISTS "${table}_d" ON public.${table};` });
      
      // Create policies
      await supabase.rpc('exec', { sql: `CREATE POLICY "${table}_r" ON public.${table} FOR SELECT USING (true);` });
      await supabase.rpc('exec', { sql: `CREATE POLICY "${table}_a" ON public.${table} FOR INSERT WITH CHECK (true);` });
      await supabase.rpc('exec', { sql: `CREATE POLICY "${table}_u" ON public.${table} FOR UPDATE USING (true) WITH CHECK (true);` });
      await supabase.rpc('exec', { sql: `CREATE POLICY "${table}_d" ON public.${table} FOR DELETE USING (true);` });
      
      console.log(`✅ ${table}`);
      success++;
    } catch (e) {
      console.log(`❌ ${table}: ${(e.message || e).substring(0, 100)}`);
      failed++;
    }
  }
  
  console.log(`\nResultado: ${success} OK, ${failed} falhas`);
}

// Verificar se exec RPC existe primeiro
async function checkExecRPC() {
  const { error } = await supabase.rpc('exec', { sql: 'SELECT 1;' });
  if (error) {
    console.log('❌ RPC exec não disponível');
    console.log('\nUsar o arquivo de migration: supabase/migrations/20260808_rls_phase1_individual.sql');
    console.log('Aplicar via Supabase SQL Editor (manual)');
    return false;
  }
  console.log('✅ RPC exec disponível');
  return true;
}

checkExecRPC().then(available => {
  if (available) {
    applyRLS().catch(console.error);
  }
});
