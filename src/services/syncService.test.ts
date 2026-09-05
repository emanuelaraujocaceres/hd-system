/**
 * Regressões do syncService:
 *
 * 1. Fallback não-bloqueante contra PGRST204 (coluna faltante no schema cache).
 * 2. CORREÇÃO DE SESSÃO A–D (BUG-037, 2026-09-05):
 *    A) ensureSession valida por get_my_profile — sessão anon (Sem perfil) é
 *       INVÁLIDA (antes: SELECT products anon escopado por header x-branch-id
 *       voltava 0 linhas SEM erro = falsa positiva → gravava como anon → 42501).
 *    B) Escrita sem sessão válida NÃO vai à rede (erro UNAUTH) e é enfileirada;
 *       processPendingQueue MANTÉM a fila; cardápio anon (sem perfil) NÃO é
 *       bloqueado (exceção 0f das policies anon).
 *    C) (UI — não testado aqui; ponte notifyToast em Toast.tsx)
 *    D) DLQ com dedup: o mesmo erro já pendente na DLQ não é replantado.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks globais (antes do import do syncService) ─────────────────
// vi.hoisted: o vi.mock é içado para o topo do arquivo — refs a consts
// top-level só funcionam se inicializadas por vi.hoisted.

const { upsertMock, authGetSessionMock, authSignInMock, rpcMock, dlqState } = vi.hoisted(() => ({
  upsertMock: vi.fn(),
  authGetSessionMock: vi.fn(),
  authSignInMock: vi.fn(),
  rpcMock: vi.fn(),
  // Comportamento do .limit do chainable para a consulta de dedup da DLQ.
  dlqState: {
    limit: null as null | (() => Promise<{ data: { id: string }[] | null; error: any }>),
  },
}));

const makeChain = () => {
  const q: any = {};
  q.upsert = upsertMock;
  q.delete = vi.fn().mockReturnValue(q);
  q.select = vi.fn().mockReturnValue(q);
  q.eq = vi.fn().mockReturnValue(q);
  q.ilike = vi.fn().mockReturnValue(q);
  q.limit = vi.fn().mockImplementation(() =>
    Promise.resolve(dlqState.limit ? dlqState.limit() : { data: [], error: null }),
  );
  q.order = vi.fn().mockReturnValue(q);
  q.range = vi.fn().mockReturnValue(q);
  q.in = vi.fn().mockReturnValue(q);
  q.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  return q;
};

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getSession: authGetSessionMock, signInWithPassword: authSignInMock },
    from: () => makeChain(),
    rpc: rpcMock,
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      unsubscribe: vi.fn(),
    }),
    removeChannel: vi.fn(),
  },
}));

import { syncService } from './syncService';
import { syncQueue } from './syncQueueService';

/** localStorage em memória (o vitest/node não tem). */
function installLocalStorageMock() {
  const store = new Map<string, string>();
  const ls = {
    getItem: (k: string) => (store.has(k) ? store.get(k) : null),
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true, writable: true });
}

const ORG = '9bfef532-5a39-4a92-b422-15f16b6c96b2';
const BRANCH = '160e38a2-a896-4d6b-a6ea-52d4362abf55';

beforeEach(() => {
  installLocalStorageMock();
  // Modo APP por padrão: perfil local salvo (guard de sessão aplica).
  localStorage.setItem('hd_system_user_profile', JSON.stringify({ email: 'teste@loja.com', password: 'senha' }));

  upsertMock.mockReset();
  authGetSessionMock.mockReset();
  authSignInMock.mockReset();
  rpcMock.mockReset();
  dlqState.limit = null;

  // Defaults: sessão armazenada + get_my_profile devolve perfil → válida.
  authGetSessionMock.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
  rpcMock.mockResolvedValue({ error: null, data: { id: 'u1', email: 'teste@loja.com' } });
  // Re-login com credenciais locais: senha não confere (evita falsa re-auth).
  authSignInMock.mockResolvedValue({ error: { message: 'rate limit exceeded' } });

  // Navigator online (garante o caminho de rede).
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: true, userAgent: 'test' },
    configurable: true,
  });

  // Cache de sessão do singleton zerado entre testes.
  const svc = syncService as any;
  svc._sessionCheckedAt = 0;
  svc._sessionValid = false;
  svc._lastAuthFailAt = 0;
});

// ─── Regressão PGRST204 (mantida) ──────────────────────────────────

