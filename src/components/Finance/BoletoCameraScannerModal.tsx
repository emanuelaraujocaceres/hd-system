import React, { useState, useRef } from 'react';
import {
  X,
  Camera,
  FileCheck,
  Barcode,
  Calendar,
  DollarSign,
  Sparkles,
  Check,
  RefreshCw,
  Upload,
  Building2,
} from 'lucide-react';
import { FinancialAccount, StoreBranch } from '../../types';
import { storageService } from '../../services/storageService';
import { posAudio } from '../../services/audioService';

interface BoletoCameraScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBranch?: StoreBranch;
  onAccountAdded?: () => void;
}

export const BoletoCameraScannerModal: React.FC<BoletoCameraScannerModalProps> = ({
  isOpen,
  onClose,
  currentBranch,
  onAccountAdded,
}) => {
  if (!isOpen) return null;

  const [isScanning, setIsScanning] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [scannedBoleto, setScannedBoleto] = useState<any | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleStartCamera = async () => {
    try {
      setCapturedImage(null);
      setScannedBoleto(null);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      setCameraStream(stream);

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 200);
    } catch (err) {
      console.warn('Câmera indisponível ou negada:', err);
      if (fileInputRef.current) {
        fileInputRef.current.click();
      }
    }
  };

  const handleStopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
  };

  const handleCapturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setCapturedImage(dataUrl);
        handleStopCamera();
        processBoletoAI(dataUrl);
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        if (evt.target?.result) {
          const dataUrl = evt.target.result as string;
          setCapturedImage(dataUrl);
          handleStopCamera();
          processBoletoAI(dataUrl);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const processBoletoAI = async (dataUrl: string) => {
    setIsScanning(true);
    posAudio.chime();

    try {
      const res = await fetch('/api/ai/scan-boleto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: dataUrl }),
      });

      const data = await res.json();
      if (data.result) {
        setScannedBoleto(data.result);
        posAudio.chime();
      }
    } catch (err) {
      console.error('Erro na leitura do boleto:', err);
    } finally {
      setIsScanning(false);
    }
  };

  const handleConfirmSavePayable = () => {
    if (!scannedBoleto) return;

    const newPayable: FinancialAccount = {
      id: `fin-bol-${Date.now()}`,
      title: `Boleto: ${scannedBoleto.supplierName || 'Fornecedor'}`,
      type: 'payable',
      category: scannedBoleto.category || 'Fornecedores',
      amount: scannedBoleto.amount || 100.0,
      dueDate: scannedBoleto.dueDate || new Date().toISOString().slice(0, 10),
      status: 'pending',
      recipientOrPayer: scannedBoleto.supplierName || 'Fornecedor Lido via Câmera',
    };

    storageService.saveFinancialAccount(newPayable);
    posAudio.chime();
    if (onAccountAdded) onAccountAdded();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-[#27272a] flex items-center justify-between bg-slate-50 dark:bg-[#09090b]/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl">
              <FileCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Leitor de Boletos via Câmera</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-extrabold uppercase">
                  Contas a Pagar
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Escaneie o boleto bancário para registrar a conta a pagar automaticamente com valor e vencimento
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              handleStopCamera();
              onClose();
            }}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">
          {/* Active Branch */}
          {currentBranch && (
            <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-bold">
                <Building2 className="w-4 h-4 text-emerald-500" />
                <span>Filial Responsável: {currentBranch.name}</span>
              </div>
            </div>
          )}

          {/* Camera Viewfinder & Photo Capture */}
          {!cameraStream && !capturedImage && (
            <div className="p-8 rounded-2xl border-2 border-dashed border-slate-300 dark:border-[#27272a] bg-slate-50 dark:bg-[#09090b] flex flex-col items-center justify-center text-center space-y-4">
              <div className="p-4 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Camera className="w-8 h-8" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Aponta a câmera para o Boleto Bancário ou Código de Barras
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs">
                  O sistema extrai a linha digitável, fornecedor, data de vencimento e valor total da conta.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-xs">
                <button
                  onClick={handleStartCamera}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-colors flex items-center justify-center gap-2"
                >
                  <Camera className="w-4 h-4" />
                  <span>Ligar Câmera</span>
                </button>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-2.5 rounded-xl bg-slate-200 dark:bg-[#18181b] border border-slate-300 dark:border-[#27272a] text-slate-800 dark:text-slate-200 font-bold text-xs hover:bg-slate-300 dark:hover:bg-[#27272a] transition-colors flex items-center justify-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  <span>Escolher Foto</span>
                </button>
              </div>

              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                capture="environment"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          )}

          {/* Live Stream */}
          {cameraStream && !capturedImage && (
            <div className="space-y-3">
              <div className="w-full aspect-video bg-black rounded-2xl overflow-hidden border border-slate-800 relative flex items-center justify-center">
                <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
                <canvas ref={canvasRef} className="hidden" />
                <div className="absolute inset-6 border-2 border-dashed border-white/50 rounded-2xl pointer-events-none flex items-center justify-center">
                  <span className="text-[10px] text-white/90 bg-black/60 px-3 py-1 rounded-full font-mono font-bold">
                    Enquadre o Boleto ou Linha Digitável
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={handleStopCamera}
                  className="px-4 py-2 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCapturePhoto}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-lg flex items-center justify-center gap-2"
                >
                  <Camera className="w-4 h-4" />
                  <span>CAPTURAR E LER BOLETO</span>
                </button>
              </div>
            </div>
          )}

          {/* Captured Preview & Loading */}
          {capturedImage && (
            <div className="space-y-4">
              <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-[#27272a] max-h-48 bg-slate-900 flex items-center justify-center">
                <img src={capturedImage} alt="Boleto Capturado" className="w-full h-48 object-cover opacity-80" />
                {isScanning && (
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center text-white space-y-2">
                    <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      Lendo código de barras e dados do boleto...
                    </span>
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => {
                    setCapturedImage(null);
                    setScannedBoleto(null);
                    handleStartCamera();
                  }}
                  className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Tirar outra foto
                </button>
              </div>
            </div>
          )}

          {/* SCANNED BOLETO RESULT */}
          {scannedBoleto && (
            <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 space-y-3 animate-fadeIn">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                  <Check className="w-4 h-4" /> Boleto Reconhecido com Sucesso!
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-extrabold">
                  PENDENTE DE PAGAMENTO
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px] font-bold">BENEFICIÁRIO / FORNECEDOR</span>
                  <span className="font-bold text-slate-900 dark:text-white text-sm">{scannedBoleto.supplierName}</span>
                </div>

                <div>
                  <span className="text-slate-400 block text-[10px] font-bold">LINHA DIGITÁVEL / CÓDIGO</span>
                  <span className="font-mono text-[11px] font-bold text-slate-800 dark:text-sky-300 break-all select-all block bg-slate-100 dark:bg-slate-900 p-1.5 rounded-lg border border-slate-200 dark:border-slate-800">
                    {scannedBoleto.barcode}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <span className="text-slate-400 block text-[10px] font-bold">DATA DE VENCIMENTO</span>
                    <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                      {scannedBoleto.dueDate}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[10px] font-bold">VALOR DO BOLETO</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                      R$ {scannedBoleto.amount.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={handleConfirmSavePayable}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-lg transition-colors flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                <span>LANÇAR EM CONTAS A PAGAR</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-[#09090b]/80 border-t border-slate-200 dark:border-[#27272a] flex justify-end">
          <button
            onClick={() => {
              handleStopCamera();
              onClose();
            }}
            className="px-5 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-black font-bold text-xs"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
