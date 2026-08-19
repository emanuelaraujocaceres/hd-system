import React, { useState, useMemo, useEffect } from 'react';
import {
  ClipboardList,
  Users,
  CheckCircle2,
  Clock,
  ChefHat,
  Banknote,
  CreditCard,
  QrCode,
  Search,
  ChevronDown,
  ChevronUp,
  X,
  Trash2,
  Loader2,
  UserPlus,
} from 'lucide-react';
import { Sale, Table, CustomerSession, Customer, UserProfile, Product } from '../../types';
import { storageService } from '../../services/storageService';
import { posAudio } from '../../services/audioService';
import { printComandaReceipt } from '../../services/printService';
import { findCaixaPrinter } from '../../services/printerRouting';
import { useToast } from '../shared/Toast';
import { MoneyInput, parseBrlToNumber } from '../shared/MoneyInput';
import { friendlyErrorMessage } from '../../lib/friendlyError';

interface ComandaViewProps {
  sales: Sale[];
  customers: Customer[];
  tables: Table[];
  customerSessions: CustomerSession[];
  products: Product[];
  user: UserProfile;
}

interface ComandaGroup {
  table: Table;
  session: CustomerSession | null;
  sales: Sale[];
  total: number;
  itemCount: number;
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  preparing: 'Preparando',
  ready: 'Pronto',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  preparing: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  ready: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  delivered: 'bg-slate-500/10 text-slate-600 border-slate-500/20',
  cancelled: 'bg-rose-500/10 text-rose-600 border-rose-500/20',
};

