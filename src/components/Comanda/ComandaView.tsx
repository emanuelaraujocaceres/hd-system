import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  ClipboardList,
  QrCode,
  Search,
  ChevronLeft,
  Trash2,
  Loader2,
  Plus,
  CreditCard,
  AlertCircle,
} from 'lucide-react';
import { Sale, Table, CustomerSession, Customer, UserProfile, Product, PaymentDetails } from '../../types';
import { storageService } from '../../services/storageService';
import { posAudio } from '../../services/audioService';
import { useToast } from '../shared/Toast';
import { friendlyErrorMessage } from '../../lib/friendlyError';
import { PaymentModal } from '../PDV/PaymentModal';
import { buscarItens, getTotalComanda, adicionarItem, removerItem, fecharComanda, ItemComanda } from '../../services/comandaService';

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
  closing_request: 'Solicitou Conta',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  preparing: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  ready: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  delivered: 'bg-slate-500/10 text-slate-600 border-slate-500/20',
  cancelled: 'bg-rose-500/10 text-rose-600 border-rose-500/20',
  closing_request: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
};

export const ComandaView: React.FC<ComandaViewProps> = ({
  sales,
  customers,
  tables,
  customerSessions,
  products,
  user,
}) => {
  const isAdmin = user.role === 'admin' || user.role === 'manager' || !!user.superadmin;
  const { addToast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [detailSessionId, setDetailSessionId] = useState<string | null>(null);

  // ── Detalhe (PDV restrito do operador) ──
  const [productSearch, setProductSearch] = useState('');
  const [quantity, setQuantity] = useState<number>(1);
  const [adding, setAdding] = useState(false);
  const [removingSaleId, setRemovingSaleId] = useState<string | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Subscribe to realtime updates
  useEffect(() => {
    const unsub = storageService.subscribe(() => {
      // Força re-render em qualquer mudança de storage (local ou remota)
      setSearchTerm((prev) => prev);
    });
    return () => { unsub(); };
  }, []);

  // Foco automático na busca de produto ao abrir o detalhe
  useEffect(() => {
    if (detailSessionId) {
      const t = setTimeout(() => searchRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [detailSessionId]);

  // Build comanda groups: group sales by table
  const comandaGroups = useMemo<ComandaGroup[]>(() => {
    const tableSaleMap = new Map<string, Sale[]>();
    const cardapioSales = sales.filter((s) => s.orderSource === 'cardapio_digital' || s.tableId);
    for (const sale of cardapioSales) {
      if (sale.status === 'cancelled') continue;
      const tableId = sale.tableId || '__no_table__';
      if (!tableSaleMap.has(tableId)) tableSaleMap.set(tableId, []);
      tableSaleMap.get(tableId)!.push(sale);
    }
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

    return groups.sort((a, b) => {
      if (a.sales.length === 0 && b.sales.length > 0) return 1;
      if (a.sales.length > 0 && b.sales.length === 0) return -1;
      return (a.table.number || 0) - (b.table.number || 0);
    });
  }, [sales, tables, customerSessions, user.storeBranchId, user.organizationId]);

  const filteredGroups = useMemo(() => {
    if (!searchTerm.trim()) return comandaGroups;
    const term = searchTerm.toLowerCase();
    return comandaGroups.filter(
      (g) =>
        g.table.name.toLowerCase().includes(term) ||
        g.table.number?.toString().includes(term)
    );
  }, [comandaGroups, searchTerm]);

  const totalOpenComandas = comandaGroups.length;
  const totalRevenue = comandaGroups.reduce((acc, g) => acc + g.total, 0);

  // ── Sessão em detalhe ──
  const detailSession = detailSessionId
    ? customerSessions.find((s) => s.id === detailSessionId) || null
    : null;
  const detailTable = detailSession ? tables.find((t) => t.id === detailSession.tableId) || null : null;
  const detailItems = useMemo<ItemComanda[]>(
    () => (detailSessionId ? buscarItens(detailSessionId) : []),
    [detailSessionId, sales]
  );
  const detailTotal = useMemo<number>(
    () => (detailSessionId ? getTotalComanda(detailSessionId) : 0),
    [detailSessionId, sales]
  );

  const goBackToList = useCallback(() => {
    setDetailSessionId(null);
    setProductSearch('');
    setQuantity(1);
    setSelectedCustomer(null);
  }, []);

  // Produtos filtrados pela busca (ativa na tela de detalhe)
  const filteredProducts = useMemo(() => {
    const term = productSearch.trim().toLowerCase();
    if (!term) return [];
    return products
      .filter((p) => p.active)
      .filter((p) =>
        p.name.toLowerCase().includes(term) ||
        (p.barcode && p.barcode.toLowerCase().includes(term))
      )
      .slice(0, 8);
  }, [products, productSearch]);

  const handleAddItem = async () => {
    if (!detailSession) return;
    const product = filteredProducts.find((p) => p.id === productSearch) ||
      (productSearch
        ? products.find((p) => p.name.toLowerCase() === productSearch.trim().toLowerCase() && p.active)
        : undefined);
    if (!product) {
      if (productSearch.trim()) addToast('warning', `Produto "${productSearch}" não encontrado.`);
      return;
    }
    if (quantity < 1) {
      addToast('warning', 'Quantidade inválida.');
      return;
    }
    setAdding(true);
    try {
      const res = await adicionarItem({
        product,
        quantity,
        session: detailSession,
        operatorName: user.name,
        operatorId: user.id,
      });
      if (res.success) {
        posAudio.click();
        setProductSearch('');
        setQuantity(1);
        searchRef.current?.focus();
      } else {
        posAudio.error();
        addToast('error', res.message || 'Não foi possível adicionar o item.');
      }
    } catch (e: any) {
      posAudio.error();
      addToast('error', friendlyErrorMessage(e, 'Não foi possível adicionar o item.'));
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveSale = async (saleId: string) => {
    setRemovingSaleId(saleId);
    try {
      const res = await removerItem(saleId);
      if (res.success) {
        posAudio.click();
        addToast('success', 'Item removido — estoque restaurado.');
      } else {
        posAudio.error();
        addToast('error', res.message || 'Não foi possível remover o item.');
      }
    } catch (e: any) {
      posAudio.error();
      addToast('error', friendlyErrorMessage(e, 'Não foi possível remover o item.'));
    } finally {
      setRemovingSaleId(null);
    }
  };

  const handleFinalizeComanda = async (payments: PaymentDetails[], total: number) => {
    if (!detailSession) return { success: false, message: 'Sessão não encontrada.' };
    const res = await fecharComanda(detailSession.id, payments, user.name);
    if (res.success) {
      // PaymentModal toca o chime no sucesso — aqui só atualizamos a UI
      addToast('success', `Comanda ${detailTable ? detailTable.name : ''} fechada com sucesso! R$ ${(res.total ?? total).toFixed(2)}`);
      setSelectedCustomer(null);
      goBackToList();
      return res;
    }
    posAudio.error();
    addToast('error', res.message || 'Não foi possível fechar a comanda.');
    return res;
  };

  // ── Detalhe da comanda (PDV restrito do operador) ──
  if (detailSession) {
    return (
      <div className="h-full flex flex-col max-w-3xl mx-auto w-full">
        {/* Header */}
        <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-[#27272a]">
          <div className="flex items-center gap-3">
            <button
              onClick={goBackToList}
              className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-[#27272a]"
              title="Voltar para comandas"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                {detailTable ? detailTable.name : 'Comanda'}
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                  MESA ATIVA
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Abertura: {detailSession.openedAt ? new Date(detailSession.openedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-'}
                {detailSession.customerName ? ` • Cliente: ${detailSession.customerName}` : ''}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-lg font-bold text-slate-900 dark:text-white">R$ {detailTotal.toFixed(2)}</p>
              <p className="text-[10px] text-slate-400">total da mesa</p>
            </div>
          </div>
        </div>

        {/* Add product row */}
        <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-[#27272a]">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchRef}
                type="text"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddItem(); } }}
                placeholder="Buscar produto por nome ou código de barras..."
                className="w-full pl-9 pr-3 py-2.5 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-xl text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-16 px-2 py-2.5 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-xl text-center text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-orange-500"
              title="Quantidade"
            />
            <button
              onClick={handleAddItem}
              disabled={adding}
              className="px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-60 text-white font-bold text-xs flex items-center gap-1.5 transition-colors"
            >
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Adicionar
            </button>
          </div>

          {/* Suggestion list */}
          {productSearch.trim() && filteredProducts.length > 0 && (
            <div className="mt-2 rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] overflow-hidden shadow-lg">
              {filteredProducts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setProductSearch(p.id);
                    handleAddItem();
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                  className="w-full px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-[#27272a] flex items-center justify-between text-xs"
                >
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{p.name}</span>
                  <span className="text-slate-500 font-bold">R$ {(p.salePrice || 0).toFixed(2)}</span>
                </button>
              ))}
            </div>
          )}
          {productSearch.trim() && filteredProducts.length === 0 && (
            <p className="mt-2 text-xs text-slate-400">Nenhum produto encontrado.</p>
          )}
        </div>

        {/* Items list */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2">
          {detailItems.length === 0 ? (
            <div className="text-center py-10 space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-[#27272a] flex items-center justify-center mx-auto">
                <ClipboardList className="w-7 h-7 text-slate-400" />
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Nenhum item nesta comanda.</p>
              <p className="text-xs text-slate-400">Adicione produtos acima ou aguarde o cliente pedir pelo QR Code.</p>
            </div>
          ) : (
            detailItems.map((item) => (
              <div
                key={item.saleItemId}
                className="p-3 rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] flex items-center gap-3"
              >
                <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-[#27272a] flex items-center justify-center text-slate-500 font-bold text-sm shrink-0">
                  {item.quantity}x
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{item.productName}</p>
                  <p className="text-[11px] text-slate-500">
                    R$ {item.unitPrice.toFixed(2)} un
                    {item.kitchenStatus === 'closing_request' ? (
                      <span className="ml-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-orange-500/10 text-orange-600 border border-orange-500/20 uppercase">
                        Solicitou conta
                      </span>
                    ) : null}
                  </p>
                </div>
                <span className="text-sm font-bold text-slate-900 dark:text-white">R$ {item.total.toFixed(2)}</span>
                <button
                  onClick={() => handleRemoveSale(item.saleId)}
                  disabled={removingSaleId === item.saleId}
                  className="p-2 rounded-lg text-rose-500 hover:bg-rose-500/10 disabled:opacity-50"
                  title="Remover item"
                >
                  {removingSaleId === item.saleId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
            ))
          )}
        </div>

        {/* Fixed footer with total */}
        <div className="p-3 sm:p-4 border-t border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#18181b]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Geral</span>
            <span className="text-2xl font-extrabold text-slate-900 dark:text-white">R$ {detailTotal.toFixed(2)}</span>
          </div>
          {detailItems.length === 0 && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1 mb-2">
              <AlertCircle className="w-3.5 h-3.5" /> A comanda precisa de ao menos 1 item para finalizar.
            </p>
          )}
          <button
            onClick={() => { setSelectedCustomer(null); setPaymentOpen(true); }}
            disabled={detailItems.length === 0}
            className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors shadow-lg shadow-emerald-600/20"
          >
            <CreditCard className="w-5 h-5" />
            Finalizar Comanda / Pagamento
          </button>
        </div>

        {/* Payment Modal (modo comanda) */}
        <PaymentModal
          isOpen={paymentOpen}
          onClose={() => setPaymentOpen(false)}
          cartItems={[]}
          customers={customers}
          selectedCustomer={selectedCustomer}
          setSelectedCustomer={setSelectedCustomer}
          subtotal={detailTotal}
          discount={0}
          setDiscount={() => {}}
          settings={storageService.getSettings()}
          user={user}
          onSaleSuccess={() => {}}
          comandaMode={{
            title: `Finalizar Comanda — ${detailTable ? detailTable.name : ''}`,
            onConfirmComanda: handleFinalizeComanda,
          }}
        />

        {/* Loading backdrop while closing */}
        {adding && (
          <div className="fixed inset-0 z-40 bg-black/10 pointer-events-none" />
        )}
      </div>
    );
  }

  // ── Lista de comandas ──
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
          <p className="text-[11px] text-slate-400 mt-1">
            Clique em uma mesa ativa para gerenciar itens e finalizar o pagamento.
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
          {filteredGroups.map((group) => (
            <button
              key={group.table.id}
              onClick={() => {
                if (group.session) {
                  setDetailSessionId(group.session.id);
                  posAudio.click();
                } else {
                  addToast('warning', 'Esta mesa não possui sessão ativa.');
                }
              }}
              disabled={!group.session}
              className={`w-full rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] shadow-sm overflow-hidden p-4 flex items-center gap-3 text-left transition-colors ${
                group.session ? 'hover:bg-slate-50 dark:hover:bg-[#27272a]/30 cursor-pointer' : 'opacity-60 cursor-not-allowed'
              }`}
            >
              <div className="w-11 h-11 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-600 dark:text-orange-400 shrink-0">
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
                  {group.sales.some((s) => s.kitchenStatus === 'closing_request') && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-orange-500/10 text-orange-600 border border-orange-500/20">
                      SOLICITOU CONTA
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-[#71717a]">
                  {group.sales.length} pedido{group.sales.length !== 1 ? 's' : ''} • {group.itemCount} item(ns)
                  {group.session?.openedAt && ` • Sessão desde ${new Date(group.session.openedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-lg font-bold text-slate-900 dark:text-white">R$ {group.total.toFixed(2)}</p>
                <p className="text-[10px] text-slate-400">
                  {group.session ? 'Gerenciar →' : 'total'}
                </p>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 space-y-3">
          <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-[#27272a] flex items-center justify-center mx-auto">
            <ClipboardList className="w-8 h-8 text-slate-400" />
          </div>
          <p className="text-sm text-slate-500 dark:text-[#71717a]">Nenhuma comanda aberta no momento</p>
          <p className="text-xs text-slate-400">As comandas aparecerão aqui quando clientes fizerem pedidos pelo cardápio digital</p>
        </div>
      )}
    </div>
  );
};
