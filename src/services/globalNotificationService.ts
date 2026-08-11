/**
 * GlobalNotificationService - Sistema de notificações global
 * 
 * Detecta mudanças e mostra:
 * 1. Toast notifications (dentro do app)
 * 2. Browser notifications (quando a aba não está focada)
 * 
 * REGRAS DE NEGÓCIO (simplificadas em 2026-08):
 * - Ações LOCAIS (do usuário neste dispositivo) NÃO notificam aqui:
 *   os próprios componentes chamam notifySale()/notifyProduct()/etc.
 *   com o nome do item — notificar de novo aqui geraria toast duplicado.
 * - Apenas mudanças REMOTE (real-time de outro dispositivo) geram toast,
 *   com o nome real do item (venda, pedido, produto, cliente, fiado...).
 * - sync/hydração do cloud NUNCA geram notificação.
 * - Filtrado por filial: usuários só veem notificações da sua filial.
 * - Superadmin (sem filial selecionada) vê todas as filiais.
 * 
 * SEM polling: a fonte da verdade é o listener do storageService, que
 * agora entrega (key, source). O polling de 2s era redundante e causava
 * notificações duplicadas + falsos positivos.
 */

import { storageService } from '../services/storageService';
import { posAudio } from '../services/audioService';

type NotificationType = 'success' | 'error' | 'warning' | 'info';

interface NotificationEvent {
  type: NotificationType;
  title: string;
  message: string;
  playSound?: boolean;
}

type NotificationListener = (event: NotificationEvent) => void;

class GlobalNotificationServiceClass {
  private listeners: Set<NotificationListener> = new Set();
  private notificationPermission: NotificationPermission = 'default';
  private isSupported: boolean = false;
  /**
   * Dedupe: o mesmo registro realtime chega várias vezes por venda
   * (INSERT em sales + re-fetch do sale_items no App.tsx + UPDATEs).
   * Sem isso, 1 venda = 2-3 chimes (8-12 bips) + toasts duplicados.
   */
  private recentNotified: { kind: string; id: string; at: number }[] = [];

  constructor() {
    this.checkNotificationSupport();
    this.initRealtimeListener();
  }

  private checkNotificationSupport() {
    if ('Notification' in window) {
      this.isSupported = true;
      this.notificationPermission = Notification.permission;
    }
  }

  async requestPermission(): Promise<boolean> {
    if (!this.isSupported) return false;
    try {
      const result = await Notification.requestPermission();
      this.notificationPermission = result;
      return result === 'granted';
    } catch {
      return false;
    }
  }

  private initRealtimeListener() {
    // storageService.notify() agora entrega (key, source):
    // - key: qual coleção mudou (KEYS.*) — undefined para mudanças sem interesse
    // - source: 'local' | 'sync' | 'hydration' | 'remote'
    // Apenas 'remote' notifica. 'local' já foi notificado pelos componentes
    // com o nome do item; 'sync'/'hydration' nunca notificam.
    storageService.subscribe((key, source) => {
      if (key && source === 'remote') this.handleRemoteChange(key);
    });
  }

  /**
   * Uma mudança veio de OUTRO dispositivo (real-time). Mostra uma
   * notificação única, com o nome real do item, filtrada por filial.
   * 
   * Só notifica o que o operador precisa SABER imediatamente:
   * venda, delivery e pagamento de fiado. Produtos/estoque/clientes
   * NÃO notificam: toda venda remota gera UPDATE em produtos e
   * movimentos — seria uma enxurrada de toasts a cada venda.
   */
  private handleRemoteChange(key: string) {
    if (key.includes('SALES')) {
      const latestSale = storageService.getSales()[0];
      if (!this.isInCurrentBranch(latestSale)) return;
      // Dedupe: o App.tsx re-executa updateSaleFromRemote quando o
      // sale_items chega (mesma venda) → 1 venda = 1 notificação.
      if (this.wasNotified('sale', latestSale.id)) return;
      const method = latestSale?.payments?.[0]?.method || 'cash';
      this.notifySale(latestSale?.total || 0, method, latestSale?.customerName);
    } else if (key.includes('DELIVERY')) {
      const latestOrder = this.newestByUpdatedAt(storageService.getDeliveryOrders());
      if (!this.isInCurrentBranch(latestOrder)) return;
      if (this.wasNotified('delivery', latestOrder.id)) return;
      this.notifyDelivery(latestOrder?.orderNumber || '#?', latestOrder?.customerName || 'Cliente', latestOrder?.total || 0);
    } else if (key.includes('CREDIT_PAYMENTS')) {
      const latestPayment = this.newestByDate(storageService.getCreditPayments());
      if (!this.isInCurrentBranch(latestPayment)) return;
      if (this.wasNotified('credit', latestPayment.id)) return;
      this.notifyFiado(latestPayment?.customerName || 'Cliente', latestPayment?.amount || 0, 'payment');
    }
    // PRODUCTS / MOVEMENTS / CUSTOMERS remotos: silenciosos (ruído de venda)
  }

