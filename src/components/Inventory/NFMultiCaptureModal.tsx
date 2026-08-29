/**
 * NFMultiCaptureModal - Captura multi-página de documentos do fornecedor (Fase 2).
 *
 * - Abre a câmera traseira e permite fotografar várias páginas do mesmo documento.
 * - Seleciona o modelo do documento (DANFE / Ambev / Coca / Lago Azul / Genérico)
 *   para ser usado pelo motor de OCR na Fase 3.
 * - Devolve as páginas (dataURLs) + templateId via onCaptured.
 * - NÃO faz OCR nem grava dados: apenas coleta as imagens (Fase 3 faz o parse).
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { X, Camera, Trash2, Check, Layers } from 'lucide-react';
import { useToast } from '../shared/Toast';

// Modelos alinhados com prototypes/ocr-bench/templates.json (Fase 3 reutiliza).
export const NF_TEMPLATE_OPTIONS = [
  { id: 'danfe', label: 'DANFE (NF-e)' },
  { id: 'ambev', label: 'Ambev' },
  { id: 'coca', label: 'Coca-Cola' },
  { id: 'lagoazul', label: 'Lago Azul' },
  { id: 'generic', label: 'Genérico / Outro' },
] as const;

export type NFTemplateId = (typeof NF_TEMPLATE_OPTIONS)[number]['id'];

interface NFMultiCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCaptured: (pages: string[], templateId: string) => void;
  initialTemplate?: string;
}

export const NFMultiCaptureModal: React.FC<NFMultiCaptureModalProps> = ({
  isOpen,
  onClose,
  onCaptured,
  initialTemplate = 'danfe',
}) => {
  const { addToast } = useToast();
  const [pages, setPages] = useState<string[]>([]);
  const [templateId, setTemplateId] = useState<string>(initialTemplate);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setStream(null);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    setIsStarting(true);
    try {
      const media = navigator.mediaDevices;
      if (!media || !media.getUserMedia) throw new Error('getUserMedia indisponível');
      const s = await media.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = s;
      setStream(s);
      if (videoRef.current) {
        try {
          videoRef.current.srcObject = s;
          await videoRef.current.play();
        } catch {
          /* autoplay pode falhar em alguns contextos; ignora */
        }
      }
    } catch (err: any) {
      let msg = 'Câmera indisponível.';
      const name = err?.name;
      if (name === 'NotAllowedError') msg = 'Permissão da câmera negada. Habilite o acesso no navegador.';
      else if (name === 'NotFoundError') msg = 'Nenhuma câmera encontrada no dispositivo.';
      else if (name === 'NotReadableError') msg = 'Câmera em uso por outro aplicativo.';
      setCameraError(msg);
      addToast('error', msg);
    } finally {
      setIsStarting(false);
    }
  }, [addToast]);

  // Liga a câmera ao abrir; limpa ao fechar/desmontar.
  useEffect(() => {
    if (isOpen) {
      setPages([]);
      setCameraError(null);
      startCamera();
    }
    return () => stopCamera();
  }, [isOpen, startCamera, stopCamera]);

  const capturePage = useCallback(() => {
    const video = videoRef.current;
    if (!video || !streamRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setPages((prev) => [...prev, dataUrl]);
  }, []);

  const removePage = useCallback((idx: number) => {
    setPages((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const clearPages = useCallback(() => setPages([]), []);

  const handleConclude = useCallback(() => {
    onCaptured(pages, templateId);
    setPages([]);
    onClose();
  }, [pages, templateId, onCaptured, onClose]);

  const handleCancel = useCallback(() => {
    setPages([]);
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-[#18181b] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-3 border-b border-slate-200 dark:border-[#27272a] flex items-center justify-between bg-slate-50 dark:bg-[#09090b]/50">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Capturar Documento (várias páginas)
              </h3>
              <p className="text-[11px] text-slate-500">
                Fotografe todas as páginas do documento do fornecedor
              </p>
            </div>
          </div>
          <button onClick={handleCancel} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Template selector */}
          <div>
            <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1 text-xs">
              <Layers className="w-3.5 h-3.5 inline mr-1" /> Modelo do documento
            </label>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
            >
              {NF_TEMPLATE_OPTIONS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Camera preview */}
          <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3] flex items-center justify-center">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            {!stream && !cameraError && (
              <div className="absolute inset-0 flex items-center justify-center text-white/70 text-xs">
                {isStarting ? 'Iniciando câmera...' : 'Câmera parada'}
              </div>
            )}
          </div>

          {cameraError && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-400 font-bold">
              {cameraError}
            </div>
          )}

          {/* Captured pages */}
          {pages.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Páginas capturadas: {pages.length}
                </span>
                <button
                  onClick={clearPages}
                  className="text-[11px] text-rose-500 font-bold hover:underline"
                >
                  Limpar tudo
                </button>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {pages.map((p, i) => (
                  <div
                    key={i}
                    className="relative rounded-lg overflow-hidden border border-slate-200 dark:border-[#27272a]"
                  >
                    <img src={p} alt={`Página ${i + 1}`} className="w-full h-24 object-cover" />
                    <span className="absolute top-1 left-1 bg-black/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                      {i + 1}
                    </span>
                    <button
                      onClick={() => removePage(i)}
                      title="Remover página"
                      className="absolute top-1 right-1 p-1 bg-black/70 text-white rounded hover:bg-rose-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-[#27272a] bg-slate-50 dark:bg-[#09090b]/50 flex flex-col gap-2">
          <div className="flex gap-2">
            <button
              onClick={capturePage}
              disabled={!stream}
              className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors"
            >
              <Camera className="w-4 h-4" /> Capturar página
            </button>
            <button
              onClick={handleConclude}
              className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors"
            >
              <Check className="w-4 h-4" /> Concluir ({pages.length})
            </button>
          </div>
          <button
            onClick={handleCancel}
            className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-[#27272a] hover:bg-slate-200 dark:hover:bg-[#3f3f46] text-slate-700 dark:text-slate-300 font-bold text-xs transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};

export default NFMultiCaptureModal;
