import { ANON_URL, ANON_KEY } from '../lib/supabaseAnon';
import type { CustomerSession, Sale, Table } from '../types';

// Serviço de ESCRITA anônima do cardápio público (#/mesa/ mesa, #/delivery).
//
// Usa fetch REST PURO com SÓ apikey + Bearer anon (sem supabase-js e sem JWT
// do operador). O supabase-js, mesmo com persistSession:false, compartilha a
// storage key do GoTrueClient do operador logado no mesmo aparelho
// ("Multiple GoTrueClient instances") e os upserts iam com role=authenticated
// → `org_branch_insert_*` negava (42501/401) em vez de cair no
// `*_insert_anon WITH CHECK (true)` (exceção 0f). O fetch manual com a mesma
// ANON_KEY já retornou 200 para a mesa — policies anon OK, problema era o client.
//
// Fluxo mesa:
//   1. ensureAnonSession(table, deviceFingerprint, sessionToken)
//   2. submitAnonSale(sale, table) — sales + sale_items + process_sale_transaction.
// O chamador grava o espelho local com skipSync (Minha Comanda imediata).

function anonHeaders(branchId?: string): Record<string, string> {
  const h: Record<string, string> = {
    apikey: ANON_KEY,
    Authorization: `Bearer ${ANON_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=representation',
  };
  if (branchId) h['x-branch-id'] = branchId;
  return h;
}

async function postRest(
  path: string,
  body: unknown,
  branchId?: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${ANON_URL}/rest/v1/${path}`, {
      method: 'POST',
      headers: anonHeaders(branchId),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'fetch anon falhou' };
  }
}

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

export interface AnonSessionResult {
  ok: boolean;
  error?: string;
  sessionId?: string;
  sessionToken?: string;
  reused?: boolean;
}

