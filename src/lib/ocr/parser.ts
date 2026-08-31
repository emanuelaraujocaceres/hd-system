/**
 * parser.ts — Parser OCR / XML compartilhado (portado do prototypes/ocr-bench/parser.js).
 * Roda em browser (ESM). OCR é feito pelo Tesseract.js via ocrService.ts;
 * este arquivo só transforma TEXTO em dados estruturados.
 */

import type { NFRecordItem } from '../../types';

// ── Tipos ─────────────────────────────────────────────────────────────

export interface SupplierField {
  regex: string;
  group?: number;
}

export interface SupplierData {
  [key: string]: SupplierField;
}

export interface ItemLineConfig {
  regex: string;
  map: Record<string, number>;
}

export interface OcrTemplate {
  id: string;
  label: string;
  match?: { keywords?: string[] };
  supplier?: SupplierData;
  documentNumber?: SupplierField;
  qrAccessKey?: SupplierField;
  itemLine?: ItemLineConfig;
  total?: SupplierField;
}

export interface ParsedSupplier {
  name?: string;
  cnpj?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  email?: string;
}

export interface ParsedDocument {
  source: 'ocr' | 'xml';
  templateId: string;
  supplier: ParsedSupplier;
  documentNumber: string;
  qrAccessKey: string;
  total: number;
  items: NFRecordItem[];
  warnings: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────

/** Parseia número no formato BR (1.234,56 → 1234.56) */
export function parseBRNumber(input: unknown): number {
  if (input === null || input === undefined) return 0;
  let s = String(input).trim();
  if (!s) return 0;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (hasComma && !hasDot) {
    s = s.replace(',', '.');
  }
  const n = parseFloat(s.replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function compile(str: string): RegExp {
  return new RegExp(str, 'm');
}

function firstMatch(text: string, def?: SupplierField): string {
  if (!def || !def.regex) return '';
  const m = compile(def.regex).exec(text);
  const g = def.group ?? 1;
  return m ? (m[g] || '').trim() : '';
}

// ── Detecção de template ──────────────────────────────────────────────

export function detectTemplate(text: string, templates: OcrTemplate[]): OcrTemplate {
  const t = (text || '').toLowerCase();
  for (const tp of templates) {
    const kw = tp.match?.keywords;
    if (kw && kw.some((k) => t.includes(k.toLowerCase()))) return tp;
  }
  return templates.find((x) => x.id === 'generic') || templates[0];
}

// ── Parser OCR ────────────────────────────────────────────────────────

export function parseOcr(text: string, template: OcrTemplate): ParsedDocument {
  const result: ParsedDocument = {
    source: 'ocr',
    templateId: template.id,
    supplier: {},
    documentNumber: firstMatch(text, template.documentNumber),
    qrAccessKey: firstMatch(text, template.qrAccessKey),
    total: parseBRNumber(firstMatch(text, template.total)),
    items: [],
    warnings: [],
  };

  if (template.supplier) {
    for (const [k, def] of Object.entries(template.supplier)) {
      (result.supplier as Record<string, string>)[k] = firstMatch(text, def);
    }
  }

  const lines = text.split(/\r?\n/);
  const itemRe = template.itemLine ? compile(template.itemLine.regex) : null;
  const map = template.itemLine?.map || {};
  let matched = 0;

  for (const line of lines) {
    if (!itemRe) break;
    const m = itemRe.exec(line);
    if (!m) continue;

    const item: NFRecordItem = { productName: '', quantity: 0, unitPrice: 0 };
    for (const [field, grp] of Object.entries(map)) {
      const v = (m[grp] || '').trim();
      if (field === 'name' || field === 'code') {
        if (field === 'name') item.productName = v;
        if (field === 'code') item.code = v;
      } else if (field === 'qty') {
        item.quantity = parseBRNumber(v);
      } else if (field === 'unitPrice') {
        item.unitPrice = parseBRNumber(v);
      } else if (field === 'subtotal') {
        item.subtotal = parseBRNumber(v);
      }
    }

    const hasQty = item.quantity > 0;
    const hasVal = item.unitPrice > 0 || (item.subtotal ?? 0) > 0;
    if (item.productName && (hasQty || hasVal)) {
      // Auto-fix de vírgula decimal perdida (Tesseract lê "6,00" como 600)
      if ((item.subtotal ?? 0) > 0 && item.unitPrice > 0 && item.quantity > 0) {
        const raw = item.quantity * item.unitPrice;
        const sub = item.subtotal ?? 0;
        if (
          Math.abs(raw - sub * 100) < Math.abs(sub) + 1 &&
          Math.abs(raw / 100 - sub) < Math.abs(sub) * 0.05
        ) {
          item.unitPrice = item.unitPrice / 100;
        }
      }
      result.items.push(item);
      matched++;
    }
  }

  if (matched === 0) {
    result.warnings.push('Nenhuma linha de item casou com o template. Afinar regex ou usar modo manual.');
  }
  if (!result.total && result.items.length) {
    result.warnings.push('Total não detectado; será soma dos subtotais.');
  }
  return result;
}

// ── Parser NF-e XML ───────────────────────────────────────────────────

export function parseNFeXml(xml: string): ParsedDocument {
  const get = (re: RegExp): string => {
    const m = re.exec(xml);
    return m ? m[1].trim() : '';
  };

  const emitBlock = (xml.match(/<emit>([\s\S]*?)<\/emit>/) || [])[1] || '';
  const enderBlock = (emitBlock.match(/<enderEmit>([\s\S]*?)<\/enderEmit>/) || [])[1] || '';

  const supplier: ParsedSupplier = {
    name: get(/<xNome>([\s\S]*?)<\/xNome>/),
    cnpj: get(/<CNPJ>([\s\S]*?)<\/CNPJ>/),
    address:
      get(/<xLgr>([\s\S]*?)<\/xLgr>/) +
      (get(/<nro>([\s\S]*?)<\/nro>/) ? ', ' + get(/<nro>([\s\S]*?)<\/nro>/) : '') +
      (get(/<xBairro>([\s\S]*?)<\/xBairro>/) ? ' - ' + get(/<xBairro>([\s\S]*?)<\/xBairro>/) : ''),
    city: get(/<xMun>([\s\S]*?)<\/xMun>/),
    state: get(/<UF>([\s\S]*?)<\/UF>/),
    zip: get(/<CEP>([\s\S]*?)<\/CEP>/),
    phone: get(/<fone>([\s\S]*?)<\/fone>/),
    email: get(/<email>([\s\S]*?)<\/email>/),
  };

  const items: NFRecordItem[] = [];
  const detRe = /<det[^>]*nItem="\d+"[^>]*>([\s\S]*?)<\/det>/g;
  let dm: RegExpExecArray | null;
  while ((dm = detRe.exec(xml))) {
    const block = dm[1];
    const xProd = (block.match(/<xProd>([\s\S]*?)<\/xProd>/) || [])[1] || '';
    const qCom = (block.match(/<qCom>([\s\S]*?)<\/qCom>/) || [])[1] || '0';
    const vUnCom = (block.match(/<vUnCom>([\s\S]*?)<\/vUnCom>/) || [])[1] || '0';
    const vProd = (block.match(/<vProd>([\s\S]*?)<\/vProd>/) || [])[1] || '0';
    if (xProd) {
      items.push({
        productName: xProd.trim(),
        quantity: parseBRNumber(qCom),
        unitPrice: parseBRNumber(vUnCom),
        subtotal: parseBRNumber(vProd),
      });
    }
  }

  const total = parseBRNumber(get(/<vNF>([\s\S]*?)<\/vNF>/));
  const chNFe = get(/<chNFe>([\s\S]*?)<\/chNFe>/) || get(/Id="NFe([\d]{44})"/);

  return {
    source: 'xml',
    templateId: 'danfe',
    supplier,
    documentNumber: get(/<nNF>([\s\S]*?)<\/nNF>/),
    qrAccessKey: chNFe,
    total,
    items,
    warnings: items.length ? [] : ['Nenhum item extraido do XML.'],
  };
}

// ── Acurácia ──────────────────────────────────────────────────────────

export function scoreAgainstGroundTruth(
  extracted: ParsedDocument,
  truth: { items?: NFRecordItem[]; total?: number },
) {
  const expectedItems = truth.items || [];
  const got = extracted.items || [];
  let numericOk = 0;
  let numericTotal = 0;
  const len = Math.min(expectedItems.length, got.length);
  for (let i = 0; i < len; i++) {
    for (const f of ['quantity', 'unitPrice', 'subtotal'] as const) {
      numericTotal++;
      const exp = expectedItems[i][f];
      const act = got[i]?.[f];
      if (exp && act && Math.abs(exp - act) / Math.abs(exp) <= 0.01) numericOk++;
      else if (!exp && !act) numericOk++;
    }
  }
  const totalExp = truth.total;
  const totalMatch = totalExp
    ? Math.abs(totalExp - (extracted.total || 0)) / Math.abs(totalExp) <= 0.01
    : false;

  return {
    itemCount: { expected: expectedItems.length, got: got.length, ok: expectedItems.length === got.length },
    lineAccuracyPct: got.length ? Math.round((len / got.length) * 100) : 0,
    numericAccuracyPct: numericTotal ? Math.round((numericOk / numericTotal) * 100) : 0,
    totalMatch,
  };
}
