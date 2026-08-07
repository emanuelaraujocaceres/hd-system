import React, { useState, useEffect, useMemo } from 'react';
import {
  ChefHat,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Loader2,
  RefreshCw,
  Filter,
  Maximize2,
  Minimize2,
  Bell,
} from 'lucide-react';
import { Sale, Table, Product, UserProfile } from '../../types';
import { storageService } from '../../services/storageService';
import { posAudio } from '../../services/audioService';
import { useToast } from '../shared/Toast';

interface KDSViewProps {
  sales: Sale[];
  tables: Table[];
  products: Product[];
  user: UserProfile;
}

type KdsStatus = 'pending' | 'preparing' | 'ready' | 'delivered';

interface KdsOrder {
  sale: Sale;
  table: Table | null;
  items: {
    productId: string;
    productName: string;
    quantity: number;
    category: string;
    isFood: boolean;
    isDrink: boolean;
  }[];
  isFood: boolean;
  isDrink: boolean;
  timeElapsed: number; // minutes
}

const STATUS_CONFIG: Record<KdsStatus, { label: string; color: string; icon: React.ReactNode; next: KdsStatus | null }> = {
  pending: {
    label: 'Pendente',
    color: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-600 dark:text-yellow-400',
    icon: <Clock className="w-4 h-4" />,
    next: 'preparing',
  },
  preparing: {
    label: 'Preparando',
    color: 'bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400',
    icon: <Loader2 className="w-4 h-4" />,
    next: 'ready',
  },
  ready: {
    label: 'Pronto',
    color: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400',
    icon: <CheckCircle2 className="w-4 h-4" />,
    next: 'delivered',
  },
  delivered: {
    label: 'Entregue',
    color: 'bg-slate-500/10 border-slate-500/20 text-slate-600 dark:text-slate-400',
    icon: <CheckCircle2 className="w-4 h-4" />,
    next: null,
  },
};

// Categories considered food (go to kitchen) vs drinks (go to bar)
const FOOD_CATEGORIES = ['pratos', 'lanches', 'pizzas', 'saladas', 'carnes', 'massas', 'entradas', 'sobremesas'];
const DRINK_CATEGORIES = ['bebidas', 'cervezas', 'sucos', 'vinhos', 'coquetéis', 'cafés'];

