// functions/api/ai/boletoLib.ts
// Decodificação 100% determinística (SEM IA) de códigos de barras de boleto
// bancário e contas de arrecadação (luz, água, gás, telefone).
// Compartilhado entre:
//   - frontend (BoletoCameraScannerModal — leitura local no dispositivo)
//   - functions/api/ai/scan-boleto.ts (Cloudflare Pages)
//   - server.ts (servidor Node — desenvolvimento)
//
// Formatos suportados:
//   - 44 dígitos começando com "8"  → código de barras de ARRECADAÇÃO
//   - 48 dígitos começando com "8"  → linha digitável de ARRECADAÇÃO (DVs nas posições 12/24/36/48)
//   - 44 dígitos                    → código de barras bancário compacto
//   - 47/48 dígitos                 → linha digitável bancária

export const BANKS: Record<string, string> = {
  '001': 'Banco do Brasil',
  '003': 'Banco da Amazônia',
  '004': 'Banco do Nordeste',
  '021': 'Banestes',
  '033': 'Santander',
  '041': 'Banrisul',
  '070': 'BRB — Banco de Brasília',
  '077': 'Banco Inter',
  '104': 'Caixa Econômica Federal',
  '237': 'Bradesco',
  '260': 'Nubank',
  '290': 'PagSeguro',
  '318': 'Banco BMG',
  '336': 'Banco C6 S.A.',
  '341': 'Itaú Unibanco',
  '380': 'C6 Bank',
  '389': 'Banco Mercantil do Brasil',
  '399': 'Banco Master',
  '422': 'Banco Safra',
  '633': 'Banco Rendimento',
  '735': 'Banco Neon',
  '745': 'Citibank',
  '748': 'Sicredi',
  '756': 'Sicoob',
};

// Segmentos de arrecadação (posições 2-3 do código de barras de 44 dígitos)
export const SEGMENTS: Record<string, string> = {
  '32': 'Energia Elétrica',
  '33': 'Telecomunicações',
  '34': 'Gás',
  '35': 'Água e Saneamento',
  '36': 'Multas de Trânsito',
  '38': 'Pedágio',
};

export interface BoletoDecoded {
  type: 'bancario' | 'arrecadacao' | null;
  barcode: string;
  barcodeValid: boolean;
  amount: number | null; // em reais (null quando não decodificável)
  dueDate: string | null; // YYYY-MM-DD — somente boleto bancário (arrecadação não codifica vencimento)
  supplierName: string | null; // nome genérico do banco/segmento (o nome real do emissor é confirmado pelo usuário)
  category: string | null;
}

// Base do "fator de vencimento": 07/10/1997 (válido até 21/02/2025).
// A partir de 22/02/2025 a FEBRABAN adotou nova base (22/02/2025).
const FATOR_BASE_1 = Date.UTC(1997, 9, 7);
const FATOR_LIMITE = '2025-02-21';
const FATOR_BASE_2 = Date.UTC(2025, 1, 22);

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function addDaysUtc(baseMs: number, days: number): string {
  const d = new Date(baseMs + days * 86400000);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function dueFromFactor(factor: number): string | null {
  if (!(factor > 0)) return null;
  const d1 = addDaysUtc(FATOR_BASE_1, factor);
  if (d1 <= FATOR_LIMITE) return d1;
  return addDaysUtc(FATOR_BASE_2, factor);
}

// Dígito verificador módulo 10 (pesos 2,1,2,1…). fromRight = da direita p/ esquerda.
function dvModulo10(field: string, fromRight: boolean): number {
  let sum = 0;
  let weight = 2;
  const seq = fromRight ? [...field].reverse() : [...field];
  for (const ch of seq) {
    const prod = (ch.charCodeAt(0) - 48) * weight;
    sum += prod > 9 ? prod - 9 : prod;
    weight = weight === 2 ? 1 : 2;
  }
  return (10 - (sum % 10)) % 10;
}

export function decodeBoleto(raw: string | null | undefined): BoletoDecoded {
  const digits = (raw || '').replace(/\D/g, '');
  const empty: BoletoDecoded = {
    type: null,
    barcode: '',
    barcodeValid: false,
    amount: null,
    dueDate: null,
    supplierName: null,
    category: null,
  };
  if (!digits) return empty;

  if ((digits.length === 44 || digits.length === 48) && digits[0] === '8') {
    return decodeArrecadacao(digits);
  }
  if (digits.length === 44) return decodeBancarioCompacto(digits);
  if (digits.length === 47 || digits.length === 48) return decodeLinhaDigitavel(digits);
  return { ...empty, barcode: digits };
}

function decodeArrecadacao(raw: string): BoletoDecoded {
  let digits = raw;
  // Linha digitável de arrecadação (48 dígitos): remove os DVs nas posições 12, 24, 36 e 48
  if (digits.length === 48) {
    const keep = [...Array(48).keys()].filter((i) => (i + 1) % 12 !== 0);
    digits = keep.map((i) => digits[i]).join('');
  }

  const segment = digits.slice(1, 3); // posições 2-3
  const tipoValor = digits[3]; // posição 4: 6 = valor em reais, 7 = quantidade
  const amount = tipoValor === '6' ? Number(digits.slice(6, 19)) / 100 : null;
  const segmentName = SEGMENTS[segment] || 'Conta de Arrecadação';

  return {
    type: 'arrecadacao',
    barcode: digits,
    barcodeValid: true,
    amount: amount && amount > 0 ? amount : null,
    // Contas de arrecadação NÃO codificam vencimento no código de barras
    dueDate: null,
    supplierName: segmentName,
    category: segmentName,
  };
}

function decodeBancarioCompacto(digits: string): BoletoDecoded {
  const bank = digits.slice(0, 3);
  const amount = Number(digits.slice(9, 19)) / 100;
  return {
    type: 'bancario',
    barcode: digits,
    barcodeValid: true,
    amount: amount > 0 ? amount : null,
    dueDate: dueFromFactor(Number(digits.slice(4, 9))),
    supplierName: BANKS[bank] || (bank ? `Banco ${bank}` : null),
    category: 'Boleto Bancário',
  };
}

function decodeLinhaDigitavel(digits: string): BoletoDecoded {
  const d1 = digits.slice(0, 9);
  const d2 = digits.slice(10, 20);
  const d3 = digits.slice(21, 31);
  const bank = digits.slice(0, 3);
  // Campo 5 = fator de vencimento (pos. 34-37) + valor (pos. 38-47)
  const valueDigits = digits.length === 48 ? digits.slice(38, 48) : digits.slice(37, 47);
  const amount = Number(valueDigits) / 100;
  const valid =
    d1.length === 9 &&
    dvModulo10(d1, true) === Number(digits[9]) &&
    dvModulo10(d2, true) === Number(digits[20]) &&
    dvModulo10(d3, true) === Number(digits[31]) &&
    dvModulo10(digits.slice(0, 32), false) === Number(digits[32]);

  return {
    type: 'bancario',
    barcode: digits,
    barcodeValid: valid,
    amount: amount > 0 ? amount : null,
    dueDate: dueFromFactor(Number(digits.slice(33, 37))),
    supplierName: BANKS[bank] || (bank ? `Banco ${bank}` : null),
    category: 'Boleto Bancário',
  };
}
