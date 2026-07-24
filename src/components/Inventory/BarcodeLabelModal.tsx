import React from 'react';
import { X, Printer } from 'lucide-react';
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
  if (!isOpen || !product) return null;

  const handlePrint = () => {
    window.print();
  };

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
          @page { size: A4 portrait; margin: 10mm; }
        }
      `}</style>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 print:hidden">
          <div className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-white">
            <span className="text-indigo-600">|||</span>
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
            <span>Imprimir Etiquetas</span>
          </button>
        </div>
      </div>
    </div>
  );
};
