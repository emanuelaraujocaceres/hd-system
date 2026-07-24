import React, { useState, useEffect } from 'react';
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
  Percent,
  Receipt,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
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
  if (!isOpen) return null;

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
  const [splitAmount1, setSplitAmount1] = useState<number>(Math.round(totalAmount / 2));
  const [splitMethod1, setSplitMethod1] = useState<PaymentMethod>('cash');
  const [splitMethod2, setSplitMethod2] = useState<PaymentMethod>('pix');

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setCashGiven(totalAmount);
    setSplitAmount1(Math.round(totalAmount / 2));
  }, [totalAmount]);

  // Simulate auto PIX payment confirmation after 3.5 seconds
  useEffect(() => {
    if (method === 'pix' && !pixPaid) {
      const timer = setTimeout(() => {
        setPixPaid(true);
        posAudio.beep();
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [method, pixPaid]);

  const changeDue = Math.max(0, cashGiven - totalAmount);

  const handleCopyPix = () => {
    const pixPayload = `00020126580014br.gov.bcb.pix0136${settings.pixKey}520400005303986540${totalAmount.toFixed(2)}5802BR5920${settings.tradeName.slice(0, 20)}6009SAO PAULO62070503***63041D2B`;
    navigator.clipboard.writeText(pixPayload);
    setPixCopied(true);
    posAudio.click();
    setTimeout(() => setPixCopied(false), 2000);
  };

  const handleFinalize = async () => {
    if (loading) return;
    setLoading(true);

    try {
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
        const splitAmount2 = Math.max(0, totalAmount - splitAmount1);
        payments = [
          { method: splitMethod1, amount: splitAmount1 },
          { method: splitMethod2, amount: splitAmount2 },
        ];
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
        nfceKey,
        nfceProtocol,
        nfceStatus,
      };

      // Save to storage
      storageService.addSale(newSale);
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
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
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
                className={`text-xs font-semibold px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1 ${
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
                      className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1.5 relative ${
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
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Dividir total de R$ {totalAmount.toFixed(2)} em duas formas:
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                      Parte 1 (R$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={splitAmount1}
                      onChange={(e) => setSplitAmount1(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-bold text-slate-900 dark:text-white"
                    />
                    <select
                      value={splitMethod1}
                      onChange={(e) => setSplitMethod1(e.target.value as PaymentMethod)}
                      className="w-full mt-1 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                    >
                      <option value="cash">Dinheiro</option>
                      <option value="pix">PIX</option>
                      <option value="credit_card">Cartão Crédito</option>
                      <option value="debit_card">Cartão Débito</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                      Parte 2 (Restante: R$ {Math.max(0, totalAmount - splitAmount1).toFixed(2)})
                    </label>
                    <div className="px-3 py-1.5 bg-slate-200 dark:bg-slate-950 rounded-lg text-sm font-bold text-slate-700 dark:text-slate-300">
                      R$ {Math.max(0, totalAmount - splitAmount1).toFixed(2)}
                    </div>
                    <select
                      value={splitMethod2}
                      onChange={(e) => setSplitMethod2(e.target.value as PaymentMethod)}
                      className="w-full mt-1 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                    >
                      <option value="pix">PIX</option>
                      <option value="credit_card">Cartão Crédito</option>
                      <option value="debit_card">Cartão Débito</option>
                      <option value="cash">Dinheiro</option>
                    </select>
                  </div>
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
                        value={cashGiven}
                        onChange={(e) => setCashGiven(parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-lg font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setCashGiven(totalAmount)}
                        className="px-3 py-2 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs rounded-xl hover:bg-slate-300 transition-colors whitespace-nowrap"
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
                          className="px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-300 hover:border-emerald-500 transition-colors"
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
                {method === 'pix' && (
                  <div className="p-4 rounded-xl bg-sky-500/5 border border-sky-500/20 flex flex-col sm:flex-row items-center gap-4">
                    {/* Simulated SVG QR Code */}
                    <div className="bg-white p-3 rounded-xl shadow-md border border-slate-200 flex flex-col items-center shrink-0">
                      <div className="w-32 h-32 bg-slate-900 text-white rounded-lg flex items-center justify-center p-2 text-center text-[10px] font-bold">
                        [QR CODE PIX DINÂMICO R$ {totalAmount.toFixed(2)}]
                      </div>
                      <span className="text-[10px] text-slate-500 font-bold mt-1">
                        Chave: {settings.pixKey}
                      </span>
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

                      <button
                        type="button"
                        onClick={handleCopyPix}
                        className="w-full sm:w-auto px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs transition-colors flex items-center justify-center gap-2 shadow-sm"
                      >
                        {pixCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        <span>{pixCopied ? 'Chave Copiada!' : 'Copiar Pix Copia e Cola'}</span>
                      </button>
                    </div>
                  </div>
                )}

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

        {/* Footer Buttons */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Voltar ao Carrinho
          </button>

          <button
            type="button"
            onClick={handleFinalize}
            disabled={loading || (method === 'credit_account' && !selectedCustomer)}
            className="flex-1 py-3 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-sm shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <span>Processando Venda...</span>
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5" />
                <span>Confirmar e Concluir Venda (F8)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
