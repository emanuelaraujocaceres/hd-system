const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://tixwhmgzibvazkqbqoev.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeHdobWd6aWJ2YXprcWJxb2V2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4OTcyNDMsImV4cCI6MjEwMDQ3MzI0M30._5d_QlYpWXTUB4Bh4MbK5AGXUrFKkfiJPzPEz3Zi7yg';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testAuth() {
  console.log('=== TESTE: LOGIN + QUERY AUTENTICADA ===\n');

  // 1. Login como gustavo (admin Plantão)
  console.log('--- Login gustavo@gmail.com ---');
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'gustavo@gmail.com',
    password: 'gustavo123'
  });
  
  if (authErr) {
    console.log(`❌ Login falhou: ${authErr.message}`);
    return;
  }
  console.log(`✅ Login OK - user: ${auth.user.id}`);

  // 2. Query products (deve mostrar produtos da filial Plantão)
  console.log('\n--- Query products (autenticado como gustavo) ---');
  const { data: products, error: prodErr } = await supabase
    .from('products')
    .select('id, name, store_branch_id')
    .limit(10);
  
  if (prodErr) {
    console.log(`❌ ${prodErr.message}`);
  } else {
    console.log(`✅ ${products.length} products visíveis`);
    const branchSet = new Set();
    products.forEach(p => branchSet.add(p.store_branch_id));
    console.log(`  Branches distintas: ${[...branchSet].join(', ')}`);
    
    const gustavoBranch = 'e5085eba-4398-4c31-ae13-8082b46561ee';
    const plantaoBranch = [...branchSet].some(b => b === gustavoBranch);
    const crossOrg = [...branchSet].some(b => b !== gustavoBranch);
    
    if (crossOrg) {
      console.log('❌ VASAMENTO: gustavo vê products de outra filial/org');
    } else {
      console.log('✅ Isolamento OK: gustavo vê só da sua filial');
    }
  }

  // 3. Query sales
  console.log('\n--- Query sales ---');
  const { data: sales, error: salesErr } = await supabase
    .from('sales')
    .select('code, total, store_branch_id')
    .limit(10);
  
  if (salesErr) {
    console.log(`❌ ${salesErr.message}`);
  } else {
    console.log(`✅ ${sales.length} sales visíveis`);
    sales.forEach(s => console.log(`  ${s.code} R$${s.total} branch: ${s.store_branch_id}`));
  }

  // 4. Query profiles (deve ver users da sua org)
  console.log('\n--- Query profiles ---');
  const { data: profiles, error: profErr } = await supabase
    .from('profiles')
    .select('email, role, organization_id, store_branch_id')
    .limit(10);
  
  if (profErr) {
    console.log(`❌ ${profErr.message}`);
  } else {
    console.log(`✅ ${profiles.length} profiles visíveis`);
    profiles.forEach(p => console.log(`  ${p.email} | ${p.role} | org: ${p.organization_id} | branch: ${p.store_branch_id}`));
  }

  // 5. Testar query sem auth (anônima)
  console.log('\n--- Query anônima (sem login) ---');
  const tempSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: anonData, error: anonErr } = await tempSupabase
    .from('products')
    .select('id')
    .limit(1);
  
  if (anonErr) {
    console.log(`✅ RLS bloqueou acesso anônimo: ${anonErr.message.substring(0, 80)}`);
  } else {
    console.log(`❌ Acesso anônimo permitido — RLS não está funcionando!`);
  }

  // 6. Logout
  await supabase.auth.signOut();
  console.log('\n=== FIM ===');
}

testAuth().catch(console.error);