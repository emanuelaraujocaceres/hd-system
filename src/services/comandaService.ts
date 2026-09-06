import { supabase } from '../lib/supabase';
import { storageService } from './storageService';
import { CustomerSession, Product, Sale, PaymentDetails, Table } from '../types';

/**
 * comandaService — operações de gerenciamento da comanda (mesa) pelo OPERADOR.
 *
 * ARQUITETURA (mapeada 2026-09-05):
 *   • A "comanda" é a tabela `customer_sessions`; os itens vivem em `sales` +
 *     `sale_items`, agrupados por `customer_session_id`. Não existe tabela
 *     `comandas` (confirmado no Supabase).
 *   • O ESTOQUE já é baixado atomicamente ao ADICIONAR o item (RPC
 *     `process_sale_transaction` dentro de `storageService.addSale`), tanto no
 *     cardápio anon quanto pelo operador. Portanto:
 *   • orderSource='comanda' (OPERADOR): a venda NÃO aparece no KDS/Pedidos (que
 *     filtra 'cardapio_digital'/'delivery') nem no celular do cliente. Pedido via
 *     QR do cardápio continua 'cardapio_digital' → vai pro KDS. A ComandaView
 *     agrupa por tableId e o checkout fecha por customer_session_id (ambos os
 *     fluxos da mesma mesa são finalizados pelo fechar_comanda).
 *       - adicionarItem → cria venda `pending` via addSale (baixa atômica já
 *         acontece aqui). NÃO re-baixar no checkout.
 *       - removerItem  → cancelSaleWithStockRestore (restaura estoque já
 *         baixado, tratando compostos/frações server-side).
 *       - fecharComanda → RPC fechar_comanda APENAS finaliza as vendas
 *         `pending` da sessão (marca completed + payments), fecha a sessão e
 *         libera a mesa. NÃO mexe em produtos/stock_movements (senão duplica a
 *         baixa — trigger fn_log_stock_changes + process_sale_transaction).
 *   • Sempre manter 1:1 com storageService — nunca duplicar lógica de estoque.
 */

export interface ItemComanda {
  saleId: string;
  saleItemId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  saleStatus: Sale['status'];
  kitchenStatus?: Sale['kitchenStatus'];
  createdAt: string;
}

export interface AddItemInput {
  product: Product;
  quantity: number;
  session: CustomerSession;
  operatorName: string;
  operatorId: string;
}

export interface FecharComandaResult {
  success: boolean;
  message?: string;
  saleId?: string;
  alreadyClosed?: boolean;
  total?: number;
}

/** Consolida todas as vendas `pending` da sessão em itens flat (para a UI). */
export function buscarItens(comandaId: string): ItemComanda[] {
  const sales = storageService.getSales().filter(
    (s) => s.customerSessionId === comandaId && s.status === 'pending'
  );
  const items: ItemComanda[] = [];
  for (const sale of sales) {
    for (const it of sale.items || []) {
      items.push({
        saleId: sale.id,
        saleItemId: `${sale.id}-${it.productId}`,
        productId: it.productId,
        productName: it.productName,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        total: it.total ?? it.unitPrice * it.quantity,
        saleStatus: sale.status,
        kitchenStatus: sale.kitchenStatus,
        createdAt: sale.date || sale.updatedAt || '',
      });
    }
  }
  return items;
}

/** Soma das vendas `pending` da sessão. */
export function getTotalComanda(comandaId: string): number {
  return storageService
    .getSales()
    .filter((s) => s.customerSessionId === comandaId && s.status === 'pending')
    .reduce((acc, s) => acc + (s.total > 0 ? s.total : (s.items?.reduce((x, i) => x + (i.total || 0), 0) || 0)), 0);
}

/**
 * Abre (ou reabre) a comanda de uma mesa pelo OPERADOR — decisão 2026-09-06
 * (frente "mesa travada"/"mesas livres não aparecem"):
 *
 *   1. Mesa com sessão ACTIVE   → REUTILIZA a existente (a sessão da mesa é
 *      única; o operador gerencia a mesma do celular do cliente, multi-dispositivo).
 *   2. Mesa com sessão anterior (completed/cancelled) → REATIVA a existente
 *      (preserva histórico/vendas daquela sessão; limpa closedAt).
 *   3. Mesa sem nenhuma sessão  → cria sessão nova (status 'active').
 *   4. Vendas PENDING da mesa SEM customerSessionId (órfãs — comanda criada
 *      antes do fluxo de sessão, ex.: mesa 1 "travada") são ANEXADAS à sessão
 *      via saveSale (UPSERT DE HEADER — NUNCA addSale, que re-baixaria o
 *      estoque; a baixa atômica já aconteceu no adicionarItem original).
 *
 * Retorna a sessão ativa resultante + quantas vendas órfãs foram anexadas.
 */
