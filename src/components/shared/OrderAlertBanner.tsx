import React, { useEffect, useState } from 'react';
import { storageService } from '../../services/storageService';
import { posAudio } from '../../services/audioService';
import { Sale, Table } from '../../types';

interface Props {
  onNavigate: (tab: string, tableId?: string) => void;
  tables: Table[];
}

export const OrderAlertBanner: React.FC<Props> = ({ onNavigate, tables }) => {
  const [pendingCount, setPendingCount] = useState(0);
  const [closingCount, setClosingCount] = useState(0);
  const [closingTable, setClosingTable] = useState<Table | null>(null);
  const [pendingTable, setPendingTable] = useState<Table | null>(null);
  const [closingSessionId, setClosingSessionId] = useState<string | null>(null);
  const [lastPending, setLastPending] = useState(0);
  const [lastClosing, setLastClosing] = useState(0);
  const [dismissedClosing, setDismissedClosing] = useState<Set<string>>(new Set());
  const [dismissedPending, setDismissedPending] = useState<Set<string>>(new Set());

  const refresh = () => {
    const sales = storageService.getSales().filter(s => s.orderSource === 'cardapio_digital' && s.kitchenStatus !== 'cancelled' && s.status !== 'cancelled' && s.status !== 'completed');
    const allPend = sales.filter(s => (s.kitchenStatus || 'pending') === 'pending');
    const pend = allPend.filter(s => !dismissedPending.has(s.id));
    const allClos = sales.filter(s => s.kitchenStatus === 'closing_request');
    const clos = allClos.filter(s => !dismissedClosing.has(s.customerSessionId || s.id));
    setPendingCount(pend.length);
    setClosingCount(clos.length);
    if (pend.length > 0) {
      const sale = pend[0];
      let t = tables.find(x => x.id === sale.tableId) || null;
      if (!t && sale.customerSessionId) {
        const sess = storageService.getCustomerSessions().find(x => x.id === sale.customerSessionId);
        if (sess) t = tables.find(x => x.id === sess.tableId) || null;
      }
      setPendingTable(t);
      if (pend.length > lastPending) {
        posAudio.chime();
        if (navigator.vibrate) navigator.vibrate(200);
      }
      setLastPending(pend.length);
    } else {
      setLastPending(0);
    }
    if (clos.length > 0) {
      const sale = clos[0];
      let t = tables.find(x => x.id === sale.tableId) || null;
      if (!t && sale.customerSessionId) {
        const sess = storageService.getCustomerSessions().find(x => x.id === sale.customerSessionId);
        if (sess) t = tables.find(x => x.id === sess.tableId) || null;
      }
      setClosingTable(t);
      setClosingSessionId(sale.customerSessionId || null);
      if (clos.length > lastClosing) {
        posAudio.chime();
        if (navigator.vibrate) navigator.vibrate(200);
      }
      setLastClosing(clos.length);
    } else {
      setClosingSessionId(null);
      setLastClosing(0);
    }
  };

  useEffect(() => {
    refresh();
    const unsub = storageService.subscribe(() => refresh());
    const iv = setInterval(refresh, 1000);
    return () => { unsub(); clearInterval(iv); };
  }, [tables]);

  if (pendingCount === 0 && closingCount === 0) return null;

  return (
    <div className="fixed top-14 left-1/2 -translate-x-1/2 z-40 flex flex-col gap-2 w-[95%] max-w-lg pointer-events-none">
      {pendingCount > 0 && (
        <div className="pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-amber-500 text-white shadow-lg border border-amber-600">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold">{pendingCount} pedido{pendingCount>1?'s':''} pendente{pendingCount>1?'s':''}{pendingTable ? ` • ${pendingTable.name}` : ''}</p>
            <p className="text-xs opacity-90">Toque para aceitar e ir para Pedidos</p>
          </div>
          <button onClick={() => {
            const firstPend = storageService.getSales().find(s => (s.kitchenStatus || 'pending') === 'pending' && s.orderSource === 'cardapio_digital' && !dismissedPending.has(s.id));
            if (firstPend) setDismissedPending(prev => new Set(prev).add(firstPend.id));
            setPendingCount(0);
            onNavigate('kds');
          }} className="px-3 py-1.5 rounded-lg bg-white text-amber-600 text-xs font-bold">Aceitar</button>
        </div>
      )}
      {closingCount > 0 && (
        <div className="pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-indigo-600 text-white shadow-lg border border-indigo-700">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold">Fechamento solicitado{closingTable ? ` • ${closingTable.name}` : ''}</p>
            <p className="text-xs opacity-90">{closingCount} comanda{closingCount>1?'s':''} aguardando pagamento</p>
          </div>
          <button onClick={() => {
            if (closingSessionId) setDismissedClosing(prev => new Set(prev).add(closingSessionId));
            setClosingCount(0);
            const detail: any = {};
            if (closingSessionId) detail.sessionId = closingSessionId;
            if (closingTable?.id) detail.tableId = closingTable.id;
            if (detail.sessionId || detail.tableId) window.dispatchEvent(new CustomEvent('hd:open-comanda', { detail }));
            onNavigate('comanda', closingTable?.id);
          }} className="px-3 py-1.5 rounded-lg bg-white text-indigo-600 text-xs font-bold">Ver Comanda</button>
        </div>
      )}
    </div>
  );
};