const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://tixwhmgzibvazkqbqoev.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeHdobWd6aWJ2YXprcWJxb2V2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDg5NzI0MywiZXhwIjoyMTAwNDczMjQzfQ.j6FXodPl_xduyq_w_laaZEPE456hj_UxMcEqLevt2N0';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function fixAndClean() {
  console.log('=== CORREÇÃO E LIMPEZA ===\n');

  // 1. Verificar branches órfãos (dos users de teste)
  console.log('--- BRANCHES ÓRFÃOS ---');
  const orphanBranchIds = ['e931d8fa-090d-4628-831a-a4ad6aca3733', 'b0b760c7-e504-4fac-aeaa-6a52203f60b0'];
  const { data: orphanBranches } = await supabase
    .from('store_branches')
    .select('*')
    .in('id', orphanBranchIds);
  console.log(`Branches órfãos encontrados: ${orphanBranches.length}`);
  orphanBranches.forEach(b => console.log(`  ${b.id} | ${b.name} | org: ${b.organization_id}`));

  // 2. Corrigir gustavo e maria → branch Plantão da Cerveja - Matriz
  console.log('\n--- CORRIGINDO GUSTAVO E MARIA ---');
  const plantaoMatriz = 'e5085eba-4398-4c31-ae13-8082b46561ee';
  
  const { data: gustavoFixed } = await supabase
    .from('profiles')
    .update({ store_branch_id: plantaoMatriz })
    .eq('email', 'gustavo@gmail.com')
    .select('email, organization_id, store_branch_id');
  console.log('gustavo:', gustavoFixed);

  const { data: mariaFixed } = await supabase
    .from('profiles')
    .update({ store_branch_id: plantaoMatriz })
    .eq('email', 'maria@gmail.com')
    .select('email, organization_id, store_branch_id');
  console.log('maria:', mariaFixed);

  // 3. Limpar sales de teste (R$ 1 e R$ 15 com cardapio_digital)
  console.log('\n--- LIMPANDO SALES DE TESTE ---');
  const { data: testSales } = await supabase
    .from('sales')
    .select('id, total, status, order_source')
    .in('total', [1, 15])
    .eq('order_source', 'cardapio_digital');
  console.log(`Sales de teste encontradas: ${testSales.length}`);
  
  if (testSales.length > 0) {
    const ids = testSales.map(s => s.id);
    
    // Deletar sale_items primeiro (FK)
    const { data: itemsDeleted } = await supabase
      .from('sale_items')
      .delete()
      .in('sale_id', ids)
      .select('id');
    console.log(`  sale_items deletados: ${itemsDeleted?.length || 0}`);
    
    // Deletar sales
    const { data: salesDeleted } = await supabase
      .from('sales')
      .delete()
      .in('id', ids)
      .select('id');
    console.log(`  sales deletadas: ${salesDeleted?.length || 0}`);
  }

  // 4. Limpar sale R$ 86.80 (pix teste)
  console.log('\n--- LIMPANDO SALE R$ 86.80 ---');
  const { data: pixSale } = await supabase
    .from('sales')
    .select('id, total, payment_method')
    .eq('total', 86.8)
    .eq('payment_method', 'pix');
  console.log(`Sales R$ 86.80 pix: ${pixSale.length}`);
  
  if (pixSale.length > 0) {
    const ids = pixSale.map(s => s.id);
    await supabase.from('sale_items').delete().in('sale_id', ids);
    const { data: deleted } = await supabase.from('sales').delete().in('id', ids).select('id');
    console.log(`  deletadas: ${deleted?.length || 0}`);
  }

  // 5. Verificação final
  console.log('\n--- VERIFICAÇÃO FINAL ---');
  const { data: usersFinal } = await supabase
    .from('profiles')
    .select('email, organization_id, store_branch_id')
    .in('email', ['gustavo@gmail.com', 'maria@gmail.com']);
  console.log('Users corrigidos:');
  usersFinal.forEach(u => console.log(`  ${u.email} | org: ${u.organization_id} | branch: ${u.store_branch_id}`));

  const { count: totalSales } = await supabase
    .from('sales')
    .select('*', { count: 'exact', head: true });
  console.log(`\nTotal sales restantes: ${totalSales}`);

  console.log('\n=== FIM ===');
}

fixAndClean().catch(console.error);
