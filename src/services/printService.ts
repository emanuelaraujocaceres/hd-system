/**
 * Serviço de impressão térmica (Frente 1)
 *
 * Gera cupom em ESC/POS e imprime por transporte:
 *  - webusb : impressora USB direto pelo navegador (Chrome/Edge — WebUSB)
 *  - serial : impressora serial / USB-CDC (Chrome/Edge — Web Serial)
 *  - os     : diálogo nativo do navegador (window.print) — tratado na UI
 *  - network: NÃO imprime direto do navegador (não há socket TCP bruto).
 *             Usar transporte OS, USB ou impressora compartilhada do sistema.
 *
 * O pareamento USB/Serial exige gesto do usuário (seletor do navegador).
 * Guardamos o device/porta em memória para reutilizar nas impressões seguintes
 * da mesma sessão — o operador precisa reconectar após recarregar a página.
 */

import { Sale, SystemSettings, Printer, Table, DeliveryOrder } from '../types';
import { storageService } from './storageService';

const ESC = 0x1b;
const GS = 0x1d;

// Handles de pareamento em memória (WebUSB / Web Serial)
let pairedUsbDevice: any = null;
let pairedSerialPort: any = null;

function str2bytes(s: string): number[] {
  return Array.from(new TextEncoder().encode(s));
}

export interface EscPosLine {
  text?: string;
  align?: 0 | 1 | 2;   // 0 esquerda | 1 centro | 2 direita
  bold?: boolean;
  size?: number;       // 0 normal | 17 dupla largura | 18 dupla altura | 19 dupla w+h
  skip?: boolean;      // linha vazia de espaçamento
}

/** Monta um comando ESC/POS completo (init → linhas → avanço → corte). */
export function buildEscPos(lines: EscPosLine[]): Uint8Array {
  const out: number[] = [ESC, 0x40]; // ESC @ — inicializa a impressora

  for (const ln of lines) {
    if (ln.skip) {
      out.push(0x0a);
      continue;
    }
    out.push(ESC, 0x61, ln.align ?? 0); // alinhamento
    out.push(ESC, 0x45, ln.bold ? 1 : 0); // negrito
    out.push(GS, 0x21, ln.size ?? 0);     // tamanho da fonte
    if (ln.text) out.push(...str2bytes(ln.text));
    out.push(0x0a); // LF — imprime e avança
  }

  out.push(ESC, 0x64, 3); // avanço de 3 linhas
  out.push(GS, 0x56, 0);  // corte total do papel
  return new Uint8Array(out);
}

