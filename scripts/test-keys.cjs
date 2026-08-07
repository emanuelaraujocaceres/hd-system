const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://tixwhmgzibvazkqbqoev.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeHdobWd6aWJ2YXprcWJxb2EviIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4OTcyNDMsImV4cCI6MjEwMDQ3MzI0M30._5d_QlYpWXTUB4Bh4MbK5AGXUrFKkfiJPzPEz3Zi7yg';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testKeys() {
  console.log('=== TESTE DE KEYS ===\n');

  // 1. Anon key — query sem login
  console.log('--- Anon key (sem login) ---');
  const { data, error } = await supabase.from('products').select('id').limit(1);
  if (error) console.log(`❌ ${error.message}`);
  else console.log(`✅ ${data.length} linhas`);

  // 2. Anon key — login com gustavo
  console.log('\n--- Login gustavo (admin) ---');
  const { data: auth, error: loginErr } = await supabase.auth.signInWithPassword({
    email: 'gustavo@gmail.com',
    password: 'gustavo123'
  });
  
  if (loginErr) {
    console.log(`❌ Login failed: ${loginErr.message}`);
  } else {
    console.log(`✅ Logged in: ${auth.user.email}`);
    
    const { data: products, error: prodErr } = await supabase.from('products').select('name, store_branch_id').limit(10);
    if (prodErr) console.log(`❌ ${prodErr.message}`);
    else {
      console.log(`✅ ${products.length} products`);
      const branches = new Set(products.map(p => p.store_branch_id));
      console.log(`Branches: ${[...branches].join(', ')}`);
      
      const gustavoOrg = '361fb95a-3e9f-43be-a43c-0dc91f851f31';
      const crossOrg = products.some(p => p.store_branch_id !== 'e5085eba-4398-4c31-ae13-8082b46561ee');
      const crossBranch = [...branches].filter(b => b !== 'e5085eba-4398-4c31-ae13-8082b46561ee');
      
      if (crossBranch.length > 0) {
        console.log(`❌ VAZAMENTO: gustavo vê branches: ${crossBranch.join(', ')}`);
      } else {
        console.log('✅ ISOLAMENTO OK: gustavo vê só Plantão Matriz');
      }
    }
  }

  await supabase.auth.signOut();
  console.log('\n=== FIM ===');
}

testKeys().catch(console.error);