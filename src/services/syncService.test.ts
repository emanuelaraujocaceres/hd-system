/**
 * Regressão: fallback não-bloqueante do sync contra PGRST204
 * ("Could not find the '<col>' column of '<table>' in the schema cache").
 *
 * Contexto (2026-09-02): colunas novas enviadas no syncSale (delivery_order_id
 * em e484952, payment_details em 28d2f75) não existiam na tabela sales do banco.
 * O upsert da linha INTEIRA falhava com PGRST204 e a venda ficava presa no
 * dispositivo — nunca sincronizava para o cloud nem para os outros aparelhos.
 *
 * O syncService agora detecta o PGRST204, extrai a coluna ofensiva e retenta 1x
 * dropando SÓ essa coluna, para nunca perder a escrita quando uma coluna de
 * feature ainda não foi migrada no banco.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock do cliente supabase ANTES de importar o syncService, para interceptar
// os upserts sem tocar a rede.
const upsertMock = vi.fn();
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({ upsert: upsertMock }),
    rpc: vi.fn().mockResolvedValue({ error: null }),
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      unsubscribe: vi.fn(),
    }),
    removeChannel: vi.fn(),
  },
}));

import { syncService } from './syncService';

describe('syncService — fallback não-bloqueante contra PGRST204', () => {
  beforeEach(() => {
    upsertMock.mockReset();
    // navigator e navigator.onLine — garante o caminho online.
    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine: true, userAgent: 'test' },
      configurable: true,
    });
  });

  it('_parsePGRST204Column extrai o nome da coluna do erro PGRST204 do PostgREST', () => {
    const svc = syncService as any;
    const error = {
      code: 'PGRST204',
      message:
        "Could not find the 'delivery_order_id' column of 'sales' in the schema cache",
    };
    expect(svc._parsePGRST204Column(error)).toBe('delivery_order_id');
  });

  it('_parsePGRST204Column também reconhece pela mensagem (sem code PGRST204)', () => {
    const svc = syncService as any;
    const error = {
      message:
        'Could not find the "payment_details" column of "sales" in the schema cache',
    };
    expect(svc._parsePGRST204Column(error)).toBe('payment_details');
  });

  it('_parsePGRST204Column retorna null para erros que não são de coluna faltante', () => {
    const svc = syncService as any;
    expect(svc._parsePGRST204Column({ code: 'PGRST204', message: 'nothing here' })).toBeNull();
    expect(svc._parsePGRST204Column({ code: '42501', message: 'permission denied' })).toBeNull();
    expect(svc._parsePGRST204Column({ message: 'network error' })).toBeNull();
    expect(svc._parsePGRST204Column(null)).toBeNull();
  });

  it('tryUpsert retenta dropando a coluna ofensiva quando o 1º upsert falha com PGRST204', async () => {
    // 1ª chamada: PGRST204 (coluna delivery_order_id não existe no schema).
    // 2ª chamada (fallback, sem a coluna): success.
    upsertMock
      .mockResolvedValueOnce({
        error: {
          code: 'PGRST204',
          message:
            "Could not find the 'delivery_order_id' column of 'sales' in the schema cache",
        },
      })
      .mockResolvedValueOnce({ error: null });

    const payload = {
      id: 'sale-123',
      code: 'VEN-001',
      total: 2,
      delivery_order_id: null,
    };

    const result = await (syncService as any).tryUpsert('sales', payload);

    expect(result.ok).toBe(true);
    expect(upsertMock.mock.calls.length).toBe(2);
    // 1ª tentativa enviou o payload completo.
    expect(upsertMock.mock.calls[0][0]).toHaveProperty('delivery_order_id');
    // 2ª tentativa (fallback) não contém a coluna ofensiva e preserva o resto.
    expect(upsertMock.mock.calls[1][0]).not.toHaveProperty('delivery_order_id');
    expect(upsertMock.mock.calls[1][0]).toMatchObject({
      id: 'sale-123',
      code: 'VEN-001',
      total: 2,
    });
  });

  it('tryUpsert NÃO retenta quando o erro não é PGRST204 (ex.: permissão 42501)', async () => {
    upsertMock.mockResolvedValueOnce({
      error: { code: '42501', message: 'permission denied for table sales' },
    });

    const payload = { id: 'sale-123', code: 'VEN-001', total: 2 };
    const result = await (syncService as any).tryUpsert('sales', payload);

    expect(result.ok).toBe(false);
    expect(upsertMock.mock.calls.length).toBe(1);
  });
});
