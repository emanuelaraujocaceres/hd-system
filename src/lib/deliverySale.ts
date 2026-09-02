import type { DeliveryOrder, Sale } from '../types';

/**
 * Monta uma Sale a partir de um pedido de delivery NATIVO no momento em que
 * ele é marcado como "Entregue" (ver DeliveryBoardView.finalizeNativeDeliverySale).
 *
 * Isso faz o pedido de delivery nativo entrar no Financeiro/caixa/estoque da
 * mesma forma que o fluxo do cardápio digital: quem deduz o estoque é o
 * storageService.addSale() (RPC process_sale_transaction / transação local).
 *
 * Vínculo de rastreabilidade:
 * - sale.orderSource = 'delivery'
 * - sale.deliveryOrderId = order.id (delivery → venda)
 * - status 'completed', kitchenStatus 'delivered'
 * - payments derivados de order.paymentMethod (fallback: cash)
 */
export function buildSaleFromDeliveryOrder(
  order: DeliveryOrder,
  user: { id: string; name?: string; username?: string },
): Sale {
  const payments: Sale['payments'] = order.paymentMethod
    ? [{ method: order.paymentMethod as any, amount: order.total }]
    : [{ method: 'cash', amount: order.total }];

  const code =
    'DEL-' +
    (order.orderNumber ? String(order.orderNumber) : order.id.slice(0, 6).toUpperCase());

  return {
    id: crypto.randomUUID(),
    code,
    date: new Date().toISOString(),
    operatorId: user.id,
    operatorName: user.name || user.username || 'Delivery',
    customerId: order.customerId,
    customerName: order.customerName || 'Cliente',
    storeBranchId: order.storeBranchId,
    organizationId: order.organizationId,
    items: (order.items || []).map((it) => ({
      productId: it.productId || '',
      productName: it.productName,
      unitPrice: it.unitPrice ?? (it.total / (it.quantity || 1)),
      quantity: it.quantity,
      total: it.total,
    })),
    subtotal: order.subtotal ?? order.total,
    discount: order.discount || 0,
    total: order.total,
    payments,
    status: 'completed',
    kitchenStatus: 'delivered',
    orderSource: 'delivery',
    deliveryOrderId: order.id,
    notes: order.notes,
    updatedAt: new Date().toISOString(),
  };
}
