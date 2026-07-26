import React, { useState, useRef, useEffect } from 'react';
import {
  Package,
  Plus,
  Search,
  Barcode,
  Edit2,
  Trash2,
  AlertTriangle,
  ArrowDownUp,
  X,
  Check,
  Tag,
  DollarSign,
  Boxes,
  Upload,
  Camera,
  Globe,
  Image as ImageIcon,
  Sparkles,
  RefreshCw,
  Tv,
} from 'lucide-react';
import { Product, Category, Supplier, StockMovement, UserProfile, SystemSettings } from '../../types';
import { storageService } from '../../services/storageService';
import { posAudio } from '../../services/audioService';
import { BarcodeLabelModal } from './BarcodeLabelModal';
import { CategoryManagerModal } from './CategoryManagerModal';
import { StockCameraScannerModal } from './StockCameraScannerModal';

interface InventoryViewProps {
  products: Product[];
  categories: Category[];
  suppliers: Supplier[];
  settings: SystemSettings;
  user: UserProfile;
  initialBarcode?: string | null;
  onClearInitialBarcode?: () => void;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  products,
  categories,
  suppliers,
  settings,
  user,
  initialBarcode,
  onClearInitialBarcode,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all');

  // Modals state
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [stockTargetProduct, setStockTargetProduct] = useState<Product | null>(null);
  const [stockDelta, setStockDelta] = useState<number>(10);
  const [stockReason, setStockReason] = useState<string>('Entrada de Nota de Fornecedor');
  const [stockBarcodeSearch, setStockBarcodeSearch] = useState('');
  const stockBarcodeFileRef = useRef<HTMLInputElement | null>(null);

