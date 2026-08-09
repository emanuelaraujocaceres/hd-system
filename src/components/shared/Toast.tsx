/**
 * Toast - Sistema de notificações toast
 * 
 * Notificações que aparecem no canto da tela por alguns segundos
 * Tipos: success, error, warning, info
 * 
 * Uso:
 * toast.success('Pedido salvo!')
 * toast.error('Erro ao salvar')
 * toast.warning('Estoque baixo')
 * toast.info('Novo pedido')
 */

import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContextType {
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
  addToast: (options: { type: ToastType; message: string; duration?: number }) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToastFn = useCallback((type: ToastType, message: string, duration = 3000) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setToasts(prev => [...prev, { id, type, message, duration }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const success = useCallback((message: string, duration?: number) => addToastFn('success', message, duration), [addToastFn]);
  const error = useCallback((message: string, duration?: number) => addToastFn('error', message, duration), [addToastFn]);
  const warning = useCallback((message: string, duration?: number) => addToastFn('warning', message, duration), [addToastFn]);
  const info = useCallback((message: string, duration?: number) => addToastFn('info', message, duration), [addToastFn]);
  const addToast = useCallback((options: { type: ToastType; message: string; duration?: number }) => {
    addToastFn(options.type, options.message, options.duration);
  }, [addToastFn]);

  return (
    <ToastContext.Provider value={{ success, error, warning, info, addToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
};

const ToastContainer: React.FC<{ toasts: ToastMessage[]; onRemove: (id: string) => void }> = ({ toasts, onRemove }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[9999] space-y-2 max-w-sm">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
};

const ToastItem: React.FC<{ toast: ToastMessage; onRemove: (id: string) => void }> = ({ toast, onRemove }) => {
  const icons = {
    success: <CheckCircle className="w-5 h-5 text-emerald-500" />,
    error: <AlertCircle className="w-5 h-5 text-rose-500" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-500" />,
    info: <Info className="w-5 h-5 text-blue-500" />,
  };

  const bgColors = {
    success: 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800',
    error: 'bg-rose-50 dark:bg-rose-900/30 border-rose-200 dark:border-rose-800',
    warning: 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800',
    info: 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800',
  };

  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border shadow-lg animate-[slideIn_0.3s_ease-out] ${bgColors[toast.type]}`}>
      {icons[toast.type]}
      <span className="flex-1 text-xs font-semibold text-slate-900 dark:text-white">{toast.message}</span>
      <button onClick={() => onRemove(toast.id)} className="p-1 hover:bg-black/5 rounded">
        <X className="w-3 h-3 text-slate-400" />
      </button>
    </div>
  );
};

export default ToastProvider;
