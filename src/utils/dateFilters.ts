/**
 * dateFilters — helpers de filtragem de vendas por data/hora.
 *
 * Comparação por INSTANTE (getTime), robusta a fuso: `sale.date` é um timestamp
 * ISO (UTC: created_at / toISOString()) enquanto os limites vêm de um input
 * datetime-local (hora local). Comparar timestamps via getTime() evita o erro
 * de ±horas de uma comparação de strings.
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
