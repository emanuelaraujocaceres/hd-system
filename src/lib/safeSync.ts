/**
 * safeSync — guardas defensivas para dados vindos do Supabase.
 *
 * Regra de bolso (aplicar SEMPRE em código de sync):
 * QUALQUER linha vinda da nuvem (fetchRows, payload de Realtime, RPC,
 * resposta de select) pode ser null / undefined / parcial. Nada deve
 * assumir que um registro existe ou que tem os campos esperados —
 * um único registro inválido derrubava a hidratação inteira
 * (TypeError: Cannot read properties of undefined (reading 'id')).
 */

/** Garante array — descarta null/undefined dentro do resultado. */
export function asArray<T = any>(data: unknown): T[] {
  if (!Array.isArray(data)) return [];
  return data.filter((d): d is T => d !== null && d !== undefined);
}

/** Executa com fallback — uma linha ruim não derruba o lote inteiro. */
export function withSyncGuard<T>(fn: () => T, fallback: T, label = 'sync'): T {
  try {
    return fn();
  } catch (e) {
    console.warn(`[HD-Sync] ${label} falhou (guardado):`, e);
    return fallback;
  }
}

/**
 * Mapeia linhas brutas da nuvem pulando linhas inválidas e mappers que
 * lançam exceção. Uso:
 *   const items = mapRows(cloudRows, (r) => ({ id: r.id, ... }), 'products');
 */
export function mapRows<T>(rows: unknown, mapper: (r: any) => T, label = 'row'): T[] {
  return asArray<any>(rows)
    .map((r) => withSyncGuard(() => mapper(r), null as unknown as T, label))
    .filter((m): m is T => m !== null && m !== undefined);
}

/**
 * Valida um payload de Realtime / linha remota antes de aplicar.
 * Retorna false para null/undefined/array (payload malformado).
 */
export function isValidRemoteRow(row: unknown): row is Record<string, any> {
  return !!row && typeof row === 'object' && !Array.isArray(row);
}

/**
 * Parse JSON seguro — se o valor já é um objeto, retorna como está.
 * Se é string, faz JSON.parse. Se falhar, retorna null.
 * Previne: SyntaxError: "[object Object]" is not valid JSON
 */
export function safeParseJson(value: any): any {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return value; // Já é objeto, não precisa parsear
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return null;
}
