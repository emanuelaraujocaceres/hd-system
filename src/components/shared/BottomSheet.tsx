import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  height?: string;
}

/**
 * BottomSheet component for mobile — slides up from the bottom,
 * dims the background, and shows a drag handle.
 */
export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  children,
  height = 'max-h-[85vh]',
}) => {
  const sheetRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-fadeIn"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className={`
          relative w-full bg-white dark:bg-[#18181b] rounded-t-3xl shadow-2xl
          animate-slide-up ${height} overflow-y-auto
          transition-all duration-300 ease-out
        `}
      >
        {/* Drag handle */}
        <div className="sticky top-0 z-10 bg-white dark:bg-[#18181b] pt-3 pb-1 px-4 flex items-center justify-between border-b border-slate-200 dark:border-[#27272a]">
          <div className="flex items-center gap-3">
            {/* Visual handle bar */}
            <div className="w-8 h-1 rounded-full bg-slate-300 dark:bg-[#52525b] mx-auto" />
            {title && (
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h3>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#27272a] transition-colors"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
};
