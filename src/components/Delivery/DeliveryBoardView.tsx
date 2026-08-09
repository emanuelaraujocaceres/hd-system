/**
 * DeliveryBoardView - Tela de gerenciamento de pedidos de delivery
 * 
 * Funcionalidades:
 * - Lista pedidos de delivery em tempo real
 * - Badge: MESA (azul) vs DELIVERY (laranja)
 * - Filtros: Todos / Pendentes / Em Preparação / Prontos / Entregues
 * - Atualização de status com botões
 * - Mostra forma de pagamento, troco, endereço
 * - Colaborador delivery: só vê botão "Entregue"
 */

import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Clock, CheckCircle, Truck, Package, MapPin, Phone, DollarSign, CreditCard, Banknote, Loader2 } from 'lucide-react';
import { DeliveryOrder } from '../../types';
import { storageService } from '../../services/storageService';
import { posAudio } from '../../services/audioService';

interface DeliveryBoardViewProps {
  user: any;
}

type StatusFilter = 'all' | 'pending' | 'confirmed' | 'preparing' | 'ready' | 'out_for_delivery' | 'delivered';

const STATUS_CONFIG = {
  pending: { label: 'Pendente', color: 'bg-slate-500', textColor: 'text-slate-500', icon: Clock },
  confirmed: { label: 'Confirmado', color: 'bg-blue-500', textColor: 'text-blue-500', icon: CheckCircle },
  preparing: { label: 'Preparando', color: 'bg-amber-500', textColor: 'text-amber-500', icon: RefreshCw },
  ready: { label: 'Pronto', color: 'bg-emerald-500', textColor: 'text-emerald-500', icon: Package },
  out_for_delivery: { label: 'Saiu p/ Entrega', color: 'bg-orange-500', textColor: 'text-orange-500', icon: Truck },
  delivered: { label: 'Entregue', color: 'bg-green-600', textColor: 'text-green-600', icon: CheckCircle },
  cancelled: { label: 'Cancelado', color: 'bg-rose-500', textColor: 'text-rose-500', icon: Clock },
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Dinheiro',
  credit_card: 'Cartão Crédito',
  debit_card: 'Cartão Débito',
  pix: 'PIX',
};

