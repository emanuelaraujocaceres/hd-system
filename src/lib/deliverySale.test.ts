/**
 * Testes do helper buildSaleFromDeliveryOrder (src/lib/deliverySale.ts)
 *
 * Garante que um pedido de delivery NATIVO, ao ser entregue, vira uma Sale
 * consistente com o fluxo do cardápio: orderSource 'delivery', deliveryOrderId
 * (rastreabilidade), payments derivados do pedido e itens mapeados corretamente.
 */
import { describe, it, expect } from 'vitest';
import type { DeliveryOrder } from '../types';
import { buildSaleFromDeliveryOrder } from './deliverySale';

const mkOrder = (overrides?: Partial<DeliveryOrder>): DeliveryOrder => ({
  id: 'order-abc123',
  organizationId: 'org-1',
  storeBranchId: 'branch-1',
  orderNumber: 42,
  orderType: 'delivery',
  status: 'out_for_delivery',
  items: [
    { productId: 'p1', productName: 'Pizza', unitPrice: 30, quantity: 1, total: 30 },
    { productId: 'p2', productName: 'Refrigerante', unitPrice: 6, quantity: 2, total: 12 },
  ],
  subtotal: 42,
  deliveryFee: 5,
  discount: 0,
  total: 47,
  paymentMethod: 'pix',
  changeAmount: 0,
  customerId: 'cust-1',
  customerName: 'Carlos Silva',
  customerWhatsapp: '(11) 98888-7777',
  whatsappSent: true,
  createdAt: '2026-08-01T12:00:00Z',
  updatedAt: '2026-08-01T12:00:00Z',
  ...overrides,
});

describe('buildSaleFromDeliveryOrder', () => {
  it('monta Sale de delivery com rastreabilidade e payments do pedido', () => {
    const sale = buildSaleFromDeliveryOrder(mkOrder(), { id: 'op-1', name: 'Operador' });

    expect(sale.orderSource).toBe('delivery');
    expect(sale.deliveryOrderId).toBe('order-abc123');
    expect(sale.status).toBe('completed');
    expect(sale.kitchenStatus).toBe('delivered');
    expect(sale.code).toBe('DEL-42');
    expect(sale.operatorId).toBe('op-1');
    expect(sale.operatorName).toBe('Operador');
    expect(sale.customerName).toBe('Carlos Silva');
    expect(sale.customerId).toBe('cust-1');
    expect(sale.total).toBe(47);
    expect(sale.payments).toEqual([{ method: 'pix', amount: 47 }]);
    expect(sale.items).toEqual([
      { productId: 'p1', productName: 'Pizza', unitPrice: 30, quantity: 1, total: 30 },
      { productId: 'p2', productName: 'Refrigerante', unitPrice: 6, quantity: 2, total: 12 },
    ]);
  });

  it('usa fallback cash quando o pedido não tem forma de pagamento', () => {
    const sale = buildSaleFromDeliveryOrder(mkOrder({ paymentMethod: undefined }), { id: 'op-1', username: 'Zé' });
    expect(sale.payments).toEqual([{ method: 'cash', amount: 47 }]);
    // fallback de nome de operador
    expect(sale.operatorName).toBe('Zé');
  });

  it('gera código a partir do id quando não há orderNumber', () => {
    const sale = buildSaleFromDeliveryOrder(mkOrder({ orderNumber: 0, id: 'abc123xyz-guid' }), { id: 'op-1' });
    expect(sale.code).toBe('DEL-ABC123');
  });

  it('calcula unitPrice a partir do total quando o item não tem unitPrice', () => {
    const order = mkOrder({
      items: [{ productId: 'p1', productName: 'Bebida', unitPrice: undefined as any, quantity: 2, total: 10 }],
    });
    const sale = buildSaleFromDeliveryOrder(order, { id: 'op-1' });
    expect(sale.items[0].unitPrice).toBe(5);
    expect(sale.items[0].total).toBe(10);
  });
});
