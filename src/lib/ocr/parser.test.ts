import { describe, it, expect } from 'vitest';
import {
  parseBRNumber,
  parseOcr,
  detectTemplate,
  parseNFeXml,
  scoreAgainstGroundTruth,
} from './parser';
import templatesData from './templates.json';

const TEMPLATES = templatesData.templates;

describe('parseBRNumber', () => {
  it('converte "1.234,56" (milhar com ponto, decimal com vírgula)', () => {
    expect(parseBRNumber('1.234,56')).toBeCloseTo(1234.56, 2);
  });

  it('converte "6,00" (vírgula decimal)', () => {
    expect(parseBRNumber('6,00')).toBeCloseTo(6.0, 2);
  });

  it('converte "123.45" (ponto decimal)', () => {
    expect(parseBRNumber('123.45')).toBeCloseTo(123.45, 2);
  });

  it('retorna 0 para vazio/nulo', () => {
    expect(parseBRNumber('')).toBe(0);
    expect(parseBRNumber(null)).toBe(0);
    expect(parseBRNumber(undefined)).toBe(0);
  });
});

describe('detectTemplate', () => {
  it('detecta template DANFE pelo keyword', () => {
    const tpl = detectTemplate('NOTA FISCAL ELETRONICA - DANFE', TEMPLATES);
    expect(tpl.id).toBe('danfe');
  });

  it('detecta Ambev pelo keyword', () => {
    const tpl = detectTemplate('AMBEV DISTRIBUIDORA', TEMPLATES);
    expect(tpl.id).toBe('ambev');
  });

  it('cai no genérico se nenhum keyword casar', () => {
    const tpl = detectTemplate('algo sem nenhum fornecedor conhecido', TEMPLATES);
    expect(tpl.id).toBe('generic');
  });
});

