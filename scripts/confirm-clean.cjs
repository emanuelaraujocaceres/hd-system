const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://tixwhmgzibvazkqbqoev.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeHdobWd6aWJ2YXprcWJxb2V2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDg5NzI0MywiZXhwIjoyMTAwNDczMjQzfQ.j6FXodPl_xduyq_w_laaZEPE456hj_UxMcEqLevt2N0';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function confirmAndClean() {
  console.log('=== CONFIRMAÇÃO E LIMPEZA FINAL ===\n');

  // 1. Sales com código "TESTE-OFFLINE" (claramente teste)
  console.log('--- SALES TESTE-OFFLINE ---');
  const { data: testOffline } = await supabase
    .from('sales')
    .select('id, code, total, status, payment_method, notes, created_at')
    .ilike('code', '%TESTE-OFFLINE%');
  console.log(`Encontradas: ${testOffline.length}`);
  testOffline.forEach(s => console.log(`  ${s.code} | R$ ${s.total} | ${s.status} | ${s.payment_method} | notes: ${s.notes} | ${s.created_at}`));

  // 2. Sale R$ 86.80 (pix teste)
  console.log('\n--- SALE R$ 86.80 ---');
  const { data: pix86 } = await supabase
    .from('sales')
    .select('id, code, total, status, payment_method, notes, created_at')
    .eq('total', 86.8)
    .eq('payment_method', 'pix');
  console.log(`Encontradas: ${pix86.length}`);
  pix86.forEach(s => console.log(`  ${s.code} | R$ ${s.total} | ${s.status} | notes: ${s.notes} | ${s.created_at}`));

  // 3. Sales pdv R$ 15 (pending, manhã de hoje)
  console.log('\n--- SALES PDV R$ 15 (PENDING) ---');
  const { data: pdv15 } = await supabase
    .from('sales')
    .select('id, code, total, status, payment_method, notes, created_at')
    .eq('total', 15)
    .eq('order_source', 'pdv')
    .eq('status', 'pending');
  console.log(`Encontradas: ${pdv15.length}`);
  pdv15.forEach(s => console.log(`  ${s.code} | R$ ${s.total} | ${s.status} | notes: ${s.notes} | ${s.created_at}`));

  // 4. Deletar todas as sales de teste identificadas
  console.log('\n--- LIMPANDO ---');
  const toDelete = [
    ...testOffline.map(s => s.id),
    ...pix86.map(s => s.id),
    ...pdv15.map(s => s.id),
  ];
  
  if (toDelete.length > 0) {
    // Deletar sale_items primeiro
    const { data: itemsDel } = await supabase
      .from('sale_items')
      .delete()
      .in('sale_id', toDelete)
      .select('id');
    console.log(`sale_items deletados: ${itemsDel?.length || 0}`);
    
    const { data: salesDel } = await supabase
      .from('sales')
      .delete()
      .in('id', toDelete)
      .select('id');
    console.log(`sales deletadas: ${salesDel?.length || 0}`);
  }

  // 5. Verificação final
  console.log('\n--- SALES RESTANTES ---');
  const { data: remaining } = await supabase
    .from('sales')
    .select('code, total, status, payment_method, order_source, created_at')
    .order('created_at', { ascending: false });
  console.log(`Total: ${remaining.length}`);
  remaining.forEach(s => console.log(`  ${s.code} | R$ ${s.total} | ${s.status} | ${s.payment_method} | ${s.order_source} | ${s.created_at}`));

  console.log('\n=== FIM ===');
}

confirmAndClean().catch(console.error);
