import React from 'react';
import { X, Printer, Barcode } from 'lucide-react';
import { Product, SystemSettings } from '../../types';

interface BarcodeLabelModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  settings: SystemSettings;
}

export const BarcodeLabelModal: React.FC<BarcodeLabelModalProps> = ({
  isOpen,
  onClose,
  product,
  settings,
}) => {
  if (!isOpen || !product) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-white">
            <Barcode className="w-5 h-5 text-indigo-600" />
            <span>Gerador de Folha de Etiquetas de Código de Barras</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Printable Labels Grid Area */}
        <div className="p-6 overflow-y-auto bg-slate-100 dark:bg-slate-950 flex flex-col items-center">
          <p className="text-xs text-slate-500 mb-4 text-center">
            Folha de impressão modelo Padrão 3x5 (15 etiquetas por folha A4):
          </p>

          <div
            id="printable-barcode-sheet"
            className="grid grid-cols-3 gap-2 bg-white text-black p-4 rounded-xl border border-slate-300 shadow-md font-sans text-[10px]"
          >
            {Array.from({ length: 12 }).map((_, idx) => (
              <div
                key={idx}
                className="p-2 border border-dashed border-slate-300 rounded flex flex-col items-center text-center justify-between bg-white w-28 h-20"
              >
                <p className="font-bold text-[9px] truncate w-full">{product.name}</p>
                {/* Visual Barcode Pattern Simulation */}
                <div className="my-0.5 w-full flex justify-center items-center">
                  <div className="h-6 w-24 bg-slate-900 flex items-center justify-between px-1">
                    {Array.from({ length: 18 }).map((_, i) => (
                      <span
                        key={i}
                        className={`h-full ${i % 3 === 0 ? 'w-0.5 bg-white' : 'w-1 bg-black'}`}
                      />
                    ))}
                  </div>
                </div>
                <p className="font-mono text-[9px] tracking-tight">{product.barcode}</p>
                <p className="font-bold text-[10px] text-emerald-800">
                  R$ {product.salePrice.toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300"
          >
            Fechar
          </button>
          <button
            onClick={handlePrint}
            className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md transition-colors flex items-center gap-1.5"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir Etiquetas</span>
          </button>
        </div>
      </div>
    </div>
  );
};