  const [isBarcodeModalOpen, setIsBarcodeModalOpen] = useState(false);
  const [barcodeTargetProduct, setBarcodeTargetProduct] = useState<Product | null>(null);

  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isStockCameraModalOpen, setIsStockCameraModalOpen] = useState(false);

  // Camera & Image Search state
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [isSearchingImages, setIsSearchingImages] = useState(false);
  const [imageSuggestions, setImageSuggestions] = useState<string[]>([]);
  const [showManualUrlInput, setShowManualUrlInput] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Product Form state
  const [formName, setFormName] = useState('');
  const [formBarcode, setFormBarcode] = useState('');
  const [formCategory, setFormCategory] = useState('Geral');
  const [formUnit, setFormUnit] = useState<'un' | 'kg' | 'cx' | 'lit' | 'm'>('un');
  const [formCostPrice, setFormCostPrice] = useState('');
  const [formSalePrice, setFormSalePrice] = useState('');
  const [formCurrentStock, setFormCurrentStock] = useState('');
  const [formMinStock, setFormMinStock] = useState('');
  const [formMaxStock, setFormMaxStock] = useState('');
  const [formImageUrl, setFormImageUrl] = useState('');
  const [formShowOnTV, setFormShowOnTV] = useState(false);
  const [formTvPromoPrice, setFormTvPromoPrice] = useState('');
  const [formTvHighlightTag, setFormTvHighlightTag] = useState('');

  // Auto-open product modal when navigating from scanner with a barcode
  useEffect(() => {
    if (initialBarcode) {
      setEditingProduct(null);
      setFormName('');
      setFormBarcode(initialBarcode);
      setFormCategory(categories[0]?.name || 'Geral');
      setFormUnit('un');
      setFormCostPrice('');
      setFormSalePrice('');
      setFormCurrentStock('');
      setFormMinStock('');
      setFormMaxStock('');
      setFormImageUrl('');
      setFormShowOnTV(false);
      setFormTvPromoPrice('');
      setFormTvHighlightTag('');
      setImageSuggestions([]);
      setIsSearchingImages(false);
      setIsProductModalOpen(true);
      if (onClearInitialBarcode) onClearInitialBarcode();
    }
  }, [initialBarcode]);

  // Camera handlers
  const handleStartLiveCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      setCameraStream(stream);
      setIsCameraModalOpen(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 200);
    } catch (err) {
      console.warn('Câmera direta indisponível ou permissão negada, abrindo seletor de foto:', err);
      if (fileInputRef.current) {
        fileInputRef.current.click();
      }
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
        setFormImageUrl(dataUrl);
        posAudio.chime();
      }
    }
    handleStopCamera();
  };

  const handleStopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
    setIsCameraModalOpen(false);
  };

  const handleNativeFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setFormImageUrl(event.target.result as string);
          posAudio.chime();
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Google / Unsplash Auto Search
  const handleAutoSearchImage = () => {
    setIsSearchingImages(true);
    const term = (formName || formCategory || 'produto').toLowerCase();

    const presetMap: Record<string, string[]> = {
      coca: [
        'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=400&q=80',
        'https://images.unsplash.com/photo-1554866585-cd94860890b7?w=400&q=80',
        'https://images.unsplash.com/photo-1629203851122-3726ecdf080e?w=400&q=80',
      ],
      cerveja: [
        'https://images.unsplash.com/photo-1608270586620-248524c67de9?w=400&q=80',
        'https://images.unsplash.com/photo-1535958636474-b021ee887b13?w=400&q=80',
        'https://images.unsplash.com/photo-1571613316887-6f8d5cbf7ef7?w=400&q=80',
      ],
      cafe: [
        'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=400&q=80',
        'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=400&q=80',
      ],
      bebida: [
        'https://images.unsplash.com/photo-1527661591475-527312dd65f5?w=400&q=80',
        'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=400&q=80',
      ],
      chocolate: [
        'https://images.unsplash.com/photo-1541781774459-bb2af2f05b55?w=400&q=80',
        'https://images.unsplash.com/photo-1511381939415-e44015466834?w=400&q=80',
      ],
      snack: [
        'https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=400&q=80',
        'https://images.unsplash.com/photo-1599490659213-e2b9527bd087?w=400&q=80',
      ]
    };

    let found: string[] = [];
    for (const [key, imgs] of Object.entries(presetMap)) {
      if (term.includes(key)) {
        found = imgs;
        break;
      }
    }

    if (found.length === 0) {
      found = [
        'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=400&q=80',
        'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400&q=80',
        'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&q=80',
        'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&q=80',
      ];
    }

    setTimeout(() => {
      setImageSuggestions(found);
      setIsSearchingImages(false);
      if (found[0]) {
        setFormImageUrl(found[0]);
        posAudio.chime();
      }
    }, 500);
  };

  const openNewProductModal = () => {
    setEditingProduct(null);
    setFormName('');
    setFormBarcode(`789${Math.floor(1000000000 + Math.random() * 9000000000)}`);
    setFormCategory(categories[0]?.name || 'Geral');
    setFormUnit('un');
    setFormCostPrice('');
    setFormSalePrice('');
    setFormCurrentStock('');
    setFormMinStock('');
    setFormMaxStock('');
    setFormImageUrl('');
    setFormShowOnTV(false);
    setFormTvPromoPrice('');
    setFormTvHighlightTag('');
    setIsProductModalOpen(true);
  };

  const openEditProductModal = (product: Product) => {
    setEditingProduct(product);
    setFormName(product.name);
    setFormBarcode(product.barcode);
    setFormCategory(product.category);
    setFormUnit(product.unit);
    setFormCostPrice(String(product.costPrice));
    setFormSalePrice(String(product.salePrice));
    setFormCurrentStock(String(product.currentStock));
    setFormMinStock(String(product.minStock));
    setFormMaxStock(String(product.maxStock));
    setFormImageUrl(product.imageUrl);
    setFormShowOnTV(product.showOnTV || false);
    setFormTvPromoPrice(String(product.tvPromoPrice || ''));
    setFormTvHighlightTag(product.tvHighlightTag || '');
    setIsProductModalOpen(true);
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    const newProd: Product = {
      id: editingProduct ? editingProduct.id : `prod-${Date.now()}`,
      barcode: formBarcode,
      name: formName,
      category: formCategory,
      unit: formUnit,
      costPrice: parseFloat(formCostPrice) || 0,
      salePrice: parseFloat(formSalePrice) || 0,
      currentStock: parseInt(formCurrentStock) || 0,
      minStock: parseInt(formMinStock) || 0,
      maxStock: parseInt(formMaxStock) || 100,
      imageUrl: formImageUrl || 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=300&auto=format&fit=crop&q=80',
      active: true,
      updatedAt: new Date().toISOString(),
      storeBranchId: user.storeBranchId,
      showOnTV: formShowOnTV,
      tvPromoPrice: formShowOnTV && formTvPromoPrice ? parseFloat(formTvPromoPrice) || undefined : undefined,
      tvHighlightTag: formShowOnTV && formTvHighlightTag ? formTvHighlightTag : undefined,
    };

    storageService.saveProduct(newProd);
    posAudio.chime();
    setIsProductModalOpen(false);
  };

  const handleDeleteProduct = (id: string) => {
    if (confirm('Tem certeza que deseja excluir este produto do estoque?')) {
      storageService.deleteProduct(id);
      posAudio.click();
    }
  };

  const handleApplyStockAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    if (stockTargetProduct) {
      storageService.updateStock(stockTargetProduct.id, stockDelta, stockReason, user.name);
      posAudio.chime();
      setIsStockModalOpen(false);
    }
  };

  // Filtered list
  const filteredProducts = products.filter((p) => {
    const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;
    const term = searchTerm.toLowerCase().trim();
    const matchesSearch =
      !term ||
      p.name.toLowerCase().includes(term) ||
      p.barcode.includes(term);

    let matchesStock = true;
    if (stockFilter === 'low') matchesStock = p.currentStock <= p.minStock && p.currentStock > 0;
    if (stockFilter === 'out') matchesStock = p.currentStock === 0;

    return matchesCategory && matchesSearch && matchesStock;
  });

  return (
    <div className="p-3 sm:p-4 md:p-6 max-w-7xl mx-auto space-y-4 sm:space-y-6">
      {/* Top Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Package className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            Catálogo & Gestão de Estoque
          </h2>
          <p className="text-xs text-slate-500">
            Total de <span className="font-bold text-slate-900 dark:text-white">{products.length}</span> produtos cadastrados
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => setIsStockCameraModalOpen(true)}
            className="px-3.5 py-2.5 rounded-xl bg-indigo-600/10 border border-indigo-500/30 text-indigo-600 dark:text-indigo-400 font-bold text-xs hover:bg-indigo-600/20 transition-all flex items-center gap-2 shadow-sm"
            title="Entrada de Produtos, Caixas ou Nota Fiscal via Câmera"
          >
            <Camera className="w-4 h-4" />
            <span>Entrada por Câmera / NF</span>
          </button>

          <button
            onClick={() => setIsCategoryModalOpen(true)}
            className="px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-200 dark:hover:bg-[#27272a] transition-all flex items-center gap-1.5 shadow-sm"
          >
            <Tag className="w-4 h-4 text-indigo-500" />
            <span>Categorias</span>
          </button>

          <button
            onClick={openNewProductModal}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Cadastrar Produto</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 text-slate-400 dark:text-[#71717a] absolute left-3.5 top-3 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nome ou código de barras..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 dark:text-[#a1a1aa] outline-none cursor-pointer"
            >
              <option value="all">Todas as Categorias</option>
              {categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>

            <select
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value as any)}
              className="bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 dark:text-[#a1a1aa] outline-none cursor-pointer"
            >
              <option value="all">Todos os Níveis de Estoque</option>
              <option value="low">Apenas Estoque Baixo</option>
              <option value="out">Esgotados (Zero)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Products Table — Desktop (md+) */}
      <div className="hidden md:block bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-[#09090b]/80 border-b border-slate-200 dark:border-[#27272a] text-slate-500 dark:text-[#71717a] font-bold uppercase tracking-wider">
                <th className="py-3.5 px-4">Produto</th>
                <th className="py-3.5 px-4 hidden md:table-cell">Código / EAN</th>
                <th className="py-3.5 px-4 hidden sm:table-cell">Categoria</th>
                <th className="py-3.5 px-4 hidden lg:table-cell">Preço Custo</th>
                <th className="py-3.5 px-4">Preço Venda</th>
                <th className="py-3.5 px-4 hidden md:table-cell">Margem %</th>
                <th className="py-3.5 px-4">Estoque</th>
                <th className="py-3.5 px-4 hidden lg:table-cell">TV</th>
                <th className="py-3.5 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#27272a]">
              {filteredProducts.map((p) => {
                const margin = p.salePrice > 0 ? ((p.salePrice - p.costPrice) / p.salePrice) * 100 : 0;
                const isLow = p.currentStock <= p.minStock;
                const isOut = p.currentStock === 0;

                return (
                  <tr key={p.id} className="hover:bg-slate-50/80 dark:hover:bg-[#27272a]/30 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={p.imageUrl}
                          alt={p.name}
                          className="w-10 h-10 rounded-xl object-cover bg-slate-100 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a]"
                        />
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white">{p.name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 hidden md:table-cell font-mono text-slate-600 dark:text-[#a1a1aa]">
                      {p.barcode}
                    </td>
                    <td className="py-3 px-4 hidden sm:table-cell">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#09090b] font-semibold text-slate-700 dark:text-[#a1a1aa] text-[11px] border border-transparent dark:border-[#27272a]">
                        {p.category}
                      </span>
                    </td>
                    <td className="py-3 px-4 hidden lg:table-cell font-semibold text-slate-600 dark:text-[#a1a1aa]">
                      R$ {p.costPrice.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 font-bold text-emerald-600 dark:text-emerald-400">
                      R$ {p.salePrice.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 hidden md:table-cell font-bold text-indigo-600 dark:text-indigo-400">
                      {margin.toFixed(1)}%
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold text-[11px] ${
                          isOut
                            ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                            : isLow
                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                            : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {isLow && <AlertTriangle className="w-3 h-3" />}
                        {p.currentStock} {p.unit}
                      </span>
                    </td>
                    <td className="py-3 px-4 hidden lg:table-cell">
                      {p.showOnTV ? (
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold text-[10px] border border-amber-500/20 flex items-center gap-1">
                            <Tv className="w-3 h-3" />
                            OFERTA
                          </span>
                          {p.tvPromoPrice && p.tvPromoPrice > 0 && (
                            <span className="text-[10px] font-bold text-emerald-500">
                              R$ {p.tvPromoPrice.toFixed(2)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400 dark:text-[#52525b]">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => {
                            setStockTargetProduct(p);
                            setIsStockModalOpen(true);
                          }}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-[#27272a] transition-colors"
                          title="Ajustar / Registrar Entrada no Estoque"
                        >
                          <Boxes className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setBarcodeTargetProduct(p);
                            setIsBarcodeModalOpen(true);
                          }}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-[#27272a] transition-colors"
                          title="Gerar Folha de Etiquetas"
                        >
                          <Barcode className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEditProductModal(p)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-[#27272a] transition-colors"
                          title="Editar Cadastro"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteProduct(p.id)}
                          className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 transition-colors"
                          title="Excluir Produto"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Products Cards — Mobile (below md) */}
      <div className="block md:hidden space-y-3">
        {filteredProducts.map((p) => {
          const isLow = p.currentStock <= p.minStock;
          const isOut = p.currentStock === 0;

          return (
            <div
              key={p.id}
              className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-2xl shadow-sm p-3.5 space-y-3"
            >
              {/* Top row: image + product info */}
              <div className="flex items-start gap-3">
                <img
                  src={p.imageUrl}
                  alt={p.name}
                  className="w-14 h-14 rounded-xl object-cover bg-slate-100 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-slate-900 dark:text-white truncate">{p.name}</p>
                  <span className="inline-block mt-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#09090b] font-semibold text-slate-700 dark:text-[#a1a1aa] text-[10px] border border-transparent dark:border-[#27272a]">
                    {p.category}
                  </span>
                </div>
              </div>

              {/* Info row: price + stock */}
              <div className="flex items-center justify-between">
                <p className="font-bold text-sm text-emerald-600 dark:text-emerald-400">
                  R$ {p.salePrice.toFixed(2)}
                </p>
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold text-[11px] ${
                    isOut
                      ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                      : isLow
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                      : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {isLow && <AlertTriangle className="w-3 h-3" />}
                  {p.currentStock} {p.unit}
                </span>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 pt-1 border-t border-slate-100 dark:border-[#27272a]">
                <button
                  onClick={() => {
                    setStockTargetProduct(p);
                    setIsStockModalOpen(true);
                  }}
                  className="flex-1 py-2 rounded-xl text-[11px] font-bold text-slate-600 dark:text-[#a1a1aa] bg-slate-100 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] hover:bg-slate-200 dark:hover:bg-[#27272a] transition-colors flex items-center justify-center gap-1.5"
                  title="Ajustar / Registrar Entrada no Estoque"
                >
                  <Boxes className="w-3.5 h-3.5" />
                  Estoque
                </button>
                <button
                  onClick={() => {
                    setBarcodeTargetProduct(p);
                    setIsBarcodeModalOpen(true);
                  }}
                  className="flex-1 py-2 rounded-xl text-[11px] font-bold text-slate-600 dark:text-[#a1a1aa] bg-slate-100 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] hover:bg-slate-200 dark:hover:bg-[#27272a] transition-colors flex items-center justify-center gap-1.5"
                  title="Gerar Folha de Etiquetas"
                >
                  <Barcode className="w-3.5 h-3.5" />
                  Etiqueta
                </button>
                <button
                  onClick={() => openEditProductModal(p)}
                  className="flex-1 py-2 rounded-xl text-[11px] font-bold text-slate-600 dark:text-[#a1a1aa] bg-slate-100 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] hover:bg-slate-200 dark:hover:bg-[#27272a] transition-colors flex items-center justify-center gap-1.5"
                  title="Editar Cadastro"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  Editar
                </button>
                <button
                  onClick={() => handleDeleteProduct(p.id)}
                  className="py-2 px-3 rounded-xl text-rose-500 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 transition-colors flex items-center justify-center"
                  title="Excluir Produto"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}

        {filteredProducts.length === 0 && (
          <div className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-2xl shadow-sm p-8 text-center">
            <p className="text-sm text-slate-400 dark:text-[#71717a] font-semibold">Nenhum produto encontrado</p>
          </div>
        )}
      </div>

      {/* CREATE / EDIT PRODUCT MODAL */}
      {isProductModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-[#27272a] flex items-center justify-between bg-slate-50 dark:bg-[#09090b]/50">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {editingProduct ? 'Editar Produto' : 'Cadastrar Novo Produto'}
              </h3>
              <button onClick={() => setIsProductModalOpen(false)}>
                <X className="w-5 h-5 text-slate-400 hover:text-slate-200" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="p-6 overflow-y-auto space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-[#a1a1aa] mb-1">
                  Nome do Produto
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ex: Coca-Cola 2L Zero Sugar"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-[#a1a1aa] mb-1">
                    Código de Barras (EAN-13)
                  </label>
                  <input
                    type="text"
                    required
                    value={formBarcode}
                    onChange={(e) => setFormBarcode(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-mono text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-[#a1a1aa] mb-1">
                    Categoria
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white outline-none"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-[#a1a1aa] mb-1">
                    Unidade de Medida
                  </label>
                  <select
                    value={formUnit}
                    onChange={(e) => setFormUnit(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white outline-none"
                  >
                    <option value="un">Unidade (un)</option>
                    <option value="kg">Quilograma (kg)</option>
                    <option value="cx">Caixa (cx)</option>
                    <option value="lit">Litro (lit)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-[#a1a1aa] mb-1">
                    Preço de Custo (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formCostPrice}
                    onChange={(e) => setFormCostPrice(e.target.value)}
                    placeholder="Ex: 5.90"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-bold text-slate-900 dark:text-white outline-none placeholder:text-slate-300 dark:placeholder:text-[#3f3f46]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-[#a1a1aa] mb-1">
                    Preço de Venda (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formSalePrice}
                    onChange={(e) => setFormSalePrice(e.target.value)}
                    placeholder="Ex: 9.90"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-bold text-emerald-600 dark:text-emerald-400 outline-none placeholder:text-slate-300 dark:placeholder:text-[#3f3f46]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-[#a1a1aa] mb-1">
                    Estoque Inicial
                  </label>
                  <input
                    type="number"
                    required
                    value={formCurrentStock}
                    onChange={(e) => setFormCurrentStock(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-bold text-slate-900 dark:text-white outline-none placeholder:text-slate-300 dark:placeholder:text-[#3f3f46]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-[#a1a1aa] mb-1">
                    Estoque Mínimo
                  </label>
                  <input
                    type="number"
                    required
                    value={formMinStock}
                    onChange={(e) => setFormMinStock(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs text-slate-900 dark:text-white outline-none placeholder:text-slate-300 dark:placeholder:text-[#3f3f46]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-[#a1a1aa] mb-1">
                    Estoque Máximo
                  </label>
                  <input
                    type="number"
                    required
                    value={formMaxStock}
                    onChange={(e) => setFormMaxStock(e.target.value)}
                    placeholder="100"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs text-slate-900 dark:text-white outline-none placeholder:text-slate-300 dark:placeholder:text-[#3f3f46]"
                  />
                </div>
              </div>

              {/* Product Photo Management */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] space-y-3">
                <label className="block text-xs font-bold text-slate-700 dark:text-[#a1a1aa]">
                  Foto do Produto
                </label>

                <div className="flex flex-col sm:flex-row items-center gap-3">
                  {/* Current Selected Image Preview */}
                  <div className="w-20 h-20 rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] overflow-hidden shrink-0 shadow-sm flex items-center justify-center relative group">
                    {formImageUrl ? (
                      <img
                        src={formImageUrl}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-slate-400" />
                    )}
                  </div>

                  {/* Camera & Search Action Buttons */}
                  <div className="flex-1 space-y-2 w-full">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {/* Camera Button */}
                      <button
                        type="button"
                        onClick={handleStartLiveCamera}
                        className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors flex items-center justify-center gap-2 shadow-sm"
                      >
                        <Camera className="w-4 h-4" />
                        <span>Tirar Foto (Câmera)</span>
                      </button>

                      {/* Google / Web Auto-Search Button */}
                      <button
                        type="button"
                        onClick={handleAutoSearchImage}
                        disabled={isSearchingImages}
                        className="px-3 py-2 rounded-xl bg-slate-200 dark:bg-[#18181b] border border-slate-300 dark:border-[#27272a] hover:bg-slate-300 dark:hover:bg-[#27272a] text-slate-800 dark:text-slate-200 font-bold text-xs transition-colors flex items-center justify-center gap-2"
                      >
                        {isSearchingImages ? (
                          <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
                        ) : (
                          <Globe className="w-4 h-4 text-indigo-500" />
                        )}
                        <span>Buscar Imagem no Google</span>
                      </button>
                    </div>

                    {/* Hidden Native File Input for Mobile Browser Capture */}
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="image/*"
                      capture="environment"
                      onChange={handleNativeFileSelect}
                      className="hidden"
                    />

                    <div className="flex items-center justify-between text-[11px]">
                      <button
                        type="button"
                        onClick={() => setShowManualUrlInput(!showManualUrlInput)}
                        className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
                      >
                        {showManualUrlInput ? 'Ocultar URL Manual' : 'Inserir URL Manualmente'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Auto Search Gallery Suggestions */}
                {imageSuggestions.length > 0 && (
                  <div className="space-y-1.5 pt-1 border-t border-slate-200 dark:border-[#27272a]">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-amber-500" />
                      Sugestões Encontradas (Clique para escolher):
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {imageSuggestions.map((img, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setFormImageUrl(img);
                            posAudio.click();
                          }}
                          className={`h-14 rounded-lg overflow-hidden border-2 transition-all ${
                            formImageUrl === img
                              ? 'border-indigo-600 ring-2 ring-indigo-500/30'
                              : 'border-transparent hover:border-slate-300'
                          }`}
                        >
                          <img src={img} alt={`Opção ${idx}`} className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Manual URL Input Field (Collapsible) */}
                {showManualUrlInput && (
                  <input
                    type="url"
                    value={formImageUrl}
                    onChange={(e) => setFormImageUrl(e.target.value)}
                    placeholder="https://images.unsplash.com/..."
                    className="w-full px-3 py-1.5 bg-white dark:bg-[#18181b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs text-slate-900 dark:text-white outline-none"
                  />
                )}
              </div>

              {/* ─── OFERTAS / TV ─── */}
              <div className="pt-3 border-t border-slate-200 dark:border-[#27272a] space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded bg-amber-500/20 flex items-center justify-center">
                    <Tv className="w-3 h-3 text-amber-500" />
                  </div>
                  <h4 className="text-[10px] uppercase tracking-widest font-bold text-slate-500 dark:text-[#71717a]">
                    Ofertas / TV
                  </h4>
                </div>

                {/* Exibir na TV checkbox */}
                <label className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 cursor-pointer hover:bg-amber-500/10 transition-colors">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={formShowOnTV}
                      onChange={(e) => {
                        setFormShowOnTV(e.target.checked);
                        posAudio.click();
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5 rounded-full bg-slate-300 dark:bg-[#27272a] peer-checked:bg-amber-500 transition-colors" />
                    <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-md transition-transform peer-checked:translate-x-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">Exibir nas Ofertas / TV</p>
                    <p className="text-[10px] text-slate-500 dark:text-[#71717a]">Produto aparecerá na página de ofertas (TV)</p>
                  </div>
                </label>

                {/* Conditional TV fields */}
                {formShowOnTV && (
                  <div className="space-y-3 pl-1 animate-in slide-in-from-top-2 duration-200">
                    {/* Promo Price */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-[#a1a1aa] mb-1">
                        Preço de Oferta (R$)
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-amber-500">R$</span>
                        <input
                          type="number"
                          step="0.01"
                          value={formTvPromoPrice}
                          onChange={(e) => setFormTvPromoPrice(e.target.value)}
                          className="w-full pl-10 pr-3 py-2 bg-white dark:bg-[#18181b] border border-amber-500/30 rounded-xl text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500"
                          placeholder="0.00"
                        />
                      </div>
                      {formTvPromoPrice > 0 && formSalePrice > 0 && formTvPromoPrice < formSalePrice && (
                        <p className="mt-1 text-[10px] font-bold text-emerald-500 flex items-center gap-1">
                          <Sparkles className="w-3 h-3" />
                          Economia de R$ {(formSalePrice - formTvPromoPrice).toFixed(2)} ({Math.round(((formSalePrice - formTvPromoPrice) / formSalePrice) * 100)}% OFF)
                        </p>
                      )}
                    </div>

                    {/* Highlight Tag */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-[#a1a1aa] mb-1">
                        Tag de Destaque (opcional)
                      </label>
                      <input
                        type="text"
                        value={formTvHighlightTag}
                        onChange={(e) => setFormTvHighlightTag(e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-[#18181b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-medium text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500"
                        placeholder="Ex: OFERTA IMPERDÍVEL, COMBO, LEVE 3 PAGUE 2"
                      />
                      <p className="mt-1 text-[10px] text-slate-400 dark:text-[#52525b]">
                        Badge animado que aparece no canto do produto na TV
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-[#27272a] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsProductModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-[#27272a] text-xs font-bold text-slate-700 dark:text-[#a1a1aa] hover:bg-slate-100 dark:hover:bg-[#27272a]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md"
                >
                  Salvar Produto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* STOCK ADJUSTMENT MODAL */}
      {isStockModalOpen && stockTargetProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Ajuste / Entrada de Estoque: {stockTargetProduct.name}
            </h3>

            {/* Barcode Search for Quick Stock Entry */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-[#a1a1aa]">
                Buscar Produto por Código de Barras:
              </label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Barcode className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={stockBarcodeSearch}
                    onChange={(e) => {
                      const val = e.target.value;
                      setStockBarcodeSearch(val);
                      if (val.trim()) {
                        const found = products.find(p => p.barcode === val.trim());
                        if (found) {
                          setStockTargetProduct(found);
                        }
                      }
                    }}
                    placeholder="Digite ou escaneie o código de barras..."
                    className="w-full pl-10 pr-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-mono text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => stockBarcodeFileRef.current?.click()}
                  className="px-3 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-600 dark:text-indigo-400 text-xs font-bold hover:bg-indigo-500/20 transition-colors flex items-center gap-1"
                >
                  <Camera className="w-4 h-4" />
                  Ler Código
                </button>
                <input
                  type="file"
                  ref={stockBarcodeFileRef}
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => {
                    // Camera file input - user scans barcode from captured image
                  }}
                  className="hidden"
                />
              </div>
              {stockTargetProduct && (
                <div className="p-2 rounded-lg bg-indigo-500/5 border border-indigo-500/20 flex items-center gap-2 text-xs">
                  <img src={stockTargetProduct.imageUrl} alt="" className="w-8 h-8 rounded object-cover" />
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white">{stockTargetProduct.name}</p>
                    <p className="text-[10px] text-slate-400">Estoque atual: {stockTargetProduct.currentStock} {stockTargetProduct.unit}</p>
                  </div>
                </div>
              )}
            </div>

            <form onSubmit={handleApplyStockAdjustment} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1">Quantidade da Movimentação (+ ou -)</label>
                <input
                  type="number"
                  required
                  value={stockDelta}
                  onChange={(e) => setStockDelta(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl font-bold text-base"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Motivo do Lançamento</label>
                <input
                  type="text"
                  required
                  value={stockReason}
                  onChange={(e) => setStockReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsStockModalOpen(false)}
                  className="px-4 py-2 rounded-xl border font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 text-white font-bold"
                >
                  Confirmar Ajuste
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BARCODE PRINT MODAL */}
      <BarcodeLabelModal
        isOpen={isBarcodeModalOpen}
        onClose={() => setIsBarcodeModalOpen(false)}
        product={barcodeTargetProduct}
        settings={settings}
      />

      {/* CATEGORY MANAGEMENT MODAL */}
      <CategoryManagerModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        categories={categories}
      />

      {/* LIVE CAMERA VIEWFINDER MODAL */}
      {isCameraModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl p-4 space-y-4 text-white flex flex-col items-center">
            <div className="w-full flex items-center justify-between">
              <span className="text-xs font-bold flex items-center gap-2">
                <Camera className="w-4 h-4 text-indigo-400" />
                Câmera do Dispositivo - Foto do Produto
              </span>
              <button
                type="button"
                onClick={handleStopCamera}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Video Viewfinder */}
            <div className="w-full aspect-square bg-black rounded-2xl overflow-hidden border border-slate-800 relative flex items-center justify-center">
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <canvas ref={canvasRef} className="hidden" />
              <div className="absolute inset-4 border-2 border-dashed border-white/40 rounded-xl pointer-events-none flex items-center justify-center">
                <span className="text-[10px] text-white/70 bg-black/50 px-2 py-0.5 rounded font-mono">
                  Enquadre o produto
                </span>
              </div>
            </div>

            <div className="w-full flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleStopCamera}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCapturePhoto}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-lg flex items-center justify-center gap-2"
              >
                <Camera className="w-4 h-4" />
                <span>CAPTURAR FOTO</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* STOCK CAMERA SCANNER MODAL */}
      <StockCameraScannerModal
        isOpen={isStockCameraModalOpen}
        onClose={() => setIsStockCameraModalOpen(false)}
        onProductsImported={() => {
          // Trigger reactive updates
        }}
        onNavigateToNewProduct={(barcode) => {
          setIsStockCameraModalOpen(false);
          setEditingProduct(null);
          setFormName('');
          setFormBarcode(barcode);
          setFormCategory(categories[0]?.name || 'Geral');
          setFormUnit('un');
          setFormCostPrice('');
          setFormSalePrice('');
          setFormCurrentStock('');
          setFormMinStock('');
          setFormMaxStock('');
          setFormImageUrl('');
          setImageSuggestions([]);
          setIsSearchingImages(false);
          setIsProductModalOpen(true);
        }}
      />
    </div>
  );
};