export function abrirComanda(table: Table): { session: CustomerSession; attached: number } {
  const all = storageService.getCustomerSessions().filter((s) => s.tableId === table.id);
  let session: CustomerSession | null = all.find((s) => s.status === 'active') || null;
  let attached = 0;

  if (!session) {
    const previous = all.find((s) => s.status !== 'active');
    if (previous) {
      session = {
        ...previous,
        status: 'active',
        closedAt: undefined,
        customerName: undefined,
        updatedAt: new Date().toISOString(),
      };
    } else {
      session = {
        id: `ses-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        tableId: table.id,
        sessionToken: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
        status: 'active',
        openedAt: new Date().toISOString(),
        storeBranchId: table.storeBranchId,
        organizationId: table.organizationId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    storageService.saveCustomerSession(session);
  }

  // Anexa vendas pendentes órfãs da mesa (só atualiza o header — itens e baixa
  // de estoque permanecem como estavam).
  const orphans = storageService.getSales().filter(
    (s) => s.tableId === table.id && !s.customerSessionId && s.status === 'pending'
  );
  for (const s of orphans) {
    storageService.saveSale({ ...s, customerSessionId: session.id, updatedAt: new Date().toISOString() });
    attached += 1;
  }

  return { session, attached };
}

/**
 * Adiciona um item à comanda. Cria uma venda `pending` vinculada à sessão/mesa
 * via storageService.addSale — que já baixa o estoque atomicamente no servidor
 * (process_sale_transaction) e cria sale_items. Estoque NÃO é reservado; é
 * baixado aqui (modelo híbrido aprovado pelo usuário: baixa ao adicionar).
 */
export async function adicionarItem(input: AddItemInput): Promise<{ success: boolean; message?: string }> {
  if (input.quantity < 1) return { success: false, message: 'Quantidade inválida.' };
  if (!input.product?.id) return { success: false, message: 'Selecione um produto.' };

  const unitPrice = input.product.salePrice || 0;
  const total = unitPrice * input.quantity;
  const now = new Date().toISOString();

  const sale: Sale = {
    id: `sale-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    code: `VEN-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
    date: now,
    operatorId: input.operatorId,
    operatorName: input.operatorName,
    customerName: input.session.customerName || 'Cliente Não Identificado',
    storeBranchId: input.session.storeBranchId || storageService.getSelectedBranchId(),
    organizationId: input.session.organizationId,
    tableId: input.session.tableId || undefined,
    customerSessionId: input.session.id,
    // 'comanda' (operador) ≠ 'cardapio_digital' (QR do cliente): o KDS/Pedidos e o
    // celular do cliente só mostram as vendas via cardápio — item do operador é
    // interno à ComandaView e segue para o checkout normalmente (por sessão).
    orderSource: 'comanda',
    kitchenStatus: 'pending',
    items: [
      {
        productId: input.product.id,
        productName: input.product.name,
        unitPrice,
        quantity: input.quantity,
        total,
      },
    ],
    subtotal: total,
    discount: 0,
    total,
    payments: [],
    status: 'pending',
    updatedAt: now,
  };

  return storageService.addSale(sale);
}

/**
 * Remove um item (venda) da comanda, RESTAURANDO o estoque já baixado.
 * Sempre remover a venda inteira — a baixa foi feita por venda (addSale),
 * então `cancelSaleWithStockRestore` restaura de forma consistente (normal,
 * composto e fração via cancel_sale_atomic server-side).
 */
export async function removerItem(saleId: string): Promise<{ success: boolean; message?: string }> {
  if (!saleId) return { success: false, message: 'Item sem venda associada.' };
  return storageService.cancelSaleWithStockRestore(saleId);
}

/**
 * Finaliza a comanda: chama a RPC `fechar_comanda` (SECURITY DEFINER, atômica
 * e idempotente) que marca todas as vendas `pending` da sessão como completed,
 * aplica os payments, fecha a sessão e libera a mesa.
 *
 * Retorna sync do resultado ao local (fecha a sessão local para a lista
 * atualizar). O estoque já foi baixado nos adicionarItem → NÃO duplica.
 */
export async function fecharComanda(
  comandaId: string,
  payments: PaymentDetails[],
  operatorName: string
): Promise<FecharComandaResult> {
  try {
    const normalized: any[] = (payments || []).map((p) => ({
      method: p.method,
      amount: Number(p.amount) || 0,
      cashGiven: p.cashGiven,
      changeDue: p.changeDue,
      installments: p.installments,
      cardBrand: p.cardBrand,
      pixTxId: p.pixTxId,
    }));

    const { data, error } = await supabase.rpc('fechar_comanda', {
      p_session_id: comandaId,
      p_payments: normalized,
      p_operator_name: operatorName,
    });

    if (error) {
      return { success: false, message: error.message };
    }

    const res = (data || {}) as any;
    if (res.success === false) {
      return { success: false, message: res.message || 'Não foi possível fechar a comanda.' };
    }

    // Sincroniza o fechamento da sessão no local (para a lista atualizar
    // imediatamente, sem esperar o eco do Realtime).
    const session = storageService.getCustomerSessions().find((s) => s.id === comandaId);
    if (session) {
      storageService.saveCustomerSession({
        ...session,
        status: 'completed',
        closedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    return {
      success: true,
      saleId: res.session_id || comandaId,
      alreadyClosed: !!res.already_closed,
      total: res.total,
      message: res.message,
    };
  } catch (e: any) {
    return { success: false, message: e?.message || 'Erro inesperado ao fechar a comanda.' };
  }
}
