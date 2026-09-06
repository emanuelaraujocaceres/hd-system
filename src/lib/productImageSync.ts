import type { Product } from '../types';

/**
 * Fallback genéricos que o app grava quando um produto é salvo sem imagem
 * (header do save em InventoryView.handleSaveProduct) ou aplicado pelos
 * mappers de remote/hidratação quando image_url vem vazio. NUNCA reenviar
 * essas literais ao cloud: elas não são a foto do produto e sobrescreveriam
 * a URL real em outros dispositivos (bug de 2026-09-06 — 87 produtos da
 * Adega - Matriz ficaram com fallback no cloud e "sem foto" no celular).
 */
export const SAVE_DEFAULT_FALLBACK = 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f';
export const REMOTE_DEFAULT_FALLBACK = 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae';

/**
 * true quando a URL não é uma foto real reenviável ao cloud:
 * - vazia: produto sem imagem;
 * - data:image: base64 local (upload para o bucket falhou) — payload gigante
 *   derruba o upsert/Realtime, não pode ir ao cloud;
 * - fallbacks genéricos do app (SAVE_DEFAULT_FALLBACK / REMOTE_DEFAULT_FALLBACK).
 */
export function imageUrlIsPlaceholder(url: string | undefined | null): boolean {
  if (!url) return true;
  const u = url.trim();
  if (u.startsWith('data:image/')) return true;
  if (u.startsWith(SAVE_DEFAULT_FALLBACK)) return true;
  if (u.startsWith(REMOTE_DEFAULT_FALLBACK)) return true;
  return false;
}

/**
 * Produtos cuja imagem LOCAL é real e deve ser (re)enviada ao cloud.
 * Usado pelo botão "Reenviar imagens" do Estoque: resolve o caso de
 * produtos cujo cloud ficou com fallback (foto visível só no computador,
 * celular sem foto) sem reabrir produto por produto.
 */
export function getProductsNeedingImageResync(products: Product[]): Product[] {
  return products.filter((p) => !p.deletedAt && !imageUrlIsPlaceholder(p.imageUrl));
}