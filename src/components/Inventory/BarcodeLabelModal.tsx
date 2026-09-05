import React, { useState } from 'react';
import { X, Printer, ClipboardList } from 'lucide-react';
import { Product, SystemSettings } from '../../types';

// ─── ETIQUETA PADRÃO ÚNICA (A4 = TÉRMICA) ───────────────────────────────────
// O tamanho da etiqueta é SEMPRE o mesmo (58mm x 40mm), independente da
// configuração de impressora: na térmica sai 1 por talão (uma em uma), e na
// folha A4 entram 12 (3 colunas x 4 linhas) por folha, quantas folhas forem
// necessárias. A única diferença entre os modos é QUANTAS etiquetas saem por
// folha — o tamanho de cada etiqueta é idêntico.
const LABEL_W_MM = 58;
const LABEL_H_MM = 40;
const A4_COLS = 3;
const A4_ROWS = 4;
const LABELS_PER_SHEET = A4_COLS * A4_ROWS; // 12

// EAN-13 como SVG RESPONSIVO (width="100%"): o tamanho físico do código é o
// do container (em mm), então o mesmo SVG escaneia igual na térmica (203dpi)
// e no A4 (laser/jato de tinta). Antes usava pixels fixos (320px ≈ 84mm) que
// extrapolavam a etiqueta — código cortado/clipado na impressão.
function generateEan13Svg(code: string, vbWidth: number = 200, vbHeight: number = 55): string {
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
  const barWidth = vbWidth / 95;

  // Start guard
  bars += `<rect x="${x}" y="0" width="${barWidth}" height="${vbHeight}" fill="black"/>`; x += barWidth;
  bars += `<rect x="${x}" y="0" width="${barWidth}" height="${vbHeight}" fill="white"/>`; x += barWidth;
  bars += `<rect x="${x}" y="0" width="${barWidth}" height="${vbHeight}" fill="black"/>`; x += barWidth;

  // Left side (6 digits)
  for (let i = 0; i < 6; i++) {
    const digit = parseInt(fullCode[i + 1]);
    const p = pattern[i] === 'L' ? L_PATTERNS[digit] : G_PATTERNS[digit];
    for (let j = 0; j < 7; j++) {
      const color = p[j] === '1' ? 'black' : 'white';
      bars += `<rect x="${x}" y="0" width="${barWidth}" height="${vbHeight}" fill="${color}"/>`;
      x += barWidth;
    }
  }

  // Center guard
  bars += `<rect x="${x}" y="0" width="${barWidth}" height="${vbHeight}" fill="white"/>`; x += barWidth;
  bars += `<rect x="${x}" y="0" width="${barWidth}" height="${vbHeight}" fill="black"/>`; x += barWidth;
  bars += `<rect x="${x}" y="0" width="${barWidth}" height="${vbHeight}" fill="white"/>`; x += barWidth;
  bars += `<rect x="${x}" y="0" width="${barWidth}" height="${vbHeight}" fill="black"/>`; x += barWidth;
  bars += `<rect x="${x}" y="0" width="${barWidth}" height="${vbHeight}" fill="white"/>`; x += barWidth;

  // Right side (6 digits)
  for (let i = 0; i < 6; i++) {
    const digit = parseInt(fullCode[i + 7]);
    const p = R_PATTERNS[digit];
    for (let j = 0; j < 7; j++) {
      const color = p[j] === '1' ? 'black' : 'white';
      bars += `<rect x="${x}" y="0" width="${barWidth}" height="${vbHeight}" fill="${color}"/>`;
      x += barWidth;
    }
  }

  // End guard
  bars += `<rect x="${x}" y="0" width="${barWidth}" height="${vbHeight}" fill="black"/>`; x += barWidth;
  bars += `<rect x="${x}" y="0" width="${barWidth}" height="${vbHeight}" fill="white"/>`; x += barWidth;
  bars += `<rect x="${x}" y="0" width="${barWidth}" height="${vbHeight}" fill="black"/>`; x += barWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vbWidth} ${vbHeight + 14}" width="100%" height="auto" preserveAspectRatio="xMidYMid meet">${bars}<text x="${vbWidth/2}" y="${vbHeight + 12}" text-anchor="middle" font-family="monospace" font-size="11" fill="black">${fullCode}</text></svg>`;
}

interface BarcodeLabelModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  settings: SystemSettings;
}

// Corpo da etiqueta 58x40mm: nome, preço, código de barras (responsivo) e dígitos.
const LabelBody: React.FC<{ product: Product }> = ({ product }) => (
  <>
    <p className="font-bold text-center leading-tight truncate w-full text-slate-900" style={{ fontSize: '10px' }}>
      {product.name}
    </p>
    <p className="font-bold text-emerald-600" style={{ fontSize: '13px' }}>
      R$ {product.salePrice.toFixed(2)}
    </p>
    <div className="w-full px-1" dangerouslySetInnerHTML={{ __html: generateEan13Svg(product.barcode, 200, 55) }} />
    <p className="font-mono tracking-tight text-slate-700" style={{ fontSize: '8px' }}>{product.barcode}</p>
  </>
);

