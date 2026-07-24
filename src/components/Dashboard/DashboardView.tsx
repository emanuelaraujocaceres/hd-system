import React, { useState } from 'react';
import {
  TrendingUp,
  DollarSign,
  ShoppingCart,
  AlertTriangle,
  Package,
  Sparkles,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Users,
  CreditCard,
  Building2,
} from 'lucide-react';
import { Product, Sale, CashRegisterSession, FinancialAccount } from '../../types';

interface DashboardViewProps {
  sales: Sale[];
  products: Product[];
  caixaSession: CashRegisterSession;
  financialAccounts: FinancialAccount[];
  onNavigateTab: (tab: string) => void;
  onOpenCaixaModal: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  sales,
  products,
  caixaSession,
  financialAccounts,
  onNavigateTab,
  onOpenCaixaModal,
}) => {
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [loadingAi, setLoadingAi] = useState<boolean>(false);

  // Today's total sales calculations
  const todayStr = new Date().toISOString().slice(0, 10);
  const todaySales = sales.filter((s) => s.date.slice(0, 10) === todayStr);

  const todayRevenue = todaySales.reduce((acc, s) => acc + s.total, 0);
  const totalSalesCount = todaySales.length;
  const ticketMedio = totalSalesCount > 0 ? todayRevenue / totalSalesCount : 0;

  const lowStockCount = products.filter((p) => p.currentStock <= p.minStock).length;
  const pendingPayables = financialAccounts
    .filter((f) => f.type === 'payable' && f.status === 'pending')
    .reduce((acc, f) => acc + f.amount, 0);

  // Hourly Sales chart data simulation
  const hourlyData = [
    { hour: '08:00', vendas: 120 },
    { hour: '10:00', vendas: 350 },
    { hour: '12:00', vendas: 680 },
    { hour: '14:00', vendas: 420 },
    { hour: '16:00', vendas: 890 },
    { hour: '18:00', vendas: todayRevenue > 0 ? todayRevenue : 540 },
  ];

  // Payment method breakdown data for PieChart
  const paymentBreakdown = [
    { name: 'PIX', value: todaySales.reduce((acc, s) => acc + (s.payments.find((p) => p.method === 'pix')?.amount || 0), 0) || 350, color: '#0ea5e9' },
    { name: 'Dinheiro', value: todaySales.reduce((acc, s) => acc + (s.payments.find((p) => p.method === 'cash')?.amount || 0), 0) || 200, color: '#10b981' },
    { name: 'Cartão Crédito', value: todaySales.reduce((acc, s) => acc + (s.payments.find((p) => p.method === 'credit_card')?.amount || 0), 0) || 450, color: '#6366f1' },
    { name: 'Cartão Débito', value: todaySales.reduce((acc, s) => acc + (s.payments.find((p) => p.method === 'debit_card')?.amount || 0), 0) || 150, color: '#8b5cf6' },
  ];

  // Top products chart
  const topProducts = products.slice(0, 5).map((p) => ({
    name: p.name.slice(0, 15) + '...',
    estoque: p.currentStock,
    preco: p.salePrice,
  }));

  // Fetch AI Insights from server endpoint
  const handleFetchAiInsights = async () => {
    setLoadingAi(true);
    try {
      const res = await fetch('/api/ai/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          salesData: { todayRevenue, totalSalesCount, ticketMedio },
          stockAlerts: products.filter((p) => p.currentStock <= p.minStock),
          financialSummary: { pendingPayables },
          promptType: 'geral',
        }),
      });
      const data = await res.json();
      setAiInsight(data.insight);
    } catch (e) {
      console.error(e);
      setAiInsight('Ocorreu um erro ao consultar a IA. Verifique sua conexão.');
    } finally {
      setLoadingAi(false);
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner & Quick Action Buttons */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 rounded-2xl bg-[#18181b] border border-[#27272a] text-white shadow-xl">
        <div>
          <h2 className="font-serif-italic text-2xl font-light tracking-tight flex items-center gap-3">
            Visão Geral ERP
            <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 font-sans font-bold uppercase tracking-wider">
              ONLINE
            </span>
          </h2>
          <p className="text-xs text-[#a1a1aa] mt-1">
            Consolidado de faturamento, fluxo de vendas e indicadores em tempo real.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => onNavigateTab('pdv')}
            className="px-4 py-2 bg-white text-black text-xs font-bold rounded-full hover:bg-slate-200 transition-colors shadow-md flex items-center gap-2"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>ABRIR PDV</span>
          </button>
          <button
            onClick={() => onNavigateTab('inventory')}
            className="px-4 py-2 bg-[#27272a] text-white hover:bg-[#3f3f46] font-semibold text-xs rounded-full border border-[#3f3f46] transition-colors flex items-center gap-2"
          >
            <Package className="w-3.5 h-3.5" />
            <span>ESTOQUE</span>
          </button>
        </div>
      </div>

      {/* KPI METRIC CARDS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Card 1: Faturamento Hoje */}
        <div className="p-6 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] shadow-sm transition-all hover:border-slate-300 dark:hover:border-[#3f3f46]">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-[#71717a] font-bold">Vendas Hoje</p>
          <p className="text-3xl font-light mt-2 tracking-tighter text-slate-900 dark:text-white">
            R$ {todayRevenue.toFixed(2)}
          </p>
          <div className="mt-4 text-xs text-emerald-500 flex items-center gap-1 font-medium">
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>↑ 12%</span> <span className="text-slate-400 dark:text-[#71717a]">vs ontem</span>
          </div>
        </div>

        {/* Card 2: Qtd Vendas Hoje */}
        <div className="p-6 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] shadow-sm transition-all hover:border-slate-300 dark:hover:border-[#3f3f46]">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-[#71717a] font-bold">Transações</p>
          <p className="text-3xl font-light mt-2 tracking-tighter text-slate-900 dark:text-white">
            {totalSalesCount}
          </p>
          <div className="mt-4 text-xs text-emerald-500 flex items-center gap-1 font-medium">
            <span>↑ 5%</span> <span className="text-slate-400 dark:text-[#71717a]">ticket médio R$ {ticketMedio.toFixed(2)}</span>
          </div>
        </div>

        {/* Card 3: Alerta de Estoque Baixo */}
        <div className="p-6 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] shadow-sm transition-all hover:border-slate-300 dark:hover:border-[#3f3f46]">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-[#71717a] font-bold">Itens em Baixa</p>
          <p className="text-3xl font-light mt-2 tracking-tighter text-slate-900 dark:text-white">
            {lowStockCount < 10 ? `0${lowStockCount}` : lowStockCount}
          </p>
          <div className="mt-4 text-xs text-amber-500 flex items-center gap-1 font-medium">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>! Alerta</span> <span className="text-slate-400 dark:text-[#71717a]">Reposição necessária</span>
          </div>
        </div>

        {/* Card 4: Assinatura Pro / Status SaaS */}
        <div className="p-6 rounded-2xl bg-indigo-600 text-white shadow-md">
          <p className="text-[10px] uppercase tracking-wider opacity-80 font-bold">Assinatura Pro</p>
          <p className="text-3xl font-light mt-2 tracking-tighter font-serif-italic">Ativa</p>
          <div className="mt-4 text-xs opacity-80 font-medium">
            Próximo faturamento: 12 Out
          </div>
        </div>
      </div>

      {/* AI COPILOT INSIGHTS SECTION */}
      <div className="p-6 rounded-2xl bg-[#18181b] border border-[#27272a] text-white shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Relatório Inteligente IA</h3>
              <p className="text-xs text-[#71717a]">Diagnóstico em tempo real de margens e vendas</p>
            </div>
          </div>

          <button
            onClick={handleFetchAiInsights}
            disabled={loadingAi}
            className="px-4 py-2 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-colors flex items-center gap-2 shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingAi ? 'animate-spin' : ''}`} />
            <span>{loadingAi ? 'Analisando...' : 'Gerar Análise IA'}</span>
          </button>
        </div>

        {aiInsight ? (
          <div className="p-4 rounded-xl bg-[#09090b] border border-[#27272a] text-xs text-[#a1a1aa] leading-relaxed whitespace-pre-line">
            {aiInsight}
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-[#09090b]/50 border border-[#27272a] text-xs text-[#71717a] text-center">
            Acione o motor IA para gerar recomendações táticas e otimização de precificação.
          </div>
        )}
      </div>

      {/* CHARTS & TABLES GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Recent Activity Table */}
        <div className="lg:col-span-8 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-2xl overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-[#27272a] flex justify-between items-center">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Vendas Recentes</h3>
            <button
              onClick={() => onNavigateTab('pdv')}
              className="text-[10px] text-slate-500 dark:text-[#a1a1aa] hover:text-slate-900 dark:hover:text-white underline tracking-widest uppercase font-bold"
            >
              Ver Todas
            </button>
          </div>
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] text-slate-500 dark:text-[#71717a] uppercase border-b border-slate-200 dark:border-[#27272a] bg-slate-50 dark:bg-[#09090b]/50">
                <th className="px-6 py-3 font-bold">ID</th>
                <th className="px-6 py-3 font-bold">Cliente</th>
                <th className="px-6 py-3 font-bold">Status</th>
                <th className="px-6 py-3 text-right font-bold">Valor</th>
              </tr>
            </thead>
            <tbody className="text-xs divide-y divide-slate-100 dark:divide-[#27272a] text-slate-800 dark:text-slate-200">
              {sales.slice(0, 5).map((sale) => (
                <tr key={sale.id} className="hover:bg-slate-50 dark:hover:bg-[#27272a]/30 transition-colors">
                  <td className="px-6 py-4 font-mono text-slate-500 dark:text-[#a1a1aa]">#{sale.code || sale.id.slice(-4)}</td>
                  <td className="px-6 py-4 font-medium">{sale.customerName || 'Cliente Consumidor'}</td>
                  <td className="px-6 py-4">
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[9px] font-bold uppercase tracking-wider">
                      CONCLUÍDO
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-semibold">R$ {sale.total.toFixed(2)}</td>
                </tr>
              ))}
              {sales.length === 0 && (
                <>
                  <tr className="hover:bg-slate-50 dark:hover:bg-[#27272a]/30 transition-colors">
                    <td className="px-6 py-4 font-mono text-[#a1a1aa]">#9281</td>
                    <td className="px-6 py-4">Lucas Cavalcanti</td>
                    <td className="px-6 py-4"><span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-[9px] font-bold">CONCLUÍDO</span></td>
                    <td className="px-6 py-4 text-right font-semibold">R$ 450,00</td>
                  </tr>
                  <tr className="hover:bg-slate-50 dark:hover:bg-[#27272a]/30 transition-colors">
                    <td className="px-6 py-4 font-mono text-[#a1a1aa]">#9280</td>
                    <td className="px-6 py-4">Maria Julia Neves</td>
                    <td className="px-6 py-4"><span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[9px] font-bold">PENDENTE</span></td>
                    <td className="px-6 py-4 text-right font-semibold">R$ 1.290,00</td>
                  </tr>
                  <tr className="hover:bg-slate-50 dark:hover:bg-[#27272a]/30 transition-colors">
                    <td className="px-6 py-4 font-mono text-[#a1a1aa]">#9279</td>
                    <td className="px-6 py-4 font-medium">João Pedro Alves</td>
                    <td className="px-6 py-4"><span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-[9px] font-bold">CONCLUÍDO</span></td>
                    <td className="px-6 py-4 text-right font-semibold">R$ 89,90</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* Right Column Widgets */}
        <div className="lg:col-span-4 space-y-6">
          {/* Upcoming Payments Widget */}
          <div className="p-6 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-2xl shadow-sm">
            <h3 className="text-xs uppercase tracking-widest font-bold text-slate-500 dark:text-[#71717a] mb-4">Próximos Pagamentos</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600 dark:text-[#a1a1aa]">Aluguel Galpão A</span>
                <span className="font-medium text-rose-500">R$ 3.500</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600 dark:text-[#a1a1aa]">Fornecedor Distribuição</span>
                <span className="font-medium text-rose-500">R$ 1.120</span>
              </div>
              <div className="h-px bg-slate-200 dark:bg-[#27272a] my-2"></div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-900 dark:text-white font-bold">Total Pendente</span>
                <span className="font-bold text-slate-900 dark:text-white">R$ 4.620</span>
              </div>
            </div>
          </div>

          {/* Highlight Product Widget */}
          <div className="p-6 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-2xl shadow-sm">
            <h3 className="text-xs uppercase tracking-widest font-bold text-slate-500 dark:text-[#71717a] mb-4">Destaque do Mês</h3>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-xl">📦</div>
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white">{products[0]?.name || 'Cerveja Artesanal IPA'}</p>
                <p className="text-[10px] text-slate-500 dark:text-[#71717a]">412 unidades vendidas</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