// Pedido de fechamento ("Solicitar fechamento") via anon puro. A RPC valida
// posse pelo session_token da sessão ATIVA — por isso o token precisa ser o
// REMOTO (da sessão compartilhada da mesa), não o UUID fresco da página.
// Retorna ok:false com a mensagem da RPC quando a posse falha.
export async function requestClosingAnon(
  saleIds: string[],
  sessionToken: string,
  paymentMethod: string,
  branchId: string
): Promise<{ ok: boolean; error?: string }> {
  // A RPC retorna HTTP 200 com {success:false} quando a posse falha (venda de
  // outra sessão/token). postRest só checa HTTP — sem este parse, o app mostrava
  // sucesso e o operador nunca recebia (bug do fechamento pelo celular).
  try {
    const res = await fetch(`${ANON_URL}/rest/v1/rpc/solicitar_fechamento_comanda`, {
      method: 'POST',
      headers: anonHeaders(branchId),
      body: JSON.stringify({
        p_sale_ids: saleIds,
        p_session_token: sessionToken,
        p_payment_method: paymentMethod,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 300)}` };
    }
    const body = await res.json().catch(() => null);
    const data = Array.isArray(body) ? body[0] : body;
    if (data && typeof data === 'object' && (data as any).success === false) {
      return { ok: false, error: (data as any).message || 'Fechamento recusado (posse).' };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'fetch anon falhou' };
  }
}

// A mesa tem UMA sessão ativa compartilhada (constraint
// one_active_session_per_table). Todos os aparelhos da mesa usam a mesma
// sessão — por isso primeiro busca a ativa remota e só cria se não houver.
export async function ensureAnonSession(
  table: Table,
  deviceFingerprint: string,
  sessionToken: string,
  sessionId?: string
): Promise<AnonSessionResult> {
  // 1) tenta reutilizar a ativa da mesa (GET anon com x-branch-id)
  try {
    const url = `${ANON_URL}/rest/v1/customer_sessions?table_id=eq.${table.id}&status=eq.active&select=id,session_token&limit=1`;
    const res = await fetch(url, { headers: anonHeaders(table.storeBranchId) });
    if (res.ok) {
      const rows = await res.json().catch(() => []);
      if (Array.isArray(rows) && rows.length > 0 && rows[0]?.id) {
        return { ok: true, sessionId: rows[0].id, sessionToken: rows[0].session_token, reused: true };
      }
    }
  } catch {
    // sem rede / 401 na leitura → cai para criação abaixo
  }
  // 2) nenhuma ativa → cria a nossa
  const id = sessionId || crypto.randomUUID();
  const r = await postRest(
    'customer_sessions?on_conflict=id',
    {
      id,
      table_id: table.id,
      organization_id: table.organizationId,
      store_branch_id: table.storeBranchId,
      session_token: sessionToken,
      status: 'active',
      device_fingerprint: deviceFingerprint,
      customer_name: null,
    },
    table.storeBranchId
  );
  if (!r.ok) {
    // Corrida: outro aparelho criou a ativa entre o GET e o POST (23505).
    // Busca de novo e adota a vencedora em vez de falhar.
    if (r.error && r.error.includes('23505')) {
      try {
        const url = `${ANON_URL}/rest/v1/customer_sessions?table_id=eq.${table.id}&status=eq.active&select=id,session_token&limit=1`;
        const res = await fetch(url, { headers: anonHeaders(table.storeBranchId) });
        if (res.ok) {
          const rows = await res.json().catch(() => []);
          if (Array.isArray(rows) && rows.length > 0 && rows[0]?.id) {
            return { ok: true, sessionId: rows[0].id, sessionToken: (rows[0] as any).session_token, reused: true };
          }
        }
      } catch {
        // ignora, retorna o erro original abaixo
      }
    }
    return { ok: false, error: r.error };
  }
  return { ok: true, sessionId: id, reused: false };
}

export async function submitAnonSale(
  sale: Sale,
  table: Table
): Promise<{ ok: boolean; error?: string }> {
  // 1) header da venda
  const r1 = await postRest(
    'sales?on_conflict=id',
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
    },
    table.storeBranchId
  );
  if (!r1.ok) return { ok: false, error: `sales: ${r1.error}` };

  // 2) itens
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
    const r2 = await postRest('sale_items?on_conflict=id', rows, table.storeBranchId);
    if (!r2.ok) return { ok: false, error: `sale_items: ${r2.error}` };
  }

  // 3) baixa de estoque atômica (SECURITY DEFINER, GRANT anon re-concedido)
  const r3 = await postRest(
    'rpc/process_sale_transaction',
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
    },
    table.storeBranchId
  );
  if (!r3.ok) return { ok: false, error: `rpc: ${r3.error}` };
  return { ok: true };
}

export interface SessionSaleStatus {
  id: string;
  status: string;
  kitchen_status: string;
  total: number;
}

export interface SessionSaleFull extends SessionSaleStatus {
  code: string;
  table_id: string | null;
  customer_session_id: string | null;
  organization_id: string;
  store_branch_id: string;
  order_source: string;
  created_at: string;
  items: { productId: string; productName: string; unitPrice: number; quantity: number; total: number }[];
}

// Puxa TODAS as vendas da sessão (com itens) para espelhar aparelhos que
// acabaram de entrar na mesa. Sem isso, cada celular só via o próprio
// espelho local: um mostrava 1 produto, outro zerado, outro outro produto.
export async function fetchSessionSalesFull(
  sessionId: string,
  branchId: string
): Promise<SessionSaleFull[]> {
  try {
    const sUrl =
      `${ANON_URL}/rest/v1/sales?customer_session_id=eq.${encodeURIComponent(sessionId)}` +
      `&select=id,code,status,kitchen_status,total,table_id,customer_session_id,organization_id,store_branch_id,order_source,created_at&order=created_at.asc&limit=100`;
    const sRes = await fetch(sUrl, { headers: anonHeaders(branchId) });
    if (!sRes.ok) return [];
    const sales = (await sRes.json().catch(() => [])) as any[];
    if (!Array.isArray(sales) || sales.length === 0) return [];
    const ids = sales.map((s) => s.id).filter(Boolean);
    let itemsBySale = new Map<string, any[]>();
    if (ids.length > 0) {
      const iUrl =
        `${ANON_URL}/rest/v1/sale_items?sale_id=in.(${ids.map((id) => encodeURIComponent(id)).join(',')})` +
        `&select=sale_id,product_id,product_name,quantity,unit_price,total_price&limit=500`;
      const iRes = await fetch(iUrl, { headers: anonHeaders(branchId) });
      if (iRes.ok) {
        const items = (await iRes.json().catch(() => [])) as any[];
        if (Array.isArray(items)) {
          for (const it of items) {
            const arr = itemsBySale.get(it.sale_id) || [];
            arr.push(it);
            itemsBySale.set(it.sale_id, arr);
          }
        }
      }
    }
    return sales.map((s) => ({
      id: s.id,
      code: s.code || '',
      status: s.status,
      kitchen_status: s.kitchen_status || 'pending',
      total: typeof s.total === 'number' ? s.total : 0,
      table_id: s.table_id || null,
      customer_session_id: s.customer_session_id || null,
      organization_id: s.organization_id,
      store_branch_id: s.store_branch_id,
      order_source: s.order_source || 'cardapio_digital',
      created_at: s.created_at || new Date().toISOString(),
      items: (itemsBySale.get(s.id) || []).map((it: any) => ({
        productId: it.product_id,
        productName: it.product_name || '',
        unitPrice: Number(it.unit_price) || 0,
        quantity: Number(it.quantity) || 0,
        total: Number(it.total_price) || 0,
      })),
    }));
  } catch {
    return [];
  }
}

// Lê o status atual das vendas da sessão direto do cloud (anon puro).
// O aparelho anon NÃO assina Realtime (App adia sem login), então sem isso a
// Minha Comanda nunca saberia que o operador cancelou/finalizou — ficava
// presa no `pending` local. Poll a cada 5s espelha status sem reenviar nada.
export async function fetchSessionSalesStatus(
  sessionId: string,
  branchId: string
): Promise<SessionSaleStatus[]> {
  try {
    const url =
      `${ANON_URL}/rest/v1/sales?customer_session_id=eq.${encodeURIComponent(sessionId)}` +
      `&select=id,status,kitchen_status,total&order=created_at.desc&limit=50`;
    const res = await fetch(url, { headers: anonHeaders(branchId) });
    if (!res.ok) return [];
    const rows = await res.json().catch(() => []);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export { snakeSession };
