/**
 * Testes unitários de printService.ts
 *
 * Testa apenas funções PURAS / síncronas que NÃO dependem de transporte (WebUSB/Serial):
 *  - buildEscPos: gera bytes ESC/POS com init, alinhamento, bold, size, LF, feed, cut
 *  - buildTestPageEscPos: monta página de teste com nome da impressora
 *  - buildReceiptEscPos: layout do cupom de venda (troco, labelMap, itens)
 *  - getCaixaPrinter: encontra impressora caixa ou fallback
 *  - buildOrderReceiptEscPos: cupom de pedido (sem pagamento)
 *
 * NÃO testa printThermalReceipt / printKitchenOrder / etc. (dependem de DOM/USB/Serial).
 */
import { describe, it, expect } from 'vitest';
import {
  buildEscPos,
  buildTestPageEscPos,
  buildReceiptEscPos,
  buildOrderReceiptEscPos,
  buildDeliveryTicketEscPos,
  getCaixaPrinter,
} from './printService';
import type { Printer, Sale, SystemSettings, DeliveryOrder } from '../types';

// ─── helpers ────────────────────────────────────────────────────

const mkPrinter = (id: string, overrides?: Partial<Printer>): Printer => ({
  id,
  name: id,
  transport: 'webusb',
  isDefault: false,
  ...overrides,
});

const mkSettings = (overrides?: Partial<SystemSettings>): SystemSettings => ({
  companyName: 'Teste LTDA',
  tradeName: 'Loja Teste',
  cnpj: '12345678901234',
  ie: '123456789',
  phone: '(11) 99999-0000',
  address: 'Rua Teste, 123',
  city: 'São Paulo',
  state: 'SP',
  pixKey: 'pix@test.com',
  autoPrintReceipt: false,
  soundEffectsEnabled: true,
  receiptHeaderMsg: 'Obrigado pela preferência!',
  receiptFooterMsg: 'Volte sempre!',
  ...overrides,
});

const mkSale = (overrides?: Partial<Sale>): Sale => ({
  id: 'sale-001',
  code: 'VEN-001',
  date: '2026-01-15T10:30:00Z',
  operatorId: 'op-1',
  operatorName: 'Operador Teste',
  customerName: 'Cliente Exemplo',
  storeBranchId: 'branch-1',
  items: [
    {
      productId: 'p1',
      productName: 'Hambúrguer',
      unitPrice: 25.0,
      quantity: 2,
      total: 50.0,
    },
  ],
  subtotal: 50.0,
  discount: 0,
  total: 50.0,
  payments: [{ method: 'cash', amount: 60.0, cashGiven: 60.0, changeDue: 10.0 }],
  status: 'completed',
  ...overrides,
});

// ─── buildEscPos ───────────────────────────────────────────────

