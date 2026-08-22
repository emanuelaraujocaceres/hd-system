const supabaseUrl = 'https://tixwhmgzibvazkqbqoev.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeHdobWd6aWJ2YXprcWJxb2V2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDg5NzI0MywiZXhwIjoyMTAwNDczMjQzfQ.j6FXodPl_xduyq_w_laaZEPE456hj_UxMcEqLevt2N0';

const query = `SELECT 
  tc.table_name,
  kcu.column_name,
  kcu.data_type
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
WHERE tc.table_schema = 'public'
  AND tc.table_name IN (
    'system_users', 'store_branches', 'customers', 'product_lots', 'stock_movements', 
    'financial_transactions', 'system_settings', 'suppliers', 'module_visibility', 
    'api_keys', 'delivery_neighborhoods', 'delivery_orders', 'scanned_boletos', 
    'nf_records', 'footer_messages', 'branch_themes', 'delivery_distance_rates', 
    'cash_sessions', 'sale_items', 'delivery_settings', 'stock_loss_log', 
    'media_devices', 'organizations'
  )
ORDER BY tc.table_name, kcu.column_name;`;

fetch(`${supabaseUrl}/rest/v1/rpc/exec`, {
  method: 'POST',
  headers: {
    'apikey': serviceKey,
    'Authorization': 'Bearer ' + serviceKey,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query }),
})
.then(res => res.text())
.then(text => {
  console.log('Response:', text);
})
.catch(err => {
  console.error('Error:', err);
});