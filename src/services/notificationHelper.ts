/**
 * Helper de notificações do navegador.
 *
 * No mobile Chrome (e outros navegadores baseados em Chromium no Android),
 * `new Notification()` é ILEGAL e lança:
 *   "Failed to construct 'Notification': Illegal constructor.
 *    Use ServiceWorkerRegistration.showNotification() instead."
 *
 * Por isso priorizamos o Service Worker (`navigator.serviceWorker.ready` →
 * `reg.showNotification()`), que é a única via legal no mobile. O app já
 * registra `public/sw.js` em produção (ver src/main.tsx).
 *
 * O fallback para o construtor `new Notification()` fica envolvido em
 * try/catch e só é usado em navegadores desktop onde é permitido.
 */

export interface ShowNotificationOptions extends NotificationOptions {
  /** Padrão de vibração (Ignored pelo construtor desktop, útil no SW). */
  vibrate?: number[];
  /** Tag para agrupar/substituir notificações repetidas. */
  tag?: string;
}

const DEFAULT_ICON = '/logo-hd-system/android-chrome-192x192.png';

/**
 * Mostra uma notificação usando o Service Worker quando disponível.
 *
 * @returns A instância `Notification` se o caminho do construtor foi usado
 *          (desktop), ou `null` se o SW assumiu (mobile/Chromium). Com SW, o
 *          clique é tratado em `public/sw.js` (evento `notificationclick`).
 */
export async function showSystemNotification(
  title: string,
  options: ShowNotificationOptions = {}
): Promise<Notification | null> {
  const opts: ShowNotificationOptions = {
    icon: DEFAULT_ICON,
    ...options,
  };

  // 1) Via Service Worker — única legal no mobile Chrome.
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, opts);
      return null;
    } catch {
      // SW não pronto ou falhou — cai no fallback do construtor.
    }
  }

  // 2) Fallback: construtor (desktop). Sempre protegido por try/catch.
  if ('Notification' in window) {
    try {
      return new Notification(title, opts);
    } catch {
      // Mobile Chrome sem SW: construtor é ilegal — ignora silenciosamente.
    }
  }

  return null;
}
