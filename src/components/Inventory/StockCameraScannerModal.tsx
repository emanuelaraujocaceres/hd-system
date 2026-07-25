import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  X,
  Camera,
  Package,
  FileText,
  Check,
  Plus,
  Zap,
  ZapOff,
  CheckCircle2,
  AlertTriangle,
  Building2,
} from 'lucide-react';
import { Product, StoreBranch } from '../../types';
import { storageService } from '../../services/storageService';
import { posAudio } from '../../services/audioService';

interface StockCameraScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBranch?: StoreBranch;
  onProductsImported?: () => void;
}

export const StockCameraScannerModal: React.FC<StockCameraScannerModalProps> = ({
  isOpen,
  onClose,
  currentBranch,
  onProductsImported,
}) => {
  // Scanner state
  const [scannerStatus, setScannerStatus] = useState<'idle' | 'scanning' | 'found' | 'not_found'>('idle');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scanPaused, setScanPaused] = useState(false);
  const [scanFlash, setScanFlash] = useState(false);
  const [flashOn, setFlashOn] = useState(false);

  // Scanned barcode & product lookup
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [scannedProduct, setScannedProduct] = useState<Product | null>(null);

  // Not found quick-register form state
  const [showQuickForm, setShowQuickForm] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickSalePrice, setQuickSalePrice] = useState<number>(0);
  const [quickCostPrice, setQuickCostPrice] = useState<number>(0);
  const [quickQty, setQuickQty] = useState<number>(1);

  // Quantity to add (for existing products)
  const [addQty, setAddQty] = useState<number>(1);

  // Camera error
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Overall success overlay (after adding stock)
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
  const [successData, setSuccessData] = useState<{ name: string; quantity: number } | null>(null);

  // Tab: product vs invoice
  const [activeTab, setActiveTab] = useState<'product' | 'invoice'>('product');

  // Invoice fields (simplified)
  const [invSupplierName, setInvSupplierName] = useState('');
  const [invInvoiceNumber, setInvInvoiceNumber] = useState('');
  const [invProductName, setInvProductName] = useState('');
  const [invBarcode, setInvBarcode] = useState('');
  const [invQty, setInvQty] = useState<number>(1);
  const [invUnitPrice, setInvUnitPrice] = useState<number>(0);

  // Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scannerIntervalRef = useRef<number | null>(null);
  const lastScannedRef = useRef<string>('');
  const scanCooldownRef = useRef(false);

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
    };
  }, []);

  // Back button closes scanner on mobile
  useEffect(() => {
    if (isScannerOpen) {
      window.history.pushState({ scannerOpen: true }, '');
      const handleBack = () => {
        stopScanner();
        onClose();
      };
      window.addEventListener('popstate', handleBack);
      return () => {
        window.removeEventListener('popstate', handleBack);
      };
    }
  }, [isScannerOpen]);

  if (!isOpen) return null;

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
    setShowQuickForm(false);
    setShowSuccessOverlay(false);
    setSuccessData(null);
    lastScannedRef.current = '';
    scanCooldownRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setIsScannerOpen(true);
      setScannerStatus('scanning');

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
      setIsScannerOpen(true);
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
    setShowQuickForm(false);
    setShowSuccessOverlay(false);
    setSuccessData(null);
    setFlashOn(false);
    setScanFlash(false);
    setScanPaused(false);
    setAddQty(1);
    setQuickName('');
    setQuickSalePrice(0);
    setQuickCostPrice(0);
    setQuickQty(1);
  };

  // ✅ FIXED: Handle barcode detection with proper dependencies
  const handleBarcodeDetected = useCallback((barcode: string) => {
    setScannedBarcode(barcode);

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
      .find((p) => p.barcode.trim() === barcode.trim());

    console.log('🔍 [BarcodeScanner] Product found:', existing ? existing.name : '❌ NOT FOUND');

    if (existing) {
      posAudio.chime(); // ✔ Produto encontrado — som de sucesso
      setScannedProduct(existing);
      setScannerStatus('found');
      setAddQty(1);
      setShowQuickForm(false);
    } else {
      posAudio.error(); // ✘ Produto não encontrado — som de erro
      setScannedProduct(null);
      setScannerStatus('not_found');
      setShowQuickForm(false);
      setQuickName('');
      setQuickSalePrice(0);
      setQuickCostPrice(0);
      setQuickQty(1);
    }

    // PAUSE scanning - wait for user action
    setScanPaused(true);
    if (scannerIntervalRef.current) {
      clearInterval(scannerIntervalRef.current);
      scannerIntervalRef.current = null;
    }
  }, []);

  // Add stock to existing product
  const handleAddStockToExisting = () => {
    if (!scannedProduct || addQty <= 0) return;

    const reasonText = `Entrada C\u00e2mera: ${addQty}un - Filial ${currentBranch?.name || 'Matriz'}`;
    storageService.updateStock(scannedProduct.id, addQty, reasonText, 'C\u00e2mera HD-System');

    posAudio.chime();
    if (onProductsImported) onProductsImported();

    setSuccessData({ name: scannedProduct.name, quantity: addQty });
    setShowSuccessOverlay(true);

    // Auto-resume after 1.5s
    setTimeout(() => {
      setShowSuccessOverlay(false);
      setSuccessData(null);
      handleScanNext();
    }, 1500);
  };

  // Quick register new product & add to stock
  const handleQuickRegister = () => {
    if (!quickName.trim()) return;

    const newProd: Product = {
      id: `prod-${Date.now()}`,
      name: quickName.trim(),
      barcode: scannedBarcode || `${Math.floor(7890000000000 + Math.random() * 999999999)}`,
      sku: `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
      category: 'Geral',
      unit: 'un',
      costPrice: quickCostPrice || 0,
      salePrice: quickSalePrice || 0,
      currentStock: quickQty,
      minStock: 5,
      maxStock: 100,
      imageUrl: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&q=80',
      active: true,
      updatedAt: new Date().toISOString(),
      storeBranchId: currentBranch?.id,
    };

    storageService.saveProduct(newProd);

    const reasonText = `Entrada C\u00e2mera (Cadastro R\u00e1pido): ${quickQty}un - Filial ${currentBranch?.name || 'Matriz'}`;
    storageService.updateStock(newProd.id, quickQty, reasonText, 'C\u00e2mera HD-System');

    posAudio.chime();
    if (onProductsImported) onProductsImported();

    setSuccessData({ name: newProd.name, quantity: quickQty });
    setShowSuccessOverlay(true);

    setTimeout(() => {
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
    setShowQuickForm(false);
    setShowSuccessOverlay(false);
    setSuccessData(null);
    setAddQty(1);
    setQuickName('');
    setQuickSalePrice(0);
    setQuickCostPrice(0);
    setQuickQty(1);
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

  // Invoice: confirm import
  const handleConfirmInvoice = () => {
    const name = invProductName.trim() || 'Produto NF';
    const barcode = invBarcode.trim() || `${Math.floor(7890000000000 + Math.random() * 999999999)}`;

    const newProd: Product = {
      id: `prod-inv-${Date.now()}`,
      name,
      barcode,
      sku: `NF-${barcode.slice(-4)}`,
      category: 'Geral',
      unit: 'un',
      costPrice: invUnitPrice || 10.0,
      salePrice: (invUnitPrice || 10.0) * 1.4,
      currentStock: invQty || 1,
      minStock: 5,
      maxStock: 100,
      imageUrl: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&q=80',
      active: true,
      updatedAt: new Date().toISOString(),
      storeBranchId: currentBranch?.id,
    };

    storageService.saveProduct(newProd);

    const reasonText = `Importa\u00e7\u00e3o NF ${invInvoiceNumber || 'S/N'} - Fornecedor ${invSupplierName || 'N\u00e3o informado'}`;
    storageService.updateStock(newProd.id, newProd.currentStock, reasonText, 'Leitor NF C\u00e2mera');

    posAudio.chime();
    if (onProductsImported) onProductsImported();

    setInvProductName('');
    setInvBarcode('');
    setInvQty(1);
    setInvUnitPrice(0);

    setSuccessData({ name: `NF ${invInvoiceNumber || 'S/N'}`, quantity: newProd.currentStock });
    setShowSuccessOverlay(true);
    setTimeout(() => {
      setShowSuccessOverlay(false);
      setSuccessData(null);
    }, 1500);
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
                Escaneie c\u00f3digos de barras para entrada r\u00e1pida de estoque
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

          {/* Mode Tabs */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-[#09090b] rounded-xl border border-slate-200 dark:border-[#27272a] text-xs font-bold">
            <button
              onClick={() => {
                setActiveTab('product');
                if (isScannerOpen) stopScanner();
              }}
              className={`py-2 rounded-lg flex items-center justify-center gap-2 transition-all ${
                activeTab === 'product'
                  ? 'bg-white dark:bg-[#18181b] text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Package className="w-4 h-4" />
              <span>Produto / Caixa</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('invoice');
                if (isScannerOpen) stopScanner();
              }}
              className={`py-2 rounded-lg flex items-center justify-center gap-2 transition-all ${
                activeTab === 'invoice'
                  ? 'bg-white dark:bg-[#18181b] text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Nota Fiscal</span>
            </button>
          </div>

          {/* PRODUCT TAB - Camera start screen */}
          {activeTab === 'product' && !isScannerOpen && (
            <div className="p-8 rounded-2xl border-2 border-dashed border-slate-300 dark:border-[#27272a] bg-slate-50 dark:bg-[#09090b] flex flex-col items-center justify-center text-center space-y-4">
              <div className="p-4 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                <Camera className="w-8 h-8" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Aponta a c\u00e2mera para o c\u00f3digo de barras
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
                  Escaneie v\u00e1rios produtos em sequ\u00eancia. Produtos cadastrados s\u00e3o adicionados direto ao estoque; n\u00e3o cadastrados podem ser criados r\u00e1pido.
                </p>
              </div>
              {cameraError && (
                <div className="w-full max-w-xs p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-400 font-bold">
                  {cameraError}
                </div>
              )}
              <button
                onClick={startScanner}
                className="w-full max-w-xs py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md transition-colors flex items-center justify-center gap-2"
              >
                <Camera className="w-4 h-4" />
                <span>Ligar C\u00e2mera e Escanear</span>
              </button>
            </div>
          )}

          {/* PRODUCT TAB - While scanner is open (show results below camera) */}
          {activeTab === 'product' && isScannerOpen && (
            <>
              {/* Found: existing product */}
              {scannerStatus === 'found' && scannedProduct && !showSuccessOverlay && (
                <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 space-y-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">Produto encontrado!</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">C\u00f3digo: {scannedBarcode}</p>
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

              {/* Not Found */}
              {scannerStatus === 'not_found' && !showSuccessOverlay && (
                <div className="space-y-3">
                  <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-500/30 rounded-xl">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                      <p className="text-xs font-bold text-amber-800 dark:text-amber-300">Produto n\u00e3o encontrado</p>
                    </div>
                    <p className="text-[11px] text-amber-600 dark:text-amber-400">
                      C\u00f3digo: <span className="font-mono font-bold">{scannedBarcode}</span>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowQuickForm(true)}
                      className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Cadastrar R\u00e1pido
                    </button>
                    <button
                      onClick={handleScanNext}
                      className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-[#27272a] hover:bg-slate-200 dark:hover:bg-[#3f3f46] text-slate-700 dark:text-slate-300 text-xs font-bold transition-colors"
                    >
                      Escanear Novamente
                    </button>
                  </div>
                  {showQuickForm && (
                    <div className="p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/20 space-y-3 animate-[slideDown_0.2s_ease-out]">
                      <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                        Cadastro R\u00e1pido
                      </span>
                      <input
                        value={quickName}
                        onChange={(e) => setQuickName(e.target.value)}
                        placeholder="Nome do Produto *"
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        autoFocus
                      />
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={quickSalePrice || ''}
                          onChange={(e) => setQuickSalePrice(Number(e.target.value))}
                          placeholder="R$ Venda"
                          className="px-2 py-2 rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-[11px] font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={quickCostPrice || ''}
                          onChange={(e) => setQuickCostPrice(Number(e.target.value))}
                          placeholder="R$ Custo"
                          className="px-2 py-2 rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-[11px] font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <input
                          type="number"
                          min="1"
                          value={quickQty}
                          onChange={(e) => setQuickQty(Math.max(1, Number(e.target.value) || 1))}
                          placeholder="Qtd"
                          className="px-2 py-2 rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-[11px] font-bold text-slate-900 dark:text-white text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleQuickRegister}
                          disabled={!quickName.trim()}
                          className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs shadow-md transition-colors flex items-center justify-center gap-2"
                        >
                          <Check className="w-4 h-4" />
                          Cadastrar e Adicionar
                        </button>
                        <button
                          onClick={() => setShowQuickForm(false)}
                          className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-[#27272a] hover:bg-slate-200 dark:hover:bg-[#3f3f46] text-slate-600 dark:text-slate-300 font-bold text-xs transition-colors"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Manual barcode input */}
              {scannerStatus === 'scanning' && !scanPaused && (
                <form onSubmit={handleManualBarcodeSubmit} className="flex gap-2">
                  <input
                    name="manualBarcode"
                    type="text"
                    placeholder="Digite o c\u00f3digo manualmente..."
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
                Fechar C\u00e2mera
              </button>
            </>
          )}

          {/* INVOICE TAB (simplified) */}
          {activeTab === 'invoice' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 space-y-3">
                <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider flex items-center gap-1">
                  <FileText className="w-4 h-4" />
                  Dados da Nota Fiscal
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    value={invSupplierName}
                    onChange={(e) => setInvSupplierName(e.target.value)}
                    placeholder="Fornecedor"
                    className="col-span-2 px-3 py-2 rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <input
                    value={invInvoiceNumber}
                    onChange={(e) => setInvInvoiceNumber(e.target.value)}
                    placeholder="N\u00famero NF"
                    className="px-3 py-2 rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="p-3 rounded-xl bg-white dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] space-y-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Item</span>
                  <input
                    value={invProductName}
                    onChange={(e) => setInvProductName(e.target.value)}
                    placeholder="Nome do Produto"
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      value={invBarcode}
                      onChange={(e) => setInvBarcode(e.target.value)}
                      placeholder="EAN"
                      className="px-2 py-2 rounded-lg bg-slate-50 dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-[11px] font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <input
                      type="number"
                      min="1"
                      value={invQty}
                      onChange={(e) => setInvQty(Math.max(1, Number(e.target.value) || 1))}
                      placeholder="Qtd"
                      className="px-2 py-2 rounded-lg bg-slate-50 dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-[11px] font-bold text-slate-900 dark:text-white text-center focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={invUnitPrice || ''}
                      onChange={(e) => setInvUnitPrice(Number(e.target.value))}
                      placeholder="R$ Unit."
                      className="px-2 py-2 rounded-lg bg-slate-50 dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-[11px] font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
                <button
                  onClick={handleConfirmInvoice}
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-lg transition-colors flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>IMPORTAR DIRETO AO ESTOQUE</span>
                </button>
              </div>
            </div>
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
                  Enquadre o c\u00f3digo de barras ou QR Code
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
                      Escanear Pr\u00f3ximo
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

            {/* Not Found (bottom sheet) */}
            {scannerStatus === 'not_found' && !showSuccessOverlay && (
              <div className="space-y-3">
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-500/30 rounded-xl">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                    <p className="text-sm font-bold text-amber-800 dark:text-amber-300">Produto n\u00e3o encontrado</p>
                  </div>
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">
                    C\u00f3digo: <span className="font-mono font-bold">{scannedBarcode}</span>
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowQuickForm(true)}
                    className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Cadastrar R\u00e1pido
                  </button>
                  <button
                    onClick={handleScanNext}
                    className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-[#27272a] hover:bg-slate-200 dark:hover:bg-[#3f3f46] text-slate-700 dark:text-slate-300 text-xs font-bold transition-colors"
                  >
                    Escanear Novamente
                  </button>
                </div>
                {showQuickForm && (
                  <div className="p-3 rounded-xl bg-indigo-500/5 border border-indigo-500/20 space-y-2 animate-[slideDown_0.2s_ease-out]">
                    <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase">
                      Cadastro R\u00e1pido
                    </span>
                    <input
                      value={quickName}
                      onChange={(e) => setQuickName(e.target.value)}
                      placeholder="Nome *"
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      autoFocus
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={quickSalePrice || ''}
                        onChange={(e) => setQuickSalePrice(Number(e.target.value))}
                        placeholder="R$ Venda"
                        className="px-2 py-2 rounded-lg bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-[11px] font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={quickCostPrice || ''}
                        onChange={(e) => setQuickCostPrice(Number(e.target.value))}
                        placeholder="R$ Custo"
                        className="px-2 py-2 rounded-lg bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-[11px] font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <input
                        type="number"
                        min="1"
                        value={quickQty}
                        onChange={(e) => setQuickQty(Math.max(1, Number(e.target.value) || 1))}
                        placeholder="Qtd"
                        className="px-2 py-2 rounded-lg bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-[11px] font-bold text-slate-900 dark:text-white text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleQuickRegister}
                        disabled={!quickName.trim()}
                        className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs shadow-md transition-colors flex items-center justify-center gap-2"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Cadastrar e Adicionar
                      </button>
                      <button
                        onClick={() => setShowQuickForm(false)}
                        className="px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-[#27272a] hover:bg-slate-200 dark:hover:bg-[#3f3f46] text-slate-600 dark:text-slate-300 font-bold text-xs transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Manual barcode input */}
            {scannerStatus === 'scanning' && (
              <form onSubmit={handleManualBarcodeSubmit} className="flex gap-2">
                <input
                  name="manualBarcode"
                  type="text"
                  placeholder="Digite o c\u00f3digo manualmente..."
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
    </div>
  );
};
