/**
 * capture.ts — Helpers compartilhados de captura de documento A4 via câmera.
 *
 * Funções determinísticas de processamento de imagem (sem bibliotecas externas)
 * usadas tanto pelo NFMultiCaptureModal quanto pelo modo "Documento A4" do
 * scanner de estoque. Regra AGENTS.md: não é IA/LLM, apenas sampling de brilho
 * e manipulação de canvas.
 */

export interface DetectedDoc {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Detecta se há um retângulo claro (documento) no centro do canvas.
 * Usa sampling de brilho em pontos estratégicos — sem bibliotecas externas.
 */
export function detectDocumentEdges(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): DetectedDoc | null {
  // Região central: 80% da largura, 90% da altura (A4 é mais alto que largo)
  const marginX = w * 0.1;
  const marginY = h * 0.05;
  const regionW = w - marginX * 2;
  const regionH = h - marginY * 2;

  // Sample brightness in a 6x8 grid across the central region
  const cols = 6;
  const rows = 8;
  const cellW = regionW / cols;
  const cellH = regionH / rows;

  let brightCount = 0;
  let totalCells = 0;
  let minX = w, maxX = 0, minY = h, maxY = 0;

  const sampleSize = 4; // pixels to sample per cell center

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = Math.floor(marginX + c * cellW + cellW / 2);
      const cy = Math.floor(marginY + r * cellH + cellH / 2);

      // Average brightness of a small block
      let brightness = 0;
      let count = 0;
      const half = Math.floor(sampleSize / 2);
      for (let dy = -half; dy <= half; dy++) {
        for (let dx = -half; dx <= half; dx++) {
          const px = Math.min(Math.max(cx + dx, 0), w - 1);
          const py = Math.min(Math.max(cy + dy, 0), h - 1);
          const data = ctx.getImageData(px, py, 1, 1).data;
          brightness += (data[0] + data[1] + data[2]) / 3;
          count++;
        }
      }
      brightness /= count;
      totalCells++;

      if (brightness > 160) {
        brightCount++;
        const cellX = marginX + c * cellW;
        const cellY = marginY + r * cellH;
        if (cellX < minX) minX = cellX;
        if (cellX + cellW > maxX) maxX = cellX + cellW;
        if (cellY < minY) minY = cellY;
        if (cellY + cellH > maxY) maxY = cellY + cellH;
      }
    }
  }

  // Need at least 60% bright cells to consider it a document
  const brightRatio = brightCount / totalCells;
  if (brightRatio < 0.5) return null;

  const docW = maxX - minX;
  const docH = maxY - minY;
  const docRatio = docH / docW; // A4 ≈ 1.414

  // Document must be at least 30% of the frame and roughly A4 shaped
  if (docW < w * 0.25 || docH < h * 0.3) return null;
  if (docRatio < 1.0 || docRatio > 2.0) return null;

  // ── Guarda de contraste de borda (BUG scanner A4 — NUNCA remover) ──
  // O auto-capture disparava antes do papel ser posicionado porque QUALQUER
  // região clara (parede/mesa/claro do enquadramento) em orientação retrato
  // produzia um "documento" de 80%x90% com ratio 2.00 que passava no gate
  // acima e, por nunca se mover, acumulava estabilidade até disparar.
  // Correção: se a região clara ENCOSTA na borda da grade amostrada e a
  // faixa logo APÓS a grade (entre a grade e a borda do frame) continua
  // clara, então não há contraste papel/fundo ali — é fundo claro ocupando
  // o frame todo, ou papel ainda fora do enquadramento. Nesses casos o
  // detector retorna null até o papel ficar bem posicionado (fundo escuro
  // visível ao redor do retângulo).
  const edgeTol = 4; // px — tolerância de quantização da grade
  const bandOffset = 6; // px — distância da faixa amostrada além da borda da grade
  const darkLimit = 110; // brilho médio máximo da faixa para considerar fundo escuro

  const touchesLeft = minX <= marginX + edgeTol;
  const touchesRight = maxX >= w - marginX - edgeTol;
  const touchesTop = minY <= marginY + edgeTol;
  const touchesBottom = maxY >= h - marginY - edgeTol;

  // Média de brilho de um bloco 5x5 centrado em (px, py), clampeado ao frame.
  const sampleBrightness = (px: number, py: number): number => {
    let sum = 0;
    let n = 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const sx = Math.min(Math.max(px + dx, 0), w - 1);
        const sy = Math.min(Math.max(py + dy, 0), h - 1);
        const d = ctx.getImageData(sx, sy, 1, 1).data;
        sum += (d[0] + d[1] + d[2]) / 3;
        n++;
      }
    }
    return sum / n;
  };
  const avgBrightness = (pts: Array<[number, number]>): number =>
    pts.reduce((acc, [px, py]) => acc + sampleBrightness(px, py), 0) / Math.max(1, pts.length);

  const leftOutside = Math.max(0, Math.floor(marginX - bandOffset));
  const rightOutside = Math.min(w - 1, Math.ceil(w - marginX + bandOffset));
  const topOutside = Math.max(0, Math.floor(marginY - bandOffset));
  const bottomOutside = Math.min(h - 1, Math.ceil(h - marginY + bandOffset));
  const midX = minX + docW / 2;
  const midY = minY + docH / 2;

  const brightSurround =
    (touchesLeft &&
      avgBrightness([
        [leftOutside, minY],
        [leftOutside, midY],
        [leftOutside, maxY],
      ]) > darkLimit) ||
    (touchesRight &&
      avgBrightness([
        [rightOutside, minY],
        [rightOutside, midY],
        [rightOutside, maxY],
      ]) > darkLimit) ||
    (touchesTop &&
      avgBrightness([
        [minX, topOutside],
        [midX, topOutside],
        [maxX, topOutside],
      ]) > darkLimit) ||
    (touchesBottom &&
      avgBrightness([
        [minX, bottomOutside],
        [midX, bottomOutside],
        [maxX, bottomOutside],
      ]) > darkLimit);

  if (brightSurround) return null;

  return { x: minX, y: minY, width: docW, height: docH };
}

