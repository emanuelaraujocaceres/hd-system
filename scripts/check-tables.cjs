const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://tixwhmgzibvazkqbqoev.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeXdobWd6aWJ2YXprcWJxb2V2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4OTcyNDMsImV4cCI6MjEwMDQ3MzI0M30._5d_QlYpWXTUB4Bh4MbK5AGXUrFKkfiJPzPEz3Zi7yg';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkTables() {
  console.log('=== VERIFICANDO TABLES + COLUNAS ===\n');

  const tables = [
    'products', 'categories', 'customers', 'suppliers',
    'sales', 'sale_items', 'financial_transactions',
    'cash_sessions', 'stock_movements', 'store_branches',
    'system_users', 'system_settings',
    'scanned_boletos', 'credit_payments', 'nf_records',
    'footer_messages', 'media_devices', 'printers',
    'tables', 'customer_sessions', 'digital_menu_config',
    'branch_themes', 'api_keys', 'profiles', 'organizations',
    'user_permissions', 'sessions', 'sync_queue', 'pix_config',
    'company_settings', 'stock_change_log'
  ];

  console.log('Tabela | existe | branch | org');
  console.log('-'.repeat(60));
  
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*').limit(1);
    if (error) {
      console.log(`  ${table}: ❌ ${error.message.substring(0, 40)}`);
    } else if (data && data.length > 0) {
      const cols = Object.keys(data[0]);
      const hasBranch = cols.includes('store_branch_id');
      const hasOrg = cols.includes('organization_id');
      console.log(`  ${table}: ✅ | ${hasBranch ? '✅' : '❌'} | ${hasOrg ? '✅' : '❌'}`);
    } else {
      console.log(`  ${table}: ✅ (vazia) | ? | ?`);
    }
  }

  console.log('\n=== FIM ===');
}

checkTables().catch(console.error);