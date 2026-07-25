import React, { useState } from 'react';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Plus,
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileSpreadsheet,
  X,
  Building2,
  CreditCard,
  Building,
  Camera,
  Trash2,
} from 'lucide-react';
import { FinancialAccount, Sale, Product, UserProfile } from '../../types';
import { storageService } from '../../services/storageService';
import { posAudio } from '../../services/audioService';
import { BoletoCameraScannerModal } from './BoletoCameraScannerModal';

interface FinanceViewProps {
  financialAccounts: FinancialAccount[];
  sales: Sale[];
  products: Product[];
  user: UserProfile;
  onNavigateTab: (tab: string) => void;
}

export const FinanceView: React.FC<FinanceViewProps> = ({
  financialAccounts,
  sales,
  products,
  user,
  onNavigateTab,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'contas' | 'dre'>('contas');
  const [filterType, setFilterType] = useState<'all' | 'payable' | 'receivable'>('all');

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBoletoModalOpen, setIsBoletoModalOpen] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formType, setFormType] = useState<'payable' | 'receivable'>('payable');
  const [formCategory, setFormCategory] = useState('Instalações');
  const [formAmount, setFormAmount] = useState<number>(0);
  const [formDueDate, setFormDueDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [formRecipient, setFormRecipient] = useState('');
  const [editingAccount, setEditingAccount] = useState<FinancialAccount | null>(null);
  const [expandedDreRow, setExpandedDreRow] = useState<string | null>(null);
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);

  const handleSaveAccount = (e: React.FormEvent) => {
    e.preventDefault();
    const newAcc: FinancialAccount = {
      id: editingAccount ? editingAccount.id : `fin-${Date.now()}`,
      title: formTitle,
      type: formType,
      category: formCategory,
      amount: formAmount,
      dueDate: formDueDate,
      status: editingAccount ? editingAccount.status : 'pending',
      paidDate: editingAccount?.paidDate,
      recipientOrPayer: formRecipient,
    };

    storageService.saveFinancialAccount(newAcc);
    posAudio.chime();
    setIsModalOpen(false);
    setEditingAccount(null);
  };

  const handleMarkPaid = (account: FinancialAccount) => {
    const updated: FinancialAccount = {
      ...account,
      status: 'paid',
      paidDate: new Date().toISOString().slice(0, 10),
    };
    storageService.saveFinancialAccount(updated);
    posAudio.chime();
  };

  const handleOpenEditAccount = (account: FinancialAccount) => {
    setEditingAccount(account);
    setFormTitle(account.title);
    setFormType(account.type);
    setFormCategory(account.category);
    setFormAmount(account.amount);
    setFormDueDate(account.dueDate);
    setFormRecipient(account.recipientOrPayer);
    setIsModalOpen(true);
  };

  const handleOpenNewAccount = () => {
    setEditingAccount(null);
    setFormTitle('');
    setFormType('payable');
    setFormCategory('Instalações');
    setFormAmount(0);
    setFormDueDate(new Date().toISOString().slice(0, 10));
    setFormRecipient('');
    setIsModalOpen(true);
  };

  const handleDeleteAccount = (id: string) => {
    if (confirm('Tem certeza que deseja excluir esta conta financeira?')) {
      storageService.deleteFinancialAccount(id);
      posAudio.chime();
    }
  };

  // Calculations for Financial Accounts
  const totalPayablePending = financialAccounts
    .filter((a) => a.type === 'payable' && a.status === 'pending')
    .reduce((acc, a) => acc + a.amount, 0);

  const totalReceivablePending = financialAccounts
    .filter((a) => a.type === 'receivable' && a.status === 'pending')
    .reduce((acc, a) => acc + a.amount, 0);

  // DRE CALCULATIONS
  const totalSalesRevenue = sales.reduce((acc, s) => acc + s.total, 0);
  const estimatedTaxes = totalSalesRevenue * 0.06; // 6% Simples Nacional
  const netSalesRevenue = totalSalesRevenue - estimatedTaxes;

  // Estimated CMV (Custo de Mercadorias Vendidas)
  const totalCMV = sales.reduce((acc, s) => {
    const itemsCmv = s.items.reduce((sum, item) => {
      const prod = products.find((p) => p.id === item.productId);
      return sum + (prod ? prod.costPrice * item.quantity : item.unitPrice * 0.6 * item.quantity);
    }, 0);
    return acc + itemsCmv;
  }, 0);

  const grossProfit = netSalesRevenue - totalCMV;
  const grossMargin = totalSalesRevenue > 0 ? (grossProfit / totalSalesRevenue) * 100 : 0;

  const totalOperatingExpenses = financialAccounts
    .filter((a) => a.type === 'payable')
    .reduce((acc, a) => acc + a.amount, 0);

  const netOperatingProfit = grossProfit - totalOperatingExpenses;

  const paymentMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      cash: 'Dinheiro',
      pix: 'PIX',
      credit_card: 'Cartão de Crédito',
      debit_card: 'Cartão de Débito',
      credit_account: 'Conta / Prazo',
    };
    return labels[method] || method;
  };

  const filteredAccounts = financialAccounts.filter((a) => {
    if (filterType === 'payable') return a.type === 'payable';
    if (filterType === 'receivable') return a.type === 'receivable';
    return true;
  });

  return (
    <div className="p-3 sm:p-4 md:p-6 max-w-7xl mx-auto space-y-4 sm:space-y-6">
      {/* Top Header & Sub-Tab Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            Módulo Financeiro & DRE Gerencial
          </h2>
          <p className="text-xs text-slate-500">
            Controle de fluxo de caixa, contas a pagar/receber e balanço DRE
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-slate-200 dark:bg-slate-800 p-1 rounded-xl text-xs font-bold">
            <button
              onClick={() => setActiveSubTab('contas')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeSubTab === 'contas'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Contas Pagar / Receber
            </button>
            <button
              onClick={() => setActiveSubTab('dre')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeSubTab === 'dre'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              DRE Gerencial
            </button>
          </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsBoletoModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-emerald-600/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-bold text-xs hover:bg-emerald-600/20 transition-all flex items-center gap-1.5 shadow-sm"
            title="Escanear Boleto Bancário via Câmera"
          >
            <Camera className="w-4 h-4" />
            <span>Ler Boleto Câmera</span>
          </button>

          <button
            onClick={handleOpenNewAccount}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Lançar Conta</span>
          </button>
        </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] shadow-sm">
          <span className="text-xs font-semibold text-slate-500 dark:text-[#71717a]">Contas a Receber (Pendente)</span>
          <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
            R$ {totalReceivablePending.toFixed(2)}
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] shadow-sm">
          <span className="text-xs font-semibold text-slate-500 dark:text-[#71717a]">Contas a Pagar (Pendente)</span>
          <p className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">
            R$ {totalPayablePending.toFixed(2)}
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] shadow-sm">
          <span className="text-xs font-semibold text-slate-500 dark:text-[#71717a]">Lucro Operacional Estimado</span>
          <p className={`text-2xl font-black mt-1 ${netOperatingProfit >= 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-rose-600'}`}>
            R$ {netOperatingProfit.toFixed(2)}
          </p>
        </div>
      </div>

      {/* SUB-TAB 1: CONTAS A PAGAR / RECEBER */}
      {activeSubTab === 'contas' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${
                filterType === 'all'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  : 'bg-white dark:bg-[#18181b] border-slate-200 dark:border-[#27272a] text-slate-600 dark:text-[#a1a1aa]'
              }`}
            >
              Todas
            </button>
            <button
              onClick={() => setFilterType('payable')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${
                filterType === 'payable'
                  ? 'bg-rose-600 text-white border-rose-600'
                  : 'bg-white dark:bg-[#18181b] border-slate-200 dark:border-[#27272a] text-slate-600 dark:text-[#a1a1aa]'
              }`}
            >
              Contas a Pagar
            </button>
            <button
              onClick={() => setFilterType('receivable')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${
                filterType === 'receivable'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white dark:bg-[#18181b] border-slate-200 dark:border-[#27272a] text-slate-600 dark:text-[#a1a1aa]'
              }`}
            >
              Contas a Receber
            </button>
          </div>

          {/* Desktop accounts table */}
          <div className="hidden md:block bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-2xl shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-[#09090b]/80 border-b border-slate-200 dark:border-[#27272a] text-slate-500 dark:text-[#71717a] font-bold uppercase tracking-wider">
                  <th className="py-3.5 px-4">Título / Lançamento</th>
                  <th className="py-3.5 px-4">Tipo</th>
                  <th className="py-3.5 px-4">Categoria</th>
                  <th className="py-3.5 px-4">Fornecedor / Favorecido</th>
                  <th className="py-3.5 px-4">Vencimento</th>
                  <th className="py-3.5 px-4">Valor (R$)</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#27272a]">
                {filteredAccounts.map((acc) => {
                  const isPayable = acc.type === 'payable';
                  const isPaid = acc.status === 'paid';

                  return (
                    <tr
                      key={acc.id}
                      onClick={() => handleOpenEditAccount(acc)}
                      className="hover:bg-slate-50/80 dark:hover:bg-[#27272a]/30 transition-colors cursor-pointer"
                    >
                      <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">{acc.title}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                            isPayable
                              ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                              : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {isPayable ? 'PAGAR' : 'RECEBER'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-500 dark:text-[#71717a]">{acc.category}</td>
                      <td className="py-3 px-4 text-slate-700 dark:text-[#a1a1aa]">{acc.recipientOrPayer}</td>
                      <td className="py-3 px-4 text-slate-600 dark:text-[#a1a1aa] font-medium">{acc.dueDate}</td>
                      <td className={`py-3 px-4 font-extrabold ${isPayable ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        R$ {acc.amount.toFixed(2)}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-1 rounded-lg font-bold text-[10px] ${
                            isPaid
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {isPaid ? 'Pago / Baixado' : 'Pendente'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          {!isPaid && (
                            <button
                              onClick={() => handleMarkPaid(acc)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] transition-colors"
                            >
                              Dar Baixa
                            </button>
                          )}
                          {user.role === 'admin' && (
                            <button
                              onClick={() => handleDeleteAccount(acc.id)}
                              className="p-1.5 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 transition-colors"
                              title="Excluir Conta"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile accounts cards */}
          <div className="block md:hidden space-y-3">
            {filteredAccounts.map((acc) => {
              const isPayable = acc.type === 'payable';
              const isPaid = acc.status === 'paid';

              return (
                <div
                  key={acc.id}
                  onClick={() => handleOpenEditAccount(acc)}
                  className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-2xl shadow-sm p-4 space-y-2.5 cursor-pointer active:scale-[0.98] transition-transform"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white leading-tight">{acc.title}</h4>
                    <span
                      className={`shrink-0 px-2 py-0.5 rounded font-bold text-[10px] ${
                        isPayable
                          ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                          : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {isPayable ? 'PAGAR' : 'RECEBER'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <div>
                      <span className="text-slate-400 dark:text-[#52525b]">Categoria</span>
                      <p className="font-medium text-slate-700 dark:text-[#a1a1aa]">{acc.category}</p>
                    </div>
                    <div>
                      <span className="text-slate-400 dark:text-[#52525b]">Fornecedor</span>
                      <p className="font-medium text-slate-700 dark:text-[#a1a1aa] truncate">{acc.recipientOrPayer}</p>
                    </div>
                    <div>
                      <span className="text-slate-400 dark:text-[#52525b]">Vencimento</span>
                      <p className="font-medium text-slate-700 dark:text-[#a1a1aa]">{acc.dueDate}</p>
                    </div>
                    <div>
                      <span className="text-slate-400 dark:text-[#52525b]">Status</span>
                      <p>
                        <span
                          className={`px-2 py-0.5 rounded-lg font-bold text-[10px] ${
                            isPaid
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {isPaid ? 'Pago / Baixado' : 'Pendente'}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-[#27272a]">
                    <span className={`text-lg font-extrabold ${isPayable ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      R$ {acc.amount.toFixed(2)}
                    </span>
                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      {!isPaid && (
                        <button
                          onClick={() => handleMarkPaid(acc)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] transition-colors"
                        >
                          Dar Baixa
                        </button>
                      )}
                      {user.role === 'admin' && (
                        <button
                          onClick={() => handleDeleteAccount(acc.id)}
                          className="p-1.5 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 transition-colors"
                          title="Excluir Conta"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredAccounts.length === 0 && (
              <div className="py-8 text-center text-slate-400 dark:text-[#52525b] text-xs">
                Nenhuma conta financeira registrada
              </div>
            )}
          </div>

          {/* Vendas Realizadas */}
          <div className="mt-6">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              Vendas Realizadas
            </h3>

            {/* Desktop sales table */}
            <div className="hidden md:block bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-2xl shadow-sm overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-[#09090b]/80 border-b border-slate-200 dark:border-[#27272a] text-slate-500 dark:text-[#71717a] font-bold uppercase tracking-wider">
                    <th className="py-3.5 px-4">Código</th>
                    <th className="py-3.5 px-4">Data</th>
                    <th className="py-3.5 px-4">Cliente</th>
                    <th className="py-3.5 px-4">Valor (R$)</th>
                    <th className="py-3.5 px-4">Status</th>
                    {user.role === 'admin' && <th className="py-3.5 px-4 text-right">Ação</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#27272a]">
                  {sales.map((sale) => (
                    <tr key={sale.id} className="hover:bg-slate-50/80 dark:hover:bg-[#27272a]/30 transition-colors">
                      <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">{sale.code}</td>
                      <td className="py-3 px-4 text-slate-600 dark:text-[#a1a1aa] font-medium">
                        {new Date(sale.date).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="py-3 px-4 text-slate-700 dark:text-[#a1a1aa]">{sale.customerName || 'Consumidor Final'}</td>
                      <td className="py-3 px-4 font-extrabold text-emerald-600 dark:text-emerald-400">
                        R$ {sale.total.toFixed(2)}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-1 rounded-lg font-bold text-[10px] ${
                            sale.status === 'completed'
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : sale.status === 'cancelled'
                                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {sale.status === 'completed' ? 'Concluída' : sale.status === 'cancelled' ? 'Cancelada' : 'Pendente'}
                        </span>
                      </td>
                      {user.role === 'admin' && (
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => {
                              if (confirm(`Tem certeza que deseja excluir a venda ${sale.code}?`)) {
                                storageService.deleteSale(sale.id);
                              }
                            }}
                            className="p-1.5 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 transition-colors"
                            title="Excluir venda"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {sales.length === 0 && (
                    <tr>
                      <td colSpan={user.role === 'admin' ? 6 : 5} className="py-8 text-center text-slate-400 dark:text-[#52525b] text-xs">
                        Nenhuma venda registrada
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile sales cards */}
            <div className="block md:hidden space-y-3">
              {sales.map((sale) => {
                const isExpanded = selectedSaleId === sale.id;
                return (
                  <div key={sale.id} className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-2xl shadow-sm overflow-hidden">
                    <div
                      onClick={() => setSelectedSaleId(isExpanded ? null : sale.id)}
                      className="p-4 space-y-2.5 cursor-pointer active:scale-[0.98] transition-transform"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-bold text-sm text-slate-900 dark:text-white">{sale.code}</h4>
                          <p className="text-xs text-slate-500 dark:text-[#71717a] mt-0.5">
                            {new Date(sale.date).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 px-2 py-0.5 rounded-lg font-bold text-[10px] ${
                            sale.status === 'completed'
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : sale.status === 'cancelled'
                                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {sale.status === 'completed' ? 'Concluída' : sale.status === 'cancelled' ? 'Cancelada' : 'Pendente'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500 dark:text-[#71717a]">
                          {sale.customerName || 'Consumidor Final'}
                        </span>
                        <span className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400">
                          R$ {sale.total.toFixed(2)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-[#27272a]">
                        <span className="text-[10px] text-slate-400 dark:text-[#52525b] font-medium uppercase tracking-wider">
                          {isExpanded ? 'Toque para fechar' : 'Toque para ver detalhes'}
                        </span>
                        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          {user.role === 'admin' && (
                            <button
                              onClick={() => {
                                if (confirm(`Tem certeza que deseja excluir a venda ${sale.code}?`)) {
                                  storageService.deleteSale(sale.id);
                                }
                              }}
                              className="p-1.5 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 transition-colors"
                              title="Excluir venda"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Expanded detail section */}
                    {isExpanded && (
                      <div className="border-t border-slate-100 dark:border-[#27272a] bg-slate-50/50 dark:bg-[#09090b]/40 px-4 py-3 space-y-3">
                        {/* Items */}
                        <div>
                          <h5 className="text-[10px] font-bold text-slate-400 dark:text-[#52525b] uppercase tracking-wider mb-1.5">Itens da Venda</h5>
                          <div className="space-y-1.5">
                            {sale.items.map((item, idx) => (
                              <div key={idx} className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="w-5 h-5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 flex items-center justify-center text-[10px] font-bold shrink-0">
                                    {item.quantity}x
                                  </span>
                                  <span className="text-slate-700 dark:text-[#a1a1aa] truncate">{item.productName}</span>
                                </div>
                                <span className="font-bold text-slate-900 dark:text-white shrink-0 ml-2">
                                  R$ {item.total.toFixed(2)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Payment methods */}
                        {sale.payments && sale.payments.length > 0 && (
                          <div>
                            <h5 className="text-[10px] font-bold text-slate-400 dark:text-[#52525b] uppercase tracking-wider mb-1.5">Formas de Pagamento</h5>
                            <div className="space-y-1">
                              {sale.payments.map((payment, idx) => (
                                <div key={idx} className="flex items-center justify-between text-xs">
                                  <span className="text-slate-600 dark:text-[#a1a1aa] flex items-center gap-1">
                                    <CreditCard className="w-3 h-3" />
                                    {paymentMethodLabel(payment.method)}
                                  </span>
                                  <span className="font-bold text-slate-900 dark:text-white">
                                    R$ {payment.amount.toFixed(2)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Totals summary */}
                        <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-200 dark:border-[#27272a]">
                          <span className="text-slate-500 dark:text-[#71717a]">Subtotal</span>
                          <span className="text-slate-700 dark:text-[#a1a1aa]">R$ {sale.subtotal.toFixed(2)}</span>
                        </div>
                        {sale.discount > 0 && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-500 dark:text-[#71717a]">Desconto</span>
                            <span className="text-rose-600 dark:text-rose-400">- R$ {sale.discount.toFixed(2)}</span>
                          </div>
                        )}

                        {/* Operator */}
                        <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-200 dark:border-[#27272a]">
                          <span className="text-slate-500 dark:text-[#71717a]">Operador(a)</span>
                          <span className="font-medium text-slate-700 dark:text-[#a1a1aa]">{sale.operatorName}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {sales.length === 0 && (
                <div className="py-8 text-center text-slate-400 dark:text-[#52525b] text-xs">
                  Nenhuma venda registrada
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: DRE GERENCIAL */}
      {activeSubTab === 'dre' && (
        <div className="p-6 rounded-3xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] shadow-md max-w-3xl mx-auto space-y-4">
          <div className="border-b border-slate-200 dark:border-[#27272a] pb-3 flex items-center justify-between">
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                DRE - Demonstrativo do Resultado do Exercício
              </h3>
              <p className="text-xs text-slate-500 dark:text-[#71717a]">Apuração de receitas, custos e margem líquida gerencial</p>
            </div>
            <FileSpreadsheet className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
          </div>

          <div className="space-y-2 text-xs font-medium text-slate-700 dark:text-[#a1a1aa]">
            {/* (+) RECEITA BRUTA */}
            <div
              className="rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => onNavigateTab('sales-history')}
            >
              <div className="flex justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-[#09090b]">
                <span className="font-bold text-slate-900 dark:text-white">(+) RECEITA BRUTA DE VENDAS (PDV)</span>
                <span className="font-black text-emerald-600 dark:text-emerald-400">R$ {totalSalesRevenue.toFixed(2)}</span>
              </div>
            </div>

            {/* (-) Impostos */}
            <div
              className="rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => setExpandedDreRow(expandedDreRow === 'taxes' ? null : 'taxes')}
            >
              <div className="flex justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-[#09090b]/50 pl-6 text-rose-600 dark:text-rose-400">
                <span>(-) Impostos Fiscais Estimados (Simples Nacional)</span>
                <span>- R$ {estimatedTaxes.toFixed(2)}</span>
              </div>
              {expandedDreRow === 'taxes' && (
                <div className="mx-6 mt-1 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/40 text-[11px] text-slate-700 dark:text-slate-300 space-y-1">
                  <p className="font-bold text-rose-600 dark:text-rose-400">Como é calculado?</p>
                  <p>Alíquota estimada do <strong>Simples Nacional</strong>: <strong>6%</strong> sobre a Receita Bruta.</p>
                  <p>Cálculo: R$ {totalSalesRevenue.toFixed(2)} × 6% = <strong>R$ {estimatedTaxes.toFixed(2)}</strong></p>
                </div>
              )}
            </div>

            {/* (=) RECEITA LÍQUIDA */}
            <div
              className="rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => setExpandedDreRow(expandedDreRow === 'netRevenue' ? null : 'netRevenue')}
            >
              <div className="flex justify-between p-2.5 rounded-lg bg-indigo-500/10 font-bold text-indigo-900 dark:text-indigo-200">
                <span>(=) RECEITA LÍQUIDA DE VENDAS</span>
                <span>R$ {netSalesRevenue.toFixed(2)}</span>
              </div>
              {expandedDreRow === 'netRevenue' && (
                <div className="mx-6 mt-1 p-3 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/40 text-[11px] text-slate-700 dark:text-slate-300 space-y-1">
                  <p className="font-bold text-indigo-600 dark:text-indigo-400">Como é calculado?</p>
                  <p>Receita Bruta - Impostos = Receita Líquida</p>
                  <p>R$ {totalSalesRevenue.toFixed(2)} - R$ {estimatedTaxes.toFixed(2)} = <strong>R$ {netSalesRevenue.toFixed(2)}</strong></p>
                </div>
              )}
            </div>

            {/* (-) CMV */}
            <div
              className="rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => setExpandedDreRow(expandedDreRow === 'cmv' ? null : 'cmv')}
            >
              <div className="flex justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-[#09090b]/50 pl-6 text-amber-600 dark:text-amber-400">
                <span>(-) Custo de Mercadorias Vendidas (CMV)</span>
                <span>- R$ {totalCMV.toFixed(2)}</span>
              </div>
              {expandedDreRow === 'cmv' && (
                <div className="mx-6 mt-1 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 text-[11px] text-slate-700 dark:text-slate-300 space-y-1">
                  <p className="font-bold text-amber-600 dark:text-amber-400">Como é calculado?</p>
                  <p>Soma do <strong>custo de aquisição</strong> de cada produto vendido.</p>
                  <p>Para cada venda: (Custo Unitário × Quantidade) dos itens. Se o custo não estiver cadastrado, estima-se 60% do preço de venda.</p>
                  <p>Total CMV: <strong>R$ {totalCMV.toFixed(2)}</strong></p>
                </div>
              )}
            </div>

            {/* (=) LUCRO BRUTO */}
            <div
              className="rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => setExpandedDreRow(expandedDreRow === 'grossProfit' ? null : 'grossProfit')}
            >
              <div className="flex justify-between p-2.5 rounded-lg bg-emerald-500/10 font-bold text-emerald-900 dark:text-emerald-200">
                <span>(=) LUCRO BRUTO (Margem Bruta: {grossMargin.toFixed(1)}%)</span>
                <span>R$ {grossProfit.toFixed(2)}</span>
              </div>
              {expandedDreRow === 'grossProfit' && (
                <div className="mx-6 mt-1 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 text-[11px] text-slate-700 dark:text-slate-300 space-y-1">
                  <p className="font-bold text-emerald-600 dark:text-emerald-400">Como é calculado?</p>
                  <p>Receita Líquida - CMV = Lucro Bruto</p>
                  <p>R$ {netSalesRevenue.toFixed(2)} - R$ {totalCMV.toFixed(2)} = <strong>R$ {grossProfit.toFixed(2)}</strong></p>
                  <p>Margem Bruta: ({grossProfit.toFixed(2)} / {totalSalesRevenue.toFixed(2)}) × 100 = <strong>{grossMargin.toFixed(1)}%</strong></p>
                </div>
              )}
            </div>

            {/* (-) Despesas Operacionais */}
            <div
              className="rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => onNavigateTab('finance')}
            >
              <div className="flex justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-[#09090b]/50 pl-6 text-rose-600 dark:text-rose-400">
                <span>(-) Despesas Operacionais / Instalações / Fornecedores</span>
                <span>- R$ {totalOperatingExpenses.toFixed(2)}</span>
              </div>
            </div>

            {/* (=) LUCRO LÍQUIDO */}
            <div
              className="rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => setExpandedDreRow(expandedDreRow === 'netProfit' ? null : 'netProfit')}
            >
              <div className="flex justify-between p-3.5 rounded-xl bg-slate-900 dark:bg-[#09090b] text-white font-black text-sm tracking-wide border dark:border-[#27272a]">
                <span>(=) LUCRO LÍQUIDO OPERACIONAL DO EXERCÍCIO</span>
                <span className="text-emerald-400">R$ {netOperatingProfit.toFixed(2)}</span>
              </div>
              {expandedDreRow === 'netProfit' && (
                <div className="mx-6 mt-1 p-3 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-700 dark:text-slate-300 space-y-1">
                  <p className="font-bold text-slate-900 dark:text-white">Como é calculado?</p>
                  <p>Lucro Bruto - Despesas Operacionais = Lucro Líquido</p>
                  <p>R$ {grossProfit.toFixed(2)} - R$ {totalOperatingExpenses.toFixed(2)} = <strong className={netOperatingProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'}>R$ {netOperatingProfit.toFixed(2)}</strong></p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* NEW ACCOUNT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {editingAccount ? 'Editar Conta' : 'Lançar Nova Conta'}
            </h3>

            <form onSubmit={handleSaveAccount} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold mb-1">Título do Lançamento</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Fatura Fornecedor Ambev"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold mb-1">Tipo de Conta</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
                  >
                    <option value="payable">A Pagar (Despesa)</option>
                    <option value="receivable">A Receber (Receita)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold mb-1">Valor (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formAmount}
                    onChange={(e) => setFormAmount(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold mb-1">Data de Vencimento</label>
                <input
                  type="date"
                  required
                  value={formDueDate}
                  onChange={(e) => setFormDueDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
                />
              </div>

              <div>
                <label className="block font-bold mb-1">Fornecedor / Favorecido</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Ambev S.A."
                  value={formRecipient}
                  onChange={(e) => setFormRecipient(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setIsModalOpen(false); setEditingAccount(null); }}
                  className="px-4 py-2 rounded-xl border font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 text-white font-bold"
                >
                  Salvar Conta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* BOLETO CAMERA SCANNER MODAL */}
      <BoletoCameraScannerModal
        isOpen={isBoletoModalOpen}
        onClose={() => setIsBoletoModalOpen(false)}
        onAccountAdded={() => {
          // Trigger reactive updates
        }}
      />
    </div>
  );
};