describe('parseOcr', () => {
  it('extrai fornecedor, número e total de um texto DANFE', () => {
    const text = `
      NOTA FISCAL ELETRONICA
      RAZAO SOCIAL: BEBIDAS EXEMPLO LTDA
      CNPJ: 12.345.678/0001-99
      NUMERO: 4512
      VALOR TOTAL 1234,56
    `;
    const result = parseOcr(text, TEMPLATES.find((t) => t.id === 'danfe')!);
    expect(result.supplier.name).toBe('BEBIDAS EXEMPLO LTDA');
    expect(result.supplier.cnpj).toBe('12.345.678/0001-99');
    expect(result.documentNumber).toBe('4512');
    expect(result.total).toBeCloseTo(1234.56, 2);
  });

  it('extrai itens de linha (código, nome, qtd, unitário, subtotal)', () => {
    const text = `
      001 REFRIGERANTE COLA 350ML 10 3,50 35,00
      002 CERVEJA LATA 350ML 24 2,00 48,00
    `;
    const result = parseOcr(text, TEMPLATES.find((t) => t.id === 'danfe')!);
    expect(result.items.length).toBe(2);
    const first = result.items[0];
    expect(first.productName).toBe('REFRIGERANTE COLA 350ML');
    expect(first.quantity).toBeCloseTo(10, 1);
    expect(first.unitPrice).toBeCloseTo(3.5, 2);
    expect(first.subtotal).toBeCloseTo(35, 2);
  });

  it('gera warning quando nenhuma linha de item casa', () => {
    const result = parseOcr('só texto solto sem números', TEMPLATES.find((t) => t.id === 'danfe')!);
    expect(result.items.length).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe('parseNFeXml', () => {
  it('extrai emitente, itens, total e chave do XML', () => {
    const xml = `<?xml version="1.0"?>
      <nfeProc>
        <NFe>
          <infNFe Id="NFe351607100000000000000000000000000000000001">
            <emit>
              <xNome>FORNECEDOR TESTE SA</xNome>
              <CNPJ>99887766554433</CNPJ>
            </emit>
            <det nItem="1">
              <prod>
                <xProd>CERVEJA 350ML</xProd>
                <qCom>24.0000</qCom>
                <vUnCom>2.5000</vUnCom>
                <vProd>60.00</vProd>
              </prod>
            </det>
            <total><ICMSTot><vNF>60.00</vNF></ICMSTot></total>
          </infNFe>
        </NFe>
      </nfeProc>`;
    const result = parseNFeXml(xml);
    expect(result.supplier.name).toBe('FORNECEDOR TESTE SA');
    expect(result.supplier.cnpj).toBe('99887766554433');
    expect(result.items.length).toBe(1);
    expect(result.items[0].productName).toBe('CERVEJA 350ML');
    expect(result.items[0].quantity).toBeCloseTo(24, 2);
    expect(result.total).toBeCloseTo(60, 2);
  });
});

// ── scoreAgainstGroundTruth ──────────────────────────────────────────

describe('scoreAgainstGroundTruth', () => {
  it('retorna 100% de acurácia para itens e total idênticos', () => {
    const extracted = {
      source: 'ocr' as const,
      templateId: 'test',
      supplier: {},
      documentNumber: '',
      qrAccessKey: '',
      total: 60.0,
      items: [
        { productName: 'CERVEJA', quantity: 24, unitPrice: 2.5, subtotal: 60.0 },
      ],
      warnings: [],
    };
    const truth = {
      items: [
        { productName: 'CERVEJA', quantity: 24, unitPrice: 2.5, subtotal: 60.0 },
      ],
      total: 60.0,
    };
    const score = scoreAgainstGroundTruth(extracted, truth);
    expect(score.itemCount).toEqual({ expected: 1, got: 1, ok: true });
    expect(score.lineAccuracyPct).toBe(100);
    expect(score.numericAccuracyPct).toBe(100);
    expect(score.totalMatch).toBe(true);
  });

  it('detecta diferença de quantidade', () => {
    const extracted = {
      source: 'ocr' as const,
      templateId: 'test',
      supplier: {},
      documentNumber: '',
      qrAccessKey: '',
      total: 100,
      items: [
        { productName: 'A', quantity: 10, unitPrice: 5.0, subtotal: 50 },
      ],
      warnings: [],
    };
    const truth = {
      items: [
        { productName: 'A', quantity: 20, unitPrice: 5.0, subtotal: 100 },
      ],
      total: 100,
    };
    const score = scoreAgainstGroundTruth(extracted, truth);
    // quantity 10 vs 20 > 1% tolerance → misses quantity
    // subtotal 50 vs 100 > 1% → misses subtotal; só unitPrice (5/5) casa
    // numericOk = 1/3 → 33
    expect(score.numericAccuracyPct).toBeLessThan(100);
    expect(score.numericAccuracyPct).toBe(33);
  });

  it('reporta itemCount mismatch quando quantidades diferem', () => {
    const extracted = {
      source: 'ocr' as const,
      templateId: 'test',
      supplier: {},
      documentNumber: '',
      qrAccessKey: '',
      total: 100,
      items: [
        { productName: 'A', quantity: 1, unitPrice: 50, subtotal: 50 },
      ],
      warnings: [],
    };
    const truth = {
      items: [
        { productName: 'A', quantity: 1, unitPrice: 50, subtotal: 50 },
        { productName: 'B', quantity: 1, unitPrice: 50, subtotal: 50 },
      ],
      total: 100,
    };
    const score = scoreAgainstGroundTruth(extracted, truth);
    expect(score.itemCount.ok).toBe(false);
    expect(score.itemCount.expected).toBe(2);
    expect(score.itemCount.got).toBe(1);
  });

  it('acurácia 0% quando nenhum item foi extraído', () => {
    const extracted = {
      source: 'ocr' as const,
      templateId: 'test',
      supplier: {},
      documentNumber: '',
      qrAccessKey: '',
      total: 0,
      items: [],
      warnings: [],
    };
    const truth = {
      items: [
        { productName: 'A', quantity: 1, unitPrice: 10, subtotal: 10 },
      ],
      total: 10,
    };
    const score = scoreAgainstGroundTruth(extracted, truth);
    expect(score.itemCount.ok).toBe(false);
    expect(score.lineAccuracyPct).toBe(0);
    expect(score.numericAccuracyPct).toBe(0);
    expect(score.totalMatch).toBe(false);
  });

  it('tolerância de 1% em campos numéricos (valor muito próximo)', () => {
    const extracted = {
      source: 'ocr' as const,
      templateId: 'test',
      supplier: {},
      documentNumber: '',
      qrAccessKey: '',
      total: 100.5,
      items: [
        { productName: 'X', quantity: 10, unitPrice: 10.01, subtotal: 100.1 },
      ],
      warnings: [],
    };
    const truth = {
      items: [
        { productName: 'X', quantity: 10, unitPrice: 10.0, subtotal: 100.0 },
      ],
      total: 100.0,
    };
    const score = scoreAgainstGroundTruth(extracted, truth);
    // 10/10=1%, 10.01/10=0.1%, 100.1/100=0.1% — all within 1%
    expect(score.numericAccuracyPct).toBe(100);
    // total: abs(100.5-100)/100 = 0.5% → within 1%
    expect(score.totalMatch).toBe(true);
  });

  it('lineAccuracyPct é 0 quando truth não tem items e extracted tem (got > 0)', () => {
    // len = Math.min(0, 2) = 0, lineAccuracyPct = Math.round(0/2*100) = 0
    const extracted = {
      source: 'ocr' as const,
      templateId: 'test',
      supplier: {},
      documentNumber: '',
      qrAccessKey: '',
      total: 0,
      items: [
        { productName: 'A', quantity: 1, unitPrice: 10, subtotal: 10 },
        { productName: 'B', quantity: 1, unitPrice: 20, subtotal: 20 },
      ],
      warnings: [],
    };
    const truth = { items: [], total: 0 };
    const score = scoreAgainstGroundTruth(extracted, truth);
    expect(score.lineAccuracyPct).toBe(0);
    expect(score.numericAccuracyPct).toBe(0);
  });

  it('trata truth sem total (totalMatch = false)', () => {
    const extracted = {
      source: 'xml' as const,
      templateId: 'test',
      supplier: {},
      documentNumber: '',
      qrAccessKey: '',
      total: 100,
      items: [
        { productName: 'A', quantity: 1, unitPrice: 100, subtotal: 100 },
      ],
      warnings: [],
    };
    const truth = {
      items: [
        { productName: 'A', quantity: 1, unitPrice: 100, subtotal: 100 },
      ],
      // total omitted
    };
    const score = scoreAgainstGroundTruth(extracted, truth);
    // truth.total is undefined → totalMatch = false per code
    expect(score.totalMatch).toBe(false);
    expect(score.numericAccuracyPct).toBe(100);
  });
});