  /**
   * True se (kind, id) já notificou nos últimos 10s. Marca como notificado.
   */
  private wasNotified(kind: string, id: string): boolean {
    const now = Date.now();
    this.recentNotified = this.recentNotified.filter((x) => now - x.at < 10000);
    if (this.recentNotified.some((x) => x.kind === kind && x.id === id)) return true;
    this.recentNotified.push({ kind, id, at: now });
    return false;
  }

  /** Item mais recentemente atualizado (atualizações preservam posição no array) */
  private newestByUpdatedAt<T extends { updatedAt?: string }>(items: T[]): T | undefined {
    return [...items].sort((a, b) => (new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()))[0];
  }

  private newestByDate<T extends { date?: string }>(items: T[]): T | undefined {
    return [...items].sort((a, b) => (new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()))[0];
  }

  /** Filtro por filial: superadmin sem filial selecionada vê todas */
  private isInCurrentBranch(item: any): boolean {
    if (!item) return false;
    const currentBranchId = storageService.getSelectedBranchId();
    if (!currentBranchId) return true;
    return item.storeBranchId === currentBranchId;
  }

  subscribe(listener: NotificationListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(event: NotificationEvent) {
    this.listeners.forEach((listener) => listener(event));
    if (document.hidden) this.showBrowserNotification(event);
    if (event.playSound) posAudio.chime();
  }

  private showBrowserNotification(event: NotificationEvent) {
    if (!this.isSupported || this.notificationPermission !== 'granted') return;
    try {
      const notification = new Notification(event.title, {
        body: event.message,
        icon: '/logo-hd-system/android-chrome-192x192.png',
        tag: `hdsystem-${Date.now()}`,
        requireInteraction: false,
        vibrate: [200, 100, 200],
      });
      notification.onclick = () => { window.focus(); notification.close(); };
      setTimeout(() => notification.close(), 5000);
    } catch { /* ignore */ }
  }

  notifySale(amount: number, paymentMethod: string, customerName?: string) {
    const methodLabels: Record<string, string> = {
      cash: 'Dinheiro', pix: 'PIX', credit_card: 'Cartão de Crédito',
      debit_card: 'Cartão de Débito', credit_account: 'Fiado',
    };
    const customer = customerName ? `${customerName} - ` : '';
    this.notify({
      type: 'success', title: '💰 Venda Realizada!',
      message: `${customer}R$ ${amount.toFixed(2)} - ${methodLabels[paymentMethod] || paymentMethod}`,
      playSound: true,
    });
  }

  notifyDelivery(orderNumber: string, customerName: string, total: number) {
    this.notify({
      type: 'info', title: '🛵 Novo Pedido Delivery!',
      message: `#${orderNumber} - ${customerName} - R$ ${total.toFixed(2)}`,
      playSound: true,
    });
  }

  notifyFiado(customerName: string, amount: number, action: 'new' | 'payment') {
    if (action === 'new') {
      this.notify({ type: 'warning', title: '📋 Novo Fiado', message: `${customerName} - R$ ${amount.toFixed(2)}`, playSound: true });
    } else {
      this.notify({ type: 'success', title: '💳 Fiado Pago!', message: `${customerName} - R$ ${amount.toFixed(2)}`, playSound: true });
    }
  }

  notifyProduct(action: 'created' | 'updated' | 'deleted', productName: string) {
    const actions = {
      created: { title: '✅ Produto Criado', type: 'success' as NotificationType },
      updated: { title: '✏️ Produto Atualizado', type: 'info' as NotificationType },
      deleted: { title: '🗑️ Produto Excluído', type: 'warning' as NotificationType },
    };
    const config = actions[action];
    this.notify({ type: config.type, title: config.title, message: productName, playSound: false });
  }

  notifyStockLow(productName: string, currentStock: number) {
    this.notify({ type: 'warning', title: '⚠️ Estoque Baixo!', message: `${productName}: ${currentStock} unidades restantes`, playSound: true });
  }

  notifyStockAdded(productName: string, quantity: number) {
    this.notify({ type: 'success', title: '📦 Entrada de Estoque', message: `${productName}: +${quantity} unidades`, playSound: false });
  }

  notifyCustomer(action: 'created' | 'updated', customerName: string) {
    this.notify({ type: 'info', title: action === 'created' ? '👤 Novo Cliente' : '✏️ Cliente Atualizado', message: customerName, playSound: false });
  }

  getPermissionStatus(): { supported: boolean; permission: NotificationPermission } {
    return { supported: this.isSupported, permission: this.notificationPermission };
  }
}

export const globalNotificationService = new GlobalNotificationServiceClass();
