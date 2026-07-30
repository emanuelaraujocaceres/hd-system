import React, { useState, useMemo, useCallback } from 'react';
import {
  Wallet,
  Search,
  User,
  CreditCard,
  Calendar,
  ShoppingCart,
  DollarSign,
  CheckCircle2,
  AlertTriangle,
  FileText,
  TrendingUp,
  X,
  Trash2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Sale, Customer, UserProfile } from '../../types';
import { storageService } from '../../services/storageService';
import { posAudio } from '../../services/audioService';
import { useToast } from '../shared/Toast';

// ─── Local types ────────────────────────────────────────────────
interface CreditPayment {
  id: string;
  saleId: string;
  customerId: string;
  amount: number;
  date: string;
}

interface SaleItemPaymentStatus {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  total: number;
  paidAmount: number; // how much of this item has been paid
}

interface CustomerDebt {
  customer: Customer;
  sales: Sale[];
  totalDebt: number;
  totalPaid: number;
  remaining: number;
  purchaseCount: number;
  items: SaleItemPaymentStatus[];
}

interface FiadosViewProps {
  sales: Sale[];
  customers: Customer[];
  user: UserProfile;
}

// ─── Component ──────────────────────────────────────────────────
export const FiadosView: React.FC<FiadosViewProps> = ({ sales, customers, user }) => {
  const isAdmin = user.role === 'admin';
  const { addToast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [creditPayments, setCreditPayments] = useState<CreditPayment[]>(storageService.getCreditPayments());
  const [paymentModalSaleId, setPaymentModalSaleId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [registeringPayment, setRegisteringPayment] = useState(false);
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null);

  // ── Build debt data ────────────────────────────────────────────
  const customerDebts = useMemo<CustomerDebt[]>(() => {
    // 1. Filter sales that have at least one credit_account payment
    const creditSales = sales.filter((s) =>
      s.payments.some((p) => p.method === 'credit_account')
    );

    // 2. Group by customerId
    const grouped = new Map<string, Sale[]>();
    for (const sale of creditSales) {
      const key = sale.customerId || '__no_customer__';
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(sale);
    }

    // 3. Build per-customer debt info
    const result: CustomerDebt[] = [];

    grouped.forEach((custSales, customerId) => {
      let customer = customers.find((c) => c.id === customerId);

      if (customerId === '__no_customer__' || !customer) {
        // Create a virtual customer entry for unassigned credit sales
        customer = {
          id: '__no_customer__',
          name: '🧾 Cliente Não Identificado',
          cpfCnpj: '—',
          email: '—',
          phone: '—',
          creditLimit: Infinity,
          currentBalance: 0,
          loyaltyPoints: 0,
          city: '',
          state: '',
          createdAt: '',
        } as unknown as Customer;
      }

      // Sort sales oldest first (FIFO)
      custSales.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      // Calculate total paid for this customer across all their credit sales
      const customerPayments = creditPayments.filter((cp) => cp.customerId === customerId);
      const totalPaid = customerPayments.reduce((acc, cp) => acc + cp.amount, 0);

      // Build item-level payment status for each sale
      const allItems: SaleItemPaymentStatus[] = [];
      let totalDebt = 0;

      for (const sale of custSales) {
        const saleTotal = sale.total > 0 ? sale.total : (sale.items?.reduce((sum, item) => sum + (item.total || 0), 0) || 0);
        const creditAmount =
          sale.payments.find((p) => p.method === 'credit_account')?.amount || saleTotal;

        // Distribute the sale's credit amount across its items proportionally
        const saleSubtotal = (sale.items || []).reduce((acc, item) => acc + item.total, 0);
        const ratio = saleSubtotal > 0 ? creditAmount / saleSubtotal : 1;

        for (const item of sale.items) {
          const itemCreditTotal = Math.round(item.total * ratio * 100) / 100;
          totalDebt += itemCreditTotal;

          // Find payments allocated to this item
          const paidForItem = customerPayments
            .filter((cp) => cp.saleId === sale.id)
            .reduce((acc, cp) => acc + cp.amount, 0);

          allItems.push({
            productId: item.productId,
            productName: item.productName,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            total: itemCreditTotal,
            paidAmount: 0, // Will be calculated below via FIFO
          });
        }
      }

      // FIFO allocation of payments across items (oldest sale first, cheapest item first)
      let remainingPaid = totalPaid;
      // Sort items by total ascending (cheapest first), but process oldest-sales first
      const sortedItems = [...allItems].sort((a, b) => a.total - b.total);

      for (const item of sortedItems) {
        if (remainingPaid <= 0) break;
        const apply = Math.min(remainingPaid, item.total);
        item.paidAmount = Math.round(apply * 100) / 100;
        remainingPaid = Math.round((remainingPaid - apply) * 100) / 100;
      }

      // Now re-sort items back to original order (by total desc, matching display)
      allItems.sort((a, b) => b.total - a.total);

      const actualPaid = Math.min(totalPaid, totalDebt);

      result.push({
        customer,
        sales: custSales,
        totalDebt: Math.round(totalDebt * 100) / 100,
        totalPaid: Math.round(actualPaid * 100) / 100,
        remaining: Math.round((totalDebt - actualPaid) * 100) / 100,
        purchaseCount: custSales.length,
        items: allItems,
      });
    });

    // Sort by remaining debt descending
    result.sort((a, b) => b.remaining - a.remaining);
    return result;
  }, [sales, customers, creditPayments]);

  // ── Filtered list ──────────────────────────────────────────────
  const filteredDebts = useMemo(() => {
    if (!searchTerm.trim()) return customerDebts;
    const term = searchTerm.toLowerCase();
    return customerDebts.filter(
      (d) =>
        d.customer.name.toLowerCase().includes(term) ||
        d.customer.cpfCnpj.includes(term)
    );
  }, [customerDebts, searchTerm]);

  // ── Totals ─────────────────────────────────────────────────────
  const grandTotalDebt = customerDebts.reduce((acc, d) => acc + d.remaining, 0);
  const grandTotalPaid = customerDebts.reduce((acc, d) => acc + d.totalPaid, 0);

  // ── Payment handler (FIFO) ─────────────────────────────────────
  const handleRegisterPayment = useCallback(
    (customerId: string, saleIds: string[]) => {
      const amount = parseFloat(paymentAmount);
      if (!amount || amount <= 0) {
        addToast('error', 'Informe um valor de pagamento válido.');
        return;
      }

      const debt = customerDebts.find(
        (d) => d.customer.id === customerId
      );
      if (!debt) return;

      if (amount > debt.remaining + 0.01) {
        addToast('error', `O valor excede o saldo restante de ${formatCurrency(debt.remaining)}.`);
        posAudio.error();
        return;
      }

      setRegisteringPayment(true);
      try {
        // FIFO: oldest sales first
        const sortedSaleIds = [...saleIds].sort((a, b) => {
          const saleA = sales.find((s) => s.id === a);
          const saleB = sales.find((s) => s.id === b);
          return (
            (saleA ? new Date(saleA.date).getTime() : 0) -
            (saleB ? new Date(saleB.date).getTime() : 0)
          );
        });

        // Distribute payment across sales (FIFO)
        let remaining = amount;
        const newPayments: CreditPayment[] = [];

        for (const saleId of sortedSaleIds) {
          if (remaining <= 0) break;

          // Calculate what's still owed on this sale
          const existingPayments = creditPayments.filter((cp) => cp.saleId === saleId);
          const totalPaidOnSale = existingPayments.reduce(
            (acc, cp) => acc + cp.amount,
            0
          );
          const sale = sales.find((s) => s.id === saleId);
          if (!sale) continue;

          const saleSubtotal = (sale.items || []).reduce((acc, item) => acc + item.total, 0);
          const saleTotal = sale.total > 0 ? sale.total : (sale.items?.reduce((sum, item) => sum + (item.total || 0), 0) || 0);
          const creditAmount =
            sale.payments.find((p) => p.method === 'credit_account')?.amount || saleTotal;
          const ratio = saleSubtotal > 0 ? creditAmount / saleSubtotal : 1;
          const totalSaleDebt = Math.round(saleSubtotal * ratio * 100) / 100;
          const remainingOnSale = Math.max(
            0,
            Math.round((totalSaleDebt - totalPaidOnSale) * 100) / 100
          );

          if (remainingOnSale <= 0) continue;

          const apply = Math.min(remaining, remainingOnSale);
          newPayments.push({
            id: `crdpay-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
            saleId,
            customerId,
            amount: Math.round(apply * 100) / 100,
            date: new Date().toISOString(),
          });

          remaining = Math.round((remaining - apply) * 100) / 100;
        }

        if (newPayments.length > 0) {
          const updated = [...creditPayments, ...newPayments];
          setCreditPayments(updated);
          storageService.saveCreditPayments(updated);
          posAudio.chime();
          addToast('success', `Pagamento de ${formatCurrency(amount)} registrado com sucesso.`);
        } else {
          addToast('warning', 'Nenhum valor pendente para esta dívida.');
          posAudio.error();
        }
      } catch (err: any) {
        addToast('error', err?.message || 'Erro ao registrar pagamento.');
        posAudio.error();
      } finally {
        setRegisteringPayment(false);
        setPaymentAmount('');
        setPaymentModalSaleId(null);
      }
    },
    [paymentAmount, creditPayments, customerDebts, sales, addToast]
  );

  // ── Delete credit payment handler (admin only) ──────────────────
  const handleDeleteCreditPayment = useCallback(
    (paymentId: string) => {
      if (!confirm('Tem certeza que deseja excluir este registro de pagamento?')) return;
      try {
        const updated = creditPayments.filter((cp) => cp.id !== paymentId);
        setCreditPayments(updated);
        storageService.saveCreditPayments(updated);
        posAudio.chime();
        addToast('success', 'Pagamento excluído.');
      } catch (err: any) {
        addToast('error', err?.message || 'Erro ao excluir pagamento.');
        posAudio.error();
      }
    },
    [creditPayments, addToast]
  );

  // ── Helpers ────────────────────────────────────────────────────
  const formatCurrency = (v: number) =>
    `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('pt-BR');
    } catch {
      return iso;
    }
  };

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="p-3 sm:p-4 md:p-6 max-w-7xl mx-auto space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Wallet className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            Contas Fiado (Accounts Receivable)
          </h2>
          <p className="text-xs text-slate-500">
            Acompanhe as compras a prazo dos clientes e registre pagamentos parciais
          </p>
        </div>

        {/* Summary cards */}
        <div className="flex gap-2">
          <div className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase">Em Aberto</p>
            <p className="text-sm font-bold text-amber-700 dark:text-amber-300">{formatCurrency(grandTotalDebt)}</p>
          </div>
          <div className="px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">Recebido</p>
            <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">{formatCurrency(grandTotalPaid)}</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="p-4 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] shadow-sm">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 dark:text-[#71717a] absolute left-3.5 top-3 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar cliente por nome ou CPF/CNPJ..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
      </div>

      {/* Empty state */}
      {filteredDebts.length === 0 && (
        <div className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-2xl shadow-sm p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-100 dark:bg-[#27272a] flex items-center justify-center">
            <Wallet className="w-8 h-8 text-slate-400 dark:text-[#71717a]" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
            {searchTerm ? 'Nenhum cliente encontrado' : 'Nenhuma conta fiado registrada'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-[#71717a] max-w-sm mx-auto">
            {searchTerm
              ? 'Tente buscar por outro nome ou CPF/CNPJ.'
              : 'Quando uma venda for feita com pagamento via "Conta Fiado", ela aparecerá aqui automaticamente.'}
          </p>
        </div>
      )}

      {/* Customer debt cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filteredDebts.map((debt) => {
          const paymentPercent = debt.totalDebt > 0
            ? Math.round((debt.totalPaid / debt.totalDebt) * 100)
            : 100;
          const isFullyPaid = debt.remaining <= 0.01;
          const isExpanded = expandedCustomerId === debt.customer.id;

          return (
            <div
              key={debt.customer.id}
              className={`bg-white dark:bg-[#18181b] border rounded-2xl shadow-sm overflow-hidden transition-all cursor-pointer ${
                isFullyPaid
                  ? 'border-emerald-200 dark:border-emerald-900/50'
                  : 'border-slate-200 dark:border-[#27272a]'
              } ${isExpanded ? 'ring-2 ring-amber-500/30' : ''}`}
            >
              {/* Card header */}
              <div
                onClick={() => setExpandedCustomerId(isExpanded ? null : debt.customer.id)}
                className="p-4 border-b border-slate-100 dark:border-[#27272a]"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold ${
                        isFullyPaid
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {debt.customer.name
                        .split(' ')
                        .slice(0, 2)
                        .map((w) => w[0])
                        .join('')
                        .toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        {debt.customer.name}
                      </h3>
                      <p className="text-[10px] text-slate-500 dark:text-[#71717a] font-mono">
                        {debt.customer.cpfCnpj || 'Sem CPF/CNPJ'}
                      </p>
                    </div>
                  </div>

                  {isFullyPaid ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">
                      <CheckCircle2 className="w-3 h-3" />
                      Quitado
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[10px] font-bold">
                      <AlertTriangle className="w-3 h-3" />
                      Em aberto
                    </span>
                  )}
                  <span className="text-slate-400 dark:text-[#71717a] ml-1">
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </span>
                </div>

                {/* Financial summary */}
                <div className="grid grid-cols-3 gap-2 mt-3">
                  <div className="px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-[#09090b]">
                    <p className="text-[9px] font-bold text-slate-400 dark:text-[#71717a] uppercase">Total Vendas</p>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">
                      {formatCurrency(debt.totalDebt)}
                    </p>
                  </div>
                  <div className="px-2 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
                    <p className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">Pago</p>
                    <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                      {formatCurrency(debt.totalPaid)}
                    </p>
                  </div>
                  <div className="px-2 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-900/20">
                    <p className="text-[9px] font-bold text-rose-500 dark:text-rose-400 uppercase">Restante</p>
                    <p className="text-xs font-bold text-rose-700 dark:text-rose-300">
                      {formatCurrency(debt.remaining)}
                    </p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-3">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] font-bold text-slate-500 dark:text-[#71717a]">
                      Progresso
                    </span>
                    <span className="text-[10px] font-bold text-slate-600 dark:text-[#a1a1aa]">
                      {paymentPercent}%
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-[#27272a] overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isFullyPaid
                          ? 'bg-emerald-500'
                          : paymentPercent > 50
                          ? 'bg-amber-500'
                          : 'bg-rose-500'
                      }`}
                      style={{ width: `${Math.min(paymentPercent, 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Items list - only shown when expanded */}
              {isExpanded && (
              <div className="p-4" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-2 mb-3">
                  <ShoppingCart className="w-3.5 h-3.5 text-slate-400 dark:text-[#71717a]" />
                  <h4 className="text-[10px] font-bold text-slate-500 dark:text-[#71717a] uppercase tracking-wider">
                    Itens Comprados ({debt.items.length})
                  </h4>
                </div>

                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {debt.items.map((item, idx) => {
                    const itemPaidPercent =
                      item.total > 0 ? Math.round((item.paidAmount / item.total) * 100) : 0;
                    const itemRemaining = Math.round((item.total - item.paidAmount) * 100) / 100;
                    const isItemPaid = itemRemaining <= 0.01;

                    return (
                      <div
                        key={`${item.productId}-${idx}`}
                        className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-[#09090b] border border-slate-100 dark:border-[#27272a]"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                            {item.productName}
                          </p>
                          <p className="text-[10px] text-slate-500 dark:text-[#71717a]">
                            {item.quantity}x {formatCurrency(item.unitPrice)}
                          </p>
                        </div>
                        <div className="text-right ml-2 flex-shrink-0">
                          {isItemPaid ? (
                            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                              Pago
                            </span>
                          ) : itemPaidPercent > 0 ? (
                            <div>
                              <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
                                {formatCurrency(itemRemaining)}
                              </span>
                              <div className="w-12 h-1 rounded-full bg-slate-200 dark:bg-[#27272a] mt-0.5 ml-auto">
                                <div
                                  className="h-full rounded-full bg-amber-500"
                                  style={{ width: `${itemPaidPercent}%` }}
                                />
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs font-bold text-rose-600 dark:text-rose-400">
                              {formatCurrency(item.total)}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Sale references */}
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-[#27272a]">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-3 h-3 text-slate-400 dark:text-[#71717a]" />
                    <span className="text-[10px] font-bold text-slate-500 dark:text-[#71717a] uppercase">
                      Vendas ({debt.purchaseCount})
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {debt.sales.map((sale) => (
                      <span
                        key={sale.id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#27272a] text-[10px] font-semibold text-slate-600 dark:text-[#a1a1aa]"
                      >
                        <Calendar className="w-2.5 h-2.5" />
                        {sale.code} — {formatDate(sale.date)}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Admin: Credit payment history with delete */}
                {isAdmin && creditPayments.filter((cp) => cp.customerId === debt.customer.id).length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-[#27272a]">
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign className="w-3 h-3 text-emerald-500" />
                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">
                        Pagamentos Registrados
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {creditPayments
                        .filter((cp) => cp.customerId === debt.customer.id)
                        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                        .map((cp) => (
                          <div key={cp.id} className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900/30">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                                {formatCurrency(cp.amount)}
                              </span>
                              <span className="text-[10px] text-slate-500 dark:text-[#71717a]">
                                {formatDate(cp.date)}
                              </span>
                            </div>
                            <button
                              onClick={() => handleDeleteCreditPayment(cp.id)}
                              className="p-1 rounded-lg hover:bg-rose-500/10 text-slate-400 hover:text-rose-500 transition-colors"
                              title="Excluir Pagamento"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Payment button */}
                {!isFullyPaid && (
                  <div className="mt-4">
                    <button
                      onClick={() => {
                        setPaymentModalSaleId(debt.customer.id);
                        setPaymentAmount('');
                        posAudio.click();
                      }}
                      className="w-full px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2"
                    >
                      <CreditCard className="w-4 h-4" />
                      Registrar Pagamento
                    </button>
                  </div>
                )}
              </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Payment Modal */}
      {paymentModalSaleId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-sm rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-amber-500" />
                Registrar Pagamento
              </h3>
              <button
                onClick={() => {
                  setPaymentModalSaleId(null);
                  setPaymentAmount('');
                }}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            {/* Customer info */}
            {(() => {
              const debt = customerDebts.find(
                (d) => d.customer.id === paymentModalSaleId
              );
              if (!debt) return null;

              return (
                <div className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a]">
                  <p className="text-xs font-bold text-slate-900 dark:text-white">
                    {debt.customer.name}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[10px] text-rose-500 dark:text-rose-400 font-bold">
                      Restante: {formatCurrency(debt.remaining)}
                    </span>
                    <span className="text-[10px] text-emerald-500 dark:text-emerald-400 font-bold">
                      Pago: {formatCurrency(debt.totalPaid)}
                    </span>
                  </div>
                </div>
              );
            })()}

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-[#a1a1aa] mb-1">
                Valor do Pagamento (R$)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="0,00"
                autoFocus
                className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {/* Quick amount buttons */}
            {(() => {
              const debt = customerDebts.find(
                (d) => d.customer.id === paymentModalSaleId
              );
              if (!debt) return null;

              const quickAmounts = [
                { label: '50%', value: debt.remaining / 2 },
                { label: '75%', value: debt.remaining * 0.75 },
                { label: '100%', value: debt.remaining },
              ];

              return (
                <div className="flex gap-2">
                  {quickAmounts.map((qa) => (
                    <button
                      key={qa.label}
                      onClick={() => {
                        setPaymentAmount(qa.value.toFixed(2));
                        posAudio.click();
                      }}
                      className="flex-1 px-2 py-1.5 rounded-lg bg-slate-100 dark:bg-[#27272a] hover:bg-slate-200 dark:hover:bg-[#3f3f46] text-[10px] font-bold text-slate-600 dark:text-[#a1a1aa] transition-colors"
                    >
                      {qa.label}
                    </button>
                  ))}
                </div>
              );
            })()}

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => {
                  setPaymentModalSaleId(null);
                  setPaymentAmount('');
                }}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-[#a1a1aa] hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  const debt = customerDebts.find(
                    (d) => d.customer.id === paymentModalSaleId
                  );
                  if (debt) {
                    handleRegisterPayment(
                      debt.customer.id,
                      debt.sales.map((s) => s.id)
                    );
                  }
                }}
                disabled={registeringPayment || !paymentAmount || parseFloat(paymentAmount) <= 0}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                {registeringPayment ? 'Registrando...' : 'Confirmar Pagamento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
