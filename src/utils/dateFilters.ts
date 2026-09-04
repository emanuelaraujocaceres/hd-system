/**
 * dateFilters — helpers de filtragem por data/hora.
 *
 * - Vendas: comparação por INSTANTE (getTime), robusta a fuso — `sale.date` é
 *   timestamp ISO (UTC) enquanto limites vêm de datetime-local (hora local).
 * - Contas financeiras: comparação por DATA (YYYY-MM-DD) — `dueDate` é só data,
 *   sem componente de hora; extrai-se a porção de data dos limites datetime-local.
 */

/**
 * Verifica se a venda (`saleDate`, timestamp ISO) está dentro do intervalo
 * [from, to] — ambos no formato "YYYY-MM-DD" ou "YYYY-MM-DDTHH:mm" (datetime-local).
 *
 * Regras:
 *  - `from` vazio === sem limite inferior (aberto).
 *  - `to` vazio === sem limite superior (aberto).
 *  - `saleDate` vazio/inválido === fora do intervalo (retorna false).
 *  - Limites inválidos são ignorados no lado correspondente.
 */
export function isSaleInRange(saleDate: string, from: string, to: string): boolean {
  if (!saleDate) return false;
  const saleTime = new Date(saleDate).getTime();
  if (Number.isNaN(saleTime)) return false;

  if (from) {
    const fromTime = new Date(from).getTime();
    if (!Number.isNaN(fromTime) && saleTime < fromTime) return false;
  }
  if (to) {
    const toTime = new Date(to).getTime();
    if (!Number.isNaN(toTime) && saleTime > toTime) return false;
  }

  return true;
}

/* ── Contas financeiras ─────────────────────────────────────────────── */

/** Extrai YYYY-MM-DD de um datetime-local ("YYYY-MM-DDTHH:mm") ou de uma data pura. */
function toDateOnly(value: string): string {
  return value ? value.slice(0, 10) : '';
}

/** Compara duas strings YYYY-MM-DD lexicamente (funciona porque ISO ordena). */
function dateGe(a: string, b: string): boolean {
  return a >= b;
}
function dateLe(a: string, b: string): boolean {
  return a <= b;
}

/**
 * Verifica se uma conta financeira tem vencimento dentro do intervalo [from, to].
 *
 * - Conta simples: compara `dueDate` (YYYY-MM-DD).
 * - Conta parcelada: true se QUALQUER parcela tem `dueDate` no intervalo.
 * - Conta recorrente: true se QUALQUER ocorrência tem `dueDate` no intervalo.
 * - `from` vazio → sem limite inferior; `to` vazio → sem limite superior.
 */
export function isAccountInDateRange(
  account: {
    dueDate: string;
    isInstallment?: boolean;
    installments?: { dueDate: string }[];
    isRecurring?: boolean;
    recurrences?: { dueDate: string }[];
  },
  from: string,
  to: string,
): boolean {
  const fromDate = toDateOnly(from);
  const toDate = toDateOnly(to);

  const inRange = (dateStr: string): boolean => {
    if (!dateStr) return false;
    if (fromDate && !dateGe(dateStr, fromDate)) return false;
    if (toDate && !dateLe(dateStr, toDate)) return false;
    return true;
  };

  if (account.isInstallment && account.installments?.length) {
    return account.installments.some((inst) => inRange(inst.dueDate));
  }
  if (account.isRecurring && account.recurrences?.length) {
    return account.recurrences.some((rec) => inRange(rec.dueDate));
  }
  return inRange(account.dueDate);
}
