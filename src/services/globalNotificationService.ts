/**
 * GlobalNotificationService - Sistema de notificações global
 * 
 * Detecta todas as ações do aplicativo e mostra:
 * 1. Toast notifications (dentro do app)
 * 2. Browser notifications (quando a aba não está focada)
 * 
 * Eventos monitorados:
 * - Vendas (nova venda, venda cancelada)
 * - Delivery (novo pedido, status alterado)
 * - Estoque (produto adicionado, estoque baixo)
 * - Fiados (novo fiado, pagamento recebido)
 * - Produtos (criado, atualizado, excluído)
 * - Realtime (mudanças de outros dispositivos)
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

  /**
   * Check if browser notifications are supported
   */
  private checkNotificationSupport() {
    if ('Notification' in window) {
      this.isSupported = true;
      this.notificationPermission = Notification.permission;
    }
  }

  /**
   * Request notification permission from user
   */
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

  /**
   * Listen to Realtime changes from Supabase (other devices)
   */
  private initRealtimeListener() {
    // Monitor storage changes (triggered by realtime sync)
    storageService.subscribe((key) => {
      this.handleStorageChange(key);
    });
  }

  /**
   * Listen to localStorage changes (cross-tab communication)
   */
  private initStorageListener() {
    window.addEventListener('storage', (e) => {
      if (e.key?.startsWith('hd_system_')) {
        this.handleStorageChange(e.key);
      }
    });
  }

  /**
   * Handle storage changes and emit appropriate notifications
   */
  private handleStorageChange(key: string) {
    // Avoid duplicate notifications for same change
    const now = Date.now();
    const lastTime = this.lastCounts[key] || 0;
    if (now - lastTime < 1000) return; // Debounce 1s
    this.lastCounts[key] = now;

    // Determine event type based on key
    if (key.includes('SALES')) {
      this.notify({
        type: 'success',
        title: '💰 Nova Venda',
        message: 'Uma nova venda foi registrada',
        playSound: true,
      });
    } else if (key.includes('DELIVERY')) {
      this.notify({
        type: 'info',
        title: '🛵 Delivery',
        message: 'Pedido de delivery atualizado',
        playSound: true,
      });
    } else if (key.includes('PRODUCTS')) {
      this.notify({
        type: 'info',
        title: '📦 Produto',
        message: 'Produto atualizado',
        playSound: false,
      });
    } else if (key.includes('CREDIT_PAYMENTS') || key.includes('FIADO')) {
      this.notify({
        type: 'success',
        title: '💳 Fiado',
        message: 'Pagamento de fiado registrado',
        playSound: true,
      });
    } else if (key.includes('STOCK') || key.includes('MOVEMENTS')) {
      this.notify({
        type: 'warning',
        title: '📊 Estoque',
        message: 'Estoque atualizado',
        playSound: false,
      });
    } else if (key.includes('CUSTOMERS')) {
      this.notify({
        type: 'info',
        title: '👥 Cliente',
        message: 'Dados de cliente atualizado',
        playSound: false,
      });
    }
  }

  /**
   * Subscribe to notification events
   */
  subscribe(listener: NotificationListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Emit notification to all listeners
   */
  notify(event: NotificationEvent) {
    // Notify all listeners (toast system)
    this.listeners.forEach((listener) => listener(event));

    // Show browser notification if tab is not focused
    if (document.hidden) {
      this.showBrowserNotification(event);
    }

    // Play sound if requested
    if (event.playSound) {
      posAudio.chime();
    }
  }

  /**
   * Show browser push notification
   */
  private showBrowserNotification(event: NotificationEvent) {
    if (!this.isSupported || this.notificationPermission !== 'granted') return;

    try {
      const notification = new Notification(event.title, {
        body: event.message,
        icon: '/logo-hd-system/android-chrome-192x192.png',
        badge: '/logo-hd-system/android-chrome-96x96.png',
        tag: `hdsystem-${Date.now()}`,
        requireInteraction: false,
        vibrate: [200, 100, 200],
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      // Auto-close after 5 seconds
      setTimeout(() => notification.close(), 5000);
    } catch {
      // Ignore notification errors
    }
  }

  /**
   * Manual notification triggers (for explicit actions)
   */
  notifySale(amount: number, paymentMethod: string) {
    const methodLabels: Record<string, string> = {
      cash: 'Dinheiro',
      pix: 'PIX',
      credit_card: 'Cartão de Crédito',
      debit_card: 'Cartão de Débito',
      credit_account: 'Fiado',
    };
    this.notify({
      type: 'success',
      title: '💰 Venda Realizada!',
      message: `R$ ${amount.toFixed(2)} - ${methodLabels[paymentMethod] || paymentMethod}`,
      playSound: true,
    });
  }

  notifyDelivery(orderNumber: string, customerName: string, total: number) {
    this.notify({
      type: 'info',
      title: '🛵 Novo Pedido Delivery!',
      message: `#${orderNumber} - ${customerName} - R$ ${total.toFixed(2)}`,
      playSound: true,
    });
  }

  notifyFiado(customerName: string, amount: number, action: 'new' | 'payment') {
    if (action === 'new') {
      this.notify({
        type: 'warning',
        title: '📋 Novo Fiado',
        message: `${customerName} - R$ ${amount.toFixed(2)}`,
        playSound: true,
      });
    } else {
      this.notify({
        type: 'success',
        title: '💳 Fiado Pago!',
        message: `${customerName} - R$ ${amount.toFixed(2)}`,
        playSound: true,
      });
    }
  }

  notifyProduct(action: 'created' | 'updated' | 'deleted', productName: string) {
    const actions = {
      created: { title: '✅ Produto Criado', type: 'success' as NotificationType },
      updated: { title: '✏️ Produto Atualizado', type: 'info' as NotificationType },
      deleted: { title: '🗑️ Produto Excluído', type: 'warning' as NotificationType },
    };
    const config = actions[action];
    this.notify({
      type: config.type,
      title: config.title,
      message: productName,
      playSound: false,
    });
  }

  notifyStockLow(productName: string, currentStock: number) {
    this.notify({
      type: 'warning',
      title: '⚠️ Estoque Baixo!',
      message: `${productName}: ${currentStock} unidades restantes`,
      playSound: true,
    });
  }

  notifyStockAdded(productName: string, quantity: number) {
    this.notify({
      type: 'success',
      title: '📦 Entrada de Estoque',
      message: `${productName}: +${quantity} unidades`,
      playSound: false,
    });
  }

  notifyCustomer(action: 'created' | 'updated', customerName: string) {
    this.notify({
      type: 'info',
      title: action === 'created' ? '👤 Novo Cliente' : '✏️ Cliente Atualizado',
      message: customerName,
      playSound: false,
    });
  }

  /**
   * Get notification permission status
   */
  getPermissionStatus(): { supported: boolean; permission: NotificationPermission } {
    return {
      supported: this.isSupported,
      permission: this.notificationPermission,
    };
  }
}

// Singleton instance
export const globalNotificationService = new GlobalNotificationServiceClass();
