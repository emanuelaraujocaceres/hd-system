import React, { useState } from 'react';
import { X, Printer, ClipboardList } from 'lucide-react';
import { Product, SystemSettings } from '../../types';

// Simple EAN-13 barcode renderer as SVG paths
function generateEan13Svg(code: string, width: number = 200, height: number = 60): string {
  // EAN-13 encoding patterns
  const L_PATTERNS = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
  const G_PATTERNS = ['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
  const R_PATTERNS = ['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100'];
  const FIRST_DIGIT_PATTERNS = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];

  // Pad or truncate to 12 digits (EAN-13 with check digit)
  let digits = code.replace(/\D/g, '').slice(0, 12).padEnd(12, '0');
  
  // Calculate check digit
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(digits[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  const fullCode = digits + checkDigit;
  
  const firstDigit = parseInt(fullCode[0]);
  const pattern = FIRST_DIGIT_PATTERNS[firstDigit];
  
  let bars = '';
  let x = 0;
  const barWidth = width / 95;
  
  // Start guard
  bars += `<rect x="${x}" y="0" width="${barWidth}" height="${height}" fill="black"/>`; x += barWidth;
  bars += `<rect x="${x}" y="0" width="${barWidth}" height="${height}" fill="white"/>`; x += barWidth;
  bars += `<rect x="${x}" y="0" width="${barWidth}" height="${height}" fill="black"/>`; x += barWidth;
  
  // Left side (6 digits)
  for (let i = 0; i < 6; i++) {
    const digit = parseInt(fullCode[i + 1]);
    const p = pattern[i] === 'L' ? L_PATTERNS[digit] : G_PATTERNS[digit];
    for (let j = 0; j < 7; j++) {
      const color = p[j] === '1' ? 'black' : 'white';
      bars += `<rect x="${x}" y="0" width="${barWidth}" height="${height}" fill="${color}"/>`;
      x += barWidth;
    }
  }
  
  // Center guard
  bars += `<rect x="${x}" y="0" width="${barWidth}" height="${height}" fill="white"/>`; x += barWidth;
  bars += `<rect x="${x}" y="0" width="${barWidth}" height="${height}" fill="black"/>`; x += barWidth;
  bars += `<rect x="${x}" y="0" width="${barWidth}" height="${height}" fill="white"/>`; x += barWidth;
  bars += `<rect x="${x}" y="0" width="${barWidth}" height="${height}" fill="black"/>`; x += barWidth;
  bars += `<rect x="${x}" y="0" width="${barWidth}" height="${height}" fill="white"/>`; x += barWidth;
  
  // Right side (6 digits)
  for (let i = 0; i < 6; i++) {
    const digit = parseInt(fullCode[i + 7]);
    const p = R_PATTERNS[digit];
    for (let j = 0; j < 7; j++) {
      const color = p[j] === '1' ? 'black' : 'white';
      bars += `<rect x="${x}" y="0" width="${barWidth}" height="${height}" fill="${color}"/>`;
      x += barWidth;
    }
  }
  
  // End guard
  bars += `<rect x="${x}" y="0" width="${barWidth}" height="${height}" fill="black"/>`; x += barWidth;
  bars += `<rect x="${x}" y="0" width="${barWidth}" height="${height}" fill="white"/>`; x += barWidth;
  bars += `<rect x="${x}" y="0" width="${barWidth}" height="${height}" fill="black"/>`; x += barWidth;
  
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height + 14}" width="${width}" height="${height + 14}">${bars}<text x="${width/2}" y="${height + 12}" text-anchor="middle" font-family="monospace" font-size="11" fill="black">${fullCode}</text></svg>`;
}

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
  const [printMode, setPrintMode] = useState<'a4' | 'thermal'>('a4');
  const [thermalQuantity, setThermalQuantity] = useState(1);

  if (!isOpen || !product) return null;

  const handlePrint = () => {
    window.print();
  };

  const thermalBarSvg = generateEan13Svg(product.barcode, 320, 60);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fadeIn">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #printable-barcode-sheet, #printable-barcode-sheet * { visibility: visible !important; }
          #printable-barcode-sheet {
            position: fixed; left: 0; top: 0; margin: 10mm;
            width: 190mm; height: 277mm;
          }
          #printable-thermal-label-print, #printable-thermal-label-print * { visibility: visible !important; }
          #printable-thermal-label-print {
            position: fixed; left: 0; top: 0; margin: 2mm;
            width: 50mm; height: auto;
          }
          #printable-barcode-sheet { @page { size: A4 portrait; margin: 10mm; } }
          #printable-thermal-label-print { @page { size: 50mm auto; margin: 0mm; } }
        }
      `}</style>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 print:hidden">
          <div className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-white">
            <span className="text-indigo-600">|||</span>
            <span>Gerador de Etiquetas de Código de Barras</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Selector */}
        <div className="px-6 pt-4 print:hidden">
          <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1 gap-1">
            <button
              onClick={() => setPrintMode('a4')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                printMode === 'a4'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <ClipboardList className="w-4 h-4 inline mr-1.5 -mt-0.5" />
              Folha A4 (15 etiquetas)
            </button>
            <button
              onClick={() => setPrintMode('thermal')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                printMode === 'thermal'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <Printer className="w-4 h-4 inline mr-1.5 -mt-0.5" />
              Impressora Térmica (1 etiqueta)
            </button>
          </div>
        </div>

        {/* A4 Mode - Printable Labels Grid Area */}
        {printMode === 'a4' && (
          <div className="p-6 overflow-y-auto bg-slate-100 dark:bg-slate-950 flex flex-col items-center print:hidden">
            <p className="text-xs text-slate-500 mb-4 text-center">
              Folha de impressão modelo Padrão 3x5 (15 etiquetas por folha A4):
            </p>

            <div
              id="printable-barcode-sheet"
              className="grid grid-cols-3 gap-2 bg-white text-black p-4 rounded-xl border border-slate-300 shadow-md font-sans text-[10px]"
            >
              {Array.from({ length: 15 }).map((_, idx) => (
                <div
                  key={idx}
                  className="p-1.5 border border-gray-300 rounded flex flex-col items-center text-center justify-between bg-white"
                  style={{ width: '63.5mm', height: '38mm' }}
                >
                  {product.imageUrl && (
                    <img src={product.imageUrl} alt="" className="w-8 h-8 object-cover rounded" />
                  )}
                  <p className="font-bold text-[8px] truncate w-full leading-tight">{product.name}</p>
                  <div className="my-0.5" dangerouslySetInnerHTML={{ __html: generateEan13Svg(product.barcode, 150, 40) }} />
                  <p className="font-mono text-[7px] tracking-tight">{product.barcode}</p>
                  <p className="font-bold text-[9px] text-emerald-700">R$ {product.salePrice.toFixed(2)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Thermal Mode - Single Label Preview */}
        {printMode === 'thermal' && (
          <div className="p-6 overflow-y-auto bg-slate-100 dark:bg-slate-950 flex flex-col items-center print:hidden">
            <p className="text-xs text-slate-500 mb-4 text-center">
              Impressão térmica — etiqueta individual (50mm × 30mm):
            </p>

            <div
              className="bg-white text-black rounded-lg border-2 border-dashed border-slate-300 shadow-md font-sans flex flex-col items-center justify-between p-3"
              style={{ width: '190px', height: '115px' }}
            >
              <p className="font-bold text-sm text-center leading-tight truncate w-full text-slate-900">
                {product.name}
              </p>
              <p className="font-bold text-lg text-emerald-600">
                R$ {product.salePrice.toFixed(2)}
              </p>
              <div className="w-full" dangerouslySetInnerHTML={{ __html: thermalBarSvg }} />
              <p className="font-mono text-[10px] tracking-tight text-slate-600">{product.barcode}</p>
            </div>

            {/* Quantity Selector */}
            <div className="mt-5 flex items-center gap-3">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-400">
                Cópias:
              </label>
              <div className="flex items-center gap-1 bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 overflow-hidden">
                <button
                  onClick={() => setThermalQuantity((q) => Math.max(1, q - 1))}
                  className="px-3 py-1.5 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={thermalQuantity}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    setThermalQuantity(isNaN(v) ? 1 : Math.max(1, Math.min(99, v)));
                  }}
                  className="w-10 text-center text-sm font-bold bg-transparent text-slate-900 dark:text-white outline-none"
                />
                <button
                  onClick={() => setThermalQuantity((q) => Math.min(99, q + 1))}
                  className="px-3 py-1.5 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  +
                </button>
              </div>
              <span className="text-[10px] text-slate-400 dark:text-slate-500">
                {thermalQuantity === 1 ? '1 cópia' : `${thermalQuantity} cópias`}
              </span>
            </div>

            {/* Printable area for thermal — hidden on screen, shown on print */}
            <div className="hidden print:block">
              <div
                id="printable-thermal-label-print"
                className="bg-white text-black font-sans flex flex-col items-center justify-between p-1"
                style={{ width: '50mm', height: '30mm' }}
              >
                {Array.from({ length: thermalQuantity }).map((_, idx) => (
                  <div key={idx} className={`flex flex-col items-center justify-between ${idx > 0 ? 'mt-1' : ''}`} style={{ width: '46mm', height: '28mm' }}>
                    <p className="font-bold text-center leading-tight" style={{ fontSize: '14px' }}>{product.name}</p>
                    <p className="font-bold" style={{ fontSize: '16px', color: '#16a34a' }}>R$ {product.salePrice.toFixed(2)}</p>
                    <div dangerouslySetInnerHTML={{ __html: generateEan13Svg(product.barcode, 280, 50) }} />
                    <p className="font-mono" style={{ fontSize: '9px' }}>{product.barcode}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2 print:hidden">
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
            <span>{printMode === 'thermal' ? 'Imprimir Etiqueta' : 'Imprimir Etiquetas'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
