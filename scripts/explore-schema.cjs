const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://tixwhmgzibvazkqbqoev.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeHdobWd6aWJ2YXprcWJxb2V2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDg5NzI0MywiZXhwIjoyMTAwNDczMjQzfQ.j6FXodPl_xduyq_w_laaZEPE456hj_UxMcEqLevt2N0';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function exploreSchema() {
  console.log('=== EXPLORAÇÃO DO SCHEMA ===\n');

  // 1. Listar tabelas via information_schema
  console.log('--- TABELAS NO SCHEMA PUBLIC ---');
  const { data: tables, error: tErr } = await supabase.rpc('list_tables');
  if (tErr) {
    // Tentar via REST direto
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
      }
    });
    const text = await res.text();
    console.log('REST root:', text.substring(0, 2000));
  } else {
    console.log(tables);
  }

  // 2. Tentar tabela profiles (alternativa a users)
  console.log('\n--- PROFILES ---');
  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('*')
    .limit(5);
  if (pErr) console.error('profiles:', pErr.message);
  else {
    console.log(`profiles: ${profiles.length} rows`);
    if (profiles.length > 0) console.log('cols:', Object.keys(profiles[0]));
  }

  // 3. Tentar sales com colunas básicas
  console.log('\n--- SALES (primeira linha) ---');
  const { data: saleCols, error: sErr } = await supabase
    .from('sales')
    .select('*')
    .limit(1);
  if (sErr) console.error('sales:', sErr.message);
  else {
    if (saleCols.length > 0) {
      console.log('cols:', Object.keys(saleCols[0]));
      console.log('sample:', JSON.stringify(saleCols[0], null, 2));
    } else {
      console.log('sales vazia');
    }
  }

  // 4. Tentar sale_items
  console.log('\n--- SALE_ITEMS ---');
  const { data: items, error: iErr } = await supabase
    .from('sale_items')
    .select('*')
    .limit(3);
  if (iErr) console.error('sale_items:', iErr.message);
  else {
    if (items.length > 0) {
      console.log('cols:', Object.keys(items[0]));
    } else {
      console.log('sale_items vazia');
    }
  }

  console.log('\n=== FIM ===');
}

exploreSchema().catch(console.error);