/**
 * Aplica correção de perspectiva simples (crop + contraste) na imagem capturada.
 * Para uma correção completa de 4 pontos seria necessário WebGL/matrizes —
 * aqui fazemos crop na área detectada + ajuste de contraste.
 */
export function enhanceCapturedImage(
  sourceCanvas: HTMLCanvasElement,
  doc: DetectedDoc | null,
): string {
  const ctx = sourceCanvas.getContext('2d');
  if (!ctx) return sourceCanvas.toDataURL('image/jpeg', 0.92);

  const w = sourceCanvas.width;
  const h = sourceCanvas.height;

  // Determine crop area
  let sx: number, sy: number, sw: number, sh: number;
  if (doc) {
    // Add small padding
    const pad = Math.min(doc.width, doc.height) * 0.02;
    sx = Math.max(0, Math.floor(doc.x - pad));
    sy = Math.max(0, Math.floor(doc.y - pad));
    sw = Math.min(Math.ceil(doc.width + pad * 2), w - sx);
    sh = Math.min(Math.ceil(doc.height + pad * 2), h - sy);
  } else {
    // No detection — use full frame
    sx = 0; sy = 0; sw = w; sh = h;
  }

  // Create output canvas at cropped size
  const out = document.createElement('canvas');
  out.width = sw;
  out.height = sh;
  const outCtx = out.getContext('2d');
  if (!outCtx) return sourceCanvas.toDataURL('image/jpeg', 0.92);

  // Draw cropped region
  outCtx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

  // Enhance contrast
  try {
    const imageData = outCtx.getImageData(0, 0, sw, sh);
    const data = imageData.data;
    let min = 255, max = 0;
    for (let i = 0; i < data.length; i += 4) {
      const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (gray < min) min = gray;
      if (gray > max) max = gray;
    }
    const range = max - min || 1;
    const factor = 255 / range;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, Math.max(0, (data[i] - min) * factor));
      data[i + 1] = Math.min(255, Math.max(0, (data[i + 1] - min) * factor));
      data[i + 2] = Math.min(255, Math.max(0, (data[i + 2] - min) * factor));
    }
    outCtx.putImageData(imageData, 0, 0);
  } catch {
    // Canvas tainted — skip enhancement
  }

  return out.toDataURL('image/jpeg', 0.92);
}

/** Normaliza um texto para comparação de nomes (lowercase, sem espaços extras). */
export function normalizeText(s: string): string {
  return (s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Remove acentos para comparações menos sensíveis a caracteres. */
export function normalizeForMatch(s: string): string {
  return normalizeText(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