/** Monta o cupom de venda (espelha o layout do ThermalReceiptModal). */
export function buildReceiptEscPos(sale: Sale, settings: SystemSettings, storeName?: string): Uint8Array {
  const line = (text: string, opts: Partial<EscPosLine> = {}): EscPosLine => ({ text, ...opts });

  const lines: EscPosLine[] = [
    line(settings.tradeName || 'HD-SYSTEM', { align: 1, bold: true, size: 19 }),
    line(`CNPJ: ${settings.cnpj || ''}`, { align: 1 }),
    line(`IE: ${settings.ie || ''}`, { align: 1 }),
    line(`${settings.address || ''} - ${settings.city || ''}/${settings.state || ''}`, { align: 1 }),
    line(`Tel: ${settings.phone || ''}`, { align: 1 }),
    line('', { skip: true }),
    line('COMPROVANTE DE VENDA', { align: 1, bold: true }),
    line('Documento Nao Fiscal', { align: 1 }),
    line('', { skip: true }),
    line(`Venda: #${sale.code}`, { bold: true }),
    line(`Data: ${new Date(sale.date).toLocaleString('pt-BR')}`),
    line(`Operador: ${sale.operatorName || ''}`),
    line(`Cliente: ${sale.customerName || 'Consumidor Nao Identificado'}`),
    ...(sale.notes ? [line(`Obs: ${sale.notes}`)] : []),
    line('', { skip: true }),
    line('ITEM                QTD   TOTAL', { bold: true }),
  ];

  sale.items.forEach((it, idx) => {
    lines.push(line(`${idx + 1}. ${it.productName}`, { bold: true }));
    lines.push(line(`    ${it.quantity}x R$ ${it.unitPrice.toFixed(2)} = R$ ${it.total.toFixed(2)}`, { align: 2 }));
  });

  lines.push(line('', { skip: true }));
  lines.push(line(`Subtotal: R$ ${sale.subtotal.toFixed(2)}`, { align: 2 }));
  if (sale.discount > 0) {
    lines.push(line(`Desconto: -R$ ${sale.discount.toFixed(2)}`, { align: 2 }));
  }
  lines.push(line(`TOTAL: R$ ${sale.total.toFixed(2)}`, { align: 2, bold: true, size: 19 }));

  lines.push(line('', { skip: true }));
  lines.push(line('FORMA DE PAGAMENTO:', { bold: true }));
  const labelMap: Record<string, string> = {
    cash: 'Dinheiro',
    pix: 'PIX',
    credit_card: 'Cartao de Credito',
    debit_card: 'Cartao de Debito',
    credit_account: 'Fiado / Credito Cliente',
  };
  sale.payments.forEach((p) => {
    lines.push(line(`${labelMap[p.method] || p.method}: R$ ${p.amount.toFixed(2)}`, { align: 2 }));
  });
  const change = sale.payments.find((p) => p.changeDue && p.changeDue > 0)?.changeDue;
  if (change) {
    lines.push(line(`Troco: R$ ${change.toFixed(2)}`, { align: 2 }));
  }

  lines.push(line('', { skip: true }));
  lines.push(line('*** COMPROVANTE NAO FISCAL ***', { align: 1, bold: true }));
  lines.push(line(storeName || settings.receiptHeaderMsg || '', { align: 1, bold: true }));

  return buildEscPos(lines);
}

/** Página de teste para validar a impressora durante a configuração. */
export function buildTestPageEscPos(printer: Printer): Uint8Array {
  const lines: EscPosLine[] = [
    { text: 'HD-SYSTEM', align: 1, bold: true, size: 19 },
    { text: 'PAGINA DE TESTE', align: 1, bold: true },
    { text: '', skip: true },
    { text: `Impressora: ${printer.name}` },
    { text: `Transporte: ${printer.transport}` },
    { text: `Data: ${new Date().toLocaleString('pt-BR')}` },
    { text: '', skip: true },
    { text: 'Se voce esta lendo isto,', align: 1 },
    { text: 'a impressao esta OK!', align: 1, bold: true },
  ];
  return buildEscPos(lines);
}

// ─── Transportes ────────────────────────────────────────────────────────

async function getUsbDevice(): Promise<any> {
  if (pairedUsbDevice) return pairedUsbDevice;
  const nav: any = navigator;
  if (!nav.usb) {
    throw new Error('WebUSB indisponivel neste navegador. Use Chrome/Edge ou o transporte "Sistema".');
  }
  // ClassCode 7 = impressora; se o filtro falhar, qualquer dispositivo funciona.
  pairedUsbDevice = await nav.usb.requestDevice({ filters: [{ classCode: 7 }] });
  return pairedUsbDevice;
}

async function printWebUsb(_printer: Printer, bytes: Uint8Array): Promise<void> {
  const device = await getUsbDevice();
  await device.open();
  try {
    const config = device.configurations?.[0];
    const iface =
      (config?.interfaces || []).find((i: any) => i.interfaceClass === 7) ||
      (config?.interfaces || [])[0];
    if (!iface) throw new Error('Nenhuma interface de impressora encontrada no dispositivo USB.');

    await device.claimInterface(iface.interfaceNumber);

    const endpoints = iface.alternate?.endpoints || [];
    const endpoint =
      endpoints.find((e: any) => e.direction === 'out' && e.type === 'bulk') ||
      endpoints.find((e: any) => e.direction === 'out');
    if (!endpoint) throw new Error('Nenhum endpoint de saida encontrado na impressora.');

    // Envia em chunks de 64 bytes (máximo seguro para bulk)
    const chunk = 64;
    for (let i = 0; i < bytes.length; i += chunk) {
      await device.transferOut(endpoint.endpointNumber, bytes.slice(i, i + chunk));
    }
  } finally {
    try { await device.close(); } catch { /* já fechado */ }
  }
}