describe('buildEscPos', () => {
  it('retorna Uint8Array', () => {
    const result = buildEscPos([]);
    expect(result).toBeInstanceOf(Uint8Array);
  });

  it('começa com ESC @ (inicialização)', () => {
    const result = buildEscPos([]);
    // ESC=0x1b, @=0x40
    expect(result[0]).toBe(0x1b);
    expect(result[1]).toBe(0x40);
  });

  it('termina com avanço 3 linhas + corte total', () => {
    const result = buildEscPos([]);
    const bytes = Array.from(result);
    // Últimos 6 bytes: ESC 0x64 0x03 (feed 3) + GS 0x56 0x00 (corte total)
    expect(bytes[bytes.length - 6]).toBe(0x1b); // ESC
    expect(bytes[bytes.length - 5]).toBe(0x64); // feed
    expect(bytes[bytes.length - 4]).toBe(3);     // 3 linhas
    expect(bytes[bytes.length - 3]).toBe(0x1d); // GS
    expect(bytes[bytes.length - 2]).toBe(0x56); // cut
    expect(bytes[bytes.length - 1]).toBe(0x00); // modo de corte
  });

  it('inclui conteúdo de texto em linha simples', () => {
    const result = buildEscPos([{ text: 'Ola' }]);
    const decoded = new TextDecoder().decode(result);
    expect(decoded).toContain('Ola');
  });

  it('gera LF (0x0a) após cada linha', () => {
    const result = buildEscPos([{ text: 'Linha1' }, { text: 'Linha2' }]);
    const bytes = Array.from(result);
    const lfCount = bytes.filter((b) => b === 0x0a).length;
    // 2 linhas + 1 feed (0x0a no skip implícito do feed) + 1 do advance = pelo menos 2 LF das linhas
    // na verdade: init(2) + ESC 0x61 + ESC 0x45 + GS 0x21 + text + LF, 2x
    // então pelo menos 2 LF — os da feed e cut não são 0x0a sozinhos
    expect(lfCount).toBeGreaterThanOrEqual(2);
  });

  it('linha skip gera apenas LF', () => {
    const result = buildEscPos([{ skip: true }]);
    const bytes = Array.from(result);
    // init(2) + LF + feed + cut
    // O LF do skip deve existir
    expect(bytes.includes(0x0a)).toBe(true);
  });

  it('alinhamento centralizado (1) gera ESC 0x61 0x01', () => {
    const result = buildEscPos([{ text: 'Centro', align: 1 }]);
    const bytes = Array.from(result);
    const idx = bytes.indexOf(0x61);
    expect(idx).toBeGreaterThan(0);
    expect(bytes[idx - 1]).toBe(0x1b); // ESC antes de 0x61
    expect(bytes[idx + 1]).toBe(1);     // align=1
  });

  it('alinhamento direita (2) gera ESC 0x61 0x02', () => {
    const result = buildEscPos([{ text: 'Dir', align: 2 }]);
    const bytes = Array.from(result);
    const idx = bytes.indexOf(0x61);
    expect(bytes[idx + 1]).toBe(2);
  });

  it('bold on gera ESC 0x45 0x01', () => {
    const result = buildEscPos([{ text: 'Negrito', bold: true }]);
    const bytes = Array.from(result);
    const idx = bytes.indexOf(0x45);
    expect(bytes[idx - 1]).toBe(0x1b);
    expect(bytes[idx + 1]).toBe(1);
  });

  it('bold off gera ESC 0x45 0x00', () => {
    const result = buildEscPos([{ text: 'Normal', bold: false }]);
    const bytes = Array.from(result);
    const idx = bytes.indexOf(0x45);
    expect(bytes[idx + 1]).toBe(0);
  });

  it('size 19 (dupla largura+altura) gera GS 0x21 0x13', () => {
    const result = buildEscPos([{ text: 'Grande', size: 19 }]);
    const bytes = Array.from(result);
    const idx = bytes.indexOf(0x21);
    expect(idx).toBeGreaterThan(0);
    expect(bytes[idx - 1]).toBe(0x1d); // GS
    expect(bytes[idx + 1]).toBe(19);
  });
});

// ─── buildTestPageEscPos ───────────────────────────────────────

describe('buildTestPageEscPos', () => {
  it('retorna Uint8Array', () => {
    const printer = mkPrinter('Minha Impressora');
    const result = buildTestPageEscPos(printer);
    expect(result).toBeInstanceOf(Uint8Array);
  });

  it('contém o nome da impressora', () => {
    const printer = mkPrinter('Impressora Bar');
    const result = buildTestPageEscPos(printer);
    const decoded = new TextDecoder().decode(result);
    expect(decoded).toContain('Impressora Bar');
  });

  it('contém o transporte da impressora', () => {
    const printer = mkPrinter('P1', { transport: 'serial' });
    const result = buildTestPageEscPos(printer);
    const decoded = new TextDecoder().decode(result);
    expect(decoded).toContain('serial');
  });

  it('contém texto de validação', () => {
    const printer = mkPrinter('P1');
    const result = buildTestPageEscPos(printer);
    const decoded = new TextDecoder().decode(result);
    expect(decoded).toContain('PAGINA DE TESTE');
    expect(decoded).toContain('a impressao esta OK!');
  });

  it('contém "HD-SYSTEM" no header', () => {
    const printer = mkPrinter('P1');
    const result = buildTestPageEscPos(printer);
    const decoded = new TextDecoder().decode(result);
    expect(decoded).toContain('HD-SYSTEM');
  });
});

