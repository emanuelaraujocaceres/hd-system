/**
 * DeliveryEarningsView - Tela de ganhos do colaborador do delivery
 */

import React, { useState, useEffect, useMemo } from 'react';
import { DollarSign, Truck, Calendar, TrendingUp } from 'lucide-react';
import { DeliveryOrder } from '../../types';
import { storageService } from '../../services/storageService';

interface DeliveryEarningsViewProps {
  user: any;
}

export const DeliveryEarningsView: React.FC<DeliveryEarningsViewProps> = ({ user }) => {
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [settings, setSettings] = useState<any>(null);

  useEffect(() => {
    loadData();
    const unsub = storageService.subscribe(loadData);
    return () => { unsub(); };
  }, []);

  const loadData = () => {
    const allOrders = storageService.getDeliveryOrders();
    const myOrders = allOrders.filter(o => o.deliveredBy === user.id);
    setOrders(myOrders);
    const s = storageService.getDeliverySettings();
    setSettings(s);
  };

  const todayOrders = useMemo(() => {
    const today = new Date().toDateString();
    return orders.filter(o => o.status === 'delivered' && new Date(o.deliveredAt || o.createdAt).toDateString() === today);
  }, [orders]);

  const weekOrders = useMemo(() => {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return orders.filter(o => o.status === 'delivered' && new Date(o.deliveredAt || o.createdAt) >= weekAgo);
  }, [orders]);

  const monthOrders = useMemo(() => {
    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    return orders.filter(o => o.status === 'delivered' && new Date(o.deliveredAt || o.createdAt) >= monthAgo);
  }, [orders]);

  const feePercent = settings?.deliveryWorkerFeePercent ?? 100;
  const todayEarnings = todayOrders.reduce((acc, o) => acc + (o.deliveryFee * feePercent / 100), 0);
  const weekEarnings = weekOrders.reduce((acc, o) => acc + (o.deliveryFee * feePercent / 100), 0);
  const monthEarnings = monthOrders.reduce((acc, o) => acc + (o.deliveryFee * feePercent / 100), 0);

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      <div>
        <h2 className="font-serif-italic text-2xl font-light tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
          💰 Meus Ganhos
        </h2>
        <p className="text-xs text-slate-500 dark:text-[#a1a1aa] mt-1">
          Acompanhe seus ganhos com as entregas ({feePercent}% da taxa)
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-5 h-5" />
            <span className="text-xs font-bold opacity-80">Hoje</span>
          </div>
          <p className="text-2xl font-bold">R$ {todayEarnings.toFixed(2)}</p>
          <p className="text-xs opacity-80 mt-1">{todayOrders.length} entregas</p>
        </div>
        
        <div className="p-4 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a]">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-5 h-5 text-blue-500" />
            <span className="text-xs font-bold text-slate-500">Semana</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">R$ {weekEarnings.toFixed(2)}</p>
          <p className="text-xs text-slate-500 mt-1">{weekOrders.length} entregas</p>
        </div>
        
        <div className="p-4 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a]">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-emerald-500" />
            <span className="text-xs font-bold text-slate-500">Mês</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">R$ {monthEarnings.toFixed(2)}</p>
          <p className="text-xs text-slate-500 mt-1">{monthOrders.length} entregas</p>
        </div>
        
        <div className="p-4 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a]">
          <div className="flex items-center gap-2 mb-2">
            <Truck className="w-5 h-5 text-violet-500" />
            <span className="text-xs font-bold text-slate-500">Total</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{orders.filter(o => o.status === 'delivered').length}</p>
          <p className="text-xs text-slate-500 mt-1">entregas</p>
        </div>
      </div>

      {settings?.deliveryWorkerPayType === 'daily' && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30">
          <p className="text-xs text-amber-700 dark:text-amber-300">
            <strong>Tipo de pagamento:</strong> Diária (R$ {settings?.deliveryWorkerDailyPay?.toFixed(2) || '0.00'}/dia) + {feePercent}% das taxas de entrega
          </p>
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Histórico de Entregas</h3>
        {todayOrders.length === 0 ? (
          <p className="text-xs text-slate-500">Nenhuma entrega hoje</p>
        ) : (
          todayOrders.map((order) => (
            <div key={order.id} className="p-3 rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white">#{order.orderNumber} - {order.customerName}</p>
                <p className="text-[10px] text-slate-500">{new Date(order.deliveredAt || order.createdAt).toLocaleTimeString('pt-BR')}</p>
              </div>
              <span className="text-xs font-bold text-emerald-600">+R$ {(order.deliveryFee * feePercent / 100).toFixed(2)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