async function getSerialPort(): Promise<any> {
  if (pairedSerialPort) return pairedSerialPort;
  const nav: any = navigator;
  if (!nav.serial) {
    throw new Error('Web Serial indisponivel neste navegador. Use Chrome/Edge ou o transporte "Sistema".');
  }
  pairedSerialPort = await nav.serial.requestPort();
  await pairedSerialPort.open({ baudRate: 9600 });
  return pairedSerialPort;
}

async function printSerial(_printer: Printer, bytes: Uint8Array): Promise<void> {
  const port = await getSerialPort();
  const writer = port.writable?.getWriter();
  if (!writer) throw new Error('Porta serial sem canal de escrita.');
  try {
    await writer.write(bytes);
  } finally {
    writer.releaseLock();
  }
}

// ─── API pública ────────────────────────────────────────────────────────

/** Imprime um cupom térmico na impressora indicada (webusb/serial). */
export async function printThermalReceipt(
  sale: Sale,
  settings: SystemSettings,
  printer: Printer,
): Promise<void> {
  const bytes = buildReceiptEscPos(sale, settings);
  if (printer.transport === 'webusb') return printWebUsb(printer, bytes);
  if (printer.transport === 'serial') return printSerial(printer, bytes);
  throw new Error(
    printer.transport === 'network'
      ? 'Transporte "Rede (IP)" nao imprime direto do navegador. Use USB, Serial ou "Sistema".'
      : 'Transporte nao suportado para impressao direta.',
  );
}

/** Página de teste para validação da impressora. */
export async function printTestPage(printer: Printer): Promise<void> {
  const bytes = buildTestPageEscPos(printer);
  if (printer.transport === 'webusb') return printWebUsb(printer, bytes);
  if (printer.transport === 'serial') return printSerial(printer, bytes);
  throw new Error(
    printer.transport === 'network'
      ? 'Transporte "Rede (IP)" nao imprime direto do navegador. Use USB, Serial ou "Sistema".'
      : 'Transporte nao suportado para impressao direta.',
  );
}

/** Imprime um pedido da cozinha/bar (uso do cardápio digital). */
export async function printKitchenOrder(
  sale: Sale,
  table: Table,
  printer: Printer,
): Promise<void> {
  const bytes = buildKitchenOrderEscPos(sale, table, printer);
  if (printer.transport === 'webusb') return printWebUsb(printer, bytes);
  if (printer.transport === 'serial') return printSerial(printer, bytes);
  throw new Error(
    printer.transport === 'network'
      ? 'Transporte "Rede (IP)" nao imprime direto do navegador. Use USB, Serial ou "Sistema".'
      : 'Transporte nao suportado para impressao direta.',
  );
}

/** Imprime apenas os items designados a uma impressora (cozinha/bar). */
export async function printRoutedItems(
  sale: Sale,
  table: Table,
  printer: Printer,
  items: Sale['items'],
  sectionLabel: string,
): Promise<void> {
  const bytes = buildRoutedItemsEscPos(sale, table, printer, items, sectionLabel);
  if (printer.transport === 'webusb') return printWebUsb(printer, bytes);
  if (printer.transport === 'serial') return printSerial(printer, bytes);
  throw new Error(
    printer.transport === 'network'
      ? 'Transporte "Rede (IP)" nao imprime direto do navegador. Use USB, Serial ou "Sistema".'
      : 'Transporte nao suportado para impressao direta.',
  );
}

/** Imprime comprovante de fechamento da comanda (caixa). */
export async function printComandaReceipt(
  sale: Sale,
  table: Table,
  printer: Printer,
  paymentMethod: string,
): Promise<void> {
  const bytes = buildComandaReceiptEscPos(sale, table, printer, paymentMethod);
  if (printer.transport === 'webusb') return printWebUsb(printer, bytes);
  if (printer.transport === 'serial') return printSerial(printer, bytes);
  throw new Error(
    printer.transport === 'network'
      ? 'Transporte "Rede (IP)" nao imprime direto do navegador. Use USB, Serial ou "Sistema".'
      : 'Transporte nao suportado para impressao direta.',
  );
}

