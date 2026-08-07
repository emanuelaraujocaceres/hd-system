const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://tixwhmgzibvazkqbqoev.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeHdobWd6aWJ2YXprcWJxb2V2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDg5NzI0MywiZXhwIjoyMTAwNDczMjQzfQ.j6FXodPl_xduyq_w_laaZEPE456hj_UxMcEqLevt2N0';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function finalCheck() {
  console.log('=== VERIFICAÇÃO FINAL ===\n');

  // 1. Listar TODAS as sales restantes
  console.log('--- SALES RESTANTES ---');
  const { data: sales } = await supabase
    .from('sales')
    .select('id, code, total, status, payment_method, order_source, store_branch_id, created_at')
    .order('created_at', { ascending: false });
  console.log(`Total: ${sales.length}`);
  sales.forEach(s => console.log(`  ${s.code} | R$ ${s.total} | ${s.status} | ${s.payment_method} | ${s.order_source} | ${s.store_branch_id} | ${s.created_at}`));

  // 2. Users de teste e branches órfãos
  console.log('\n--- USERS DE TESTE ---');
  const { data: testUsers } = await supabase
    .from('profiles')
    .select('id, email, organization_id, store_branch_id, role')
    .or('email.ilike.%admteste%,organization_id.is.null');
  console.log(`Encontrados: ${testUsers.length}`);
  testUsers.forEach(u => console.log(`  ${u.email} | org: ${u.organization_id} | branch: ${u.store_branch_id} | role: ${u.role}`));

  // 3. Branches não-mapeados (verificar se os branches órfãos existem)
  console.log('\n--- BRANCHES DOS USERS DE TESTE ---');
  const orphanIds = testUsers.filter(u => u.store_branch_id).map(u => u.store_branch_id);
  if (orphanIds.length > 0) {
    const { data: orphanBranches } = await supabase
      .from('store_branches')
      .select('*')
      .in('id', orphanIds);
    console.log(`Branches encontrados: ${orphanBranches.length}`);
    orphanBranches.forEach(b => console.log(`  ${b.id} | ${b.name} | org: ${b.organization_id}`));
  }

  // 4. Organizações "Nova Empresa Teste"
  console.log('\n--- ORGANIZAÇÕES DE TESTE ---');
  const { data: testOrgs } = await supabase
    .from('organizations')
    .select('*')
    .ilike('name', '%teste%');
  console.log(`Encontradas: ${testOrgs.length}`);
  testOrgs.forEach(o => console.log(`  ${o.id} | ${o.name}`));

  // 5. Products por filial
  console.log('\n--- PRODUCTS POR FILIAL ---');
  const { data: products } = await supabase
    .from('products')
    .select('store_branch_id, count', { count: 'exact' })
    .group('store_branch_id');
  // Alternativa: buscar todos e agrupar
  const { data: allProducts } = await supabase
    .from('products')
    .select('id, store_branch_id, name');
  const byBranch = {};
  allProducts.forEach(p => {
    byBranch[p.store_branch_id] = (byBranch[p.store_branch_id] || 0) + 1;
  });
  Object.entries(byBranch).forEach(([br, count]) => console.log(`  ${br}: ${count} products`));

  console.log('\n=== FIM ===');
}

finalCheck().catch(console.error);
