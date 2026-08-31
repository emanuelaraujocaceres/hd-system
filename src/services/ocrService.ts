/**
 * ocrService.ts — Serviço OCR que usa Tesseract.js para extrair texto de imagens
 * e o parser para transformar em dados estruturados de NF.
 *
 * Regra AGENTS.md: Tesseract.js é OCR determinístico, NÃO é IA generativa (Gemini/OpenAI).
 */

import Tesseract from 'tesseract.js';
import templatesData from '../lib/ocr/templates.json';
import {
  parseOcr,
  parseNFeXml,
  detectTemplate,
  type OcrTemplate,
  type ParsedDocument,
} from '../lib/ocr/parser';

// Templates carregados do JSON
const TEMPLATES: OcrTemplate[] = templatesData.templates;

export interface OcrProgress {
  status: string;
  progress: number; // 0-100
}

export interface OcrResult {
  /** Texto bruto extraído pelo Tesseract */
  rawText: string;
  /** Dados estruturados extraídos do documento */
  parsed: ParsedDocument;
  /** Confiança média do OCR (0-100) */
  confidence: number;
}

/**
 * OCR de uma imagem (dataURL ou URL) → texto bruto.
 * Idioma padrão: português (por) + inglês (eng).
 */
async function recognizeImage(
  imageSource: string,
  onProgress?: (p: OcrProgress) => void,
): Promise<{ text: string; confidence: number }> {
  const result = await Tesseract.recognize(imageSource, 'por+eng', {
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress({
          status: 'Reconhecendo texto...',
          progress: Math.round((m.progress || 0) * 100),
        });
      } else if (onProgress && m.status) {
        onProgress({ status: m.status, progress: 0 });
      }
    },
  });

  return {
    text: result.data.text,
    confidence: result.data.confidence,
  };
}

/**
 * OCR de múltiplas páginas (dataURLs) → dados estruturados.
 * Cada página é OCRizada individualmente; o texto é concatenado e parseado uma vez.
 */
export async function ocrPages(
  pages: string[],
  templateId?: string,
  onProgress?: (p: OcrProgress) => void,
): Promise<OcrResult> {
  if (!pages.length) {
    throw new Error('Nenhuma página para processar.');
  }

  let fullText = '';
  let totalConfidence = 0;

  for (let i = 0; i < pages.length; i++) {
    if (onProgress) {
      onProgress({
        status: `Página ${i + 1}/${pages.length} — OCR...`,
        progress: Math.round(((i) / pages.length) * 100),
      });
    }

    const { text, confidence } = await recognizeImage(pages[i], (p) => {
      if (onProgress) {
        onProgress({
          status: `Página ${i + 1}/${pages.length} — ${p.status}`,
          progress: Math.round(((i + p.progress / 100) / pages.length) * 100),
        });
      }
    });

    fullText += '\n' + text;
    totalConfidence += confidence;
  }

  const avgConfidence = Math.round(totalConfidence / pages.length);

  if (onProgress) {
    onProgress({ status: 'Parseando dados...', progress: 95 });
  }

  // Detectar template (se não especificado, auto-detecta)
  const tpl = templateId
    ? TEMPLATES.find((t) => t.id === templateId) || detectTemplate(fullText, TEMPLATES)
    : detectTemplate(fullText, TEMPLATES);

  // Parsear texto em dados estruturados
  const parsed = parseOcr(fullText, tpl);

  if (onProgress) {
    onProgress({ status: 'Concluído!', progress: 100 });
  }

  return {
    rawText: fullText,
    parsed,
    confidence: avgConfidence,
  };
}

/**
 * OCR de uma única imagem → dados estruturados.
 * Wrapper conveniente para uma única página.
 */
export async function ocrSinglePage(
  page: string,
  templateId?: string,
  onProgress?: (p: OcrProgress) => void,
): Promise<OcrResult> {
  return ocrPages([page], templateId, onProgress);
}

/**
 * Parse direto de XML de NF-e (sem OCR).
 */
export function parseXml(xmlString: string): ParsedDocument {
  return parseNFeXml(xmlString);
}

/**
 * Retorna os templates disponíveis.
 */
export function getTemplates(): OcrTemplate[] {
  return TEMPLATES;
}

/**
 * Detecta QR code de uma imagem usando BarcodeDetector (browser native).
 * Retorna a chave de acesso de 44 dígitos ou null.
 */
export async function detectQrAccessKey(imageSource: string): Promise<string | null> {
  const BarcodeDetectorClass = (window as any).BarcodeDetector;
  if (!BarcodeDetectorClass) return null;

  try {
    const detector = new BarcodeDetectorClass({ formats: ['qr_code'] });

    // Se for dataURL, criar ImageBitmap
    if (imageSource.startsWith('data:') || imageSource.startsWith('blob:')) {
      const img = await createImageBitmap(
        await (await fetch(imageSource)).blob(),
      );
      const codes = await detector.detect(img);
      const qr = codes.find((c: any) => c.format === 'qr_code');
      if (qr) {
        const raw = qr.rawValue || '';
        const keyMatch = raw.match(/\d{44}/);
        if (keyMatch) return keyMatch[0];
        const digits = raw.replace(/\D/g, '').slice(0, 44);
        if (digits.length === 44) return digits;
      }
    }
  } catch {
    // BarcodeDetector pode falhar em alguns browsers
  }

  return null;
}
