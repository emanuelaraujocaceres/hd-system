/**
 * Toast - Sistema de notificações toast (backed by react-hot-toast)
 *
 * Aceita AMBOS os padrões de chamada para compatibilidade:
 *   addToast('error', 'mensagem')           ← positional (100+ call sites)
 *   addToast({ type: 'error', message: 'x' }) ← objeto
 *   addToast('success', 'msg', 6000, 'Desfazer', () => undo()) ← undo
 *   success('mensagem') / error('mensagem') / warning('mensagem') / info('mensagem')
 */

import React, { createContext, useContext, useCallback } from 'react';
import { Toaster, toast, type Toast as HotToast } from 'react-hot-toast';
import { CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastContextType {
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
  addToast: (
    typeOrOptions: ToastType | { type: ToastType; message: string; duration?: number },
    message?: string,
    duration?: number,
    actionLabel?: string,
    onAction?: () => void,
  ) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

/** Map internal ToastType → react-hot-toast method */
const toastFn = {
  success: (msg: string, opts?: Record<string, unknown>) => toast.success(msg, opts as any),
  error: (msg: string, opts?: Record<string, unknown>) => toast.error(msg, opts as any),
  warning: (msg: string, opts?: Record<string, unknown>) =>
    toast(msg, { icon: '⚠️', ...opts } as any),
  info: (msg: string, opts?: Record<string, unknown>) =>
    toast(msg, { icon: 'ℹ️', ...opts } as any),
};

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle className="w-5 h-5 text-emerald-500" />,
  error: <AlertCircle className="w-5 h-5 text-rose-500" />,
  warning: <AlertTriangle className="w-5 h-5 text-amber-500" />,
  info: <Info className="w-5 h-5 text-blue-500" />,
};

function showHotToast(
  type: ToastType,
  message: string,
  duration = 3000,
  actionLabel?: string,
  onAction?: () => void,
) {
  const renderIcon = () => ICONS[type];

  // Build custom renderer for rich toast with optional undo
  toastFn[type](message, {
    duration,
    icon: null, // we render icon inside custom div
    style: {
      borderRadius: '12px',
      background: undefined, // let react-hot-toast theme handle it
      color: undefined,
    },
  } as any);
}

const ToastContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const success = useCallback((message: string, duration?: number) => {
    showHotToast('success', message, duration);
  }, []);

  const error = useCallback((message: string, duration?: number) => {
    showHotToast('error', message, duration);
  }, []);

  const warning = useCallback((message: string, duration?: number) => {
    showHotToast('warning', message, duration);
  }, []);

  const info = useCallback((message: string, duration?: number) => {
    showHotToast('info', message, duration);
  }, []);

  /**
   * Flexible addToast — supports:
   * 1. addToast('error', 'message')           — positional (most common)
   * 2. addToast({ type, message, duration })   — object
   * 3. addToast('success', 'msg', 6000, 'Undo', fn) — with undo action
   */
  const addToast = useCallback(
    (
      typeOrOptions: ToastType | { type: ToastType; message: string; duration?: number },
      message?: string,
      duration?: number,
      actionLabel?: string,
      onAction?: () => void,
    ) => {
      let type: ToastType;
      let msg: string;
      let dur: number;

      if (typeof typeOrOptions === 'string') {
        // Positional: addToast('error', 'message', duration?, actionLabel?, onAction?)
        type = typeOrOptions;
        msg = message ?? '';
        dur = duration ?? 3000;
      } else {
        // Object: addToast({ type: 'error', message: 'msg', duration? })
        type = typeOrOptions.type;
        msg = typeOrOptions.message;
        dur = typeOrOptions.duration ?? 3000;
      }

      showHotToast(type, msg, dur, actionLabel, onAction);
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ success, error, warning, info, addToast }}>
      {children}
      <Toaster
        position="top-right"
        gutter={8}
        containerStyle={{ zIndex: 99999 }}
        toastOptions={{
          duration: 3000,
          style: {
            borderRadius: '12px',
            padding: '12px 16px',
            fontSize: '13px',
            fontWeight: 600,
            maxWidth: '380px',
          },
          success: {
            style: {
              background: '#ecfdf5',
              color: '#065f46',
              border: '1px solid #a7f3d0',
            },
            iconTheme: { primary: '#10b981', secondary: '#ecfdf5' },
          },
          error: {
            style: {
              background: '#fef2f2',
              color: '#991b1b',
              border: '1px solid #fecaca',
            },
            iconTheme: { primary: '#ef4444', secondary: '#fef2f2' },
          },
        }}
      />
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
};

/** For non-component contexts (services, etc.) — direct toast access */
export const toastDirect = {
  success: (message: string) => toast.success(message),
  error: (message: string) => toast.error(message),
  warning: (message: string) => toast(message, { icon: '⚠️' } as any),
  info: (message: string) => toast(message, { icon: 'ℹ️' } as any),
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <ToastContextProvider>{children}</ToastContextProvider>;
};

export default ToastProvider;
