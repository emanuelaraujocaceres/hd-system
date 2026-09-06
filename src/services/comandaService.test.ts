/**
 * Regressão de `abrirComanda` (decisão 2026-09-06 — frente "mesa travada").
 *
 * Regras cobertas:
 *   1. Mesa livre (sem sessão e sem vendas) → cria sessão ACTIVE nova.
 *   2. Mesa com sessão ACTIVE existente → REUTILIZA (não duplica a sessão;
 *      multi-dispositivo: operador e celular do cliente gerenciam a mesma).
 *   3. Mesa com sessão anterior (completed/cancelled) → REATIVA a existente
 *      (preserva id; limpa closedAt).
 *   4. Mesa com venda PENDING órfã (SEM customerSessionId — caso da mesa 1
 *      "travada") → ANEXA à sessão via saveSale (header update). NUNCA chama
 *      addSale/re-baixa estoque; nenhuma escrita em stock_movements/products.
 *   5. Venda órfã CANCELADA não é anexada.
 *
 * Setup hermético (espelha storageService.branch.test.ts): os dados são
 * SEMEADOS direto em localStorage (chave particionada `hd_system_<tabela>_<org>`),
 * sem passar por instâncias — `abrirComanda` usa o singleton do módulo, então
 * todas as leituras/asserts usam o mesmo `storageService` exportado. Nenhum
 * estado persiste entre testes (localStorage.clear() + seeds explícitos).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { storageService } from './storageService';
import { syncService } from './syncService';
import { abrirComanda } from './comandaService';
import { BRANCH_UUIDS, DEFAULT_ORG_ID } from '../data/mockData';
import type { Sale } from '../types';

describe('comandaService — abrirComanda (mesa livre / órfã / reutilização)', () => {
  const BRANCH = BRANCH_UUIDS['br-01'];
  const TABLE_ID = 'tbl-1';
  let upsertSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    // org default (sem perfil) → chaves particionadas com DEFAULT_ORG_ID
    localStorage.setItem('hd_system_selected_branch_id', BRANCH);
    localStorage.setItem('hd_system_branches', JSON.stringify([
      { id: BRANCH, name: 'Matriz', code: 'SP-01', organizationId: DEFAULT_ORG_ID, active: true },
    ]));
    upsertSpy = vi.spyOn(syncService, 'upsertRow').mockResolvedValue({} as any);
    vi.spyOn(syncService, 'deleteRow').mockResolvedValue(true as any);
  });

  const seedTable = (id = TABLE_ID) => {
    localStorage.setItem(`hd_system_tables_${DEFAULT_ORG_ID}`, JSON.stringify([
      {
        id,
        name: 'Mesa 1',
        number: 1,
        qrToken: 'qr-1',
        status: 'active',
        storeBranchId: BRANCH,
        organizationId: DEFAULT_ORG_ID,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]));
    return { id, name: 'Mesa 1', number: 1, qrToken: 'qr-1', status: 'active' as const, storeBranchId: BRANCH, organizationId: DEFAULT_ORG_ID, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  };

  const seedOrphanSale = (id: string, code: string, status: Sale['status'], tableId = TABLE_ID) => {
    localStorage.setItem(`hd_system_sales_${DEFAULT_ORG_ID}`, JSON.stringify([
      {
        id,
        code,
        date: new Date().toISOString(),
        operatorId: 'op-1',
        operatorName: 'Operador',
        customerName: 'Cliente Não Identificado',
        storeBranchId: BRANCH,
        organizationId: DEFAULT_ORG_ID,
        tableId,
        customerSessionId: undefined,
        orderSource: 'comanda',
        kitchenStatus: status === 'cancelled' ? 'cancelled' : 'pending',
        items: [{ productId: 'prod-1', productName: 'Cerveja', unitPrice: 8, quantity: 2, total: 16 }],
        subtotal: 16,
        discount: 0,
        total: 16,
        payments: [],
        status,
        updatedAt: new Date().toISOString(),
      },
    ]));
  };

  it('mesa livre cria sessão ACTIVE nova (cenário feliz)', () => {
    const table = seedTable();
    const { session, attached } = abrirComanda(table);

    expect(attached).toBe(0);
    expect(session.status).toBe('active');
    expect(session.tableId).toBe(TABLE_ID);
    expect(session.sessionToken).toBeTruthy();
    expect(session.storeBranchId).toBe(BRANCH);
    expect(session.organizationId).toBe(DEFAULT_ORG_ID);

    const stored = storageService.getCustomerSessions().filter((s) => s.tableId === TABLE_ID);
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe(session.id);
    // A sessão nova foi sincronizada ao cloud
    expect(upsertSpy.mock.calls.some((c) => c[0] === 'customer_sessions')).toBe(true);
  });

  it('mesa com sessão ACTIVE existente reutiliza a mesma sessão (não duplica)', () => {
    const table = seedTable();
    const first = abrirComanda(table).session;
    upsertSpy.mockClear();

    const { session, attached } = abrirComanda(table);

    expect(session.id).toBe(first.id);
    expect(attached).toBe(0);
    expect(storageService.getCustomerSessions().filter((s) => s.tableId === TABLE_ID)).toHaveLength(1);
    // Nenhuma escrita nova de sessão (já existia)
    expect(upsertSpy.mock.calls.some((c) => c[0] === 'customer_sessions')).toBe(false);
  });

  it('mesa com sessão anterior COMPLETED reativa a existente (preserva id, limpa closedAt)', () => {
    const table = seedTable();
    const OLD_SESSION_ID = 'b0000000-0000-4000-8000-000000000099'; // UUID real (cloud)
    const oldSession = {
      id: OLD_SESSION_ID,
      tableId: TABLE_ID,
      sessionToken: 'tok-old',
      status: 'completed' as const,
      openedAt: '2026-09-01T10:00:00.000Z',
      closedAt: '2026-09-01T12:00:00.000Z',
      storeBranchId: BRANCH,
      organizationId: DEFAULT_ORG_ID,
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-01T12:00:00.000Z',
    };
    localStorage.setItem(`hd_system_customer_sessions_${DEFAULT_ORG_ID}`, JSON.stringify([oldSession]));

    const { session, attached } = abrirComanda(table);

    // Mesmo registro reativado: id preservado (ensureUuid é no-op em UUID),
    // openedAt do seed mantido, status active e closedAt limpo — sem sessão nova.
    expect(session.id).toBe(OLD_SESSION_ID);
    expect(session.status).toBe('active');
    expect(session.closedAt).toBeUndefined();
    expect(session.openedAt).toBe('2026-09-01T10:00:00.000Z');
    expect(attached).toBe(0);
    const stored = storageService.getCustomerSessions().filter((s) => s.tableId === TABLE_ID);
    expect(stored).toHaveLength(1);
    expect(stored[0].status).toBe('active');
    expect(stored[0].id).toBe(OLD_SESSION_ID);
  });

  it('venda órfã pendente é ANEXADA à sessão sem re-baixar estoque (caso mesa 1 travada)', () => {
    const table = seedTable();
    seedOrphanSale('sale-orphan-1', 'VEN-sale-orphan-1', 'pending');
    upsertSpy.mockClear();

    const { session, attached } = abrirComanda(table);

    expect(attached).toBe(1);
    const sale = storageService.getSales().find((s) => s.code === 'VEN-sale-orphan-1');
    expect(sale).toBeTruthy();
    expect(sale!.customerSessionId).toBe(session.id);
    // Itens originais preservados (header update não mexe em itens — saveSale)
    expect(sale!.items).toHaveLength(1);

    // NENHUMA escrita de estoque: a baixa atômica já aconteceu no adicionarItem
    // original; anexar a sessão NUNCA re-baixa (senão duplicaria débito+log).
    const stockWrites = upsertSpy.mock.calls.filter(
      (c) => c[0] === 'stock_movements' || c[0] === 'products'
    );
    expect(stockWrites).toHaveLength(0);
    // Só header da venda e a sessão foram sincronizados
    expect(upsertSpy.mock.calls.some((c) => c[0] === 'sales')).toBe(true);
  });

  it('venda órfã CANCELADA não é anexada à sessão', () => {
    const table = seedTable();
    seedOrphanSale('sale-canc-1', 'VEN-CANC', 'cancelled');

    const { attached } = abrirComanda(table);

    expect(attached).toBe(0);
    expect(storageService.getSales().find((s) => s.code === 'VEN-CANC')!.customerSessionId).toBeUndefined();
  });
});