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
   * AUTO-ECO SUPRIMIDO (vendas PDV deste dispositivo):
   * Supabase Realtime devolve a INSERT que o próprio PDV gravou para volta
   * neste mesmo dispositivo. Como o PDV já tocou o chime + toast na confirmação
   * local, o eco NÃO deve notificar de novo (senão 1 venda = 2 chimes = 8 bips).
   * O sinal confiável é o `code` (VEN-...), estável entre local e remote —
   * o `id` muda (sale-... → UUID cloud), por isso o dedupe por id falha.
   * PaymentModal.markLocalSale(code) registra; handleRemoteChange consome.
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
    storageService.subscribe((key, source, payload) => {
      if (key && source === 'remote') this.handleRemoteChange(key, payload);
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
   *
   * O `payload` é o registro REAL que chegou (passado pelo storageService
   * notify). Usar getSales()[0] é frágil: quando a venda já existia e foi
   * substituída no lugar (exists=true), [0] é outra venda → notificação
   * sobre o item errado ou pulada. O payload garante o item correto +
   * dedupe correta por id.
   */
  private handleRemoteChange(key: string, payload?: any) {
    if (key.includes('SALES')) {
      const latestSale = payload;
      if (!this.isInCurrentBranch(latestSale)) return;
      // Suprime eco da venda feita LOCALMENTE neste dispositivo: o PDV já
      // tocou o chime + toast na confirmação. O `code` (VEN-...) é estável
      // entre o caminho local e o eco remoto; o `id` muda
      // (sale-... → UUID cloud), por isso não basta o dedupe por id.
      if (latestSale?.code && this.isLocalEcho(latestSale.code)) {
        console.log(`[HD-Notif] ⏭️ Eco local suprimido: venda ${latestSale?.id} (code ${latestSale?.code})`);
        return;
      }
      // Dedupe: o App.tsx re-executa updateSaleFromRemote quando o
      // sale_items chega (mesma venda) → 1 venda = 1 notificação.
      if (this.wasNotified('sale', latestSale?.id)) {
        console.log(`[HD-Notif] ⏭️ Venda ${latestSale?.id} já notificada nos últimos 10s — ignorada`);
        return;
      }
      console.log(`[HD-Notif] 🛎️ Notificando venda remota ${latestSale?.id} (total R$${latestSale?.total})`);
      const method = latestSale?.payments?.[0]?.method || 'cash';
      this.notifySale(latestSale?.total || 0, method, latestSale?.customerName);
    } else if (key.includes('DELIVERY')) {
      const latestOrder = payload;
      if (!this.isInCurrentBranch(latestOrder)) return;
      if (this.wasNotified('delivery', latestOrder?.id)) return;
      this.notifyDelivery(latestOrder?.orderNumber || '#?', latestOrder?.customerName || 'Cliente', latestOrder?.total || 0);
    } else if (key.includes('CREDIT_PAYMENTS')) {
      const latestPayment = payload;
      if (!this.isInCurrentBranch(latestPayment)) return;
      // Suprime eco do pagamento de fiado feito LOCALMENTE neste dispositivo:
      // o FiadosView já tocou o chime + toast na confirmação; o INSERT que o
      // Realtime devolve geraria bip/toast duplicado.
      if (this.isLocalCreditEcho(latestPayment?.customerName, latestPayment?.amount)) return;
      if (this.wasNotified('credit', latestPayment?.id)) return;
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

  /**
   * Eco local de venda PDV: registra o `code` (VEN-...) de uma venda concluída
   * neste dispositivo para suprimir o eco que o Supabase Realtime devolve.
   * O `code` é o mesmo em local e remote; o `id` muda (sale-... → UUID cloud).
   */
  private localSaleCodes: { code: string; at: number }[] = [];
  markLocalSale(code: string) {
    if (!code) return;
    const now = Date.now();
    this.localSaleCodes = this.localSaleCodes.filter((x) => now - x.at < 1800000);
    this.localSaleCodes.push({ code, at: now });
  }
  private isLocalEcho(code: string): boolean {
    const now = Date.now();
    this.localSaleCodes = this.localSaleCodes.filter((x) => now - x.at < 1800000);
    const idx = this.localSaleCodes.findIndex((x) => x.code === code);
    if (idx >= 0) {
      this.localSaleCodes.splice(idx, 1); // consome: cada eco só suprime uma vez
      return true;
    }
    return false;
  }

  /**
   * Eco local de pagamento de fiado: registra (cliente, valor) de um pagamento
   * concluído neste dispositivo para suprimir o INSERT que o Realtime devolve.
   * Chave estável entre local e remoto (o id muda de credit-... → UUID cloud,
   * então usa cliente+valor, únicos o suficiente na janela de 10s).
   */
  private localCreditKeys: { key: string; at: number }[] = [];
  markLocalCreditPayment(customerName: string, amount: number) {
    if (!customerName) return;
    const key = `${customerName}|${amount}`;
    const now = Date.now();
    this.localCreditKeys = this.localCreditKeys.filter((x) => now - x.at < 120000);
    this.localCreditKeys.push({ key, at: now });
  }
  private isLocalCreditEcho(customerName: string, amount: number): boolean {
    if (!customerName) return false;
    const key = `${customerName}|${amount}`;
    const now = Date.now();
    this.localCreditKeys = this.localCreditKeys.filter((x) => now - x.at < 120000);
    const idx = this.localCreditKeys.findIndex((x) => x.key === key);
    if (idx >= 0) {
      this.localCreditKeys.splice(idx, 1);
      return true;
    }
    return false;
  }

  /**
   * Isolamento ESTRITO por organização + filial (defesa-em-profundidade).
   * - Org: se o item tem organizationId e ele difere da org em foco, BLOQUEIA.
   *   (superadmin "vendo" uma org específica também fica limitado a ela)
   * - Filial: só libera se o item pertence à filial selecionada. Código curto
   *   ("br-01") é resolvido para UUID antes de comparar, espelhando o filtro do
   *   App.tsx. Sem filial selecionada (ou superadmin global), libera.
   * Uma notificação JAMAIS vaza para outra filial ou outra organização.
   */
  private isInCurrentBranch(item: any): boolean {
    if (!item) return false;

    // Superadmin global (sem override de org) vê e notifica TUDO.
    if (storageService.isSuperAdmin() && !storageService.getSuperadminViewingOrg()) return true;

    // ── Org isolation ──
    // IMPORTANTE: resolve a org A PARTIR DA FILIAL (igual ao getSales), não do
    // organizationId do próprio registro. O cardápio digital marca a venda com o
    // organization_id da MESA (que pode estar DEFAULT_ORG_ID por inconsistência de
    // dados), mas a filial (store_branch_id) pertence à org real do operador.
    // getSales mostra a venda pela filial; se comparássemos o organizationId do
    // registro, a notificação seria silenciosamente suprimida (venda visível,
    // sem bip/toast). Espelhar o getSales garante consistência.
    const currentOrgId = storageService.getCurrentOrgId();
    const viewingOrg = storageService.getSuperadminViewingOrg() || currentOrgId;
    if (viewingOrg) {
      let itemOrg = item.organizationId;
      if (item.storeBranchId) {
        const branch = storageService.getBranches().find((b) => b.id === item.storeBranchId);
        if (branch?.organizationId) itemOrg = branch.organizationId;
      }
      if (itemOrg && itemOrg !== viewingOrg) return false;
    }

    // ── Branch isolation (resolve short code → UUID) ──
    const rawBranch = storageService.getRawBranchId();
    if (rawBranch) {
      let resolved = rawBranch;
      if (!storageService.isUuid(rawBranch)) {
        const branches = storageService.getBranches();
        const matched = branches.find((b) => b.id === rawBranch || b.code === rawBranch);
        if (matched) resolved = matched.id;
      }
      if (item.storeBranchId && item.storeBranchId !== resolved) return false;
    }

    return true;
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
      } as NotificationOptions & { vibrate?: number[] });
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
