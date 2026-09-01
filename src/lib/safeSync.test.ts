import { describe, it, expect, vi } from 'vitest';
import { asArray, withSyncGuard, mapRows, isValidRemoteRow, safeParseJson } from './safeSync';

// ── asArray ──────────────────────────────────────────────────────────

describe('asArray', () => {
  it('retorna o array original quando dado um array válido', () => {
    expect(asArray([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('retorna array vazio para null/undefined/não-array', () => {
    expect(asArray(null)).toEqual([]);
    expect(asArray(undefined)).toEqual([]);
    expect(asArray('hello')).toEqual([]);
    expect(asArray(123)).toEqual([]);
    expect(asArray({})).toEqual([]);
  });

  it('filtra null/undefined dentro do array', () => {
    expect(asArray([1, null, 2, undefined, 3])).toEqual([1, 2, 3]);
  });

  it('preserva objetos e tipos mistos', () => {
    const objs = [{ id: 1 }, null, { id: 2 }];
    expect(asArray(objs)).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('retorna array vazio para array vazio', () => {
    expect(asArray([])).toEqual([]);
  });
});

// ── withSyncGuard ────────────────────────────────────────────────────

describe('withSyncGuard', () => {
  it('retorna o resultado da função quando não lança', () => {
    expect(withSyncGuard(() => 42, 0)).toBe(42);
    expect(withSyncGuard(() => 'ok', 'fallback')).toBe('ok');
  });

  it('retorna o fallback quando a função lança exceção', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorFn = () => { throw new Error('boom'); };
    expect(withSyncGuard(errorFn, 'fallback', 'testLabel')).toBe('fallback');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('[HD-Sync] testLabel falhou (guardado):'),
      expect.any(Error),
    );
    spy.mockRestore();
  });

  it('usa label padrão "sync" quando não informado', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorFn = () => { throw new Error('x'); };
    withSyncGuard(errorFn, null);
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('[HD-Sync] sync falhou'),
      expect.any(Error),
    );
    spy.mockRestore();
  });
});

// ── mapRows ──────────────────────────────────────────────────────────

describe('mapRows', () => {
  it('mapeia linhas válidas', () => {
    const rows = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }];
    const result = mapRows(rows, (r) => ({ id: r.id, name: r.name }), 'test');
    expect(result).toEqual([
      { id: 1, name: 'A' },
      { id: 2, name: 'B' },
    ]);
  });

  it('retorna array vazio para input não-array', () => {
    expect(mapRows(null, (r) => r)).toEqual([]);
    expect(mapRows(undefined, (r) => r)).toEqual([]);
  });

  it('pula linhas que causam exceção no mapper', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rows = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const mapper = (r: any) => {
      if (r.id === 2) throw new Error('bad row');
      return r.id;
    };
    const result = mapRows(rows, mapper, 'testMapper');
    expect(result).toEqual([1, 3]);
    spy.mockRestore();
  });

  it('filtra null/undefined do array de entrada antes de mapear', () => {
    const rows = [1, null, 2, undefined, 3];
    const result = mapRows(rows, (r) => r * 10);
    expect(result).toEqual([10, 20, 30]);
  });
});

// ── isValidRemoteRow ─────────────────────────────────────────────────

describe('isValidRemoteRow', () => {
  it('retorna true para objetos simples', () => {
    expect(isValidRemoteRow({ id: 1 })).toBe(true);
    expect(isValidRemoteRow({ a: 1, b: 'x' })).toBe(true);
  });

  it('retorna false para null/undefined/primitivos', () => {
    expect(isValidRemoteRow(null)).toBe(false);
    expect(isValidRemoteRow(undefined)).toBe(false);
    expect(isValidRemoteRow('string')).toBe(false);
    expect(isValidRemoteRow(42)).toBe(false);
    expect(isValidRemoteRow(true)).toBe(false);
  });

  it('retorna false para arrays', () => {
    expect(isValidRemoteRow([])).toBe(false);
    expect(isValidRemoteRow([1, 2, 3])).toBe(false);
  });
});

// ── safeParseJson ────────────────────────────────────────────────────

describe('safeParseJson', () => {
  it('parseia string JSON válida', () => {
    expect(safeParseJson('{"a":1}')).toEqual({ a: 1 });
    expect(safeParseJson('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it('retorna objeto como está quando já é objeto', () => {
    const obj = { key: 'val' };
    expect(safeParseJson(obj)).toBe(obj); // referência idêntica
  });

  it('retorna array como está quando já é array', () => {
    const arr = [1, 2];
    expect(safeParseJson(arr)).toBe(arr);
  });

  it('retorna null para null/undefined', () => {
    expect(safeParseJson(null)).toBeNull();
    expect(safeParseJson(undefined)).toBeNull();
  });

  it('retorna null para string JSON inválida', () => {
    expect(safeParseJson('not json')).toBeNull();
    expect(safeParseJson('')).toBeNull();
    expect(safeParseJson('{broken')).toBeNull();
  });

  it('retorna null para tipos não suportados (número, booleano)', () => {
    expect(safeParseJson(42)).toBeNull();
    expect(safeParseJson(true)).toBeNull();
  });
});
