import { describe, it, expect } from 'vitest';
import { isSaleInRange } from './dateFilters';

// Timestamps UTC explícitos tornam o teste determinístico, independente do
// fuso em que a suíte roda (new Date("...Z") é inequívoco).
describe('isSaleInRange — vendas dentro do intervalo de data/hora', () => {
  it('retorna true para venda exatamente no limite inicial (inclusivo)', () => {
    expect(isSaleInRange('2026-09-04T14:00:00.000Z', '2026-09-04T14:00:00.000Z', '2026-09-04T18:00:00.000Z')).toBe(true);
  });

  it('retorna true para venda exatamente no limite final (inclusivo)', () => {
    expect(isSaleInRange('2026-09-04T18:00:00.000Z', '2026-09-04T14:00:00.000Z', '2026-09-04T18:00:00.000Z')).toBe(true);
  });

  it('retorna true para venda no meio do intervalo', () => {
    expect(isSaleInRange('2026-09-04T16:30:00.000Z', '2026-09-04T14:00:00.000Z', '2026-09-04T18:00:00.000Z')).toBe(true);
  });

  it('retorna false para venda antes do limite inicial', () => {
    expect(isSaleInRange('2026-09-04T13:59:00.000Z', '2026-09-04T14:00:00.000Z', '2026-09-04T18:00:00.000Z')).toBe(false);
  });

  it('retorna false para venda depois do limite final', () => {
    expect(isSaleInRange('2026-09-04T18:01:00.000Z', '2026-09-04T14:00:00.000Z', '2026-09-04T18:00:00.000Z')).toBe(false);
  });

  it('limite inicial vazio => sem piso (venda antiga aceita)', () => {
    expect(isSaleInRange('2026-09-01T10:00:00.000Z', '', '2026-09-04T18:00:00.000Z')).toBe(true);
  });

  it('limite final vazio => sem teto (venda futura aceita)', () => {
    expect(isSaleInRange('2026-09-10T10:00:00.000Z', '2026-09-04T00:00:00.000Z', '')).toBe(true);
  });

  it('ambos vazios => aceita qualquer venda', () => {
    expect(isSaleInRange('2026-01-01T00:00:00.000Z', '', '')).toBe(true);
  });

  it('saleDate vazio => fora do intervalo', () => {
    expect(isSaleInRange('', '2026-09-04T14:00:00.000Z', '2026-09-04T18:00:00.000Z')).toBe(false);
  });

  it('saleDate inválido => fora do intervalo', () => {
    expect(isSaleInRange('não-é-data', '2026-09-04T14:00:00.000Z', '')).toBe(false);
  });

  it('limite inválido é ignorado no lado correspondente', () => {
    // from inválido => tratado como sem piso
    expect(isSaleInRange('2026-09-04T16:00:00.000Z', 'inválido', '2026-09-04T18:00:00.000Z')).toBe(true);
  });
});