// ─── buildReceiptEscPos ────────────────────────────────────────

describe('buildReceiptEscPos', () => {
  it('retorna Uint8Array com bytes ESC/POS', () => {
    const sale = mkSale();
    const settings = mkSettings();
    const result = buildReceiptEscPos(sale, settings);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result[0]).toBe(0x1b); // ESC init
  });

  it('contém tradeName no header', () => {
    const settings = mkSettings({ tradeName: 'Minha Loja' });
    const sale = mkSale();
    const result = buildReceiptEscPos(sale, settings);
    const decoded = new TextDecoder().decode(result);
    expect(decoded).toContain('Minha Loja');
  });

  it('contém CNPJ', () => {
    const settings = mkSettings({ cnpj: '99999999999999' });
    const sale = mkSale();
    const result = buildReceiptEscPos(sale, settings);
    const decoded = new TextDecoder().decode(result);
    expect(decoded).toContain('99999999999999');
  });

  it('contém código da venda', () => {
    const sale = mkSale({ code: 'VEN-4242' });
    const result = buildReceiptEscPos(sale, mkSettings());
    const decoded = new TextDecoder().decode(result);
    expect(decoded).toContain('VEN-4242');
  });

  it('contém nome do operador', () => {
    const sale = mkSale({ operatorName: 'João' });
    const result = buildReceiptEscPos(sale, mkSettings());
    const decoded = new TextDecoder().decode(result);
    expect(decoded).toContain('João');
  });

  it('contém nome do cliente', () => {
    const sale = mkSale({ customerName: 'Maria' });
    const result = buildReceiptEscPos(sale, mkSettings());
    const decoded = new TextDecoder().decode(result);
    expect(decoded).toContain('Maria');
  });

  it('usa "Consumidor Nao Identificado" quando customerName é vazio', () => {
    const sale = mkSale({ customerName: undefined });
    const result = buildReceiptEscPos(sale, mkSettings());
    const decoded = new TextDecoder().decode(result);
    expect(decoded).toContain('Consumidor Nao Identificado');
  });

  it('contém itens com preço', () => {
    const sale = mkSale({
      items: [{ productId: 'p1', productName: 'Pizza', unitPrice: 40.0, quantity: 1, total: 40.0 }],
    });
    const result = buildReceiptEscPos(sale, mkSettings());
    const decoded = new TextDecoder().decode(result);
    expect(decoded).toContain('Pizza');
    expect(decoded).toContain('40.00');
  });

  it('contém subtotal e total', () => {
    const sale = mkSale({ subtotal: 50.0, total: 50.0 });
    const result = buildReceiptEscPos(sale, mkSettings());
    const decoded = new TextDecoder().decode(result);
    expect(decoded).toContain('Subtotal: R$ 50.00');
    expect(decoded).toContain('TOTAL: R$ 50.00');
  });

  it('exibe desconto quando > 0', () => {
    const sale = mkSale({ discount: 5.0, total: 45.0 });
    const result = buildReceiptEscPos(sale, mkSettings());
    const decoded = new TextDecoder().decode(result);
    expect(decoded).toContain('Desconto: -R$ 5.00');
  });

  it('NÃO exibe desconto quando é 0', () => {
    const sale = mkSale({ discount: 0 });
    const result = buildReceiptEscPos(sale, mkSettings());
    const decoded = new TextDecoder().decode(result);
    expect(decoded).not.toContain('Desconto');
  });

  describe('labelMap dos métodos de pagamento', () => {
    it('cash → "Dinheiro"', () => {
      const sale = mkSale({ payments: [{ method: 'cash', amount: 50.0 }] });
      const result = buildReceiptEscPos(sale, mkSettings());
      const decoded = new TextDecoder().decode(result);
      expect(decoded).toContain('Dinheiro');
    });

    it('pix → "PIX"', () => {
      const sale = mkSale({ payments: [{ method: 'pix', amount: 50.0 }] });
      const result = buildReceiptEscPos(sale, mkSettings());
      const decoded = new TextDecoder().decode(result);
      expect(decoded).toContain('PIX');
    });

    it('credit_card → "Cartao de Credito"', () => {
      const sale = mkSale({ payments: [{ method: 'credit_card', amount: 50.0 }] });
      const result = buildReceiptEscPos(sale, mkSettings());
      const decoded = new TextDecoder().decode(result);
      expect(decoded).toContain('Cartao de Credito');
    });

    it('debit_card → "Cartao de Debito"', () => {
      const sale = mkSale({ payments: [{ method: 'debit_card', amount: 50.0 }] });
      const result = buildReceiptEscPos(sale, mkSettings());
      const decoded = new TextDecoder().decode(result);
      expect(decoded).toContain('Cartao de Debito');
    });

    it('credit_account → "Fiado / Credito Cliente"', () => {
      const sale = mkSale({ payments: [{ method: 'credit_account', amount: 50.0 }] });
      const result = buildReceiptEscPos(sale, mkSettings());
      const decoded = new TextDecoder().decode(result);
      expect(decoded).toContain('Fiado / Credito Cliente');
    });
  });

  describe('troco (changeDue)', () => {
    it('exibe troco quando changeDue > 0', () => {
      const sale = mkSale({
        payments: [{ method: 'cash', amount: 60.0, cashGiven: 60.0, changeDue: 10.0 }],
      });
      const result = buildReceiptEscPos(sale, mkSettings());
      const decoded = new TextDecoder().decode(result);
      expect(decoded).toContain('Troco: R$ 10.00');
    });

    it('NÃO exibe troco quando changeDue é 0 ou ausente', () => {
      const sale = mkSale({
        payments: [{ method: 'pix', amount: 50.0 }],
      });
      const result = buildReceiptEscPos(sale, mkSettings());
      const decoded = new TextDecoder().decode(result);
      expect(decoded).not.toContain('Troco');
    });
  });

  it('contém obs quando notes existe', () => {
    const sale = mkSale({ notes: 'Sem cebola' });
    const result = buildReceiptEscPos(sale, mkSettings());
    const decoded = new TextDecoder().decode(result);
    expect(decoded).toContain('Sem cebola');
  });

  it('NÃO exibe obs quando notes é vazio', () => {
    const sale = mkSale({ notes: undefined });
    const result = buildReceiptEscPos(sale, mkSettings());
    const decoded = new TextDecoder().decode(result);
    expect(decoded).not.toContain('Obs:');
  });

  it('usa o nome da filial no rodapé (sem LTDA nem rodapé customizado)', () => {
    const settings = mkSettings({
      companyName: 'Teste LTDA',
      receiptHeaderMsg: 'Bem-vindo!',
      receiptFooterMsg: 'Volte sempre!',
    });
    const result = buildReceiptEscPos(mkSale(), settings, 'Filial Centro');
    const decoded = new TextDecoder().decode(result);
    expect(decoded).toContain('Filial Centro');
    expect(decoded).not.toContain('Teste LTDA');
    expect(decoded).not.toContain('Bem-vindo!');
    expect(decoded).not.toContain('Volte sempre!');
  });

  it('sem storeName usa receiptHeaderMsg como fallback e não imprime footerMsg', () => {
    const settings = mkSettings({
      receiptHeaderMsg: 'Bem-vindo!',
      receiptFooterMsg: 'Volte sempre!',
    });
    const result = buildReceiptEscPos(mkSale(), settings);
    const decoded = new TextDecoder().decode(result);
    expect(decoded).toContain('Bem-vindo!');
    expect(decoded).not.toContain('Volte sempre!');
  });

  it('usa "HD-SYSTEM" como fallback de tradeName', () => {
    const settings = mkSettings({ tradeName: '' });
    const result = buildReceiptEscPos(mkSale(), settings);
    const decoded = new TextDecoder().decode(result);
    expect(decoded).toContain('HD-SYSTEM');
  });

  it('contém header e footer de "COMPROVANTE NAO FISCAL"', () => {
    const result = buildReceiptEscPos(mkSale(), mkSettings());
    const decoded = new TextDecoder().decode(result);
    expect(decoded).toContain('*** COMPROVANTE NAO FISCAL ***');
    expect(decoded).toContain('COMPROVANTE DE VENDA');
  });
});

