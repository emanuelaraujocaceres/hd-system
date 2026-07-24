import React, { useState, useRef } from 'react';
import {
  X,
  Camera,
  Package,
  FileText,
  Boxes,
  Sparkles,
  Check,
  RefreshCw,
  Upload,
  AlertCircle,
  Building2,
  DollarSign,
  Barcode,
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
  if (!isOpen) return null;

  const [scanType, setScanType] = useState<'product' | 'invoice'>('product');
  const [productMode, setProductMode] = useState<'unit' | 'box'>('box');

  const [isScanning, setIsScanning] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  // Results
  const [scannedProductResult, setScannedProductResult] = useState<any | null>(null);
  const [scannedInvoiceResult, setScannedInvoiceResult] = useState<any | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleStartCamera = async () => {
    try {
      setCapturedImage(null);
      setScannedProductResult(null);
      setScannedInvoiceResult(null);

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
        processImageWithAI(dataUrl);
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
          processImageWithAI(dataUrl);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const processImageWithAI = async (dataUrl: string) => {
    setIsScanning(true);
    posAudio.chime();

    try {
      const endpoint = scanType === 'product' ? '/api/ai/scan-product' : '/api/ai/scan-invoice';
      const bodyPayload =
        scanType === 'product'
          ? { imageBase64: dataUrl, mode: productMode }
          : { imageBase64: dataUrl };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      });

      const data = await res.json();
      if (data.result) {
        if (scanType === 'product') {
          setScannedProductResult(data.result);
        } else {
          setScannedInvoiceResult(data.result);
        }
        posAudio.chime();
      }
    } catch (err) {
      console.error('Erro na análise da foto:', err);
    } finally {
      setIsScanning(false);
    }
  };

  const handleConfirmAddProduct = () => {
    if (!scannedProductResult) return;

    const isBox = scannedProductResult.isBox || productMode === 'box';
    const boxQty = scannedProductResult.boxQuantity || 12;

    const newProd: Product = {
      id: `prod-${Date.now()}`,
      name: scannedProductResult.name || 'Produto Escaneado Câmera',
      barcode: scannedProductResult.barcode || `${Math.floor(7890000000000 + Math.random() * 999999999)}`,
      sku: `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
      category: scannedProductResult.category || 'Geral',
      unit: isBox ? 'cx' : 'un',
      costPrice: scannedProductResult.costPrice || 10.0,
      salePrice: scannedProductResult.price || 15.0,
      currentStock: isBox ? boxQty : 1,
      minStock: 5,
      maxStock: 100,
      imageUrl:
        'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&q=80',
      active: true,
      updatedAt: new Date().toISOString(),
    };

    storageService.saveProduct(newProd);

    // Record stock movement log
    const reasonText = isBox
      ? `Entrada Câmera: Caixa Atacado (${boxQty}un) - Filial ${currentBranch?.name || 'Matriz'}`
      : `Entrada Câmera: Reconhecimento de Embalagem - Filial ${currentBranch?.name || 'Matriz'}`;

    storageService.updateStock(newProd.id, 0, reasonText, 'Câmera IA HD-System');

    posAudio.chime();
    if (onProductsImported) onProductsImported();
    onClose();
  };

  const handleConfirmImportInvoice = () => {
    if (!scannedInvoiceResult || !scannedInvoiceResult.items) return;

    scannedInvoiceResult.items.forEach((item: any, idx: number) => {
      const newProd: Product = {
        id: `prod-inv-${Date.now()}-${idx}`,
        name: item.name,
        barcode: item.barcode || `${Math.floor(7890000000000 + Math.random() * 999999999)}`,
        sku: `NF-${item.barcode?.slice(-4) || idx}`,
        category: item.category || 'Geral',
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
      };

      storageService.saveProduct(newProd);

      const reasonText = `Importação Nota Fiscal ${scannedInvoiceResult.invoiceNumber} - Fornecedor ${scannedInvoiceResult.supplierName}`;
      storageService.updateStock(newProd.id, 0, reasonText, 'Leitor NF Câmera');
    });

    posAudio.chime();
    if (onProductsImported) onProductsImported();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-[#27272a] flex items-center justify-between bg-slate-50 dark:bg-[#09090b]/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <Camera className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Scanner Visual por Câmera</span>
                <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-extrabold uppercase">
                  Visão IA
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Adicione produtos, caixas em atacado ou leia folhas de notas fiscais pela câmera
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
                setScannedProductResult(null);
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
                setScannedInvoiceResult(null);
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
                    A IA lê o código de barras, nome na embalagem, itens da nota e inclui direto no estoque da filial selecionada.
                  </p>
                </div>

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

            {/* Live Camera Feed */}
            {cameraStream && !capturedImage && (
              <div className="space-y-3">
                <div className="w-full aspect-video bg-black rounded-2xl overflow-hidden border border-slate-800 relative flex items-center justify-center">
                  <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
                  <canvas ref={canvasRef} className="hidden" />
                  <div className="absolute inset-6 border-2 border-dashed border-white/50 rounded-2xl pointer-events-none flex items-center justify-center">
                    <span className="text-[10px] text-white/90 bg-black/60 px-3 py-1 rounded-full font-mono font-bold">
                      {scanType === 'product' ? 'Enquadre a Caixa/Embalagem ou Código' : 'Enquadre a Nota Fiscal em Papel'}
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
                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-lg flex items-center justify-center gap-2"
                  >
                    <Camera className="w-4 h-4" />
                    <span>CAPTURAR E ANALISAR FOTO</span>
                  </button>
                </div>
              </div>
            )}

            {/* Captured Image Preview & AI Loading */}
            {capturedImage && (
              <div className="space-y-4">
                <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-[#27272a] max-h-48 bg-slate-900 flex items-center justify-center">
                  <img src={capturedImage} alt="Foto Capturada" className="w-full h-48 object-cover opacity-80" />
                  {isScanning && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center text-white space-y-2">
                      <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
                      <span className="text-xs font-bold flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-amber-400" />
                        Analisando com Visão Computacional IA...
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      setCapturedImage(null);
                      setScannedProductResult(null);
                      setScannedInvoiceResult(null);
                      handleStartCamera();
                    }}
                    className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Tirar outra foto
                  </button>
                </div>
              </div>
            )}

            {/* PRODUCT SCAN RESULT PREVIEW */}
            {scannedProductResult && (
              <div className="p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/20 space-y-3 animate-fadeIn">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider flex items-center gap-1">
                    <Check className="w-4 h-4" /> Producto Detectado com Sucesso!
                  </span>
                  {scannedProductResult.isBox && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 text-[10px] font-extrabold">
                      CAIXA ATACADO ({scannedProductResult.boxQuantity} UNIDADES)
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px] font-bold">NOME / EMBALAGEM</span>
                    <span className="font-bold text-slate-900 dark:text-white">{scannedProductResult.name}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] font-bold">CÓDIGO DE BARRAS</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white flex items-center gap-1">
                      <Barcode className="w-3.5 h-3.5 text-slate-400" />
                      {scannedProductResult.barcode}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] font-bold">PREÇO DE CUSTO EST.</span>
                    <span className="font-bold text-slate-900 dark:text-white">R$ {scannedProductResult.costPrice.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] font-bold">PREÇO DE VENDA SUGERIDO</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">R$ {scannedProductResult.price.toFixed(2)}</span>
                  </div>
                </div>

                <button
                  onClick={handleConfirmAddProduct}
                  className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-lg transition-colors flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>DAR ENTRADA NO ESTOQUE DA FILIAL</span>
                </button>
              </div>
            )}

            {/* INVOICE SCAN RESULT PREVIEW */}
            {scannedInvoiceResult && scannedInvoiceResult.items && (
              <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 space-y-3 animate-fadeIn">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                    <Check className="w-4 h-4" /> Nota Fiscal Reconhecida!
                  </span>
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    Total: R$ {scannedInvoiceResult.totalAmount.toFixed(2)}
                  </span>
                </div>

                <div className="text-xs space-y-1">
                  <p className="font-bold text-slate-900 dark:text-white">
                    Fornecedor: {scannedInvoiceResult.supplierName} ({scannedInvoiceResult.invoiceNumber})
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {scannedInvoiceResult.items.length} itens extraídos para inclusão direta no estoque:
                  </p>
                </div>

                <div className="max-h-40 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-[#18181b]">
                  {scannedInvoiceResult.items.map((item: any, idx: number) => (
                    <div key={idx} className="p-2 flex items-center justify-between text-[11px]">
                      <div>
                        <span className="font-bold text-slate-900 dark:text-white block">{item.name}</span>
                        <span className="text-slate-400 font-mono">EAN: {item.barcode}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-slate-900 dark:text-white block">{item.quantity} un x R$ {item.unitPrice.toFixed(2)}</span>
                        <span className="text-emerald-600 font-bold">R$ {item.totalPrice.toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleConfirmImportInvoice}
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-lg transition-colors flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>IMPORTAR {scannedInvoiceResult.items.length} ITENS DIRETO AO ESTOQUE</span>
                </button>
              </div>
            )}
          </div>
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
