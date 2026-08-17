import React, { useState, useMemo } from 'react';
import {
  Search,
  Calendar,
  ChevronDown,
  ChevronUp,
  Trash2,
  Receipt,
  Package,
  CreditCard,
  User,
  Clock,
} from 'lucide-react';
import { Sale, UserProfile } from '../../types';
import { storageService } from '../../services/storageService';
import { posAudio } from '../../services/audioService';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { useToast } from '../shared/Toast';
import { undoManager } from '../../lib/undoManager';
import { friendlyErrorMessage } from '../../lib/friendlyError';
import { usePagination } from '../../hooks/usePagination';
import { Pagination } from '../shared/Pagination';

interface SalesHistoryViewProps {
  sales: Sale[];
  user: UserProfile;
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Dinheiro',
  pix: 'PIX',
  credit_card: 'Cartão de Crédito',
  debit_card: 'Cartão de Débito',
  credit_account: 'Fiado',
};

export const SalesHistoryView: React.FC<SalesHistoryViewProps> = ({
  sales,
  user,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);
  const { addToast } = useToast();

  // Defensive: compute total from items when sale.total is 0 (R$0.00 bug fallback)
  const getSaleTotal = (s: Sale) => {
    if (s.total > 0) return s.total;
    const itemsTotal = s.items?.reduce((sum, item) => sum + (item.total || 0), 0) || 0;
    return itemsTotal;
  };

  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      // Text search
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesCode = (sale.code || '').toLowerCase().includes(q);
        const matchesCustomer = (sale.customerName || '').toLowerCase().includes(q);
        const matchesDate = new Date(sale.date)
          .toLocaleDateString('pt-BR')
          .includes(q);
        if (!matchesCode && !matchesCustomer && !matchesDate) return false;
      }

      // Date range filter
      if (dateFrom) {
        const saleDate = new Date(sale.date).toISOString().slice(0, 10);
        if (saleDate < dateFrom) return false;
      }
      if (dateTo) {
        const saleDate = new Date(sale.date).toISOString().slice(0, 10);
        if (saleDate > dateTo) return false;
      }

      return true;
    });
  }, [sales, searchQuery, dateFrom, dateTo]);

  const {
    paginatedData: paginatedSales,
    currentPage,
    totalPages,
    totalItems,
    goToPage,
  } = usePagination({ data: filteredSales, itemsPerPage: 50 });

  const toggleExpand = (saleId: string) => {
    setExpandedSaleId(expandedSaleId === saleId ? null : saleId);
  };

  const [confirmDeleteSale, setConfirmDeleteSale] = useState<Sale | null>(null);
  const handleConfirmDeleteSale = () => {
    const sale = confirmDeleteSale;
    if (!sale) return;
    setConfirmDeleteSale(null);
    try {
      storageService.deleteSale(sale.id);
      posAudio.click();
      setExpandedSaleId(null);
      const action = undoManager.peek();
      addToast(
        'success',
        `Venda ${sale.code} excluída.`,
        6000,
        action ? 'Desfazer' : undefined,
        action ? () => undoManager.undo() : undefined
      );
    } catch (err: any) {
      addToast('error', friendlyErrorMessage(err, 'Não foi possível excluir a venda. Tente novamente.'));
      posAudio.error();
    }
  };

  return (
    <div className="p-3 sm:p-4 md:p-6 max-w-7xl mx-auto space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Receipt className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            Histórico de Vendas
          </h2>
          <p className="text-xs text-slate-500">
            Consulta completa de todas as vendas realizadas
          </p>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 dark:text-[#71717a] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por código, cliente ou data..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-xs font-medium text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-[#52525b] focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-400 dark:text-[#71717a]" />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-2.5 rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            title="Data inicial"
          />
          <span className="text-xs text-slate-400 dark:text-[#52525b]">até</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-2.5 rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            title="Data final"
          />
        </div>
      </div>

      {/* Results summary */}
      <div className="text-xs text-slate-500 dark:text-[#71717a] font-medium">
        {filteredSales.length} venda{filteredSales.length !== 1 ? 's' : ''} encontrada{filteredSales.length !== 1 ? 's' : ''}
      </div>

      {/* Sales Table */}
      <div className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 dark:bg-[#09090b]/80 border-b border-slate-200 dark:border-[#27272a] text-slate-500 dark:text-[#71717a] font-bold uppercase tracking-wider">
              <th className="py-3.5 px-4">Código</th>
              <th className="py-3.5 px-4">Data</th>
              <th className="py-3.5 px-4">Cliente</th>
              <th className="py-3.5 px-4 text-center">Itens</th>
              <th className="py-3.5 px-4">Total</th>
              <th className="py-3.5 px-4">Status</th>
              <th className="py-3.5 px-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-[#27272a]">
            {paginatedSales.map((sale) => {
              const isExpanded = expandedSaleId === sale.id;
              const itemsCount = (sale.items || []).reduce((sum, item) => sum + item.quantity, 0);

              return (
                <React.Fragment key={sale.id}>
                  <tr
                    onClick={() => toggleExpand(sale.id)}
                    className="hover:bg-slate-50/80 dark:hover:bg-[#27272a]/30 transition-colors cursor-pointer"
                  >
                    <td className="py-3 px-4 font-bold text-slate-900 dark:text-white font-mono">
                      #{sale.code}
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-[#a1a1aa] font-medium">
                      {new Date(sale.date).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="py-3 px-4 text-slate-700 dark:text-[#a1a1aa]">
                      {sale.customerName || 'Consumidor Final'}
                    </td>
                    <td className="py-3 px-4 text-center text-slate-600 dark:text-[#a1a1aa]">
                      {itemsCount}
                    </td>
                    <td className="py-3 px-4 font-extrabold text-emerald-600 dark:text-emerald-400">
                      R$ {getSaleTotal(sale).toFixed(2)}
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
                        {sale.status === 'completed'
                          ? 'Concluída'
                          : sale.status === 'cancelled'
                            ? 'Cancelada'
                            : 'Pendente'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {user.role === 'admin' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteSale(sale);
                            }}
                            className="p-1.5 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 transition-colors"
                            title="Excluir venda"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-slate-400 dark:text-[#71717a]" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400 dark:text-[#71717a]" />
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Expanded Detail Panel */}
                  {isExpanded && (
                    <tr>
                      <td colSpan={7} className="p-0">
                        <div className="px-6 py-5 bg-slate-50 dark:bg-[#09090b]/60 border-t border-slate-200 dark:border-[#27272a]">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Left: Items */}
                            <div>
                              <h4 className="text-[10px] uppercase tracking-widest font-bold text-slate-500 dark:text-[#71717a] mb-3 flex items-center gap-1.5">
                                <Package className="w-3.5 h-3.5" />
                                Itens da Venda
                              </h4>
                              <div className="space-y-2">
                                {(sale.items || []).map((item, idx) => (
                                  <div
                                    key={idx}
                                    className="flex items-center justify-between p-2.5 rounded-lg bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a]"
                                  >
                                    <div className="min-w-0">
                                      <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                        {item.productName}
                                      </p>
                                      <p className="text-[10px] text-slate-500 dark:text-[#71717a]">
                                        {item.quantity}x R$ {item.unitPrice.toFixed(2)}
                                      </p>
                                    </div>
                                    <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 shrink-0 ml-2">
                                      R$ {item.total.toFixed(2)}
                                    </p>
                                  </div>
                                ))}
                              </div>

                              {/* Totals */}
                              <div className="mt-3 space-y-1.5">
                                <div className="flex justify-between text-[11px] text-slate-500 dark:text-[#71717a]">
                                  <span>Subtotal</span>
                                  <span>R$ {sale.subtotal.toFixed(2)}</span>
                                </div>
                                {sale.discount > 0 && (
                                  <div className="flex justify-between text-[11px] text-rose-500">
                                    <span>Desconto</span>
                                    <span>- R$ {sale.discount.toFixed(2)}</span>
                                  </div>
                                )}
                                <div className="flex justify-between text-xs font-bold text-slate-900 dark:text-white pt-1.5 border-t border-slate-200 dark:border-[#27272a]">
                                  <span>TOTAL</span>
                                  <span>R$ {getSaleTotal(sale).toFixed(2)}</span>
                                </div>
                              </div>
                            </div>

                            {/* Right: Payment & Operator */}
                            <div className="space-y-4">
                              <div>
                                <h4 className="text-[10px] uppercase tracking-widest font-bold text-slate-500 dark:text-[#71717a] mb-3 flex items-center gap-1.5">
                                  <CreditCard className="w-3.5 h-3.5" />
                                  Formas de Pagamento
                                </h4>
                                <div className="space-y-2">
                                  {sale.payments.map((payment, idx) => (
                                    <div
                                      key={idx}
                                      className="flex items-center justify-between p-2.5 rounded-lg bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a]"
                                    >
                                      <div className="flex items-center gap-2">
                                        <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold text-[10px]">
                                          {PAYMENT_LABELS[payment.method] || payment.method}
                                        </span>
                                        {payment.installments && payment.installments > 1 && (
                                          <span className="text-[10px] text-slate-400 dark:text-[#52525b]">
                                            {payment.installments}x
                                          </span>
                                        )}
                                      </div>
                                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                                        R$ {payment.amount.toFixed(2)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <div>
                                <h4 className="text-[10px] uppercase tracking-widest font-bold text-slate-500 dark:text-[#71717a] mb-3 flex items-center gap-1.5">
                                  <User className="w-3.5 h-3.5" />
                                  Operador
                                </h4>
                                <div className="p-2.5 rounded-lg bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] flex items-center gap-2">
                                  <div className="w-7 h-7 rounded-full bg-indigo-500/20 flex items-center justify-center">
                                    <User className="w-3.5 h-3.5 text-indigo-500" />
                                  </div>
                                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                                    {sale.operatorName}
                                  </span>
                                </div>
                              </div>

                              <div>
                                <h4 className="text-[10px] uppercase tracking-widest font-bold text-slate-500 dark:text-[#71717a] mb-3 flex items-center gap-1.5">
                                  <Clock className="w-3.5 h-3.5" />
                                  Data/Hora
                                </h4>
                                <div className="p-2.5 rounded-lg bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a]">
                                  <span className="text-xs font-medium text-slate-700 dark:text-[#a1a1aa]">
                                    {new Date(sale.date).toLocaleString('pt-BR')}
                                  </span>
                                </div>
                              </div>

                              {/* Admin delete button at bottom */}
                              {user.role === 'admin' && (
                                <button
                                  onClick={() => setConfirmDeleteSale(sale)}
                                  className="w-full mt-2 px-4 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 font-bold text-xs hover:bg-rose-500/20 transition-colors flex items-center justify-center gap-2"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  Excluir Venda
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>

        {/* Empty State */}
        {filteredSales.length === 0 && (
          <div className="py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-[#27272a] flex items-center justify-center mx-auto mb-4">
              <Receipt className="w-7 h-7 text-slate-400 dark:text-[#52525b]" />
            </div>
            <p className="text-sm font-bold text-slate-900 dark:text-white mb-1">
              Nenhuma venda encontrada
            </p>
            <p className="text-xs text-slate-500 dark:text-[#71717a]">
              Tente ajustar os filtros de busca ou período.
            </p>
          </div>
        )}

        {/* Pagination */}
        {filteredSales.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={50}
            onPageChange={goToPage}
          />
        )}
      </div>

      {/* Confirm: excluir venda */}
      <ConfirmDialog
        isOpen={confirmDeleteSale !== null}
        title="Excluir venda?"
        message="A venda será removida do histórico. Você poderá desfazer logo em seguida."
        itemName={confirmDeleteSale ? `Venda ${confirmDeleteSale.code}` : undefined}
        confirmLabel="Excluir"
        onConfirm={handleConfirmDeleteSale}
        onCancel={() => setConfirmDeleteSale(null)}
      />
    </div>
  );
};
