import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { computeEan13, paginateProducts, BarcodeLabelModal } from './BarcodeLabelModal';
import { Product } from '../../types';

function makeProducts(n: number): Product[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `Produto ${i + 1}`,
    barcode: String(789000000000 + i).slice(0, 12),
    category: 'Geral',
    unit: 'un',
    costPrice: 5,
    salePrice: 10 + i,
    currentStock: 10,
    minStock: 0,
    maxStock: 100,
    imageUrl: '',
    active: true,
    updatedAt: new Date().toISOString(),
    organizationId: 'org1',
    storeBranchId: 'b1',
  } as Product));
}

describe('computeEan13', () => {
  it('calcula o dígito verificador correto para um EAN-13 completo (cenário feliz)', () => {
    expect(computeEan13('789123456789')).toBe('7891234567895');
    expect(computeEan13('400638133393')).toBe('4006381333931');
  });

  it('completa códigos curtos com zeros até 12 dígitos', () => {
    // 12 dígitos só de zeros → check digit 0
    expect(computeEan13('')).toBe('0000000000000');
    expect(computeEan13('123')).toBe('1230000000000');
  });

  it('remove caracteres não-numéricos antes de codificar', () => {
    expect(computeEan13('78 9123-4567 89')).toBe('7891234567895');
  });

  it('trunca códigos com mais de 12 dígitos', () => {
    expect(computeEan13('123456789012345678')).toBe('1234567890128');
  });
});

describe('paginateProducts — folhas A4 de 12 etiquetas', () => {
  it('uma folha para até 12 produtos (cenário feliz)', () => {
    const pages = paginateProducts(makeProducts(12));
    expect(pages).toHaveLength(1);
    expect(pages[0]).toHaveLength(12);
  });

  it('folha extra apenas quando passa de 12 produtos', () => {
    const pages = paginateProducts(makeProducts(13));
    expect(pages).toHaveLength(2);
    expect(pages[0]).toHaveLength(12);
    expect(pages[1]).toHaveLength(1);
  });

  it('última folha com menos etiquetas (238 produtos → 20 folhas, última com 10)', () => {
    const pages = paginateProducts(makeProducts(238));
    expect(pages).toHaveLength(20);
    expect(pages[19]).toHaveLength(238 - 19 * 12);
  });

  it('lista vazia → nenhuma folha', () => {
    expect(paginateProducts([])).toEqual([]);
  });
});

describe('BarcodeLabelModal — pré-visualização A4 paginada', () => {
  it('mostra "Página 1 de N" e navega entre folhas com as setas', () => {
    render(<BarcodeLabelModal isOpen products={makeProducts(25)} onClose={() => {}} />);
    expect(screen.getByText('Página 1 de 3')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Próxima página'));
    expect(screen.getByText('Página 2 de 3')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Página anterior'));
    expect(screen.getByText('Página 1 de 3')).toBeTruthy();
  });

  it('última folha renderiza só as etiquetas restantes (13 produtos)', () => {
    render(<BarcodeLabelModal isOpen products={makeProducts(13)} onClose={() => {}} />);
    fireEvent.click(screen.getByLabelText('Próxima página'));
    expect(screen.getByText('Página 2 de 2')).toBeTruthy();
    // "Produto 13" aparece no preview E na área de impressão (hidden no DOM) — 
    // o que importa é que a 2ª folha contém a etiqueta restante.
    expect(screen.getAllByText('Produto 13').length).toBeGreaterThan(0);
  });

  it('NUNCA mostra mais de 12 etiquetas por folha (18 produtos → 12 + 6)', () => {
    render(<BarcodeLabelModal isOpen products={makeProducts(18)} onClose={() => {}} />);
    // Preview (folha escalada): exatamente 12 etiquetas (grade 3×4 travada).
    // A área de impressão também está no DOM (hidden) com TODAS as etiquetas
    // (18), por isso o escopo é restrito ao preview via data-testid.
    const sheet = within(screen.getByTestId('a4-preview-sheet'));
    expect(sheet.getAllByTestId('barcode-label')).toHaveLength(12);
    // Folha 2: só as 6 restantes
    fireEvent.click(screen.getByLabelText('Próxima página'));
    expect(sheet.getAllByTestId('barcode-label')).toHaveLength(6);
    expect(screen.getByText('Página 2 de 2')).toBeTruthy();
  });

  it('folha com 12 produtos exata → única página com 12 etiquetas', () => {
    render(<BarcodeLabelModal isOpen products={makeProducts(12)} onClose={() => {}} />);
    const sheet = within(screen.getByTestId('a4-preview-sheet'));
    expect(sheet.getAllByTestId('barcode-label')).toHaveLength(12);
    // Sem paginação (uma folha só) — setas não existem
    expect(screen.queryByLabelText('Próxima página')).toBeNull();
    expect(screen.queryByText(/Página 1 de/)).toBeNull();
  });
});