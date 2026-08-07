const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://tixwhmgzibvazkqbqoev.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeHdobWd6aWJ2YXprcWJxb2V2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDg5NzI0MywiZXhwIjoyMTAwNDczMjQzfQ.j6FXodPl_xduyq_w_laaZEPE456hj_UxMcEqLevt2N0';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function applyRls() {
  console.log('=== APLICANDO RLS (Phase 1 - policies permissivas) ===\n');

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

  let success = 0;
  let failed = 0;

  for (const table of tables) {
    try {
      // Step 1: Enable RLS
      await supabase.rpc('exec_sql', { sql: `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;` });
      
      // Step 2: Drop existing policies (idempotent)
      await supabase.rpc('exec_sql', { sql: `DROP POLICY IF EXISTS "${table}_select_all" ON public.${table};` });
      await supabase.rpc('exec_sql', { sql: `DROP POLICY IF EXISTS "${table}_insert_all" ON public.${table};` });
      await supabase.rpc('exec_sql', { sql: `DROP POLICY IF EXISTS "${table}_update_all" ON public.${table};` });
      await supabase.rpc('exec_sql', { sql: `DROP POLICY IF EXISTS "${table}_delete_all" ON public.${table};` });
      
      // Step 3: Create permissive policies
      await supabase.rpc('exec_sql', { sql: `CREATE POLICY "${table}_select_all" ON public.${table} FOR SELECT USING (true);` });
      await supabase.rpc('exec_sql', { sql: `CREATE POLICY "${table}_insert_all" ON public.${table} FOR INSERT WITH CHECK (true);` });
      await supabase.rpc('exec_sql', { sql: `CREATE POLICY "${table}_update_all" ON public.${table} FOR UPDATE USING (true) WITH CHECK (true);` });
      await supabase.rpc('exec_sql', { sql: `CREATE POLICY "${table}_delete_all" ON public.${table} FOR DELETE USING (true);` });
      
      console.log(`  ✅ ${table}`);
      success++;
    } catch (e) {
      console.log(`  ❌ ${table}: ${e.message || e}`);
      failed++;
    }
  }

  console.log(`\nResultado: ${success} OK, ${failed} falhas`);
  console.log('\n=== FIM ===');
}

applyRls().catch(console.error);