// ─── buildOrderReceiptEscPos ──────────────────────────────────

describe('buildOrderReceiptEscPos', () => {
  const settings = mkSettings();

  it('retorna Uint8Array', () => {
    const sale = mkSale();
    const result = buildOrderReceiptEscPos(sale, settings);
    expect(result).toBeInstanceOf(Uint8Array);
  });

  it('contém "COMPROVANTE DE PEDIDO"', () => {
    const sale = mkSale();
    const result = buildOrderReceiptEscPos(sale, settings);
    const decoded = new TextDecoder().decode(result);
    expect(decoded).toContain('COMPROVANTE DE PEDIDO');
  });

  it('contém tradeName no header', () => {
    const s = mkSettings({ tradeName: 'Bar do Zé' });
    const sale = mkSale();
    const result = buildOrderReceiptEscPos(sale, s);
    const decoded = new TextDecoder().decode(result);
    expect(decoded).toContain('Bar do Zé');
  });

  it('NÃO contém companyName (LTDA) no header', () => {
    const s = mkSettings({ companyName: 'Teste LTDA' });
    const sale = mkSale();
    const result = buildOrderReceiptEscPos(sale, s);
    const decoded = new TextDecoder().decode(result);
    expect(decoded).not.toContain('Teste LTDA');
  });

  it('mostra "Mesa: ..." quando table é fornecida', () => {
    const sale = mkSale();
    const table = { id: 't1', name: 'Mesa 5' } as any;
    const result = buildOrderReceiptEscPos(sale, settings, table);
    const decoded = new TextDecoder().decode(result);
    expect(decoded).toContain('Mesa: Mesa 5');
  });

  it('mostra "DELIVERY" quando orderSource é delivery sem table', () => {
    const sale = mkSale({ orderSource: 'delivery' });
    const result = buildOrderReceiptEscPos(sale, settings);
    const decoded = new TextDecoder().decode(result);
    expect(decoded).toContain('DELIVERY');
  });

  it('mostra "PEDIDO" quando não há table nem delivery', () => {
    const sale = mkSale({ orderSource: undefined });
    const result = buildOrderReceiptEscPos(sale, settings);
    const decoded = new TextDecoder().decode(result);
    expect(decoded).toContain('PEDIDO');
  });

  it('contém itens e total', () => {
    const sale = mkSale({
      items: [{ productId: 'p1', productName: 'Cerveja', unitPrice: 12.0, quantity: 3, total: 36.0 }],
      total: 36.0,
    });
    const result = buildOrderReceiptEscPos(sale, settings);
    const decoded = new TextDecoder().decode(result);
    expect(decoded).toContain('Cerveja');
    expect(decoded).toContain('TOTAL: R$ 36.00');
  });

  it('NÃO contém FORMA DE PAGAMENTO (cupom de pedido não mostra pagamento)', () => {
    const sale = mkSale({
      payments: [{ method: 'pix', amount: 50.0 }],
    });
    const result = buildOrderReceiptEscPos(sale, settings);
    const decoded = new TextDecoder().decode(result);
    expect(decoded).not.toContain('FORMA DE PAGAMENTO');
  });

  it('mostra cliente quando customerName existe', () => {
    const sale = mkSale({ customerName: 'Carlos' });
    const result = buildOrderReceiptEscPos(sale, settings);
    const decoded = new TextDecoder().decode(result);
    expect(decoded).toContain('Carlos');
  });

  it('mostra notes quando existe', () => {
    const sale = mkSale({ notes: 'Sem gelo' });
    const result = buildOrderReceiptEscPos(sale, settings);
    const decoded = new TextDecoder().decode(result);
    expect(decoded).toContain('Sem gelo');
  });
});

