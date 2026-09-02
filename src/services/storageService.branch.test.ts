/**
 * Regressão de isolamento de FILIAL + fiado (conta a receber) + troca de filial.
 *
 * AGENTS.md (BUG-024/025): handlers `update/resolve/remove*FromRemote` devem
 * bloquear dados remotos de OUTRA filial; um caixa de outra filial JAMAIS deve
 * aparecer como aberto na filial atual (fail-closed, BUG-025).
 *
 * NOTA IMPORTANTE sobre `isRemoteFromCurrentBranch(row)`: a leitura do source
 * (storageService.ts ~351) mostra que o método retorna:
 *   - `true`  → o registro PERTENCE à filial atual (deve ser processado);
 *   - `false` → o registro é de OUTRA filial (ou sem store_branch_id) → o
 *               guard `if (!isRemoteFromCurrentBranch(row)) return;` o descarta.
 * (O enunciado da tarefa descrevia o inverso — o comportamento REAL é o acima.)
 *
 * Setup: usa a org default (sem perfil de usuário → `getCurrentOrgId()` retorna
 * DEFAULT_ORG_ID), então as filiais inicializadas (INITIAL_BRANCHES: br-01/02/03)
 * são visíveis e `getSelectedBranchId()` valida contra elas. As escritas são
 * particionadas por org (`key_<org>`), mas o get do StorageService tem fallback
 * para a chave global — por isso os testes semeiam as chaves globais.
 *
 * Cobertura:
 *  1. Isolamento de filial — isRemoteFromCurrentBranch / isLocalItemInCurrentBranch
 *  2. Fiado (conta a receber) — getFiadoAmount soma TODOS os payments credit_account;
 *     updateReceivableFromPayments usa baseline = fiado ORIGINAL (nunca acc.amount);
 *     zera/paids quando totalmente pago; getCreditPayments filtra por org/branch.
 *  3. Troca de filial — resolveBranchId/código→UUID, getSelectedBranchId,
 *     getEffectiveModuleVisibility (sem vazamento entre filiais) e caixa
 *     fail-closed cross-branch (getActiveCaixaSession).
 *
 * Fora de cobertura (documentado): os `update*FromRemote` / `remove*FromRemote`
 * reais dependem de muito estado de sync/Realtime; aqui testamos os guards
 * privados de isolamento que eles usam. A hidratação (hydrateFromCloud) não é
 * testada aqui por depender de fetch mockado do Supabase.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StorageService } from './storageService';
import { BRANCH_UUIDS, DEFAULT_ORG_ID, CASH_SESSION_UUIDS } from '../data/mockData';

describe('storageService — isolamento de filial (BUG-024/025)', () => {
  let svc: StorageService;

  beforeEach(() => {
    localStorage.clear();
    svc = new StorageService();
  });

  // A org default (sem perfil) particiona as chaves com este sufixo
  const partitionSuffix = DEFAULT_ORG_ID;

  const seedBranches = (branchIds: string[]) => {
    localStorage.setItem('hd_system_branches', JSON.stringify(
      branchIds.map((id) => ({
        id,
        name: `Filial ${id}`,
        code: id === BRANCH_UUIDS['br-01'] ? 'SP-01' : 'CODE',
        organizationId: DEFAULT_ORG_ID,
        active: true,
      })),
    ));
  };

  describe('isRemoteFromCurrentBranch', () => {
    it('row da MESMA filial da atual → true (deve processar)', () => {
      localStorage.setItem('hd_system_selected_branch_id', BRANCH_UUIDS['br-01']);
      seedBranches([BRANCH_UUIDS['br-01'], BRANCH_UUIDS['br-02']]);
      expect((svc as any).isRemoteFromCurrentBranch({ store_branch_id: BRANCH_UUIDS['br-01'] })).toBe(true);
    });

    it('row de OUTRA filial → false (descartado pelo guard)', () => {
      localStorage.setItem('hd_system_selected_branch_id', BRANCH_UUIDS['br-01']);
      seedBranches([BRANCH_UUIDS['br-01'], BRANCH_UUIDS['br-02']]);
      expect((svc as any).isRemoteFromCurrentBranch({ store_branch_id: BRANCH_UUIDS['br-02'] })).toBe(false);
    });

    it('row SEM store_branch_id → false (legado/ambíguo nunca entra na filial)', () => {
      localStorage.setItem('hd_system_selected_branch_id', BRANCH_UUIDS['br-01']);
      seedBranches([BRANCH_UUIDS['br-01']]);
      expect((svc as any).isRemoteFromCurrentBranch({ id: 'x' })).toBe(false);
    });

    it('sem filial selecionada (modo global/superadmin) → aceita tudo', () => {
      seedBranches([BRANCH_UUIDS['br-01'], BRANCH_UUIDS['br-02']]);
      // hd_system_selected_branch_id não setado → getRawBranchId() = ''
      expect((svc as any).isRemoteFromCurrentBranch({ store_branch_id: BRANCH_UUIDS['br-02'] })).toBe(true);
      expect((svc as any).isRemoteFromCurrentBranch({ id: 'x' })).toBe(true);
    });

    it('resolve short code da filial atual → UUID antes de comparar', () => {
      // Filial selecionada pelo CÓDIGO 'SP-01' (não UUID)
      localStorage.setItem('hd_system_selected_branch_id', 'SP-01');
      seedBranches([BRANCH_UUIDS['br-01'], BRANCH_UUIDS['br-02']]);
      expect((svc as any).isRemoteFromCurrentBranch({ store_branch_id: BRANCH_UUIDS['br-01'] })).toBe(true);
      expect((svc as any).isRemoteFromCurrentBranch({ store_branch_id: BRANCH_UUIDS['br-02'] })).toBe(false);
    });
  });

  describe('isLocalItemInCurrentBranch', () => {
    it('item local na filial atual → true', () => {
      localStorage.setItem('hd_system_selected_branch_id', BRANCH_UUIDS['br-01']);
      seedBranches([BRANCH_UUIDS['br-01']]);
      localStorage.setItem('hd_system_products', JSON.stringify([
        { id: 'p1', storeBranchId: BRANCH_UUIDS['br-01'], name: 'X' },
      ]));
      expect((svc as any).isLocalItemInCurrentBranch('p1', 'hd_system_products', [])).toBe(true);
    });

    it('item local de OUTRA filial → false (não processar DELETE)', () => {
      localStorage.setItem('hd_system_selected_branch_id', BRANCH_UUIDS['br-01']);
      seedBranches([BRANCH_UUIDS['br-01'], BRANCH_UUIDS['br-02']]);
      localStorage.setItem('hd_system_products', JSON.stringify([
        { id: 'p2', storeBranchId: BRANCH_UUIDS['br-02'], name: 'Y' },
      ]));
      expect((svc as any).isLocalItemInCurrentBranch('p2', 'hd_system_products', [])).toBe(false);
    });

    it('item local SEM storeBranchId → false (legado bloqueado)', () => {
      localStorage.setItem('hd_system_selected_branch_id', BRANCH_UUIDS['br-01']);
      seedBranches([BRANCH_UUIDS['br-01']]);
      localStorage.setItem('hd_system_products', JSON.stringify([
        { id: 'p3', name: 'Legacy sem filial' },
      ]));
      expect((svc as any).isLocalItemInCurrentBranch('p3', 'hd_system_products', [])).toBe(false);
    });

    it('item NÃO encontrado no localStorage → true (pode ter sido removido por outro evento)', () => {
      localStorage.setItem('hd_system_selected_branch_id', BRANCH_UUIDS['br-01']);
      seedBranches([BRANCH_UUIDS['br-01']]);
      expect((svc as any).isLocalItemInCurrentBranch('nao-existe', 'hd_system_products', [])).toBe(true);
    });
  });
});

describe('storageService — fiado (conta a receber) (BUG-003/005/006)', () => {
  let svc: StorageService;

  beforeEach(() => {
    localStorage.clear();
    svc = new StorageService();
    // Não queremos realmente sincronizar com o cloud nos testes
    vi.spyOn(svc as any, 'syncFinancialAccount').mockImplementation(() => {});
    vi.spyOn(svc as any, 'syncCreditPayment').mockImplementation(() => {});
    // Filial atual fixa (br-01) para getSales/getCreditPayments
    localStorage.setItem('hd_system_selected_branch_id', BRANCH_UUIDS['br-01']);
    localStorage.setItem('hd_system_branches', JSON.stringify([
      { id: BRANCH_UUIDS['br-01'], name: 'Matriz', code: 'SP-01', organizationId: DEFAULT_ORG_ID },
    ]));
  });

  const sale = (id: string, payments: any[], total: number, storeBranchId: string = BRANCH_UUIDS['br-01']): any => ({
    id,
    code: `VEN-${id}`,
    date: '2026-01-10T12:00:00Z',
    operatorId: 'op',
    operatorName: 'Op',
    storeBranchId,
    items: [],
    subtotal: total,
    discount: 0,
    total,
    payments,
    status: 'completed' as const,
    organizationId: DEFAULT_ORG_ID,
  });

  it('getFiadoAmount soma TODOS os payments credit_account (não só o primeiro)', () => {
    const s = sale('s1', [
      { method: 'cash', amount: 30 },
      { method: 'credit_account', amount: 50 },
      { method: 'credit_account', amount: 50 },
    ], 130);
    expect((svc as any).getFiadoAmount(s)).toBe(100);
  });

  it('getFiadoAmount é 0 quando não há pagamento credit_account', () => {
    const s = sale('s2', [{ method: 'cash', amount: 100 }], 100);
    expect((svc as any).getFiadoAmount(s)).toBe(0);
  });

  it('updateReceivableFromPayments usa baseline = fiado ORIGINAL, não acc.amount (BUG-003)', () => {
    // Venda fiado de R$100; botão deu R$40 de entrada no fiado.
    localStorage.setItem('hd_system_sales', JSON.stringify([sale('s-x', [{ method: 'credit_account', amount: 100 }], 100)]));
    // Conta a receber já existe com amount = fiado original (100)
    localStorage.setItem('hd_system_financial_accounts', JSON.stringify([
      { id: 's-x', title: 'Fiado', type: 'receivable', category: 'fiado', amount: 100, status: 'pending', storeBranchId: BRANCH_UUIDS['br-01'], organizationId: DEFAULT_ORG_ID },
    ]));
    // Um pagamento de R$40 do fiado
    localStorage.setItem('hd_system_credit_payments', JSON.stringify([
      { id: 'cp1', saleId: 's-x', amount: 40, date: '2026-01-20', storeBranchId: BRANCH_UUIDS['br-01'], organizationId: DEFAULT_ORG_ID },
    ]));

    (svc as any).updateReceivableFromPayments('s-x');

    const accounts = JSON.parse(localStorage.getItem(`hd_system_financial_accounts_${DEFAULT_ORG_ID}`) || localStorage.getItem('hd_system_financial_accounts') || '[]');
    const acc = accounts.find((a: any) => a.id === 's-x');
    expect(acc.amount).toBe(60); // 100 original − 40 pago (nunca baseline inválido)
    expect(acc.status).toBe('pending');
  });

  it('updateReceivableFromPayments zera e marca paid quando totalmente pago', () => {
    localStorage.setItem('hd_system_sales', JSON.stringify([sale('s-y', [{ method: 'credit_account', amount: 100 }], 100)]));
    localStorage.setItem('hd_system_financial_accounts', JSON.stringify([
      { id: 's-y', type: 'receivable', category: 'fiado', amount: 100, status: 'pending', storeBranchId: BRANCH_UUIDS['br-01'], organizationId: DEFAULT_ORG_ID },
    ]));
    localStorage.setItem('hd_system_credit_payments', JSON.stringify([
      { id: 'cp1', saleId: 's-y', amount: 100, date: '2026-01-20', storeBranchId: BRANCH_UUIDS['br-01'], organizationId: DEFAULT_ORG_ID },
    ]));

    (svc as any).updateReceivableFromPayments('s-y');

    const accounts = JSON.parse(localStorage.getItem(`hd_system_financial_accounts_${DEFAULT_ORG_ID}`) || localStorage.getItem('hd_system_financial_accounts') || '[]');
    const acc = accounts.find((a: any) => a.id === 's-y');
    expect(acc.amount).toBe(0);
    expect(acc.status).toBe('paid');
  });

  it('createReceivableFromSale cria conta a receber com saldo restante', () => {
    localStorage.setItem('hd_system_sales', JSON.stringify([sale('s-z', [{ method: 'credit_account', amount: 80 }], 80)]));
    localStorage.setItem('hd_system_credit_payments', JSON.stringify([
      { id: 'cp1', saleId: 's-z', amount: 30, date: '2026-01-20', storeBranchId: BRANCH_UUIDS['br-01'], organizationId: DEFAULT_ORG_ID },
    ]));

    (svc as any).createReceivableFromSale(sale('s-z', [{ method: 'credit_account', amount: 80 }], 80));

    const accounts = JSON.parse(localStorage.getItem(`hd_system_financial_accounts_${DEFAULT_ORG_ID}`) || localStorage.getItem('hd_system_financial_accounts') || '[]');
    const acc = accounts.find((a: any) => a.id === 's-z');
    expect(acc).toBeTruthy();
    expect(acc.amount).toBe(50); // 80 − 30
    expect(acc.status).toBe('pending');
    expect(acc.type).toBe('receivable');
    expect(acc.category).toBe('fiado');
  });

  // ── Resíduo de fiado pago no nível do CLIENTE (BUG finance x fiados) ──
  // O cliente quitou tudo no FiadosView (nível do cliente, FIFO), mas a conta
  // a receber ficava presa em R$4 porque o saldo era calculado por SALE
  // (credit_payments com aquele mesmo saleId), enquanto o FiadosView agrega
  // por customerId. Regressão: conta deve virar paid quando o cliente está
  // totalmente quitado, mesmo que o pagamento esteja no saleId vizinho.
  it('updateReceivableFromPayments zera conta quando cliente quitado a nível de cliente (fiado residual)', () => {
    // Dois fiados do MESMO cliente: venda A (R$34) e venda B (R$4)
    const saleA = { ...sale('sv-a', [{ method: 'credit_account', amount: 34 }], 34), customerId: 'cust-1' };
    const saleB = { ...sale('sv-b', [{ method: 'credit_account', amount: 4 }], 4), customerId: 'cust-1' };
    localStorage.setItem('hd_system_sales', JSON.stringify([saleA, saleB]));
    // Contas a receber para as duas vendas
    localStorage.setItem('hd_system_financial_accounts', JSON.stringify([
      { id: 'sv-a', title: 'Fiado A', type: 'receivable', category: 'fiado', amount: 0, status: 'paid', storeBranchId: BRANCH_UUIDS['br-01'], organizationId: DEFAULT_ORG_ID },
      { id: 'sv-b', title: 'Fiado B', type: 'receivable', category: 'fiado', amount: 4, status: 'pending', storeBranchId: BRANCH_UUIDS['br-01'], organizationId: DEFAULT_ORG_ID },
    ]));
    // O cliente pagou R$38 de uma vez, taggeado só na venda A (nível de cliente quitado)
    localStorage.setItem('hd_system_credit_payments', JSON.stringify([
      { id: 'cp1', saleId: 'sv-a', customerId: 'cust-1', amount: 38, date: '2026-01-20', storeBranchId: BRANCH_UUIDS['br-01'], organizationId: DEFAULT_ORG_ID },
    ]));

    // Re-processa a venda B (a que ficou com resíduo)
    (svc as any).updateReceivableFromPayments('sv-b');

    const accounts = JSON.parse(localStorage.getItem(`hd_system_financial_accounts_${DEFAULT_ORG_ID}`) || localStorage.getItem('hd_system_financial_accounts') || '[]');
    const accB = accounts.find((a: any) => a.id === 'sv-b');
    expect(accB.status).toBe('paid');
    expect(accB.amount).toBe(0);
  });

  // Segurança: cliente PARCIALMENTE quitado NÃO pode ter a conta zerada —
  // o resíduo real continua pendente (per-sale behavior preservado).
  it('updateReceivableFromPayments preserva resíduo quando cliente NÃO está totalmente quitado', () => {
    const saleA = { ...sale('sv-c', [{ method: 'credit_account', amount: 34 }], 34), customerId: 'cust-2' };
    const saleB = { ...sale('sv-d', [{ method: 'credit_account', amount: 4 }], 4), customerId: 'cust-2' };
    localStorage.setItem('hd_system_sales', JSON.stringify([saleA, saleB]));
    localStorage.setItem('hd_system_financial_accounts', JSON.stringify([
      { id: 'sv-c', title: 'Fiado C', type: 'receivable', category: 'fiado', amount: 34, status: 'pending', storeBranchId: BRANCH_UUIDS['br-01'], organizationId: DEFAULT_ORG_ID },
      { id: 'sv-d', title: 'Fiado D', type: 'receivable', category: 'fiado', amount: 4, status: 'pending', storeBranchId: BRANCH_UUIDS['br-01'], organizationId: DEFAULT_ORG_ID },
    ]));
    // Cliente pagou R$30 só — ainda deve R$8 no total (34+4=38 fiado, 30 pago)
    localStorage.setItem('hd_system_credit_payments', JSON.stringify([
      { id: 'cp2', saleId: 'sv-c', customerId: 'cust-2', amount: 30, date: '2026-01-20', storeBranchId: BRANCH_UUIDS['br-01'], organizationId: DEFAULT_ORG_ID },
    ]));

    (svc as any).updateReceivableFromPayments('sv-d');

    const accounts = JSON.parse(localStorage.getItem(`hd_system_financial_accounts_${DEFAULT_ORG_ID}`) || localStorage.getItem('hd_system_financial_accounts') || '[]');
    const accD = accounts.find((a: any) => a.id === 'sv-d');
    expect(accD.status).toBe('pending');
    expect(accD.amount).toBe(4); // resíduo real mantido
  });

  // Venda "Cliente Não Identificado" (SEM customerId) quitada no nível do grupo
  // __no_customer__ (FiadosView). Antes, isCustomerCreditSettled retornava false
  // sem customerId → o resíduo per-sale ficava preso no KPI "Contas a Receber"
  // mesmo com o Fiados zerado. Regressão: deve zerar como caso com customerId.
  it('updateReceivableFromPayments zera conta quando venda sem customerId quitada no grupo __no_customer__', () => {
    // Duas vendas SEM cliente: venda A (fiado R$34) e venda B (fiado R$4)
    const saleA = { ...sale('sv-e', [{ method: 'credit_account', amount: 34 }], 34) };
    const saleB = { ...sale('sv-f', [{ method: 'credit_account', amount: 4 }], 4) };
    // Garantir que NÃO há customerId (venda sem cliente)
    delete (saleA as any).customerId;
    delete (saleB as any).customerId;
    localStorage.setItem('hd_system_sales', JSON.stringify([saleA, saleB]));
    // Conta a receber da venda B presa em R$4 (resíduo)
    localStorage.setItem('hd_system_financial_accounts', JSON.stringify([
      { id: 'sv-e', title: 'Fiado E', type: 'receivable', category: 'fiado', amount: 0, status: 'paid', storeBranchId: BRANCH_UUIDS['br-01'], organizationId: DEFAULT_ORG_ID },
      { id: 'sv-f', title: 'Fiado F', type: 'receivable', category: 'fiado', amount: 4, status: 'pending', storeBranchId: BRANCH_UUIDS['br-01'], organizationId: DEFAULT_ORG_ID },
    ]));
    // Pagamento único de R$38 taggeado só na venda A, com customerId __no_customer__
    // (como o FiadosView grava para vendas sem cliente). Grupo __no_customer__ quitado.
    localStorage.setItem('hd_system_credit_payments', JSON.stringify([
      { id: 'cp3', saleId: 'sv-e', customerId: '__no_customer__', amount: 38, date: '2026-01-20', storeBranchId: BRANCH_UUIDS['br-01'], organizationId: DEFAULT_ORG_ID },
    ]));

    // Re-processa a venda B (a que ficou com resíduo)
    (svc as any).updateReceivableFromPayments('sv-f');

    const accounts = JSON.parse(localStorage.getItem(`hd_system_financial_accounts_${DEFAULT_ORG_ID}`) || localStorage.getItem('hd_system_financial_accounts') || '[]');
    const accF = accounts.find((a: any) => a.id === 'sv-f');
    expect(accF.status).toBe('paid');
    expect(accF.amount).toBe(0);
  });

  // Recebível ÓRFÃO no cloud: conta 'fiado' pending (id = sale.id) SEM venda de
  // fiado ativa por trás (venda existe mas o credit_account foi removido/pago, ou
  // a venda foi apagada). O backfill só processava vendas com fiado → o órfão
  // ficava preso no KPI e voltava após apagar dados locais. Regressão: backfill
  // deve zerar a conta órfã SEM tocar fiado legítimo (que tem venda com fiado).
  it('backfillReceivablesFromSales zera recebível órfão sem venda de fiado ativa', () => {
    // Venda "Cliente Não Identificado" SEM credit_account (fiado removido/pago)
    const vendaSemFiado = { ...sale('sv-g', [{ method: 'cash', amount: 4 }], 4) };
    delete (vendaSemFiado as any).customerId;
    localStorage.setItem('hd_system_sales', JSON.stringify([vendaSemFiado]));
    // Conta 'fiado' órfã de R$4 pendente — sem venda de fiado que a sustente
    localStorage.setItem('hd_system_financial_accounts', JSON.stringify([
      { id: 'sv-g', title: 'Fiado G', type: 'receivable', category: 'fiado', amount: 4, status: 'pending', storeBranchId: BRANCH_UUIDS['br-01'], organizationId: DEFAULT_ORG_ID },
    ]));

    (svc as any).backfillReceivablesFromSales();

    const accounts = JSON.parse(localStorage.getItem(`hd_system_financial_accounts_${DEFAULT_ORG_ID}`) || localStorage.getItem('hd_system_financial_accounts') || '[]');
    const accG = accounts.find((a: any) => a.id === 'sv-g');
    expect(accG.status).toBe('paid');
    expect(accG.amount).toBe(0);
  });

  // Segurança: recebível com venda de fiado ATIVA NÃO pode ser podado.
  it('backfillReceivablesFromSales NÃO zera recebível quando há venda de fiado ativa', () => {
    const vendaComFiado = { ...sale('sv-h', [{ method: 'credit_account', amount: 4 }], 4) };
    delete (vendaComFiado as any).customerId;
    localStorage.setItem('hd_system_sales', JSON.stringify([vendaComFiado]));
    localStorage.setItem('hd_system_financial_accounts', JSON.stringify([
      { id: 'sv-h', title: 'Fiado H', type: 'receivable', category: 'fiado', amount: 4, status: 'pending', storeBranchId: BRANCH_UUIDS['br-01'], organizationId: DEFAULT_ORG_ID },
    ]));

    (svc as any).backfillReceivablesFromSales();

    const accounts = JSON.parse(localStorage.getItem(`hd_system_financial_accounts_${DEFAULT_ORG_ID}`) || localStorage.getItem('hd_system_financial_accounts') || '[]');
    const accH = accounts.find((a: any) => a.id === 'sv-h');
    expect(accH.status).toBe('pending');
    expect(accH.amount).toBe(4); // fiado legítimo preservado
  });

  it('getCreditPayments retorna pagamentos por saleId camelCase e filtra por org/filial (BUG-006)', () => {
    localStorage.setItem('hd_system_sales', JSON.stringify([
      sale('s1', [{ method: 'credit_account', amount: 50 }], 50, BRANCH_UUIDS['br-01']),
      sale('s2', [{ method: 'credit_account', amount: 50 }], 50, BRANCH_UUIDS['br-02']),
    ]));
    // 2 payments: um da venda da filial atual (s1) e um de outra filial (s2)
    localStorage.setItem('hd_system_credit_payments', JSON.stringify([
      { id: 'cp1', saleId: 's1', amount: 10, date: '2026-01-20', storeBranchId: BRANCH_UUIDS['br-01'], organizationId: DEFAULT_ORG_ID },
      { id: 'cp2', saleId: 's2', amount: 20, date: '2026-01-20', storeBranchId: BRANCH_UUIDS['br-02'], organizationId: DEFAULT_ORG_ID },
    ]));

    const payments = svc.getCreditPayments();
    expect(payments.length).toBe(1); // só o da filial atual (s1 é br-01; s2 é br-02 e sai)
    expect(payments[0].id).toBe('cp1');
    expect(payments[0].saleId).toBe('s1');
  });
});

describe('storageService — troca de filial e caixa fail-closed (BUG-025)', () => {
  let svc: StorageService;

  beforeEach(() => {
    localStorage.clear();
    svc = new StorageService();
    vi.spyOn(svc as any, 'syncBranch').mockImplementation(() => {});
    vi.spyOn(svc as any, 'syncCaixaSession').mockImplementation(() => {});
    localStorage.setItem('hd_system_branches', JSON.stringify([
      { id: BRANCH_UUIDS['br-01'], name: 'Matriz', code: 'SP-01', organizationId: DEFAULT_ORG_ID },
      { id: BRANCH_UUIDS['br-02'], name: 'Filial Campinas', code: 'SP-02', organizationId: DEFAULT_ORG_ID },
    ]));
  });

  it('resolveBranchId resolve short code → UUID', () => {
    expect(svc.resolveBranchId('SP-01')).toBe(BRANCH_UUIDS['br-01']);
    expect(svc.resolveBranchId(BRANCH_UUIDS['br-02'])).toBe(BRANCH_UUIDS['br-02']);
    expect(svc.resolveBranchId('inexistente')).toBeUndefined();
    expect(svc.resolveBranchId('')).toBeUndefined();
  });

  it('setSelectedBranchId grava e getSelectedBranchId valida contra branches', () => {
    svc.setSelectedBranchId(BRANCH_UUIDS['br-02']);
    expect(svc.getSelectedBranchId()).toBe(BRANCH_UUIDS['br-02']);
    expect(svc.getRawBranchId()).toBe(BRANCH_UUIDS['br-02']);
    // Troca para a outra filial
    svc.setSelectedBranchId(BRANCH_UUIDS['br-01']);
    expect(svc.getSelectedBranchId()).toBe(BRANCH_UUIDS['br-01']);
  });

  it('getSelectedBranchId devolve \'\' quando o id salvo não pertence a nenhuma filial visível', () => {
    // Id de filial de outra org (não existe nas branches do escopo atual)
    localStorage.setItem('hd_system_selected_branch_id', BRANCH_UUIDS['br-03']);
    expect(svc.getSelectedBranchId()).toBe('');
  });

  it('getEffectiveModuleVisibility usa defaults quando filial não tem registro (sem vazar de outra filial)', () => {
    svc.setSelectedBranchId(BRANCH_UUIDS['br-01']);
    const defaults = svc.getEffectiveModuleVisibility();
    // Registro só da br-02 -> não pode vazar para br-01
    localStorage.setItem(`hd_system_module_visibility_${DEFAULT_ORG_ID}`, JSON.stringify([
      { storeBranchId: BRANCH_UUIDS['br-02'], modulePdv: false, moduleKds: false },
    ]));
    const eff = svc.getEffectiveModuleVisibility();
    // br-01 não tem registro → usa defaults (PDV true, KDS true), não o da br-02
    expect(eff.modulePdv).toBe(true);
    expect(eff.moduleKds).toBe(true);
    expect(eff.modulePdv).toBe(defaults.modulePdv);
  });

  it('getEffectiveModuleVisibility aplica o registro da filial ATUAL', () => {
    svc.setSelectedBranchId(BRANCH_UUIDS['br-02']);
    localStorage.setItem(`hd_system_module_visibility_${DEFAULT_ORG_ID}`, JSON.stringify([
      { storeBranchId: BRANCH_UUIDS['br-02'], modulePdv: false, moduleKds: false },
    ]));
    const eff = svc.getEffectiveModuleVisibility();
    expect(eff.modulePdv).toBe(false);
    expect(eff.moduleKds).toBe(false);
    // Colunas ausentes mantêm default (ex.: moduleFinance default false)
    expect(typeof eff.moduleFinance).toBe('boolean');
  });

  describe('getActiveCaixaSession — fail-closed cross-branch', () => {
    const caixaKey = `hd_system_caixa_session_${DEFAULT_ORG_ID}`;

    it('caixa aberto de OUTRA filial → sessão fechada (fail-closed, nunca INITIAL)', () => {
      // Filial atual = br-01
      svc.setSelectedBranchId(BRANCH_UUIDS['br-01']);
      // Caixa aberto pertence à br-02
      localStorage.setItem(caixaKey, JSON.stringify({
        id: CASH_SESSION_UUIDS['cx-active-01'],
        status: 'open',
        storeBranchId: BRANCH_UUIDS['br-02'],
        operatorId: 'op',
        operatorName: 'Op',
        openedAt: '2026-01-01T08:00:00.000Z',
        initialCash: 100,
        currentCashBalance: 150,
        totalSalesCash: 50,
        totalSalesPix: 0,
        totalSalesCard: 0,
        totalSalesCreditAccount: 0,
        suprimentos: 0,
        sangrias: 0,
        organizationId: DEFAULT_ORG_ID,
      }));

      const session = svc.getActiveCaixaSession();
      expect(session.status).toBe('closed');
      expect(session.id).toBe('00000000-0000-0000-0000-000000000000');
      expect(session.currentCashBalance ?? 0).toBe(0); // não vaza saldo da outra filial
    });

    it('caixa aberto da filial ATUAL → retorna a sessão aberta normalmente', () => {
      svc.setSelectedBranchId(BRANCH_UUIDS['br-02']);
      localStorage.setItem(caixaKey, JSON.stringify({
        id: CASH_SESSION_UUIDS['cx-active-01'],
        status: 'open',
        storeBranchId: BRANCH_UUIDS['br-02'],
        operatorId: 'op',
        operatorName: 'Op',
        openedAt: '2026-01-01T08:00:00.000Z',
        initialCash: 100,
        currentCashBalance: 150,
        totalSalesCash: 50,
        totalSalesPix: 0,
        totalSalesCard: 0,
        totalSalesCreditAccount: 0,
        suprimentos: 0,
        sangrias: 0,
        organizationId: DEFAULT_ORG_ID,
      }));

      const session = svc.getActiveCaixaSession();
      expect(session.status).toBe('open');
      expect(session.currentCashBalance).toBe(150);
    });

    it('sem caixa salvo → sessão fechada (fail-closed, não INITIAL aberto)', () => {
      svc.setSelectedBranchId(BRANCH_UUIDS['br-01']);
      const session = svc.getActiveCaixaSession();
      expect(session.status).toBe('closed');
      expect(session.id).toBe('00000000-0000-0000-0000-000000000000');
    });
  });
});

describe('storageService — addSale: filial não-UUID não bloqueia a venda (não perde venda)', () => {
  let svc: StorageService;

  beforeEach(() => {
    localStorage.clear();
    svc = new StorageService();
    // Organização default (Adega) com 2 filiais
    localStorage.setItem('hd_system_branches', JSON.stringify([
      { id: BRANCH_UUIDS['br-01'], name: 'Matriz', code: 'SP-01', organizationId: DEFAULT_ORG_ID, active: true },
      { id: BRANCH_UUIDS['br-02'], name: 'Filial 2', code: 'CODE', organizationId: DEFAULT_ORG_ID, active: true },
    ]));
    localStorage.setItem('hd_system_selected_branch_id', 'SP-01'); // curto código salvo
    // Não tocar rede/RPC/estoque nestes testes — focar apenas na decisão de branch
    vi.spyOn(svc as any, 'syncSale').mockResolvedValue({ success: true });
    vi.spyOn(svc as any, 'createReceivableFromSale').mockImplementation(() => {});
    vi.spyOn(svc as any, 'isCompositeOrFractionProduct').mockReturnValue(false);
    vi.spyOn(svc as any, 'deductStockLocal').mockImplementation(() => {});
    vi.spyOn(svc as any, 'saveProductLot').mockImplementation(() => {});
    vi.spyOn(svc as any, 'getLotesForFEFO').mockReturnValue([]);
  });

  const mkSale = (id: string, branch?: string): any => ({
    id: `sale-${id}`,
    code: `VEN-${id}`,
    date: '2026-09-02T12:00:00Z',
    operatorId: 'juninho',
    operatorName: 'juninho',
    storeBranchId: branch,
    items: [],
    subtotal: 10,
    discount: 0,
    total: 10,
    payments: [{ method: 'cash', amount: 10 }],
    status: 'completed',
  });

  const findAdded = (code: string): any =>
    svc.getSales().find((s: any) => s.code === code);

  it('venda com storeBranchId não-UUID que NÃO resolve → cai para a 1ª filial e É salva (não desaparece)', async () => {
    await (svc as any).addSale(mkSale('X', 'BRANCA-INVALIDA'));
    const stored = findAdded('VEN-X');
    expect(stored).toBeTruthy();
    expect(stored.storeBranchId).toBe(BRANCH_UUIDS['br-01']); // resolveu p/ 1ª filial
  });

  it('venda com storeBranchId short-code resolvível → resolve para o UUID da filial', async () => {
    await (svc as any).addSale(mkSale('Y', 'SP-01'));
    const stored = findAdded('VEN-Y');
    expect(stored).toBeTruthy();
    expect(stored.storeBranchId).toBe(BRANCH_UUIDS['br-01']);
  });

  it('venda com UUID válido da filial selecionada → mantém o UUID (fluxo normal inalterado)', async () => {
    svc.setSelectedBranchId(BRANCH_UUIDS['br-02']);
    await (svc as any).addSale(mkSale('Z', BRANCH_UUIDS['br-02']));
    const stored = findAdded('VEN-Z');
    expect(stored).toBeTruthy();
    expect(stored.storeBranchId).toBe(BRANCH_UUIDS['br-02']);
  });

  it('venda SEM filial e sem branches visíveis → bloqueia com erro explícito (não desaparece em silêncio)', async () => {
    localStorage.setItem('hd_system_branches', JSON.stringify([]));
    localStorage.removeItem('hd_system_selected_branch_id');
    const res = await (svc as any).addSale(mkSale('W', ''));
    expect(res).toEqual({ success: false, message: expect.stringContaining('Nenhuma filial') });
    // Venda não foi gravada — mas agora há feedback claro (não é silencioso)
    expect(findAdded('VEN-W')).toBeFalsy();
  });
});
