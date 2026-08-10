/**
 * NotificationBanner - Banner global de notificações
 * 
 * Aparece no topo de todas as páginas para solicitar permissão
 * e mostra o status das notificações
 */

import React, { useState, useEffect } from 'react';
import { Bell, BellOff, X, CheckCircle } from 'lucide-react';
import { globalNotificationService } from '../../services/globalNotificationService';

export const NotificationBanner: React.FC = () => {
  const [showBanner, setShowBanner] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState(globalNotificationService.getPermissionStatus());

  useEffect(() => {
    setPermissionStatus(globalNotificationService.getPermissionStatus());
    // Show banner if permission not granted and not denied
    const { supported, permission } = globalNotificationService.getPermissionStatus();
    setShowBanner(supported && permission === 'default');
  }, []);

  const handleRequestPermission = async () => {
    const granted = await globalNotificationService.requestPermission();
    setPermissionStatus(globalNotificationService.getPermissionStatus());
    if (granted) {
      setShowBanner(false);
      // Show test notification
      new Notification('🔔 Notificações Ativas!', {
        body: 'Você será avisado de todas as atualizações do sistema.',
        icon: '/logo-hd-system/android-chrome-192x192.png',
      });
    }
  };

  const handleDismiss = () => {
    setShowBanner(false);
  };

  if (!showBanner) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 border-b border-indigo-500/20">
      <Bell className="w-4 h-4 text-indigo-500 animate-pulse" />
      <div className="flex-1">
        <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">
          🔔 Ative as notificações para ser avisado de TODAS as atualizações!
        </p>
        <p className="text-[10px] text-slate-500 dark:text-slate-400">
          Vendas, pedidos, fiados, estoque - tudo em tempo real!
        </p>
      </div>
      <button
        onClick={handleRequestPermission}
        className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors flex items-center gap-1.5"
      >
        <Bell className="w-3 h-3" />
        Ativar
      </button>
      <button onClick={handleDismiss} className="p-1 text-slate-400 hover:text-slate-600">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export default NotificationBanner;