describe('syncService — fallback não-bloqueante contra PGRST204', () => {
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

// ─── CORREÇÃO A: validação de sessão por get_my_profile ─────────────

describe('syncService — CORREÇÃO A (get_my_profile valida a sessão)', () => {
  it('sessão anon (get_my_profile devolve NULL) é INVÁLIDA — ensureSession=false', async () => {
    authGetSessionMock.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    rpcMock.mockResolvedValue({ error: null, data: null }); // anon: auth.uid() NULL → NULL

    expect(await syncService.ensureSession()).toBe(false);
    // A validação NÃO usa SELECT em products (0 linhas sem erro = falsa positiva).
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('usuário autenticado (get_my_profile devolve perfil com id) é VÁLIDO', async () => {
    authGetSessionMock.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    rpcMock.mockResolvedValue({ error: null, data: { id: 'u1', email: 'teste@loja.com' } });

    expect(await syncService.ensureSession()).toBe(true);
  });

  it('erro no get_my_profile (sem permissão de execução) também é INVÁLIDO', async () => {
    authGetSessionMock.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    rpcMock.mockResolvedValue({ error: { code: '42501', message: 'permission denied for function get_my_profile' } });

    expect(await syncService.ensureSession()).toBe(false);
  });
});

// ─── CORREÇÃO B: não gravar como anon ──────────────────────────────

describe('syncService — CORREÇÃO B (escrita bloqueada sem sessão válida)', () => {
  it('tryUpsert BLOQUEIA a escrita quando a sessão é inválida — erro UNAUTH, sem rede e sem DLQ', async () => {
    authGetSessionMock.mockResolvedValue({ data: { session: null } }); // sem sessão
    const payload = { id: 'sale-1', code: 'VEN-1', total: 10, store_branch_id: BRANCH, organization_id: ORG };

    const result = await (syncService as any).tryUpsert('sales', payload);

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('UNAUTH');
    expect(upsertMock).not.toHaveBeenCalled(); // não foi à rede
    expect(rpcMock.mock.calls.some(([name]: any) => name === 'fn_insserir_dlq')).toBe(false);
  });

  it('upsertRow ENFILEIRA a escrita quando a sessão é inválida (a pendência não se perde)', async () => {
    authGetSessionMock.mockResolvedValue({ data: { session: null } });
    const payload = {
      id: 'sale-2',
      code: 'VEN-2',
      total: 5,
      store_branch_id: BRANCH,
      organization_id: ORG,
    };

    const ok = await syncService.upsertRow('sales', payload);

    expect(ok).toBe(false);
    expect(upsertMock).not.toHaveBeenCalled();
    const queue = JSON.parse(localStorage.getItem('hd_system_sync_queue') || '[]');
    expect(queue.length).toBe(1);
    expect(queue[0]).toMatchObject({ table: 'sales', action: 'upsert' });
  });

  it('processPendingQueue MANTÉM a fila quando a sessão é inválida (não executa como anon)', async () => {
    authGetSessionMock.mockResolvedValue({ data: { session: null } });
    const op = {
      id: 'op-1',
      table: 'sales',
      action: 'upsert',
      data: { id: 'sale-3', store_branch_id: BRANCH, organization_id: ORG },
      timestamp: new Date().toISOString(),
      retries: 0,
      maxRetries: 3,
      status: 'pending',
    };
    localStorage.setItem('hd_system_sync_queue', JSON.stringify([op]));

    const result = await syncService.processPendingQueue();

    expect(result.processed).toBe(0);
    const queue = JSON.parse(localStorage.getItem('hd_system_sync_queue') || '[]');
    expect(queue.length).toBe(1); // pendência preservada
  });

  it('cardápio anon (sem perfil local salvo) NÃO é bloqueado pelo guard de sessão', async () => {
    // Modo anon: aparelho do cliente SEM perfil local.
    localStorage.removeItem('hd_system_user_profile');
    authGetSessionMock.mockResolvedValue({ data: { session: null } });
    upsertMock.mockResolvedValue({ error: null });

    const payload = { id: 'ord-1', code: 'PED-1', total: 3, store_branch_id: BRANCH, organization_id: ORG };
    const result = await (syncService as any).tryUpsert('sales', payload);

    expect(result.ok).toBe(true);
    expect(upsertMock.mock.calls.length).toBe(1); // foi à rede como anon (autorizado pelas policies anon)
  });
});

// ─── CORREÇÃO D: dedup da DLQ ─────────────────────────────────────

describe('syncService — CORREÇÃO D (DLQ com dedup)', () => {
  it('NÃO replanta a DLQ quando o mesmo erro já está pendente para a mesma linha', async () => {
    authGetSessionMock.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    rpcMock.mockResolvedValue({ error: null, data: { id: 'u1' } }); // sessão válida
    upsertMock.mockResolvedValueOnce({
      error: { code: '42501', message: 'permission denied for table sales' },
    });
    dlqState.limit = () => Promise.resolve({ data: [{ id: 'dlq-1' }], error: null }); // já pendente

    const payload = { id: 'row-1', code: 'X', store_branch_id: BRANCH, organization_id: ORG };
    const result = await (syncService as any).tryUpsert('sales', payload);

    expect(result.ok).toBe(false);
    const dlqCalls = rpcMock.mock.calls.filter(([name]: any) => name === 'fn_insserir_dlq');
    expect(dlqCalls.length).toBe(0);
  });

  it('REPLANTA a DLQ quando o erro NÃO tem pendência (caso novo)', async () => {
    authGetSessionMock.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    rpcMock.mockResolvedValue({ error: null, data: { id: 'u1' } }); // sessão válida
    upsertMock.mockResolvedValueOnce({
      error: { code: '42501', message: 'permission denied for table sales' },
    });
    dlqState.limit = () => Promise.resolve({ data: [], error: null }); // nada pendente

    const payload = { id: 'row-2', code: 'Y', store_branch_id: BRANCH, organization_id: ORG };
    const result = await (syncService as any).tryUpsert('sales', payload);

    expect(result.ok).toBe(false);
    const dlqCalls = rpcMock.mock.calls.filter(([name]: any) => name === 'fn_insserir_dlq');
    expect(dlqCalls.length).toBe(1);
  });
});