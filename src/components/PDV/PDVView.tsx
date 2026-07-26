import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search,
  Barcode,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  UserCheck,
  CreditCard,
  Percent,
  AlertCircle,
  Sparkles,
  Lock,
  Unlock,
  ChevronRight,
  RefreshCw,
  Tag,
  Camera,
  X,
  Zap,
  ZapOff,
  CheckCircle2,
  AlertTriangle,
  Package,
} from 'lucide-react';
import {
  Product,
  Category,
  CartItem,
  Customer,
  CashRegisterSession,
  SystemSettings,
  UserProfile,
  Sale,
} from '../../types';
import { posAudio } from '../../services/audioService';
import { PaymentModal } from './PaymentModal';
import { ThermalReceiptModal } from './ThermalReceiptModal';

interface PDVViewProps {
  products: Product[];
  categories: Category[];
  customers: Customer[];
  caixaSession: CashRegisterSession;
  onOpenCaixaModal: () => void;
  onNavigateTab: (tab: string) => void;
  onNavigateToNewProduct: (barcode: string) => void;
  settings: SystemSettings;
  user: UserProfile;
}

export const PDVView: React.FC<PDVViewProps> = ({
  products,
  categories,
  customers,
  caixaSession,
  onOpenCaixaModal,
  onNavigateTab,
  onNavigateToNewProduct,
  settings,
  user,
}) => {
  const isCaixaOpen = caixaSession && caixaSession.status === 'open';

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [discountAmount, setDiscountAmount] = useState<number>(0);

  // Modals state
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);

  // Camera Scanner state
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerStatus, setScannerStatus] = useState<'idle' | 'scanning' | 'found' | 'not_found'>('idle');
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [scannedProduct, setScannedProduct] = useState<Product | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scannerIntervalRef = useRef<number | null>(null);
  const lastScannedRef = useRef<string>('');
  const scanCooldownRef = useRef(false);
  const [flashOn, setFlashOn] = useState(false);
  const [scanFlash, setScanFlash] = useState(false);
  const [scanSuccessProduct, setScanSuccessProduct] = useState<Product | null>(null);
  const [scanPaused, setScanPaused] = useState(false);

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

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus barcode input on render
  useEffect(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

  // Keyboard Shortcuts (F2, F4, F8, ESC)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        handleClearCart();
      } else if (e.key === 'F4') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'F8') {
        e.preventDefault();
        if (cart.length > 0 && isCaixaOpen) {
          setIsPaymentOpen(true);
        }
      } else if (e.key === 'Escape') {
        setIsPaymentOpen(false);
        setIsReceiptOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, isCaixaOpen]);

  // Filter products by search or category
  const filteredProducts = products.filter((p) => {
    const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;
    const term = searchTerm.toLowerCase().trim();
    const matchesSearch =
      !term ||
      p.name.toLowerCase().includes(term) ||
      p.barcode.includes(term);
    return matchesCategory && matchesSearch && p.active;
  });

  // Add Product to Cart
  const handleAddToCart = (product: Product) => {
    if (!isCaixaOpen) {
      onOpenCaixaModal();
      return;
    }

    if (product.currentStock <= 0) {
      posAudio.error();
      alert(`Atenção: O produto "${product.name}" está com estoque esgotado!`);
      return;
    }

    // Check if adding 1 more would exceed stock
    const existingItem = cart.find((item) => item.product.id === product.id);
    const currentQtyInCart = existingItem ? existingItem.quantity : 0;
    if (currentQtyInCart >= product.currentStock) {
      posAudio.error();
      // Improved visual alert for insufficient stock
      const alertHtml = `
        <div style="font-family: inherit; padding: 16px; max-width: 320px;">
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
            <div style="width: 48px; height: 48px; border-radius: 50%; background: #fef2f2; border: 2px solid #fecaca; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            </div>
            <div>
              <h3 style="margin: 0; font-size: 16px; font-weight: 700; color: #991b1b;">Estoque Insuficiente</h3>
              <p style="margin: 4px 0 0; font-size: 13px; color: #7f1d1d;">Não é possível adicionar mais itens</p>
            </div>
          </div>
          <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 12px; margin-bottom: 12px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="font-size: 13px; color: #7f1d1d;">Produto</span>
              <span style="font-size: 13px; font-weight: 600; color: #991b1b;">${product.name}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="font-size: 13px; color: #7f1d1d;">Disponível em estoque</span>
              <span style="font-size: 13px; font-weight: 700; color: #ef4444;">${product.currentStock} ${product.unit}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="font-size: 13px; color: #7f1d1d;">Já no carrinho</span>
              <span style="font-size: 13px; font-weight: 700; color: #f59e0b;">${currentQtyInCart} ${product.unit}</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding-top: 8px; border-top: 1px solid #fecaca;">
              <span style="font-size: 13px; color: #7f1d1d;">Máximo permitido</span>
              <span style="font-size: 13px; font-weight: 700; color: #991b1b;">${product.currentStock} ${product.unit}</span>
            </div>
          </div>
          <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 12px;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg>
              <span style="font-size: 12px; font-weight: 600; color: #92400e;">Dica:</span>
            </div>
            <p style="margin: 0; font-size: 12px; color: #92400e;">Remova itens do carrinho ou finalize a venda atual antes de adicionar mais.</p>
          </div>
        </div>
      `;
      
      // Create a custom modal-like alert
      const alertContainer = document.createElement('div');
      alertContainer.style.cssText = `
        position: fixed; inset: 0; z-index: 9999;
        background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
        display: flex; align-items: center; justify-content: center; padding: 16px;
        animation: fadeIn 0.2s ease-out;
      `;
      alertContainer.innerHTML = `
        <div style="
          background: white; border-radius: 20px; max-width: 360px; width: 100%;
          box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
          overflow: hidden; animation: slideUp 0.3s ease-out;
        ">
          ${alertHtml}
          <button onclick="this.closest('[data-alert]').remove()" style="
            width: 100%; padding: 14px; margin-top: 16px;
            background: linear-gradient(135deg, #ef4444, #dc2626);
            color: white; border: none; border-radius: 12px;
            font-size: 14px; font-weight: 700; cursor: pointer;
            transition: transform 0.1s, box-shadow 0.1s;
          " onmousedown="this.style.transform='scale(0.98)'" onmouseup="this.style.transform='scale(1)'">
            Entendido
          </button>
        </div>
        <style>
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        </style>
      `;
      alertContainer.setAttribute('data-alert', 'true');
      document.body.appendChild(alertContainer);
      
      // Auto-remove after 8 seconds
      setTimeout(() => alertContainer.remove(), 8000);
      return;
    }

    posAudio.beep();

    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? {
                ...item,
                quantity: item.quantity + 1,
                totalPrice: (item.quantity + 1) * item.unitPrice - item.discount,
              }
            : item
        );
      } else {
        return [
          ...prev,
          {
            product,
            quantity: 1,
            unitPrice: product.salePrice,
            discount: 0,
            totalPrice: product.salePrice,
          },
        ];
      }
    });
  };

  // Barcode Auto Search & Add on Enter
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;

    // Try exact barcode match first
    const exactMatch = products.find(
      (p) => p.barcode === searchTerm.trim()
    );

    if (exactMatch) {
      handleAddToCart(exactMatch);
      setSearchTerm('');
    } else if (filteredProducts.length === 1) {
      handleAddToCart(filteredProducts[0]);
      setSearchTerm('');
    }
  };

  // Modify Cart Item Quantity
  const handleUpdateQuantity = (productId: string, delta: number) => {
    // Block increasing beyond available stock
    if (delta > 0) {
      const item = cart.find((i) => i.product.id === productId);
      if (item && item.quantity >= item.product.currentStock) {
        posAudio.error();
        alert(
          `Estoque insuficiente! "${item.product.name}" tem apenas ${item.product.currentStock} ${item.product.unit}(s) disponível(is).`
        );
        return;
      }
    }

    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id === productId) {
            const newQty = item.quantity + delta;
            if (newQty <= 0) return null;
            return {
              ...item,
              quantity: newQty,
              totalPrice: newQty * item.unitPrice - item.discount,
            };
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
    posAudio.click();
  };

  // Remove Item
  const handleRemoveItem = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
    posAudio.click();
  };

  // Clear Cart
  const handleClearCart = () => {
    if (cart.length === 0) return;
    if (confirm('Deseja limpar todo o carrinho de compras?')) {
      setCart([]);
      setSelectedCustomer(null);
      setDiscountAmount(0);
      posAudio.click();
    }
  };

  // ---- Camera Barcode Scanner ----
  const startScanner = useCallback(async () => {
    setIsScannerOpen(true);
    setScannerStatus('scanning');
    setScannedBarcode('');
    setScannedProduct(null);
    lastScannedRef.current = '';
    scanCooldownRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;

      // ✅ Wait one frame for React to render the video element
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Use BarcodeDetector API if available (Chrome/Edge)
      const BarcodeDetectorClass = (window as any).BarcodeDetector;
      if (BarcodeDetectorClass) {
        const detector = new BarcodeDetectorClass({
          formats: ['ean_13', 'ean_8', 'code_128', 'qr_code', 'upc_a', 'upc_e', 'code_39', 'codabar'],
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
        // BarcodeDetector not available — user can type barcode manually
        setScannerStatus('scanning');
      }
    } catch (err) {
      console.error('Camera error:', err);
      setIsScannerOpen(false);
      setScannerStatus('idle');
      setTimeout(() => {
        alert('Não foi possível acessar a câmera. Verifique as permissões do navegador.');
      }, 0);
    }
  }, []);

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
    setFlashOn(false);
    setScanFlash(false);
    setScanSuccessProduct(null);
  };

  const handleBarcodeDetected = (barcode: string) => {
    if (!isCaixaOpen) {
      stopScanner();
      onOpenCaixaModal();
      return;
    }

    setScannedBarcode(barcode);

    // Search product by barcode (trim both sides for robust matching)
    const found = products.find((p) => p.barcode.trim() === barcode.trim());

    if (found) {
      setScannedProduct(found);
      setScannerStatus('found');
      posAudio.beep();

      // Add to cart immediately
      handleAddToCart(found);

      // Show success overlay and PAUSE scanner — wait for user confirmation
      setScanSuccessProduct(found);
      setScanPaused(true);
      // Stop the barcode polling interval so no duplicate scans happen
      if (scannerIntervalRef.current) {
        clearInterval(scannerIntervalRef.current);
        scannerIntervalRef.current = null;
      }
    } else {
      setScannerStatus('not_found');
      posAudio.error();
    }
  };

  const handleScanManualSubmit = (barcode: string) => {
    if (barcode.trim()) {
      handleBarcodeDetected(barcode.trim());
    }
  };

  // Resume scanning after user confirms the success overlay
  const handleScanNext = () => {
    setScanSuccessProduct(null);
    setScanPaused(false);
    setScannerStatus('scanning');
    setScannedBarcode('');
    setScannedProduct(null);
    lastScannedRef.current = '';

    // Restart the barcode polling interval
    const BarcodeDetectorClass = (window as any).BarcodeDetector;
    if (BarcodeDetectorClass && videoRef.current) {
      const detector = new BarcodeDetectorClass({
        formats: ['ean_13', 'ean_8', 'code_128', 'qr_code', 'upc_a', 'upc_e', 'code_39', 'codabar'],
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

  // Close scanner from success overlay
  const handleCloseScannerFromSuccess = () => {
    setScanSuccessProduct(null);
    setScanPaused(false);
    stopScanner();
  };

  // Cleanup scanner on unmount
  useEffect(() => {
    return () => {
      if (scannerIntervalRef.current) clearInterval(scannerIntervalRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Back button exits camera scanner on mobile
  useEffect(() => {
    if (isScannerOpen) {
      window.history.pushState({ scannerOpen: true }, '');
      const handleBack = () => { stopScanner(); };
      window.addEventListener('popstate', handleBack);
      return () => {
        window.removeEventListener('popstate', handleBack);
        // Don't push/pop if scanner was closed by X button or by back itself
      };
    }
  }, [isScannerOpen]);

  // Calculate Totals
  const cartSubtotal = cart.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0);
  const cartTotal = Math.max(0, cartSubtotal - discountAmount);

  return (
    <div className="flex flex-col lg:flex-row h-full bg-slate-100 dark:bg-[#09090b] overflow-hidden">
      {/* LEFT COLUMN: PRODUCT SEARCH & CATALOG GRID */}
      <div className="flex-1 flex flex-col p-4 md:p-6 space-y-4 overflow-y-auto">
        {/* Closed Caixa Warning Banner */}
        {!isCaixaOpen && (
          <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-between text-amber-800 dark:text-amber-400 text-xs shadow-sm">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span className="font-semibold">
                O caixa está fechado no momento. Abra o caixa para iniciar os lançamentos de vendas.
              </span>
            </div>
            <button
              onClick={onOpenCaixaModal}
              className="px-3 py-1.5 rounded-full bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition-colors"
            >
              Abrir Caixa
            </button>
          </div>
        )}

        {/* Top Controls: Search Bar & Quick Barcode Scanner simulator */}
        <div className="flex flex-col sm:flex-row gap-3">
          <form onSubmit={handleSearchSubmit} className="flex-1 relative">
            <Search className="w-4 h-4 text-slate-400 dark:text-[#71717a] absolute left-3.5 top-3 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Digite o nome ou código de barras... (F4)"
              className="w-full pl-10 pr-10 py-2.5 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-2xl text-xs sm:text-sm text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm"
            />
            <button
              type="submit"
              className="absolute right-3 top-2.5 p-1 rounded-lg text-slate-400 hover:text-indigo-600"
              title="Buscar ou adicionar item"
            >
              <Barcode className="w-4 h-4" />
            </button>
          </form>

          {/* Camera Barcode Scanner Button */}
          <button
            onClick={startScanner}
            className="flex px-4 py-2.5 rounded-2xl bg-indigo-600/10 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/30 hover:bg-indigo-600/20 text-xs font-bold transition-all items-center justify-center gap-1.5 whitespace-nowrap"
          >
            <Camera className="w-4 h-4 text-indigo-500" />
            <span className="hidden sm:inline">Scanner Câmera</span>
          </button>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
              selectedCategory === 'all'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white dark:bg-[#18181b] text-slate-600 dark:text-[#a1a1aa] hover:bg-slate-200 dark:hover:bg-[#27272a] border border-slate-200 dark:border-[#27272a]'
            }`}
          >
            Todos ({products.length})
          </button>
          {categories.map((cat) => {
            const count = products.filter((p) => p.category === cat.name).length;
            const isSel = selectedCategory === cat.name;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.name)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                  isSel
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-white dark:bg-[#18181b] text-slate-600 dark:text-[#a1a1aa] hover:bg-slate-200 dark:hover:bg-[#27272a] border border-slate-200 dark:border-[#27272a]'
                }`}
              >
                {cat.name} ({count})
              </button>
            );
          })}
        </div>

        {/* Product Cards Catalog Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5 flex-1 overflow-y-auto pr-1">
          {filteredProducts.map((p) => {
            const isLowStock = p.currentStock <= p.minStock;
            return (
              <button
                key={p.id}
                onClick={() => handleAddToCart(p)}
                className="group p-3.5 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-2xl hover:border-indigo-500 dark:hover:border-indigo-500 transition-all duration-200 text-left flex flex-col justify-between shadow-sm hover:shadow-md relative overflow-hidden"
              >
                <div>
                  {/* Thumbnail Image */}
                  <div className="w-full h-24 rounded-xl bg-slate-100 dark:bg-[#09090b] overflow-hidden mb-2 relative">
                    <img
                      src={p.imageUrl}
                      alt={p.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <span className="absolute top-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-black/60 text-white backdrop-blur-sm">
                      {p.category}
                    </span>
                  </div>

                  <p className="text-xs font-bold text-slate-900 dark:text-white line-clamp-2 leading-tight">
                    {p.name}
                  </p>
                  <p className="text-[10px] text-slate-400 dark:text-[#71717a] font-mono mt-0.5">EAN: {p.barcode}</p>
                </div>

                <div className="mt-2 pt-2 border-t border-slate-100 dark:border-[#27272a] flex items-center justify-between">
                  <div>
                    <p className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
                      R$ {p.salePrice.toFixed(2)}
                    </p>
                    <p className={`text-[10px] font-semibold ${isLowStock ? 'text-amber-500 font-bold' : 'text-slate-400 dark:text-[#71717a]'}`}>
                      Estoque: {p.currentStock} {p.unit}
                    </p>
                  </div>
                  <div className="h-7 w-7 rounded-lg bg-indigo-50 dark:bg-[#27272a] text-indigo-600 dark:text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-colors flex items-center justify-center">
                    <Plus className="w-4 h-4" />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* RIGHT COLUMN: SHOPPING CART & PDV CHECKOUT */}
      <div className="w-full lg:w-96 bg-white dark:bg-[#18181b] border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-[#27272a] flex flex-col lg:h-full max-h-[50vh] lg:max-h-none shadow-xl shrink-0 lg:shrink">
        {/* Cart Top Header */}
        <div className="p-4 border-b border-slate-200 dark:border-[#27272a] flex items-center justify-between bg-slate-50 dark:bg-[#09090b]/50">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Carrinho de Compras
              </h2>
              <p className="text-[10px] text-slate-400 dark:text-[#71717a]">
                {cart.length} item{cart.length !== 1 ? 's' : ''} selecionado{cart.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          <button
            onClick={handleClearCart}
            disabled={cart.length === 0}
            className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 px-2.5 py-2 rounded-lg transition-colors disabled:opacity-30 min-h-[44px] flex items-center"
            title="Limpar Carrinho (F2)"
          >
            Limpar (F2)
          </button>
        </div>

        {/* Customer Assignment Field */}
        <div className="p-3 border-b border-slate-200 dark:border-[#27272a] bg-slate-50/50 dark:bg-[#09090b]/30">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-semibold text-slate-600 dark:text-[#a1a1aa]">Cliente (Opcional):</span>
            <UserCheck className="w-3.5 h-3.5 text-indigo-500" />
          </div>
          <select
            value={selectedCustomer?.id || ''}
            onChange={(e) => {
              const cust = customers.find((c) => c.id === e.target.value);
              setSelectedCustomer(cust || null);
            }}
            className="w-full bg-white dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] rounded-xl px-2.5 py-1.5 text-xs text-slate-900 dark:text-white outline-none cursor-pointer"
          >
            <option value="">Consumidor Não Identificado</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.cpfCnpj})
              </option>
            ))}
          </select>
        </div>

        {/* Cart Item List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 p-6 space-y-2">
              <div className="p-4 rounded-full bg-slate-100 dark:bg-[#09090b] text-slate-300 dark:text-[#3f3f46]">
                <ShoppingCart className="w-8 h-8" />
              </div>
              <p className="text-xs font-bold text-slate-600 dark:text-[#a1a1aa]">Carrinho Vazio</p>
              <p className="text-[11px] text-slate-400 dark:text-[#71717a]">
                Clique nos produtos ou use o leitor de código de barras para adicionar itens à venda.
              </p>
            </div>
          ) : (
            cart.map((item) => (
              <div
                key={item.product.id}
                className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#09090b]/60 border border-slate-200 dark:border-[#27272a] flex items-center justify-between gap-2"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {item.product.name}
                  </p>
                  <p className="text-[10px] text-slate-400 dark:text-[#71717a]">
                    R$ {item.unitPrice.toFixed(2)} x {item.quantity} ={' '}
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      R$ {item.totalPrice.toFixed(2)}
                    </span>
                  </p>
                </div>

                {/* Quantity Controls */}
                <div className="flex items-center gap-1 bg-white dark:bg-[#18181b] p-1.5 rounded-lg border border-slate-200 dark:border-[#27272a]">
                  <button
                    onClick={() => handleUpdateQuantity(item.product.id, -1)}
                    className="p-2 min-w-[40px] min-h-[40px] flex items-center justify-center rounded text-slate-500 dark:text-[#a1a1aa] hover:bg-slate-100 dark:hover:bg-[#27272a]"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className={`text-xs font-bold w-6 text-center ${item.quantity >= item.product.currentStock ? 'text-amber-500 dark:text-amber-400' : 'text-slate-900 dark:text-white'}`}>
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => handleUpdateQuantity(item.product.id, 1)}
                    disabled={item.quantity >= item.product.currentStock}
                    className={`p-2 min-w-[40px] min-h-[40px] flex items-center justify-center rounded transition-colors ${
                      item.quantity >= item.product.currentStock
                        ? 'text-slate-300 dark:text-[#3f3f46] cursor-not-allowed'
                        : 'text-slate-500 dark:text-[#a1a1aa] hover:bg-slate-100 dark:hover:bg-[#27272a]'
                    }`}
                    title={item.quantity >= item.product.currentStock ? 'Estoque máximo atingido' : 'Adicionar mais'}
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>

                {/* Trash */}
                <button
                  onClick={() => handleRemoveItem(item.product.id)}
                  className="p-2.5 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Cart Totals & Discount Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-[#27272a] bg-slate-50 dark:bg-[#09090b]/50 space-y-3">
          {/* Discount Field */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-600 dark:text-[#a1a1aa] flex items-center gap-1">
              <Tag className="w-3.5 h-3.5 text-indigo-500" />
              Desconto (R$):
            </span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={discountAmount || ''}
              onChange={(e) => setDiscountAmount(parseFloat(e.target.value) || 0)}
              placeholder="0,00"
              className="w-24 px-2 py-1 bg-white dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] rounded-lg text-xs font-bold text-slate-900 dark:text-white text-right outline-none"
            />
          </div>

          <div className="space-y-1 text-xs">
            <div className="flex justify-between text-slate-500 dark:text-[#71717a]">
              <span>Subtotal:</span>
              <span className="font-semibold text-slate-700 dark:text-slate-300">R$ {cartSubtotal.toFixed(2)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-rose-600 dark:text-rose-400">
                <span>Desconto Aplicado:</span>
                <span className="font-semibold">- R$ {discountAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-extrabold text-slate-900 dark:text-white pt-2 border-t border-slate-200 dark:border-[#27272a]">
              <span>Total a Pagar:</span>
              <span className="text-xl text-emerald-600 dark:text-emerald-400 font-bold">
                R$ {cartTotal.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Checkout Button */}
          <button
            onClick={() => setIsPaymentOpen(true)}
            disabled={cart.length === 0 || !isCaixaOpen}
            className="w-full py-3.5 rounded-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2"
          >
            <CreditCard className="w-4 h-4" />
            <span>FINALIZAR VENDA (F8)</span>
          </button>
        </div>
      </div>

      {/* Payment Modal */}
      <PaymentModal
        isOpen={isPaymentOpen}
        onClose={() => setIsPaymentOpen(false)}
        cartItems={cart}
        customers={customers}
        selectedCustomer={selectedCustomer}
        setSelectedCustomer={setSelectedCustomer}
        subtotal={cartSubtotal}
        discount={discountAmount}
        setDiscount={setDiscountAmount}
        settings={settings}
        user={user}
        onSaleSuccess={(sale) => {
          setCompletedSale(sale);
          setIsReceiptOpen(true);
          setCart([]);
          setSelectedCustomer(null);
          setDiscountAmount(0);
        }}
      />

      {/* Thermal Receipt Modal */}
      <ThermalReceiptModal
        isOpen={isReceiptOpen}
        onClose={() => setIsReceiptOpen(false)}
        sale={completedSale}
        settings={settings}
        customers={customers}
        onNewSale={() => {
          setIsReceiptOpen(false);
          setCart([]);
          searchInputRef.current?.focus();
        }}
      />

      {/* Camera Barcode Scanner — Fullscreen */}
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

          {/* Video — fills remaining space */}
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

            {/* Success overlay — appears at top of camera when item is added */}
            {scanSuccessProduct && (
              <div className="absolute left-4 right-4 z-40 animate-[slideDown_0.25s_ease-out]" style={{ top: 'max(4rem, calc(env(safe-area-inset-top) + 1rem))' }}>
                <div className="p-4 bg-emerald-500/95 text-white rounded-2xl shadow-2xl backdrop-blur-sm border border-emerald-400/30">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-5 h-5 text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold truncate">{scanSuccessProduct.name}</p>
                      <p className="text-[11px] text-emerald-100 font-semibold">Adicionado ao carrinho!</p>
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
                      onClick={handleCloseScannerFromSuccess}
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
          </div>

          {/* Bottom sheet: status + manual input */}
          <div className="bg-white dark:bg-[#18181b] rounded-t-3xl px-4 pt-4 space-y-3 border-t border-slate-200 dark:border-[#27272a] max-h-[40vh] overflow-y-auto" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
            {/* Not found */}
            {scannerStatus === 'not_found' && (
              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-500/30 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                  <p className="text-sm font-bold text-amber-800 dark:text-amber-300">Produto não encontrado</p>
                </div>
                <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">
                  Código lido: <span className="font-mono font-bold">{scannedBarcode}</span>
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      stopScanner();
                      onNavigateToNewProduct(scannedBarcode);
                    }}
                    className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Package className="w-3.5 h-3.5" />
                    Cadastrar no Estoque
                  </button>
                  <button
                    onClick={() => {
                      setScannerStatus('scanning');
                      setScannedBarcode('');
                      setScannedProduct(null);
                      lastScannedRef.current = '';
                    }}
                    className="flex-1 py-2 rounded-xl bg-slate-100 dark:bg-[#27272a] hover:bg-slate-200 dark:hover:bg-[#3f3f46] text-slate-700 dark:text-slate-300 text-xs font-bold transition-colors"
                  >
                    Escanear Novamente
                  </button>
                </div>
              </div>
            )}

            {/* Manual barcode input */}
            {scannerStatus === 'scanning' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget as HTMLFormElement;
                  const input = form.elements.namedItem('manualBarcode') as HTMLInputElement;
                  if (input?.value) {
                    handleScanManualSubmit(input.value);
                    input.value = '';
                  }
                }}
                className="flex gap-2"
              >
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
    </div>
  );
};