export const ComandaView: React.FC<ComandaViewProps> = ({
  sales,
  customers,
  tables,
  customerSessions,
  products,
  user,
}) => {
  const isAdmin = user.role === 'admin' || !!user.superadmin;
  const { addToast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedTableId, setExpandedTableId] = useState<string | null>(null);
  const [closeModalTable, setCloseModalTable] = useState<Table | null>(null);
  const [closePaymentMethod, setClosePaymentMethod] = useState<Sale['payments'][0]['method']>('pix');
  const [closing, setClosing] = useState(false);

  // Subscribe to realtime updates
  useEffect(() => {
    const unsub = storageService.subscribe(() => {
      // Force re-render on any storage change
      setSearchTerm((prev) => prev);
    });
    return () => { unsub(); };
  }, []);

  // Build comanda groups: group sales by table
  const comandaGroups = useMemo<ComandaGroup[]>(() => {
    const tableSaleMap = new Map<string, Sale[]>();

    // Filter sales that are from digital menu (linked to a table)
    const cardapioSales = sales.filter((s) => s.orderSource === 'cardapio_digital' || s.tableId);

    for (const sale of cardapioSales) {
      const tableId = sale.tableId || '__no_table__';
      if (!tableSaleMap.has(tableId)) tableSaleMap.set(tableId, []);
      tableSaleMap.get(tableId)!.push(sale);
    }

    // Also include tables with active sessions even if no sales yet
    for (const session of customerSessions) {
      if (session.status === 'active' && !tableSaleMap.has(session.tableId)) {
        tableSaleMap.set(session.tableId, []);
      }
    }

    const groups: ComandaGroup[] = [];
    tableSaleMap.forEach((tableSales, tableId) => {
      const table = tables.find((t) => t.id === tableId);
      if (!table && tableId !== '__no_table__') return;

      const displayTable: Table = table || {
        id: '__no_table__',
        name: 'Sem Mesa',
        qrToken: '',
        status: 'active',
        storeBranchId: user.storeBranchId,
        organizationId: user.organizationId,
        createdAt: '',
        updatedAt: '',
      };

      const session = customerSessions.find(
        (s) => s.tableId === tableId && s.status === 'active'
      ) || null;

      const total = tableSales.reduce((acc, s) => {
        const saleTotal = s.total > 0 ? s.total : (s.items?.reduce((sum, item) => sum + (item.total || 0), 0) || 0);
        return acc + saleTotal;
      }, 0);

      const itemCount = tableSales.reduce((acc, s) => acc + (s.items?.length || 0), 0);

      groups.push({
        table: displayTable,
        session,
        sales: tableSales.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
        total: Math.round(total * 100) / 100,
        itemCount,
      });
    });

    // Sort: tables with sales first, then by table number
    return groups.sort((a, b) => {
      if (a.sales.length === 0 && b.sales.length > 0) return 1;
      if (a.sales.length > 0 && b.sales.length === 0) return -1;
      return (a.table.number || 0) - (b.table.number || 0);
    });
  }, [sales, tables, customerSessions, user.storeBranchId, user.organizationId]);

  // Filter by search
  const filteredGroups = useMemo(() => {
    if (!searchTerm.trim()) return comandaGroups;
    const term = searchTerm.toLowerCase();
    return comandaGroups.filter(
      (g) =>
        g.table.name.toLowerCase().includes(term) ||
        g.table.number?.toString().includes(term)
    );
  }, [comandaGroups, searchTerm]);

  // Totals
  const totalOpenComandas = comandaGroups.length;
  const totalRevenue = comandaGroups.reduce((acc, g) => acc + g.total, 0);

  const getSaleTotal = (s: Sale) => {
    if (s.total > 0) return s.total;
    return s.items?.reduce((sum, item) => sum + (item.total || 0), 0) || 0;
  };

  const handleCloseComanda = async () => {
    if (!closeModalTable) return;
    const group = comandaGroups.find((g) => g.table.id === closeModalTable.id);
    if (!group || group.sales.length === 0) {
      addToast('warning', 'Nenhuma venda pendente para fechar.');
      return;
    }
    setClosing(true);
    try {
      // Update each sale: set payment method and mark as completed
      for (const sale of group.sales) {
        const updatedSale: Sale = {
          ...sale,
          status: 'completed',
          orderSource: 'cardapio_digital',
          payments: [{ method: closePaymentMethod, amount: getSaleTotal(sale) }],
          kitchenStatus: sale.kitchenStatus === 'pending' ? 'delivered' : sale.kitchenStatus,
          updatedAt: new Date().toISOString(),
        };
        storageService.saveSale(updatedSale);
      }

      // Close the session
      if (group.session) {
        const updatedSession: CustomerSession = {
          ...group.session,
          status: 'completed',
          closedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        storageService.saveCustomerSession(updatedSession);
      }

      // Print receipt on caixa printer
      const caixaPrinter = findCaixaPrinter(storageService.getPrinters());
      if (caixaPrinter && group.sales.length > 0) {
        const lastSale = group.sales[group.sales.length - 1];
        try {
          await printComandaReceipt(lastSale, closeModalTable, caixaPrinter, closePaymentMethod);
        } catch (e) {
          // silent fail - printer may not be connected
        }
      }

      posAudio.chime();
      setCloseModalTable(null);
      addToast('success', `Comanda "${closeModalTable.name}" fechada com sucesso!`);
    } catch (err: any) {
      addToast('error', friendlyErrorMessage(err, 'Não foi possível fechar a comanda.'));
      posAudio.error();
    } finally {
      setClosing(false);
    }
  };

  // Abrir uma nova comanda manualmente (sem QR Code)
  const openNewComanda = () => {
    // Cria uma sessão de cliente para a mesa "Caixa" (sem mesa específica)
    const newSession: CustomerSession = {
      id: crypto.randomUUID(),
      tableId: null,
      sessionToken: crypto.randomUUID(),
      status: 'active',
      openedAt: new Date().toISOString(),
      deviceFingerprint: '',
      storeBranchId: storageService.getCurrentOrgId(),
      organizationId: storageService.getCurrentOrgId(),
    };
    storageService.saveCustomerSession(newSession);
    setCloseModalTable(null);
    // Recarrega as comandas para o novo session aparecer
    loadMyOrders();
    setOrderSuccess(true);
  };

  const handleDeleteSale = (saleId: string) => {
    try {
      storageService.deleteSale(saleId);
      posAudio.click();
      addToast('success', 'Pedido removido.');
    } catch (err: any) {
      addToast('error', friendlyErrorMessage(err, 'Não foi possível remover o pedido.'));
      posAudio.error();
    }
  };

  const handleUpdateKitchenStatus = (saleId: string, newStatus: Sale['kitchenStatus']) => {
    try {
      const sale = sales.find((s) => s.id === saleId);
      if (!sale) return;
      storageService.saveSale({
        ...sale,
        kitchenStatus: newStatus,
        updatedAt: new Date().toISOString(),
      });
      posAudio.click();
    } catch (err: any) {
      // silent fail for KDS updates
    }
  };

  return (
    <div className="p-3 sm:p-4 md:p-6 lg:p-8 space-y-4 sm:space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-orange-600 dark:text-orange-400" />
            Comandas / Mesas
            <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 font-sans font-bold uppercase tracking-widest">
              Tempo Real
            </span>
          </h2>
          <p className="text-xs text-slate-500">
            {totalOpenComandas} comanda{totalOpenComandas !== 1 ? 's' : ''} aberta{totalOpenComandas !== 1 ? 's' : ''} • Total: R$ {totalRevenue.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar por mesa..."
          className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-orange-500"
        />
      </div>

      {/* Comandas List */}
      {filteredGroups.length > 0 ? (
        <div className="space-y-3">
          {filteredGroups.map((group) => {
            const isExpanded = expandedTableId === group.table.id;
            const hasPendingKitchen = group.sales.some((s) => s.kitchenStatus === 'pending' || s.kitchenStatus === 'preparing');
            return (
              <div
                key={group.table.id}
                className="rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] shadow-sm overflow-hidden"
              >
                {/* Table Header */}
                <button
                  onClick={() => setExpandedTableId(isExpanded ? null : group.table.id)}
                  className="w-full p-4 flex items-center gap-3 text-left hover:bg-slate-50 dark:hover:bg-[#27272a]/30 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-600 dark:text-orange-400 shrink-0">
                    <QrCode className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      {group.table.name}
                      {group.session && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                          ATIVA
                        </span>
                      )}
                      {hasPendingKitchen && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-yellow-500/10 text-yellow-600 border border-yellow-500/20">
                          EM PREPARO
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-[#71717a]">
                      {group.sales.length} pedido{group.sales.length !== 1 ? 's' : ''} • {group.itemCount} item(ns)
                      {group.session && ` • Sessão desde ${new Date(group.session.openedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold text-slate-900 dark:text-white">R$ {group.total.toFixed(2)}</p>
                    <p className="text-[10px] text-slate-400">total</p>
                  </div>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>

                {/* Expanded: Sales */}
                {isExpanded && (
                  <div className="border-t border-slate-200 dark:border-[#27272a] p-4 space-y-3">
                    {group.sales.length > 0 ? (
                      group.sales.map((sale) => (
                        <div key={sale.id} className="p-3 rounded-xl bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a]">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-bold text-slate-500 dark:text-[#a1a1aa]">
                              #{sale.code || sale.id.slice(-6)} • {new Date(sale.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase ${STATUS_COLORS[sale.kitchenStatus || 'pending']}`}>
                              {STATUS_LABELS[sale.kitchenStatus || 'pending']}
                            </span>
                          </div>
                          {/* Items */}
                          <div className="space-y-1 mb-2">
                            {(sale.items || []).map((item, idx) => (
                              <div key={idx} className="flex items-center justify-between text-[11px]">
                                <span className="text-slate-700 dark:text-slate-300">
                                  {item.quantity}x {item.productName}
                                </span>
                                <span className="font-semibold text-slate-900 dark:text-white">R$ {item.total.toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                          <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-[#27272a]">
                            <span className="text-xs font-bold text-slate-900 dark:text-white">R$ {getSaleTotal(sale).toFixed(2)}</span>
                            <div className="flex items-center gap-1">
                              {/* KDS Status Buttons */}
                              {sale.kitchenStatus !== 'delivered' && sale.kitchenStatus !== 'cancelled' && (
                                <>
                                  {sale.kitchenStatus === 'pending' && (
                                    <button
                                      onClick={() => handleUpdateKitchenStatus(sale.id, 'preparing')}
                                      className="px-2 py-1 rounded-lg bg-blue-500/10 text-blue-600 text-[9px] font-bold"
                                    >
                                      Preparar
                                    </button>
                                  )}
                                  {sale.kitchenStatus === 'preparing' && (
                                    <button
                                      onClick={() => handleUpdateKitchenStatus(sale.id, 'ready')}
                                      className="px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 text-[9px] font-bold"
                                    >
                                      Pronto
                                    </button>
                                  )}
                                  {sale.kitchenStatus === 'ready' && (
                                    <button
                                      onClick={() => handleUpdateKitchenStatus(sale.id, 'delivered')}
                                      className="px-2 py-1 rounded-lg bg-slate-500/10 text-slate-600 text-[9px] font-bold"
                                    >
                                      Entregue
                                    </button>
                                  )}
                                </>
                              )}
                              {isAdmin && (
                                <button
                                  onClick={() => handleDeleteSale(sale.id)}
                                  className="p-1 rounded-lg text-rose-500 hover:bg-rose-500/10"
                                  title="Remover pedido"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-6 text-xs text-slate-400">
                        Nenhum pedido ainda. Aguardando cliente escanear o QR Code.
                      </div>
                    )}

                    {/* Close Comanda Button */}
                    {group.sales.length > 0 && (
                      <button
                        onClick={() => setCloseModalTable(group.table)}
                        className="w-full mt-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Fechar Comanda — R$ {group.total.toFixed(2)}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-16 space-y-4">
          <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-[#27272a] flex items-center justify-center mx-auto">
            <ClipboardList className="w-8 h-8 text-slate-400" />
          </div>
          <p className="text-sm text-slate-500 dark:text-[#71717a]">Nenhuma comanda aberta no momento</p>
          <p className="text-xs text-slate-400">As comandas aparecerão aqui quando clientes fizerem pedidos pelo cardápio digital</p>
          <button
            onClick={() => openNewComanda()}
            className="mt-4 w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Abrir Comanda Manual</span>
          </button>
        </div>
      )}

      {/* Close Comanda Modal */}
      {closeModalTable && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setCloseModalTable(null)}>
          <div className="bg-white dark:bg-[#18181b] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-200 dark:border-[#27272a]">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Fechar Comanda</h3>
              <p className="text-xs text-slate-500 dark:text-[#71717a] mt-1">{closeModalTable.name}</p>
            </div>
            <div className="p-5 space-y-4">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a]">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-[#71717a] font-bold">Total a Receber</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">
                  R$ {comandaGroups.find((g) => g.table.id === closeModalTable.id)?.total.toFixed(2) || '0.00'}
                </p>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-[#a1a1aa] mb-1">Forma de Pagamento</label>
                <select
                  value={closePaymentMethod}
                  onChange={(e) => setClosePaymentMethod(e.target.value as Sale['payments'][0]['method'])}
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
                >
                  <option value="pix">PIX</option>
                  <option value="cash">Dinheiro</option>
                  <option value="credit_card">Cartão Crédito</option>
                  <option value="debit_card">Cartão Débito</option>
                </select>
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-[#27272a] flex justify-end gap-2">
              <button
                onClick={() => setCloseModalTable(null)}
                className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 font-bold text-xs hover:bg-slate-100 dark:hover:bg-[#27272a]"
              >
                Cancelar
              </button>
              <button
                onClick={handleCloseComanda}
                disabled={closing}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 disabled:opacity-60"
              >
                {closing ? <><Loader2 className="w-4 h-4 animate-spin" /> Fechando...</> : <><CheckCircle2 className="w-4 h-4" /> Confirmar Fechamento</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
