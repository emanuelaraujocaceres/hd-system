import React, { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  /** Texto do item destacado (ex.: nome do produto que será excluído) */
  itemName?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** Se informado, exige digitar exatamente esta palavra para habilitar o botão de confirmar */
  typeToConfirm?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Diálogo de confirmação compartilhado — substitui window.confirm.
 * Botões grandes para touch (min-h-11), estilo de perigo vermelho por padrão.
 * Com `typeToConfirm`, a ação destrutiva exige digitar a palavra-chave.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  itemName,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = true,
  typeToConfirm,
  onConfirm,
  onCancel,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [typedText, setTypedText] = useState('');

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => setIsVisible(true));
      setTypedText('');
    } else {
      setIsVisible(false);
    }
  }, [isOpen]);

  // Escape fecha o diálogo
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const confirmClasses = danger
    ? 'bg-red-600 hover:bg-red-700 text-white'
    : 'bg-indigo-600 hover:bg-indigo-500 text-white';

  return (
    <div
      className={`fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 transition-opacity duration-200 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
      onClick={onCancel}
    >
      <div
        className={`bg-white dark:bg-slate-900 rounded-2xl max-w-[380px] w-full shadow-2xl overflow-hidden transition-transform duration-200 ${isVisible ? 'scale-100' : 'scale-95'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4">
          {/* Header */}
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 border-2 ${danger ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' : 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800'}`}>
              <AlertTriangle className={`w-6 h-6 ${danger ? 'text-red-500' : 'text-indigo-500'}`} />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-bold text-slate-900 dark:text-white m-0">{title}</h3>
              <p className="text-xs text-slate-500 dark:text-[#a1a1aa] m-0 mt-0.5">{message}</p>
            </div>
            <button
              onClick={onCancel}
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-[#27272a] transition-colors"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Item destacado */}
          {itemName && (
            <div className={`rounded-xl p-3 mb-3 text-xs font-semibold ${danger ? 'bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 text-red-900 dark:text-red-300' : 'bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-300'}`}>
              "{itemName}"
            </div>
          )}

          {/* Digitar palavra-chave para ações críticas */}
          {typeToConfirm && (
            <div className="mb-3">
              <label className="block text-[11px] font-bold text-slate-500 dark:text-[#a1a1aa] mb-1 uppercase tracking-wide">
                Digite <span className="font-mono font-extrabold">{typeToConfirm}</span> para confirmar
              </label>
              <input
                type="text"
                value={typedText}
                onChange={(e) => setTypedText(e.target.value)}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                className="w-full px-3 py-2.5 bg-white dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] rounded-xl text-xs font-mono font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
          )}

          {/* Actions — botões grandes para touch */}
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              autoFocus={!typeToConfirm}
              className="flex-1 min-h-11 py-3 rounded-xl bg-slate-100 dark:bg-[#27272a] hover:bg-slate-200 dark:hover:bg-[#3f3f46] text-slate-700 dark:text-slate-300 text-xs font-bold transition-colors"
            >
              {cancelLabel}
            </button>
            <button
              onClick={onConfirm}
              disabled={typeToConfirm ? typedText.trim() !== typeToConfirm : false}
              className={`flex-1 min-h-11 py-3 rounded-xl text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${confirmClasses}`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
