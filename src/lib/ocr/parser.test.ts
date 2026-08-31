import { describe, it, expect } from 'vitest';
import {
  parseBRNumber,
  parseOcr,
  detectTemplate,
  parseNFeXml,
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
