import { describe, it, expect } from 'vitest';
import { normalizeText, normalizeForMatch, detectDocumentEdges, type DetectedDoc } from './capture';

describe('capture.ts — normalizeText / normalizeForMatch', () => {
  it('normalizeText trims, lowercases and collapses spaces', () => {
    expect(normalizeText('  Cerveja   Pilsen  ')).toBe('cerveja pilsen');
    expect(normalizeText('REFRI COLA')).toBe('refri cola');
  });

  it('normalizeForMatch removes accents for tolerant matching', () => {
    expect(normalizeForMatch('Café Expresso')).toBe('cafe expresso');
    expect(normalizeForMatch('COMPANHIA DE BEBIDAS DAS AMÉRICAS')).toBe(
      'companhia de bebidas das americas',
    );
  });

  it('normalizeForMatch handles empty/undefined gracefully', () => {
    expect(normalizeForMatch('')).toBe('');
    expect(normalizeForMatch('   ')).toBe('');
  });
});

// ── detectDocumentEdges — cenários de câmera (BUG scanner A4) ─────────
// Mock de context: devolve brilho 230 para "papel/região clara" e 35 para
// "fundo escuro", nas coordenadas absolutas do frame. Mesma técnica usada
// no diagnóstico que aprovou a Opção A (contraste de borda + rejeição de
// documento encostado na borda da grade).
function makeCtx(
  w: number,
  h: number,
  scene: Array<[number, number, number, number]> | ((x: number, y: number) => boolean),
): CanvasRenderingContext2D {
  const isBright = Array.isArray(scene)
    ? (x: number, y: number) =>
        scene.some(([rx, ry, rw, rh]) => x >= rx && x < rx + rw && y >= ry && y < ry + rh)
    : scene;
  return {
    getImageData: (px: number, py: number) => {
      const b = isBright(px, py) ? 230 : 35;
      return { data: new Uint8ClampedArray([b, b, b, 255]) };
    },
  } as unknown as CanvasRenderingContext2D;
}

// Retângulo de papel centralizado (proporção A4).
function centeredPaper(w: number, h: number, widthFrac: number): [number, number, number, number] {
  const pw = Math.floor(w * widthFrac);
  const ph = Math.floor(pw * 1.414);
  return [Math.floor((w - pw) / 2), Math.floor((h - ph) / 2), pw, ph];
}

// Gate de tamanho mínimo do StockDocScanner (45% x 45%) — o que decide se o
// loop de estabilidade chega a considerar o doc capturável.
function bigEnough45(doc: DetectedDoc | null, w: number, h: number): boolean {
  if (!doc) return false;
  return doc.width >= w * 0.45 && doc.height >= h * 0.45;
}

describe('capture.ts — detectDocumentEdges (cenários de câmera)', () => {
  const LAND_W = 1280;
  const LAND_H = 720;
  const PORT_W = 720;
  const PORT_H = 1280;

  it('A. Parede branca lisa (retrato) — NÃO deve detectar documento', () => {
    const ctx = makeCtx(PORT_W, PORT_H, () => true);
    const doc = detectDocumentEdges(ctx, PORT_W, PORT_H);
    expect(doc).toBeNull();
  });

  it("A'. Parede branca lisa (paisagem) — NÃO deve detectar documento", () => {
    const ctx = makeCtx(LAND_W, LAND_H, () => true);
    const doc = detectDocumentEdges(ctx, LAND_W, LAND_H);
    expect(doc).toBeNull();
  });

  it('B. Mesa clara ocupando o frame (retrato) — NÃO deve detectar documento', () => {
    // Mesa clara = superfície clara contínua, igual à parede no nível de brilho.
    const ctx = makeCtx(PORT_W, PORT_H, () => true);
    const doc = detectDocumentEdges(ctx, PORT_W, PORT_H);
    expect(doc).toBeNull();
  });

  it('C. Ambiente escuro sem papel — NÃO deve detectar documento', () => {
    const ctx = makeCtx(PORT_W, PORT_H, () => false);
    const doc = detectDocumentEdges(ctx, PORT_W, PORT_H);
    expect(doc).toBeNull();
  });

  it('D. Papel entrando na cena em paisagem (45/60/85%) — NÃO deve detectar antes de enquadrar', () => {
    for (const f of [0.45, 0.6, 0.85]) {
      const ctx = makeCtx(LAND_W, LAND_H, [centeredPaper(LAND_W, LAND_H, f)]);
      expect(detectDocumentEdges(ctx, LAND_W, LAND_H), `frac=${f}`).toBeNull();
    }
  });

  it('E. Papel A4 centralizado (70%, retrato) — DEVE detectar e ser capturável (gate 45%)', () => {
    const ctx = makeCtx(PORT_W, PORT_H, [centeredPaper(PORT_W, PORT_H, 0.7)]);
    const doc = detectDocumentEdges(ctx, PORT_W, PORT_H);
    expect(doc).not.toBeNull();
    expect(bigEnough45(doc, PORT_W, PORT_H)).toBe(true);
  });

  it("F. Papel maior que o guia (85%, retrato — encosta nas bordas da grade com brilho além) — NÃO deve detectar até ser afastado", () => {
    const ctx = makeCtx(PORT_W, PORT_H, [centeredPaper(PORT_W, PORT_H, 0.85)]);
    const doc = detectDocumentEdges(ctx, PORT_W, PORT_H);
    expect(doc).toBeNull();
  });

  it('G. Papel enquadrado parcialmente por baixo (fora do centro, retrato) — NÃO deve detectar', () => {
    // Papel ocupa a metade inferior do frame (entrando de baixo), saindo do
    // enquadramento — o gate de brilho/ratio passa, mas a borda real não existe.
    const paper: [number, number, number, number] = [72, 630, 576, 700];
    const ctx = makeCtx(PORT_W, PORT_H, [paper]);
    const doc = detectDocumentEdges(ctx, PORT_W, PORT_H);
    expect(doc).toBeNull();
  });

  it('H. Papel centralizado com fundo escuro legítimo ao redor (75%, retrato) — permanece detectável (sem falsa rejeição)', () => {
    // Regressão: a nova guarda só rejeita quando a região clara encosta na
    // grade E a faixa além da grade continua clara. Um papel bem enquadrado
    // (fundo escuro visível ao redor) não pode virar null.
    const ctx = makeCtx(PORT_W, PORT_H, [centeredPaper(PORT_W, PORT_H, 0.75)]);
    const doc = detectDocumentEdges(ctx, PORT_W, PORT_H);
    expect(doc).not.toBeNull();
    expect(bigEnough45(doc, PORT_W, PORT_H)).toBe(true);
  });
});
