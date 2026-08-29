import { describe, it, expect } from 'vitest';
import { rowToNFRecord, nfRecordToRow } from './storageService';
import type { NFRecord } from '../types';

const orgId = 'org-1';
const branchId = 'br-1';

const row = {
  id: 'nf-x',
  scan_date: '2026-01-01T00:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
  organization_id: orgId,
  store_branch_id: branchId,
  supplier_name: 'AMBEV',
  total_amount: 271,
  items: [{ productName: 'Cerveja', quantity: 1, unitPrice: 2.5 }],
  note: 'obs',
  nf_number: '123',
  source: 'ocr',
  document_number: '123',
  access_key: '12345678901234567890123456789012345678901234',
  template_id: 'ambev',
  ocr_confidence: 88,
  status: 'confirmed',
  observation: 'ajuste',
  supplier_id: 'sup-1',
  supplier_snapshot: { name: 'AMBEV', cnpj: '07.526.557/0001-00' },
  images: ['nf-documents/org-1/br-1/nf-x/1.jpg'],
};

describe('NFRecord mappers (blindagem: 3 caminhos)', () => {
  it('rowToNFRecord mapeia todas as colunas novas', () => {
    const r = rowToNFRecord(row);
    expect(r.id).toBe('nf-x');
    expect(r.supplierName).toBe('AMBEV');
    expect(r.totalValue).toBe(271);
    expect(r.note).toBe('obs');
    expect(r.nfNumber).toBe('123');
    expect(r.source).toBe('ocr');
    expect(r.documentNumber).toBe('123');
    expect(r.accessKey).toBe('12345678901234567890123456789012345678901234');
    expect(r.templateId).toBe('ambev');
    expect(r.ocrConfidence).toBe(88);
    expect(r.status).toBe('confirmed');
    expect(r.observation).toBe('ajuste');
    expect(r.supplierId).toBe('sup-1');
    expect(r.supplierSnapshot?.cnpj).toBe('07.526.557/0001-00');
    expect(r.images).toEqual(['nf-documents/org-1/br-1/nf-x/1.jpg']);
  });

  it('nfRecordToRow ida e volta preserva campos', () => {
    const out = nfRecordToRow(rowToNFRecord(row), orgId, branchId);
    expect(out.organization_id).toBe(orgId);
    expect(out.store_branch_id).toBe(branchId);
    expect(out.supplier_name).toBe('AMBEV');
    expect(out.nf_number).toBe('123');
    expect(out.document_number).toBe('123');
    expect(out.access_key).toBe('12345678901234567890123456789012345678901234');
    expect(out.template_id).toBe('ambev');
    expect(out.ocr_confidence).toBe(88);
    expect(out.status).toBe('confirmed');
    expect(out.supplier_id).toBe('sup-1');
    expect(out.supplier_snapshot).toEqual({ name: 'AMBEV', cnpj: '07.526.557/0001-00' });
    expect(out.images).toEqual(['nf-documents/org-1/br-1/nf-x/1.jpg']);
  });

  it('colunas novas presentes no payload de upsert (sem perda)', () => {
    const out = nfRecordToRow(rowToNFRecord(row), orgId, branchId);
    const keys = Object.keys(out);
    for (const c of [
      'source', 'document_number', 'access_key', 'template_id',
      'ocr_confidence', 'status', 'observation', 'supplier_id',
      'supplier_snapshot', 'images', 'nf_number',
    ]) {
      expect(keys).toContain(c);
    }
  });

  it('trata imagem única (string) como array', () => {
    const r = rowToNFRecord({ ...row, images: 'nf-documents/x/y/z.jpg' });
    expect(Array.isArray(r.images)).toBe(true);
    expect(r.images![0]).toBe('nf-documents/x/y/z.jpg');
  });

  it('fallback quando campos ausentes', () => {
    const r = rowToNFRecord({ id: 'nf-2', organization_id: orgId });
    expect(r.status).toBe('pending');
    expect(r.supplierName).toBe('');
    expect(r.items).toEqual([]);
  });
});
