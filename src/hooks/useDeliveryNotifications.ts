/**
 * useDeliveryNotifications - Hook para notificações push de novos pedidos
 * 
 * Funcionalidades:
 * - Solicita permissão de notificação ao usuário
 * - Escuta novos pedidos via Realtime do Supabase
 * - Mostra notificação push quando chega novo pedido
 * - Emite som de alerta (opcional)
 */

import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';

interface UseDeliveryNotificationsProps {
  enabled: boolean;
  onNewPedido?: (pedido: any) => void;
}

export const useDeliveryNotifications = ({ enabled, onNewPedido }: UseDeliveryNotificationsProps) => {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSupported, setIsSupported] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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

  const requestPermission = async () => {
    if (!isSupported) return;
    
    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  };

  const showNotification = (title: string, body: string, tag?: string) => {
    if (permission !== 'granted') return;

    const notification = new Notification(title, {
      body,
      icon: '/icon-192x192.png',
      badge: '/badge-72x72.png',
      tag: tag || 'delivery-pedido',
      requireInteraction: true,
      vibrate: [200, 100, 200],
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };

    // Tocar som de notificação
    if (audioRef.current) {
      audioRef.current.play().catch(() => {});
    }

    return notification;
  };

  // Escutar novos pedidos via Realtime
  useEffect(() => {
    if (!enabled || permission !== 'granted') return;

    const channel = supabase
      .channel('delivery-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'delivery_orders',
        },
        (payload) => {
          const pedido = payload.new;
          if (pedido.status === 'pending') {
            showNotification(
              '🛵 Novo Pedido!',
              `Pedido #${pedido.orderNumber} - ${pedido.customerName}\nR$ ${pedido.total?.toFixed(2)}`,
              `pedido-${pedido.id}`
            );
            onNewPedido?.(pedido);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, permission, onNewPedido]);

  return {
    isSupported,
    permission,
    requestPermission,
    showNotification,
  };
};

export default useDeliveryNotifications;
