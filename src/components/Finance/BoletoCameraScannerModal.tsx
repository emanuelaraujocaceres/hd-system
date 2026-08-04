import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Camera,
  FileCheck,
  Barcode,
  Sparkles,
  Check,
  RefreshCw,
  Upload,
  Building2,
  Clock,
  Trash2,
  ChevronDown,
  ChevronUp,
  Zap,
  ZapOff,
} from 'lucide-react';
import { FinancialAccount, StoreBranch, ScannedBoleto } from '../../types';
import { storageService } from '../../services/storageService';
import { posAudio } from '../../services/audioService';
import { decodeBoleto } from '../../../functions/api/ai/boletoLib';

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
  const [isScanning, setIsScanning] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [scannedBoleto, setScannedBoleto] = useState<any | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  // Campos editáveis antes de lançar em contas a pagar (o usuário confirma os dados)
  const [editSupplier, setEditSupplier] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editAmount, setEditAmount] = useState(0);

  // Flash toggle
  const [flashOn, setFlashOn] = useState(false);

  // Scanned boletos history
  const [scannedBoletos, setScannedBoletos] = useState<ScannedBoleto[]>([]);
  const [showBoletosHistory, setShowBoletosHistory] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Keep streamRef in sync
  useEffect(() => {
    streamRef.current = cameraStream;
  }, [cameraStream]);

  // Load scanned boletos (localStorage + banco via storageService)
  useEffect(() => {
    setScannedBoletos(storageService.getScannedBoletos());
  }, []);

  if (!isOpen) return null;

  const toggleFlash = async () => {
    const stream = streamRef.current;
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    const capabilities = track.getCapabilities() as any;
    if (capabilities.torch) {
      const next = !flashOn;
      await track.applyConstraints({ advanced: [{ torch: next }] as any });
      setFlashOn(next);
    }
  };

  const handleStartCamera = async () => {
    try {
      setCapturedImage(null);
      setScannedBoleto(null);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      setCameraStream(stream);
      streamRef.current = stream;

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
      streamRef.current = null;
    }
    setFlashOn(false);
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
        processCapturedBoleto(dataUrl);
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
          processCapturedBoleto(dataUrl);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Lê o código de barras diretamente da foto no dispositivo (exato, sem IA).
  // Usa o mesmo BarcodeDetector já usado no PDV (polyfill carregado no main.tsx).
  const readBarcodeFromImage = async (dataUrl: string): Promise<string | null> => {
    const BCD = (window as any).BarcodeDetector;
    if (!BCD) return null;
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const bitmap = await createImageBitmap(blob);
      const detector = new BCD({
        formats: ['code_128', 'code_39', 'codabar', 'itf', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'qr_code'],
      });
      const codes = await detector.detect(bitmap);
      if (bitmap && typeof (bitmap as any).close === 'function') (bitmap as any).close();
      const raw = codes?.[0]?.rawValue?.trim() || '';
      const digits = raw.replace(/\D/g, '');
      return digits.length >= 10 ? digits : null;
    } catch {
      return null;
    }
  };

  const processCapturedBoleto = async (dataUrl: string) => {
    setIsScanning(true);
    setScanError(null);
    posAudio.chime();

    try {
      // Sem IA: leitura 100% local e determinística do código de barras
      const digits = await readBarcodeFromImage(dataUrl);

      if (!digits) {
        setScanError('Nenhum código de barras detectado na imagem. Aproxime a câmera, evite reflexos e capture novamente. Sem IA, o valor é lido diretamente do código de barras.');
        return;
      }

      const decoded = decodeBoleto(digits);
      if (!decoded.type || !decoded.barcode) {
        setScanError('O código de barras lido não é de boleto bancário nem de conta de arrecadação (44, 47 ou 48 dígitos).');
        return;
      }

      const result = {
        supplierName: decoded.supplierName || '',
        barcode: decoded.barcode,
        dueDate: decoded.dueDate || '',
        amount: decoded.amount,
        category: decoded.category || 'Fornecedores',
        documentNumber: '',
        source: decoded.type,
        barcodeValid: decoded.barcodeValid,
      };

      setScannedBoleto(result);
      setEditSupplier(result.supplierName);
      setEditDueDate(result.dueDate);
      setEditAmount(result.amount ?? 0);
      posAudio.chime();
    } catch (err) {
      console.error('Erro na leitura do boleto:', err);
      setScanError('Falha ao processar a imagem. Tente novamente.');
    } finally {
      setIsScanning(false);
    }
  };

  const saveBoletoRecord = (linhaDigitavel: string, amount: number, dueDate: string, payer: string, financialAccountId: string) => {
    const record: ScannedBoleto = {
      id: `bol-${Date.now()}`,
      linhaDigitavel,
      amount,
      dueDate,
      payer,
      scanDate: new Date().toISOString(),
      financialAccountId,
    };

    // Grava no localStorage + envia ao Supabase (aparece em todos os dispositivos)
    storageService.saveScannedBoleto(record);
    setScannedBoletos(storageService.getScannedBoletos().slice(0, 50)); // Keep last 50 na tela
  };

  const handleConfirmSavePayable = () => {
    if (!scannedBoleto) return;

    const amount = Number(editAmount);
    if (!(amount > 0)) return;

    const financialAccountId = `fin-bol-${Date.now()}`;
    const supplier = editSupplier.trim() || 'Fornecedor';

    const newPayable: FinancialAccount = {
      id: financialAccountId,
      title: `Boleto: ${supplier}`,
      type: 'payable',
      category: scannedBoleto.category || 'Fornecedores',
      amount,
      dueDate: editDueDate || new Date().toISOString().slice(0, 10),
      status: 'pending',
      recipientOrPayer: supplier,
    };

    storageService.saveFinancialAccount(newPayable);

    // Store boleto record in localStorage
    saveBoletoRecord(
      scannedBoleto.barcode || '',
      amount,
      editDueDate || '',
      supplier,
      financialAccountId
    );

    posAudio.chime();
    if (onAccountAdded) onAccountAdded();
    onClose();
  };

  const handleDeleteBoletoRecord = (id: string) => {
    storageService.deleteScannedBoleto(id);
    setScannedBoletos(storageService.getScannedBoletos());
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center sm:p-4 bg-slate-900/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] sm:max-h-[90vh] h-full sm:h-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-[#27272a] flex items-center justify-between bg-slate-50 dark:bg-[#09090b]/60 shrink-0">
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
                Escaneie o boleto bancário ou a conta (luz, água, gás) — o valor é lido do código de barras e você confirma o emissor e o vencimento
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
                  Aponta a câmera para o Código de Barras (boleto ou conta)
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs">
                  Sem IA: o valor é lido exatamente do código de barras. Nome do emissor e vencimento você confirma na tela seguinte.
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

          {/* Live Stream — FULLSCREEN on mobile */}
          {cameraStream && !capturedImage && (
            <div className="fixed inset-0 sm:relative sm:inset-auto z-50 sm:z-auto bg-black flex flex-col">
              <div className="relative flex-1 sm:w-full sm:aspect-video sm:rounded-2xl overflow-hidden sm:border sm:border-slate-800 flex items-center justify-center">
                <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
                <canvas ref={canvasRef} className="hidden" />

                {/* Flash toggle */}
                <button
                  onClick={toggleFlash}
                  className="absolute left-4 z-50 p-2 rounded-full backdrop-blur-sm transition-colors"
                  style={{
                    top: 'max(1rem, env(safe-area-inset-top))',
                    background: flashOn ? 'rgba(250, 204, 21, 0.9)' : 'rgba(0, 0, 0, 0.5)',
                  }}
                  title={flashOn ? 'Desligar Flash' : 'Ligar Flash'}
                >
                  {flashOn ? (
                    <Zap className="w-5 h-5 text-black" fill="currentColor" />
                  ) : (
                    <ZapOff className="w-5 h-5 text-white/70" />
                  )}
                </button>

                <div className="absolute inset-6 sm:inset-6 border-2 border-dashed border-white/50 rounded-2xl pointer-events-none flex items-center justify-center">
                  <span className="text-[10px] text-white/90 bg-black/60 px-3 py-1 rounded-full font-mono font-bold">
                    Enquadre o Boleto ou Linha Digitável
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 p-4 bg-slate-900 shrink-0 sm:bg-transparent" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
                <button
                  onClick={handleStopCamera}
                  className="px-4 py-2.5 bg-slate-700 text-slate-200 font-bold text-xs rounded-xl sm:bg-slate-200 sm:dark:bg-slate-800 sm:text-slate-700 sm:dark:text-slate-300"
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
                      Lendo o código de barras...
                    </span>
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => {
                    setCapturedImage(null);
                    setScannedBoleto(null);
                    setScanError(null);
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

          {/* Scan error — honest feedback, no invented data */}
          {scanError && !scannedBoleto && (
            <div className="p-4 rounded-2xl bg-red-500/5 border border-red-500/20 space-y-3 animate-fadeIn">
              <p className="text-xs font-bold text-red-600 dark:text-red-400 flex items-start gap-1.5">
                <X className="w-4 h-4 mt-0.5 shrink-0" /> {scanError}
              </p>
              <button
                onClick={() => {
                  setCapturedImage(null);
                  setScanError(null);
                  handleStartCamera();
                }}
                className="w-full py-2.5 rounded-xl bg-slate-200 dark:bg-[#18181b] border border-slate-300 dark:border-[#27272a] text-slate-800 dark:text-slate-200 font-bold text-xs flex items-center justify-center gap-2"
              >
                <Camera className="w-4 h-4" />
                Tentar novamente
              </button>
            </div>
          )}

          {/* SCANNED BOLETO RESULT — confirm & edit before saving */}
          {scannedBoleto && (
            <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 space-y-3 animate-fadeIn">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                  <Check className="w-4 h-4" /> Código de Barras Lido — Confirme os Dados
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-extrabold">
                  PENDENTE DE PAGAMENTO
                </span>
              </div>

              {scannedBoleto.source === 'arrecadacao' && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                  Conta de arrecadação (luz/água/gás): o vencimento não vem no código de barras — preencha a data que está na conta impressa.
                </p>
              )}
              {scannedBoleto.source === 'bancario' && !scannedBoleto.barcodeValid && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                  Atenção: o código não passou na validação dos dígitos verificadores. Revise o valor e o vencimento antes de salvar.
                </p>
              )}

              <div className="space-y-2 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px] font-bold">EMISSOR / FORNECEDOR *</span>
                  <input
                    value={editSupplier}
                    onChange={(e) => setEditSupplier(e.target.value)}
                    placeholder="Ex.: Neoenergia, CPFL, Sabesp, Itaú"
                    className="w-full mt-1 px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                </div>

                <div>
                  <span className="text-slate-400 block text-[10px] font-bold">CÓDIGO / LINHA DIGITÁVEL</span>
                  <span className="font-mono text-[11px] font-bold text-slate-800 dark:text-sky-300 break-all select-all block bg-slate-100 dark:bg-slate-900 p-1.5 rounded-lg border border-slate-200 dark:border-slate-800">
                    {scannedBoleto.barcode}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <span className="text-slate-400 block text-[10px] font-bold">DATA DE VENCIMENTO</span>
                    <input
                      type="date"
                      value={editDueDate}
                      onChange={(e) => setEditDueDate(e.target.value)}
                      className="w-full mt-1 px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    />
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[10px] font-bold">VALOR (R$) *</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={editAmount > 0 ? editAmount : ''}
                      onChange={(e) => setEditAmount(e.target.value === '' ? 0 : Number(e.target.value))}
                      placeholder="0,00"
                      className="w-full mt-1 px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm font-bold text-emerald-600 dark:text-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    />
                  </div>
                </div>
              </div>

              <button
                onClick={handleConfirmSavePayable}
                disabled={!(Number(editAmount) > 0)}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs shadow-lg transition-colors flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                <span>LANÇAR EM CONTAS A PAGAR</span>
              </button>
            </div>
          )}

          {/* ─── SCANNED BOLETOS HISTORY ──────────────────────────── */}
          {scannedBoletos.length > 0 && (
            <div className="rounded-2xl border border-slate-200 dark:border-[#27272a] overflow-hidden">
              <button
                onClick={() => setShowBoletosHistory(!showBoletosHistory)}
                className="w-full px-4 py-3 flex items-center justify-between bg-slate-50 dark:bg-[#09090b] hover:bg-slate-100 dark:hover:bg-[#18181b] transition-colors"
              >
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                  <Clock className="w-4 h-4 text-emerald-500" />
                  <span>Ver Boletos Escaneados</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-extrabold">
                    {scannedBoletos.length}
                  </span>
                </div>
                {showBoletosHistory ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </button>

              {showBoletosHistory && (
                <div className="p-3 space-y-2 max-h-64 overflow-y-auto bg-white dark:bg-[#18181b]">
                  {scannedBoletos.map((boleto) => (
                    <div
                      key={boleto.id}
                      className="p-3 rounded-xl bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] space-y-1.5 relative group"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {boleto.payer}
                          </p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400">
                            Escaneado: {formatDate(boleto.scanDate)}
                          </p>
                        </div>
                        <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400 ml-2 whitespace-nowrap">
                          R$ {boleto.amount.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-[10px] text-slate-400 space-y-0.5">
                          <p>Venc: {boleto.dueDate}</p>
                          <p className="font-mono break-all">{boleto.linhaDigitavel}</p>
                        </div>
                        <button
                          onClick={() => handleDeleteBoletoRecord(boleto.id)}
                          className="p-1 text-slate-300 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                          title="Remover"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-[#09090b]/80 border-t border-slate-200 dark:border-[#27272a] flex justify-end shrink-0">
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
