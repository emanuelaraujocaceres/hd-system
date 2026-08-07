const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://tixwhmgzibvazkqbqoev.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeHdobWd6aWJ2YXprcWJxb2V2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4OTcyNDMsImV4cCI6MjEwMDQ3MzI0M30._5d_QlYpWXTUB4Bh4MbK5AGXUrFKkfiJPzPEz3Zi7yg';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function introspect() {
  console.log('=== INTROspecção DE COLUNAS POR TABELA ===\n');

  const tables = [
    'products', 'categories', 'customers', 'suppliers',
    'sales', 'sale_items', 'financial_transactions',
    'cash_sessions', 'stock_movements', 'store_branches',
    'system_users', 'system_settings',
    'scanned_boletos', 'credit_payments', 'nf_records',
    'footer_messages', 'media_devices', 'printers',
    'tables', 'customer_sessions', 'digital_menu_config',
    'branch_themes', 'api_keys', 'profiles', 'organizations',
    'user_permissions', 'sessions', 'sync_queue', 'pix_config'
  ];

  for (const table of tables) {
    try {
      const { data, error } = await supabase.from(table).select('*').limit(1);
      if (error) {
        console.log(`${table}: ❌ ${error.message.substring(0, 60)}`);
      } else if (data && data.length > 0) {
        console.log(`${table}: ${Object.keys(data[0]).join(', ')}`);
      } else {
        // Empty table, try specific columns
        const cols = await supabase.from(table).select('id,store_branch_id,organization_id').limit(1);
        if (cols.error) {
          console.log(`${table}: (vazia) - ${cols.error.message.substring(0, 60)}`);
        } else {
          console.log(`${table}: (vazia) - OK (tem as 3 colunas)`);
        }
      }
    } catch (e) {
      console.log(`${table}: erro - ${e.message?.substring(0, 60)}`);
    }
  }

  console.log('\n=== FIM ===');
}

introspect().catch(console.error);