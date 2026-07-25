/**
 * SyncBanner
 * 
 * Banner de notificação de status de sincronização.
 * Mostra mensagens claras sobre o estado atual da conexão e sincronização.
 * 
 * Estados:
 * - offline: "Sem conexão com a internet. Dados serão salvos localmente e sincronizados automaticamente."
 * - syncing: "Sincronizando X dados pendentes..."
 * - error: "X dados não puderam ser sincronizados. Clique para tentar novamente."
 * - online/pending: "X dados pendentes de sincronização."
 */

import React from 'react';
import { CloudOff, RefreshCw, AlertTriangle, Cloud, X } from 'lucide-react';

interface SyncBannerProps {
  status: 'offline' | 'connecting' | 'syncing' | 'online' | 'error';
  pendingCount: number;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export const SyncBanner: React.FC<SyncBannerProps> = ({
  status,
  pendingCount,
  onRetry,
  onDismiss,
}) => {
  // Only show banner when there's relevant info
  if (status === 'online' && pendingCount === 0) return null;
  if (status === 'connecting') return null;

  const getBannerConfig = () => {
    switch (status) {
      case 'offline':
        return {
          bg: 'bg-amber-500/10 dark:bg-amber-500/10',
          border: 'border-amber-500/30 dark:border-amber-500/30',
          text: 'text-amber-700 dark:text-amber-300',
          icon: <CloudOff className="w-4 h-4 text-amber-500 shrink-0" />,
          message: 'Sem conexão com a internet. Dados serão salvos localmente e sincronizados automaticamente.',
          actionable: false,
        };
      case 'syncing':
        return {
          bg: 'bg-blue-500/10 dark:bg-blue-500/10',
          border: 'border-blue-500/30 dark:border-blue-500/30',
          text: 'text-blue-700 dark:text-blue-300',
          icon: <RefreshCw className="w-4 h-4 text-blue-500 shrink-0 animate-spin" />,
          message: pendingCount > 0
            ? `Sincronizando ${pendingCount} dado${pendingCount !== 1 ? 's' : ''} pendente${pendingCount !== 1 ? 's' : ''}...`
            : 'Sincronizando dados...',
          actionable: false,
        };
      case 'error':
        return {
          bg: 'bg-rose-500/10 dark:bg-rose-500/10',
          border: 'border-rose-500/30 dark:border-rose-500/30',
          text: 'text-rose-700 dark:text-rose-300',
          icon: <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />,
          message: `${pendingCount} dado${pendingCount !== 1 ? 's' : ''} não pode${pendingCount === 1 ? '' : 'm'} ser sincronizado${pendingCount === 1 ? '' : 's'}.`,
          actionable: true,
          actionLabel: 'Tentar novamente',
        };
      case 'online':
        if (pendingCount > 0) {
          return {
            bg: 'bg-indigo-500/10 dark:bg-indigo-500/10',
            border: 'border-indigo-500/30 dark:border-indigo-500/30',
            text: 'text-indigo-700 dark:text-indigo-300',
            icon: <Cloud className="w-4 h-4 text-indigo-500 shrink-0" />,
            message: `${pendingCount} dado${pendingCount !== 1 ? 's' : ''} pendente${pendingCount !== 1 ? 's' : ''} de sincronização.`,
            actionable: false,
          };
        }
        return null;
      default:
        return null;
    }
  };

  const config = getBannerConfig();
  if (!config) return null;

  return (
    <div className={`px-4 py-2 ${config.bg} ${config.border} border-b ${config.text} text-xs flex items-center gap-2 animate-[slideDown_0.2s_ease-out]`}>
      {config.icon}
      <span className="flex-1">{config.message}</span>
      <div className="flex items-center gap-2 shrink-0">
        {(config as any).actionable && onRetry && (
          <button
            onClick={onRetry}
            className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-600 dark:text-rose-400 text-[10px] font-bold transition-colors"
          >
            {(config as any).actionLabel}
          </button>
        )}
        {onDismiss && status !== 'offline' && (
          <button onClick={onDismiss} className="p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded transition-colors">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
};