/**
 * Monta o comando ESC/POS para pedido da cozinha/bar.
 * Mostra: mesa, código do pedido, itens com quantidades, hora.
 */
function buildKitchenOrderEscPos(sale: Sale, table: Table, printer: Printer): Uint8Array {
  const paperWidth = printer.model?.includes('58') ? 32 : 48;
  const lines: EscPosLine[] = [];

  // Header
  lines.push({ text: 'PEDIDO - COZINHA/BAR', align: 1, bold: true, size: 17 });
  lines.push({ skip: true });
  lines.push({ text: `Mesa: ${table.name}`, align: 0, bold: true });
  lines.push({ text: `Pedido: ${sale.code || sale.id.slice(-6)}`, align: 0 });
  lines.push({ text: `Hora: ${new Date(sale.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`, align: 0 });
  lines.push({ skip: true });

  // Items
  lines.push({ text: 'ITENS:', align: 0, bold: true });
  lines.push({ text: '-'.repeat(paperWidth) });
  for (const item of sale.items || []) {
    lines.push({ text: `${item.quantity}x ${item.productName}`, align: 0, bold: true });
  }
  lines.push({ text: '-'.repeat(paperWidth) });
  lines.push({ skip: true });
  lines.push({ text: `Total itens: ${sale.items?.reduce((a, i) => a + i.quantity, 0) || 0}`, align: 0 });

  return buildEscPos(lines);
}

/**
 * Monta o comando ESC/POS para items roteados (cozinha ou bar).
 * Mostra apenas os items designados a esta impressora.
 */
function buildRoutedItemsEscPos(
  sale: Sale,
  table: Table,
  printer: Printer,
  items: Sale['items'],
  sectionLabel: string,
): Uint8Array {
  const paperWidth = printer.model?.includes('58') ? 32 : 48;
  const lines: EscPosLine[] = [];

  // Header
  lines.push({ text: `PEDIDO - ${sectionLabel.toUpperCase()}`, align: 1, bold: true, size: 17 });
  lines.push({ skip: true });
  lines.push({ text: `Mesa: ${table.name}`, align: 0, bold: true });
  lines.push({ text: `Pedido: ${sale.code || sale.id.slice(-6)}`, align: 0 });
  lines.push({ text: `Hora: ${new Date(sale.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`, align: 0 });
  lines.push({ skip: true });

  // Items (apenas os desta impressora)
  lines.push({ text: `ITENS (${sectionLabel}):`, align: 0, bold: true });
  lines.push({ text: '-'.repeat(paperWidth) });
  for (const item of items) {
    lines.push({ text: `${item.quantity}x ${item.productName}`, align: 0, bold: true });
  }
  lines.push({ text: '-'.repeat(paperWidth) });

  return buildEscPos(lines);
}

/**
 * Monta o comando ESC/POS para comprovante de fechamento da comanda.
 * Mostra todos os items e o pagamento.
 */
function buildComandaReceiptEscPos(
  sale: Sale,
  table: Table,
  printer: Printer,
  paymentMethod: string,
): Uint8Array {
  const paperWidth = printer.model?.includes('58') ? 32 : 48;
  const lines: EscPosLine[] = [];

  const paymentLabels: Record<string, string> = {
    pix: 'PIX',
    cash: 'DINHEIRO',
    credit_card: 'CARTAO CREDITO',
    debit_card: 'CARTAO DEBITO',
  };

  // Header
  lines.push({ text: 'COMPROVANTE DE FECHAMENTO', align: 1, bold: true, size: 17 });
  lines.push({ skip: true });
  lines.push({ text: `Mesa: ${table.name}`, align: 0, bold: true });
  lines.push({ text: `Comanda: ${sale.code || sale.id.slice(-6)}`, align: 0 });
  lines.push({ text: `Data: ${new Date(sale.date).toLocaleString('pt-BR')}`, align: 0 });
  lines.push({ skip: true });

  // Items
  lines.push({ text: 'ITENS CONSUMIDOS:', align: 0, bold: true });
  lines.push({ text: '-'.repeat(paperWidth) });
  for (const item of sale.items || []) {
    lines.push({ text: `${item.quantity}x ${item.productName}`, align: 0 });
    lines.push({ text: `  R$ ${item.unitPrice.toFixed(2)} = R$ ${item.total.toFixed(2)}`, align: 0 });
  }
  lines.push({ text: '-'.repeat(paperWidth) });

  // Total
  lines.push({ text: `TOTAL: R$ ${sale.total.toFixed(2)}`, align: 2, bold: true, size: 17 });
  lines.push({ skip: true });
  lines.push({ text: `Pagamento: ${paymentLabels[paymentMethod] || paymentMethod}`, align: 0 });
  lines.push({ skip: true });
  lines.push({ text: 'Obrigado pela preferencia!', align: 1 });

  return buildEscPos(lines);
}

