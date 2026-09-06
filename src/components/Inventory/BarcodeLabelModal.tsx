import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { X, Printer, ClipboardList, ChevronLeft, ChevronRight } from 'lucide-react';
import { Product } from '../../types';

// ─── ETIQUETA PADRÃO ÚNICA (A4 = TÉRMICA) ───────────────────────────────────
// O tamanho da etiqueta é SEMPRE o mesmo (58mm x 40mm), independente da
// configuração de impressora: na térmica sai 1 por talão (uma em uma), e na
// folha A4 entram 12 (3 colunas x 4 linhas) por folha, quantas folhas forem
// necessárias. A única diferença entre os modos é QUANTAS etiquetas saem por
// folha — o tamanho de cada etiqueta é idêntico.
const LABEL_W_MM = 58;
const LABEL_H_MM = 40;
const A4_COLS = 3;
const A4_ROWS = 5;
const LABELS_PER_SHEET = A4_COLS * A4_ROWS; // 15 (3 colunas × 5 linhas — decisão do usuário)

// A4 em pixels @96dpi (210mm ≈ 794px, 297mm ≈ 1123px) — dimensões da folha no
// preview em tela. A escala é calculada dinamicamente para a folha inteira
// caber sem rolagem (ver useLayoutEffect no componente).
const A4_W_PX = 794;
const A4_H_PX = 1123;

// Paginação A4: divide os produtos em folhas de até `perSheet` etiquetas
// (3 colunas x 4 linhas). Função pura e exportada para testes.
export function paginateProducts(items: Product[], perSheet: number = LABELS_PER_SHEET): Product[][] {
  const pages: Product[][] = [];
  for (let i = 0; i < items.length; i += perSheet) {
    pages.push(items.slice(i, i + perSheet));
  }
  return pages;
}

// EAN-13: devolve os 13 dígitos completos (12 + dígito verificador) a partir
// de qualquer código. Aceita só dígitos (remove não-numéricos), trunca em 12 e
// completa com zeros — nunca lança erro, mesmo com código vazio.
export function computeEan13(code: string): string {
  // Pad or truncate to 12 digits (EAN-13 with check digit)
  const digits = code.replace(/\D/g, '').slice(0, 12).padEnd(12, '0');

  // Calculate check digit
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(digits[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return digits + checkDigit;
}

// EAN-13 como SVG RESPONSIVO (width="100%"): o tamanho físico do código é o
// do container (em mm), então o mesmo SVG escaneia igual na térmica (203dpi)
// e no A4 (laser/jato de tinta). Antes usava pixels fixos (320px ≈ 84mm) que
// extrapolavam a etiqueta — código cortado/clipado na impressão.
// Só as BARRAS vão no SVG; os dígitos são renderizados pelo <p> do LabelBody
// (computeEan13) para não duplicar a numeração dentro da etiqueta.
function generateEan13Svg(code: string, vbWidth: number = 200, vbHeight: number = 55): string {
  // EAN-13 encoding patterns
  const L_PATTERNS = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
  const G_PATTERNS = ['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
  const R_PATTERNS = ['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100'];
  const FIRST_DIGIT_PATTERNS = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];

  const fullCode = computeEan13(code);

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

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vbWidth} ${vbHeight}" width="100%" height="auto" preserveAspectRatio="xMidYMid meet">${bars}</svg>`;
}

interface BarcodeLabelModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
}

// Corpo da etiqueta 58x40mm: nome, preço, código de barras (responsivo) e dígitos.
// preço/dígitos usam text-center para ficarem centralizados mesmo fora do
// wrapper flex do BarcodeLabel (ex.: preview da impressora térmica).
const LabelBody: React.FC<{ product: Product }> = ({ product }) => (
  <>
    <p className="font-bold text-center leading-tight truncate w-full text-slate-900" style={{ fontSize: '10px' }} title={product.name}>
      {product.name}
    </p>
    <p className="font-bold text-emerald-600 text-center" style={{ fontSize: '13px' }}>
      R$ {product.salePrice.toFixed(2)}
    </p>
    {product.barcode ? (
      <div className="w-full px-1" dangerouslySetInnerHTML={{ __html: generateEan13Svg(product.barcode, 200, 55) }} />
    ) : (
      <p className="text-center text-[9px] font-bold text-rose-500 leading-tight py-1">SEM CÓDIGO DE BARRAS</p>
    )}
    {product.barcode && (
      <p className="font-mono tracking-tight text-center text-slate-700" style={{ fontSize: '8px' }}>{computeEan13(product.barcode)}</p>
    )}
  </>
);

