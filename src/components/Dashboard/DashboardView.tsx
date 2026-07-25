import React, { useState } from 'react';
import {
  ShoppingCart,
  AlertTriangle,
  Package,
  ArrowUpRight,
  Sparkles,
} from 'lucide-react';
import { Product, Sale } from '../../types';

interface DashboardViewProps {
  sales: Sale[];
  products: Product[];
  onNavigateTab: (tab: string) => void;
  onOpenCaixaModal: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  sales,
  products,
  onNavigateTab,
  onOpenCaixaModal,
}) => {

  // Today's total sales calculations
  const todayStr = new Date().toISOString().slice(0, 10);
  const todaySales = sales.filter((s) => s.date.slice(0, 10) === todayStr);

  const todayRevenue = todaySales.reduce((acc, s) => acc + s.total, 0);
  const totalSalesCount = todaySales.length;
  const ticketMedio = totalSalesCount > 0 ? todayRevenue / totalSalesCount : 0;

  const lowStockCount = products.filter((p) => p.currentStock <= p.minStock).length;

  // AI Analysis State
  const [aiInsight, setAiInsight] = useState<string>('');
  const [loadingAi, setLoadingAi] = useState(false);

  const handleFetchAiInsights = async () => {
    setLoadingAi(true);
    setAiInsight('');
    try {
      const lowStockProducts = products
        .filter((p) => p.currentStock <= p.minStock)
        .map((p) => ({ name: p.name, currentStock: p.currentStock, minStock: p.minStock }));

      const res = await fetch('/api/ai/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          salesData: { totalRevenue: todayRevenue, totalSales: totalSalesCount, ticketMedio },
          stockAlerts: lowStockProducts,
          financialSummary: { todayRevenue, totalSalesCount },
          promptType: 'geral',
        }),
      });

      const data = await res.json();
      setAiInsight(data.insight || 'Análise concluída sem retorno.');
    } catch (err) {
      setAiInsight('Erro ao conectar com o serviço de IA. Tente novamente.');
    } finally {
      setLoadingAi(false);
    }
  };

  return (
    <div className="p-3 sm:p-4 md:p-6 lg:p-8 space-y-4 sm:space-y-6 max-w-7xl mx-auto">
      {/* Top Banner & Quick Action Buttons */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 p-4 sm:p-6 rounded-2xl bg-[#18181b] border border-[#27272a] text-white shadow-xl">
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
        {/* Card 1: Faturamento Hoje */}
        <button onClick={() => onNavigateTab('finance')} className="p-4 sm:p-6 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] shadow-sm transition-all hover:border-slate-300 dark:hover:border-[#3f3f46] cursor-pointer hover:shadow-md hover:scale-[1.01] text-left w-full">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-[#71717a] font-bold">Vendas Hoje</p>
          <p className="text-2xl sm:text-3xl font-light mt-2 tracking-tighter text-slate-900 dark:text-white">
            R$ {todayRevenue.toFixed(2)}
          </p>
          <div className="mt-3 sm:mt-4 text-xs text-emerald-500 flex items-center gap-1 font-medium">
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>↑ 12%</span> <span className="text-slate-400 dark:text-[#71717a]">vs ontem</span>
          </div>
        </button>

        {/* Card 2: Qtd Vendas Hoje */}
        <button onClick={() => onNavigateTab('pdv')} className="p-4 sm:p-6 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] shadow-sm transition-all hover:border-slate-300 dark:hover:border-[#3f3f46] cursor-pointer hover:shadow-md hover:scale-[1.01] text-left w-full">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-[#71717a] font-bold">Transações</p>
          <p className="text-2xl sm:text-3xl font-light mt-2 tracking-tighter text-slate-900 dark:text-white">
            {totalSalesCount}
          </p>
          <div className="mt-3 sm:mt-4 text-xs text-emerald-500 flex items-center gap-1 font-medium">
            <span>↑ 5%</span> <span className="text-slate-400 dark:text-[#71717a]">ticket médio R$ {ticketMedio.toFixed(2)}</span>
          </div>
        </button>

        {/* Card 3: Alerta de Estoque Baixo */}
        <button onClick={() => onNavigateTab('inventory')} className="p-4 sm:p-6 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] shadow-sm transition-all hover:border-slate-300 dark:hover:border-[#3f3f46] cursor-pointer hover:shadow-md hover:scale-[1.01] text-left w-full">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-[#71717a] font-bold">Itens em Baixa</p>
          <p className="text-2xl sm:text-3xl font-light mt-2 tracking-tighter text-slate-900 dark:text-white">
            {lowStockCount < 10 ? `0${lowStockCount}` : lowStockCount}
          </p>
          <div className="mt-3 sm:mt-4 text-xs text-amber-500 flex items-center gap-1 font-medium">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>! Alerta</span> <span className="text-slate-400 dark:text-[#71717a]">Reposição necessária</span>
          </div>
        </button>

        {/* Card 4: Assinatura Pro / Status SaaS */}
        <button onClick={() => onNavigateTab('settings')} className="p-4 sm:p-6 rounded-2xl bg-indigo-600 text-white shadow-md cursor-pointer hover:shadow-lg hover:scale-[1.01] transition-all text-left w-full">
          <p className="text-[10px] uppercase tracking-wider opacity-80 font-bold">Assinatura Pro</p>
          <p className="text-2xl sm:text-3xl font-light mt-2 tracking-tighter font-serif-italic">Ativa</p>
          <div className="mt-3 sm:mt-4 text-xs opacity-80 font-medium">
            Próximo faturamento: 12 Out
          </div>
        </button>
      </div>

      {/* CHARTS & TABLES GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
        {/* Recent Activity Table */}
        <div className="lg:col-span-8 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-2xl overflow-hidden shadow-sm">
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-200 dark:border-[#27272a] flex justify-between items-center">
            <h3 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white">Vendas Recentes</h3>
            <button
              onClick={() => onNavigateTab('finance')}
              className="text-[10px] text-slate-500 dark:text-[#a1a1aa] hover:text-slate-900 dark:hover:text-white underline tracking-widest uppercase font-bold"
            >
              Ver Todas
            </button>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[400px]">
            <thead>
              <tr className="text-[10px] text-slate-500 dark:text-[#71717a] uppercase border-b border-slate-200 dark:border-[#27272a] bg-slate-50 dark:bg-[#09090b]/50">
                <th className="px-3 sm:px-6 py-3 font-bold">ID</th>
                <th className="px-3 sm:px-6 py-3 font-bold">Cliente</th>
                <th className="px-3 sm:px-6 py-3 font-bold hidden sm:table-cell">Status</th>
                <th className="px-3 sm:px-6 py-3 text-right font-bold">Valor</th>
              </tr>
            </thead>
            <tbody className="text-xs divide-y divide-slate-100 dark:divide-[#27272a] text-slate-800 dark:text-slate-200">
              {sales.slice(0, 5).map((sale) => (
                <tr key={sale.id} className="hover:bg-slate-50 dark:hover:bg-[#27272a]/30 transition-colors">
                  <td className="px-3 sm:px-6 py-3 sm:py-4 font-mono text-slate-500 dark:text-[#a1a1aa]">#{sale.code || sale.id.slice(-4)}</td>
                  <td className="px-3 sm:px-6 py-3 sm:py-4 font-medium">{sale.customerName || 'Cliente Consumidor'}</td>
                  <td className="px-3 sm:px-6 py-3 sm:py-4 hidden sm:table-cell">
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[9px] font-bold uppercase tracking-wider">
                      CONCLUÍDO
                    </span>
                  </td>
                  <td className="px-3 sm:px-6 py-3 sm:py-4 text-right font-semibold">R$ {sale.total.toFixed(2)}</td>
                </tr>
              ))}
              {sales.length === 0 && (
                <>
                  <tr className="hover:bg-slate-50 dark:hover:bg-[#27272a]/30 transition-colors">
                    <td className="px-3 sm:px-6 py-3 sm:py-4 font-mono text-[#a1a1aa]">#9281</td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4">Lucas Cavalcanti</td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 hidden sm:table-cell"><span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-[9px] font-bold">CONCLUÍDO</span></td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 text-right font-semibold">R$ 450,00</td>
                  </tr>
                  <tr className="hover:bg-slate-50 dark:hover:bg-[#27272a]/30 transition-colors">
                    <td className="px-3 sm:px-6 py-3 sm:py-4 font-mono text-[#a1a1aa]">#9280</td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4">Maria Julia Neves</td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 hidden sm:table-cell"><span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[9px] font-bold">PENDENTE</span></td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 text-right font-semibold">R$ 1.290,00</td>
                  </tr>
                  <tr className="hover:bg-slate-50 dark:hover:bg-[#27272a]/30 transition-colors">
                    <td className="px-3 sm:px-6 py-3 sm:py-4 font-mono text-[#a1a1aa]">#9279</td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 font-medium">João Pedro Alves</td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 hidden sm:table-cell"><span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-[9px] font-bold">CONCLUÍDO</span></td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 text-right font-semibold">R$ 89,90</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
          </div>
        </div>

        {/* Right Column Widgets */}
        <div className="lg:col-span-4 space-y-4 sm:space-y-6">
          {/* Upcoming Payments Widget */}
          <button onClick={() => onNavigateTab('finance')} className="p-4 sm:p-6 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-2xl shadow-sm cursor-pointer hover:shadow-md hover:border-slate-300 dark:hover:border-[#3f3f46] transition-all text-left w-full">
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
          </button>

          {/* Highlight Product Widget */}
          <button onClick={() => onNavigateTab('inventory')} className="p-4 sm:p-6 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-2xl shadow-sm cursor-pointer hover:shadow-md hover:border-slate-300 dark:hover:border-[#3f3f46] transition-all text-left w-full">
            <h3 className="text-xs uppercase tracking-widest font-bold text-slate-500 dark:text-[#71717a] mb-4">Destaque do Mês</h3>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-xl shrink-0">📦</div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{products[0]?.name || 'Cerveja Artesanal IPA'}</p>
                <p className="text-[10px] text-slate-500 dark:text-[#71717a]">412 unidades vendidas</p>
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* AI INTELLIGENT REPORT SECTION */}
      <div className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-2xl overflow-hidden shadow-sm">
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-200 dark:border-[#27272a] flex justify-between items-center">
          <h3 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-500" />
            Relatório Inteligente IA
          </h3>
        </div>
        <div className="p-4 sm:p-6">
          <p className="text-xs text-slate-500 dark:text-[#71717a] mb-4">
            Analise seu desempenho com inteligência artificial — vendas, estoque e oportunidades de lucro.
          </p>
          <button
            onClick={handleFetchAiInsights}
            disabled={loadingAi}
            className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs shadow-md transition-colors flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            <span>{loadingAi ? 'Analisando dados...' : 'Gerar Análise IA'}</span>
          </button>

          {aiInsight && (
            <div className="mt-4 p-4 rounded-xl bg-purple-50 dark:bg-purple-500/5 border border-purple-200 dark:border-purple-500/20 text-xs text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
              {aiInsight}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
