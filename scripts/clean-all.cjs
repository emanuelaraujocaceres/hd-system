const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://tixwhmgzibvazkqbqoev.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeHdobWd6aWJ2YXprcWJxb2V2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDg5NzI0MywiZXhwIjoyMTAwNDczMjQzfQ.j6FXodPl_xduyq_w_laaZEPE456hj_UxMcEqLevt2N0';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function cleanAll() {
  console.log('=== LIMPEZA COMPLETA ===\n');

  // 1. Deletar sale R$ 86.80
  console.log('--- SALE R$ 86.80 ---');
  const saleId = 'VEN-MSHT761V-XDVL';
  // Buscar pelo code
  const { data: sale } = await supabase.from('sales').select('id, code, total').eq('code', saleId).single();
  if (sale) {
    await supabase.from('sale_items').delete().eq('sale_id', sale.id);
    await supabase.from('sales').delete().eq('id', sale.id);
    console.log(`  Deletada: ${sale.code} (R$ ${sale.total})`);
  } else {
    console.log('  Não encontrada');
  }

  // 2. Deletar users de teste
  console.log('\n--- USERS DE TESTE ---');
  const { data: testUsers } = await supabase
    .from('profiles')
    .select('id, email')
    .or('email.ilike.%admteste%');
  console.log(`Encontrados: ${testUsers.length}`);
  testUsers.forEach(u => console.log(`  ${u.email}`));
  
  if (testUsers.length > 0) {
    const { data: del } = await supabase
      .from('profiles')
      .delete()
      .in('id', testUsers.map(u => u.id))
      .select('email');
    console.log(`Deletados: ${del?.length || 0}`);
  }

  // 3. Deletar organizações de teste (após verificar dependências)
  console.log('\n--- ORGANIZAÇÕES DE TESTE ---');
  const { data: testOrgs } = await supabase
    .from('organizations')
    .select('id, name')
    .ilike('name', '%teste%');
  console.log(`Encontradas: ${testOrgs.length}`);
  testOrgs.forEach(o => console.log(`  ${o.id} | ${o.name}`));

  // Verificar branches dessas orgs
  if (testOrgs.length > 0) {
    const orgIds = testOrgs.map(o => o.id);
    const { data: testBranches } = await supabase
      .from('store_branches')
      .select('id, name, organization_id')
      .in('organization_id', orgIds);
    console.log(`\nBranches dependentes: ${testBranches.length}`);
    testBranches.forEach(b => console.log(`  ${b.id} | ${b.name}`));

    // Deletar sale_items -> sales -> products -> branches -> orgs
    if (testBranches.length > 0) {
      const branchIds = testBranches.map(b => b.id);
      
      // Products
      await supabase.from('products').delete().in('store_branch_id', branchIds);
      console.log('  products deletados');
      
      // Sale items
      const { data: branchSales } = await supabase.from('sales').select('id').in('store_branch_id', branchIds);
      if (branchSales?.length > 0) {
        await supabase.from('sale_items').delete().in('sale_id', branchSales.map(s => s.id));
        await supabase.from('sales').delete().in('store_branch_id', branchIds);
        console.log('  sales + items deletados');
      }
      
      // Branches
      await supabase.from('store_branches').delete().in('organization_id', orgIds);
      console.log('  branches deletados');
    }
    
    // Deletar orgs
    const { data: delOrgs } = await supabase
      .from('organizations')
      .delete()
      .in('id', orgIds)
      .select('name');
    console.log(`Organizações deletadas: ${delOrgs?.length || 0}`);
  }

  // 4. Deletar branches órfãos (dos users de teste, se existirem)
  console.log('\n--- BRANCHES ÓRFÃOS ---');
  const orphanIds = ['e931d8fa-090d-4628-831a-a4ad6aca3733', 'b0b760c7-e504-4fac-aeaa-6a52203f60b0'];
  const { data: orphanBranches } = await supabase
    .from('store_branches')
    .select('id, name')
    .in('id', orphanIds);
  if (orphanBranches?.length > 0) {
    await supabase.from('store_branches').delete().in('id', orphanIds);
    console.log(`Deletados: ${orphanBranches.length}`);
  } else {
    console.log('  Nenhum encontrado');
  }

  // 5. Verificação final
  console.log('\n=== VERIFICAÇÃO FINAL ===');
  const { count: salesCount } = await supabase.from('sales').select('*', { count: 'exact', head: true });
  const { count: usersCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
  const { count: orgsCount } = await supabase.from('organizations').select('*', { count: 'exact', head: true });
  const { count: branchesCount } = await supabase.from('store_branches').select('*', { count: 'exact', head: true });
  
  console.log(`Sales: ${salesCount}`);
  console.log(`Users: ${usersCount}`);
  console.log(`Organizações: ${orgsCount}`);
  console.log(`Branches: ${branchesCount}`);

  console.log('\n=== FIM ===');
}

cleanAll().catch(console.error);