/**
 * Cupom de PEDIDO (cardápio Mesa/Delivery): lista os itens + total,
 * SEM forma de pagamento (o pagamento ocorre no fechamento da comanda /
 * entrega). Reimprimível de Pedidos, Dashboard e Financeiro.
 */
export function buildOrderReceiptEscPos(
  sale: Sale,
  settings: SystemSettings,
  table?: Table,
): Uint8Array {
  const paperWidth = 48;
  const lines: EscPosLine[] = [
    { text: settings.tradeName || 'HD-SYSTEM', align: 1, bold: true, size: 19 },
    { text: '', skip: true },
    { text: 'COMPROVANTE DE PEDIDO', align: 1, bold: true },
    { text: table ? `Mesa: ${table.name}` : sale.orderSource === 'delivery' ? 'DELIVERY' : 'PEDIDO', align: 1, bold: true },
    { text: `#${sale.code || sale.id.slice(-6)}`, align: 1 },
    { text: new Date(sale.date).toLocaleString('pt-BR'), align: 1 },
    { text: '', skip: true },
  ];
  if (sale.customerName) lines.push({ text: `Cliente: ${sale.customerName}`, align: 0 });
  if (sale.notes) lines.push({ text: sale.notes, align: 0 });
  lines.push({ text: '', skip: true });
  lines.push({ text: 'ITENS:', align: 0, bold: true });
  lines.push({ text: '-'.repeat(paperWidth) });
  for (const it of sale.items || []) {
    lines.push({ text: `${it.quantity}x ${it.productName}`, align: 0, bold: true });
    lines.push({ text: `  R$ ${it.unitPrice.toFixed(2)} = R$ ${it.total.toFixed(2)}`, align: 2 });
  }
  lines.push({ text: '-'.repeat(paperWidth) });
  lines.push({ text: '', skip: true });
  lines.push({ text: `TOTAL: R$ ${sale.total.toFixed(2)}`, align: 2, bold: true, size: 19 });
  lines.push({ text: '', skip: true });
  lines.push({ text: 'Obrigado!', align: 1 });

  return buildEscPos(lines);
}

/**
 * Ticket de DELIVERY/ENTREGA: inclui endereço, telefone e forma de pagamento
 * para que o entregador/motoboy tenha todos os dados no papel. Aceita um
 * `DeliveryOrder` (pedido nativo do app) OU um objeto estilo `DeliveryOrder`
 * convertido a partir de uma Sale (cardápio). Usado para reimpressão no
 * DeliveryBoardView.
 */