// ─── getCaixaPrinter ──────────────────────────────────────────

describe('getCaixaPrinter', () => {
  it('retorna null para array vazio', () => {
    expect(getCaixaPrinter([])).toBeNull();
  });

  it('retorna null para null/undefined', () => {
    expect(getCaixaPrinter(null as any)).toBeNull();
    expect(getCaixaPrinter(undefined as any)).toBeNull();
  });

  it('prioriza impressora com role "caixa"', () => {
    const pBar = mkPrinter('bar', { role: 'bar' });
    const pCaixa = mkPrinter('caixa', { role: 'caixa' });
    expect(getCaixaPrinter([pBar, pCaixa])?.id).toBe('caixa');
  });

  it('retorna primeira não-OS quando não há caixa', () => {
    const pOs = mkPrinter('os', { transport: 'os' });
    const pWeb = mkPrinter('web', { transport: 'webusb' });
    expect(getCaixaPrinter([pOs, pWeb])?.id).toBe('web');
  });

  it('retorna null quando todas são OS (filtradas pelo active)', () => {
    // getCaixaPrinter filtra transport !== 'os' antes de buscar caixa;
    // se todas são OS, a lista active fica vazia → retorna null
    const pOs1 = mkPrinter('os1', { transport: 'os' });
    const pOs2 = mkPrinter('os2', { transport: 'os' });
    expect(getCaixaPrinter([pOs1, pOs2])).toBeNull();
  });

  it('filtra impressoras OS antes de buscar caixa', () => {
    // Uma impressora OS com role caixa NÃO deve ser preferida sobre uma não-OS
    const pOsCaixa = mkPrinter('os-caixa', { transport: 'os', role: 'caixa' });
    const pWeb = mkPrinter('web', { transport: 'webusb', role: 'bar' });
    // pOsCaixa é OS, então é filtrada → fallback é pWeb (primeira não-OS)
    expect(getCaixaPrinter([pOsCaixa, pWeb])?.id).toBe('web');
  });
});

