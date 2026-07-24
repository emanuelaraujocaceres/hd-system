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
} from 'lucide-react';
import { FinancialAccount, Sale, Product } from '../../types';
import { storageService } from '../../services/storageService';
import { posAudio } from '../../services/audioService';
import { BoletoCameraScannerModal } from './BoletoCameraScannerModal';

interface FinanceViewProps {
  financialAccounts: FinancialAccount[];
  sales: Sale[];
  products: Product[];
}

export const FinanceView: React.FC<FinanceViewProps> = ({
  financialAccounts,
  sales,
  products,
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

  const handleSaveAccount = (e: React.FormEvent) => {
    e.preventDefault();
    const newAcc: FinancialAccount = {
      id: `fin-${Date.now()}`,
      title: formTitle,
      type: formType,
      category: formCategory,
      amount: formAmount,
      dueDate: formDueDate,
      status: 'pending',
      recipientOrPayer: formRecipient,
    };

    storageService.saveFinancialAccount(newAcc);
    posAudio.chime();
    setIsModalOpen(false);
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

  const filteredAccounts = financialAccounts.filter((a) => {
    if (filterType === 'payable') return a.type === 'payable';
    if (filterType === 'receivable') return a.type === 'receivable';
    return true;
  });

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
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
            onClick={() => setIsModalOpen(true)}
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

          <div className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-2xl shadow-sm overflow-hidden">
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
                    <tr key={acc.id} className="hover:bg-slate-50/80 dark:hover:bg-[#27272a]/30 transition-colors">
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
                      <td className="py-3 px-4 text-right">
                        {!isPaid && (
                          <button
                            onClick={() => handleMarkPaid(acc)}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] transition-colors"
                          >
                            Dar Baixa
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
            <div className="flex justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-[#09090b]">
              <span className="font-bold text-slate-900 dark:text-white">(+) RECEITA BRUTA DE VENDAS (PDV)</span>
              <span className="font-black text-emerald-600 dark:text-emerald-400">R$ {totalSalesRevenue.toFixed(2)}</span>
            </div>

            <div className="flex justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-[#09090b]/50 pl-6 text-rose-600 dark:text-rose-400">
              <span>(-) Impostos Fiscais Estimados (Simples Nacional)</span>
              <span>- R$ {estimatedTaxes.toFixed(2)}</span>
            </div>

            <div className="flex justify-between p-2.5 rounded-lg bg-indigo-500/10 font-bold text-indigo-900 dark:text-indigo-200">
              <span>(=) RECEITA LÍQUIDA DE VENDAS</span>
              <span>R$ {netSalesRevenue.toFixed(2)}</span>
            </div>

            <div className="flex justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-[#09090b]/50 pl-6 text-amber-600 dark:text-amber-400">
              <span>(-) Custo de Mercadorias Vendidas (CMV)</span>
              <span>- R$ {totalCMV.toFixed(2)}</span>
            </div>

            <div className="flex justify-between p-2.5 rounded-lg bg-emerald-500/10 font-bold text-emerald-900 dark:text-emerald-200">
              <span>(=) LUCRO BRUTO (Margem Bruta: {grossMargin.toFixed(1)}%)</span>
              <span>R$ {grossProfit.toFixed(2)}</span>
            </div>

            <div className="flex justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-[#09090b]/50 pl-6 text-rose-600 dark:text-rose-400">
              <span>(-) Despesas Operacionais / Instalações / Fornecedores</span>
              <span>- R$ {totalOperatingExpenses.toFixed(2)}</span>
            </div>

            <div className="flex justify-between p-3.5 rounded-xl bg-slate-900 dark:bg-[#09090b] text-white font-black text-sm tracking-wide border dark:border-[#27272a]">
              <span>(=) LUCRO LÍQUIDO OPERACIONAL DO EXERCÍCIO</span>
              <span className="text-emerald-400">R$ {netOperatingProfit.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {/* NEW ACCOUNT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Lançar Nova Conta</h3>

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
                  onClick={() => setIsModalOpen(false)}
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
