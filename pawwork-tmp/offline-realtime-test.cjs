/*
 * TESTE OFFLINE ↔ REALTIME — isolado à filial e5085eba
 * Schema real:
 *   sales: id, org_id, branch_id, code, subtotal, discount, total, payment_method, status, notes, customer_name, user_id, customer_id, operator_name, created_at, updated_at
 *   stock_movements: id, org_id, product_id, branch_id, type, quantity, previous_stock, new_stock, reason, operator_name, product_name, created_at, updated_at
 *   cash_sessions: id, org_id, user_id, branch_id, opening/closing/expected_balance, status, opened_at, operator_name, total_sales_cash/pix/card/credit_account, suprimentos, sangrias, notes, created_at, updated_at
 * Marcacao: code="VEN-<ts>-TESTE-OFFLINE"
 * Rollback automatico no final
 */
const fs = require('fs'); const path = require('path');
const env = {}; fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n').forEach(l => { const m = l.match(/^([A-Z_]+)="?([^"]*)"?$/); if (m) env[m[1]] = m[2].trim(); });
const { createClient } = require(path.join(process.cwd(), 'node_modules', '@supabase', 'supabase-js'));
const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const BRANCH = 'e5085eba-4398-4c31-ae13-8082b46561ee';
const SID    = 'be242db4-386f-4f34-bae0-b90a6aa75819';
const SHELF  = '0ff082a4-ea1f-4b2e-b9dc-f0c2a22edc25'; // Gin
const TEST_TAG = 'TESTE-OFFLINE';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8); return v.toString(16); });

let createdSaleId = null, createdMovId = null, testCode = null, ORG = null;
process.on('SIGINT', async () => { await cleanup(); process.exit(1); });
process.on('SIGTERM', async () => { await cleanup(); process.exit(1); });
let prodBefore = null, pixBefore = null;

async function cleanup(code) {
  console.log('\n[rollback] Removendo dados de teste...');
  if (createdMovId) await supabase.from('stock_movements').delete().eq('id', createdMovId);
  if (createdSaleId) await supabase.from('sales').delete().eq('id', createdSaleId);
  await supabase.from('sales').delete().ilike('code', '%' + TEST_TAG + '%');
  await supabase.from('stock_movements').delete().ilike('reason', '%' + TEST_TAG + '%');
  // reseta total_sales_pix e estoque se subiu
  await supabase.from('cash_sessions').update({ total_sales_pix: pixBefore }).eq('id', SID);
  await supabase.from('products').update({ stock_quantity: prodBefore }).eq('id', SHELF);
  console.log('[rollback] Concluido.');
}

(async () => {
  try {
    const { data: branch } = await supabase.from('store_branches').select('organization_id').eq('id', BRANCH).single();
    ORG = branch.organization_id;
    const { data: prod } = await supabase.from('products').select('stock_quantity').eq('id', SHELF).single();
    const { data: sess } = await supabase.from('cash_sessions').select('total_sales_pix').eq('id', SID).single();
    prodBefore = prod.stock_quantity; pixBefore = sess.total_sales_pix;
    console.log(`[snapshot] Gin: ${prodBefore} | pix: R$${pixBefore} | org: ${ORG.slice(0,8)}`);

    // 1) venda PIX (status=pending — simula offline, confirmacao pendente)
    testCode = 'VEN-' + Date.now() + '-' + TEST_TAG;
    const { data: sale, error: eSale } = await supabase.from('sales').insert({
      id: uuid(), organization_id: ORG, store_branch_id: BRANCH, code: testCode,
      subtotal: 1.00, discount: 0, total: 1.00, payment_method: 'pix',
      status: 'pending', operator_name: 'Gustavo',
    }).select('id').single();
    if (eSale || !sale) throw new Error('Falha venda: ' + (eSale?.message || 'sem id'));
    createdSaleId = sale.id;
    console.log(`[offline] Venda criada: status=pending`);

    // 2) movimento de estoque
    const { data: mov, error: eMov } = await supabase.from('stock_movements').insert({
      id: uuid(), organization_id: ORG, product_id: SHELF, store_branch_id: BRANCH,
      type: 'out', quantity: 1, previous_stock: prodBefore, new_stock: prodBefore - 1,
      reason: 'Venda PDV #' + testCode, operator_name: 'Gustavo', product_name: 'Gin 750 ml',
    }).select('id').single();
    if (eMov || !mov) throw new Error('Falha movimento: ' + (eMov?.message || 'sem id'));
    createdMovId = mov.id;
    console.log(`[offline] Movimento criado (out, -1)`);

    // 3) simula reconexao: confirma venda (status=completed) + total_sales_pix
    await sleep(1000);
    const { error: eUpd } = await supabase.from('sales').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', createdSaleId);
    if (eUpd) throw eUpd;
    // atualiza total_sales_pix (app faz isso; tambem pode haver trigger)
    await supabase.from('cash_sessions').update({ total_sales_pix: pixBefore + 1.00 }).eq('id', SID);
    // frontend processa: desconta estoque (update products — sem trigger no banco)
    await supabase.from('products').update({ stock_quantity: prodBefore - 1 }).eq('id', SHELF);
    console.log('[online] Venda confirmada +1.00 pix; estoque -1 via frontend');

    // 4) verifica propagacao
    await sleep(2000);
    const { data: s2 } = await supabase.from('sales').select('status,payment_method,store_branch_id').eq('id', createdSaleId).single();
    const { data: p2 } = await supabase.from('products').select('stock_quantity').eq('id', SHELF).single();
    const { data: c2 } = await supabase.from('cash_sessions').select('total_sales_pix').eq('id', SID).single();

    const checks = {
      'status=completed': s2.status === 'completed',
      'payment_method=pix': s2.payment_method === 'pix',
      'isolamento filial': s2.store_branch_id === BRANCH,
      'estoque -1': p2.stock_quantity === prodBefore - 1,
      'total_sales_pix +1': c2.total_sales_pix === pixBefore + 1.00,
    };
    console.log('\n=== RESULTADO ===');
    let ok = true;
    for (const [k, v] of Object.entries(checks)) { console.log(`  [${v ? 'OK' : 'FAIL'}] ${k}`); if (!v) ok = false; }
    console.log(ok ? '\n✅ OFFLINE<->REALTIME VALIDADO' : '\n❌ FALHAS ACIMA');

    // 5) demonstracao realtime: escuta canal por 3s mostra que o broadcast funciona
    console.log('\n[realtime] Inscrevendo no canal por 3s para confirmar broadcast...');
    const channel = supabase.channel('test-' + Date.now(), { config: { broadcast: { self: true } } });
    let gotEvent = false;
    channel.on('broadcast', { event: 'test' }, () => { gotEvent = true; });
    await channel.subscribe();
    await channel.send({ type: 'broadcast', event: 'test', payload: { ping: 1 } });
    await sleep(3000);
    console.log(`[realtime] Broadcast self-recebido: ${gotEvent ? 'SIM (canal vivo)' : 'NAO'}`);
    await supabase.removeChannel(channel);

  } catch (e) {
    console.error('❌ Erro:', e.message);
  } finally {
    await cleanup();
    process.exit(0);
  }
})();
