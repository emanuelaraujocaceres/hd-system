const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://tixwhmgzibvazkqbqoev.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeHdobWd6aWJ2YXprcWJxb2V2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4OTcyNDMsImV4cCI6MjEwMDQ3MzI0M30._5d_QlYpWXTUB4Bh4MbK5AGXUrFKkfiJPzPEz3Zi7yg';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const testUsers = [
  { email: 'gustavo@gmail.com', password: 'gustavo123', expectedRole: 'admin', expectedOrg: 'Plantão da Cerveja', expectedBranch: 'Plantão da Cerveja - Matriz' },
  { email: 'gut@gmail.com', password: 'gut123', expectedRole: 'collaborator', expectedOrg: 'Adega dos Parças', expectedBranch: 'Adega dos Parças - Campinas' },
  { email: 'emanuel@gmail.com', password: '96235900', expectedRole: 'admin', expectedOrg: 'Adega dos Parças', expectedBranch: 'Adega dos Parças - Campinas' },
];

async function testLogin() {
  console.log('=== TESTE DE LOGIN COM ROLES DIFERENTES ===\n');

  for (const testUser of testUsers) {
    console.log(`--- ${testUser.email} (esperado: ${testUser.expectedRole}) ---`);
    
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: testUser.email,
      password: testUser.password,
    });

    if (authError) {
      console.log(`  ❌ LOGIN FALHOU: ${authError.message}`);
      continue;
    }

    console.log(`  ✅ Login OK - User ID: ${authData.user.id}`);

    // Buscar profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (profileError) {
      console.log(`  ❌ Profile error: ${profileError.message}`);
    } else {
      console.log(`  Profile: role=${profile.role}, org=${profile.organization_id}, branch=${profile.store_branch_id}`);
      
      // Verificar se condiz com esperado
      const roleMatch = profile.role === testUser.expectedRole;
      console.log(`  Role match: ${roleMatch ? '✅' : '❌'} (esperado: ${testUser.expectedRole})`);
    }

    // Testar query de products (deve filtrar por branch se RLS existisse)
    const { data: products, error: prodError } = await supabase
      .from('products')
      .select('id, name, store_branch_id')
      .limit(5);

    if (prodError) {
      console.log(`  Products query error: ${prodError.message}`);
    } else {
      console.log(`  Products visíveis: ${products.length} (sem RLS, vê TUDO)`);
      products.forEach(p => console.log(`    - ${p.name} (branch: ${p.store_branch_id})`));
    }

    // Testar query de sales
    const { data: sales, error: salesError } = await supabase
      .from('sales')
      .select('code, total, store_branch_id')
      .limit(5);

    if (salesError) {
      console.log(`  Sales query error: ${salesError.message}`);
    } else {
      console.log(`  Sales visíveis: ${sales.length} (sem RLS, vê TUDO)`);
      sales.forEach(s => console.log(`    - ${s.code} R$${s.total} (branch: ${s.store_branch_id})`));
    }

    // Logout
    await supabase.auth.signOut();
    console.log('');
  }

  console.log('=== RESUMO ===');
  console.log('Sem RLS, TODOS os users veem TUDO (products, sales, etc.)');
  console.log('O isolamento atual é APENAS no frontend (filtro JS).');
}

testLogin().catch(console.error);