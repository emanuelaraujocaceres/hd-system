import React, { useMemo } from 'react';
import { UserProfile, Sale } from '../../types';
import { storageService } from '../../services/storageService';
import {
  Users,
  TrendingUp,
  ShoppingBag,
  Target,
  Medal,
  Star,
  BarChart3,
  Award,
} from 'lucide-react';

// ── Time period filter ─────────────────────────────────────────────────
type Period = 'day' | 'week' | 'biweek' | 'month' | 'bimonth' | 'quarter' | 'semester' | 'year';

const PERIOD_LABELS: Record<Period, string> = {
  day: 'Hoje',
  week: 'Esta Semana',
  biweek: 'Quinzena',
  month: 'Este Mês',
  bimonth: 'Bimestre',
  quarter: 'Trimestre',
  semester: 'Semestre',
  year: 'Este Ano',
};

/** Returns the start date of a given period relative to now. */
function periodStart(period: Period, now: Date): Date {
  const d = new Date(now);
  switch (period) {
    case 'day':
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    case 'week': {
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
      return new Date(d.getFullYear(), d.getMonth(), diff);
    }
    case 'biweek': {
      const dayOfMonth = d.getDate();
      const startDay = dayOfMonth <= 15 ? 1 : 16;
      return new Date(d.getFullYear(), d.getMonth(), startDay);
    }
    case 'month':
      return new Date(d.getFullYear(), d.getMonth(), 1);
    case 'bimonth': {
      const biIdx = Math.floor(d.getMonth() / 2) * 2;
      return new Date(d.getFullYear(), biIdx, 1);
    }
    case 'quarter': {
      const qIdx = Math.floor(d.getMonth() / 3) * 3;
      return new Date(d.getFullYear(), qIdx, 1);
    }
    case 'semester': {
      const sIdx = d.getMonth() < 6 ? 0 : 6;
      return new Date(d.getFullYear(), sIdx, 1);
    }
    case 'year':
      return new Date(d.getFullYear(), 0, 1);
  }
}

export interface CollaboratorStats {
  user: UserProfile;
  totalSales: number;
  totalRevenue: number;
  ticketMedio: number;
  topProduct: { name: string; count: number } | null;
}

interface Props {
  sales: Sale[];
}

