// parser.js — parser OCR / XML compartilhado (Fase 0, sem banco, sem IA).
// Roda em browser (ESM) e Node (ESM). OCR em si é feito pelo Tesseract.js
// (browser) ou tesseract.js (node); este arquivo só transforma TEXTO em dados.

export function parseBRNumber(input) {
  if (input === null || input === undefined) return 0;
  let s = String(input).trim();
  if (!s) return 0;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    // vírgula = decimal, ponto = milhar  -> 1.234,56 => 1234.56
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (hasComma && !hasDot) {
    s = s.replace(',', '.');
  }
  const n = parseFloat(s.replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

// 'm' (multiline) only — NUNCA 'g', senão .exec() avança lastIndex e pula linhas.
function compile(str) {
  return new RegExp(str, 'm');
}

function firstMatch(text, def) {
  if (!def || !def.regex) return '';
  const m = compile(def.regex).exec(text);
  const g = def.group ?? 1; // ?? (não ||) para respeitar group 0 (match inteiro)
  return m ? (m[g] || '').trim() : '';
}

export function detectTemplate(text, templates) {
  const t = (text || '').toLowerCase();
  for (const tp of templates) {
    const kw = tp.match && tp.match.keywords;
    if (kw && kw.some((k) => t.includes(k.toLowerCase()))) return tp;
  }
  return templates.find((x) => x.id === 'generic') || templates[0];
}

export function parseOcr(text, template) {
  const result = {
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
      result.supplier[k] = firstMatch(text, def);
    }
  }
  const lines = text.split(/\r?\n/);
  const itemRe = template.itemLine ? compile(template.itemLine.regex) : null;
  const map = (template.itemLine && template.itemLine.map) || {};
  let matched = 0;
  for (const line of lines) {
    if (!itemRe) break;
    const m = itemRe.exec(line);
    if (!m) continue;
    const item = {};
    for (const [field, grp] of Object.entries(map)) {
      const v = (m[grp] || '').trim();
      item[field] = field === 'name' || field === 'code' ? v : parseBRNumber(v);
    }
    const hasQty = item.qty > 0;
    const hasVal = item.unitPrice > 0 || item.subtotal > 0;
    if (item.name && (hasQty || hasVal)) {
      // Auto-fix de vírgula decimal perdida (Tesseract lê "6,00" como 600).
      // Se qtd*unitPrice == subtotal*100 (ou seja, 100x maior), desloca decimal.
      if (item.subtotal > 0 && item.unitPrice > 0 && item.qty > 0) {
        const raw = item.qty * item.unitPrice;
        if (Math.abs(raw - item.subtotal * 100) < Math.abs(item.subtotal) + 1 && Math.abs(raw / 100 - item.subtotal) < Math.abs(item.subtotal) * 0.05) {
          item.unitPrice = item.unitPrice / 100;
          item._decimalFixed = true;
        }
      }
      result.items.push(item);
      matched++;
    }
  }
  if (matched === 0)
    result.warnings.push('Nenhuma linha de item casou com o template. Afinar regex ou usar modo manual.');
  if (!result.total && result.items.length)
    result.warnings.push('Total não detectado; será soma dos subtotais.');
  return result;
}

// Parser NF-e (XML) — regex sobre o texto do XML (sem DOMParser, funciona em node e browser).
export function parseNFeXml(xml) {
  const get = (re) => {
    const m = re.exec(xml);
    return m ? m[1].trim() : '';
  };
  const emitBlock = (xml.match(/<emit>([\s\S]*?)<\/emit>/) || [])[1] || '';
  const enderBlock = (emitBlock.match(/<enderEmit>([\s\S]*?)<\/enderEmit>/) || [])[1] || '';
  const supplier = {
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
  const items = [];
  const detRe = /<det[^>]*nItem="\d+"[^>]*>([\s\S]*?)<\/det>/g;
  let dm;
  while ((dm = detRe.exec(xml))) {
    const block = dm[1];
    const xProd = (block.match(/<xProd>([\s\S]*?)<\/xProd>/) || [])[1] || '';
    const qCom = (block.match(/<qCom>([\s\S]*?)<\/qCom>/) || [])[1] || '0';
    const vUnCom = (block.match(/<vUnCom>([\s\S]*?)<\/vUnCom>/) || [])[1] || '0';
    const vProd = (block.match(/<vProd>([\s\S]*?)<\/vProd>/) || [])[1] || '0';
    if (xProd) items.push({ name: xProd.trim(), qty: parseBRNumber(qCom), unitPrice: parseBRNumber(vUnCom), subtotal: parseBRNumber(vProd) });
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

// Avalia acurácia contra um ground-truth informado pelo usuário.
export function scoreAgainstGroundTruth(extracted, truth) {
  const expectedItems = truth.items || [];
  const got = extracted.items || [];
  let numericOk = 0;
  let numericTotal = 0;
  const len = Math.min(expectedItems.length, got.length);
  for (let i = 0; i < len; i++) {
    for (const f of ['qty', 'unitPrice', 'subtotal']) {
      numericTotal++;
      const exp = expectedItems[i][f];
      const act = got[i][f];
      if (exp && act && Math.abs(exp - act) / Math.abs(exp) <= 0.01) numericOk++;
      else if (!exp && !act) numericOk++;
    }
  }
  const totalExp = truth.total;
  const totalMatch = totalExp ? Math.abs(totalExp - (extracted.total || 0)) / Math.abs(totalExp) <= 0.01 : false;
  return {
    itemCount: { expected: expectedItems.length, got: got.length, ok: expectedItems.length === got.length },
    lineAccuracyPct: got.length ? Math.round((len / got.length) * 100) : 0,
    numericAccuracyPct: numericTotal ? Math.round((numericOk / numericTotal) * 100) : 0,
    totalMatch,
  };
}