export function buildDeliveryTicketEscPos(
  order: Pick<DeliveryOrder, 'orderNumber' | 'items' | 'orderType' | 'paymentMethod' | 'deliveryAddress' | 'customerName' | 'customerWhatsapp' | 'notes' | 'total' | 'deliveryFee' | 'changeAmount' | 'createdAt' | 'status'>,
  settings: SystemSettings,
): Uint8Array {
  const paperWidth = 48;
  const lines: EscPosLine[] = [
    { text: settings.tradeName || 'HD-SYSTEM', align: 1, bold: true, size: 19 },
    { text: '', skip: true },
    { text: 'TICKET DE ENTREGA', align: 1, bold: true },
    { text: `Pedido: #${order.orderNumber ?? ''}`, align: 1 },
    { text: new Date(order.createdAt || Date.now()).toLocaleString('pt-BR'), align: 1 },
    { text: `Status: ${order.status || ''}`, align: 1 },
    { text: '', skip: true },
  ];
  if (order.customerName) lines.push({ text: `Cliente: ${order.customerName}`, align: 0 });
  if (order.orderType === 'delivery') {
    const addr = order.deliveryAddress;
    if (addr) {
      const street = [addr.street, addr.number, addr.complement].filter(Boolean).join(', ');
      const city = [addr.neighborhood, addr.city, addr.state].filter(Boolean).join(' - ');
      lines.push({ text: `Endereco: ${street}`, align: 0 });
      if (city) lines.push({ text: `  ${city}`, align: 0 });
    }
  } else {
    lines.push({ text: 'Retirada no estabelecimento', align: 0 });
  }
  if (order.customerWhatsapp) lines.push({ text: `Tel: ${order.customerWhatsapp}`, align: 0 });
  const labelMap: Record<string, string> = {
    cash: 'Dinheiro', pix: 'PIX', credit_card: 'Cartao Credito', debit_card: 'Cartao Debito', credit_account: 'Fiado',
  };
  if (order.paymentMethod) lines.push({ text: `Pagamento: ${labelMap[order.paymentMethod] || order.paymentMethod}`, align: 0 });
  if (order.paymentMethod === 'cash' && order.changeAmount && order.changeAmount > 0) {
    lines.push({ text: `Troco para: R$ ${order.changeAmount.toFixed(2)}`, align: 0, bold: true });
  }
  if (order.notes) lines.push({ text: `Obs: ${order.notes}`, align: 0 });
  lines.push({ text: '', skip: true });
  lines.push({ text: 'ITENS:', align: 0, bold: true });
  lines.push({ text: '-'.repeat(paperWidth) });
  for (const it of order.items || []) {
    lines.push({ text: `${it.quantity}x ${it.productName}`, align: 0, bold: true });
    lines.push({ text: `  R$ ${it.unitPrice?.toFixed ? it.unitPrice.toFixed(2) : (it.total / (it.quantity || 1)).toFixed(2)} = R$ ${it.total.toFixed(2)}`, align: 2 });
  }
  lines.push({ text: '-'.repeat(paperWidth) });
  if (order.deliveryFee && order.deliveryFee > 0) {
    lines.push({ text: `Frete: R$ ${order.deliveryFee.toFixed(2)}`, align: 2 });
  }
  lines.push({ text: '', skip: true });
  lines.push({ text: `TOTAL: R$ ${order.total.toFixed(2)}`, align: 2, bold: true, size: 19 });
  lines.push({ text: '', skip: true });
  lines.push({ text: 'Obrigado pela preferencia!', align: 1 });

  return buildEscPos(lines);
}

/** Imprime/reimprime o ticket de entrega de um DeliveryOrder. */
export async function printDeliveryOrderTicket(
  order: Pick<DeliveryOrder, 'orderNumber' | 'items' | 'orderType' | 'paymentMethod' | 'deliveryAddress' | 'customerName' | 'customerWhatsapp' | 'notes' | 'total' | 'deliveryFee' | 'changeAmount' | 'createdAt' | 'status'>,
  settings: SystemSettings,
  printers: Printer[],
): Promise<void> {
  const bytes = buildDeliveryTicketEscPos(order, settings);
  const printer = getCaixaPrinter(printers);
  if (printer && (printer.transport === 'webusb' || printer.transport === 'serial')) {
    if (printer.transport === 'webusb') return printWebUsb(printer, bytes);
    return printSerial(printer, bytes);
  }
  // Fallback: diálogo de impressão do navegador
  printOsDeliveryTicket(order, settings);
}

