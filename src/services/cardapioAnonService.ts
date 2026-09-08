import { supabaseAnon } from '../lib/supabaseAnon';
import type { CustomerSession, Sale, Table } from '../types';

// Serviço de ESCRITA anônima do cardápio público (#/mesa/ mesa, #/delivery).
//
// Usa `supabaseAnon` (sem sessão persistida) para que os inserts caiam nas
// policies `*_insert_anon WITH CHECK (true)` (exceção 0f). O cliente padrão
// `supabase` carrega o JWT do operador logado no mesmo aparelho e os mesmos
// inserts caem no `org_branch_insert_* TO authenticated` → 42501/401.
//
// Fluxo mesa:
//   1. ensureAnonSession(table, deviceFingerprint, sessionToken) — POST direto
//      em customer_sessions (upsert por id). Retorna a sessão.
//   2. submitAnonSale(sale, table) — POST em sales + POST em sale_items +
//      RPC process_sale_transaction (SECURITY DEFINER, baixa de estoque).
//      A RPC precisa de GRANT anon (migration 20260908 re-grant).
// Tudo com client anon puro; o chamador grava o espelho local com skipSync.

function snakeSession(s: CustomerSession) {
  return {
    id: s.id,
    table_id: s.tableId || null,
    organization_id: s.organizationId,
    store_branch_id: s.storeBranchId,
    session_token: s.sessionToken,
    status: s.status || 'active',
    device_fingerprint: (s as any).deviceFingerprint || null,
    customer_name: s.customerName || null,
  };
}

export async function ensureAnonSession(
  table: Table,
  deviceFingerprint: string,
  sessionToken: string,
  sessionId?: string
): Promise<{ ok: boolean; error?: string }> {
  const id = sessionId || crypto.randomUUID();
  const { error } = await supabaseAnon.from('customer_sessions').upsert(
    {
      id,
      table_id: table.id,
      organization_id: table.organizationId,
      store_branch_id: table.storeBranchId,
      session_token: sessionToken,
      status: 'active',
      device_fingerprint: deviceFingerprint,
      customer_name: null,
    } as any,
    { onConflict: 'id' }
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function submitAnonSale(
  sale: Sale,
  table: Table
): Promise<{ ok: boolean; error?: string }> {
  // 1) header da venda
  const { error: saleErr } = await supabaseAnon.from('sales').upsert(
    {
      id: sale.id,
      organization_id: sale.organizationId,
      store_branch_id: sale.storeBranchId,
      user_id: null,
      customer_id: null,
      table_id: sale.tableId || null,
      customer_session_id: sale.customerSessionId || null,
      delivery_order_id: null,
      code: sale.code,
      created_at: sale.date,
      operator_name: sale.operatorName,
      subtotal: sale.subtotal,
      discount: sale.discount || 0,
      total: sale.total,
      payment_method: (sale.payments?.[0] as any)?.method || 'cash',
      payments_json: JSON.stringify(
        (sale.payments && sale.payments.length > 0
          ? sale.payments
          : [{ method: 'cash', amount: sale.total || 0 }]
        ).map((p: any) => ({
          method: p.method,
          amount: p.amount,
          cashGiven: p.cashGiven,
          changeDue: p.changeDue,
        }))
      ),
      payment_details: JSON.stringify(
        (sale.payments && sale.payments.length > 0
          ? sale.payments
          : [{ method: 'cash', amount: sale.total || 0 }]
        ).map((p: any) => ({ method: p.method, amount: p.amount }))
      ),
      order_source: sale.orderSource || 'cardapio_digital',
      kitchen_status: sale.kitchenStatus || 'pending',
      status: sale.status,
      notes: sale.notes || sale.customerName || null,
      customer_name: sale.customerName || null,
    } as any,
    { onConflict: 'id' }
  );
  if (saleErr) return { ok: false, error: `sales: ${saleErr.message}` };

  // 2) itens (IDs estáveis gerados no front)
  const rows = (sale.items || []).map((it) => ({
    id: crypto.randomUUID(),
    sale_id: sale.id,
    product_id: it.productId,
    product_name: it.productName || '',
    quantity: it.quantity,
    unit_price: it.unitPrice,
    total_price: it.total,
    store_branch_id: sale.storeBranchId,
  }));
  if (rows.length > 0) {
    const { error: itemsErr } = await supabaseAnon
      .from('sale_items')
      .upsert(rows as any, { onConflict: 'id' });
    if (itemsErr) return { ok: false, error: `sale_items: ${itemsErr.message}` };
  }

  // 3) baixa de estoque atômica (SECURITY DEFINER, GRANT anon)
  const { error: rpcErr } = await supabaseAnon.rpc(
    'process_sale_transaction' as any,
    {
      p_sale_id: sale.id,
      p_product_id: sale.items?.[0]?.productId || null,
      p_quantity: sale.items?.reduce((s, i) => s + i.quantity, 0) || 0,
      p_unit_price: sale.items?.[0]?.unitPrice || sale.total,
      p_discount: sale.discount || 0,
      p_total: sale.total,
      p_reason: `Venda Cardápio #${sale.code}`,
      p_operator_name: sale.operatorName,
      p_organization_id: sale.organizationId,
      p_store_branch_id: sale.storeBranchId,
      p_sale_items: (sale.items || []).map((it) => ({
        product_id: it.productId,
        quantity: it.quantity,
        unit_price: it.unitPrice,
        total: it.total,
        discount: 0,
      })),
    } as any
  );
  if (rpcErr) return { ok: false, error: `rpc: ${rpcErr.message}` };
  return { ok: true };
}

export { snakeSession };