export const DeliveryBoardView: React.FC<DeliveryBoardViewProps> = ({ user }) => {
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [isDeliveryWorker, setIsDeliveryWorker] = useState(false);

  useEffect(() => {
    loadOrders();
    const unsub = storageService.subscribe(loadOrders);
    return () => { unsub(); };
    
    // Verificar se é colaborador delivery
    const modules = storageService.getModuleVisibility();
    if (modules && modules.storeBranchId === user.storeBranchId) {
      // Colaborador delivery só tem acesso ao delivery, não ao PDV
      setIsDeliveryWorker(!modules.modulePdv && modules.moduleDelivery);
    }
  }, []);

  const loadOrders = () => {
    const all = storageService.getDeliveryOrders();
    const filtered = user.superadmin 
      ? all 
      : all.filter(o => o.storeBranchId === user.storeBranchId);
    setOrders(filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  };

  const filteredOrders = useMemo(() => {
    if (filter === 'all') return orders.filter(o => !['delivered', 'cancelled'].includes(o.status));
    return orders.filter(o => o.status === filter);
  }, [orders, filter]);

  const activeOrders = useMemo(() => orders.filter(o => !['delivered', 'cancelled'].includes(o.status)), [orders]);
  const deliveredToday = useMemo(() => {
    const today = new Date().toDateString();
    return orders.filter(o => o.status === 'delivered' && new Date(o.deliveredAt || o.createdAt).toDateString() === today);
  }, [orders]);

  const handleUpdateStatus = (orderId: string, newStatus: string) => {
    const extraData: any = {};
    const now = new Date().toISOString();
    
    if (newStatus === 'confirmed') extraData.confirmedAt = now;
    if (newStatus === 'preparing') extraData.preparingAt = now;
    if (newStatus === 'ready') extraData.readyAt = now;
    if (newStatus === 'out_for_delivery') extraData.outForDeliveryAt = now;
    if (newStatus === 'delivered') {
      extraData.deliveredAt = now;
      extraData.deliveredBy = user.id;
    }
    
    storageService.updateDeliveryOrderStatus(orderId, newStatus, extraData);
    posAudio.chime();
  };

  const handleCancelOrder = (orderId: string) => {
    if (confirm('Tem certeza que deseja cancelar este pedido?')) {
      storageService.updateDeliveryOrderStatus(orderId, 'cancelled', {
        cancelledAt: new Date().toISOString(),
        cancelledReason: 'Cancelado pelo colaborador',
      });
      posAudio.error();
    }
  };

  const getStatusActions = (order: DeliveryOrder) => {
    // Colaborador delivery: só pode marcar como entregue
    if (isDeliveryWorker) {
      if (order.status === 'out_for_delivery') {
        return (
          <button
            onClick={() => handleUpdateStatus(order.id, 'delivered')}
            className="px-4 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-white text-xs font-bold flex items-center gap-2"
          >
            <CheckCircle className="w-4 h-4" />
            Marcar como Entregue
          </button>
        );
      }
      return null;
    }

    // Colaborador normal: fluxo completo
    switch (order.status) {
      case 'pending':
        return (
          <div className="flex gap-2">
            <button
              onClick={() => handleUpdateStatus(order.id, 'confirmed')}
              className="px-3 py-2 rounded-xl bg-blue-500 hover:bg-blue-400 text-white text-xs font-bold"
            >
              Confirmar
            </button>
            <button
              onClick={() => handleCancelOrder(order.id)}
              className="px-3 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-xs font-bold"
            >
              Cancelar
            </button>
          </div>
        );
      case 'confirmed':
        return (
          <button
            onClick={() => handleUpdateStatus(order.id, 'preparing')}
            className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-white text-xs font-bold"
          >
            Iniciar Preparo
          </button>
        );
      case 'preparing':
        return (
          <button
            onClick={() => handleUpdateStatus(order.id, 'ready')}
            className="px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold"
          >
            Marcar como Pronto
          </button>
        );
      case 'ready':
        return (
          <button
            onClick={() => handleUpdateStatus(order.id, 'out_for_delivery')}
            className="px-3 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-xs font-bold"
          >
            Saiu para Entrega
          </button>
        );
      case 'out_for_delivery':
        return (
          <button
            onClick={() => handleUpdateStatus(order.id, 'delivered')}
            className="px-3 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-white text-xs font-bold"
          >
            Entregue
          </button>
        );
      default:
        return null;
    }
  };

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-serif-italic text-2xl font-light tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
            🛵 Delivery Board
            <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-orange-500/10 text-orange-500 border border-orange-500/30 font-sans font-bold uppercase tracking-wider">
              {activeOrders.length} ativos
            </span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-[#a1a1aa] mt-1">
            Gerencie os pedidos de delivery em tempo real
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <div className="px-3 py-1.5 rounded-xl bg-green-500/10 text-green-600 border border-green-500/20 font-bold">
            {deliveredToday.length} entregues hoje
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        {([
          ['all', 'Ativos'],
          ['pending', 'Pendentes'],
          ['confirmed', 'Confirmados'],
          ['preparing', 'Preparando'],
          ['ready', 'Prontos'],
          ['out_for_delivery', 'Em Entrega'],
          ['delivered', 'Entregues'],
        ] as [StatusFilter, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${
              filter === key
                ? 'bg-orange-500 text-white'
                : 'bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-slate-600 dark:text-slate-400 hover:bg-slate-50'
            }`}
          >
            {label}
            {key === 'all' && activeOrders.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-white/20 text-[10px]">{activeOrders.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Lista de Pedidos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredOrders.map((order) => {
          const statusConfig = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
          const StatusIcon = statusConfig.icon;
          
          return (
            <div
              key={order.id}
              className={`p-4 rounded-2xl bg-white dark:bg-[#18181b] border-l-4 ${
                order.status === 'delivered' ? 'border-l-green-500' :
                order.status === 'cancelled' ? 'border-l-rose-500' :
                order.status === 'out_for_delivery' ? 'border-l-orange-500' :
                'border-l-amber-500'
              } border border-slate-200 dark:border-[#27272a] space-y-3`}
            >
              {/* Header do Pedido */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900 dark:text-white">#{order.orderNumber}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${statusConfig.color}/10 ${statusConfig.textColor} border border-current/20`}>
                      {statusConfig.label}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-[#71717a] mt-0.5">{order.customerName}</p>
                </div>
                <div className={`p-1.5 rounded-lg ${statusConfig.color}/10`}>
                  <StatusIcon className={`w-4 h-4 ${statusConfig.textColor}`} />
                </div>
              </div>

              {/* Badge Entrega/Retirada */}
              <div className="flex items-center gap-2">
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                  order.orderType === 'delivery' 
                    ? 'bg-orange-500/10 text-orange-600 border border-orange-500/20' 
                    : 'bg-blue-500/10 text-blue-600 border border-blue-500/20'
                }`}>
                  {order.orderType === 'delivery' ? '🛵 ENTREGA' : '🏪 RETIRADA'}
                </span>
                {order.paymentMethod && (
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-600 border border-slate-500/20 flex items-center gap-1">
                    {order.paymentMethod === 'cash' && <Banknote className="w-3 h-3" />}
                    {order.paymentMethod === 'pix' && <DollarSign className="w-3 h-3" />}
                    {(order.paymentMethod === 'credit_card' || order.paymentMethod === 'debit_card') && <CreditCard className="w-3 h-3" />}
                    {PAYMENT_LABELS[order.paymentMethod] || order.paymentMethod}
                  </span>
                )}
              </div>

              {/* Itens do Pedido */}
              <div className="space-y-1 max-h-24 overflow-y-auto">
                {order.items.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 dark:text-slate-400">
                      {item.quantity}x {item.productName}
                    </span>
                    <span className="text-slate-500">R$ {item.total.toFixed(2)}</span>
                  </div>
                ))}
              </div>

              {/* Informações Extras */}
              <div className="space-y-1 pt-2 border-t border-slate-100 dark:border-[#27272a]">
                {order.orderType === 'delivery' && order.deliveryAddress && (
                  <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-[#71717a]">
                    <MapPin className="w-3 h-3 shrink-0" />
                    <span className="truncate">
                      {[order.deliveryAddress.street, order.deliveryAddress.number, order.deliveryAddress.neighborhood].filter(Boolean).join(', ')}
                    </span>
                  </div>
                )}
                {order.customerWhatsapp && (
                  <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-[#71717a]">
                    <Phone className="w-3 h-3 shrink-0" />
                    <span>{order.customerWhatsapp}</span>
                  </div>
                )}
                {order.paymentMethod === 'cash' && order.changeAmount && order.changeAmount > 0 && (
                  <div className="flex items-center gap-2 text-[10px] text-amber-600 font-bold">
                    <Banknote className="w-3 h-3 shrink-0" />
                    <span>Troco para R$ {order.changeAmount.toFixed(2)}</span>
                  </div>
                )}
                {order.notes && (
                  <p className="text-[10px] text-slate-500 italic">📝 {order.notes}</p>
                )}
              </div>

              {/* Valor Total */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-[#27272a]">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Total</span>
                <div className="text-right">
                  <span className="text-sm font-bold text-slate-900 dark:text-white">R$ {order.total.toFixed(2)}</span>
                  {order.deliveryFee > 0 && (
                    <p className="text-[9px] text-slate-400">(frete: R$ {order.deliveryFee.toFixed(2)})</p>
                  )}
                </div>
              </div>

              {/* Ações */}
              <div className="pt-2">
                {getStatusActions(order)}
              </div>
            </div>
          );
        })}
      </div>

      {filteredOrders.length === 0 && (
        <div className="text-center py-12">
          <Truck className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-500 dark:text-[#71717a]">
            {filter === 'all' ? 'Nenhum pedido ativo no momento' : 'Nenhum pedido com este status'}
          </p>
        </div>
      )}
    </div>
  );
};
