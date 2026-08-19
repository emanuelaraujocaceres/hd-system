import React, { useState, useRef, useEffect } from 'react';
import { useDebounce } from '../../hooks/useDebounce';
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
  UtensilsCrossed,
} from 'lucide-react';
import { Product, Category, Supplier, StockMovement, UserProfile, SystemSettings, WholesaleOption } from '../../types';
import { storageService } from '../../services/storageService';
import { posAudio } from '../../services/audioService';
import { globalNotificationService } from '../../services/globalNotificationService';
import { useToast } from '../shared/Toast';
import { BarcodeLabelModal } from './BarcodeLabelModal';
import { CategoryManagerModal } from './CategoryManagerModal';
import { LotManagerModal } from './LotManagerModal';
import { StockCameraScannerModal } from './StockCameraScannerModal';
import { Skeleton, TableSkeleton } from '../shared/Skeleton';
import { BottomSheet } from '../shared/BottomSheet';
import { MoneyInput, parseBrlToNumber } from '../shared/MoneyInput';
import { friendlyErrorMessage } from '../../lib/friendlyError';
import { productSchema } from '../../validators/schemas';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { uploadProductImage } from '../../lib/supabase';
import { undoManager } from '../../lib/undoManager';

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
  const canCreateEdit = user.role === 'admin' || !!user.superadmin;
  // ============================================================
  // 1. TODOS OS useState PRIMEIRO
  // ============================================================
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all');
  const [quickFilter, setQuickFilter] = useState<'all' | 'cardapio' | 'tv'>('all');
  const [isSearching, setIsSearching] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [compactMode, setCompactMode] = useState(false);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [sortField, setSortField] = useState<string>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [highlightedProductId, setHighlightedProductId] = useState<string | null>(null);

  // Modals state
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [stockTargetProduct, setStockTargetProduct] = useState<Product | null>(null);
  const [stockDelta, setStockDelta] = useState<number>(10);
  const [stockReason, setStockReason] = useState<string>('Entrada de Nota de Fornecedor');
  const [stockBarcodeSearch, setStockBarcodeSearch] = useState('');
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
  const [formShowOnCardapio, setFormShowOnCardapio] = useState(false);
  const [formTvPromoPrice, setFormTvPromoPrice] = useState('');
  const [formTvHighlightTag, setFormTvHighlightTag] = useState('');
  // Venda no ATACADO (caixa/fardo): quantidade de unidades na caixa + valor da caixa
  const [formWholesaleEnabled, setFormWholesaleEnabled] = useState(false);
  const [formWholesaleOptions, setFormWholesaleOptions] = useState<{ boxQuantity: string; salePrice: string }[]>([
    { boxQuantity: '', salePrice: '' },
  ]);
  const [formExpirationDate, setFormExpirationDate] = useState('');
  const [formIsComposite, setFormIsComposite] = useState(false);
  const [formUseLots, setFormUseLots] = useState(false);

  // Estoque Inteligente: Inventário (ajuste com motivo)
  const [isInventoryModalOpen, setIsInventoryModalOpen] = useState(false);
  const [inventoryProduct, setInventoryProduct] = useState<Product | null>(null);
  const [inventoryCounted, setInventoryCounted] = useState('');
  const [inventoryReason, setInventoryReason] = useState('Contagem física (inventário)');

  // ============================================================
  // 2. TODOS OS useRef
  // ============================================================
  const firstInputRef = useRef<HTMLInputElement>(null);
  const stockBarcodeFileRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ============================================================
  // 3. useDebounce (custom hook)
  // ============================================================
  const debouncedSearch = useDebounce(searchTerm, 300);
  const { addToast } = useToast();

  // ============================================================
  // 4. TODOS OS useEffect
  // ============================================================
  useEffect(() => {
    if (isProductModalOpen && firstInputRef.current) {
      firstInputRef.current.focus();
    }
  }, [isProductModalOpen]);

  useEffect(() => {
    const handler = () => openNewProductModal();
    window.addEventListener('hd:new-product', handler);
    return () => window.removeEventListener('hd:new-product', handler);
  }, []);

  useEffect(() => {
    setIsSearching(true);
    const t = setTimeout(() => setIsSearching(false), 200);
    return () => clearTimeout(t);
  }, [debouncedSearch]);

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
      setFormExpirationDate('');
      setFormIsComposite(false);
      setFormUseLots(false);
      setImageSuggestions([]);
      setIsSearchingImages(false);
      setIsProductModalOpen(true);
      if (onClearInitialBarcode) onClearInitialBarcode();
    }
  }, [initialBarcode]);

  // ============================================================
  // 5. FUNÇÕES E HANDLERS
  // ============================================================

  // ✅ FUNÇÃO DE ORDENAÇÃO
  const handleSort = (field: string) => {
    setSortDir((prev) => (sortField === field ? (prev === 'asc' ? 'desc' : 'asc') : 'asc'));
    setSortField(field);
  };

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
      reader.onerror = () => {
        addToast('error', 'Erro ao ler o arquivo de imagem.');
      };
      reader.readAsDataURL(file);
    }
  };

  // Busca real de imagens por termo (Wikimedia Commons - aberto, sem chave, CORS liberado)
  const handleAutoSearchImage = async () => {
    setIsSearchingImages(true);
    const term = (formName || formCategory || 'produto').trim();

    // Presets como fallback caso a busca online falhe ou não retorne nada
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
      ],
    };

    const fallbackImages = (): string[] => {
      const lower = term.toLowerCase();
      for (const [key, imgs] of Object.entries(presetMap)) {
        if (lower.includes(key)) {
          return imgs;
        }
      }
      return [
        'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=400&q=80',
        'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400&q=80',
        'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&q=80',
        'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&q=80',
      ];
    };

    try {
      const url =
        'https://commons.wikimedia.org/w/api.php' +
        '?action=query&generator=search' +
        `&gsrsearch=${encodeURIComponent(term)}&gsrnamespace=6&gsrlimit=8` +
        '&prop=imageinfo&iiprop=url|mediatype&iiurlwidth=400&format=json&origin=*';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Busca de imagens indisponível');
      const data = await res.json();

      type PageInfo = { imageinfo?: { thumburl?: string; url?: string; mediatype?: string }[] };
      const pages: Record<string, PageInfo> = data?.query?.pages || {};
      const found = Object.values(pages)
        .filter((p) => p.imageinfo?.[0]?.mediatype === 'BITMAP')
        .map((p) => p.imageinfo?.[0]?.thumburl || p.imageinfo?.[0]?.url)
        .filter((u): u is string => !!u)
        .slice(0, 3);

      if (found.length > 0) {
        setImageSuggestions(found);
        setFormImageUrl(found[0]);
        posAudio.chime();
        return;
      }

      addToast('warning', `Nenhuma imagem encontrada para "${term}" — mostrando opções padrão.`);
    } catch {
      addToast('warning', 'Sem conexão com a busca de imagens — mostrando opções padrão.');
    } finally {
      const fallback = fallbackImages();
      setImageSuggestions(fallback);
      if (fallback[0]) {
        setFormImageUrl(fallback[0]);
        posAudio.chime();
      }
      setIsSearchingImages(false);
    }
  };

  const resetProductForm = (barcode?: string) => {
    setEditingProduct(null);
    setFormName('');
    setFormBarcode(barcode || '');
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
    setFormWholesaleEnabled(false);
    setFormWholesaleOptions([{ boxQuantity: '', salePrice: '' }]);
    setFormExpirationDate('');
    setFormIsComposite(false);
    setFormUseLots(false);
    setImageSuggestions([]);
    setIsSearchingImages(false);
  };

  const openNewProductModal = () => {
    resetProductForm();
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
    setFormImageUrl(product.imageUrl);
    setFormShowOnTV(product.showOnTV || false);
    setFormShowOnCardapio(product.showOnCardapio || false);
    setFormTvPromoPrice(String(product.tvPromoPrice || ''));
    setFormTvHighlightTag(product.tvHighlightTag || '');
    const existingWholesale = product.wholesaleOptions || [];
    setFormWholesaleEnabled(existingWholesale.length > 0);
    setFormWholesaleOptions(
      existingWholesale.length > 0
        ? existingWholesale.map((o) => ({ boxQuantity: String(o.boxQuantity), salePrice: String(o.salePrice) }))
        : [{ boxQuantity: '', salePrice: '' }]
    );
    setFormExpirationDate(product.expirationDate || '');
    setFormIsComposite(product.isComposite || false);
    setFormUseLots(product.useLots || false);
    setIsProductModalOpen(true);
  };

  const [savingProduct, setSavingProduct] = useState(false);

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();

    // Zod validation
    const result = productSchema.safeParse({
      name: formName,
      barcode: formBarcode,
      salePrice: parseBrlToNumber(formSalePrice),
      costPrice: parseBrlToNumber(formCostPrice),
      stockQuantity: parseInt(formCurrentStock) || 0,
      category: formCategory,
      unit: formUnit,
      minStock: parseInt(formMinStock) || 0,
      showOnCardapio: formShowOnCardapio,
    });

    if (!result.success) {
      const firstError = result.error.issues[0];
      addToast('error', firstError.message);
      return;
    }

    setSavingProduct(true);
    try {
      // Parse prices for product object
      const costPrice = parseBrlToNumber(formCostPrice);
      const salePrice = parseBrlToNumber(formSalePrice);

      // Upload image to Supabase Storage if it's a base64 data URL
      let finalImageUrl = formImageUrl || 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=300&auto=format&fit=crop&q=80';
      if (formImageUrl?.startsWith('data:image/')) {
        const tempId = editingProduct?.id || `prod-${Date.now()}`;
        finalImageUrl = await uploadProductImage(formImageUrl, tempId);
      }

      // Opções de atacado: só entram linhas com quantidade (mín. 2 un) e valor de caixa > 0
      const wholesaleOptions: WholesaleOption[] | undefined = formWholesaleEnabled
        ? formWholesaleOptions
            .map((line, idx) => ({
              id: `wh-${editingProduct?.id || 'prod'}-${idx}-${Date.now()}`,
              boxQuantity: Math.floor(Number(line.boxQuantity) || 0),
              salePrice: parseBrlToNumber(line.salePrice),
            }))
            .filter((o) => o.boxQuantity >= 2 && o.salePrice > 0)
        : undefined;

      const newProd: Product = {
        id: editingProduct ? editingProduct.id : `prod-${Date.now()}`,
        barcode: formBarcode,
        name: formName,
        category: formCategory,
        unit: formUnit,
        costPrice,
        salePrice,
        currentStock: parseInt(formCurrentStock) || 0,
minStock: parseInt(formMinStock) || 0,
        maxStock: parseInt(formMaxStock) || 0,
        imageUrl: finalImageUrl,
        active: true,
        updatedAt: new Date().toISOString(),
        storeBranchId: storageService.getSelectedBranchId() || user.storeBranchId,
        showOnTV: formShowOnTV,
        tvPromoPrice: formTvPromoPrice ? parseBrlToNumber(formTvPromoPrice) || undefined : undefined,
        showOnCardapio: formShowOnCardapio,
        tvHighlightTag: formTvHighlightTag || undefined,
        wholesaleOptions,
        expirationDate: formExpirationDate || undefined,
        isComposite: formIsComposite || undefined,
        useLots: formUseLots || undefined,
      };

      storageService.saveProduct(newProd);
      posAudio.chime();
      setHighlightedProductId(newProd.id);
      setTimeout(() => setHighlightedProductId(null), 2000);
      setIsProductModalOpen(false);
      addToast('success', `Produto "${newProd.name}" salvo com sucesso.`);
      // ✅ Global notification for product
      globalNotificationService.notifyProduct(editingProduct ? 'updated' : 'created', newProd.name);
    } catch (err: any) {
      addToast('error', friendlyErrorMessage(err, 'Não foi possível salvar o produto. Tente novamente.'));
      posAudio.error();
    } finally {
      setSavingProduct(false);
    }
  };

  const [confirmDeleteProduct, setConfirmDeleteProduct] = useState<Product | null>(null);
  const [lotManagerProduct, setLotManagerProduct] = useState<Product | null>(null);

  // ── ESTOQUE INTELIGENTE: INVENTÁRIO (ajuste com motivo) ────────
  const openInventoryModal = (product: Product) => {
    setInventoryProduct(product);
    setInventoryCounted(String(product.currentStock));
    setInventoryReason('Contagem física (inventário)');
    setIsInventoryModalOpen(true);
  };

  const handleInventorySave = () => {
    if (!inventoryProduct) return;
    const counted = parseFloat(inventoryCounted);
    if (isNaN(counted) || counted < 0) {
      addToast('error', 'Informe uma quantidade válida.');
      posAudio.error();
      return;
    }
    try {
      const delta = counted - inventoryProduct.currentStock;
      const updated: Product = {
        ...inventoryProduct,
        currentStock: counted,
        updatedAt: new Date().toISOString(),
      };
      storageService.saveProduct(updated);
      // Registrar movimento de estoque
      storageService.saveStockMovement({
        id: crypto.randomUUID(),
        productId: inventoryProduct.id,
        productName: inventoryProduct.name,
        type: delta >= 0 ? 'in' : 'out',
        quantity: Math.abs(delta),
        previousStock: inventoryProduct.currentStock,
        newStock: counted,
        reason: inventoryReason || 'Contagem física (inventário)',
        date: new Date().toISOString(),
        operatorName: user.name,
        storeBranchId: user.storeBranchId,
        organizationId: user.organizationId,
      });
      posAudio.chime();
      setIsInventoryModalOpen(false);
      setInventoryProduct(null);
      addToast('success', `Estoque de "${inventoryProduct.name}" atualizado para ${counted}.`);
    } catch (err: any) {
      addToast('error', friendlyErrorMessage(err, 'Não foi possível ajustar o estoque.'));
      posAudio.error();
    }
  };

  const handleConfirmDeleteProduct = () => {
    const product = confirmDeleteProduct;
    if (!product) return;
    setConfirmDeleteProduct(null);
    try {
      storageService.deleteProduct(product.id);
      posAudio.click();
      const action = undoManager.peek();
      addToast(
        'success',
        `Produto "${product.name}" excluído.`,
        6000,
        action ? 'Desfazer' : undefined,
        action ? () => undoManager.undo() : undefined
      );
    } catch (err: any) {
      addToast('error', friendlyErrorMessage(err, 'Não foi possível excluir o produto. Tente novamente.'));
      posAudio.error();
    }
  };

  const [savingStock, setSavingStock] = useState(false);

  const handleApplyStockAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockTargetProduct) return;
    if (stockDelta === 0) {
      addToast('warning', 'Informe uma quantidade diferente de zero para movimentar o estoque.');
      return;
    }
    setSavingStock(true);
    try {
      await storageService.updateStock(stockTargetProduct.id, stockDelta, stockReason, user.name);
      posAudio.chime();
      setIsStockModalOpen(false);
      addToast('success', `Estoque de "${stockTargetProduct.name}" ajustado em ${stockDelta > 0 ? '+' : ''}${stockDelta} ${stockTargetProduct.unit}.`);
    } catch (err: any) {
      addToast('error', friendlyErrorMessage(err, 'Não foi possível ajustar o estoque. Tente novamente.'));
      posAudio.error();
    } finally {
      setSavingStock(false);
    }
  };

  // Filtered list
  const filteredProducts = products.filter((p) => {
    const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;
    const term = debouncedSearch.toLowerCase().trim();
    const matchesSearch =
      !term ||
      p.name.toLowerCase().includes(term) ||
      p.barcode.includes(term);

    let matchesStock = true;
    if (stockFilter === 'low') matchesStock = p.currentStock <= p.minStock && p.currentStock > 0;
    if (stockFilter === 'out') matchesStock = p.currentStock === 0;

    // Quick filter: Cardápio / TV
    let matchesQuick = true;
    if (quickFilter === 'cardapio') matchesQuick = p.showOnCardapio === true;
    if (quickFilter === 'tv') matchesQuick = p.showOnTV === true;

    return matchesCategory && matchesSearch && matchesStock && matchesQuick;
  });

  const sortedProducts = [...filteredProducts].sort((a, b) => {
    let aVal: any = a[sortField as keyof Product];
    let bVal: any = b[sortField as keyof Product];
    if (typeof aVal === 'string') aVal = aVal.toLowerCase();
    if (typeof bVal === 'string') bVal = bVal.toLowerCase();
    if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  return (
    <div className="p-3 sm:p-4 md:p-6 max-w-7xl mx-auto space-y-4 sm:space-y-6">
      {/* Top Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Package className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            Estoque
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

          {canCreateEdit && (
          <button
            onClick={openNewProductModal}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Cadastrar Produto</span>
          </button>
          )}
          <button
            onClick={() => setCompactMode((prev) => !prev)}
            className="px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-200 dark:hover:bg-[#27272a] transition-all"
            title={compactMode ? 'Modo Cards' : 'Modo Lista'}
          >
            {compactMode ? '▦' : '☰'}
          </button>
        </div>
      </div>

      {/* Estoque Inteligente: Painel de Alertas */}
      {(() => {
        const lowStockProducts = products.filter((p) => p.currentStock <= p.minStock && p.currentStock > 0);
        const outOfStockProducts = products.filter((p) => p.currentStock === 0);
        if (lowStockProducts.length === 0 && outOfStockProducts.length === 0) return null;
        return (
          <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/20 space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <h3 className="text-xs font-bold text-amber-800 dark:text-amber-400">
                Alertas de Estoque ({lowStockProducts.length + outOfStockProducts.length})
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {outOfStockProducts.slice(0, 3).map((p) => (
                <button
                  key={p.id}
                  onClick={() => openInventoryModal(p)}
                  className="flex items-center gap-2 p-2 rounded-lg bg-rose-100 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-left hover:bg-rose-200 dark:hover:bg-rose-500/20 transition-colors"
                >
                  <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold text-rose-800 dark:text-rose-400 truncate">{p.name}</p>
                    <p className="text-[9px] text-rose-600 dark:text-rose-500">ESGOTADO — Toque para ajustar</p>
                  </div>
                </button>
              ))}
              {lowStockProducts.slice(0, 3).map((p) => (
                <button
                  key={p.id}
                  onClick={() => openInventoryModal(p)}
                  className="flex items-center gap-2 p-2 rounded-lg bg-amber-100 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-left hover:bg-amber-200 dark:hover:bg-amber-500/20 transition-colors"
                >
                  <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold text-amber-800 dark:text-amber-400 truncate">{p.name}</p>
                    <p className="text-[9px] text-amber-600 dark:text-amber-500">{p.currentStock}/{p.minStock} {p.unit} — Toque para ajustar</p>
                  </div>
                </button>
              ))}
            </div>
            {(lowStockProducts.length + outOfStockProducts.length) > 3 && (
              <p className="text-[10px] text-amber-600 dark:text-amber-500">
                +{(lowStockProducts.length + outOfStockProducts.length) - 3} produto(s) em alerta. Use o filtro "Estoque Baixo" para ver todos.
              </p>
            )}
          </div>
        );
      })()}

      {/* Filter & Search Bar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 text-slate-400 dark:text-[#71717a] absolute left-3.5 top-3 pointer-events-none" />
            <input
              type="text"
              data-search-input="true"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nome ou código de barras..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilterSheet(true)}
              className="md:hidden px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#27272a] text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v2.586a1 1 0 0 1-.293.707l-6.414 6.414a1 1 0 0 0-.293.707V17l-4 4v-6.586a1 1 0 0 0-.293-.707L3.293 7.207A1 1 0 0 1 3 6.586V4z" />
              </svg>
              Filtrar
            </button>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="hidden md:block bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 dark:text-[#a1a1aa] outline-none cursor-pointer"
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
              className="hidden md:block bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 dark:text-[#a1a1aa] outline-none cursor-pointer"
            >
              <option value="all">Todos os Níveis de Estoque</option>
              <option value="low">Apenas Estoque Baixo</option>
              <option value="out">Esgotados (Zero)</option>
            </select>

            {/* Quick filters: Cardápio / TV */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#09090b] rounded-xl p-1">
              <button
                onClick={() => setQuickFilter((prev) => prev === 'cardapio' ? 'all' : 'cardapio')}
                className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-colors ${
                  quickFilter === 'cardapio'
                    ? 'bg-teal-500 text-white'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                }`}
              >
                Cardápio
              </button>
              <button
                onClick={() => setQuickFilter((prev) => prev === 'tv' ? 'all' : 'tv')}
                className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-colors ${
                  quickFilter === 'tv'
                    ? 'bg-amber-500 text-white'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                }`}
              >
                TV
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedProducts.size > 0 && (
        <div className="p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
            {selectedProducts.size} selecionado(s)
          </span>
          <button
            onClick={async () => {
              for (const id of selectedProducts) {
                const product = products.find((p) => p.id === id);
                if (product) await storageService.saveProduct({ ...product, showOnCardapio: true });
              }
              setSelectedProducts(new Set());
              addToast('success', `${selectedProducts.size} produto(s) ativado(s) no cardápio`);
            }}
            className="px-3 py-1.5 rounded-lg bg-teal-500 text-white text-[10px] font-bold"
          >
            Exibir no Cardápio
          </button>
          <button
            onClick={async () => {
              for (const id of selectedProducts) {
                const product = products.find((p) => p.id === id);
                if (product) await storageService.saveProduct({ ...product, showOnCardapio: false });
              }
              setSelectedProducts(new Set());
              addToast('info', `${selectedProducts.size} produto(s) removido(s) do cardápio`);
            }}
            className="px-3 py-1.5 rounded-lg bg-slate-500 text-white text-[10px] font-bold"
          >
            Remover do Cardápio
          </button>
          <button
            onClick={() => setSelectedProducts(new Set())}
            className="px-3 py-1.5 rounded-lg text-slate-500 text-[10px] font-bold hover:bg-slate-100"
          >
            Limpar seleção
          </button>
        </div>
      )}

      {/* Products Table — Desktop (md+) */}
      <div className="hidden md:block bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-[#09090b]/80 border-b border-slate-200 dark:border-[#27272a] text-slate-500 dark:text-[#71717a] font-bold uppercase tracking-wider">
                <th className="py-3.5 px-3 w-10">
                  <input
                    type="checkbox"
                    checked={selectedProducts.size > 0 && selectedProducts.size === sortedProducts.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedProducts(new Set(sortedProducts.map((p) => p.id)));
                      } else {
                        setSelectedProducts(new Set());
                      }
                    }}
                    className="rounded text-indigo-600"
                  />
                </th>
                <th className="py-3.5 px-4 cursor-pointer select-none hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" onClick={() => handleSort('name')}>
                  <div className="flex items-center gap-1">
                    Produto
                    {sortField === 'name' && <span className="text-[9px]">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                  </div>
                </th>
                <th className="py-3.5 px-4 hidden md:table-cell cursor-pointer select-none hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" onClick={() => handleSort('barcode')}>
                  <div className="flex items-center gap-1">
                    Código / EAN
                    {sortField === 'barcode' && <span className="text-[9px]">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                  </div>
                </th>
                <th className="py-3.5 px-4 hidden sm:table-cell cursor-pointer select-none hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" onClick={() => handleSort('category')}>
                  <div className="flex items-center gap-1">
                    Categoria
                    {sortField === 'category' && <span className="text-[9px]">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                  </div>
                </th>
                <th className="py-3.5 px-4 hidden lg:table-cell cursor-pointer select-none hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" onClick={() => handleSort('costPrice')}>
                  <div className="flex items-center gap-1">
                    Preço Custo
                    {sortField === 'costPrice' && <span className="text-[9px]">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                  </div>
                </th>
                <th className="py-3.5 px-4 cursor-pointer select-none hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" onClick={() => handleSort('salePrice')}>
                  <div className="flex items-center gap-1">
                    Preço Venda
                    {sortField === 'salePrice' && <span className="text-[9px]">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                  </div>
                </th>
                <th className="py-3.5 px-4 hidden md:table-cell">Margem %</th>
                <th className="py-3.5 px-4 cursor-pointer select-none hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" onClick={() => handleSort('currentStock')}>
                  <div className="flex items-center gap-1">
                    Estoque
                    {sortField === 'currentStock' && <span className="text-[9px]">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                  </div>
                </th>
                <th className="py-3.5 px-4 hidden lg:table-cell">TV</th>
                <th className="py-3.5 px-4 hidden lg:table-cell">Cardápio</th>
                <th className="py-3.5 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#27272a]">
              {isSearching ? (
                <tr><td colSpan={9}><TableSkeleton rows={4} cols={5} /></td></tr>
              ) : sortedProducts.length === 0 ? (
                <tr><td colSpan={9} className="py-12 text-center text-sm text-slate-400 dark:text-[#71717a] font-semibold">Nenhum produto encontrado</td></tr>
              ) : (
                sortedProducts.map((p) => {
                  const margin = p.salePrice > 0 ? ((p.salePrice - p.costPrice) / p.salePrice) * 100 : 0;
                  const isLow = p.currentStock <= p.minStock;
                  const isOut = p.currentStock === 0;

                  return (
                    <tr key={p.id} className={`hover:bg-slate-50/80 dark:hover:bg-[#27272a]/30 transition-colors ${
                      highlightedProductId === p.id ? 'animate-pulse bg-indigo-500/5 dark:bg-indigo-500/10' : ''
                    }`}>
                      <td className="py-3 px-3">
                        <input
                          type="checkbox"
                          checked={selectedProducts.has(p.id)}
                          onChange={(e) => {
                            setSelectedProducts((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(p.id);
                              else next.delete(p.id);
                              return next;
                            });
                          }}
                          className="rounded text-indigo-600"
                        />
                      </td>
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
                       <td className="py-3 px-4 hidden lg:table-cell">
                         {p.showOnCardapio ? (
                           <span className="px-2 py-0.5 rounded-md bg-teal-500/10 text-teal-600 dark:text-teal-400 font-bold text-[10px] border border-teal-500/20 flex items-center gap-1 w-fit">
                             <UtensilsCrossed className="w-3 h-3" />
                             CARDÁPIO
                           </span>
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
                            className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-[#27272a] transition-colors min-h-[44px] min-w-[44px]"
                            title="Ajustar / Registrar Entrada no Estoque"
                          >
                            <Boxes className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setBarcodeTargetProduct(p);
                              setIsBarcodeModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-[#27272a] transition-colors min-h-[44px] min-w-[44px]"
                            title="Gerar Folha de Etiquetas"
                          >
                            <Barcode className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openEditProductModal(p)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-[#27272a] transition-colors min-h-[44px] min-w-[44px]"
                            title="Editar Cadastro"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          {p.useLots && (
                            <button
                              onClick={() => setLotManagerProduct(p)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors min-h-[44px] min-w-[44px]"
                              title="Gerenciar Lotes"
                            >
                              <Package className="w-4 h-4" />
                            </button>
                          )}
                          {canCreateEdit && (
                          <button
                            onClick={() => setConfirmDeleteProduct(p)}
                            className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 transition-colors min-h-[44px] min-w-[44px]"
                            title="Excluir Produto"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Products Cards — Mobile (below md) */}
      <div className="block md:hidden space-y-3">
        {isSearching ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <Skeleton key={i} variant="card" />)}
          </div>
        ) : sortedProducts.length === 0 ? (
          <div className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-2xl shadow-sm p-8 text-center">
            <p className="text-sm text-slate-400 dark:text-[#71717a] font-semibold">Nenhum produto encontrado</p>
          </div>
        ) : (
          sortedProducts.map((p) => {
            const isLow = p.currentStock <= p.minStock;
            const isOut = p.currentStock === 0;

            return (
              <div
                key={p.id}
                className={`bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-2xl shadow-sm p-3.5 space-y-3 ${
                  highlightedProductId === p.id ? 'ring-2 ring-indigo-500/50 animate-pulse' : ''
                }`}
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
                  {p.useLots && (
                    <button
                      onClick={() => setLotManagerProduct(p)}
                      className="py-2 px-3 rounded-xl text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors flex items-center justify-center min-h-[44px] min-w-[44px]"
                      title="Gerenciar Lotes"
                    >
                      <Package className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => setConfirmDeleteProduct(p)}
                    className="py-2 px-3 rounded-xl text-rose-500 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 transition-colors flex items-center justify-center min-h-[44px] min-w-[44px]"
                    title="Excluir Produto"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
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
                  ref={firstInputRef}
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
                  <MoneyInput
                    required
                    value={formCostPrice}
                    onChange={setFormCostPrice}
                    placeholder="Ex: 5,90"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-bold text-slate-900 dark:text-white outline-none placeholder:text-slate-300 dark:placeholder:text-[#3f3f46]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-[#a1a1aa] mb-1">
                    Preço de Venda (R$)
                  </label>
                  <MoneyInput
                    required
                    value={formSalePrice}
                    onChange={setFormSalePrice}
                    placeholder="Ex: 9,90"
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
              </div>

              {/* Data de Validade */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-[#a1a1aa] mb-1">
                  Data de Validade
                  <span className="text-[10px] font-normal text-slate-400 dark:text-[#52525b] ml-1">(opcional)</span>
                </label>
                <input
                  type="date"
                  value={formExpirationDate}
                  onChange={(e) => setFormExpirationDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs text-slate-900 dark:text-white outline-none placeholder:text-slate-300 dark:placeholder:text-[#3f3f46]"
                />
                {formExpirationDate && (
                  <p className="text-[10px] text-slate-400 dark:text-[#52525b] mt-1">
                    ⚠️ Produtos próximos à validade aparecem no Dashboard
                  </p>
                )}
              </div>

              {/* Controle por Lotes */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a]">
                <input
                  type="checkbox"
                  id="useLots"
                  checked={formUseLots}
                  onChange={(e) => setFormUseLots(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <label htmlFor="useLots" className="text-xs font-bold text-slate-700 dark:text-[#a1a1aa] cursor-pointer">
                    Controlar por Lotes (FEFO)
                  </label>
                  <p className="text-[10px] text-slate-400 dark:text-[#52525b]">
                    First Expired, First Out — venda desconta do lote mais antigo
                  </p>
                </div>
              </div>

              {/* Product Photo Management */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] space-y-3">
                <label className="block text-xs font-bold text-slate-700 dark:text-[#a1a1aa]">
                  Foto do Produto
                </label>

                <div className="flex flex-col sm:flex-row items-center gap-3">
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

                  <div className="flex-1 space-y-2 w-full">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={handleStartLiveCamera}
                        className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors flex items-center justify-center gap-2 shadow-sm"
                      >
                        <Camera className="w-4 h-4" />
                        <span>Tirar Foto (Câmera)</span>
                      </button>

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
                        <span>Buscar Imagem na Web</span>
                      </button>
                    </div>

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

              {/* ─── ATACADO (CAIXA / FARDOS) ─── */}
              <div className="pt-3 border-t border-slate-200 dark:border-[#27272a] space-y-3">
                <label className="flex items-center gap-3 p-3 rounded-xl bg-indigo-500/5 border border-indigo-500/20 cursor-pointer hover:bg-indigo-500/10 transition-colors">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={formWholesaleEnabled}
                      onChange={(e) => {
                        setFormWholesaleEnabled(e.target.checked);
                        posAudio.click();
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5 rounded-full bg-slate-300 dark:bg-[#27272a] peer-checked:bg-indigo-500 transition-colors" />
                    <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-md transition-transform peer-checked:translate-x-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">Adicionar produto no atacado</p>
                    <p className="text-[10px] text-slate-500 dark:text-[#71717a]">
                      Ex.: caixa de Skol 12un vendida por um preço único (diferente do preço da unidade)
                    </p>
                  </div>
                </label>

                {formWholesaleEnabled && (
                  <div className="space-y-3 pl-1 animate-in slide-in-from-top-2 duration-200">
                    {formWholesaleOptions.map((line, i) => (
                      <div key={i} className="p-3 rounded-xl bg-indigo-500/5 border border-indigo-500/15 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500 dark:text-[#71717a]">
                            Configuração {i + 1}
                          </span>
                          {formWholesaleOptions.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setFormWholesaleOptions((prev) => prev.filter((_, x) => x !== i))}
                              className="p-1 rounded-lg text-rose-500 hover:bg-rose-500/10 transition-colors"
                              title="Remover configuração"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 dark:text-[#a1a1aa] mb-1">
                              Quantidade na caixa (un)
                            </label>
                            <input
                              type="number"
                              min="2"
                              value={line.boxQuantity}
                              onChange={(e) =>
                                setFormWholesaleOptions((prev) =>
                                  prev.map((l, x) => (x === i ? { ...l, boxQuantity: e.target.value } : l))
                                )
                              }
                              placeholder="Ex: 12"
                              className="w-full px-3 py-2 bg-white dark:bg-[#18181b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 dark:text-[#a1a1aa] mb-1">
                              Valor da caixa (R$)
                            </label>
                            <MoneyInput
                              value={line.salePrice}
                              onChange={(v) =>
                                setFormWholesaleOptions((prev) =>
                                  prev.map((l, x) => (x === i ? { ...l, salePrice: v } : l))
                                )
                              }
                              placeholder="Ex: 38,00"
                              className="w-full px-3 py-2 bg-white dark:bg-[#18181b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-bold text-indigo-600 dark:text-indigo-400 outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                        </div>
                        {parseBrlToNumber(line.salePrice) > 0 && Math.floor(Number(line.boxQuantity) || 0) >= 2 && (
                          <p className="text-[10px] font-bold text-indigo-500">
                            Preço por unidade na caixa: R${' '}
                            {(parseBrlToNumber(line.salePrice) / (Math.floor(Number(line.boxQuantity)) || 1)).toFixed(2)}
                          </p>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setFormWholesaleOptions((prev) => [...prev, { boxQuantity: '', salePrice: '' }])}
                      className="w-full py-2.5 rounded-xl border-2 border-dashed border-indigo-500/30 text-indigo-600 dark:text-indigo-400 font-bold text-xs hover:bg-indigo-500/5 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Plus className="w-4 h-4" />
                      Adicionar outra configuração
                    </button>
                  </div>
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

                {/* Exibir no Cardápio Digital */}
                <label className="flex items-center gap-3 p-3 rounded-xl bg-teal-500/5 border border-teal-500/20 cursor-pointer hover:bg-teal-500/10 transition-colors">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={formShowOnCardapio}
                      onChange={(e) => {
                        setFormShowOnCardapio(e.target.checked);
                        posAudio.click();
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5 rounded-full bg-slate-300 dark:bg-[#27272a] peer-checked:bg-teal-500 transition-colors" />
                    <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-md transition-transform peer-checked:translate-x-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">Exibir no Cardápio Digital</p>
                    <p className="text-[10px] text-slate-500 dark:text-[#71717a]">Produto aparecerá no cardápio acessado via QR Code</p>
                  </div>
                </label>

                {formShowOnTV && (
                  <div className="space-y-3 pl-1 animate-in slide-in-from-top-2 duration-200">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-[#a1a1aa] mb-1">
                        Preço de Oferta (R$)
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-amber-500">R$</span>
                        <MoneyInput
                          value={formTvPromoPrice}
                          onChange={setFormTvPromoPrice}
                          className="w-full pl-10 pr-3 py-2 bg-white dark:bg-[#18181b] border border-amber-500/30 rounded-xl text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500"
                          placeholder="0,00"
                        />
                      </div>
                      {parseBrlToNumber(formTvPromoPrice) > 0 && parseBrlToNumber(formSalePrice) > 0 && parseBrlToNumber(formTvPromoPrice) < parseBrlToNumber(formSalePrice) && (
                        <p className="mt-1 text-[10px] font-bold text-emerald-500 flex items-center gap-1">
                          <Sparkles className="w-3 h-3" />
                          Economia de R$ {(parseBrlToNumber(formSalePrice) - parseBrlToNumber(formTvPromoPrice)).toFixed(2)} ({Math.round(((parseBrlToNumber(formSalePrice) - parseBrlToNumber(formTvPromoPrice)) / parseBrlToNumber(formSalePrice)) * 100)}% OFF)
                        </p>
                      )}
                    </div>

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
                  disabled={savingProduct}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs shadow-md"
                >
                  {savingProduct ? 'Salvando...' : 'Salvar Produto'}
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
                        const found = products.find(p => p.barcode && p.barcode !== '0' && p.barcode === val.trim());
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
                  onChange={(e) => {}}
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
                  disabled={savingStock}
                  className="px-5 py-2 rounded-xl bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold"
                >
                  {savingStock ? 'Ajustando...' : 'Confirmar Ajuste'}
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
        storeBranchId={user.storeBranchId}
        organizationId={user.organizationId}
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
          addToast('success', 'Produtos importados com sucesso!');
        }}
        onNavigateToNewProduct={(barcode) => {
          setIsStockCameraModalOpen(false);
          resetProductForm(barcode);
          setIsProductModalOpen(true);
        }}
      />

      {/* Mobile Filter Bottom Sheet */}
      <BottomSheet isOpen={showFilterSheet} onClose={() => setShowFilterSheet(false)} title="Filtrar Produtos">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Categoria</label>
            <select
              value={selectedCategory}
              onChange={(e) => { setSelectedCategory(e.target.value); setShowFilterSheet(false); }}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] text-xs font-semibold text-slate-700 dark:text-[#a1a1aa] outline-none"
            >
              <option value="all">Todas as Categorias</option>
              {categories.map((c) => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Nível de Estoque</label>
            <select
              value={stockFilter}
              onChange={(e) => { setStockFilter(e.target.value as any); setShowFilterSheet(false); }}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] text-xs font-semibold text-slate-700 dark:text-[#a1a1aa] outline-none"
            >
              <option value="all">Todos</option>
              <option value="low">Estoque Baixo</option>
              <option value="out">Esgotados</option>
            </select>
          </div>
        </div>
      </BottomSheet>

      {/* Confirm: excluir produto */}
      <ConfirmDialog
        isOpen={confirmDeleteProduct !== null}
        title="Excluir produto?"
        message="O produto será removido do estoque. Você poderá desfundo logo em seguida."
        itemName={confirmDeleteProduct?.name}
        confirmLabel="Excluir"
        onConfirm={handleConfirmDeleteProduct}
        onCancel={() => setConfirmDeleteProduct(null)}
      />

      {/* Estoque Inteligente: Modal de Inventário (ajuste com motivo) */}
      {isInventoryModalOpen && inventoryProduct && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIsInventoryModalOpen(false)}>
          <div className="bg-white dark:bg-[#18181b] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-200 dark:border-[#27272a]">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Inventário — Ajuste de Estoque</h3>
              <p className="text-xs text-slate-500 dark:text-[#71717a] mt-1">{inventoryProduct.name}</p>
            </div>
            <div className="p-5 space-y-4">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a]">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-[#71717a] font-bold">Estoque Atual</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{inventoryProduct.currentStock} {inventoryProduct.unit}</p>
                <p className="text-[10px] text-slate-400">Mínimo: {inventoryProduct.minStock} {inventoryProduct.unit}</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-[#a1a1aa] mb-1">Quantidade Contada</label>
                <input
                  type="number"
                  value={inventoryCounted}
                  onChange={(e) => setInventoryCounted(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-lg font-bold text-slate-900 dark:text-white"
                  placeholder="0"
                  autoFocus
                />
                {(() => {
                  const counted = parseFloat(inventoryCounted);
                  const delta = isNaN(counted) ? 0 : counted - inventoryProduct.currentStock;
                  if (delta === 0) return <p className="text-[10px] text-slate-400 mt-1">Sem alteração</p>;
                  return (
                    <p className={`text-[10px] mt-1 font-bold ${delta > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {delta > 0 ? `+${delta}` : delta} {inventoryProduct.unit} ({delta > 0 ? 'entrada' : 'saída'})
                    </p>
                  );
                })()}
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-[#a1a1aa] mb-1">Motivo do Ajuste</label>
                <select
                  value={inventoryReason}
                  onChange={(e) => setInventoryReason(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
                >
                  <option>Contagem física (inventário)</option>
                  <option>Correção de divergência</option>
                  <option>Produto avariado</option>
                  <option>Perda / Roubo</option>
                  <option>Devolução para fornecedor</option>
                  <option>Outro</option>
                </select>
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-[#27272a] flex justify-end gap-2">
              <button
                onClick={() => setIsInventoryModalOpen(false)}
                className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 font-bold text-xs hover:bg-slate-100 dark:hover:bg-[#27272a]"
              >
                Cancelar
              </button>
              <button
                onClick={handleInventorySave}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                Salvar Ajuste
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lot Manager Modal */}
      <LotManagerModal
        isOpen={lotManagerProduct !== null}
        productId={lotManagerProduct?.id || ''}
        productName={lotManagerProduct?.name || ''}
        onClose={() => setLotManagerProduct(null)}
      />
    </div>
  );
};

export default InventoryView;