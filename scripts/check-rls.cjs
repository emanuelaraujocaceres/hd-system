const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://tixwhmgzibvazkqbqoev.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeHdobWd6aWJ2YXprcWJxb2V2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDg5NzI0MywiZXhwIjoyMTAwNDczMjQzfQ.j6FXodPl_xduyq_w_laaZEPE456hj_UxMcEqLevt2N0';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function checkRLS() {
  console.log('=== VERIFICAÇÃO RLS NO SUPABASE ===\n');

  // 1. Tabelas com RLS habilitado
  console.log('--- TABELAS COM RLS ENABLED ---');
  const { data: rlsTables } = await supabase.rpc('get_rls_tables');
  if (rlsTables) {
    console.log('Usando RPC get_rls_tables');
    console.log(rlsTables);
  } else {
    // Fallback: query information_schema
    const { data: tables } = await supabase
      .from('pg_tables')
      .select('tablename')
      .eq('schemaname', 'public');
    
    for (const t of tables || []) {
      const { data: rls } = await supabase.rpc('check_rls', { table_name: t.tablename });
      if (rls?.enabled) {
        console.log(`  ✅ ${t.tablename}: RLS ENABLED`);
      } else if (rls?.enabled === false) {
        console.log(`  ❌ ${t.tablename}: RLS DISABLED`);
      }
    }
  }

  // 2. Policies nas tabelas principais
  console.log('\n--- POLICIES NAS TABELAS PRINCIPAIS ---');
  const mainTables = ['products', 'sales', 'sale_items', 'store_branches', 'profiles', 'categories', 'customers', 'suppliers', 'cash_register_sessions', 'financial_accounts', 'financial_transactions', 'user_permissions'];
  
  for (const table of mainTables) {
    const { data: policies } = await supabase.rpc('get_policies', { table_name: table });
    if (policies && policies.length > 0) {
      console.log(`  ${table}: ${policies.length} policy(s)`);
      policies.forEach(p => console.log(`    - ${p.policyname}: ${p.cmd} ${p.qual ? 'USING ' + p.qual : ''}`));
    } else {
      console.log(`  ${table}: SEM POLICIES`);
    }
  }

  // 3. Verificar se há setting app.current_branch_id
  console.log('\n--- CUSTOM SETTINGS (app.*) ---');
  const { data: settings } = await supabase.rpc('show_app_settings');
  if (settings) console.log(settings);
  else console.log('  Não há settings customizados ou RPC não disponível');

  console.log('\n=== FIM ===');
}

checkRLS().catch(console.error);