export const KDSView: React.FC<KDSViewProps> = ({ sales, tables, products, user }) => {
  const { addToast } = useToast();
  const [now, setNow] = useState(Date.now());
  const [filterType, setFilterType] = useState<'all' | 'food' | 'drink'>('all');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showNotification, setShowNotification] = useState(false);

  // Update elapsed time every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  // Subscribe to realtime updates
  useEffect(() => {
    const unsub = storageService.subscribe(() => {
      setNow(Date.now());
    });
    return () => { unsub(); };
  }, []);

  // Build KDS orders from cardapio_digital sales
  const kdsOrders = useMemo<KdsOrder[]>(() => {
    const cardapioSales = sales.filter(
      (s) => s.orderSource === 'cardapio_digital' && s.kitchenStatus !== 'cancelled'
    );

    return cardapioSales.map((sale) => {
      const table = tables.find((t) => t.id === sale.tableId) || null;

      const items = (sale.items || []).map((item) => {
        const product = products.find((p) => p.id === item.productId);
        const category = (product?.category || 'Geral').toLowerCase();
        const isFood = FOOD_CATEGORIES.some((c) => category.includes(c));
        const isDrink = DRINK_CATEGORIES.some((c) => category.includes(c));
        return {
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          category: product?.category || 'Geral',
          isFood: isFood || (!isDrink && category !== 'geral'),
          isDrink,
        };
      });

      const isFood = items.some((i) => i.isFood);
      const isDrink = items.some((i) => i.isDrink);
      const timeElapsed = Math.floor((now - new Date(sale.date).getTime()) / 60000);

      return { sale, table, items, isFood, isDrink, timeElapsed };
    });
  }, [sales, tables, products, now]);

  // Filter by type
  const filteredOrders = useMemo(() => {
    if (filterType === 'all') return kdsOrders;
    if (filterType === 'food') return kdsOrders.filter((o) => o.isFood);
    return kdsOrders.filter((o) => o.isDrink);
  }, [kdsOrders, filterType]);

  // Group by status
  const ordersByStatus = useMemo(() => {
    const grouped: Record<KdsStatus, KdsOrder[]> = {
      pending: [],
      preparing: [],
      ready: [],
      delivered: [],
    };
    for (const order of filteredOrders) {
      const status = order.sale.kitchenStatus || 'pending';
      if (grouped[status]) grouped[status].push(order);
    }
    // Sort oldest first within each status
    for (const status of Object.keys(grouped) as KdsStatus[]) {
      grouped[status].sort((a, b) => new Date(a.sale.date).getTime() - new Date(b.sale.date).getTime());
    }
    return grouped;
  }, [filteredOrders]);

  const handleAdvanceStatus = (saleId: string, currentStatus: KdsStatus) => {
    const nextStatus = STATUS_CONFIG[currentStatus].next;
    if (!nextStatus) return;
    try {
      const sale = sales.find((s) => s.id === saleId);
      if (!sale) return;
      storageService.saveSale({
        ...sale,
        kitchenStatus: nextStatus,
        updatedAt: new Date().toISOString(),
      });
      posAudio.click();
      addToast('info', `Pedido → ${STATUS_CONFIG[nextStatus].label}`);
    } catch (err: any) {
      addToast('error', 'Erro ao atualizar status.');
    }
  };

  const handleCancelOrder = (saleId: string) => {
    try {
      const sale = sales.find((s) => s.id === saleId);
      if (!sale) return;
      storageService.saveSale({
        ...sale,
        kitchenStatus: 'cancelled',
        status: 'cancelled',
        updatedAt: new Date().toISOString(),
      });
      posAudio.click();
      addToast('warning', 'Pedido cancelado.');
    } catch (err: any) {
      addToast('error', 'Erro ao cancelar pedido.');
    }
  };

  const activeOrdersCount = filteredOrders.filter(
    (o) => o.sale.kitchenStatus !== 'delivered' && o.sale.kitchenStatus !== 'cancelled'
  ).length;

  const pendingCount = ordersByStatus.pending.length;
  const preparingCount = ordersByStatus.preparing.length;

  return (
    <div className={`h-full flex flex-col bg-slate-50 dark:bg-[#09090b] ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}>
      {/* Header */}
      <div className="px-4 sm:px-6 py-3 bg-white dark:bg-[#18181b] border-b border-slate-200 dark:border-[#27272a] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400">
            <ChefHat className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">KDS — Kitchen Display</h2>
            <p className="text-[10px] text-slate-500">
              {activeOrdersCount} pedido{activeOrdersCount !== 1 ? 's' : ''} ativo{activeOrdersCount !== 1 ? 's' : ''}
              {pendingCount > 0 && <span className="text-yellow-500 font-bold"> • {pendingCount} pendente{pendingCount !== 1 ? 's' : ''}</span>}
              {preparingCount > 0 && <span className="text-blue-500 font-bold"> • {preparingCount} preparando</span>}
            </p>
          </div>
        </div>

        {/* Filter + Fullscreen */}
        <div className="flex items-center gap-2">
          {/* Notification bell with pending count */}
          <div className="relative">
            <button
              onClick={() => setShowNotification((prev) => !prev)}
              className="p-2 rounded-xl bg-slate-100 dark:bg-[#27272a] text-slate-500 dark:text-slate-400 relative"
            >
              <Bell className="w-4 h-4" />
              {pendingCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {pendingCount}
                </span>
              )}
            </button>
            {showNotification && pendingCount > 0 && (
              <div className="absolute right-0 top-full mt-2 p-3 rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] shadow-lg z-10 w-48">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {pendingCount} pedido(s) pendente(s)
                </p>
              </div>
            )}
          </div>
          <div className="flex items-center bg-slate-100 dark:bg-[#27272a] rounded-full overflow-hidden">
            {([['all', 'Todos'], ['food', 'Cozinha'], ['drink', 'Bar']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilterType(key)}
                className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  filterType === key ? 'bg-orange-500 text-white' : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {/* Fullscreen toggle */}
          <button
            onClick={() => setIsFullscreen((prev) => !prev)}
            className="p-2 rounded-xl bg-slate-100 dark:bg-[#27272a] text-slate-500 dark:text-slate-400"
            title={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4 sm:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 h-full min-w-0">
          {(Object.keys(STATUS_CONFIG) as KdsStatus[]).map((status) => {
            const config = STATUS_CONFIG[status];
            const orders = ordersByStatus[status];
            const isPending = status === 'pending';

            return (
              <div key={status} className="flex flex-col rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] overflow-hidden h-full max-h-[calc(100vh-220px)]">
                {/* Column Header */}
                <div className={`px-4 py-3 border-b border-slate-200 dark:border-[#27272a] flex items-center justify-between shrink-0 ${config.color}`}>
                  <div className="flex items-center gap-2">
                    {config.icon}
                    <span className="text-xs font-bold">{config.label}</span>
                  </div>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-white/50 dark:bg-black/20">
                    {orders.length}
                  </span>
                </div>

                {/* Orders */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {orders.length === 0 ? (
                    <div className="text-center py-8 text-xs text-slate-400">
                      Nenhum pedido
                    </div>
                  ) : (
                    orders.map((order) => (
                      <div
                        key={order.sale.id}
                        className={`p-3 rounded-xl border ${
                          isPending && order.timeElapsed > 15
                            ? 'bg-rose-50 dark:bg-rose-500/5 border-rose-200 dark:border-rose-500/20'
                            : 'bg-slate-50 dark:bg-[#09090b] border-slate-200 dark:border-[#27272a]'
                        } space-y-2`}
                      >
                        {/* Table + Time */}
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            {order.table?.name || 'Sem Mesa'}
                          </span>
                          <span className={`text-[10px] font-bold ${
                            order.timeElapsed > 15 ? 'text-rose-500' : 'text-slate-400'
                          }`}>
                            {order.timeElapsed}min
                          </span>
                        </div>

                        {/* Items */}
                        <div className="space-y-1">
                          {order.items.map((item, idx) => (
                            <div key={idx} className="flex items-center justify-between text-[11px]">
                              <span className="text-slate-700 dark:text-slate-300">
                                {item.quantity}x {item.productName}
                              </span>
                              {item.isDrink && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600">
                                  BAR
                                </span>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 pt-1 border-t border-slate-200 dark:border-[#27272a]">
                          {config.next && (
                            <button
                              onClick={() => handleAdvanceStatus(order.sale.id, status)}
                              className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 ${config.color}`}
                            >
                              {config.next === 'preparing' && 'Preparar'}
                              {config.next === 'ready' && 'Pronto'}
                              {config.next === 'delivered' && 'Entregue'}
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          )}
                          {status !== 'delivered' && (
                            <button
                              onClick={() => handleCancelOrder(order.sale.id)}
                              className="px-2 py-1.5 rounded-lg text-rose-500 text-[10px] font-bold hover:bg-rose-500/10"
                              title="Cancelar"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
