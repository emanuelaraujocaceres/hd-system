const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://tixwhmgzibvazkqbqoev.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeXdobWd6aWJ2YXprcWJxb2V2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4OTcyNDMsImV4cCI6MjEwMDQ3MzI0M30._5d_QlYpWXTUB4Bh4MbK5AGXUrFKkfiJPzPEz3Zi7yg';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testCollaborator() {
  console.log('=== TESTE: COLLABORATOR ISOLAMENTO ===\n');

  // Login como gut (collaborator, filial Campinas)
  console.log('--- Login gut (collaborator) ---');
  const { data: auth, error: err } = await supabase.auth.signInWithPassword({
    email: 'gut@gmail.com',
    password: 'gut123'
  });
  
  if (err) {
    console.log(`❌ ${err.message}`);
    return;
  }
  
  console.log(`✅ Logged in as gut (id: ${auth.user.id})`);

  // Query products
  const { data: products, error: prodErr } = await supabase
    .from('products')
    .select('name, store_branch_id, organization_id')
    .limit(20);

  if (prodErr) {
    console.log('❌ Products query error:', prodErr.message);
  } else {
    const brancheSet = new Set();
    const orgSet = new Set();
    products.forEach(p => brancheSet.add(p.store_branch_id));
    products.forEach(p => orgSet.add(p.organization_id));
    
    console.log(`\nProducts: ${products.length}`);
    console.log(`Branches distintas: ${[...brancheSet].join(', ')}`);
    console.log(`Orgs distintas: ${[...orgSet].join(', ')}`);
    
    const gutBranch = '1a1e8b81-f90a-56c9-a3ed-2212c6e0de14';
    const gutOrg = '00000000-0000-0000-0000-000000000001';
    
    if (brancheSet.size === 1 && brancheSet.has(gutBranch)) {
      console.log('✅ ISOLAMENTO BRANCH OK: gut vê só Campinas');
    } else {
      console.log('❌ VAZAMENTO: gut vê mais de uma filial');
    }
    
    if (orgSet.size === 1 && orgSet.has(gutOrg)) {
      console.log('✅ ISOLAMENTO ORG OK: gut vê só Adega dos Parças');
    } else {
      console.log('❌ VAZAMENTO: gut vê mais de uma org');
    }
  }

  // Query sales
  const { data: sales, error: salesErr } = await supabase
    .from('sales')
    .select('code, total, store_branch_id')
    .limit(10);
  
  if (salesErr) {
    console.log('❌ Sales query error:', salesErr.message);
  } else {
    console.log(`\nSales: ${sales.length}`);
    sales.forEach(s => console.log(`  ${s.code} R$ ${s.total} branch: ${s.store_branch_id}`));
    const saleBranches = new Set(sales.map(s => s.store_branch_id));
    console.log(`Sale branches: ${[...saleBranches].join(', ')}`);
  }

  // Query profiles (collaborator não deve ver outros profiles)
  const { data: profiles, error: profErr } = await supabase
    .from('profiles')
    .select('email, organization_id, store_branch_id')
    .limit(10);
  
  if (profErr) {
    console.log('❌ Profiles query error:', profErr.message);
  } else {
    console.log(`\nProfiles visíveis: ${profiles.length}`);
    profiles.forEach(p => console.log(`  ${p.email} | org: ${p.organization_id} | branch: ${p.store_branch_id}`));
    // collaborator deve ver apenas seu próprio profile
    if (profiles.length === 1 && profiles[0].email === 'gut@gmail.com') {
      console.log('✅ PROFILES OK: gut vê apenas seu profile');
    } else {
      console.log('❌ VAZAMENTO: gut vê profiles de outros users');
    }
  }

  await supabase.auth.signOut();
  console.log('\n=== FIM ===');
}

testCollaborator().catch(console.error);