const BarcodeLabel: React.FC<{ product: Product }> = ({ product }) => (
  <div
    data-testid="barcode-label"
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
}) => {
  const [printMode, setPrintMode] = useState<'a4' | 'thermal'>('a4');
  const [thermalQuantity, setThermalQuantity] = useState(1);
  const [currentPage, setCurrentPage] = useState(0);
  const [previewScale, setPreviewScale] = useState(0.55);
  const previewAreaRef = useRef<HTMLDivElement | null>(null);

  // Reset da página ao trocar o modo (A4/térmica) ou o conjunto de produtos —
  // evita "Página 3" apontando para uma folha que não existe mais.
  useEffect(() => {
    setCurrentPage(0);
  }, [printMode, products.length]);

  // Escala dinâmica da folha A4 no preview: mede o container disponível e
  // calcula a maior escala em que a folha inteira (794x1123px) cabe sem
  // rolagem, respeitando o menor eixo (largura OU altura). Recalcula no resize.
  useLayoutEffect(() => {
    const computeScale = () => {
      const el = previewAreaRef.current;
      if (!el) return;
      const w = el.clientWidth - 16;
      const h = el.clientHeight - 20;
      if (w <= 0 || h <= 0) return;
      setPreviewScale(Math.max(0.25, Math.min(1, w / A4_W_PX, h / A4_H_PX)));
    };
    computeScale();
    window.addEventListener('resize', computeScale);
    const t = window.setTimeout(computeScale, 0);
    return () => {
      window.removeEventListener('resize', computeScale);
      window.clearTimeout(t);
    };
  }, [printMode]);

  if (!isOpen || products.length === 0) return null;

  const handlePrint = () => {
    window.print();
  };

  // Paginação A4: 12 produtos distintos por folha, quantas folhas forem precisas.
  const pages: Product[][] = paginateProducts(products);

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
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 print:hidden shrink-0">
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
        <div className="px-6 pt-4 print:hidden shrink-0">
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

        {/* A4 Mode — Preview (1 folha por vez, escalada para caber inteira) */}
        {printMode === 'a4' && (
          <div
            ref={previewAreaRef}
            className="p-6 min-h-0 flex-1 bg-slate-100 dark:bg-slate-950 flex flex-col items-center overflow-auto print:hidden"
          >
            <p className="text-xs text-slate-500 mb-3 text-center shrink-0">
              Etiqueta padrão {LABEL_W_MM}×{LABEL_H_MM}mm — {LABELS_PER_SHEET} por folha A4
              {pages.length > 1 ? ` em ${pages.length} folhas` : ''}
            </p>

            {/* Folha A4 com transform scale: o wrapper externo tem o tamanho
                ESCALADO (overflow hidden) e o conteúdo interno mantém 794x1123px
                com transform-origin top left — a folha inteira, grade 3x4, cabe
                no modal sem rolagem e a última folha pode ter menos etiquetas. */}
            <div
              data-testid="a4-preview-sheet"
              className="bg-white rounded-lg shadow-lg border border-slate-300"
              style={{ width: `${A4_W_PX * previewScale}px`, height: `${A4_H_PX * previewScale}px`, overflow: 'hidden' }}
            >
              <div
                style={{
                  width: `${A4_W_PX}px`,
                  height: `${A4_H_PX}px`,
                  transform: `scale(${previewScale})`,
                  transformOrigin: 'top left',
                }}
              >
                <div className="w-full h-full pt-3 px-3 overflow-hidden">
                  <p className="text-[9px] text-slate-400 font-bold mb-1">
                    Folha {currentPage + 1} de {pages.length}
                  </p>
                  {/* Grade 3x5 TRAVADA: A4_ROWS linhas fixas de LABEL_H_MM + gap
                      de 3mm. Com overflow-hidden no conteúdo, a folha é
                      fisicamente incapaz de exibir mais de 15 etiquetas (3
                      colunas × 5 linhas) — inclusive se o conteúdo tentar
                      estourar. A última folha com menos itens simplesmente
                      deixa células vazias, igual à área de impressão. */}
                  <div
                    className="grid grid-cols-3 gap-[3mm]"
                    style={{ gridTemplateRows: `repeat(${A4_ROWS}, ${LABEL_H_MM}mm)` }}
                  >
                    {pages[currentPage]?.map((p) => (
                      <BarcodeLabel key={p.id} product={p} />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Paginação (só aparece com mais de uma folha) */}
            {pages.length > 1 && (
              <div className="flex items-center gap-4 mt-3 shrink-0">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                  disabled={currentPage === 0}
                  className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40 disabled:pointer-events-none hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                  aria-label="Página anterior"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Página {currentPage + 1} de {pages.length}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(pages.length - 1, p + 1))}
                  disabled={currentPage >= pages.length - 1}
                  className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40 disabled:pointer-events-none hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                  aria-label="Próxima página"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Thermal Mode — Preview */}
        {printMode === 'thermal' && (
          <div className="p-6 overflow-y-auto min-h-0 flex-1 bg-slate-100 dark:bg-slate-950 flex flex-col items-center print:hidden">
            <p className="text-xs text-slate-500 mb-4 text-center">
              Impressão térmica — etiqueta padrão {LABEL_W_MM}×{LABEL_H_MM}mm, uma por etiqueta
              {products.length > 1 ? ` (${products.length} produtos, em sequência)` : ''}
            </p>

            <div className="bg-white rounded-lg border-2 border-dashed border-slate-300 shadow-md p-1"
              style={{ width: `${LABEL_W_MM}mm`, height: `${LABEL_H_MM}mm` }}
            >
              <div className="flex flex-col items-center justify-between w-full h-full">
                <LabelBody product={products[0]} />
              </div>
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

        {/* Printable area — A4 (15 por folha, paginado). Só existe no modo A4:
            se os dois blocos estivessem sempre no DOM, a impressão mostrava as
            DUAS áreas sobrepostas (etiqueta térmica por cima da 1ª da folha →
            código de barras duplicado em qualquer modo). */}
        {printMode === 'a4' && (
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
        )}

        {/* Printable area — Thermal (1 etiqueta por página/talão) */}
        {printMode === 'thermal' && (
          <div className="hidden print:block">
            <div id="printable-thermal-label-print">
              {thermalLabels.map((p, idx) => (
                <div key={idx} className={idx < thermalLabels.length - 1 ? 'label-break' : ''}>
                  <BarcodeLabel product={p} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2 print:hidden shrink-0">
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