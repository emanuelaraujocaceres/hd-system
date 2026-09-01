/**
 * matchProducts.ts — Match de itens de NF (nome) contra produtos existentes.
 *
 * Lógica pura e testável usada pelo StockDocScannerModal:
 * - Match exato por nome normalizado.
 * - Fallback fuzzy por similaridade de tokens (nomes parecidos, não idênticos).
 * - Retorna o melhor candidato + lista de similares para o usuário decidir.
 *
 * Regra AGENTS.md: não é IA — apenas normalização + similaridade por tokens.
 */

import { normalizeForMatch } from './capture';
import type { Product } from '../../types';

/** Similaridade simples de nomes (0-1) baseada em tokens compartilhados. */
export function nameSimilarity(a: string, b: string): number {
  const ta = normalizeForMatch(a).split(' ').filter(Boolean);
  const tb = normalizeForMatch(b).split(' ').filter(Boolean);
  if (!ta.length || !tb.length) return 0;
  const set = new Set(ta);
  let shared = 0;
  for (const tok of tb) if (set.has(tok)) shared++;
  const union = Math.max(ta.length, tb.length, 1);
  return shared / union;
}

export interface MatchedProductResult {
  /** Produto exato/fuzzy escolhido automaticamente, ou null se não encontrou. */
  product: Product | null;
  /** Candidatos similares (exclui o escolhido) para o usuário revisar. */
  candidates: Product[];
  /** true quando o match é fuzzy (nome não-idêntico) — pede confirmação. */
  fuzzy: boolean;
}

/**
 * Faz match de um nome de produto da NF contra o catálogo.
 * @param itemName Nome extraído da NF.
 * @param products Catálogo de produtos (já filtrado por org/branch/ativo).
 * @param threshold Similaridade mínima para sugerir candidato fuzzy (default 0.45).
 */
export function matchItemToProducts(
  itemName: string,
  products: Product[],
  threshold = 0.45,
): MatchedProductResult {
  const target = normalizeForMatch(itemName);
  if (!target) return { product: null, candidates: [], fuzzy: false };

  // 1) Match exato por nome normalizado
  const exact =
    products.find((p) => p.active !== false && normalizeForMatch(p.name) === target) || null;
  if (exact) return { product: exact, candidates: [], fuzzy: false };

  // 2) Fuzzy: ordena por similaridade de tokens
  const scored = products
    .filter((p) => p.active !== false)
    .map((p) => ({ p, score: nameSimilarity(itemName, p.name) }))
    .filter((x) => x.score >= threshold)
    .sort((x, y) => y.score - x.score);

  if (!scored.length) return { product: null, candidates: [], fuzzy: false };

  const best = scored[0];
  return {
    product: best.p,
    candidates: scored.slice(1).map((x) => x.p),
    fuzzy: true,
  };
}

// ── Planejamento de importação de NF (vários itens de uma vez) ─────────

export interface InventoryImportItem {
  productName: string;
  quantity: number;
  unitPrice: number;
  salePrice?: number;
}

export interface PlannedInventoryItem {
  item: InventoryImportItem;
  /** Produto existente escolhido (exato ou fuzzy), ou null p/ criar novo. */
  matchedProduct: Product | null;
  /** Candidatos similares (exclui o escolhido) para revisão. */
  candidates: Product[];
  /** true quando o match é fuzzy (nome não-idêntico) — pede confirmação. */
  fuzzy: boolean;
}

/**
 * Planeja a gravação de itens de NF no estoque, fazendo match de cada item
 * contra o catálogo (exato + fuzzy via matchItemToProducts).
 *
 * Itens com nome vazio são descartados (não têm como casar/criar). Itens com
 * quantidade <= 0 entram com matchedProduct null — o chamador decide pular.
 * É a mesma lógica usada manualmente pelo StockDocScannerModal, extraída pura
 * para ser testável e reusada pelo NFAddModal.
 */
export function planInventoryImport(
  items: InventoryImportItem[],
  products: Product[],
  threshold = 0.45,
): PlannedInventoryItem[] {
  const plan: PlannedInventoryItem[] = [];
  for (const item of items) {
    const name = (item.productName || '').trim();
    if (!name) continue;
    const { product, candidates, fuzzy } = matchItemToProducts(name, products, threshold);
    plan.push({ item, matchedProduct: product, candidates, fuzzy });
  }
  return plan;
}
