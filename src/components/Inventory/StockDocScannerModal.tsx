/**
 * StockDocScannerModal — Scanner de documento A4 do fornecedor integrado
 * à câmera do Estoque.
 *
 * Fluxo:
 *   1. Câmera fullscreen com moldura A4, detecção de bordas e auto-capture
 *      (helpers compartilhados de src/lib/ocr/capture.ts).
 *   2. OCR via Tesseract.js (ocrService) → extrai fornecedor, CNPJ e itens.
 *   3. Revisão editável dos dados extraídos.
 *   4. Confirmação com match de fornecedor (Clientes/Fornecedores/CRM) e de
 *      produtos por nome (exato + similar/fuzzy), com ajuste de quantidades.
 *   5. Gravação: cria/atualiza fornecedor e adiciona itens ao estoque
 *      (produto existente → updateStock; novo → saveProduct).
 *
 * Regra AGENTS.md: OCR determinístico via Tesseract.js é permitido (não é IA).
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  X,
  Camera,
  Check,
  Plus,
  Minus,
  FileText,
  Building2,
  Package,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Search,
  Trash2,
} from 'lucide-react';
import { useToast } from '../shared/Toast';
import { storageService } from '../../services/storageService';
import { posAudio } from '../../services/audioService';
import { ocrSinglePage, type OcrResult } from '../../services/ocrService';
import {
  detectDocumentEdges,
  enhanceCapturedImage,
  normalizeForMatch,
  type DetectedDoc,
} from '../../lib/ocr/capture';
import { matchItemToProducts } from '../../lib/ocr/matchProducts';
import type { Product, Supplier } from '../../types';

// ── Diversos helpers ──────────────────────────────────────────────────

interface MatchedItem {
  /** Dados brutos da NF (editáveis) */
  productName: string;
  quantity: number;
  unitPrice: number;
  /** Resultado do match: produto existente sugerido (ou null p/ novo) */
  matchedProduct: Product | null;
  /** true quando o usuário escolheu criar um produto novo */
  forceNew: boolean;
  /** Lista de candidatos similares sugeridos */
  candidates: Product[];
}

interface StockDocScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBranch?: { name: string; city: string };
  onProductsImported?: () => void;
}

type Phase = 'menu' | 'capture' | 'review' | 'confirm' | 'saving';

function emptyMatchedItem(name = ''): MatchedItem {
  return {
    productName: name,
    quantity: name ? 1 : 0,
    unitPrice: 0,
    matchedProduct: null,
    forceNew: false,
    candidates: [],
  };
}

