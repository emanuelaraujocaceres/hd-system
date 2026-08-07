const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://tixwhmgzibvazkqbqoev.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeHdobWd6aWJ2YXprcWJxb2V2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDg5NzI0MywiZXhwIjoyMTAwNDczMjQzfQ.j6FXodPl_xduyq_w_laaZEPE456hj_UxMcEqLevt2N0';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function verifyRLS() {
  console.log('=== VERIFICANDO RLS ATIVADO ===\n');

  // Verificar via query direta no pg_tables
  const { data: tables, error } = await supabase
    .from('pg_tables')
    .select('tablename,rowsecurity')
    .eq('schemaname', 'public');
  
  if (error) {
    console.log('pg_tables não acessível via REST');
    // Tentativa alternativa - verificar via políticas
    console.log('\nVerificando via policy existence...');
    
    // Tentar consultar uma tabela e ver se RLS está ativo
    const testTables = [
      'products', 'categories', 'customers', 'suppliers',
      'sales', 'sale_items', 'financial_transactions',
      'cash_sessions', 'stock_movements', 'store_branches',
      'system_users', 'system_settings',
      'scanned_boletos', 'credit_payments', 'nf_records',
      'footer_messages', 'media_devices', 'printers',
      'tables', 'customer_sessions', 'digital_menu_config',
      'branch_themes', 'api_keys', 'profiles', 'organizations'
    ];
    
    console.log('\nTabela | RLS Status');
    console.log('-'.repeat(50));
    
    for (const table of testTables) {
      const { error: qErr } = await supabase.from(table).select('*').limit(0);
      // Se tiver RLS e não estivermos autenticados, teria erro de policy
      // Mas como usamos service_role, não vai bloquear
      // Vou tentar outro método
      console.log(`  ${table}: ?`);
    }
  } else {
    console.log('Tabela | RLS Status');
    console.log('-'.repeat(50));
    tables.forEach(t => {
      const status = t.rowsecurity ? '✅ ENABLED' : '❌ DISABLED';
      console.log(`  ${t.tablename}: ${status}`);
    });
  }

  console.log('\n=== FIM ===');
}

verifyRLS().catch(console.error);