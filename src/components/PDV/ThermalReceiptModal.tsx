import React, { useState, useEffect } from 'react';
import { X, Printer, Download, Share2, CheckCircle2, ArrowRight, Phone, MessageSquare } from 'lucide-react';
import { Sale, SystemSettings, Customer } from '../../types';

interface ThermalReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  sale: Sale | null;
  settings: SystemSettings;
  customers?: Customer[];
  onNewSale: () => void;
}

export const ThermalReceiptModal: React.FC<ThermalReceiptModalProps> = ({
  isOpen,
  onClose,
  sale,
  settings,
  customers = [],
  onNewSale,
}) => {
  const [whatsappPhone, setWhatsappPhone] = useState<string>('');

  useEffect(() => {
    if (sale) {
      const foundCust = customers.find((c) => c.id === sale.customerId || (c.name && c.name === sale.customerName));
      setWhatsappPhone(foundCust?.phone || '');
    }
  }, [sale, customers]);

  if (!isOpen || !sale) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleWhatsAppShare = () => {
    let cleanPhone = whatsappPhone.replace(/\D/g, '');
    if (cleanPhone.length >= 10 && cleanPhone.length <= 11 && !cleanPhone.startsWith('55')) {
      cleanPhone = '55' + cleanPhone;
    }

    const itemsList = sale.items
      .map((it) => `• ${it.quantity}x ${it.productName} - R$ ${it.total.toFixed(2)}`)
      .join('\n');

    const paymentList = sale.payments
      .map((p) => {
        const labelMap: Record<string, string> = {
          cash: 'Dinheiro',
          pix: 'PIX',
          credit_card: 'Cartão de Crédito',
          debit_card: 'Cartão de Débito',
          credit_account: 'Fiado',
        };
        return `${labelMap[p.method] || p.method}: R$ ${p.amount.toFixed(2)}`;
      })
      .join(', ');

    const text = `*COMPROVANTE DE COMPRA - ${settings.tradeName.toUpperCase()}*\n\n` +
      `*Venda:* #${sale.code}\n` +
      `*Data:* ${new Date(sale.date).toLocaleString('pt-BR')}\n` +
      `*Cliente:* ${sale.customerName || 'Consumidor'}\n\n` +
      `*ITENS:*\n${itemsList}\n\n` +
      `*Subtotal:* R$ ${sale.subtotal.toFixed(2)}\n` +
      (sale.discount > 0 ? `*Desconto:* -R$ ${sale.discount.toFixed(2)}\n` : '') +
      `*TOTAL:* R$ ${sale.total.toFixed(2)}\n` +
      `*Forma de Pagamento:* ${paymentList}\n\n` +
      `Agradecemos a preferência!`;

    const baseUrl = cleanPhone
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(text)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;

    window.open(baseUrl, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Top Bar */}
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-sm">
            <CheckCircle2 className="w-5 h-5" />
            <span>Venda Concluída com Sucesso!</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Thermal Ticket Container (printable area) */}
        <div className="p-6 overflow-y-auto bg-slate-100 dark:bg-slate-950 flex justify-center">
          <div
            id="printable-receipt"
            className="w-[280px] sm:w-[320px] bg-white text-black font-mono text-[11px] p-4 rounded-lg shadow-md border border-slate-200 space-y-2 leading-tight select-text"
          >
            {/* Store Header */}
            <div className="text-center pb-2 border-b border-dashed border-gray-400">
              <p className="font-bold text-xs uppercase">{settings.tradeName}</p>
              <p>{settings.companyName}</p>
              <p>CNPJ: {settings.cnpj}</p>
              <p>IE: {settings.ie}</p>
              <p>{settings.address} - {settings.city}/{settings.state}</p>
              <p>Tel: {settings.phone}</p>
            </div>

            {/* Document Info */}
            <div className="text-center py-1 border-b border-dashed border-gray-400">
              <p className="font-bold">Comprovante de Venda</p>
              <p>Documento Não Fiscal</p>
            </div>

            {/* Sale & Customer Details */}
            <div className="py-1 border-b border-dashed border-gray-400 space-y-0.5">
              <p><span className="font-bold">Venda:</span> #{sale.code}</p>
              <p><span className="font-bold">Data:</span> {new Date(sale.date).toLocaleString('pt-BR')}</p>
              <p><span className="font-bold">Operador:</span> {sale.operatorName}</p>
              <p><span className="font-bold">Cliente:</span> {sale.customerName || 'Consumidor Não Identificado'}</p>
            </div>

            {/* Items Table */}
            <div className="py-2 border-b border-dashed border-gray-400">
              <div className="grid grid-cols-12 font-bold mb-1 border-b border-gray-200 pb-0.5">
                <span className="col-span-6">ITEM / QTD x UNIT</span>
                <span className="col-span-6 text-right">TOTAL (R$)</span>
              </div>
              {sale.items.map((it, idx) => (
                <div key={idx} className="mb-1 text-[10px]">
                  <p className="font-bold truncate">{idx + 1}. {it.productName}</p>
                  <div className="flex justify-between text-gray-700">
                    <span>{it.quantity} un x R$ {it.unitPrice.toFixed(2)}</span>
                    <span className="font-bold text-black">R$ {it.total.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="py-1 border-b border-dashed border-gray-400 space-y-0.5">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>R$ {sale.subtotal.toFixed(2)}</span>
              </div>
              {sale.discount > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Desconto:</span>
                  <span>- R$ {sale.discount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-xs pt-1 border-t border-gray-200">
                <span>TOTAL R$:</span>
                <span>R$ {sale.total.toFixed(2)}</span>
              </div>
            </div>

            {/* Payment Method Details */}
            <div className="py-1 border-b border-dashed border-gray-400 space-y-0.5">
              <p className="font-bold">FORMA DE PAGAMENTO:</p>
              {sale.payments.map((p, idx) => {
                const labelMap: Record<string, string> = {
                  cash: 'Dinheiro',
                  pix: 'PIX Instantâneo',
                  credit_card: 'Cartão de Crédito',
                  debit_card: 'Cartão de Débito',
                  credit_account: 'Fiado / Crédito Cliente',
                };
                return (
                  <div key={idx} className="flex justify-between">
                    <span>{labelMap[p.method] || p.method}:</span>
                    <span className="font-bold">R$ {p.amount.toFixed(2)}</span>
                  </div>
                );
              })}
              {sale.payments.some((p) => p.changeDue && p.changeDue > 0) && (
                <div className="flex justify-between font-bold pt-1 text-emerald-800">
                  <span>Troco:</span>
                  <span>R$ {sale.payments.find((p) => p.changeDue)?.changeDue?.toFixed(2)}</span>
                </div>
              )}
            </div>

            {/* Non-Fiscal Receipt Notice */}
            <div className="text-center py-2 border-b border-dashed border-gray-400 text-[9px] text-gray-600">
              <p className="font-bold uppercase">*** COMPROVANTE NÃO FISCAL ***</p>
              <p>Obrigado pela preferência!</p>
            </div>

            {/* Footer Msg */}
            <div className="text-center pt-2 text-[10px] space-y-0.5 text-gray-700">
              <p>{settings.receiptHeaderMsg}</p>
              <p className="font-bold">{settings.receiptFooterMsg}</p>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 space-y-3">
          {/* WhatsApp input section */}
          <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1.5 shadow-sm">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-emerald-500" />
                WhatsApp do Cliente:
              </span>
              <span className="text-[10px] text-slate-400 font-normal">(Digitar se não cadastrado)</span>
            </label>
            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <Phone className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="tel"
                  placeholder="DDD + Número (ex: 11999998888)"
                  value={whatsappPhone}
                  onChange={(e) => setWhatsappPhone(e.target.value)}
                  className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <button
                onClick={handleWhatsAppShare}
                className="py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap shadow-sm"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Enviar Whats</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2">
            <button
              onClick={handlePrint}
              className="py-2.5 px-3 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-bold text-xs hover:bg-slate-800 dark:hover:bg-white transition-colors flex items-center justify-center gap-1.5"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir Recibo Térmico</span>
            </button>
          </div>

          <button
            onClick={() => {
              onNewSale();
              onClose();
            }}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-2"
          >
            <span>Iniciar Nova Venda (F2)</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