export const StockDocScannerModal: React.FC<StockDocScannerModalProps> = ({
  isOpen,
  onClose,
  currentBranch,
  onProductsImported,
}) => {
  const { addToast, success, error } = useToast();

  // ── Fase de câmera ──────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>('menu');
  const [isSaving, setIsSaving] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [detectedDoc, setDetectedDoc] = useState<DetectedDoc | null>(null);
  const [stabilityRef] = useState(() => ({ v: 0 }));
  const lastDocRef = useRef<DetectedDoc | null>(null); // última posição/tamanho estáveis
  const warmupStartRef = useRef<number>(0); // tempo de entrada no modo capture (foco)
  const [stabilityCount, setStabilityCount] = useState(0);
  const [autoCaptureEnabled, setAutoCaptureEnabled] = useState(true);
  const [lastCaptureTime, setLastCaptureTime] = useState(0);
  const [capturedPage, setCapturedPage] = useState<string | null>(null);

  // ── OCR / revisão ────────────────────────────────────────────────
  const [ocrProgress, setOcrProgress] = useState<{ status: string; progress: number } | null>(null);
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [supplierName, setSupplierName] = useState('');
  const [supplierCNPJ, setSupplierCNPJ] = useState('');
  const [items, setItems] = useState<MatchedItem[]>([]);

  // Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Cleanup ─────────────────────────────────────────────────────
  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setStream(null);
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopStream();
  }, [stopStream]);

  // Reinicia o estado quando o modal é reaberto
  const resetAll = useCallback(() => {
    stopStream();
    setPhase('menu');
    setCameraError(null);
    setDetectedDoc(null);
    stabilityRef.v = 0;
    lastDocRef.current = null;
    warmupStartRef.current = 0;
    setStabilityCount(0);
    setCapturedPage(null);
    setOcrResult(null);
    setOcrProgress(null);
    setSupplierName('');
    setSupplierCNPJ('');
    setItems([]);
    setIsSaving(false);
  }, [stopStream, stabilityRef]);

  // ── Iniciar câmera ──────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setCameraError(null);
    setCapturedPage(null);
    setOcrResult(null);
    setSupplierName('');
    setSupplierCNPJ('');
    setItems([]);
    setDetectedDoc(null);
    stabilityRef.v = 0;
    lastDocRef.current = null;
    warmupStartRef.current = Date.now(); // marca início do período de foco
    setStabilityCount(0);
    setPhase('capture');

    try {
      const media = navigator.mediaDevices;
      if (!media || !media.getUserMedia) throw new Error('getUserMedia indisponível');
      const s = await media.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        } as MediaTrackConstraints & { focusMode?: string },
      });
      streamRef.current = s;
      setStream(s);
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        await videoRef.current.play();
      }
    } catch (err: any) {
      let msg = 'Câmera indisponível.';
      const name = err?.name;
      if (name === 'NotAllowedError') msg = 'Permissão da câmera negada.';
      else if (name === 'NotFoundError') msg = 'Nenhuma câmera encontrada.';
      else if (name === 'NotReadableError') msg = 'Câmera em uso por outro app.';
      setCameraError(msg);
      setPhase('menu');
      error(msg);
    }
  }, [stabilityRef, error]);

  // ── Loop de detecção de bordas + auto-capture ───────────────────
  useEffect(() => {
    if (!stream || !autoCaptureEnabled || phase !== 'capture') return;

    detectionIntervalRef.current = setInterval(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) return;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const doc = detectDocumentEdges(ctx, canvas.width, canvas.height);

      // Período de foco/entrada: dá tempo de enquadrar antes de contar estabilidade
      const warmupMs = 1500;
      if (Date.now() - warmupStartRef.current < warmupMs) {
        setDetectedDoc(doc);
        stabilityRef.v = 0;
        setStabilityCount(0);
        return;
      }

      if (doc) {
        // Tamanho mínimo real do documento (evita capturar região acidental/pequena)
        const canvasW = canvas.width || 1;
        const canvasH = canvas.height || 1;
        const minW = canvasW * 0.45;
        const minH = canvasH * 0.45;
        const docBigEnough = doc.width >= minW && doc.height >= minH;

        if (!docBigEnough) {
          // Detectou algo, mas pequeno demais — não trata como documento estável
          lastDocRef.current = null;
          stabilityRef.v = 0;
          setStabilityCount(0);
          setDetectedDoc(doc);
          return;
        }

        const prev = lastDocRef.current;
        const tol = 6; // tolerância (px) por eixo/tamanho — precisa estar PARADO de verdade
        const moved =
          !prev ||
          Math.abs(doc.x - prev.x) > tol ||
          Math.abs(doc.y - prev.y) > tol ||
          Math.abs(doc.width - prev.width) > tol ||
          Math.abs(doc.height - prev.height) > tol;

        if (moved) {
          // mudou de posição/tamanho → reinicia contagem de estabilidade
          lastDocRef.current = { x: doc.x, y: doc.y, width: doc.width, height: doc.height };
          stabilityRef.v = 1;
          setStabilityCount(1);
          setDetectedDoc(doc);
        } else {
          // mesmo documento, firme e parado → acumula estabilidade
          stabilityRef.v += 1;
          setStabilityCount(stabilityRef.v);
          setDetectedDoc(doc);
        }

        // Frames estáveis consecutivos (~2s a 30fps) antes de capturar
        if (stabilityRef.v >= 60) {
          const now = Date.now();
          if (now - lastCaptureTime > 2000) {
            doCapture(doc);
            stabilityRef.v = 0;
            lastDocRef.current = null;
            setStabilityCount(0);
            setLastCaptureTime(now);
          }
        }
      } else {
        lastDocRef.current = null;
        stabilityRef.v = 0;
        setStabilityCount(0);
        setDetectedDoc(null);
      }
    }, 33);

    return () => {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
        detectionIntervalRef.current = null;
      }
    };
  }, [stream, autoCaptureEnabled, phase, lastCaptureTime, stabilityRef, lastDocRef, warmupStartRef]);

  // ── Captura ─────────────────────────────────────────────────────
  const doCapture = useCallback((doc: DetectedDoc | null) => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const enhanced = enhanceCapturedImage(canvas, doc);
    setCapturedPage(enhanced);
    stopStream();
    setPhase('review');
  }, [stopStream]);

  const handleManualCapture = useCallback(() => {
    doCapture(detectedDoc);
  }, [doCapture, detectedDoc]);

  // ── OCR ─────────────────────────────────────────────────────────
  const runOcr = useCallback(async () => {
    if (!capturedPage) return;
    setOcrProgress({ status: 'Reconhecendo texto...', progress: 0 });
    try {
      const res = await ocrSinglePage(capturedPage, undefined, (p) =>
        setOcrProgress({ status: p.status, progress: p.progress }),
      );
      setOcrResult(res);
      const parsed = res.parsed;
      if (parsed.supplier?.name) setSupplierName(parsed.supplier.name);
      if (parsed.supplier?.cnpj) setSupplierCNPJ(parsed.supplier.cnpj);
      if (parsed.items.length) {
        setItems(
          parsed.items.map((it) => ({
            productName: it.productName,
            quantity: it.quantity || 1,
            unitPrice: it.unitPrice || 0,
            matchedProduct: null,
            forceNew: false,
            candidates: [],
          })),
        );
      } else {
        setItems([emptyMatchedItem()]);
      }
    } catch (e: any) {
      error(`Erro no OCR: ${e?.message || 'desconhecido'}`);
    } finally {
      setOcrProgress(null);
    }
  }, [capturedPage, error]);

  // ── Edição da revisão ───────────────────────────────────────────
  const updateItem = (idx: number, patch: Partial<MatchedItem>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const addItemRow = () => {
    setItems((prev) => [...prev, emptyMatchedItem()]);
  };

  const removeItemRow = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  // ── Match de produtos (exato + fuzzy) ───────────────────────────
  const runProductMatch = useCallback(() => {
    const products = storageService.getProducts();

    const mapped: MatchedItem[] = items.map((it) => {
      const { product, candidates } = matchItemToProducts(it.productName, products);
      // Se o match foi fuzzy, o produto escolhido também aparece como candidato
      // na revisão (para o usuário poder trocar). Não duplicamos: o escolhido
      // entra em matchedProduct e os demais como candidatos.
      return { ...it, matchedProduct: product, candidates, forceNew: false };
    });

    setItems(mapped);
    setPhase('confirm');
  }, [items]);

  // ── Gravação (fornecedor + produtos) ────────────────────────────
  const handleConfirm = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);

    // 1) Fornecedor: cria se não existir
    const name = supplierName.trim();
    if (name) {
      const suppliers = storageService.getSuppliers();
      const exists = suppliers.find(
        (s) => normalizeForMatch(s.companyName || s.tradeName || '') === normalizeForMatch(name),
      );
      if (!exists) {
        const supplier: Partial<Supplier> & { id?: string } = {
          name,
          companyName: name,
          tradeName: name,
          cnpj: supplierCNPJ || '',
          contactName: '',
          email: '',
          phone: '',
        };
        try {
          storageService.saveSupplier(supplier as Supplier);
        } catch (e: any) {
          // Colaborador sem permissão para criar fornecedor: não bloqueia o estoque
          console.warn('[DocScanner] Falha ao salvar fornecedor:', e?.message);
        }
      }
    }

    // 2) Produtos / estoque
    const operator = 'Documento Fornecedor';
    const norm = (s: string) => normalizeForMatch(s);

    for (const it of items) {
      const qty = it.quantity || 0;
      if (qty <= 0) continue;
      const prodName = it.productName?.trim();
      if (!prodName) continue;

      const target = it.forceNew ? null : it.matchedProduct;

      if (target) {
        try {
          await storageService.updateStock(
            target.id,
            qty,
            `Entrada NF ${supplierName || 'Fornecedor'} - ${prodName}`,
            operator,
          );
        } catch (e: any) {
          console.warn('[DocScanner] updateStock falhou:', e?.message);
        }
      } else {
        // Cria produto novo
        const newProd: Product = {
          id: `prod-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          barcode: '',
          name: prodName,
          category: 'Geral',
          unit: 'un',
          costPrice: it.unitPrice || 0,
          salePrice: it.unitPrice || 0,
          currentStock: qty,
          minStock: 0,
          maxStock: 0,
          imageUrl: '',
          active: true,
          updatedAt: new Date().toISOString(),
        };
        try {
          storageService.saveProduct(newProd);
        } catch (e: any) {
          console.warn('[DocScanner] saveProduct falhou:', e?.message);
        }
      }
    }

    posAudio.chime();
    if (onProductsImported) onProductsImported();
    success('Itens adicionados ao estoque!');
    resetAll();
  }, [isSaving, supplierName, supplierCNPJ, items, onProductsImported, success, resetAll]);

  if (!isOpen) return null;

  // ── MENU (tela inicial do modo A4) ──────────────────────────────
  if (phase === 'menu') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center sm:p-4 bg-slate-900/80 backdrop-blur-md animate-fadeIn">
        <div className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-[#27272a] flex items-center justify-between bg-slate-50 dark:bg-[#09090b]/60">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Scanner de Documento A4
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Nota fiscal do fornecedor (papel A4)
                </p>
              </div>
            </div>
            <button
              onClick={() => { resetAll(); onClose(); }}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 overflow-y-auto space-y-4">
            {currentBranch && (
              <div className="p-3 rounded-xl bg-indigo-500/5 border border-indigo-500/20 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300 font-bold">
                  <Building2 className="w-4 h-4 text-indigo-500" />
                  <span>Destino: {currentBranch.name} ({currentBranch.city})</span>
                </div>
                <span className="text-[10px] bg-indigo-600 text-white font-extrabold px-2 py-0.5 rounded-md">
                  FILIAL ATIVA
                </span>
              </div>
            )}

            <div className="p-8 rounded-2xl border-2 border-dashed border-slate-300 dark:border-[#27272a] bg-slate-50 dark:bg-[#09090b] flex flex-col items-center justify-center text-center space-y-4">
              <div className="p-4 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                <Camera className="w-8 h-8" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Enquadre o documento A4 do fornecedor
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
                  A câmera captura automaticamente quando o papel estiver estável. Depois lemos o
                  fornecedor e os itens por OCR para adicionar ao estoque.
                </p>
              </div>
              {cameraError && (
                <div className="w-full max-w-xs p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-400 font-bold">
                  {cameraError}
                </div>
              )}
              <button
                onClick={startCamera}
                className="w-full max-w-xs py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md transition-colors flex items-center justify-center gap-2"
              >
                <Camera className="w-4 h-4" />
                <span>Ligar Câmera e Escanear</span>
              </button>
            </div>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-[#09090b]/80 border-t border-slate-200 dark:border-[#27272a] flex justify-end shrink-0">
            <button
              onClick={() => { resetAll(); onClose(); }}
              className="px-5 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-black font-bold text-xs"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── CAPTURE (fullscreen câmera) ─────────────────────────────────
  if (phase === 'capture') {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col" onDoubleClick={() => { /* noop */ }}>
        <button
          onClick={() => { stopStream(); resetAll(); }}
          className="absolute right-4 z-50 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 backdrop-blur-sm transition-colors"
          style={{ top: 'max(1rem, env(safe-area-inset-top))' }}
          title="Fechar Scanner"
        >
          <X className="w-6 h-6" />
        </button>

        <div className="relative flex-1">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
          />
          {/* Canvas oculto de detecção */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Overlay A4 — ocupa quase toda a largura da tela para o documento ficar grande e o OCR ler melhor */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-[92%] md:w-[55vh] aspect-[1/1.414]">
              {/* Escurecer entorno — clip por bordas */}
              <div className="absolute inset-0 bg-black/40" />
              {/* Moldura clara */}
              <div className="absolute inset-0 rounded-2xl"
                style={{
                  boxShadow: detectedDoc
                    ? '0 0 0 9999px rgba(0,0,0,0.55), 0 0 0 3px #22c55e, 0 0 30px 6px rgba(34,197,94,0.4)'
                    : '0 0 0 9999px rgba(0,0,0,0.55), 0 0 0 3px rgba(255,255,255,0.85)',
                }}
              >
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 rounded-tl-2xl"
                  style={{ borderColor: detectedDoc ? '#22c55e' : 'rgba(255,255,255,0.9)' }} />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 rounded-tr-2xl"
                  style={{ borderColor: detectedDoc ? '#22c55e' : 'rgba(255,255,255,0.9)' }} />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 rounded-bl-2xl"
                  style={{ borderColor: detectedDoc ? '#22c55e' : 'rgba(255,255,255,0.9)' }} />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 rounded-br-2xl"
                  style={{ borderColor: detectedDoc ? '#22c55e' : 'rgba(255,255,255,0.9)' }} />
              </div>
            </div>
          </div>

          {/* Indicador de estabilidade */}
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 text-white text-[10px] font-bold bg-black/50 px-3 py-1 rounded-full backdrop-blur-sm"
            style={{ top: 'max(4rem, calc(env(safe-area-inset-top) + 1rem))' }}>
            <span className={`w-1.5 h-1.5 rounded-full ${detectedDoc ? 'bg-emerald-400 animate-pulse' : 'bg-white/40'}`} />
            {Date.now() - warmupStartRef.current < 1500
              ? 'Focando a câmera — enquadre o papel'
              : detectedDoc
                ? stabilityCount >= 60 ? 'Capturando...' : 'Documento detectado — mantenha firme'
                : 'Aproxime o documento do fornecedor'}
          </div>
        </div>

        <div
          className="bg-white dark:bg-[#18181b] rounded-t-3xl px-4 pt-4 space-y-3 border-t border-slate-200 dark:border-[#27272a]"
          style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
        >
          <div className="flex items-center justify-between">
            <button
              onClick={() => setAutoCaptureEnabled((v) => !v)}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 ${
                autoCaptureEnabled
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 dark:bg-[#27272a] text-slate-600 dark:text-slate-300'
              }`}
            >
              <Check className="w-3.5 h-3.5" />
              Auto-capture
            </button>
            <button
              onClick={handleManualCapture}
              className="flex-1 ml-3 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors"
            >
              Capturar Manualmente
            </button>
          </div>
          <button
            onClick={() => { stopStream(); resetAll(); }}
            className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-[#27272a] hover:bg-slate-200 dark:hover:bg-[#3f3f46] text-slate-600 dark:text-slate-300 text-xs font-bold transition-colors"
          >
            Fechar Câmera
          </button>
        </div>
      </div>
    );
  }

  // ── REVIEW (imagem + OCR + revisão editável) ────────────────────
  if (phase === 'review') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center sm:p-4 bg-slate-900/80 backdrop-blur-md animate-fadeIn">
        <div className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-[#27272a] flex items-center justify-between bg-slate-50 dark:bg-[#09090b]/60">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Conferir Documento
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Confira os dados lidos pela câmera (OCR)
                </p>
              </div>
            </div>
            <button
              onClick={() => { resetAll(); onClose(); }}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="flex gap-3">
              {capturedPage && (
                <img src={capturedPage} alt="Documento capturado"
                  className="w-32 h-44 object-cover rounded-xl border border-slate-200 dark:border-[#27272a] shrink-0" />
              )}
              <button
                onClick={() => { stopStream(); setPhase('menu'); }}
                className="self-center px-4 py-3 rounded-xl bg-slate-100 dark:bg-[#27272a] hover:bg-slate-200 dark:hover:bg-[#3f3f46] text-slate-700 dark:text-slate-300 text-xs font-bold transition-colors"
              >
                Refazer Foto
              </button>
            </div>

            {/* Botão OCR */}
            {!ocrProgress && (
              <button
                onClick={runOcr}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors flex items-center justify-center gap-2"
              >
                <Search className="w-4 h-4" />
                Ler Documento (OCR)
              </button>
            )}
            {ocrProgress && (
              <div className="p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/20 text-center">
                <Loader2 className="w-5 h-5 text-indigo-500 animate-spin mx-auto mb-2" />
                <p className="text-xs font-bold text-indigo-700 dark:text-indigo-300">{ocrProgress.status}</p>
                {ocrProgress.progress > 0 && (
                  <div className="mt-2 h-1.5 bg-slate-200 dark:bg-[#27272a] rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 transition-all"
                      style={{ width: `${ocrProgress.progress}%` }} />
                  </div>
                )}
              </div>
            )}

            {/* Fornecedor */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  <Building2 className="w-3.5 h-3.5 inline mr-1" />
                  Fornecedor
                </label>
                <input
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  placeholder="Nome do fornecedor"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  CNPJ
                </label>
                <input
                  value={supplierCNPJ}
                  onChange={(e) => setSupplierCNPJ(e.target.value)}
                  placeholder="00.000.000/0000-00"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] rounded-xl text-xs font-mono text-slate-900 dark:text-white placeholder:text-slate-400"
                />
              </div>
            </div>

            {/* Itens */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  <Package className="w-3.5 h-3.5 inline mr-1" />
                  Itens
                </label>
                <button onClick={addItemRow} className="text-xs text-indigo-600 dark:text-indigo-400 font-bold hover:underline">
                  + Adicionar item
                </button>
              </div>
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {items.map((it, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-[#09090b] rounded-xl">
                    <input
                      value={it.productName}
                      onChange={(e) => updateItem(idx, { productName: e.target.value })}
                      placeholder="Produto"
                      className="flex-1 px-2 py-1.5 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-lg text-xs text-slate-900 dark:text-white placeholder:text-slate-400"
                    />
                    <input
                      type="number" min="0" step="0.01"
                      value={it.quantity}
                      onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) || 0 })}
                      placeholder="Qtd"
                      className="w-16 px-2 py-1.5 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-lg text-xs text-slate-900 dark:text-white"
                    />
                    <input
                      type="number" min="0" step="0.01"
                      value={it.unitPrice}
                      onChange={(e) => updateItem(idx, { unitPrice: Number(e.target.value) || 0 })}
                      placeholder="Valor"
                      className="w-20 px-2 py-1.5 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-lg text-xs text-slate-900 dark:text-white"
                    />
                    {items.length > 1 && (
                      <button onClick={() => removeItemRow(idx)} className="p-1 text-rose-500 hover:bg-rose-500/10 rounded-lg">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-slate-200 dark:border-[#27272a] bg-slate-50 dark:bg-[#09090b]/50 flex gap-2">
            <button
              onClick={() => { stopStream(); setPhase('menu'); }}
              className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-[#27272a] hover:bg-slate-200 dark:hover:bg-[#3f3f46] text-slate-700 dark:text-slate-300 font-bold text-xs transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                const validItems = items.filter((it) => it.productName.trim() && it.quantity > 0);
                if (!validItems.length) {
                  addToast('error', 'Adicione ao menos um item com quantidade maior que zero.');
                  return;
                }
                runProductMatch();
              }}
              className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition-colors flex items-center justify-center gap-2"
            >
              <Search className="w-4 h-4" />
              Conferir em Estoque
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── CONFIRM (match de produtos + ajuste de quantidades) ─────────
  if (phase === 'confirm') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center sm:p-4 bg-slate-900/80 backdrop-blur-md animate-fadeIn">
        <div className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-[#27272a] flex items-center justify-between bg-slate-50 dark:bg-[#09090b]/60">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Confirmar Itens no Estoque
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Ajuste as quantidades e escolha os produtos
                </p>
              </div>
            </div>
            <button
              onClick={() => resetAll()}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-3">
            {/* Fornecedor */}
            <div className="p-3 rounded-xl bg-indigo-500/5 border border-indigo-500/20">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-indigo-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-indigo-800 dark:text-indigo-300 truncate">
                    Fornecedor: {supplierName || '(sem nome)'}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {supplierName
                      ? 'Será criado/vinculado em Clientes/Fornecedores/CRM automaticamente.'
                      : 'Sem nome de fornecedor detectado — pode editar voltando.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Itens */}
            {items.map((it, idx) => {
              const isNew = !it.matchedProduct || it.forceNew;
              return (
                <div key={idx} className="p-3 rounded-xl bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-white flex-1 truncate">
                      {it.productName}
                    </span>
                    {isNew ? (
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[10px] font-extrabold uppercase">
                        Novo produto
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[10px] font-extrabold uppercase">
                        Encontrado
                      </span>
                    )}
                  </div>

                  {/* Controle de quantidade */}
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-slate-500">Qtd:</span>
                    <button
                      onClick={() => updateItem(idx, { quantity: Math.max(0, (it.quantity || 0) - 1) })}
                      className="w-7 h-7 rounded-lg bg-slate-200 dark:bg-[#27272a] hover:bg-slate-300 dark:hover:bg-[#3f3f46] text-slate-700 dark:text-slate-200 flex items-center justify-center transition-colors"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="number" min="0" step="1" value={it.quantity}
                      onChange={(e) => updateItem(idx, { quantity: Math.max(0, Number(e.target.value) || 0) })}
                      className="w-16 px-2 py-1.5 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-lg text-sm font-bold text-slate-900 dark:text-white text-center"
                    />
                    <button
                      onClick={() => updateItem(idx, { quantity: (it.quantity || 0) + 1 })}
                      className="w-7 h-7 rounded-lg bg-slate-200 dark:bg-[#27272a] hover:bg-slate-300 dark:hover:bg-[#3f3f46] text-slate-700 dark:text-slate-200 flex items-center justify-center transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[11px] text-slate-400">{it.unitPrice ? `R$ ${it.unitPrice.toFixed(2)}` : ''}</span>
                  </div>

                  {/* Match status */}
                  {isNew ? (
                    <div className="flex items-center gap-2 text-[11px]">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span className="text-slate-500">
                        Não encontrado no estoque — será criado com nome acima.
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-[11px]">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span className="text-slate-600 dark:text-slate-300">
                        Usar: <b>{it.matchedProduct?.name}</b> (estoque atual{' '}
                        {it.matchedProduct?.currentStock} {it.matchedProduct?.unit})
                      </span>
                    </div>
                  )}

                  {/* Candidatos similares */}
                  {it.candidates.length > 0 && !it.forceNew && (
                    <div className="pt-1">
                      <p className="text-[10px] font-bold text-slate-400 mb-1">Outros similares:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {it.candidates.slice(0, 4).map((c) => (
                          <button
                            key={c.id}
                            onClick={() => updateItem(idx, { matchedProduct: c, forceNew: false })}
                            className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                              it.matchedProduct?.id === c.id
                                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                                : 'bg-white dark:bg-[#18181b] border-slate-200 dark:border-[#27272a] text-slate-500 dark:text-slate-300'
                            }`}
                          >
                            {c.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {!isNew && (
                    <button
                      onClick={() => updateItem(idx, { forceNew: true })}
                      className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
                    >
                      Criar como novo produto em vez disso
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="px-6 py-4 border-t border-slate-200 dark:border-[#27272a] bg-slate-50 dark:bg-[#09090b]/50 flex gap-2">
            <button
              onClick={() => setPhase('review')}
              className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-[#27272a] hover:bg-slate-200 dark:hover:bg-[#3f3f46] text-slate-700 dark:text-slate-300 font-bold text-xs transition-colors"
            >
              Voltar
            </button>
            <button
              onClick={handleConfirm}
              disabled={isSaving}
              className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs shadow-md transition-colors flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Gravando...</>
              ) : (
                <><Check className="w-4 h-4" /> Adicionar ao Estoque</>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // SAVING — é tratado dentro do confirm (botão desabilitado)
  return null;
};

export default StockDocScannerModal;