// ─── buildDeliveryTicketEscPos ────────────────────────────────

const mkDeliveryOrder = (overrides?: Partial<DeliveryOrder>): DeliveryOrder => ({
  id: 'order-1',
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
  paymentMethod: 'cash',
  changeAmount: 50,
  deliveryAddress: { street: 'Rua das Flores', number: '123', complement: 'Apto 5', neighborhood: 'Centro', city: 'São Paulo', state: 'SP', zip: '01000-000' },
  customerName: 'Carlos Silva',
  customerWhatsapp: '(11) 98888-7777',
  notes: 'Sem cebola',
  whatsappSent: false,
  createdAt: '2026-08-01T12:00:00Z',
  updatedAt: '2026-08-01T12:00:00Z',
  ...overrides,
});

describe('buildDeliveryTicketEscPos', () => {
  it('inclui dados de entrega (endereço, telefone, pagamento, troco) no ticket', () => {
    const order = mkDeliveryOrder();
    const result = buildDeliveryTicketEscPos(order, mkSettings());
    const decoded = new TextDecoder().decode(result);
    expect(decoded).toContain('TICKET DE ENTREGA');
    expect(decoded).toContain('Rua das Flores');
    expect(decoded).toContain('(11) 98888-7777');
    expect(decoded).toContain('Dinheiro');
    expect(decoded).toContain('Troco para');
    expect(decoded).toContain('Pizza');
    expect(decoded).toContain('TOTAL: R$ 47.00');
  });

  it('não exibe endereço no modo retirada (pickup)', () => {
    const order = mkDeliveryOrder({ orderType: 'pickup' });
    const result = buildDeliveryTicketEscPos(order, mkSettings());
    const decoded = new TextDecoder().decode(result);
    expect(decoded).toContain('Retirada no estabelecimento');
    expect(decoded).not.toContain('Endereco');
  });

  it('lida com pagamento PIX sem troco', () => {
    const order = mkDeliveryOrder({ paymentMethod: 'pix', changeAmount: undefined });
    const result = buildDeliveryTicketEscPos(order, mkSettings());
    const decoded = new TextDecoder().decode(result);
    expect(decoded).toContain('PIX');
    expect(decoded).not.toContain('Troco para');
  });
});