const BarcodeLabel: React.FC<{ product: Product }> = ({ product }) => (
  <div
    className="flex flex-col items-center justify-between bg-white text-black border border-gray-300 p-1"
    style={{ width: `${LABEL_W_MM}mm`, height: `${LABEL_H_MM}mm` }}
  >
    <LabelBody product={product} />
  </div>
);

export const BarcodeLabelModal: React.FC<BarcodeLabelModalProps> = ({
  isOpen,
  onClose,
  products,
  settings,
}) => {
  const [printMode, setPrintMode] = useState<'a4' | 'thermal'>('a4');
  const [thermalQuantity, setThermalQuantity] = useState(1);

  if (!isOpen || products.length === 0) return null;

  const handlePrint = () => {
    window.print();
  };

  // Paginação A4: 12 produtos distintos por folha, quantas folhas forem precisas.
  const pages: Product[][] = [];
  for (let i = 0; i < products.length; i += LABELS_PER_SHEET) {
    pages.push(products.slice(i, i + LABELS_PER_SHEET));
  }

  // Lista de impressão térmica: 1 etiqueta por produto (x cópias), uma a uma.
  const thermalLabels: Product[] = [];
  for (const p of products) {
    for (let c = 0; c < thermalQuantity; c++) thermalLabels.push(p);
  }

  // @page varia conforme o modo ativo (A4 portrait vs talão térmico 58x40mm).
  const pageRule =
    printMode === 'a4'
      ? '@page { size: A4 portrait; margin: 0; }'
      : `@page { size: ${LABEL_W_MM}mm ${LABEL_H_MM}mm; margin: 0; }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fadeIn">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #printable-barcode-sheet, #printable-barcode-sheet *,
          #printable-thermal-label-print, #printable-thermal-label-print * { visibility: visible !important; }
          #printable-barcode-sheet { position: absolute; left: 0; top: 0; width: 210mm; }
          #printable-thermal-label-print { position: absolute; left: 0; top: 0; width: ${LABEL_W_MM}mm; }
          .label-break { page-break-after: always; }
          ${pageRule}
        }
      `}</style>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 print:hidden">
          <div className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-white">
            <span className="text-indigo-600">|||</span>
            <span>Gerador de Etiquetas de Código de Barras</span>
            <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">
              ({products.length} produto{products.length > 1 ? 's' : ''})
            </span>
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
              Folha A4 (12 etiquetas)
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

        {/* A4 Mode — Preview */}
        {printMode === 'a4' && (
          <div className="p-6 overflow-auto bg-slate-100 dark:bg-slate-950 flex flex-col items-center print:hidden">
            <p className="text-xs text-slate-500 mb-4 text-center">
              Etiqueta padrão {LABEL_W_MM}×{LABEL_H_MM}mm — {LABELS_PER_SHEET} por folha A4
              {pages.length > 1 ? ` em ${pages.length} folhas` : ''}
            </p>
            {pages.map((chunk, ci) => (
              <div
                key={ci}
                className="bg-white p-3 rounded-xl border border-slate-300 shadow-md mb-4"
                style={{ width: '200mm' }}
              >
                <p className="text-[9px] text-slate-400 mb-1 font-bold">
                  Folha {ci + 1} de {pages.length}
                </p>
                <div className="grid grid-cols-3 gap-[3mm]">
                  {chunk.map((p) => (
                    <BarcodeLabel key={p.id} product={p} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Thermal Mode — Preview */}
        {printMode === 'thermal' && (
          <div className="p-6 overflow-y-auto bg-slate-100 dark:bg-slate-950 flex flex-col items-center print:hidden">
            <p className="text-xs text-slate-500 mb-4 text-center">
              Impressão térmica — etiqueta padrão {LABEL_W_MM}×{LABEL_H_MM}mm, uma por etiqueta
              {products.length > 1 ? ` (${products.length} produtos, em sequência)` : ''}
            </p>

            <div className="bg-white rounded-lg border-2 border-dashed border-slate-300 shadow-md p-1"
              style={{ width: `${LABEL_W_MM}mm`, height: `${LABEL_H_MM}mm` }}
            >
              <LabelBody product={products[0]} />
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
                {thermalQuantity === 1
                  ? `${products.length} etiqueta${products.length > 1 ? 's' : ''}`
                  : `${products.length * thermalQuantity} etiquetas`}
              </span>
            </div>
          </div>
        )}

        {/* Printable area — A4 (12 por folha, paginado) */}
        <div className="hidden print:block">
          <div id="printable-barcode-sheet">
            {pages.map((chunk, ci) => (
              <div key={ci} className={`label-wrap ${ci < pages.length - 1 ? 'label-break' : ''}`}>
                <div
                  className="grid grid-cols-3 gap-[3mm]"
                  style={{ width: '202mm', margin: '4mm auto' }}
                >
                  {chunk.map((p) => (
                    <BarcodeLabel key={p.id} product={p} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Printable area — Thermal (1 etiqueta por página/talão) */}
        <div className="hidden print:block">
          <div id="printable-thermal-label-print">
            {thermalLabels.map((p, idx) => (
              <div key={idx} className={idx < thermalLabels.length - 1 ? 'label-break' : ''}>
                <BarcodeLabel product={p} />
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
            <span>{printMode === 'thermal' ? 'Imprimir Etiqueta' : 'Imprimir Etiquetas'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};