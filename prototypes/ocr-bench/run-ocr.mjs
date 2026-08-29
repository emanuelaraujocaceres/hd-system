// run-ocr.mjs — CLI Node para OCR de uma imagem (ou .txt de OCR) + parse + acuracia.
// Uso:
//   node run-ocr.mjs foto.jpg                 -> roda Tesseract (precisa: npm install)
//   node run-ocr.mjs foto.txt                 -> usa o texto como OCR (sem dep)
//   node run-ocr.mjs foto.jpg --template danfe
//   node run-ocr.mjs foto.jpg --truth truth.json   (mede acuracia)
import fs from 'node:fs';
import path from 'node:path';
import { parseOcr, detectTemplate, parseNFeXml, scoreAgainstGroundTruth } from './parser.js';
import templates from './templates.json' with { type: 'json' };

const args = process.argv.slice(2);
const file = args[0];
if (!file) { console.error('Uso: node run-ocr.mjs <imagem.jpg|.txt|.xml> [--template id] [--truth arquivo.json]'); process.exit(1); }

const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const tplId = flag('--template');

async function getText() {
  if (file.endsWith('.txt')) return fs.readFileSync(file, 'utf8');
  if (file.endsWith('.xml')) return fs.readFileSync(file, 'utf8');
  // imagem -> tenta tesseract.js
  let Tesseract;
  try { Tesseract = (await import('tesseract.js')).default; }
  catch (e) {
    console.error('tesseract.js nao instalado nesta pasta. Rode "npm install" ou passe um .txt/.xml de exemplo.');
    process.exit(2);
  }
  console.error('Rodando Tesseract (lang=por)...');
  const { data } = await Tesseract.recognize(file, 'por', {
    logger: (m) => { if (m.status === 'recognizing text') console.error(`  OCR ${Math.round(m.progress * 100)}%`); },
  });
  return data.text;
}

(async () => {
  const text = await getText();
  const isXml = file.endsWith('.xml');
  const tpl = tplId ? templates.templates.find((t) => t.id === tplId) : detectTemplate(text, templates.templates);
  const result = isXml ? parseNFeXml(text) : parseOcr(text, tpl);

  if (file.endsWith('.txt') || file.endsWith('.xml'))
    fs.writeFileSync(path.basename(file) + '.ocr.txt', text);

  console.log('\n--- RESULTADO ---');
  console.log(JSON.stringify(result, null, 2));

  const truthPath = flag('--truth');
  if (truthPath) {
    const truth = JSON.parse(fs.readFileSync(truthPath, 'utf8'));
    console.log('\n--- ACURACIA ---');
    console.log(JSON.stringify(scoreAgainstGroundTruth(result, truth), null, 2));
  }
})();