export const CollaboratorPerformance: React.FC<Props> = ({ sales }) => {
  const [period, setPeriod] = React.useState<Period>('day');

  // ── Compute stats per collaborator ──────────────────────────────────
  const stats: CollaboratorStats[] = useMemo(() => {
    const now = new Date();
    const start = periodStart(period, now);

    const filteredSales = sales.filter((s) => {
      const d = new Date(s.date);
      if (isNaN(d.getTime())) return false;
      return d >= start && d <= now;
    });

    // Group by operatorName
    const groups = new Map<string, { user: UserProfile; sales: Sale[] }>();
    for (const s of filteredSales) {
      const key = s.operatorName || 'Sistema';
      if (!groups.has(key)) {
        // Find a matching UserProfile
        const profile = storageService
          .getUsers()
          .find(
            (u) =>
              u.name.toLowerCase() === key.toLowerCase() &&
              u.role === 'collaborator'
          );
        groups.set(key, {
          user: profile || { id: '', name: key, email: '', role: 'collaborator', organizationId: '', storeBranchId: '', permissions: {} as any, active: true },
          sales: [],
        });
      }
      groups.get(key)!.sales.push(s);
    }

    // Sort: admin first (aggregate), then by revenue desc
    const result: CollaboratorStats[] = [];
    const getSaleTotal = (s: Sale) =>
      (typeof s.total === 'number' && s.total >= 0)
        ? s.total
        : s.items?.reduce((sum, i) => sum + (i.total || 0), 0) || 0;

    // Aggregate total
    let totalRevenueAll = 0;
    let totalSalesAll = 0;

    for (const [, group] of groups) {
      const totalSales = group.sales.length;
      const totalRevenue = group.sales.reduce((acc, s) => acc + getSaleTotal(s), 0);
      const ticketMedio = totalSales > 0 ? totalRevenue / totalSales : 0;

      // Top product
      const productCount = new Map<string, number>();
      for (const s of group.sales) {
        for (const item of s.items || []) {
          productCount.set(item.productName, (productCount.get(item.productName) || 0) + item.quantity);
        }
      }
      let topProduct: { name: string; count: number } | null = null;
      for (const [name, count] of productCount) {
        if (!topProduct || count > topProduct.count) topProduct = { name, count };
      }

      totalRevenueAll += totalRevenue;
      totalSalesAll += totalSales;

      result.push({
        user: group.user,
        totalSales,
        totalRevenue,
        ticketMedio,
        topProduct,
      });
    }

    // Sort by revenue desc
    result.sort((a, b) => b.totalRevenue - a.totalRevenue);

    return result;
  }, [sales, period]);

  const totalRevenuePeriod = stats.reduce((acc, s) => acc + s.totalRevenue, 0);
  const totalSalesPeriod = stats.reduce((acc, s) => acc + s.totalSales, 0);

  return (
    <div className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-2xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-200 dark:border-[#27272a] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h3 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <Users className="w-4 h-4 text-indigo-500" />
          Desempenho dos Colaboradores
        </h3>

        {/* Time filter */}
        <div className="flex flex-wrap gap-1">
          {(['day', 'week', 'biweek', 'month', 'bimonth', 'quarter', 'semester', 'year'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                period === p
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-[#27272a] text-slate-500 dark:text-[#a1a1aa] hover:bg-slate-200 dark:hover:bg-[#3f3f46]'
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Summary row */}
      <div className="px-4 sm:px-6 py-3 bg-slate-50 dark:bg-[#09090b]/50 border-b border-slate-200 dark:border-[#27272a] flex items-center gap-6 text-xs">
        <div className="flex items-center gap-1.5">
          <BarChart3 className="w-3.5 h-3.5 text-indigo-500" />
          <span className="text-slate-500 dark:text-[#71717a]">Período:</span>
          <span className="font-bold text-slate-900 dark:text-white">{PERIOD_LABELS[period]}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <ShoppingBag className="w-3.5 h-3.5 text-emerald-500" />
          <span className="text-slate-500 dark:text-[#71717a]">Vendas:</span>
          <span className="font-bold text-slate-900 dark:text-white">{totalSalesPeriod}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
          <span className="text-slate-500 dark:text-[#71717a]">Receita:</span>
          <span className="font-bold text-slate-900 dark:text-white">R$ {totalRevenuePeriod.toFixed(2)}</span>
        </div>
      </div>

      {/* Collaborator cards */}
      <div className="p-4 sm:p-6">
        {stats.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400 dark:text-[#52525b]">
            Nenhuma venda encontrada no período selecionado.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {stats.map((s, idx) => {
              const isTopPerformer = idx === 0 && s.totalRevenue > 0;
              return (
                <div
                  key={s.user.id || s.user.name}
                  className={`relative p-4 rounded-xl border transition-all hover:shadow-md ${
                    isTopPerformer
                      ? 'bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-500/10 dark:to-amber-500/5 border-amber-200 dark:border-amber-500/30'
                      : 'bg-slate-50 dark:bg-[#09090b]/50 border-slate-200 dark:border-[#27272a]'
                  }`}
                >
                  {/* Rank badge */}
                  <div className={`absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold ${
                    idx === 0 ? 'bg-amber-400 text-amber-900' :
                    idx === 1 ? 'bg-slate-300 text-slate-700' :
                    idx === 2 ? 'bg-amber-700 text-amber-100' :
                    'bg-slate-200 dark:bg-[#27272a] text-slate-400 dark:text-[#71717a]'
                  }`}>
                    {idx + 1}
                  </div>

                  {/* Avatar / Name */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${
                      isTopPerformer
                        ? 'bg-amber-500 text-white'
                        : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                    }`}>
                      {s.user.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                        {s.user.name}
                        {isTopPerformer && <Award className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-[#71717a] truncate">{s.user.email}</p>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500 dark:text-[#71717a] flex items-center gap-1">
                        <ShoppingBag className="w-3 h-3" />
                        Vendas
                      </span>
                      <span className="font-bold text-slate-900 dark:text-white">{s.totalSales}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500 dark:text-[#71717a] flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" />
                        Receita
                      </span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        R$ {s.totalRevenue.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500 dark:text-[#71717a] flex items-center gap-1">
                        <Target className="w-3 h-3" />
                        Ticket Médio
                      </span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        R$ {s.ticketMedio.toFixed(2)}
                      </span>
                    </div>
                    {s.topProduct && (
                      <div className="pt-2 border-t border-slate-200 dark:border-[#27272a]">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-slate-500 dark:text-[#71717a] flex items-center gap-1">
                            <Star className="w-2.5 h-2.5" />
                            Top Produto
                          </span>
                          <span className="text-slate-900 dark:text-white font-medium text-right truncate ml-2 max-w-[140px]">
                            {s.topProduct.name} ({s.topProduct.count}x)
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
