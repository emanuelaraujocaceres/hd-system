import React, { useState, useRef } from 'react';
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

  // Invoice form fields
  const [invSupplierName, setInvSupplierName] = useState('');
  const [invInvoiceNumber, setInvInvoiceNumber] = useState('');
  const [invItems, setInvItems] = useState<InvoiceFormItem[]>([
    { name: '', barcode: '', quantity: 1, unitPrice: 0 },
  ]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleStartCamera = async () => {
    try {
      setCapturedImage(null);

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
  };

  const resetInvoiceForm = () => {
    setInvSupplierName('');
    setInvInvoiceNumber('');
    setInvItems([{ name: '', barcode: '', quantity: 1, unitPrice: 0 }]);
  };

  const handleConfirmAddProduct = () => {
    const isBox = productMode === 'box';

    const newProd: Product = {
      id: `prod-${Date.now()}`,
      name: formName || 'Produto Escaneado Câmera',
      barcode: formBarcode || `${Math.floor(7890000000000 + Math.random() * 999999999)}`,
      sku: `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
      category: formCategory || 'Geral',
      unit: isBox ? 'cx' : 'un',
      costPrice: formCostPrice || 10.0,
      salePrice: formSalePrice || 15.0,
      currentStock: isBox ? formQty * 12 : formQty,
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
      ? `Entrada Câmera: Caixa Atacado (${formQty}cx) - Filial ${currentBranch?.name || 'Matriz'}`
      : `Entrada Câmera: ${formQty}un - Filial ${currentBranch?.name || 'Matriz'}`;

    storageService.updateStock(newProd.id, newProd.currentStock, reasonText, 'Câmera HD-System');

    posAudio.chime();
    if (onProductsImported) onProductsImported();
    onClose();
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
                  Manual
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
                    Tire uma foto e preencha os dados manualmente usando a imagem como referência.
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
                    Preencha os dados do produto (use a foto como referência):
                  </span>
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
                      placeholder="Quantidade"
                      className="px-3 py-2 rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

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
                  <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider flex items-center gap-1">
                    <FileText className="w-4 h-4" />
                    Preencha os dados da nota fiscal (use a foto como referência):
                  </span>

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
