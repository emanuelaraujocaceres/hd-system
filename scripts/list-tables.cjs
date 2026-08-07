const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://tixwhmgzibvazkqbqoev.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeHdobWd6aWJ2YXprcWJxb2V2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDg5NzI0MywiZXhwIjoyMTAwNDczMjQzfQ.j6FXodPl_xduyq_w_laaZEPE456hj_UxMcEqLevt2N0';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function listTables() {
  console.log('=== TABELAS NO BANCO ===\n');
  
  // Listar tabelas via information_schema (mais confiável)
  const { data: tables, error } = await supabase.from('information_schema.tables').select('table_name,table_type')
  // Supabase REST não expõe information_schema diretamente. Vou usar uma consulta alternativa.
  
  // Tentar listar via pg_tables usando uma query
  const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    method: 'GET',
    headers: {
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    }
  });
  
  // Isso retorna a OpenAPI spec do projeto — contém todas as tabelas
  const spec = await res.text();
  const pathKeys = spec.match(/"\/[^"]+"\s*:/g);
  if (pathKeys) {
    console.log('Tabelas encontradas via OpenAPI:');
    pathKeys.forEach(k => {
      const name = k.replace(/"\/(.*?)"/g, '$1');
      if (!name.includes(':') && !name.startsWith('{')) {
        console.log(`  /rest/v1/${name}`);
      }
    });
  }
  
  // Método alternativo: tentar buscar de tabelas conhecidas
  console.log('\n--- VERIFICANDO TABELAS INDIVIDUAIS ---');
  const knownTables = [
    'products', 'categories', 'customers', 'suppliers',
    'sales', 'sale_items', 'financial_transactions',
    'cash_sessions', 'stock_movements', 'store_branches',
    'system_users', 'system_settings',
    'scanned_boletos', 'credit_payments', 'nf_records',
    'footer_messages', 'media_devices', 'printers',
    'tables', 'customer_sessions', 'digital_menu_config',
    'branch_themes', 'api_keys',
    'profiles', 'organizations',
    'financial_accounts', 'caixa_sessions',
    'organizations', 'organization_branches',
    'permissions', 'roles',
    'order_items', 'orders',
    'invoices', 'receipts',
    'payments', 'transactions',
    'branches', 'companies',
    'cash_registers', 'cash_movements',
    'bank_accounts', 'bank_transactions',
    'accounts_payable', 'accounts_receivable',
    'tax_configurations', 'tax_rates'
  ];
  
  for (const table of knownTables) {
    const { error } = await supabase.from(table).select('id').limit(1);
    if (error) {
      if (error.message.includes('does not exist') || error.message.includes('not found')) {
        // tabela não existe - não fazer nada
      } else {
        // outro erro - tabela existe mas pode ter problema
        console.log(`  ${table}: ${error.message.substring(0, 60)}`);
      }
    } else {
      console.log(`  ✅ ${table}`);
    }
  }
}

listTables().catch(console.error);