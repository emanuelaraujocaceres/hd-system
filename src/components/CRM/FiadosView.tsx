import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Wallet,
  Search,
  User,
  CreditCard,
  Calendar,
  DollarSign,
  CheckCircle2,
  AlertTriangle,
  FileText,
  TrendingUp,
  X,
  Trash2,
  ChevronDown,
  ChevronUp,
  Banknote,
} from 'lucide-react';
import { Sale, Customer, UserProfile, CashRegisterSession } from '../../types';
import { storageService } from '../../services/storageService';
import { posAudio } from '../../services/audioService';
import { globalNotificationService } from '../../services/globalNotificationService';
import { useToast } from '../shared/Toast';
import { MoneyInput, parseBrlToNumber, formatNumberToBrl } from '../shared/MoneyInput';
import { friendlyErrorMessage } from '../../lib/friendlyError';
import { ConfirmDialog } from '../shared/ConfirmDialog';

// ─── Local types ────────────────────────────────────────────────
interface CreditPayment {
  id: string;
  saleId: string;
  customerId?: string;
  customerName?: string;
  amount: number;
  date: string;
  paymentMethod?: string;
  storeBranchId?: string;
  organizationId?: string;
}

interface SaleItemPaymentStatus {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  total: number;
  paidAmount: number; // how much of this item has been paid
  saleId?: string; // venda de origem (para localizar o lançamento)
  isManual?: boolean; // lançamento manual pré-sistema (item sintético)
}

export interface CustomerDebt {
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
  caixaSession: CashRegisterSession;
}

// Filtra apenas débitos em aberto (remaining > 0.01). Contas quitadas somem
// do Fiados — o card do cliente não aparece quando não há nada pendente.
export const filterOpenDebts = (debts: CustomerDebt[], term = ''): CustomerDebt[] => {
  const open = debts.filter((d) => d.remaining > 0.01);
  if (!term.trim()) return open;
  const t = term.toLowerCase();
  return open.filter(
    (d) =>
      d.customer.name.toLowerCase().includes(t) ||
      d.customer.cpfCnpj.includes(term),
  );
};

// Valor fiado de UMA venda (source of truth dos dois fluxos do Fiados).
// BUG-005 fix: soma TODOS os pagamentos credit_account (split payment);
// fallback para saleTotal só quando não há nenhum pagamento credit.
export const getSaleCreditAmount = (sale: Sale): number => {
  const saleTotal =
    sale.total > 0
      ? sale.total
      : (sale.items?.reduce((sum, item) => sum + (item.total || 0), 0) || 0);
  return (
    Math.round(
      (sale.payments || [])
        .filter((p) => p.method === 'credit_account')
        .reduce((sum, p) => sum + (p.amount || 0), 0) * 100,
    ) / 100 || saleTotal
  );
};

// Contribuição de UMA venda para a dívida do cliente (rateio por item).
// Venda SEM itens (ex.: VEN-MTXM60OB-IE51, items=[] total R$5,50): rateio
// impossível — o loop original somava 0 e o valor evaporava do EM ABERTO
// (Financeiro contava 5,50 via payments). Fallback: dívida = fiado direto,
// com item sintético para exibição e alocação FIFO. Sem isso, o registro de
// pagamento também ignorava a venda (remainingOnSale = 0).
export const getSaleDebtItems = (
  sale: Sale,
): { debt: number; items: SaleItemPaymentStatus[] } => {
  const creditAmount = getSaleCreditAmount(sale);
  const items = sale.items || [];
  if (items.length === 0) {
    if (creditAmount <= 0) return { debt: 0, items: [] };
    // O motivo do lançamento manual (dívida pré-sistema) viaja em sale.notes
    // e aparece aqui como identificação do registro no card.
    const label = sale.notes?.trim()
      ? `Venda ${sale.code || ''} — ${sale.notes.trim()}`
      : `Venda ${sale.code || ''} — itens não discriminados`;
    return {
      debt: creditAmount,
      items: [
        {
          productId: sale.id,
          productName: label,
          unitPrice: creditAmount,
          quantity: 1,
          total: creditAmount,
          paidAmount: 0, // Will be calculated below via FIFO
          saleId: sale.id,
          isManual: true,
        },
      ],
    };
  }
  const saleSubtotal = items.reduce((acc, item) => acc + item.total, 0);
  const ratio = saleSubtotal > 0 ? creditAmount / saleSubtotal : 1;
  const out: SaleItemPaymentStatus[] = [];
  let debt = 0;
  for (const item of items) {
    const itemCreditTotal = Math.round(item.total * ratio * 100) / 100;
    debt += itemCreditTotal;
    out.push({
      productId: item.productId,
      productName: item.productName,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      total: itemCreditTotal,
      paidAmount: 0, // Will be calculated below via FIFO
      saleId: sale.id,
      isManual: false,
    });
  }
  return { debt, items: out };
};

