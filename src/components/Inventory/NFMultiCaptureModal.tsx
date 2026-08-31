/**
 * NFMultiCaptureModal - Scanner de documentos A4 com OCR integrado.
 *
 * Funcionalidades:
 * - Câmera fullscreen com overlay de proporção A4
 * - Detecção automática de bordas do documento
 * - Captura automática quando documento estabiliza
 * - Correção de perspectiva e contraste
 * - OCR via Tesseract.js com preview editável
 * - Auto-extração de dados (fornecedor, CNPJ, itens, totais)
 * - Multi-página com QR Code para chave de acesso
 *
 * Mantém compatibilidade com onCaptured(pages, templateId, accessKey?).
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  X, Camera, Trash2, Check, Layers, ScanLine, KeyRound,
  FileText, Loader2, AlertTriangle, RotateCcw, Zap,
} from 'lucide-react';
import { useToast } from '../shared/Toast';
import { ocrPages, detectQrAccessKey, type OcrResult } from '../../services/ocrService';
import type { NFRecordItem } from '../../types';
import {
  detectDocumentEdges,
  enhanceCapturedImage,
  type DetectedDoc,
} from '../../lib/ocr/capture';

// ── Templates ─────────────────────────────────────────────────────────

export const NF_TEMPLATE_OPTIONS = [
  { id: 'danfe', label: 'DANFE (NF-e)' },
  { id: 'ambev', label: 'Ambev' },
  { id: 'coca', label: 'Coca-Cola' },
  { id: 'lagoazul', label: 'Lago Azul' },
  { id: 'generic', label: 'Genérico / Outro' },
] as const;

export type NFTemplateId = (typeof NF_TEMPLATE_OPTIONS)[number]['id'];

// ── Tipos ─────────────────────────────────────────────────────────────

type Phase = 'camera' | 'ocr' | 'review';

// ── Props ─────────────────────────────────────────────────────────────

interface NFMultiCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCaptured: (
    pages: string[],
    templateId: string,
    accessKey?: string,
    ocrResult?: OcrResult,
  ) => void;
  initialTemplate?: string;
}

// ── Component ─────────────────────────────────────────────────────────

export const NFMultiCaptureModal: React.FC<NFMultiCaptureModalProps> = ({
  isOpen,
  onClose,
  onCaptured,
  initialTemplate = 'danfe',
}) => {
  const { addToast } = useToast();

  // Core state
  const [phase, setPhase] = useState<Phase>('camera');
  const [pages, setPages] = useState<string[]>([]);
  const [templateId, setTemplateId] = useState<string>(initialTemplate);
  const [accessKey, setAccessKey] = useState<string | null>(null);

  // Camera state
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  // Edge detection state
  const [detectedDoc, setDetectedDoc] = useState<DetectedDoc | null>(null);
  const [stabilityCount, setStabilityCount] = useState(0);
  const [autoCaptureEnabled, setAutoCaptureEnabled] = useState(true);
  const [lastCaptureTime, setLastCaptureTime] = useState(0);

  // OCR state
  const [ocrProgress, setOcrProgress] = useState({ status: '', progress: 0 });
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);

  // Review state (editable OCR results)
  const [reviewSupplier, setReviewSupplier] = useState('');
  const [reviewCNPJ, setReviewCNPJ] = useState('');
  const [reviewDocNumber, setReviewDocNumber] = useState('');
  const [reviewTotal, setReviewTotal] = useState('');
  const [reviewItems, setReviewItems] = useState<NFRecordItem[]>([]);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stabilityRef = useRef(0);

  // ── Camera lifecycle ──────────────────────────────────────────────

  const stopCamera = useCallback(() => {
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

  const startCamera = useCallback(async () => {
    setCameraError(null);
    setIsStarting(true);
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
      addToast('error', msg);
    } finally {
      setIsStarting(false);
    }
  }, [addToast]);

  useEffect(() => {
    if (isOpen && phase === 'camera') {
      setPages([]);
      setCameraError(null);
      setAccessKey(null);
      setOcrResult(null);
      setDetectedDoc(null);
      stabilityRef.current = 0;
      setStabilityCount(0);
      startCamera();
    }
    return () => stopCamera();
  }, [isOpen, phase, startCamera, stopCamera]);

  // ── Edge detection loop ──────────────────────────────────────────

  useEffect(() => {
    if (!stream || !autoCaptureEnabled || phase !== 'camera') return;

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

      if (doc) {
        // Check if position is stable (within 5% tolerance)
        const prev = stabilityRef.current;
        const currentHash = Math.round(doc.x / 10) * 1000 + Math.round(doc.y / 10);
        if (currentHash === prev) {
          const count = stabilityRef.current === 0 ? 1 : stabilityRef.current;
          stabilityRef.current = count + 1;
          setStabilityCount(count + 1);
          setDetectedDoc(doc);
        } else {
          stabilityRef.current = currentHash;
          setStabilityCount(0);
          setDetectedDoc(doc);
        }

        // Auto-capture after ~1.5 seconds of stability (~45 frames at 30fps)
        if (stabilityRef.current >= 45) {
          const now = Date.now();
          if (now - lastCaptureTime > 2000) {
            doCapture(doc);
            stabilityRef.current = 0;
            setStabilityCount(0);
            setLastCaptureTime(now);
          }
        }
      } else {
        stabilityRef.current = 0;
        setStabilityCount(0);
        setDetectedDoc(null);
      }
    }, 33); // ~30fps

    return () => {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
        detectionIntervalRef.current = null;
      }
    };
  }, [stream, autoCaptureEnabled, phase, lastCaptureTime]);

  // ── Capture ──────────────────────────────────────────────────────

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

    setPages((prev) => {
      if (prev.length > 0 && prev[prev.length - 1] === enhanced) return prev;
      return [...prev, enhanced];
    });
    addToast('success', 'Página capturada!');
  }, [addToast]);

  const handleManualCapture = useCallback(() => {
    doCapture(detectedDoc);
  }, [doCapture, detectedDoc]);

  const removePage = useCallback((idx: number) => {
    setPages((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const clearPages = useCallback(() => setPages([]), []);

  // ── QR Code scan ────────────────────────────────────────────────

  const scanQr = useCallback(async () => {
    const BarcodeDetectorClass = (window as any).BarcodeDetector;
    if (!BarcodeDetectorClass || !videoRef.current) {
      addToast('error', 'Leitor de QR indisponível neste navegador.');
      return;
    }
    try {
      const detector = new BarcodeDetectorClass({ formats: ['qr_code'] });
      const codes = await detector.detect(videoRef.current);
      if (!codes.length) {
        addToast('error', 'Nenhum QR Code encontrado.');
        return;
      }
      const raw = codes[0].rawValue || '';
      const key = (raw.match(/\d{44}/) || [raw.replace(/\D/g, '').slice(0, 44)])[0];
      if (!key || key.length !== 44) {
        addToast('error', 'QR não contém chave de acesso válida (44 dígitos).');
        return;
      }
      setAccessKey(key);
      addToast('success', 'Chave de acesso lida!');
    } catch {
      addToast('error', 'Falha ao ler QR Code.');
    }
  }, [addToast]);

  // ── OCR processing ──────────────────────────────────────────────

  const startOcr = useCallback(async () => {
    if (pages.length === 0) {
      addToast('error', 'Capture ao menos uma página antes.');
      return;
    }

    setPhase('ocr');
    setOcrProgress({ status: 'Iniciando OCR...', progress: 0 });

    try {
      const result = await ocrPages(pages, templateId, (p) => setOcrProgress(p));
      setOcrResult(result);

      // Populate review fields
      setReviewSupplier(result.parsed.supplier?.name || '');
      setReviewCNPJ(result.parsed.supplier?.cnpj || '');
      setReviewDocNumber(result.parsed.documentNumber || '');
      setReviewTotal(result.parsed.total ? String(result.parsed.total) : '');
      setReviewItems(
        result.parsed.items.length > 0
          ? result.parsed.items
          : [{ productName: '', quantity: 1, unitPrice: 0 }],
      );

      // Try to read QR from captured images
      if (!accessKey && pages.length > 0) {
        const key = await detectQrAccessKey(pages[0]);
        if (key) setAccessKey(key);
      }

      setPhase('review');
      addToast('success', `OCR concluído! Confiança: ${result.confidence}%`);
    } catch (err: any) {
      console.error('[OCR] Error:', err);
      addToast('error', `Falha no OCR: ${err?.message || 'erro desconhecido'}`);
      setPhase('camera');
    }
  }, [pages, templateId, accessKey, addToast]);

  // ── Review item management ──────────────────────────────────────

  const addReviewItem = useCallback(() => {
    setReviewItems((prev) => [...prev, { productName: '', quantity: 1, unitPrice: 0 }]);
  }, []);

  const removeReviewItem = useCallback((idx: number) => {
    setReviewItems((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const updateReviewItem = useCallback(
    (idx: number, field: keyof NFRecordItem, value: string | number) => {
      setReviewItems((prev) => {
        const next = [...prev];
        const item = { ...next[idx] };
        if (field === 'productName') item.productName = value as string;
        else if (field === 'quantity') item.quantity = Number(value) || 0;
        else if (field === 'unitPrice') item.unitPrice = Number(value) || 0;
        if (field === 'quantity' || field === 'unitPrice') {
          item.subtotal = item.quantity * item.unitPrice;
        }
        next[idx] = item;
        return next;
      });
    },
    [],
  );

  const reviewTotalCalc = reviewItems.reduce((s, i) => s + (i.quantity || 0) * (i.unitPrice || 0), 0);

  // ── Conclude ────────────────────────────────────────────────────

  const handleConclude = useCallback(() => {
    const finalOcrResult: OcrResult | undefined = ocrResult
      ? {
          ...ocrResult,
          parsed: {
            ...ocrResult.parsed,
            supplier: {
              ...ocrResult.parsed.supplier,
              name: reviewSupplier,
              cnpj: reviewCNPJ,
            },
            documentNumber: reviewDocNumber,
            total: parseFloat(reviewTotal) || reviewTotalCalc,
            items: reviewItems.filter((i) => i.productName.trim()),
          },
        }
      : undefined;

    onCaptured(pages, templateId, accessKey ?? undefined, finalOcrResult);
    setPages([]);
    setOcrResult(null);
    setPhase('camera');
    onClose();
  }, [
    pages, templateId, accessKey, ocrResult, onCaptured, onClose,
    reviewSupplier, reviewCNPJ, reviewDocNumber, reviewTotal,
    reviewItems, reviewTotalCalc,
  ]);

  const handleCancel = useCallback(() => {
    setPages([]);
    setOcrResult(null);
    setPhase('camera');
    onClose();
  }, [onClose]);

  const handleBackToCamera = useCallback(() => {
    setPhase('camera');
    setOcrResult(null);
    stabilityRef.current = 0;
    setStabilityCount(0);
  }, []);

  // ── Render: Camera Phase ────────────────────────────────────────

  const renderCamera = () => (
    <>
      {/* Fullscreen camera */}
      <div className="fixed inset-0 z-[10001] bg-black flex flex-col">
        {/* Hidden canvas for capture + detection */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Video — fullscreen */}
        <div className="flex-1 relative overflow-hidden">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />

          {/* A4 Overlay guide */}
          <div className="absolute inset-0 pointer-events-none">
            {/* Darkened edges */}
            <div className="absolute inset-0 bg-black/40" />

            {/* Clear A4 window (proportional to A4: 1:1.414) */}
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{
                width: '75vw',
                maxWidth: '380px',
                aspectRatio: '1 / 1.414',
                maxHeight: '78vh',
              }}
            >
              {/* Clear area (punches through the dark overlay) */}
              <div className="absolute inset-0 bg-transparent" />

              {/* Corner markers */}
              {/* Top-left */}
              <div className="absolute -top-1 -left-1 w-8 h-8 border-t-[3px] border-l-[3px] border-white rounded-tl-lg" />
              {/* Top-right */}
              <div className="absolute -top-1 -right-1 w-8 h-8 border-t-[3px] border-r-[3px] border-white rounded-tr-lg" />
              {/* Bottom-left */}
              <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-[3px] border-l-[3px] border-white rounded-bl-lg" />
              {/* Bottom-right */}
              <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-[3px] border-r-[3px] border-white rounded-br-lg" />

              {/* Dashed border */}
              <div className="absolute inset-0 border-2 border-dashed border-white/50 rounded-lg" />

              {/* Detection indicator */}
              {detectedDoc && (
                <div className="absolute inset-0 border-2 border-emerald-400 rounded-lg animate-pulse" />
              )}
            </div>
          </div>

          {/* Status text */}
          <div className="absolute bottom-24 left-0 right-0 text-center z-10">
            <div className="inline-block bg-black/70 text-white text-sm font-semibold px-4 py-2 rounded-full">
              {cameraError
                ? cameraError
                : !stream
                  ? isStarting ? 'Iniciando câmera...' : 'Câmera parada'
                  : detectedDoc
                    ? stabilityCount > 30
                      ? 'Documento detectado! Capturando...'
                      : 'Mantenha imóvel...'
                    : 'Enquadre o documento A4 na moldura'}
            </div>
          </div>

          {/* Stability progress bar */}
          {detectedDoc && stabilityCount > 0 && (
            <div className="absolute bottom-20 left-8 right-8 z-10">
              <div className="h-1 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-400 transition-all duration-100 rounded-full"
                  style={{ width: `${Math.min((stabilityCount / 45) * 100, 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 pt-3 pb-2 bg-gradient-to-b from-black/60 to-transparent">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-white/10 rounded-xl">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                Scanner de Documento
              </h3>
              <p className="text-[10px] text-white/60">
                {pages.length > 0 ? `${pages.length} página(s) capturada(s)` : 'Escaneie o documento A4'}
              </p>
            </div>
          </div>
          <button onClick={handleCancel} className="p-2 bg-white/10 rounded-full text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Template selector (floating) */}
        <div className="absolute top-14 left-4 z-20">
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="px-3 py-1.5 bg-black/60 border border-white/20 rounded-xl text-white text-xs font-semibold backdrop-blur-sm"
          >
            {NF_TEMPLATE_OPTIONS.map((t) => (
              <option key={t.id} value={t.id} className="bg-black text-white">
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {/* Auto-capture toggle (floating) */}
        <div className="absolute top-14 right-4 z-20">
          <button
            onClick={() => setAutoCaptureEnabled((prev) => !prev)}
            className={`p-2 rounded-xl backdrop-blur-sm border transition-colors ${
              autoCaptureEnabled
                ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
                : 'bg-white/10 border-white/20 text-white/60'
            }`}
            title={autoCaptureEnabled ? 'Auto-capture ligado' : 'Auto-capture desligado'}
          >
            <Zap className="w-4 h-4" />
          </button>
        </div>

        {/* Bottom controls */}
        <div className="absolute bottom-0 left-0 right-0 z-20 pb-6 pt-3 px-4 bg-gradient-to-t from-black/60 to-transparent">
          {/* Page thumbnails */}
          {pages.length > 0 && (
            <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
              {pages.map((p, i) => (
                <div key={i} className="relative flex-shrink-0 w-12 h-16 rounded-lg overflow-hidden border-2 border-white/30">
                  <img src={p} alt={`P${i + 1}`} className="w-full h-full object-cover" />
                  <span className="absolute top-0.5 left-0.5 bg-black/70 text-white text-[8px] font-bold px-1 rounded">
                    {i + 1}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); removePage(i); }}
                    className="absolute top-0.5 right-0.5 p-0.5 bg-black/70 text-white rounded hover:bg-rose-600"
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Buttons */}
          <div className="flex items-center gap-3">
            {/* QR scan */}
            <button
              onClick={scanQr}
              className="p-3 bg-white/10 rounded-full text-white border border-white/20"
              title="Ler QR Code"
            >
              <ScanLine className="w-5 h-5" />
            </button>

            {/* Main capture button */}
            <button
              onClick={handleManualCapture}
              disabled={!stream}
              className="flex-1 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors"
            >
              <Camera className="w-5 h-5" />
              {autoCaptureEnabled ? 'Capturar Manualmente' : 'Capturar'}
            </button>

            {/* Conclude + OCR */}
            <button
              onClick={startOcr}
              disabled={pages.length === 0}
              className="py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors"
              title="Processar OCR e revisar"
            >
              <Check className="w-5 h-5" />
              <span className="hidden sm:inline">OCR</span>
              {pages.length > 0 && (
                <span className="bg-white/20 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {pages.length}
                </span>
              )}
            </button>
          </div>

          {/* Access key indicator */}
          {accessKey && (
            <div className="mt-2 px-3 py-1.5 bg-emerald-500/20 border border-emerald-400/30 rounded-xl flex items-center gap-1.5 text-[10px] text-emerald-300 font-bold">
              <KeyRound className="w-3 h-3" />
              Chave: {accessKey.slice(0, 10)}...{accessKey.slice(-4)}
            </div>
          )}
        </div>
      </div>
    </>
  );

  // ── Render: OCR Processing Phase ────────────────────────────────

  const renderOcr = () => (
    <div className="fixed inset-0 z-[10001] bg-[#09090b] flex flex-col items-center justify-center p-6">
      <div className="bg-white dark:bg-[#18181b] rounded-2xl shadow-2xl w-full max-w-md p-8 text-center">
        <div className="mb-6">
          <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mx-auto" />
        </div>
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
          Processando OCR...
        </h3>
        <p className="text-sm text-slate-500 mb-4">
          {ocrProgress.status || 'Inicializando Tesseract.js...'}
        </p>
        <div className="h-2 bg-slate-200 dark:bg-[#27272a] rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 rounded-full transition-all duration-300"
            style={{ width: `${ocrProgress.progress}%` }}
          />
        </div>
        <p className="text-xs text-slate-400 mt-2">{ocrProgress.progress}%</p>

        {ocrResult && (
          <div className="mt-4 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl text-xs text-emerald-700 dark:text-emerald-300">
            OCR concluído! Confiança: {ocrResult.confidence}%
          </div>
        )}
      </div>
    </div>
  );

  // ── Render: Review Phase ────────────────────────────────────────

  const renderReview = () => (
    <div className="fixed inset-0 z-[10001] bg-white dark:bg-[#09090b] flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-[#27272a] flex items-center justify-between bg-slate-50 dark:bg-[#09090b]/50 flex-shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={handleBackToCamera}
            className="p-2 bg-slate-100 dark:bg-[#27272a] rounded-xl text-slate-600 dark:text-slate-300"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Revisar Dados Extraídos
            </h3>
            <p className="text-[10px] text-slate-500">
              OCR: {ocrResult?.confidence ?? 0}% de confiança — ajuste se necessário
            </p>
          </div>
        </div>
        <button onClick={handleCancel} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Warnings */}
        {ocrResult?.parsed.warnings.map((w, i) => (
          <div key={i} className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{w}</span>
          </div>
        ))}

        {/* Supplier info */}
        <div className="bg-slate-50 dark:bg-[#18181b] rounded-xl p-4 border border-slate-200 dark:border-[#27272a]">
          <h4 className="text-xs font-bold text-slate-700 dark:text-[#a1a1aa] mb-3">
            <FileText className="w-3.5 h-3.5 inline mr-1" /> Fornecedor
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-slate-500 font-semibold">Nome</label>
              <input
                type="text"
                value={reviewSupplier}
                onChange={(e) => setReviewSupplier(e.target.value)}
                className="w-full mt-0.5 px-2.5 py-1.5 bg-white dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] rounded-lg text-xs font-semibold text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 font-semibold">CNPJ</label>
              <input
                type="text"
                value={reviewCNPJ}
                onChange={(e) => setReviewCNPJ(e.target.value)}
                className="w-full mt-0.5 px-2.5 py-1.5 bg-white dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] rounded-lg text-xs font-mono text-slate-900 dark:text-white"
              />
            </div>
          </div>
        </div>

        {/* Document number + Total */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-50 dark:bg-[#18181b] rounded-xl p-3 border border-slate-200 dark:border-[#27272a]">
            <label className="text-[10px] text-slate-500 font-semibold">Nº Documento</label>
            <input
              type="text"
              value={reviewDocNumber}
              onChange={(e) => setReviewDocNumber(e.target.value)}
              className="w-full mt-0.5 px-2.5 py-1.5 bg-white dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] rounded-lg text-xs font-semibold text-slate-900 dark:text-white"
            />
          </div>
          <div className="bg-slate-50 dark:bg-[#18181b] rounded-xl p-3 border border-slate-200 dark:border-[#27272a]">
            <label className="text-[10px] text-slate-500 font-semibold">Total (R$)</label>
            <input
              type="number"
              step="0.01"
              value={reviewTotal}
              onChange={(e) => setReviewTotal(e.target.value)}
              className="w-full mt-0.5 px-2.5 py-1.5 bg-white dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] rounded-lg text-xs font-semibold text-slate-900 dark:text-white"
            />
          </div>
        </div>

        {/* Items */}
        <div className="bg-slate-50 dark:bg-[#18181b] rounded-xl p-4 border border-slate-200 dark:border-[#27272a]">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold text-slate-700 dark:text-[#a1a1aa]">
              Itens ({reviewItems.length})
            </h4>
            <button
              onClick={addReviewItem}
              className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
            >
              + Adicionar
            </button>
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {reviewItems.map((item, i) => (
              <div key={i} className="flex items-center gap-2 p-2 bg-white dark:bg-[#09090b] rounded-lg border border-slate-100 dark:border-[#27272a]">
                <input
                  type="text"
                  value={item.productName}
                  onChange={(e) => updateReviewItem(i, 'productName', e.target.value)}
                  placeholder="Produto"
                  className="flex-1 px-2 py-1 bg-transparent border-0 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
                />
                <input
                  type="number"
                  value={item.quantity || ''}
                  onChange={(e) => updateReviewItem(i, 'quantity', e.target.value)}
                  placeholder="Qtd"
                  className="w-14 px-2 py-1 bg-transparent border border-slate-200 dark:border-[#27272a] rounded text-xs text-center text-slate-900 dark:text-white"
                />
                <input
                  type="number"
                  step="0.01"
                  value={item.unitPrice || ''}
                  onChange={(e) => updateReviewItem(i, 'unitPrice', e.target.value)}
                  placeholder="Preço"
                  className="w-20 px-2 py-1 bg-transparent border border-slate-200 dark:border-[#27272a] rounded text-xs text-right text-slate-900 dark:text-white"
                />
                <button
                  onClick={() => removeReviewItem(i)}
                  className="p-1 text-slate-400 hover:text-rose-500"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-2 pt-2 border-t border-slate-200 dark:border-[#27272a] flex justify-between text-xs font-bold text-slate-700 dark:text-white">
            <span>Total calculado:</span>
            <span>R$ {reviewTotalCalc.toFixed(2)}</span>
          </div>
        </div>

        {/* Captured pages thumbnails */}
        {pages.length > 0 && (
          <div>
            <h4 className="text-xs font-bold text-slate-700 dark:text-[#a1a1aa] mb-2">
              Páginas capturadas ({pages.length})
            </h4>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {pages.map((p, i) => (
                <div key={i} className="relative flex-shrink-0 w-20 h-28 rounded-lg overflow-hidden border border-slate-200 dark:border-[#27272a]">
                  <img src={p} alt={`P${i + 1}`} className="w-full h-full object-cover" />
                  <span className="absolute top-0.5 left-0.5 bg-black/70 text-white text-[8px] font-bold px-1 rounded">
                    {i + 1}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Raw OCR text (collapsible) */}
        {ocrResult?.rawText && (
          <details className="bg-slate-50 dark:bg-[#18181b] rounded-xl border border-slate-200 dark:border-[#27272a]">
            <summary className="px-4 py-2 text-xs font-bold text-slate-500 cursor-pointer">
              Texto bruto do OCR
            </summary>
            <pre className="px-4 pb-3 text-[10px] text-slate-600 dark:text-slate-400 whitespace-pre-wrap max-h-40 overflow-y-auto font-mono">
              {ocrResult.rawText}
            </pre>
          </details>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-200 dark:border-[#27272a] bg-slate-50 dark:bg-[#09090b]/50 flex-shrink-0">
        <div className="flex gap-2">
          <button
            onClick={handleBackToCamera}
            className="py-3 px-4 rounded-xl bg-slate-200 dark:bg-[#27272a] hover:bg-slate-300 dark:hover:bg-[#3f3f46] text-slate-700 dark:text-slate-300 font-bold text-xs transition-colors"
          >
            <RotateCcw className="w-4 h-4 inline mr-1" />
            Voltar
          </button>
          <button
            onClick={handleConclude}
            className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors"
          >
            <Check className="w-4 h-4" />
            Confirmar e Salvar
          </button>
        </div>
      </div>
    </div>
  );

  // ── Main render ─────────────────────────────────────────────────

  if (!isOpen) return null;

  return (
    <>
      {phase === 'camera' && renderCamera()}
      {phase === 'ocr' && renderOcr()}
      {phase === 'review' && renderReview()}
    </>
  );
};

export default NFMultiCaptureModal;
