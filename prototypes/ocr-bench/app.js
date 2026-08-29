// app.js — UI do prototype (browser). Carrega Tesseract (UMD) e parser.js (ESM).
// Tres fontes: OCR (camera/foto), Upload XML, Manual. Sem banco, sem IA.
import { parseOcr, parseNFeXml, detectTemplate, scoreAgainstGroundTruth, parseBRNumber } from './parser.js';

let TEMPLATES = [];
let doc = emptyDoc();
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

function emptyDoc() {
  return { source: 'ocr', templateId: 'generic', supplier: {}, documentNumber: '', qrAccessKey: '', total: 0, items: [], observation: '', status: 'pending' };
}
function recomputeTotals() {
  doc.total = doc.items.reduce((s, i) => s + (Number(i.subtotal) || 0), 0);
  if (doc.items.length && !doc.total) doc.total = doc.items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.unitPrice) || 0), 0);
  pushJSON();
}

async function loadTemplates() {
  const res = await fetch('./templates.json');
  TEMPLATES = (await res.json()).templates;
}

async function ocrImage(file) {
  if (!window.Tesseract) throw new Error('Tesseract nao carregou (sem rede para CDN?).');
  const { data } = await window.Tesseract.recognize(URL.createObjectURL(file), 'por', {
    logger: (m) => { if (m.status === 'recognizing text') $('#ocrStatus').textContent = `OCR ${Math.round(m.progress * 100)}%`; },
  });
  return data.text;
}
async function detectQR(file) {
  if (!('BarcodeDetector' in window)) return '';
  try {
    const bd = new BarcodeDetector({ formats: ['qr_code'] });
    const img = await createImageBitmap(file);
    const codes = await bd.detect(img);
    const qr = codes.find((c) => c.format === 'qr_code');
    return qr ? qr.rawValue : '';
  } catch { return ''; }
}

async function handleOcrFiles(fileList) {
  $('#ocrStatus').textContent = 'Iniciando OCR...';
  let text = '', qr = '';
  for (const f of fileList) {
    text += '\n' + (await ocrImage(f));
    if (!qr) qr = await detectQR(f);
  }
  doc = emptyDoc();
  doc.source = 'ocr';
  const tpl = detectTemplate(text, TEMPLATES);
  Object.assign(doc, parseOcr(text, tpl));
  if (qr) doc.qrAccessKey = qr;
  $('#ocrStatus').textContent = `OCR concluído (template: ${tpl.id}). Revise e ajuste.`;
  renderDoc();
}
async function handleXml(file) {
  const xml = await file.text();
  doc = emptyDoc();
  Object.assign(doc, parseNFeXml(xml));
  renderDoc();
}
function addManualItem() { doc.items.push({ name: '', qty: 1, unitPrice: 0, subtotal: 0 }); renderDoc(); }

function pushJSON() {
  $('#jsonOut').value = JSON.stringify({
    source: doc.source, templateId: doc.templateId, status: doc.status,
    qrAccessKey: doc.qrAccessKey, documentNumber: doc.documentNumber,
    supplier: doc.supplier, observation: doc.observation,
    total: doc.total, items: doc.items,
  }, null, 2);
}

