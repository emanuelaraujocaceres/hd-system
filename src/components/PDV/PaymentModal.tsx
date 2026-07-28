import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  CreditCard,
  Banknote,
  QrCode,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Split,
  Plus,
  Minus,
} from 'lucide-react';
import QRCode from 'qrcode';
import {
  CartItem,
  Customer,
  PaymentMethod,
  PaymentDetails,
  Sale,
  SystemSettings,
  UserProfile,
} from '../../types';
import { storageService } from '../../services/storageService';
import { posAudio } from '../../services/audioService';
import { useEscapeKey } from '../../hooks/useKeyboardShortcuts';
import { LoadingButton } from '../shared/LoadingButton';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  cartItems: CartItem[];
  customers: Customer[];
  selectedCustomer: Customer | null;
  setSelectedCustomer: (c: Customer | null) => void;
  subtotal: number;
  discount: number;
  setDiscount: (d: number) => void;
  settings: SystemSettings;
  user: UserProfile;
  onSaleSuccess: (sale: Sale) => void;
}

function crc16Ccitt(str: string): string {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) crc = (crc << 1) ^ 0x1021;
      else crc <<= 1;
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Strip non-ASCII chars — PIX/BRCode uses ISO-8859-1 (Latin-1) */
function stripAscii(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '').trim();
}