export interface ManualDebtInput {
  customerId?: string;
  customerName: string;
  amount: number;
  reason: string;
  operatorId: string;
  operatorName: string;
  storeBranchId: string;
  organizationId: string;
}

// Monta a venda fiado de um lançamento manual de dívida (ex.: produtos
// vendidos no fiado antes do sistema existir). Sem itens: não movimenta
// estoque (loop de baixa/RPC operam sobre items vazios — precedente
// VEN-MTXM60OB-IE51), não cria sale_items, e o motivo viaja em `notes`
// (exibido no card via getSaleDebtItems). O recebível, o KPI do Financeiro
// e a baixa FIFO funcionam pelo fluxo normal de fiado. Retorna null quando
// os dados são inválidos (valor <= 0 ou motivo vazio).
export const buildManualDebtSale = (input: ManualDebtInput): Sale | null => {
  const amount = Math.round((input.amount || 0) * 100) / 100;
  const reason = (input.reason || '').trim();
  const customerName = (input.customerName || '').trim();
  if (amount <= 0 || !reason || !customerName) return null;
  const code = `VEN-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  return {
    id: crypto.randomUUID(),
    code,
    date: new Date().toISOString(),
    operatorId: input.operatorId,
    operatorName: input.operatorName,
    customerId: input.customerId,
    customerName,
    storeBranchId: input.storeBranchId,
    items: [],
    subtotal: amount,
    discount: 0,
    total: amount,
    payments: [{ method: 'credit_account', amount }],
    orderSource: 'fiado',
    kitchenStatus: 'pending',
    status: 'completed',
    organizationId: input.organizationId,
    updatedAt: new Date().toISOString(),
    notes: reason,
  } as Sale;
};

// Exclusão segura de lançamento manual: só sem pagamentos vinculados (senão
// os credit_payments ficariam órfãos e distorceriam o quitado do cliente).
// Com zero pagamentos, storageService.deleteSale remove venda + recebível
// (mesmo id, título 'Fiado…') e recalcula o caixa. Puro/testável.
export const canDeleteManualDebtSale = (
  sale: Sale | undefined,
  creditPayments: { saleId: string }[],
): boolean => {
  if (!sale || sale.orderSource !== 'fiado') return false;
  return !(creditPayments || []).some((cp) => cp.saleId === sale.id);
};
// recente ao mais antigo e separa os N primeiros; o resto vai em "ver todos".
// Puro/testável — o card só consome o resultado.
export const getPaymentsPreview = <T extends { date: string }>(
  payments: T[],
  limit = 3,
): { visible: T[]; hiddenCount: number; total: number } => {
  const sorted = [...(payments || [])].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  return {
    visible: sorted.slice(0, limit),
    hiddenCount: Math.max(0, sorted.length - limit),
    total: sorted.length,
  };
};

export type FiadoDetailTab = 'itens' | 'vendas' | 'pagamentos';

// Rótulo curto do método (linha enxuta do histórico).
export const paymentMethodShortLabel = (method?: string): string => {
  const labels: Record<string, string> = {
    cash: 'dinheiro',
    pix: 'PIX',
    credit_card: 'crédito',
    debit_card: 'débito',
  };
  return (method && labels[method]) || '';
};

// ─── Component ──────────────────────────────────────────────────
export const FiadosView: React.FC<FiadosViewProps> = ({ sales, customers, user, caixaSession }) => {
  const isAdmin = user.role === 'admin' || !!user.superadmin;
  const isCaixaOpen = caixaSession && caixaSession.status === 'open';
  const { addToast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [creditPayments, setCreditPayments] = useState<CreditPayment[]>(storageService.getCreditPayments());
  const [paymentModalSaleId, setPaymentModalSaleId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'pix' | 'credit_card' | 'debit_card'>('cash');
  const [registeringPayment, setRegisteringPayment] = useState(false);
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null);
  // UX do detalhe: abas + prévia de pagamentos (não polui o card)
  const [expandedTab, setExpandedTab] = useState<FiadoDetailTab>('itens');
  const [showAllPayments, setShowAllPayments] = useState(false);
  // Lançamento manual de dívida (pré-sistema): sem gate de perfil além do
  // acesso ao módulo (decisão do usuário) — igual ao Registrar Pagamento.
  const [debtModalCustomerId, setDebtModalCustomerId] = useState<string | null>(null);
  const [debtCustomerPick, setDebtCustomerPick] = useState('');
  const [debtAmount, setDebtAmount] = useState('');
  const [debtReason, setDebtReason] = useState('');
  const [registeringDebt, setRegisteringDebt] = useState(false);

  // Atualiza pagamentos ao vivo quando outro dispositivo registra/exclui um pagamento
  useEffect(() => {
    const unsub = storageService.subscribe(() => {
      setCreditPayments(storageService.getCreditPayments());
    });
    return () => { unsub(); };
  }, []);

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

      // Build item-level payment status for each sale (rateio extraído em
      // getSaleDebtItems — cobre venda sem itens, que somava 0)
      const allItems: SaleItemPaymentStatus[] = [];
      let totalDebt = 0;

      for (const sale of custSales) {
        const contrib = getSaleDebtItems(sale);
        totalDebt += contrib.debt;
        allItems.push(...contrib.items);
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

  // ── Filtered list (só débitos em aberto) ──────────────────────
  const filteredDebts = useMemo(
    () => filterOpenDebts(customerDebts, searchTerm),
    [customerDebts, searchTerm],
  );

  // ── Totals ─────────────────────────────────────────────────────
  const grandTotalDebt = customerDebts.reduce((acc, d) => acc + d.remaining, 0);
  const grandTotalPaid = customerDebts.reduce((acc, d) => acc + d.totalPaid, 0);

  // ── Payment handler (FIFO) ─────────────────────────────────────
  const handleRegisterPayment = useCallback(
    (customerId: string, saleIds: string[]) => {
      const amount = parseBrlToNumber(paymentAmount);
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

          const creditAmount = getSaleCreditAmount(sale);
          const saleItems = sale.items || [];
          const saleSubtotal = saleItems.reduce((acc, item) => acc + item.total, 0);
          // Venda sem itens (ex.: VEN-MTXM60OB-IE51): sem rateio possível, a
          // dívida da venda é o próprio fiado — senão o pagamento a ignorava
          // (remainingOnSale = 0) e o valor nunca amortizava.
          const ratio = saleSubtotal > 0 ? creditAmount / saleSubtotal : 1;
          const totalSaleDebt = saleItems.length === 0
            ? creditAmount
            : Math.round(saleSubtotal * ratio * 100) / 100;
          const remainingOnSale = Math.max(
            0,
            Math.round((totalSaleDebt - totalPaidOnSale) * 100) / 100
          );

          if (remainingOnSale <= 0) continue;

          const apply = Math.min(remaining, remainingOnSale);
          newPayments.push({
            id: crypto.randomUUID(),
            saleId,
            customerId,
            amount: Math.round(apply * 100) / 100,
            date: new Date().toISOString(),
            paymentMethod,
          });

          remaining = Math.round((remaining - apply) * 100) / 100;
        }

        if (newPayments.length > 0) {
          const updated = [...creditPayments, ...newPayments];
          setCreditPayments(updated);
          // Sincroniza cada pagamento com o banco (aparece em todos os dispositivos)
          newPayments.forEach((p) => storageService.saveCreditPayment(p));

          // ── Registra no caixa (se pagamento em dinheiro e caixa aberto) ──
          if (paymentMethod === 'cash' && isCaixaOpen) {
            storageService.addSuprimento(amount, `Pagamento fiado - ${debt.customer.name}`);
          }

          // ── Registra no financeiro (financial_transaction de entrada) ──
          const sale = sales.find((s) => s.id === newPayments[0].saleId);
          storageService.saveFinancialAccount({
            id: crypto.randomUUID(),
            title: `Pagamento Fiado - ${debt.customer.name}`,
            type: 'receivable',
            category: 'fiado_payment',
            amount,
            dueDate: new Date().toISOString().slice(0, 10),
            status: 'paid',
            paidDate: new Date().toISOString(),
            recipientOrPayer: debt.customer.name,
            storeBranchId: sale?.storeBranchId || storageService.getSelectedBranchId(),
            organizationId: storageService.getCurrentOrgId(),
            notes: `Pagamento fiado via ${paymentMethod} - Venda ${sale?.code || ''}`,
          });

          posAudio.chime();
          addToast('success', `Pagamento de ${formatCurrency(amount)} registrado via ${paymentMethod === 'cash' ? 'dinheiro' : paymentMethod === 'pix' ? 'PIX' : paymentMethod}.`);
          // ✅ Global notification for fiado payment (marca eco local p/ não
          // duplicar o bip/toast quando o INSERT do Realtime voltar neste aparelho)
          globalNotificationService.markLocalCreditPayment(debt.customer.name, amount);
          globalNotificationService.notifyFiado(debt.customer.name, amount, 'payment');
        } else {
          addToast('warning', 'Nenhum valor pendente para esta dívida.');
          posAudio.error();
        }
      } catch (err: any) {
        addToast('error', friendlyErrorMessage(err, 'Não foi possível registrar o pagamento. Tente novamente.'));
        posAudio.error();
      } finally {
        setRegisteringPayment(false);
        setPaymentAmount('');
        setPaymentModalSaleId(null);
      }
    },
    [paymentAmount, paymentMethod, creditPayments, customerDebts, sales, addToast, isCaixaOpen]
  );

  // ── Delete credit payment handler (admin only) ──────────────────
  const [confirmDeletePayment, setConfirmDeletePayment] = useState<CreditPayment | null>(null);
  const handleConfirmDeletePayment = useCallback(() => {
    if (!confirmDeletePayment) return;
    const paymentId = confirmDeletePayment.id;
    setConfirmDeletePayment(null);
    try {
      const updated = creditPayments.filter((cp) => cp.id !== paymentId);
      setCreditPayments(updated);
      storageService.deleteCreditPayment(paymentId);
      posAudio.chime();
      addToast('success', 'Pagamento excluído.');
    } catch (err: any) {
      addToast('error', friendlyErrorMessage(err, 'Não foi possível excluir o pagamento. Tente novamente.'));
      posAudio.error();
    }
  }, [confirmDeletePayment, creditPayments, addToast]);

  // ── Excluir lançamento manual de dívida (admin) ────────────────────
  const [confirmDeleteDebtSaleId, setConfirmDeleteDebtSaleId] = useState<string | null>(null);
  const handleConfirmDeleteDebt = useCallback(() => {
    const saleId = confirmDeleteDebtSaleId;
    setConfirmDeleteDebtSaleId(null);
    if (!saleId) return;
    const sale = sales.find((s) => s.id === saleId);
    if (!canDeleteManualDebtSale(sale, creditPayments)) {
      addToast('error', 'Exclua os pagamentos deste lançamento antes (aba Pagamentos).');
      posAudio.error();
      return;
    }
    try {
      storageService.deleteSale(saleId);
      posAudio.chime();
      addToast('success', `Lançamento ${sale!.code} excluído.`);
    } catch (err: any) {
      addToast('error', friendlyErrorMessage(err, 'Não foi possível excluir o lançamento. Tente novamente.'));
      posAudio.error();
    }
  }, [confirmDeleteDebtSaleId, sales, creditPayments, addToast]);

  // ── Lançamento manual de dívida (pré-sistema) ──────────────────────
  // Cria venda fiado sem itens via buildManualDebtSale + addSale: o recebível,
  // o KPI do Financeiro e a baixa FIFO passam a contar juntos, sem etapa
  // separada. Sem gate de perfil além do acesso ao módulo.
  const openDebtModal = useCallback((customerId: string) => {
    setDebtModalCustomerId(customerId);
    setDebtCustomerPick(customerId);
    setDebtAmount('');
    setDebtReason('');
    posAudio.click();
  }, []);

  const handleRegisterDebt = useCallback(async () => {
    const amount = parseBrlToNumber(debtAmount);
    if (!amount || amount <= 0) {
      addToast('error', 'Informe um valor de dívida válido.');
      return;
    }
    if (!debtReason.trim()) {
      addToast('error', 'Informe o motivo do lançamento (ex.: produtos vendidos antes do sistema).');
      return;
    }
    // Cliente pode vir do card ou do seletor (dívida de quem ainda não tem fiado)
    const pickedId = debtCustomerPick || debtModalCustomerId || '';
    const debt = customerDebts.find((d) => d.customer.id === pickedId);
    const known = customers.find((c) => c.id === pickedId);
    const customerName = debt?.customer.name || known?.name || '';
    if (!customerName) {
      addToast('error', 'Selecione o cliente.');
      return;
    }
    const branchId = storageService.getSelectedBranchId();
    if (!branchId) {
      addToast('error', 'Nenhuma filial selecionada.');
      return;
    }
    const sale = buildManualDebtSale({
      customerId: pickedId && pickedId !== '__no_customer__' ? pickedId : undefined,
      customerName,
      amount,
      reason: debtReason,
      operatorId: user.id,
      operatorName: user.name,
      storeBranchId: branchId,
      organizationId: storageService.getCurrentOrgId(),
    });
    if (!sale) {
      addToast('error', 'Não foi possível montar o lançamento. Confira valor e motivo.');
      return;
    }
    setRegisteringDebt(true);
    try {
      const result = await storageService.addSale(sale);
      if (!result.success) {
        addToast('error', result.message || 'Não foi possível lançar a dívida. Tente novamente.');
        posAudio.error();
        return;
      }
      posAudio.chime();
      addToast('success', `Dívida de ${formatCurrency(amount)} lançada para ${customerName}.`);
      // Eco local: o Realtime devolve a venda; sem a marca, bip/toast duplicam
      globalNotificationService.markLocalSale(sale.code);
      globalNotificationService.notifyFiado(customerName, amount, 'new');
    } catch (err: any) {
      addToast('error', friendlyErrorMessage(err, 'Não foi possível lançar a dívida. Tente novamente.'));
      posAudio.error();
    } finally {
      setRegisteringDebt(false);
      setDebtAmount('');
      setDebtReason('');
      setDebtModalCustomerId(null);
    }
  }, [debtAmount, debtReason, debtCustomerPick, debtModalCustomerId, customerDebts, customers, user, addToast]);

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
            Fiados
          </h2>
          <p className="text-xs text-slate-500">
            Acompanhe as compras a prazo dos clientes e registre pagamentos parciais
          </p>
        </div>

        {/* Summary cards */}
        <div className="flex gap-2 items-stretch">
          <div className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase">Em Aberto</p>
            <p className="text-sm font-bold text-amber-700 dark:text-amber-300">{formatCurrency(grandTotalDebt)}</p>
          </div>
          <div className="px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">Recebido</p>
            <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">{formatCurrency(grandTotalPaid)}</p>
          </div>
          <button
            onClick={() => openDebtModal('')}
            className="px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5"
            title="Lançar dívida de venda feita antes do sistema (entra no Fiados e no Financeiro)"
          >
            <Wallet className="w-4 h-4" />
            Adicionar dívida
          </button>
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
          // Histórico do cliente (ordenado do mais recente); reutilizado na aba
          const custPayments = creditPayments
            .filter((cp) => cp.customerId === debt.customer.id)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          const paymentsPreview = getPaymentsPreview(custPayments, 3);

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
                onClick={() => {
                  setExpandedCustomerId(isExpanded ? null : debt.customer.id);
                  setExpandedTab('itens');
                  setShowAllPayments(false);
                }}
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

              {/* Detail - only shown when expanded */}
              {isExpanded && (
              <div className="p-4" onClick={(e) => e.stopPropagation()}>
                {/* Abas do detalhe: histórico de pagamentos fica na própria aba */}
                <div className="flex gap-1 p-1 mb-3 bg-slate-100 dark:bg-[#09090b] rounded-xl">
                  {([
                    { key: 'itens', label: `Itens (${debt.items.length})` },
                    { key: 'vendas', label: `Vendas (${debt.purchaseCount})` },
                    ...(isAdmin ? [{ key: 'pagamentos', label: `Pagamentos (${custPayments.length})` }] : []),
                  ] as { key: FiadoDetailTab; label: string }[]).map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => { setExpandedTab(tab.key); posAudio.click(); }}
                      className={`flex-1 px-2 py-1.5 rounded-lg font-bold text-[11px] transition-colors ${
                        expandedTab === tab.key
                          ? 'bg-white dark:bg-[#18181b] shadow text-amber-600 dark:text-amber-400'
                          : 'text-slate-500 dark:text-[#71717a] hover:text-slate-700 dark:hover:text-slate-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {expandedTab === 'itens' && (
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
                            {item.isManual && (
                              <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 font-bold text-[9px] align-middle">
                                Manual
                              </span>
                            )}
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
                          {item.isManual && isAdmin && item.saleId && (
                            <button
                              onClick={() => setConfirmDeleteDebtSaleId(item.saleId!)}
                              className="mt-1 ml-auto p-1 rounded-lg hover:bg-rose-500/10 text-slate-400 hover:text-rose-500 transition-colors block"
                              title="Excluir lançamento manual"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                )}

                {/* Sale references */}
                {expandedTab === 'vendas' && (
                <div>
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

                )}

                {/* Pagamentos (admin): resumo + últimos 3 + ver todos.
                    O histórico completo continua no Financeiro. */}
                {expandedTab === 'pagamentos' && isAdmin && (
                  <div>
                    <div className="px-3 py-2 mb-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
                      <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                        {paymentsPreview.total} pagamento(s)
                      </span>
                      <span className="text-[10px] font-semibold text-slate-500 dark:text-[#71717a]">
                        {custPayments.length > 0 ? `último ${formatDate(custPayments[0].date)}` : 'nenhum pagamento'}
                      </span>
                    </div>
                    {paymentsPreview.total === 0 ? (
                      <p className="text-center text-[11px] text-slate-400 py-4">
                        Nenhum pagamento registrado.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {(showAllPayments ? custPayments : paymentsPreview.visible).map((cp) => (
                          <div key={cp.id} className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-[#09090b] border border-slate-100 dark:border-[#27272a]">
                            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                              {formatCurrency(cp.amount)}
                              <span className="ml-1.5 font-semibold text-slate-500 dark:text-[#71717a]">
                                {formatDate(cp.date)}{cp.paymentMethod ? ` · ${paymentMethodShortLabel(cp.paymentMethod)}` : ''}
                              </span>
                            </span>
                            <button
                              onClick={() => setConfirmDeletePayment(cp)}
                              className="p-1 rounded-lg hover:bg-rose-500/10 text-slate-400 hover:text-rose-500 transition-colors"
                              title="Excluir Pagamento"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                        {paymentsPreview.hiddenCount > 0 && (
                          <button
                            onClick={() => { setShowAllPayments(!showAllPayments); posAudio.click(); }}
                            className="w-full px-2 py-1.5 rounded-lg text-[11px] font-bold text-amber-700 dark:text-amber-300 hover:bg-amber-600/10 transition-colors"
                          >
                            {showAllPayments ? 'Ver menos' : `Ver todos (${paymentsPreview.hiddenCount} a mais)`}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Payment / debt buttons — sticky para alcançar sem scroll */}
                <div className="mt-4 space-y-2 sticky bottom-2 bg-white/95 dark:bg-[#18181b]/95 backdrop-blur rounded-xl border border-slate-200 dark:border-[#27272a] shadow-lg p-2">
                  {!isFullyPaid && (
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
                  )}
                  <button
                    onClick={() => openDebtModal(debt.customer.id)}
                    className="w-full px-4 py-2.5 rounded-xl border border-amber-600/40 hover:bg-amber-600/10 text-amber-700 dark:text-amber-300 font-bold text-xs transition-all flex items-center justify-center gap-2"
                    title="Lançar dívida de venda feita antes do sistema"
                  >
                    <Wallet className="w-4 h-4" />
                    Adicionar dívida
                  </button>
                </div>
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
              <MoneyInput
                value={paymentAmount}
                onChange={setPaymentAmount}
                placeholder="0,00"
                autoFocus
                className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {/* Forma de Pagamento */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-[#a1a1aa] mb-1">
                Forma de Pagamento
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'cash', label: 'Dinheiro', icon: Banknote, color: 'emerald' },
                  { id: 'pix', label: 'PIX', icon: DollarSign, color: 'blue' },
                  { id: 'credit_card', label: 'Crédito', icon: CreditCard, color: 'purple' },
                  { id: 'debit_card', label: 'Débito', icon: CreditCard, color: 'orange' },
                ].map((method) => {
                  const Icon = method.icon;
                  const isSelected = paymentMethod === method.id;
                  return (
                    <button
                      key={method.id}
                      type="button"
                      onClick={() => {
                        setPaymentMethod(method.id as typeof paymentMethod);
                        posAudio.click();
                      }}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold transition-all ${
                        isSelected
                          ? method.color === 'emerald'
                            ? 'bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400'
                            : method.color === 'blue'
                            ? 'bg-blue-500/10 border-blue-500 text-blue-600 dark:text-blue-400'
                            : method.color === 'purple'
                            ? 'bg-purple-500/10 border-purple-500 text-purple-600 dark:text-purple-400'
                            : 'bg-orange-500/10 border-orange-500 text-orange-600 dark:text-orange-400'
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-[#a1a1aa] hover:bg-slate-100 dark:hover:bg-[#27272a]'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {method.label}
                    </button>
                  );
                })}
              </div>
              {paymentMethod === 'cash' && !isCaixaOpen && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Caixa fechado — pagamento será registrado apenas no financeiro.
                </p>
              )}
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
                        setPaymentAmount(formatNumberToBrl(qa.value));
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
                disabled={registeringPayment || !paymentAmount || parseBrlToNumber(paymentAmount) <= 0}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                {registeringPayment ? 'Registrando...' : 'Confirmar Pagamento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm: excluir pagamento */}
      <ConfirmDialog
        isOpen={confirmDeletePayment !== null}
        title="Excluir pagamento?"
        message="O registro de pagamento será removido do histórico de fiado."
        itemName={confirmDeletePayment ? `R$ ${(confirmDeletePayment.amount || 0).toFixed(2)}` : undefined}
        confirmLabel="Excluir"
        onConfirm={handleConfirmDeletePayment}
        onCancel={() => setConfirmDeletePayment(null)}
      />

      {/* Confirm: excluir lançamento manual de dívida */}
      <ConfirmDialog
        isOpen={confirmDeleteDebtSaleId !== null}
        title="Excluir lançamento?"
        message="A dívida manual e sua conta a receber serão removidas. Só é possível sem pagamentos vinculados."
        itemName={(() => { const s = sales.find((x) => x.id === confirmDeleteDebtSaleId); return s ? `${s.code} — ${s.notes || ''}` : undefined; })()}
        confirmLabel="Excluir"
        onConfirm={handleConfirmDeleteDebt}
        onCancel={() => setConfirmDeleteDebtSaleId(null)}
      />

      {/* Debt Modal — lançamento manual (venda pré-sistema) */}
      {debtModalCustomerId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-sm rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Wallet className="w-4 h-4 text-amber-500" />
                Adicionar dívida
              </h3>
              <button
                onClick={() => {
                  setDebtModalCustomerId(null);
                  setDebtAmount('');
                  setDebtReason('');
                }}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <p className="text-[11px] text-slate-500 dark:text-[#71717a]">
              Lança uma dívida de venda feita antes do sistema. Fica em Contas a
              Receber — quando o cliente pagar, o valor soma no faturamento e no caixa.
            </p>

            {/* Cliente (quando aberto pelo topo, escolhe aqui) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-[#a1a1aa] mb-1">
                Cliente
              </label>
              <select
                value={debtCustomerPick}
                onChange={(e) => setDebtCustomerPick(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="">Selecione...</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value="__no_customer__">🧾 Cliente Não Identificado</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-[#a1a1aa] mb-1">
                Valor da Dívida (R$)
              </label>
              <MoneyInput
                value={debtAmount}
                onChange={setDebtAmount}
                placeholder="0,00"
                autoFocus
                className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-[#a1a1aa] mb-1">
                Motivo do lançamento
              </label>
              <input
                type="text"
                value={debtReason}
                onChange={(e) => setDebtReason(e.target.value)}
                placeholder="Ex: produtos vendidos no fiado antes do sistema"
                maxLength={120}
                className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => {
                  setDebtModalCustomerId(null);
                  setDebtAmount('');
                  setDebtReason('');
                }}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-[#a1a1aa] hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleRegisterDebt}
                disabled={registeringDebt || !debtAmount || parseBrlToNumber(debtAmount) <= 0 || !debtReason.trim() || !debtCustomerPick}
                className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                {registeringDebt ? 'Lançando...' : 'Lançar Dívida'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
