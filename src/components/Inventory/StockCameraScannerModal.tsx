import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  X,
  Camera,
  Package,
  Check,
  Plus,
  CheckCircle2,
  Building2,
  Zap,
  ZapOff,
  ScanLine,
  FileText,
} from 'lucide-react';
import { Product, StoreBranch } from '../../types';
import { storageService } from '../../services/storageService';
import { posAudio } from '../../services/audioService';
import { StockDocScannerModal } from './StockDocScannerModal';

interface StockCameraScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBranch?: StoreBranch;
  onProductsImported?: () => void;
  onNavigateToNewProduct?: (barcode: string) => void;
  // Novo: product ID whose barcode should be updated (overrides auto-match)
  targetProductId?: string;
}

export const StockCameraScannerModal: React.FC<StockCameraScannerModalProps> = ({
  isOpen,
  onClose,
  currentBranch,
  onProductsImported,
  onNavigateToNewProduct,
  targetProductId, // Novo: product ID whose barcode should be updated (overrides auto-match)
}) => {
  // Choice menu: 'menu' (choose method) | 'barcode' | 'doc'
  const [mode, setMode] = useState<'menu' | 'barcode' | 'doc'>('menu');
  const [isDocScannerOpen, setIsDocScannerOpen] = useState(false);
  const [scannerStatus, setScannerStatus] = useState<'idle' | 'scanning' | 'found'>('idle');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scanPaused, setScanPaused] = useState(false);
  const [scanFlash, setScanFlash] = useState(false);
  const [flashOn, setFlashOn] = useState(false);

  // Scanned barcode & product lookup
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [scannedProduct, setScannedProduct] = useState<Product | null>(null);

  // Quantity to add (for existing products)
  const [addQty, setAddQty] = useState<number>(1);

  // Camera error
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Overall success overlay (after adding stock)
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
  const [successData, setSuccessData] = useState<{ name: string; quantity: number } | null>(null);

  // Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scannerIntervalRef = useRef<number | null>(null);
  const lastScannedRef = useRef<string>('');
  const scanCooldownRef = useRef(false);
  const addStockTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup on unmount / close
  useEffect(() => {
    return () => {
      if (scannerIntervalRef.current) {
        clearInterval(scannerIntervalRef.current);
        scannerIntervalRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (addStockTimeoutRef.current) clearTimeout(addStockTimeoutRef.current);
    };
  }, []);

  // Back button closes the scanner view but keeps the modal open
  useEffect(() => {
    if (isScannerOpen) {
      window.history.pushState({ scannerOpen: true }, '');
      const handleBack = () => {
        stopScanner();
        // Do NOT call onClose() — only stop the scanner and return to idle/menu view
      };
      window.addEventListener('popstate', handleBack);
      return () => {
        window.removeEventListener('popstate', handleBack);
      };
    }
  }, [isScannerOpen]);

  // ⚠️ All hooks MUST be declared BEFORE the early return
  // to keep hook count consistent across renders (React error #310 fix)

  // Flash toggle
  const toggleFlash = useCallback(async () => {
    const currentStream = streamRef.current;
    if (!currentStream) return;
    const track = currentStream.getVideoTracks()[0];
    if (!track) return;
    
    const capabilities = track.getCapabilities() as any;
    if (capabilities.torch) {
      const nextFlashState = !flashOn;
      try {
        await track.applyConstraints({ advanced: [{ torch: nextFlashState }] as any });
        setFlashOn(nextFlashState);
      } catch (error) {
        console.warn('Flash toggle error:', error);
      }
    }
  }, [flashOn]);

// Start camera & scanner
  const startScanner = useCallback(async () => {
    setCameraError(null);
    setScannedBarcode('');
    setScannedProduct(null);
    setShowSuccessOverlay(false);
    setSuccessData(null);
    lastScannedRef.current = '';
    scanCooldownRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;

      // ✅ Render fullscreen UI FIRST, then assign stream to video element
      setIsScannerOpen(true);
      setScannerStatus('scanning');

      // Wait one frame for React to render the video element
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const BarcodeDetectorClass = (window as any).BarcodeDetector;
      if (BarcodeDetectorClass) {
        const detector = new BarcodeDetectorClass({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'codabar', 'qr_code'],
        });

        scannerIntervalRef.current = window.setInterval(async () => {
          if (!videoRef.current || scanCooldownRef.current) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0) {
              const raw = barcodes[0].rawValue.trim();
              if (raw && raw !== lastScannedRef.current) {
                scanCooldownRef.current = true;
                lastScannedRef.current = raw;
                setScanFlash(true);
                setTimeout(() => setScanFlash(false), 400);
                handleBarcodeDetected(raw);
                setTimeout(() => { scanCooldownRef.current = false; }, 2000);
              }
            }
          } catch { /* ignore detection errors */ }
        }, 300);
      } else {
        setScannerStatus('scanning');
      }
    } catch (err: any) {
      console.warn('Câmera indisponível ou negada:', err);
      let message = 'Câmera indisponível.';
      if (err?.name === 'NotAllowedError') {
        message = 'Permissão da câmera negada. Permita o acesso nas configurações do navegador.';
      } else if (err?.name === 'NotFoundError') {
        message = 'Nenhuma câmera encontrada no dispositivo.';
      } else if (err?.name === 'NotReadableError') {
        message = 'Câmera em uso por outro aplicativo.';
      }
      setCameraError(message);
      // Não abre o fullscreen — mostra erro no modal principal
    }
  }, []);

  // Stop scanner
  const stopScanner = () => {
    if (scannerIntervalRef.current) {
      clearInterval(scannerIntervalRef.current);
      scannerIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsScannerOpen(false);
    setScannerStatus('idle');
    setScannedBarcode('');
    setScannedProduct(null);
    setShowSuccessOverlay(false);
    setSuccessData(null);
    setFlashOn(false);
    setScanFlash(false);
    setScanPaused(false);
    setAddQty(1);
    setMode('menu');
    setIsDocScannerOpen(false);
  };

  // ✅ FIXED: Handle barcode detection with proper dependencies
  const handleBarcodeDetected = useCallback((barcode: string) => {
    setScannedBarcode(barcode);

    // If targetProductId is provided, update that product's barcode directly
    if (targetProductId) {
      const allProds = storageService.getProducts();
      const prodIndex = allProds.findIndex((p) => p.id === targetProductId);
      if (prodIndex >= 0) {
        const updatedProd = { ...allProds[prodIndex], barcode };
        storageService.saveProduct(updatedProd);
        posAudio.chime();
        setScannedProduct(updatedProd);
        setScannerStatus('found');
        setAddQty(1);
        // Pause scanning - wait for user action
        setScanPaused(true);
        if (scannerIntervalRef.current) {
          clearInterval(scannerIntervalRef.current);
          scannerIntervalRef.current = null;
        }
        // Show success and auto-close after brief delay
        setShowSuccessOverlay(true);
        setSuccessData({ name: updatedProd.name, quantity: 1 });
        if (addStockTimeoutRef.current) clearTimeout(addStockTimeoutRef.current);
        addStockTimeoutRef.current = setTimeout(() => {
          setShowSuccessOverlay(false);
          setSuccessData(null);
          onClose();
        }, 1500);
        return;
      }
    }

    // 🔍 DEBUG: Check what barcode was detected and what products are available
    console.log('🔍 [BarcodeScanner] Barcode detected:', JSON.stringify(barcode));
    const allProds = storageService.getProducts();
    console.log('🔍 [BarcodeScanner] Total products in localStorage:', allProds.length);
    if (allProds.length > 0) {
      console.log('🔍 [BarcodeScanner] Product barcodes:', allProds.map(p => ({ id: p.id, name: p.name, barcode: p.barcode, active: p.active })));
    }
    
    // ✅ FIXED: Only consider ACTIVE products
    // Also trim the stored barcode for comparison to handle whitespace differences
    const existing = allProds
      .filter(p => p.active !== false) // Só produtos ativos
      .find((p) => p.barcode && p.barcode !== '0' && p.barcode.trim() === barcode.trim());

    console.log('🔍 [BarcodeScanner] Product found:', existing ? existing.name : '❌ NOT FOUND');

    if (existing) {
      posAudio.chime(); // ✔ Produto encontrado — som de sucesso
      setScannedProduct(existing);
      setScannerStatus('found');
      setAddQty(1);

      // PAUSE scanning - wait for user action
      setScanPaused(true);
      if (scannerIntervalRef.current) {
        clearInterval(scannerIntervalRef.current);
        scannerIntervalRef.current = null;
      }
    } else {
      // Produto não encontrado — fecha câmera e direciona para cadastro completo
      posAudio.beep();
      stopScanner();
      // ✅ FIXED: Delay navigation to allow React to close fullscreen scanner first
      setTimeout(() => {
        if (onNavigateToNewProduct) {
          onNavigateToNewProduct(barcode);
        }
        onClose();
      }, 150);
    }
  }, [targetProductId, onNavigateToNewProduct, onClose]);

  if (!isOpen) return null;

  // Add stock to existing product
  const handleAddStockToExisting = async () => {
    if (!scannedProduct || addQty <= 0) return;

    const reasonText = `Entrada Câmera: ${addQty}un - Filial ${currentBranch?.name || 'Matriz'}`;
    await storageService.updateStock(scannedProduct.id, addQty, reasonText, 'Câmera HD-System');

    posAudio.chime();
    if (onProductsImported) onProductsImported();

    setSuccessData({ name: scannedProduct.name, quantity: addQty });
    setShowSuccessOverlay(true);

    // Auto-resume after 1.5s
    if (addStockTimeoutRef.current) clearTimeout(addStockTimeoutRef.current);
    addStockTimeoutRef.current = setTimeout(() => {
      setShowSuccessOverlay(false);
      setSuccessData(null);
      handleScanNext();
    }, 1500);
  };

  // Resume scanning
  const handleScanNext = () => {
    setScanPaused(false);
    setScannerStatus('scanning');
    setScannedBarcode('');
    setScannedProduct(null);
    setShowSuccessOverlay(false);
    setSuccessData(null);
    setAddQty(1);
    lastScannedRef.current = '';

    // Restart barcode polling
    if (scannerIntervalRef.current) {
      clearInterval(scannerIntervalRef.current);
    }
    const BarcodeDetectorClass = (window as any).BarcodeDetector;
    if (BarcodeDetectorClass && videoRef.current) {
      const detector = new BarcodeDetectorClass({
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'codabar', 'qr_code'],
      });
      scannerIntervalRef.current = window.setInterval(async () => {
        if (!videoRef.current || scanCooldownRef.current) return;
        try {
          const barcodes = await detector.detect(videoRef.current);
          if (barcodes.length > 0) {
            const raw = barcodes[0].rawValue.trim();
            if (raw && raw !== lastScannedRef.current) {
              scanCooldownRef.current = true;
              lastScannedRef.current = raw;
              setScanFlash(true);
              setTimeout(() => setScanFlash(false), 400);
              handleBarcodeDetected(raw);
              setTimeout(() => { scanCooldownRef.current = false; }, 2000);
            }
          }
        } catch { /* ignore detection errors */ }
      }, 300);
    }
  };

  // Manual barcode submit
  const handleManualBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const input = form.elements.namedItem('manualBarcode') as HTMLInputElement;
    if (input?.value?.trim()) {
      handleBarcodeDetected(input.value.trim());
      input.value = '';
    }
  };

  // Close everything
  const handleClose = () => {
    stopScanner();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center sm:p-4 bg-slate-900/80 backdrop-blur-md animate-fadeIn">
      {/* Success overlay (full screen, brief) */}
      {showSuccessOverlay && successData && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-[#18181b] rounded-3xl shadow-2xl p-8 flex flex-col items-center gap-4 animate-[scale-up_0.3s_ease-out] max-w-xs mx-4">
            <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center animate-pulse">
              <Check className="w-10 h-10 text-emerald-500" strokeWidth={3} />
            </div>
            <h3 className="text-lg font-extrabold text-slate-900 dark:text-white text-center">
              Estoque Atualizado!
            </h3>
            <div className="text-center space-y-1">
              <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                {successData.name}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Quantidade: <span className="font-bold text-emerald-600 dark:text-emerald-400">+{successData.quantity} un</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main modal */}
      <div className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] sm:max-h-[90vh] h-full sm:h-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-[#27272a] flex items-center justify-between bg-slate-50 dark:bg-[#09090b]/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <Camera className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Scanner de Estoque</span>
                {isScannerOpen && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                    scanPaused
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  }`}>
                    {scanPaused ? 'Pausado' : 'Auto-Scan'}
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Entrada rápida por código de barras ou documento A4 do fornecedor
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">
          {/* Active Branch Badge */}
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

          {/* PRODUCT TAB - Camera start screen (choose method) */}
          {!isScannerOpen && !isDocScannerOpen && (
            <div className="p-8 rounded-2xl border-2 border-dashed border-slate-300 dark:border-[#27272a] bg-slate-50 dark:bg-[#09090b] flex flex-col items-center text-center space-y-4">
              <div className="p-4 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                <Camera className="w-8 h-8" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Como deseja entrar no estoque?
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
                  Escolha o tipo de entrada pela câmera.
                </p>
              </div>
              {cameraError && (
                <div className="w-full max-w-xs p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-400 font-bold">
                  {cameraError}
                </div>
              )}
              <div className="w-full max-w-sm space-y-2.5">
                <button
                  onClick={() => { setMode('barcode'); startScanner(); }}
                  className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md transition-colors flex items-center justify-center gap-2"
                >
                  <ScanLine className="w-4 h-4" />
                  <span>Escanear Código de Barras</span>
                </button>
                <button
                  onClick={() => { setMode('doc'); setIsDocScannerOpen(true); }}
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-colors flex items-center justify-center gap-2"
                >
                  <FileText className="w-4 h-4" />
                  <span>Escanear Documento A4 (NF do Fornecedor)</span>
                </button>
              </div>
            </div>
          )}

          {/* PRODUCT TAB - While scanner is open (show results below camera) */}
          {isScannerOpen && (
            <>
              {/* Found: existing product */}
              {scannerStatus === 'found' && scannedProduct && !showSuccessOverlay && (
                <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 space-y-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">Produto encontrado!</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">Código: {scannedBarcode}</p>
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-white dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] space-y-1.5">
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{scannedProduct.name}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Estoque atual: <span className="font-bold text-indigo-600 dark:text-indigo-400">{scannedProduct.currentStock} {scannedProduct.unit}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Adicionar:</span>
                    <input
                      type="number"
                      min="1"
                      value={addQty}
                      onChange={(e) => setAddQty(Math.max(1, Number(e.target.value) || 1))}
                      className="w-20 px-3 py-2 rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-sm font-bold text-slate-900 dark:text-white text-center focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <span className="text-xs text-slate-500 dark:text-slate-400">un</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleAddStockToExisting}
                      disabled={addQty <= 0}
                      className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs shadow-md transition-colors flex items-center justify-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Adicionar ao Estoque</span>
                    </button>
                    <button
                      onClick={handleScanNext}
                      className="px-4 py-3 rounded-xl bg-slate-100 dark:bg-[#27272a] hover:bg-slate-200 dark:hover:bg-[#3f3f46] text-slate-600 dark:text-slate-300 font-bold text-xs transition-colors"
                    >
                      Pular
                    </button>
                  </div>
                </div>
              )}

              {/* Manual barcode input */}
              {scannerStatus === 'scanning' && !scanPaused && (
                <form onSubmit={handleManualBarcodeSubmit} className="flex gap-2">
                  <input
                    name="manualBarcode"
                    type="text"
                    placeholder="Digite o código manualmente..."
                    className="flex-1 px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="submit"
                    className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-colors"
                  >
                    OK
                  </button>
                </form>
              )}

              <button
                onClick={stopScanner}
                className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-[#27272a] hover:bg-slate-200 dark:hover:bg-[#3f3f46] text-slate-600 dark:text-slate-400 text-xs font-bold transition-colors"
              >
                Fechar Câmera
              </button>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-[#09090b]/80 border-t border-slate-200 dark:border-[#27272a] flex justify-end shrink-0">
          <button
            onClick={handleClose}
            className="px-5 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-black font-bold text-xs"
          >
            Fechar
          </button>
        </div>
      </div>

      {/* FULLSCREEN CAMERA SCANNER */}
      {isScannerOpen && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          {/* Close button (top-right) */}
          <button
            onClick={stopScanner}
            className="absolute right-4 z-50 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 backdrop-blur-sm transition-colors"
            style={{ top: 'max(1rem, env(safe-area-inset-top))' }}
            title="Fechar Scanner"
          >
            <X className="w-6 h-6" />
          </button>

          {/* Flash toggle (top-left) */}
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
              <Zap className="w-6 h-6 text-black" fill="currentColor" />
            ) : (
              <ZapOff className="w-6 h-6 text-white/70" />
            )}
          </button>

          {/* Video fills remaining space */}
          <div className="relative flex-1">
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              playsInline
              muted
            />

            {/* Scan overlay guide */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div
                className="w-[80%] sm:w-3/4 h-[40%] sm:h-1/2 rounded-2xl flex items-center justify-center transition-all duration-300"
                style={{
                  border: `3px dashed ${scanFlash ? '#22c55e' : 'rgba(255,255,255,0.85)'}`,
                  boxShadow: scanFlash
                    ? '0 0 40px 12px rgba(34,197,94,0.5), inset 0 0 20px rgba(34,197,94,0.15)'
                    : '0 0 20px 4px rgba(255,255,255,0.08)',
                }}
              >
                <span className="text-white text-sm sm:text-base font-bold bg-black/50 px-4 py-1.5 rounded-full backdrop-blur-sm shadow-lg">
                  Enquadre o código de barras ou QR Code
                </span>
              </div>
            </div>

            {/* In-camera success banner */}
            {showSuccessOverlay && successData && (
              <div className="absolute left-4 right-4 z-40 animate-[slideDown_0.25s_ease-out]" style={{ top: 'max(4rem, calc(env(safe-area-inset-top) + 1rem))' }}>
                <div className="p-4 bg-emerald-500/95 text-white rounded-2xl shadow-2xl backdrop-blur-sm border border-emerald-400/30">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-5 h-5 text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold truncate">{successData.name}</p>
                      <p className="text-[11px] text-emerald-100 font-semibold">Estoque atualizado!</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleScanNext}
                      className="flex-1 py-2.5 rounded-xl bg-white text-emerald-700 text-xs font-bold transition-colors hover:bg-emerald-50 active:scale-[0.98]"
                    >
                      Escanear Próximo
                    </button>
                    <button
                      onClick={stopScanner}
                      className="flex-1 py-2.5 rounded-xl bg-emerald-700/50 text-white text-xs font-bold transition-colors hover:bg-emerald-700/70 active:scale-[0.98]"
                    >
                      Fechar Scanner
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Scanning indicator */}
            {scannerStatus === 'scanning' && !scanPaused && (
              <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-emerald-500/90 text-white px-2.5 py-1 rounded-full text-[10px] font-bold backdrop-blur-sm" style={{ top: 'max(1rem, env(safe-area-inset-top))' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                Escaneando...
              </div>
            )}

            {/* Paused indicator */}
            {scanPaused && !showSuccessOverlay && (
              <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-amber-500/90 text-white px-2.5 py-1 rounded-full text-[10px] font-bold backdrop-blur-sm" style={{ top: 'max(1rem, env(safe-area-inset-top))' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-white" />
                Pausado
              </div>
            )}
          </div>

          {/* Bottom sheet: status + manual input + actions */}
          <div className="bg-white dark:bg-[#18181b] rounded-t-3xl px-4 pt-4 space-y-3 border-t border-slate-200 dark:border-[#27272a] max-h-[40vh] overflow-y-auto" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>

            {/* Found: existing product (bottom sheet) */}
            {scannerStatus === 'found' && scannedProduct && !showSuccessOverlay && (
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-500/30">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                  <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300 truncate">{scannedProduct.name}</p>
                </div>
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mb-2">
                  Estoque atual: <span className="font-bold">{scannedProduct.currentStock} {scannedProduct.unit}</span>
                </p>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Qtd:</span>
                  <input
                    type="number"
                    min="1"
                    value={addQty}
                    onChange={(e) => setAddQty(Math.max(1, Number(e.target.value) || 1))}
                    className="w-20 px-3 py-2 rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-sm font-bold text-slate-900 dark:text-white text-center focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleAddStockToExisting}
                    disabled={addQty <= 0}
                    className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Adicionar ao Estoque
                  </button>
                  <button
                    onClick={handleScanNext}
                    className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-[#27272a] hover:bg-slate-200 dark:hover:bg-[#3f3f46] text-slate-700 dark:text-slate-300 text-xs font-bold transition-colors"
                  >
                    Pular
                  </button>
                </div>
              </div>
            )}

            {/* Manual barcode input */}
            {scannerStatus === 'scanning' && (
              <form onSubmit={handleManualBarcodeSubmit} className="flex gap-2">
                <input
                  name="manualBarcode"
                  type="text"
                  placeholder="Digite o código manualmente..."
                  className="flex-1 px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="submit"
                  className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-colors"
                >
                  OK
                </button>
              </form>
            )}

            <button
              onClick={stopScanner}
              className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-[#27272a] hover:bg-slate-200 dark:hover:bg-[#3f3f46] text-slate-600 dark:text-slate-400 text-xs font-bold transition-colors"
            >
              Fechar Scanner
            </button>
          </div>
        </div>
      )}

      {/* DOCUMENTO A4 scanner overlay */}
      {isDocScannerOpen && (
        <StockDocScannerModal
          isOpen={isDocScannerOpen}
          onClose={() => {
            setIsDocScannerOpen(false);
            setMode('menu');
          }}
          currentBranch={currentBranch ? { name: currentBranch.name, city: currentBranch.city || '' } : undefined}
          onProductsImported={onProductsImported}
        />
      )}
    </div>
  );
};
