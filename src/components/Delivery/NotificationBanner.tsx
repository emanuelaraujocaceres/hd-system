/**
 * NotificationBanner - Banner para solicitar permissão de notificações
 * 
 * aparece no topo da página quando o usuário ainda não concedeu permissão
 */

import React from 'react';
import { Bell, BellOff, X } from 'lucide-react';

interface NotificationBannerProps {
  permission: NotificationPermission;
  isSupported: boolean;
  onRequestPermission: () => void;
  onDismiss: () => void;
}

export const NotificationBanner: React.FC<NotificationBannerProps> = ({
  permission,
  isSupported,
  onRequestPermission,
  onDismiss,
}) => {
  if (!isSupported || permission === 'granted' || permission === 'denied') return null;

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
      <Bell className="w-5 h-5 text-amber-500 shrink-0" />
      <div className="flex-1">
        <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
          Ative as notificações para ser avisado de novos pedidos!
        </p>
      </div>
      <button
        onClick={onRequestPermission}
        className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-white text-xs font-bold"
      >
        Ativar
      </button>
      <button onClick={onDismiss} className="p-1 text-amber-500 hover:text-amber-600">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export default NotificationBanner;
