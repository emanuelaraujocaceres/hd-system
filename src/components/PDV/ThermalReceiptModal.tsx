import React, { useState } from 'react';
import { X, Printer, Share2, CheckCircle2, ArrowRight, Loader2 } from 'lucide-react';
import { Sale, SystemSettings, Customer } from '../../types';
import { storageService } from '../../services/storageService';
import { printThermalReceipt } from '../../services/printService';

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
  const [printStatus, setPrintStatus] = useState<'idle' | 'printing' | 'ok'>('idle');

  if (!isOpen || !sale) return null;

  // Nome da filial ativa (identifica a loja no rodapé do comprovante).
  // Com uma filial só (matriz), o nome dela já representa a organização.
  const selectedBranch = storageService.getSelectedBranch();
  const storeName = selectedBranch?.name || '';

  // Cabeçalho do comprovante usa os DADOS DA FILIAL onde a venda aconteceu
  // (nome, CNPJ, endereço, telefone). Antes usava as configurações globais do
  // sistema (organização), então filiais com dados próprios mostravam sempre
  // o cabeçalho da matriz. Fallback para settings quando a filial não tiver
  // algum campo preenchido.
  const header = {
    name: selectedBranch?.name || settings.tradeName,
    cnpj: selectedBranch?.cnpj || settings.cnpj,
    ie: settings.ie,
    address: selectedBranch?.address || settings.address,
    city: selectedBranch?.city || settings.city,
    state: selectedBranch?.state || settings.state,
    phone: selectedBranch?.phone || settings.phone,
    cityState: selectedBranch
      ? `${selectedBranch.city || ''}${selectedBranch.city && selectedBranch.state ? '/' : ''}${selectedBranch.state || ''}`
      : `${settings.city}/${settings.state}`,
  };

  const handlePrint = async () => {
    setPrintStatus('printing');

    // Impressora padrão da filial ativa (fallback: primeira cadastrada).
    const printers = storageService.getPrinters();
    const printer = printers.find((p) => p.isDefault) || printers[0];

    try {
      if (printer && (printer.transport === 'webusb' || printer.transport === 'serial')) {
        // Impressão térmica direta (ESC/POS via USB/Serial)
        await printThermalReceipt(sale, settings, printer);
        setPrintStatus('ok');
        return;
      }
    } catch (e: any) {
      // Falha na térmica (ex.: pareamento cancelado): cai para a janela nativa.
      console.warn('[HD-Print] Falha na impressão térmica, caindo para window.print:', e);
    }

    // Sem impressora pareada, transporte "os"/"network" ou falha acima:
    // diálogo de impressão nativo do navegador (recibo estilizado).
    window.print();
    setPrintStatus('ok');
  };

  const handleWhatsAppShare = () => {
    const text = `Olá! Aqui está o comprovante da sua compra na ${settings.tradeName}.\nCódigo: ${sale.code}\nTotal: R$ ${sale.total.toFixed(2)}`;
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
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
            {/* Store Header — dados da filial da venda (fallback para settings globais) */}
            <div className="text-center pb-2 border-b border-dashed border-gray-400">
              <p className="font-bold text-xs uppercase">{header.name}</p>
              <p>CNPJ: {header.cnpj}</p>
              <p>IE: {header.ie}</p>
              <p>{header.address} - {header.cityState}</p>
              <p>Tel: {header.phone}</p>
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
            <div className="py-2 border-b border-dashed border-gray-400 max-h-[50vh] overflow-y-auto">
              <div className="grid grid-cols-12 font-bold mb-1 border-b border-gray-200 pb-0.5 text-[9px]">
                <span className="col-span-1">#</span>
                <span className="col-span-5">PRODUTO</span>
                <span className="col-span-2 text-right">QTD</span>
                <span className="col-span-2 text-right">UN</span>
                <span className="col-span-2 text-right">TOTAL</span>
              </div>
              {sale.items.map((it, idx) => (
                <div key={idx} className="mb-0.5 text-[9px] leading-tight">
                  <div className="flex justify-between">
                    <span className="col-span-1">{idx + 1}.</span>
                    <span className="col-span-5 truncate">{it.productName}</span>
                    <span className="col-span-2 text-right">{it.quantity}</span>
                    <span className="col-span-2 text-right">R$ {it.unitPrice.toFixed(2)}</span>
                    <span className="col-span-2 text-right font-bold">R$ {it.total.toFixed(2)}</span>
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
              <p className="font-bold">{storeName || settings.receiptHeaderMsg}</p>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handlePrint}
              disabled={printStatus === 'printing'}
              className="py-2.5 px-3 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-bold text-xs hover:bg-slate-800 dark:hover:bg-white transition-colors flex items-center justify-center gap-1.5 disabled:opacity-60"
            >
              {printStatus === 'printing' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Printer className="w-4 h-4" />
              )}
              <span>
                {printStatus === 'printing'
                  ? 'Imprimindo...'
                  : printStatus === 'ok'
                  ? 'Impresso! Imprimir de Novo'
                  : 'Imprimir Recibo'}
              </span>
            </button>
            <button
              onClick={handleWhatsAppShare}
              className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5"
            >
              <Share2 className="w-4 h-4" />
              <span>Enviar WhatsApp</span>
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