// ─── BUSCA DE IMAGENS DO PRODUTO (Wikimedia Commons) ─────────────────────────
// Helpers PUROS e testáveis para o fluxo "Buscar Imagem na Web" do cadastro de
// produto (InventoryView). A API é aberta (sem chave, CORS liberado via
// origin=*). NÃO é IA — é busca textual por termo no repositório de mídia
// aberto da Wikimedia (regra do projeto: sem LLMs/visão computacional).
//
// IMPORTANTE: toda a construção de URL e o parse da resposta vivem aqui para
// poderem ser testados com fixtures reais; o componente só orquestra
// fetch/timeout/estado.

/**
 * Monta a URL da API de busca do Wikimedia Commons para um termo.
 * ns=6 (File), iiurlwidth=400 (thumbnail ~400px), origin=* (CORS aberto).
 * O termo é sanitizado (trim) — um termo vazio retorna URL com pesquisa vazia
 * (o componente DEVE validar antes de chamar).
 */
export function buildWikimediaSearchUrl(term: string, limit = 8): string {
  const clean = term.trim();
  return (
    'https://commons.wikimedia.org/w/api.php' +
    '?action=query&generator=search' +
    `&gsrsearch=${encodeURIComponent(clean)}&gsrnamespace=6&gsrlimit=${limit}` +
    '&prop=imageinfo&iiprop=url|mediatype&iiurlwidth=400&format=json&origin=*'
  );
}

export interface WikimediaPageInfo {
  imageinfo?: { thumburl?: string; url?: string; mediatype?: string }[];
}

export interface WikimediaSearchResponse {
  query?: { pages?: Record<string, WikimediaPageInfo> };
}

/**
 * Extrai as URLs de thumbnail (ou URL original) das páginas BITMAP da resposta
 * da API. Filtra apenas imagens (mediatype 'BITMAP' — exclui SVGs, vídeos,
 * áudios), remove entradas sem URL e limita ao máximo solicitado.
 * Resposta sem `query.pages` ou páginas vazias → array vazio (nunca lança).
 */
export function wikimediaSearchToUrls(
  data: WikimediaSearchResponse,
  limit = 3,
): string[] {
  const pages = data?.query?.pages || {};
  return Object.values(pages)
    .filter((p) => p.imageinfo?.[0]?.mediatype === 'BITMAP')
    .map((p) => p.imageinfo?.[0]?.thumburl || p.imageinfo?.[0]?.url)
    .filter((u): u is string => !!u)
    .slice(0, limit);
}