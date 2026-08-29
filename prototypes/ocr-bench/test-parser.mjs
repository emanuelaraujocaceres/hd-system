// test-parser.mjs — valida o motor de templates contra textos OCR simulados.
// (Estes textos NAO sao fotos reais; servem para provar a logica de extracao.
//  A acuracia real do OCR sobre fotos deve ser medida no browser com run-ocr.mjs / index.html.)
import { parseOcr, parseNFeXml, detectTemplate, scoreAgainstGroundTruth } from './parser.js';
import templates from './templates.json' with { type: 'json' };

const samples = {
  danfe: `
DANFE
DOCUMENTO AUXILIAR DA NOTA FISCAL ELETRONICA
RAZAO SOCIAL: BEBIDAS EXEMPLO LTDA
CNPJ: 12.345.678/0001-90
NUMERO: 000123456
PRODUTO                                  QTD   VL UNIT   VL TOTAL
1 REFRIGERANTE COCA COLA 2L               12     6,00       72,00
2 CERVEJA SKOL 350ML                      24     2,50       60,00
3 SNICKERS 40G                            10     3,20       32,00
VALOR TOTAL DA NOTA FISCAL:              164,00
`,
  ambev: `
AMBEV S/A
CNPJ: 07.526.557/0001-00
PEDIDO: 998877
ITEM                                    QTD   VL UNIT   VL TOTAL
1001 CERVEJA BRAHMA 600ML                 50    3,10       155,00
1002 CERVEJA ANTARCTICA 350ML             40    2,90       116,00
TOTAL: 271,00
`,
  coca: `
COCA-COLA INDUSTRIAS LTDA
CNPJ: 33.644.134/0001-44
NOTA: 556677
PRODUTO                                QTD   VL UNIT   VL TOTAL
1 REFRIGERANTE COCA 2L                  20    6,50       130,00
2 REFRIGERANTE GUARANA 2L                15    5,90        88,50
TOTAL GERAL: 218,50
`,
  lagoazul: `
LAGO AZUL DISTRIBUIDORA
CNPJ: 11.222.333/0001-44
DOC: 4455
PRODUTO                                QTD   VL UNIT   VL TOTAL
AGUA MINERAL 500ML                     30    1,20        36,00
SUCO DEL VALLE 1L                      25    4,00       100,00
TOTAL: 136,00
`,
};

let pass = 0, fail = 0;
for (const [id, text] of Object.entries(samples)) {
  const tpl = detectTemplate(text, templates.templates);
  const r = parseOcr(text, tpl);
  console.log(`\n=== ${id.toUpperCase()} -> template: ${tpl.id} ===`);
  console.log('Fornecedor:', r.supplier.name || '(vazio)');
  console.log('CNPJ:', r.supplier.cnpj || '(vazio)');
  console.log('Doc:', r.documentNumber, '| Total:', r.total, '| Itens:', r.items.length);
  console.log('Itens:', JSON.stringify(r.items, null, 0));
  if (r.warnings.length) console.log('Avisos:', r.warnings.join(' | '));
  const expected = {
    items: samples[id].split('\n').filter(l => /\d[\d.,]*\s+\d[\d.,]*\s+\d[\d.,]*\s*$/.test(l)).length,
  };
  const score = scoreAgainstGroundTruth(r, { items: r.items, total: r.total });
  console.log('Score(parcial):', JSON.stringify(score));
  if (r.items.length > 0) pass++; else fail++;
}
console.log(`\nResumo: ${pass} amostras extrairam itens, ${fail} falharam.`);
