/**
 * useDeliveryNotifications - Hook para notificações push de novos pedidos
 * 
 * Funcionalidades:
 * - Solicita permissão de notificação ao usuário
 * - Escuta novos pedidos via Realtime do Supabase (filtrado por org + branch)
 * - Re-subscribe automaticamente quando o usuário troca de filial
 * - Mostra notificação push quando chega novo pedido
 * - Emite som de alerta (opcional)
 */

import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { storageService } from '../services/storageService';

interface UseDeliveryNotificationsProps {
  enabled: boolean;
  onNewPedido?: (pedido: any) => void;
}

export const useDeliveryNotifications = ({ enabled, onNewPedido }: UseDeliveryNotificationsProps) => {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSupported, setIsSupported] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Track current branch to detect changes and trigger re-subscribe
  const [currentBranchKey, setCurrentBranchKey] = useState<string>(() => {
    return `${storageService.getCurrentOrgId() || ''}:${storageService.getSelectedBranchId() || ''}`;
  });
  // Ref for onNewPedido to avoid stale closure in Realtime callback
  const onNewPedidoRef = useRef(onNewPedido);
  onNewPedidoRef.current = onNewPedido;

  useEffect(() => {
    // Verificar suporte a notificações
    if ('Notification' in window) {
      setIsSupported(true);
      setPermission(Notification.permission);
    }

    // Criar elemento de áudio para alerta
    audioRef.current = new Audio('/notification-sound.mp3');
    audioRef.current.volume = 0.5;
  }, []);

  // Listen for storage changes to detect branch switch
  useEffect(() => {
    const unsubscribe = storageService.subscribe(() => {
      const newKey = `${storageService.getCurrentOrgId() || ''}:${storageService.getSelectedBranchId() || ''}`;
      setCurrentBranchKey(prev => (prev !== newKey ? newKey : prev));
    });
    return () => { unsubscribe(); };
  }, []);

  const requestPermission = async () => {
    if (!isSupported) return;
    
    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  };

  const showNotification = async (title: string, body: string, tag?: string) => {
    if (permission !== 'granted') return;

    const options: NotificationOptions & { vibrate?: number[] } = {
      body,
      icon: '/icon-192x192.png',
      badge: '/badge-72x72.png',
      tag: tag || 'delivery-pedido',
      requireInteraction: true,
      vibrate: [200, 100, 200],
    };

    // Prefer ServiceWorker-based notifications (required on mobile Chrome/Android)
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(title, options);
      } catch {
        // Fall back to Notification constructor on environments without an active SW
        const notification = new Notification(title, options);
        notification.onclick = () => {
          window.focus();
          notification.close();
        };
      }
    } else {
      // Desktop browsers without Service Worker support
      const notification = new Notification(title, options);
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    }

    // Tocar som de notificação
    if (audioRef.current) {
      audioRef.current.play().catch(() => {});
    }
  };

  // Escutar novos pedidos via Realtime — re-subscribe on branch change
  useEffect(() => {
    if (!enabled || permission !== 'granted') return;

    // Parse org + branch from the reactive key
    const [orgId, branchId] = currentBranchKey.split(':');

    // Build server-side filters for org + branch isolation
    const filters: string[] = [];
    if (orgId) filters.push(`organization_id=eq.${orgId}`);
    if (branchId) filters.push(`store_branch_id=eq.${branchId}`);
    const filterStr = filters.length > 0 ? { filter: filters.join(',') } : {};

    const channel = supabase
      .channel(`delivery-notifications-${branchId || 'global'}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'delivery_orders',
          ...filterStr,
        },
        (payload) => {
          const pedido = payload.new;
          // Defense-in-depth: double-check branch isolation client-side
          const latestBranchId = storageService.getSelectedBranchId();
          if (latestBranchId && pedido.store_branch_id && pedido.store_branch_id !== latestBranchId) return;
          if (pedido.status === 'pending') {
            showNotification(
              '🛵 Novo Pedido!',
              `Pedido #${pedido.orderNumber} - ${pedido.customerName}\nR$ ${pedido.total?.toFixed(2)}`,
              `pedido-${pedido.id}`
            );
            onNewPedidoRef.current?.(pedido);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, permission, currentBranchKey]); // Re-subscribe when branch changes

  return {
    isSupported,
    permission,
    requestPermission,
    showNotification,
  };
};

export default useDeliveryNotifications;
