/**
 * GlobalNotificationService - Sistema de notificações global
 * 
 * Detecta todas as ações do aplicativo e mostra:
 * 1. Toast notifications (dentro do app)
 * 2. Browser notifications (quando a aba não está focada)
 * 
 * REGRAS DE NEGÓCIO:
 * - Notificações apenas para ações LOCAL (do usuário) ou REMOTE (real-time de outros dispositivos)
 * - NÃO dispara para sync/hydração do cloud
 * - Filtrado por filial: usuários só veem notificações da sua filial
 * - Superadmin (sem filial selecionada) vê todas as filiais
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
  private lastCounts: Record<string, number> = {};

  constructor() {
    this.checkNotificationSupport();
    this.initRealtimeListener();
    this.initStorageListener();
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
    storageService.subscribe((key) => {
      if (key) this.handleStorageChange(key);
    });
    this.startPolling();
  }

  /**
   * Poll for changes - only triggers for local/remote actions
   */
  private startPolling() {
    let lastCounts: Record<string, number> = {
      products: storageService.getProducts().length,
      sales: storageService.getSales().length,
      customers: storageService.getCustomers().length,
      stockMovements: storageService.getMovements().length,
      creditPayments: storageService.getCreditPayments().length,
      deliveryOrders: storageService.getDeliveryOrders().length,
    };

    setInterval(() => {
      const source = storageService.getChangeSource();
      // Skip sync/hydration - no notifications
      if (source === 'sync' || source === 'hydration') {
        lastCounts = {
          products: storageService.getProducts().length,
          sales: storageService.getSales().length,
          customers: storageService.getCustomers().length,
          stockMovements: storageService.getMovements().length,
          creditPayments: storageService.getCreditPayments().length,
          deliveryOrders: storageService.getDeliveryOrders().length,
        };
        return;
      }

      const currentCounts = {
        products: storageService.getProducts().length,
        sales: storageService.getSales().length,
        customers: storageService.getCustomers().length,
        stockMovements: storageService.getMovements().length,
        creditPayments: storageService.getCreditPayments().length,
        deliveryOrders: storageService.getDeliveryOrders().length,
      };

      if (currentCounts.products > lastCounts.products) {
        this.notify({ type: 'success', title: '📦 Novo Produto', message: 'Um novo produto foi adicionado', playSound: true });
      } else if (currentCounts.products < lastCounts.products) {
        this.notify({ type: 'warning', title: '🗑️ Produto Removido', message: 'Um produto foi removido', playSound: false });
      }

      if (currentCounts.sales > lastCounts.sales) {
        const latestSale = storageService.getSales()[0];
        if (this.isSaleInCurrentBranch(latestSale)) {
          const method = latestSale?.payments?.[0]?.method || 'cash';
          this.notifySale(latestSale?.total || 0, method);
        }
      }

      if (currentCounts.customers > lastCounts.customers) {
        this.notify({ type: 'info', title: '👤 Novo Cliente', message: 'Um novo cliente foi cadastrado', playSound: true });
      }

      if (currentCounts.stockMovements > lastCounts.stockMovements) {
        this.notify({ type: 'info', title: '📊 Estoque Atualizado', message: 'Movimentação de estoque detectada', playSound: false });
      }

      if (currentCounts.creditPayments > lastCounts.creditPayments) {
        this.notify({ type: 'success', title: '💳 Pagamento Recebido', message: 'Um pagamento de fiado foi registrado', playSound: true });
      }

      if (currentCounts.deliveryOrders > lastCounts.deliveryOrders) {
        const latestOrder = storageService.getDeliveryOrders()[0];
        if (this.isDeliveryInCurrentBranch(latestOrder)) {
          this.notifyDelivery(latestOrder?.orderNumber || '#?', latestOrder?.customerName || 'Cliente', latestOrder?.total || 0);
        }
      }

      lastCounts = currentCounts;
    }, 2000);
  }

  private isSaleInCurrentBranch(sale: any): boolean {
    if (!sale) return false;
    const currentBranchId = storageService.getSelectedBranchId();
    if (!currentBranchId) return true; // Superadmin sees all
    return sale.storeBranchId === currentBranchId;
  }

  private isDeliveryInCurrentBranch(order: any): boolean {
    if (!order) return false;
    const currentBranchId = storageService.getSelectedBranchId();
    if (!currentBranchId) return true; // Superadmin sees all
    return order.storeBranchId === currentBranchId;
  }

  private initStorageListener() {
    window.addEventListener('storage', (e) => {
      if (e.key?.startsWith('hd_system_')) {
        this.handleStorageChange(e.key);
      }
    });
  }

  private handleStorageChange(key: string) {
    const source = storageService.getChangeSource();
    if (source === 'sync' || source === 'hydration') return;

    const now = Date.now();
    const lastTime = this.lastCounts[key] || 0;
    if (now - lastTime < 1000) return;
    this.lastCounts[key] = now;

    if (key.includes('SALES')) {
      const latestSale = storageService.getSales()[0];
      if (this.isSaleInCurrentBranch(latestSale)) {
        this.notify({ type: 'success', title: '💰 Nova Venda', message: 'Uma nova venda foi registrada', playSound: true });
      }
    } else if (key.includes('DELIVERY')) {
      const latestOrder = storageService.getDeliveryOrders()[0];
      if (this.isDeliveryInCurrentBranch(latestOrder)) {
        this.notify({ type: 'info', title: '🛵 Delivery', message: 'Pedido de delivery atualizado', playSound: true });
      }
    } else if (key.includes('PRODUCTS')) {
      this.notify({ type: 'info', title: '📦 Produto', message: 'Produto atualizado', playSound: false });
    } else if (key.includes('CREDIT_PAYMENTS') || key.includes('FIADO')) {
      this.notify({ type: 'success', title: '💳 Fiado', message: 'Pagamento de fiado registrado', playSound: true });
    } else if (key.includes('STOCK') || key.includes('MOVEMENTS')) {
      this.notify({ type: 'warning', title: '📊 Estoque', message: 'Estoque atualizado', playSound: false });
    } else if (key.includes('CUSTOMERS')) {
      this.notify({ type: 'info', title: '👥 Cliente', message: 'Dados de cliente atualizado', playSound: false });
    }
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

  notifySale(amount: number, paymentMethod: string) {
    const methodLabels: Record<string, string> = {
      cash: 'Dinheiro', pix: 'PIX', credit_card: 'Cartão de Crédito',
      debit_card: 'Cartão de Débito', credit_account: 'Fiado',
    };
    this.notify({
      type: 'success', title: '💰 Venda Realizada!',
      message: `R$ ${amount.toFixed(2)} - ${methodLabels[paymentMethod] || paymentMethod}`,
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