/** Gera o ticket de entrega em HTML para o diálogo de impressão do navegador. */
function printOsDeliveryTicket(
  order: Pick<DeliveryOrder, 'orderNumber' | 'items' | 'orderType' | 'paymentMethod' | 'deliveryAddress' | 'customerName' | 'customerWhatsapp' | 'notes' | 'total' | 'deliveryFee' | 'changeAmount' | 'createdAt' | 'status'>,
  settings: SystemSettings,
) {
  const addr = order.deliveryAddress;
  const addrLine = addr
    ? [addr.street, addr.number, addr.complement].filter(Boolean).join(', ')
      + (addr.neighborhood || addr.city ? ' - ' + [addr.neighborhood, addr.city, addr.state].filter(Boolean).join(' - ') : '')
    : '';
  const methodMap: Record<string, string> = {
    cash: 'Dinheiro', pix: 'PIX', credit_card: 'Cartão Crédito', debit_card: 'Cartão Débito', credit_account: 'Fiado',
  };
  const rows = (order.items || []).map(
    (it) => `<tr><td>${it.quantity}x ${escapeHtml(it.productName)}</td><td style="text-align:right">R$ ${it.total.toFixed(2)}</td></tr>`,
  ).join('');
  const html = `
    <html><head><title>Ticket de Entrega</title>
    <style>
      @page { margin: 8mm; }
      body { font-family: monospace; font-size: 12px; width: 72mm; margin: 0 auto; color: #000; }
      .c { text-align: center; } .r { text-align: right; } .b { font-weight: bold; }
      hr { border: none; border-top: 1px dashed #000; margin: 4px 0; }
      table { width: 100%; border-collapse: collapse; } td { padding: 1px 0; }
    </style></head>
    <body>
      <div class="c b">${escapeHtml(settings.tradeName || 'HD-SYSTEM')}</div>
      <h2 class="c">TICKET DE ENTREGA</h2>
      <div class="c">Pedido: #${order.orderNumber ?? ''}</div>
      <div class="c">${new Date(order.createdAt || Date.now()).toLocaleString('pt-BR')}</div>
      <hr/>
      ${order.customerName ? `<div><span class="b">Cliente:</span> ${escapeHtml(order.customerName)}</div>` : ''}
      ${order.orderType === 'delivery' ? (addrLine ? `<div><span class="b">Endereço:</span> ${escapeHtml(addrLine)}</div>` : '') : '<div><span class="b">Retirada:</span> no estabelecimento</div>'}
      ${order.customerWhatsapp ? `<div><span class="b">Tel:</span> ${escapeHtml(order.customerWhatsapp)}</div>` : ''}
      ${order.paymentMethod ? `<div><span class="b">Pagamento:</span> ${methodMap[order.paymentMethod] || escapeHtml(order.paymentMethod)}</div>` : ''}
      ${order.paymentMethod === 'cash' && order.changeAmount ? `<div><span class="b">Troco para:</span> R$ ${order.changeAmount.toFixed(2)}</div>` : ''}
      ${order.notes ? `<div><span class="b">Obs:</span> ${escapeHtml(order.notes)}</div>` : ''}
      <hr/>
      <table>${rows}</table>
      <hr/>
      ${order.deliveryFee ? `<div class="r">Frete: R$ ${order.deliveryFee.toFixed(2)}</div>` : ''}
      <div class="c b" style="font-size:16px">TOTAL: R$ ${order.total.toFixed(2)}</div>
      <div class="c">Obrigado pela preferência!</div>
    </body></html>
  `;
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);
  iframe.contentDocument?.open();
  iframe.contentDocument?.write(html);
  iframe.contentDocument?.close();
  iframe.contentWindow?.focus();
  iframe.contentWindow?.print();
  setTimeout(() => document.body.removeChild(iframe), 1000);
}

/** Devolve a impressora de frente (caixa) ativa, ou a primeira não-OS. */
export function getCaixaPrinter(printers: Printer[]): Printer | null {
  const active = (printers || []).filter((p) => p.transport !== 'os');
  return active.find((p) => p.role === 'caixa') || active[0] || null;
}

/**
 * Reimprime o cupom de uma venda/pedido. Tenta a impressora térmica (ESC/POS);
 * se não houver impressora pareada ou for transporte "os", usa o diálogo de
 * impressão do sistema (window.print) via iframe oculto.
 */