function buildPixPayload(pixKey: string, amount: number, merchantName: string, merchantCity: string): string {
  const tlv = (tag: string, value: string) => `${tag}${value.length.toString().padStart(2, '0')}${value}`;

  const merchantNameClean = stripAscii((merchantName || 'HD-SYSTEM')).slice(0, 25);
  const merchantCityClean = stripAscii((merchantCity || 'SAO PAULO')).slice(0, 15);
  const amountStr = amount > 0 ? amount.toFixed(2) : '';

  let payload = '';
  payload += tlv('00', '01');  // Payload Format Indicator
  payload += tlv('26', tlv('00', 'br.gov.bcb.pix') + tlv('01', pixKey));  // Merchant Account Info
  payload += tlv('52', '0000');  // Merchant Category Code
  payload += tlv('53', '986');  // Transaction Currency (BRL)
  if (amount > 0) payload += tlv('54', amountStr);  // Transaction Amount
  payload += tlv('58', 'BR');  // Country Code
  payload += tlv('59', merchantNameClean);  // Merchant Name
  payload += tlv('60', merchantCityClean);  // Merchant City
  payload += tlv('62', tlv('05', '***'));  // Additional Data

  const crcBase = payload + '6304';
  const crc = crc16Ccitt(crcBase);

  return crcBase + crc;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  cartItems,
  customers,
  selectedCustomer,
  setSelectedCustomer,
  subtotal,
  discount,
  setDiscount,
  settings,
  user,
  onSaleSuccess,
}) => {
  const totalAmount = Math.max(0, subtotal - discount);

  const [method, setMethod] = useState<PaymentMethod>('pix');
  const [cashGiven, setCashGiven] = useState<number>(totalAmount);
  const [installments, setInstallments] = useState<number>(1);
  const [cardBrand, setCardBrand] = useState<string>('Visa');

  // PIX state
  const [pixCopied, setPixCopied] = useState(false);
  const [pixPaid, setPixPaid] = useState(false);

  // Split payment state
  const [isSplit, setIsSplit] = useState(false);
  const [splitCount, setSplitCount] = useState<number>(2);
  const [splitParts, setSplitParts] = useState<Array<{ amount: number; method: PaymentMethod }>>([
    { amount: Math.round(totalAmount / 2), method: 'cash' },
    { amount: totalAmount - Math.round(totalAmount / 2), method: 'pix' },
  ]);

  const [loading, setLoading] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const firstInputRef = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    if (isOpen && firstInputRef.current) {
      firstInputRef.current.focus();
    }
  }, [isOpen]);

  useEscapeKey(onClose, isOpen);

  // QR Code data URL for PIX (generated async)
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  // Generate QR code data URL whenever PIX details change
  const generateQr = useCallback(async () => {
    try {
      const pixPayload = buildPixPayload(settings.pixKey, totalAmount, settings.tradeName, settings.city);
      const dataUrl = await QRCode.toDataURL(pixPayload, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 250,
        color: { dark: '#000000', light: '#FFFFFF' },
      });
      setQrDataUrl(dataUrl);
    } catch (e) {
      console.error('[HD-Sync] QR code generation failed:', e);
      setQrDataUrl('');
    }
  }, [settings.pixKey, totalAmount, settings.tradeName, settings.city]);

  useEffect(() => {
    if (method === 'pix' && isOpen) {
      generateQr();
    }
  }, [method, isOpen, generateQr]);

  useEffect(() => {
    setCashGiven(totalAmount);
    setSplitParts((prev) => {
      const count = prev.length;
      const baseAmount = Math.floor((totalAmount / count) * 100) / 100;
      const newParts: Array<{ amount: number; method: PaymentMethod }> = [];
      let remaining = totalAmount;
      for (let i = 0; i < count; i++) {
        const method = prev[i]?.method || 'pix';
        if (i === count - 1) {
          newParts.push({ amount: Math.round(remaining * 100) / 100, method });
        } else {
          newParts.push({ amount: baseAmount, method });
          remaining -= baseAmount;
        }
      }
      return newParts;
    });
  }, [totalAmount]);

  // Reset payment error when modal opens or method changes
  useEffect(() => {
    setPaymentError(null);
  }, [isOpen, method]);

  // Simulate auto PIX payment confirmation after 3.5 seconds
  useEffect(() => {
    if (method === 'pix' && !pixPaid) {
      const timer = setTimeout(() => {
        setPixPaid(true);
      }, 15000);
      return () => clearTimeout(timer);
    }
  }, [method, pixPaid]);

  const isPixUnconfirmed = method === 'pix' && !pixPaid;

  // Split helpers
  const splitPartsTotal = splitParts.reduce((sum, p) => sum + p.amount, 0);
  const isSplitValid = Math.abs(splitPartsTotal - totalAmount) < 0.01;

  const redistributeSplit = (count: number) => {
    setSplitCount(count);
    const baseAmount = Math.floor((totalAmount / count) * 100) / 100;
    setSplitParts((prev) => {
      const newParts: Array<{ amount: number; method: PaymentMethod }> = [];
      let remaining = totalAmount;
      for (let i = 0; i < count; i++) {
        const method = prev[i]?.method || 'pix';
        if (i === count - 1) {
          newParts.push({ amount: Math.round(remaining * 100) / 100, method });
        } else {
          newParts.push({ amount: baseAmount, method });
          remaining -= baseAmount;
        }
      }
      return newParts;
    });
  };

  const updateSplitPart = (index: number, field: 'amount' | 'method', value: number | PaymentMethod) => {
    setSplitParts((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  };

  if (!isOpen) return null;

  const changeDue = Math.max(0, cashGiven - totalAmount);

  const handleCopyPix = () => {
    const pixPayload = buildPixPayload(settings.pixKey, totalAmount, settings.tradeName, settings.city);
    navigator.clipboard.writeText(pixPayload);
    setPixCopied(true);
    posAudio.click();
    setTimeout(() => setPixCopied(false), 2000);
  };

  const handleFinalize = async () => {
    if (loading) return;
    setLoading(true);

    try {
      // Validate credit_account limit
      if (selectedCustomer && (method === 'credit_account' || splitParts.some(p => p.method === 'credit_account'))) {
        const availableCredit = (selectedCustomer.creditLimit || 0) - (selectedCustomer.currentBalance || 0);
        if (totalAmount > availableCredit) {
          setPaymentError(`Cliente não tem crédito suficiente. Disponível: R$ ${availableCredit.toFixed(2)}`);
          setLoading(false);
          return;
        }
      }

      let payments: PaymentDetails[] = [];

      if (!isSplit) {
        if (method === 'cash') {
          payments.push({
            method: 'cash',
            amount: totalAmount,
            cashGiven,
            changeDue,
          });
        } else if (method === 'pix') {
          payments.push({
            method: 'pix',
            amount: totalAmount,
            pixTxId: `PIX-${Date.now()}`,
          });
        } else if (method === 'credit_card') {
          payments.push({
            method: 'credit_card',
            amount: totalAmount,
            installments,
            cardBrand,
          });
        } else if (method === 'debit_card') {
          payments.push({
            method: 'debit_card',
            amount: totalAmount,
            cardBrand,
          });
        } else if (method === 'credit_account') {
          payments.push({
            method: 'credit_account',
            amount: totalAmount,
          });
        }
        } else {
          // Split payment
          payments = splitParts.map((p) => {
            if (p.method === 'cash') {
              return { method: p.method, amount: p.amount, cashGiven: p.amount, changeDue: 0 };
            }
            return { method: p.method, amount: p.amount };
          });
        }

      const saleCode = `VEN-${Math.floor(1000 + Math.random() * 9000)}`;
      const newSale: Sale = {
        id: `sale-${Date.now()}`,
        code: saleCode,
        date: new Date().toISOString(),
        operatorId: user.id,
        operatorName: user.name,
        customerId: selectedCustomer?.id,
        customerName: selectedCustomer?.name || 'Cliente Não Identificado',
        storeBranchId: user.storeBranchId,
        items: cartItems.map((ci) => ({
          productId: ci.product.id,
          productName: ci.product.name,
          unitPrice: ci.unitPrice,
          quantity: ci.quantity,
          total: ci.totalPrice,
        })),
        subtotal,
        discount,
        total: totalAmount,
        payments,
        status: 'completed',
      };

      // Save to storage (async — calls process_sale_transaction RPC)
      await storageService.addSale(newSale);
      posAudio.chime();

      onSaleSuccess(newSale);
      onClose();
    } catch (e) {
      console.error(e);
      posAudio.error();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Finalizar Venda - Pagamento
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Selecione a forma de pagamento e confirme a transação
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Total Amount & Customer Summary Bar */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex flex-wrap items-center justify-between gap-4 shadow-lg">
            <div>
              <p className="text-xs text-indigo-200 font-medium">Total da Compra</p>
              <p className="text-3xl font-extrabold text-emerald-400 tracking-tight">
                R$ {totalAmount.toFixed(2)}
              </p>
              <p className="text-[11px] text-slate-300">
                Subtotal: R$ {subtotal.toFixed(2)} {discount > 0 ? `(- R$ ${discount.toFixed(2)})` : ''}
              </p>
            </div>

            {/* Customer Picker inside payment */}
            <div className="bg-slate-800/80 border border-slate-700/80 p-2.5 rounded-xl text-xs space-y-1 min-w-[200px]">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">Cliente:</span>
                <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
              </div>
              <select
                ref={firstInputRef}
                value={selectedCustomer?.id || ''}
                onChange={(e) => {
                  const cust = customers.find((c) => c.id === e.target.value);
                  setSelectedCustomer(cust || null);
                }}
                className="w-full bg-slate-900 text-white border border-slate-700 rounded-lg px-2 py-1 text-xs outline-none cursor-pointer"
              >
                <option value="">Consumidor Não Identificado</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.cpfCnpj})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Payment Method Selector Grid */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Forma de Pagamento
              </label>
              <button
                type="button"
                onClick={() => setIsSplit(!isSplit)}
                className={`text-xs font-semibold px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1 min-h-[44px] ${
                  isSplit
                    ? 'bg-indigo-600 text-white border-indigo-500'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                }`}
              >
                <Split className="w-3.5 h-3.5" />
                <span>{isSplit ? 'Pagamento Dividido' : 'Dividir Pagamento'}</span>
              </button>
            </div>

            {!isSplit ? (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {[
                  { id: 'pix', label: 'PIX QrCode', icon: QrCode, badge: 'Rápido' },
                  { id: 'cash', label: 'Dinheiro', icon: Banknote, badge: 'Troco' },
                  { id: 'credit_card', label: 'Crédito', icon: CreditCard, badge: 'Até 12x' },
                  { id: 'debit_card', label: 'Débito', icon: CreditCard },
                  { id: 'credit_account', label: 'Fiado / Crédito', icon: UserCheck },
                ].map((item) => {
                  const Icon = item.icon;
                  const isSelected = method === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setMethod(item.id as PaymentMethod);
                        posAudio.click();
                      }}
                      className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1.5 relative min-h-[44px] min-w-[44px] ${
                        isSelected
                          ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-600/20 font-bold ring-2 ring-indigo-400/50'
                          : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-xs">{item.label}</span>
                      {item.badge && (
                        <span
                          className={`text-[9px] font-bold px-1 rounded ${
                            isSelected ? 'bg-indigo-700 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              /* SPLIT PAYMENT UI */
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-3">
                {/* Header with +/- buttons */}
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Dividir em{' '}
                    <span className="text-indigo-500 dark:text-indigo-400">{splitCount}</span> partes
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => splitCount > 2 && redistributeSplit(splitCount - 1)}
                      disabled={splitCount <= 2}
                      className="p-1 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-40 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="px-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                      {splitCount}
                    </span>
                    <button
                      type="button"
                      onClick={() => splitCount < 6 && redistributeSplit(splitCount + 1)}
                      disabled={splitCount >= 6}
                      className="p-1 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-40 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Parts grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {splitParts.map((part, idx) => (
                    <div key={idx}>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                        Parte {idx + 1} (R$)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        inputMode="decimal"
                        value={part.amount}
                        onChange={(e) => updateSplitPart(idx, 'amount', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-bold text-slate-900 dark:text-white"
                      />
                      <select
                        value={part.method}
                        onChange={(e) => updateSplitPart(idx, 'method', e.target.value as PaymentMethod)}
                        className="w-full mt-1 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                      >
                        <option value="cash">Dinheiro</option>
                        <option value="pix">PIX</option>
                        <option value="credit_card">Cartão Crédito</option>
                        <option value="debit_card">Cartão Débito</option>
                      </select>
                    </div>
                  ))}
                </div>

                {/* Summary bar */}
                <div
                  className={`p-2.5 rounded-lg border text-xs font-bold flex items-center justify-between ${
                    isSplitValid
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
                  }`}
                >
                  <span>Soma das partes: R$ {splitPartsTotal.toFixed(2)}</span>
                  <span>Total da venda: R$ {totalAmount.toFixed(2)}</span>
                </div>

                {!isSplitValid && (
                  <div className="flex items-center gap-1.5 text-[11px] text-rose-600 dark:text-rose-400 font-semibold">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>A soma das partes não confere com o total da venda.</span>
                  </div>
                )}

                {/* Add / Remove buttons */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => splitCount < 6 && redistributeSplit(splitCount + 1)}
                    disabled={splitCount >= 6}
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/20 disabled:opacity-40 transition-colors min-h-[44px]"
                  >
                    + Adicionar Parte
                  </button>
                  <button
                    type="button"
                    onClick={() => splitCount > 2 && redistributeSplit(splitCount - 1)}
                    disabled={splitCount <= 2}
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 disabled:opacity-40 transition-colors min-h-[44px]"
                  >
                    Remover Última
                  </button>
                </div>
              </div>
            )}

            {/* DETAILS ACCORDING TO SELECTED METHOD */}
            {!isSplit && (
              <div className="pt-2">
                {/* METHOD: DINHEIRO */}
                {method === 'cash' && (
                  <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Valor Recebido do Cliente (R$)
                      </label>
                      <span className="text-xs text-slate-500">
                        Pressione para sugestões rápidas:
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.01"
                        inputMode="decimal"
                        data-currency="true"
                        value={cashGiven}
                        onChange={(e) => setCashGiven(parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-lg font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setCashGiven(totalAmount)}
                        className="px-3 py-2 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs rounded-xl hover:bg-slate-300 transition-colors whitespace-nowrap min-h-[44px]"
                      >
                        Exato
                      </button>
                    </div>

                    {/* Quick Cash preset pills */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {[10, 20, 50, 100, 200].map((add) => (
                        <button
                          key={add}
                          type="button"
                          onClick={() => setCashGiven(totalAmount + add)}
                          className="px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-300 hover:border-emerald-500 transition-colors min-h-[44px]"
                        >
                          + R$ {add}
                        </button>
                      ))}
                    </div>

                    {/* Change due calculation */}
                    <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-900 dark:text-emerald-300">
                        TROCO A DEVOLVER:
                      </span>
                      <span className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">
                        R$ {changeDue.toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}

                {/* METHOD: PIX */}
                {method === 'pix' && (() => {
                  const activePixKey = settings.pixKey || 'Nenhuma chave configurada';

                  return (
                    <div className="p-4 rounded-xl bg-sky-500/5 border border-sky-500/20 flex flex-col sm:flex-row items-center gap-4">
                      {/* Dynamic QR Code Box */}
                      <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl shadow-md border border-slate-200 dark:border-slate-800 flex flex-col items-center shrink-0 w-44 text-center">
                        <div className="w-36 h-36 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-center overflow-hidden p-1 relative">
                          {qrDataUrl ? (
                            <img
                              src={qrDataUrl}
                              alt="QR Code PIX"
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <div className="text-xs text-slate-400 animate-pulse">Gerando QR Code...</div>
                          )}
                        </div>
                        <div className="mt-2 w-full">
                          <span className="text-[10px] text-slate-400 uppercase font-extrabold block">
                            Chave PIX Cadastrada
                          </span>
                          <span className="text-xs font-mono font-bold text-slate-900 dark:text-sky-300 break-all select-all block bg-slate-100 dark:bg-slate-800 p-1 rounded mt-0.5 border border-slate-200 dark:border-slate-700">
                            {activePixKey}
                          </span>
                        </div>
                      </div>

                      <div className="flex-1 space-y-2 text-center sm:text-left">
                        <div className="flex items-center justify-center sm:justify-start gap-2">
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            Pagamento PIX Instantâneo
                          </span>
                          {pixPaid ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Recebido!
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 animate-pulse">
                              Aguardando...
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                          Apresente o QR Code na tela para o cliente escanear no aplicativo do banco ou copie a chave Pix Copia e Cola.
                        </p>

                        {!pixPaid && (
                          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs font-semibold flex items-center gap-2 animate-pulse">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <span>Aguardando confirmação do pagamento...</span>
                          </div>
                        )}

                        {!pixPaid && (
                          <button
                            type="button"
                            onClick={() => setPixPaid(true)}
                            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors flex items-center justify-center gap-2 shadow-sm min-h-[44px]"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Simular Confirmação de Pagamento</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={handleCopyPix}
                          className="w-full sm:w-auto px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs transition-colors flex items-center justify-center gap-2 shadow-sm min-h-[44px]"
                        >
                          {pixCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                          <span>{pixCopied ? 'Chave Copiada!' : 'Copiar Pix Copia e Cola'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })()}

                {/* METHOD: CREDIT CARD */}
                {method === 'credit_card' && (
                  <div className="p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/20 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Parcelas (Sem Juros)
                        </label>
                        <select
                          value={installments}
                          onChange={(e) => setInstallments(parseInt(e.target.value))}
                          className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white"
                        >
                          {Array.from({ length: 12 }, (_, i) => i + 1).map((num) => (
                            <option key={num} value={num}>
                              {num}x de R$ {(totalAmount / num).toFixed(2)}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Bandeira
                        </label>
                        <select
                          value={cardBrand}
                          onChange={(e) => setCardBrand(e.target.value)}
                          className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white"
                        >
                          <option value="Visa">Visa</option>
                          <option value="Mastercard">Mastercard</option>
                          <option value="Elo">Elo</option>
                          <option value="Amex">American Express</option>
                          <option value="Hipercard">Hipercard</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* METHOD: CREDIT ACCOUNT / FIADO */}
                {method === 'credit_account' && (
                  <div className="p-4 rounded-xl bg-purple-500/5 border border-purple-500/20 space-y-2 text-xs">
                    <p className="font-bold text-purple-900 dark:text-purple-300 flex items-center gap-1.5">
                      <UserCheck className="w-4 h-4 text-purple-600" />
                      Lançamento de Débito no Próprio Cadastro do Cliente
                    </p>
                    {selectedCustomer ? (
                      <div className="p-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-1">
                        <p className="font-bold text-slate-900 dark:text-white">{selectedCustomer.name}</p>
                        <p className="text-slate-500">CPF/CNPJ: {selectedCustomer.cpfCnpj}</p>
                        <p className="text-slate-500">
                          Limite Disponível:{' '}
                          <span className="font-bold text-emerald-600">
                            R$ {(selectedCustomer.creditLimit - selectedCustomer.currentBalance).toFixed(2)}
                          </span>
                        </p>
                      </div>
                    ) : (
                      <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 font-semibold flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        <span>Selecione um cliente identificado acima para lançar a crédito!</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {paymentError && (
          <div className="mx-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{paymentError}</span>
          </div>
        )}

        {/* Footer Buttons */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors min-h-[44px]"
          >
            Voltar ao Carrinho
          </button>

          <LoadingButton
            type="button"
            onClick={handleFinalize}
            disabled={loading || isPixUnconfirmed || (method === 'credit_account' && !selectedCustomer) || (isSplit && !isSplitValid)}
            loading={loading}
            loadingText="Processando..."
            className="flex-1 py-3 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-sm shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 min-h-[44px]"
          >
            <CheckCircle2 className="w-5 h-5" />
            <span>Confirmar e Concluir Venda (F8)</span>
          </LoadingButton>
        </div>
      </div>
    </div>
  );
};