function renderDoc() {
  const s = doc.supplier || {};
  const sup = `
    <div class="box">
      <div class="box-title">Fornecedor (do documento)
        <button id="addSupplierBtn" class="mini">Adicionar fornecedor</button>
      </div>
      <div class="grid">
        <label>Nome<input data-sup="name" value="${esc(s.name || '')}"></label>
        <label>CNPJ<input data-sup="cnpj" value="${esc(s.cnpj || '')}"></label>
        <label>Endereço<input data-sup="address" value="${esc(s.address || '')}"></label>
        <label>Cidade<input data-sup="city" value="${esc(s.city || '')}"></label>
        <label>UF<input data-sup="state" value="${esc(s.state || '')}"></label>
        <label>CEP<input data-sup="zip" value="${esc(s.zip || '')}"></label>
        <label>Telefone<input data-sup="phone" value="${esc(s.phone || '')}"></label>
        <label>Email<input data-sup="email" value="${esc(s.email || '')}"></label>
      </div>
      <div id="supplierLog" class="log"></div>
    </div>`;

  const rows = doc.items.map((it, i) => `
    <tr>
      <td><input data-it="name" data-i="${i}" value="${esc(it.name || '')}"></td>
      <td class="num">
        <button class="pm" data-act="dec" data-i="${i}">−</button>
        <input data-it="qty" data-i="${i}" type="number" value="${it.qty ?? 0}">
        <button class="pm" data-act="inc" data-i="${i}">+</button>
      </td>
      <td><input data-it="unitPrice" data-i="${i}" type="number" step="0.01" value="${it.unitPrice ?? 0}"></td>
      <td><input data-it="subtotal" data-i="${i}" type="number" step="0.01" value="${it.subtotal ?? 0}"></td>
      <td><input data-it="observation" data-i="${i}" placeholder="justificativa (opcional)"></td>
      <td><button class="pm del" data-act="del" data-i="${i}">×</button></td>
    </tr>`).join('');

  $('#docEditor').innerHTML = `
    ${sup}
    <div class="bar">
      <span>Doc: <input id="docNumber" value="${esc(doc.documentNumber || '')}" placeholder="número/pedido"></span>
      <span>Chave Acesso (QR): <input id="qrKey" value="${esc(doc.qrAccessKey || '')}" style="width:280px"></span>
      <span>Status:
        <select id="docStatus">
          <option value="pending" ${doc.status === 'pending' ? 'selected' : ''}>Pendente</option>
          <option value="confirmed" ${doc.status === 'confirmed' ? 'selected' : ''}>Confirmado</option>
          <option value="adjusted" ${doc.status === 'adjusted' ? 'selected' : ''}>Ajustado</option>
        </select>
      </span>
      <button id="addItemBtn" class="mini">+ Item</button>
    </div>
    <table class="items">
      <thead><tr><th>Produto</th><th>Qtd</th><th>Vl Unit</th><th>Subtotal</th><th>Observação</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" style="text-align:center;color:#888">sem itens — use "+ Item" ou OCR</td></tr>'}</tbody>
    </table>
    <div class="bar"><b>Total: R$ <span id="totalOut">${(doc.total || 0).toFixed(2)}</span></b></div>
    <div class="box"><label>Observação geral do documento<textarea id="obsGlobal" placeholder="motivo de ajustes, divergências...">${esc(doc.observation || '')}</textarea></label></div>`;

  bindEditor();
  pushJSON();
}

function bindEditor() {
  $('#docEditor').querySelectorAll('[data-sup]').forEach((el) => el.oninput = (e) => { doc.supplier[el.dataset.sup] = e.target.value; pushJSON(); });
  $('#docEditor').querySelectorAll('[data-it]').forEach((el) => el.oninput = (e) => {
    const i = +el.dataset.i; const f = el.dataset.it;
    doc.items[i][f] = (f === 'name' || f === 'observation') ? e.target.value : Number(e.target.value);
    if (f === 'qty' || f === 'unitPrice') doc.items[i].subtotal = (doc.items[i].qty || 0) * (doc.items[i].unitPrice || 0);
    recomputeTotals(); renderDoc();
  });
  $('#docEditor').querySelectorAll('.pm').forEach((el) => el.onclick = () => {
    const i = +el.dataset.i; const act = el.dataset.act;
    if (act === 'inc') doc.items[i].qty = (doc.items[i].qty || 0) + 1;
    if (act === 'dec') doc.items[i].qty = Math.max(0, (doc.items[i].qty || 0) - 1);
    if (act === 'del') doc.items.splice(i, 1);
    doc.items.forEach(it => it.subtotal = (it.qty || 0) * (it.unitPrice || 0));
    recomputeTotals(); renderDoc();
  });
  $('#addItemBtn').onclick = addManualItem;
  $('#docNumber').oninput = (e) => { doc.documentNumber = e.target.value; pushJSON(); };
  $('#qrKey').oninput = (e) => { doc.qrAccessKey = e.target.value; pushJSON(); };
  $('#docStatus').onchange = (e) => { doc.status = e.target.value; pushJSON(); };
  $('#obsGlobal').oninput = (e) => { doc.observation = e.target.value; pushJSON(); };
  $('#addSupplierBtn').onclick = () => {
    $('#supplierLog').textContent = 'Fornecedor capturado no doc (sem gravar no banco nesta Fase 0). Em produção -> storageService.saveSupplier().';
    doc.supplier._captured = true;
  };
}

function esc(v) { return String(v ?? '').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

function setTab(t) {
  $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
  $$('.panel').forEach((p) => p.classList.toggle('show', p.id === 'tab' + t));
}

function runAccuracy() {
  const expTotal = parseBRNumber($('#expTotal').value || '0');
  const expItems = parseInt($('#expItems').value || '0', 10);
  const score = scoreAgainstGroundTruth(doc, { items: doc.items.slice(0, expItems), total: expTotal });
  $('#accOut').textContent = JSON.stringify(score, null, 2);
}

window.addEventListener('DOMContentLoaded', async () => {
  await loadTemplates();
  $('#fileOcr').addEventListener('change', (e) => handleOcrFiles(e.target.files));
  $('#fileXml').addEventListener('change', (e) => handleXml(e.target.files[0]));
  $$('.tab').forEach((b) => b.onclick = () => setTab(b.dataset.tab));
  $('#copyJson').onclick = () => { navigator.clipboard.writeText($('#jsonOut').value); };
  $('#accBtn').onclick = runAccuracy;
  setTab('Ocr');
  renderDoc();
});
