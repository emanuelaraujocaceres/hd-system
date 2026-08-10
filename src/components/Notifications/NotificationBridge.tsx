/**
 * NotificationBridge - Ponte entre GlobalNotificationService e Toast
 * 
 * Escuta todas as notificações globais e exibe como toast
 */

import React, { useEffect } from 'react';
import { useToast } from '../shared/Toast';
import { globalNotificationService } from '../../services/globalNotificationService';

export const NotificationBridge: React.FC = () => {
  const toast = useToast();

  useEffect(() => {
    const unsubscribe = globalNotificationService.subscribe((event) => {
      const duration = event.type === 'error' ? 5000 : 3000;
      
      switch (event.type) {
        case 'success':
          toast.success(event.message, duration);
          break;
        case 'error':
          toast.error(event.message, duration);
          break;
        case 'warning':
          toast.warning(event.message, duration);
          break;
        case 'info':
          toast.info(event.message, duration);
          break;
      }
    });

    return unsubscribe;
  }, [toast]);

  return null;
};

export default NotificationBridge;
