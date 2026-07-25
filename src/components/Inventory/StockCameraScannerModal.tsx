import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  X,
  Camera,
  Package,
  FileText,
  Boxes,
  Check,
  RefreshCw,
  Upload,
  Building2,
  Plus,
  Trash2,
  Zap,
  ZapOff,
} from 'lucide-react';
import { Product, StoreBranch } from '../../types';
import { storageService } from '../../services/storageService';
import { posAudio } from '../../services/audioService';

interface InvoiceFormItem {
  name: string;
  barcode: string;
  quantity: number;
  unitPrice: number;
}

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
  const [scanType, setScanType] = useState<'product' | 'invoice'>('product');
  const [productMode, setProductMode] = useState<'unit' | 'box'>('box');

  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  // Product form fields
  const [formName, setFormName] = useState('');
  const [formBarcode, setFormBarcode] = useState('');
  const [formCategory, setFormCategory] = useState('Geral');
  const [formCostPrice, setFormCostPrice] = useState<number>(10);
  const [formSalePrice, setFormSalePrice] = useState<number>(15);
  const [formQty, setFormQty] = useState<number>(1);
  const [unitsPerBox, setUnitsPerBox] = useState<number>(12);

  // Invoice form fields
  const [invSupplierName, setInvSupplierName] = useState('');
  const [invInvoiceNumber, setInvInvoiceNumber] = useState('');
  const [invItems, setInvItems] = useState<InvoiceFormItem[]>([
    { name: '', barcode: '', quantity: 1, unitPrice: 0 },
  ]);

  // Flash toggle
  const [flashOn, setFlashOn] = useState(false);

  // Auto-scan state
  const [autoScanActive, setAutoScanActive] = useState(false);
  const scannerIntervalRef = useRef<number | null>(null);
  const lastScannedRef = useRef<string>('');
  const scanCooldownRef = useRef(false);

  // Camera error state
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Barcode lookup state (when scanned product already exists)
  const [existingProduct, setExistingProduct] = useState<Product | null>(null);

  // AI invoice scanning state
  const [aiScanning, setAiScanning] = useState(false);
  const [aiScanError, setAiScanError] = useState<string | null>(null);

  // Success overlay state
  const [showSuccess, setShowSuccess] = useState(false);
  const [successData, setSuccessData] = useState<{ name: string; quantity: number } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Keep streamRef in sync
  useEffect(() => {
    streamRef.current = cameraStream;
  }, [cameraStream]);

  // Cleanup auto-scan on unmount/close
  useEffect(() => {
    return () => {
      if (scannerIntervalRef.current) {
        clearInterval(scannerIntervalRef.current);
        scannerIntervalRef.current = null;
      }
    };
  }, []);

  if (!isOpen) return null;

  const toggleFlash = useCallback(async () => {
    const stream = streamRef.current;
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    const capabilities = track.getCapabilities() as any;
    if (capabilities.torch) {
      const next = !flashOn;
      await track.applyConstraints({ advanced: [{ torch: next }] as any });
      setFlashOn(next);
    }
  }, [flashOn]);

  const handleStartCamera = async () => {
    try {
      setCapturedImage(null);
      setCameraError(null);

      // Check if getUserMedia is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError('Câmera não suportada neste navegador. Use o upload de foto.');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      setCameraStream(stream);
      streamRef.current = stream;
      setCameraError(null);

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        // Start auto-scan when camera starts
        startAutoScan();
      }, 200);
    } catch (err: any) {
      console.warn('Câmera indisponível ou negada:', err);
      let message = 'Câmera indisponível.';
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        message = 'Permissão da câmera negada. Permita o acesso nas configurações do navegador ou use o upload de foto.';
      } else if (err?.name === 'NotFoundError') {
        message = 'Nenhuma câmera encontrada no dispositivo.';
      } else if (err?.name === 'NotReadableError') {
        message = 'Câmera em uso por outro aplicativo.';
      }
      setCameraError(message);
    }
  };

  const startAutoScan = () => {
    if (scannerIntervalRef.current) {
      clearInterval(scannerIntervalRef.current);
    }
    setAutoScanActive(true);
    scannerIntervalRef.current = window.setInterval(() => {
      autoCaptureAndScan();
    }, 1200);
  };

  const stopAutoScan = () => {
    if (scannerIntervalRef.current) {
      clearInterval(scannerIntervalRef.current);
      scannerIntervalRef.current = null;
    }
    setAutoScanActive(false);
  };

  const autoCaptureAndScan = async () => {
    if (scanCooldownRef.current) return;
    if (!videoRef.current || !canvasRef.current) return;
    if (scanType !== 'product') return; // Only auto-scan for product barcodes

    const video = videoRef.current;
    if (video.readyState < 2) return; // HAVE_CURRENT_DATA

    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.6);

    try {
      // Attempt barcode/QR detection via native BarcodeDetector API
      if ('BarcodeDetector' in window) {
        const bitmap = await createImageBitmap(canvas);
        const detector = new (window as any).BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'],
        });
        const barcodes = await detector.detect(bitmap);

        if (barcodes && barcodes.length > 0) {
          const code = barcodes[0].rawValue;
          if (code && code !== lastScannedRef.current) {
            lastScannedRef.current = code;
            scanCooldownRef.current = true;

            // Flash scan indicator
            posAudio.chime();

            // Stop auto-scan, set barcode, show captured image for form filling
            stopAutoScan();
            setCapturedImage(dataUrl);
            setFormBarcode(code);
            handleStopCamera();

            // Look up existing product by barcode
            const existing = storageService.getProducts().find(
              (p) => p.barcode === code
            );
            if (existing) {
              setExistingProduct(existing);
            } else {
              setExistingProduct(null);
            }

            setTimeout(() => {
              scanCooldownRef.current = false;
            }, 3000);
          }
        }
      }
    } catch {
      // BarcodeDetector not available or error — fall back silently
    }
  };

  const handleStopCamera = () => {
    stopAutoScan();
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
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const resetProductForm = () => {
    setFormName('');
    setFormBarcode('');
    setFormCategory('Geral');
    setFormCostPrice(10);
    setFormSalePrice(15);
    setFormQty(1);
    setUnitsPerBox(12);
    setExistingProduct(null);
  };

  const resetInvoiceForm = () => {
    setInvSupplierName('');
    setInvInvoiceNumber('');
    setInvItems([{ name: '', barcode: '', quantity: 1, unitPrice: 0 }]);
    setAiScanning(false);
    setAiScanError(null);
  };

  const handleConfirmAddProduct = () => {
    const isBox = productMode === 'box';
    const effectiveQty = isBox ? formQty * unitsPerBox : formQty;

    const newProd: Product = {
      id: `prod-${Date.now()}`,
      name: formName || 'Produto Escaneado Câmera',
      barcode: formBarcode || `${Math.floor(7890000000000 + Math.random() * 999999999)}`,
      sku: `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
      category: formCategory || 'Geral',
      unit: isBox ? 'cx' : 'un',
      costPrice: formCostPrice || 10.0,
      salePrice: formSalePrice || 15.0,
      currentStock: effectiveQty,
      minStock: 5,
      maxStock: 100,
      imageUrl:
        'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&q=80',
      active: true,
      updatedAt: new Date().toISOString(),
      storeBranchId: currentBranch?.id,
    };

    storageService.saveProduct(newProd);

    const reasonText = isBox
      ? `Entrada Câmera: Caixa Atacado (${formQty}cx × ${unitsPerBox}un = ${effectiveQty}un) - Filial ${currentBranch?.name || 'Matriz'}`
      : `Entrada Câmera: ${formQty}un - Filial ${currentBranch?.name || 'Matriz'}`;

    storageService.updateStock(newProd.id, newProd.currentStock, reasonText, 'Câmera HD-System');

    posAudio.chime();
    if (onProductsImported) onProductsImported();

    // Show success overlay
    setSuccessData({ name: newProd.name, quantity: effectiveQty });
    setShowSuccess(true);
    setTimeout(() => {
      setShowSuccess(false);
      setSuccessData(null);
      onClose();
    }, 2000);
  };

  // Add stock to an existing product found by barcode scan
  const handleAddStockToExisting = () => {
    if (!existingProduct) return;
    const isBox = productMode === 'box';
    const effectiveQty = isBox ? formQty * unitsPerBox : formQty;

    const reasonText = isBox
      ? `Entrada Câmera (Código existente): Caixa Atacado (${formQty}cx × ${unitsPerBox}un = ${effectiveQty}un) - Filial ${currentBranch?.name || 'Matriz'}`
      : `Entrada Câmera (Código existente): ${formQty}un - Filial ${currentBranch?.name || 'Matriz'}`;

    storageService.updateStock(existingProduct.id, effectiveQty, reasonText, 'Câmera HD-System');

    posAudio.chime();
    if (onProductsImported) onProductsImported();

    setSuccessData({ name: existingProduct.name, quantity: effectiveQty });
    setShowSuccess(true);
    setTimeout(() => {
      setShowSuccess(false);
      setSuccessData(null);
      onClose();
    }, 2000);
  };

  // AI-powered invoice scanning
  const handleAiScanInvoice = async () => {
    if (!capturedImage) return;
    setAiScanning(true);
    setAiScanError(null);

    try {
      const response = await fetch('/api/ai/scan-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: capturedImage }),
      });

      if (!response.ok) throw new Error('Falha ao analisar nota fiscal');

      const data = await response.json();
      if (data.result) {
        const r = data.result;
        if (r.supplierName) setInvSupplierName(r.supplierName);
        if (r.invoiceNumber) setInvInvoiceNumber(r.invoiceNumber);
        if (r.items && Array.isArray(r.items) && r.items.length > 0) {
          const mapped = r.items.map((item: any) => ({
            name: item.name || '',
            barcode: item.barcode || '',
            quantity: item.quantity || 1,
            unitPrice: item.unitPrice || 0,
          }));
          setInvItems(mapped);
        }
      } else {
        setAiScanError('Não foi possível extrair dados da imagem.');
      }
    } catch (err: any) {
      console.error('Erro IA scan invoice:', err);
      setAiScanError(err?.message || 'Erro ao analisar imagem com IA.');
    } finally {
      setAiScanning(false);
    }
  };

  const handleAddInvoiceItem = () => {
    setInvItems([...invItems, { name: '', barcode: '', quantity: 1, unitPrice: 0 }]);
  };

  const handleRemoveInvoiceItem = (index: number) => {
    if (invItems.length <= 1) return;
    setInvItems(invItems.filter((_, i) => i !== index));
  };

  const handleUpdateInvoiceItem = (index: number, field: keyof InvoiceFormItem, value: string | number) => {
    const updated = [...invItems];
    updated[index] = { ...updated[index], [field]: value };
    setInvItems(updated);
  };

  const handleConfirmImportInvoice = () => {
    const validItems = invItems.filter((item) => item.name.trim() !== '');
    if (validItems.length === 0) return;

    validItems.forEach((item, idx) => {
      const newProd: Product = {
        id: `prod-inv-${Date.now()}-${idx}`,
        name: item.name,
        barcode: item.barcode || `${Math.floor(7890000000000 + Math.random() * 999999999)}`,
        sku: `NF-${item.barcode?.slice(-4) || idx}`,
        category: 'Geral',
        unit: 'un',
        costPrice: item.unitPrice || 10.0,
        salePrice: (item.unitPrice || 10.0) * 1.4,
        currentStock: item.quantity || 1,
        minStock: 5,
        maxStock: 100,
        imageUrl:
          'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&q=80',
        active: true,
        updatedAt: new Date().toISOString(),
        storeBranchId: currentBranch?.id,
      };

      storageService.saveProduct(newProd);

      const reasonText = `Importação Nota Fiscal ${invInvoiceNumber || 'S/N'} - Fornecedor ${invSupplierName || 'Não informado'}`;
      storageService.updateStock(newProd.id, newProd.currentStock, reasonText, 'Leitor NF Câmera');
    });

    posAudio.chime();
    if (onProductsImported) onProductsImported();

    // Show success overlay for invoice
    const totalItems = validItems.length;
    const totalQty = validItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
    setSuccessData({ name: `NF ${invInvoiceNumber || 'S/N'} — ${totalItems} itens`, quantity: totalQty });
    setShowSuccess(true);
    setTimeout(() => {
      setShowSuccess(false);
      setSuccessData(null);
      onClose();
    }, 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center sm:p-4 bg-slate-900/80 backdrop-blur-md animate-fadeIn">
      {/* Success Confirmation Overlay */}
      {showSuccess && successData && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-[#18181b] rounded-3xl shadow-2xl p-8 flex flex-col items-center gap-4 animate-[scale-up_0.3s_ease-out] max-w-xs mx-4">
            <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center animate-pulse">
              <Check className="w-10 h-10 text-emerald-500" strokeWidth={3} />
            </div>
            <h3 className="text-lg font-extrabold text-slate-900 dark:text-white text-center">
              Produto Adicionado!
            </h3>
            <div className="text-center space-y-1">
              <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                {successData.name}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Quantidade: <span className="font-bold text-emerald-600 dark:text-emerald-400">{successData.quantity} un</span>
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] sm:max-h-[90vh] h-full sm:h-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-[#27272a] flex items-center justify-between bg-slate-50 dark:bg-[#09090b]/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <Camera className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Scanner Visual por Câmera</span>
                <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-extrabold uppercase">
                  {autoScanActive ? 'Auto-Scan' : 'Manual'}
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tire uma foto e preencha os dados manualmente usando a foto como referência
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
          {/* Active Branch Badge */}
          {currentBranch && (
            <div className="p-3 rounded-xl bg-indigo-500/5 border border-indigo-500/20 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300 font-bold">
                <Building2 className="w-4 h-4 text-indigo-500" />
                <span>Destino do Estoque: {currentBranch.name} ({currentBranch.city})</span>
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
                setScanType('product');
                setCapturedImage(null);
                resetProductForm();
              }}
              className={`py-2 rounded-lg flex items-center justify-center gap-2 transition-all ${
                scanType === 'product'
                  ? 'bg-white dark:bg-[#18181b] text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Boxes className="w-4 h-4" />
              <span>Produto / Caixa Atacado</span>
            </button>

            <button
              onClick={() => {
                setScanType('invoice');
                setCapturedImage(null);
                resetInvoiceForm();
                stopAutoScan();
              }}
              className={`py-2 rounded-lg flex items-center justify-center gap-2 transition-all ${
                scanType === 'invoice'
                  ? 'bg-white dark:bg-[#18181b] text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Nota Fiscal do Fornecedor</span>
            </button>
          </div>

          {/* Product Wholesale / Unit Sub-selector */}
          {scanType === 'product' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] text-xs">
                <span className="font-bold text-slate-700 dark:text-slate-300">Formato da Leitura:</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setProductMode('box')}
                    className={`px-3 py-1 rounded-lg font-bold border transition-all ${
                      productMode === 'box'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-white dark:bg-[#18181b] text-slate-600 dark:text-slate-300 border-slate-300 dark:border-[#27272a]'
                    }`}
                  >
                    Caixa de Produtos (Atacado)
                  </button>
                  <button
                    type="button"
                    onClick={() => setProductMode('unit')}
                    className={`px-3 py-1 rounded-lg font-bold border transition-all ${
                      productMode === 'unit'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-white dark:bg-[#18181b] text-slate-600 dark:text-slate-300 border-slate-300 dark:border-[#27272a]'
                    }`}
                  >
                    Unidade Avulsa
                  </button>
                </div>
              </div>

              {/* Units per box input (shown when box mode is selected) */}
              {productMode === 'box' && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-xs">
                  <span className="font-bold text-amber-700 dark:text-amber-400 whitespace-nowrap">
                    Unidades por caixa:
                  </span>
                  <input
                    type="number"
                    min="1"
                    value={unitsPerBox}
                    onChange={(e) => setUnitsPerBox(Number(e.target.value) || 1)}
                    className="w-20 px-3 py-1.5 rounded-lg bg-white dark:bg-[#18181b] border border-amber-300 dark:border-amber-700 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 text-center"
                  />
                  <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">
                    {formQty} cx × {unitsPerBox} un = <span className="text-emerald-600 dark:text-emerald-400">{formQty * unitsPerBox} un</span>
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Camera Viewfinder & Image Capture Section */}
          <div className="space-y-3">
            {!cameraStream && !capturedImage && (
              <div className="p-8 rounded-2xl border-2 border-dashed border-slate-300 dark:border-[#27272a] bg-slate-50 dark:bg-[#09090b] flex flex-col items-center justify-center text-center space-y-4">
                <div className="p-4 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <Camera className="w-8 h-8" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    Aponta a câmera do celular para {scanType === 'product' ? 'a embalagem ou caixa' : 'a folha da nota fiscal'}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
                    Tire uma foto e preencha os dados manualmente usando a imagem como referência.
                  </p>
                </div>

                {cameraError && (
                  <div className="w-full max-w-xs p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-400 font-bold">
                    {cameraError}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-xs">
                  <button
                    onClick={handleStartCamera}
                    className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md transition-colors flex items-center justify-center gap-2"
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

            {/* Live Camera Feed — FULLSCREEN on mobile */}
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

                  {/* Auto-scan indicator */}
                  {autoScanActive && (
                    <div className="absolute right-4 z-50 px-3 py-1 rounded-full backdrop-blur-sm bg-emerald-500/80 text-white text-[10px] font-bold flex items-center gap-1.5 animate-pulse"
                      style={{ top: 'max(1rem, env(safe-area-inset-top))' }}>
                      <span className="w-2 h-2 rounded-full bg-white animate-ping"></span>
                      AUTO-SCAN ATIVO
                    </div>
                  )}

                  <div className="absolute inset-6 sm:inset-6 border-2 border-dashed border-white/50 rounded-2xl pointer-events-none flex items-center justify-center">
                    <span className="text-[10px] text-white/90 bg-black/60 px-3 py-1 rounded-full font-mono font-bold">
                      {scanType === 'product' ? 'Enquadre a Caixa/Embalagem ou Código de Barras' : 'Enquadre a Nota Fiscal em Papel'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 p-4 bg-slate-900 shrink-0 sm:bg-transparent" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
                  <button
                    onClick={() => {
                      handleStopCamera();
                      setCapturedImage(null);
                    }}
                    className="px-4 py-2.5 bg-slate-700 text-slate-200 font-bold text-xs rounded-xl sm:bg-slate-200 sm:dark:bg-slate-800 sm:text-slate-700 sm:dark:text-slate-300"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleCapturePhoto}
                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-lg flex items-center justify-center gap-2"
                  >
                    <Camera className="w-4 h-4" />
                    <span>CAPTURAR FOTO</span>
                  </button>
                </div>
              </div>
            )}

            {/* Captured Image Preview + Product Manual Entry Form */}
            {capturedImage && scanType === 'product' && (
              <div className="space-y-4">
                <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-[#27272a] bg-slate-900">
                  <img src={capturedImage} alt="Foto Capturada" className="w-full max-h-64 object-contain" />
                  <button
                    onClick={() => {
                      setCapturedImage(null);
                      resetProductForm();
                      handleStartCamera();
                    }}
                    className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded-lg text-xs hover:bg-black/80 transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>

                {/* Manual Entry Form */}
                <div className="p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/20 space-y-3">
                  <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-1">
                    <Package className="w-4 h-4" />
                    {existingProduct
                      ? 'Produto encontrado! Adicione estoque ou crie novo:'
                      : 'Preencha os dados do produto (use a foto como referência):'}
                  </span>

                  {/* Existing product info banner */}
                  {existingProduct && (
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-2">
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                          Produto já cadastrado
                        </span>
                      </div>
                      <div className="text-xs text-slate-700 dark:text-slate-300 space-y-1">
                        <p><strong>Nome:</strong> {existingProduct.name}</p>
                        <p><strong>Estoque atual:</strong> {existingProduct.currentStock} {existingProduct.unit}</p>
                        <p><strong>Código:</strong> {existingProduct.barcode}</p>
                      </div>
                      <button
                        onClick={handleAddStockToExisting}
                        className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-colors flex items-center justify-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        ADICIONAR {formQty} {productMode === 'box' ? `CAIXAS (${formQty * unitsPerBox}un)` : 'UNIDADES'} AO ESTOQUE
                      </button>
                      <div className="text-[10px] text-slate-400 text-center font-bold">
                        — ou preencha abaixo para cadastrar como novo produto —
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <input
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="Nome do Produto"
                      className="col-span-2 px-3 py-2 rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <input
                      value={formBarcode}
                      onChange={(e) => setFormBarcode(e.target.value)}
                      placeholder="Código de Barras (EAN-13)"
                      className="px-3 py-2 rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <input
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value)}
                      placeholder="Categoria"
                      className="px-3 py-2 rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <input
                      value={formCostPrice}
                      onChange={(e) => setFormCostPrice(Number(e.target.value))}
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Preço Custo"
                      className="px-3 py-2 rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <input
                      value={formSalePrice}
                      onChange={(e) => setFormSalePrice(Number(e.target.value))}
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Preço Venda"
                      className="px-3 py-2 rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <input
                      value={formQty}
                      onChange={(e) => setFormQty(Number(e.target.value))}
                      type="number"
                      min="1"
                      placeholder={productMode === 'box' ? 'Qtd Caixas' : 'Quantidade'}
                      className="px-3 py-2 rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  {/* Effective quantity display for box mode */}
                  {productMode === 'box' && (
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs">
                      <span className="text-amber-700 dark:text-amber-400 font-bold">
                        Total de unidades:
                      </span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-extrabold text-sm">
                        {formQty * unitsPerBox} un
                      </span>
                      <span className="text-[10px] text-slate-400">
                        ({formQty} cx × {unitsPerBox} un/cx)
                      </span>
                    </div>
                  )}

                  <button
                    onClick={handleConfirmAddProduct}
                    className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    <span>DAR ENTRADA NO ESTOQUE DA FILIAL</span>
                  </button>
                </div>
              </div>
            )}

            {/* Captured Image Preview + Invoice Manual Entry Form */}
            {capturedImage && scanType === 'invoice' && (
              <div className="space-y-4">
                <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-[#27272a] bg-slate-900">
                  <img src={capturedImage} alt="Foto Capturada" className="w-full max-h-64 object-contain" />
                  <button
                    onClick={() => {
                      setCapturedImage(null);
                      resetInvoiceForm();
                      handleStartCamera();
                    }}
                    className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded-lg text-xs hover:bg-black/80 transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>

                {/* Manual Entry Form */}
                <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider flex items-center gap-1">
                      <FileText className="w-4 h-4" />
                      Preencha os dados da nota fiscal (use a foto como referência):
                    </span>
                    <button
                      onClick={handleAiScanInvoice}
                      disabled={aiScanning}
                      className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-[10px] font-bold transition-colors flex items-center gap-1.5"
                    >
                      {aiScanning ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          Analisando...
                        </>
                      ) : (
                        <>
                          <Zap className="w-3.5 h-3.5" />
                          Extrair com IA
                        </>
                      )}
                    </button>
                  </div>

                  {aiScanError && (
                    <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-[11px] text-red-600 dark:text-red-400 font-bold">
                      {aiScanError}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <input
                      value={invSupplierName}
                      onChange={(e) => setInvSupplierName(e.target.value)}
                      placeholder="Nome do Fornecedor"
                      className="col-span-2 px-3 py-2 rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <input
                      value={invInvoiceNumber}
                      onChange={(e) => setInvInvoiceNumber(e.target.value)}
                      placeholder="Número da Nota Fiscal"
                      className="px-3 py-2 rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  {/* Invoice Items */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase">
                      Itens da Nota:
                    </span>
                    {invItems.map((item, idx) => (
                      <div key={idx} className="p-3 rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-slate-400">ITEM {idx + 1}</span>
                          {invItems.length > 1 && (
                            <button
                              onClick={() => handleRemoveInvoiceItem(idx)}
                              className="p-1 text-red-400 hover:text-red-600 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        <input
                          value={item.name}
                          onChange={(e) => handleUpdateInvoiceItem(idx, 'name', e.target.value)}
                          placeholder="Nome do Produto"
                          className="w-full px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <div className="grid grid-cols-3 gap-2">
                          <input
                            value={item.barcode}
                            onChange={(e) => handleUpdateInvoiceItem(idx, 'barcode', e.target.value)}
                            placeholder="EAN"
                            className="px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] text-[11px] font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                          <input
                            value={item.quantity}
                            onChange={(e) => handleUpdateInvoiceItem(idx, 'quantity', Number(e.target.value))}
                            type="number"
                            min="1"
                            placeholder="Qtd"
                            className="px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] text-[11px] font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                          <input
                            value={item.unitPrice}
                            onChange={(e) => handleUpdateInvoiceItem(idx, 'unitPrice', Number(e.target.value))}
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="R$ Unit."
                            className="px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] text-[11px] font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                      </div>
                    ))}

                    <button
                      onClick={handleAddInvoiceItem}
                      className="w-full py-2 rounded-xl border border-dashed border-emerald-300 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400 font-bold text-xs hover:bg-emerald-500/5 transition-colors flex items-center justify-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Adicionar Item
                    </button>
                  </div>

                  <button
                    onClick={handleConfirmImportInvoice}
                    className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    <span>IMPORTAR ITENS DIRETO AO ESTOQUE</span>
                  </button>
                </div>
              </div>
            )}
          </div>
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