export async function printSaleReceipt(
  sale: Sale,
  settings: SystemSettings,
  printers: Printer[],
  opts?: { type?: 'pedido' | 'venda'; table?: Table },
): Promise<void> {
  const type = opts?.type || 'venda';
  // Nome da filial ativa vai no rodapé do comprovante de venda (em vez do
  // texto genérico "Volte Sempre..."). Com uma filial só (matriz), o nome dela
  // já representa a organização. Fallback: mensagem customizada das settings.
  const branch = storageService.getSelectedBranch();
  const storeName = branch?.name || '';
  const bytes = type === 'pedido'
    ? buildOrderReceiptEscPos(sale, settings, opts?.table)
    : buildReceiptEscPos(sale, settings, storeName);

  const printer = getCaixaPrinter(printers);
  if (printer && (printer.transport === 'webusb' || printer.transport === 'serial')) {
    if (printer.transport === 'webusb') return printWebUsb(printer, bytes);
    return printSerial(printer, bytes);
  }
  // Fallback: diálogo de impressão do sistema (funciona com qualquer impressora)
  printOsReceipt(sale, settings, type, opts?.table);
}

/** Gera um cupom HTML e dispara o diálogo de impressão do navegador. */
function printOsReceipt(sale: Sale, settings: SystemSettings, type: 'pedido' | 'venda', table?: Table) {
  const isPedido = type === 'pedido';
  const title = isPedido ? 'COMPROVANTE DE PEDIDO' : 'COMPROVANTE DE VENDA';
  const subtitle = table ? `Mesa: ${table.name}` : sale.orderSource === 'delivery' ? 'DELIVERY' : 'PEDIDO';
  const rows = (sale.items || []).map(
    (it) => `<tr><td>${it.quantity}x ${escapeHtml(it.productName)}</td><td style="text-align:right">R$ ${it.total.toFixed(2)}</td></tr>`,
  ).join('');
  const methodMap: Record<string, string> = {
    cash: 'Dinheiro', pix: 'PIX', credit_card: 'Cartão Crédito', debit_card: 'Cartão Débito', credit_account: 'Fiado',
  };
  const payments = !isPedido
    ? (sale.payments || []).map((p) => `<div>${methodMap[p.method] || p.method}: R$ ${p.amount.toFixed(2)}</div>`).join('')
    : '';
  const html = `
    <html><head><title>${title}</title>
    <style>
      @page { margin: 8mm; }
      body { font-family: monospace; font-size: 12px; width: 72mm; margin: 0 auto; color: #000; }
      .c { text-align: center; } .r { text-align: right; } .b { font-weight: bold; }
      hr { border: none; border-top: 1px dashed #000; margin: 4px 0; }
      table { width: 100%; border-collapse: collapse; } td { padding: 1px 0; }
    </style></head>
    <body>
      <div class="c b">${escapeHtml(settings.tradeName || 'HD-SYSTEM')}</div>
      <hr/>
      <div class="c b">${title}</div>
      <div class="c">${subtitle}</div>
      <div class="c">#${escapeHtml(sale.code || sale.id.slice(-6))}</div>
      <div class="c">${new Date(sale.date).toLocaleString('pt-BR')}</div>
      ${sale.customerName ? `<div>Cliente: ${escapeHtml(sale.customerName)}</div>` : ''}
      ${sale.notes ? `<div>${escapeHtml(sale.notes)}</div>` : ''}
      <hr/>
      <table>${rows}</table>
      <hr/>
      <div class="r b">TOTAL: R$ ${sale.total.toFixed(2)}</div>
      ${payments ? `<div style="margin-top:4px">${payments}</div>` : ''}
      <hr/>
      <div class="c">Obrigado!</div>
    </body></html>`;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) return;
  doc.open();
  doc.write(html);
  doc.close();
  iframe.contentWindow?.focus();
  setTimeout(() => {
    iframe.contentWindow?.print();
    setTimeout(() => { if (iframe.parentNode) iframe.parentNode.removeChild(iframe); }, 800);
  }, 300);
}

function escapeHtml(s: string): string {
  return (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
}
