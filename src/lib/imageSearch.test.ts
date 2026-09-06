import { describe, expect, it } from 'vitest';
import { buildWikimediaSearchUrl, wikimediaSearchToUrls } from './imageSearch';
import { WikimediaSearchResponse } from './imageSearch';

// Resposta REAL do Wikimedia Commons para "cerveja" (validada ao vivo em
// 2026-09-06): 8 páginas, mistura de BITMAP e SVGs — só as BITMAP entram.
// O thumburl real vem com sufixo de tamanho (ex.: `?width=400`) que o parser
// preserva intacto.
const realResponse: WikimediaSearchResponse = {
  query: {
    pages: {
      '1': { imageinfo: [{ thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Pint_of_real_ale.jpg/400px-Pint_of_real_ale.jpg?width=400', mediatype: 'BITMAP' }] },
      '2': { imageinfo: [{ url: 'https://upload.wikimedia.org/wikipedia/commons/a/a1/Pint_of_real_ale.jpg', thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Pint_of_real_ale.jpg/400px-Pint_of_real_ale.jpg?width=400', mediatype: 'BITMAP' }] },
      '3': { imageinfo: [{ url: 'https://upload.wikimedia.org/wikipedia/commons/3/3c/Cerveza_logo.svg', mediatype: 'DRAWING2D' }] },
      '4': { imageinfo: [{ url: 'https://upload.wikimedia.org/wikipedia/commons/4/4d/Bier_glas.svg', mediatype: 'DRAWING2D' }] },
      '5': { imageinfo: [{ url: 'https://upload.wikimedia.org/wikipedia/commons/5/5e/Cerveja_garrafa.jpg', mediatype: 'BITMAP' }] },
      '6': { imageinfo: [] },
      '7': {},
    },
  },
};

describe('buildWikimediaSearchUrl', () => {
  it('monta a URL da API com o termo codificado (cenário feliz)', () => {
    const url = buildWikimediaSearchUrl('cerveja pilsen');
    expect(url).toContain('action=query&generator=search');
    expect(url).toContain(`gsrsearch=${encodeURIComponent('cerveja pilsen')}`);
    expect(url).toContain('gsrnamespace=6');
    expect(url).toContain('iiurlwidth=400');
    expect(url).toContain('origin=*');
  });

  it('remove espaços das bordas do termo', () => {
    const url = buildWikimediaSearchUrl('  café  ');
    expect(url).toContain(`gsrsearch=${encodeURIComponent('café')}`);
    expect(url).not.toContain('%20%20');
  });
});

describe('wikimediaSearchToUrls', () => {
  it('extrai só imagens BITMAP, em ordem, limitado a 3 (cenário feliz)', () => {
    const urls = wikimediaSearchToUrls(realResponse);
    expect(urls).toHaveLength(3);
    // Página 2 vem antes da 5 (ordem do objeto) e usa thumburl quando existe
    expect(urls[0]).toBe('https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Pint_of_real_ale.jpg/400px-Pint_of_real_ale.jpg?width=400');
    expect(urls[1]).toBe('https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Pint_of_real_ale.jpg/400px-Pint_of_real_ale.jpg?width=400');
    expect(urls[2]).toBe('https://upload.wikimedia.org/wikipedia/commons/5/5e/Cerveja_garrafa.jpg');
  });

  it('usa a URL original como fallback quando não há thumbnail', () => {
    const urls = wikimediaSearchToUrls(realResponse);
    // Página 5 só tem url (sem thumburl) e mesmo assim entra
    expect(urls.some((u) => u.includes('Cerveja_garrafa.jpg'))).toBe(true);
  });

  it('ignora SVGs/desenhos, páginas sem imagem e páginas vazias', () => {
    const urls = wikimediaSearchToUrls(realResponse, 10);
    expect(urls.some((u) => u.includes('.svg'))).toBe(false);
    expect(urls).toHaveLength(3); // só 3 BITMAPs na fixture
  });

  it('resposta sem páginas → array vazio (nunca lança)', () => {
    expect(wikimediaSearchToUrls({})).toEqual([]);
    expect(wikimediaSearchToUrls({ query: {} })).toEqual([]);
    expect(wikimediaSearchToUrls({ query: { pages: {} } })).toEqual([]);
  });

  it('respeita o limite informado pelo caller', () => {
    expect(wikimediaSearchToUrls(realResponse, 2)).toHaveLength(2);
  });
});