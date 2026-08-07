import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  ChefHat,
  CheckCircle2,
  ArrowLeft,
  Package,
  Loader2,
  QrCode,
  X,
} from 'lucide-react';
import { Product, Table, DigitalMenuConfig, CustomerSession, Sale } from '../../types';
import { storageService } from '../../services/storageService';
import { printRoutedItems } from '../../services/printService';
import { routeItemsToPrinters } from '../../services/printerRouting';

interface PublicMenuViewProps {
  tableToken: string;
  onClose: () => void;
}

interface CartItem {
  product: Product;
  quantity: number;
}

const CATEGORY_ORDER = ['Entradas', 'Pratos', 'Lanches', 'Pizzas', 'Bebidas', 'Sobremesas', 'Geral'];

export const PublicMenuView: React.FC<PublicMenuViewProps> = ({ tableToken, onClose }) => {
  const [table, setTable] = useState<Table | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [config, setConfig] = useState<DigitalMenuConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<CustomerSession | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [submitting, setSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [sessionId] = useState(() => crypto.randomUUID());

  // Load table and products
  useEffect(() => {
    const loadData = async () => {
      try {
        // Find table by QR token
        const tables = storageService.getTables();
        const foundTable = tables.find((t) => t.qrToken === tableToken);
        if (!foundTable) {
          setError('Mesa não encontrada. Verifique o QR Code.');
          setLoading(false);
          return;
        }
        setTable(foundTable);

        // Check for active session (1 device per mesa)
        const sessions = storageService.getCustomerSessions();
        const activeSession = sessions.find(
          (s) => s.tableId === foundTable.id && s.status === 'active'
        );

        if (activeSession && activeSession.sessionToken !== sessionId) {
          setError('Esta mesa já está sendo atendida por outro dispositivo. Aguarde ou chame o garçom.');
          setLoading(false);
          return;
        }

        // Create or use existing session
        if (!activeSession) {
          const newSession: CustomerSession = {
            id: crypto.randomUUID(),
            tableId: foundTable.id,
            sessionToken: sessionId,
            status: 'active',
            openedAt: new Date().toISOString(),
            deviceFingerprint: navigator.userAgent.slice(0, 100),
            storeBranchId: foundTable.storeBranchId,
            organizationId: foundTable.organizationId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          storageService.saveCustomerSession(newSession);
          setSession(newSession);
        } else {
          setSession(activeSession);
        }

        // Load products (show only active ones AND showOnCardapio = true)
        const allProducts = storageService.getProducts();
        setProducts(allProducts.filter((p) => p.active !== false && p.showOnCardapio !== false));

        // Load menu config
        setConfig(storageService.getDigitalMenuConfig());

        setLoading(false);
      } catch (err: any) {
        setError('Erro ao carregar o cardápio. Tente novamente.');
        setLoading(false);
      }
    };
    loadData();
  }, [tableToken, sessionId]);

  // Categories from products
  const categories = useMemo(() => {
    const cats = new Set(products.map((p) => p.category || 'Geral'));
    const ordered = CATEGORY_ORDER.filter((c) => cats.has(c));
    const remaining = Array.from(cats).filter((c) => !CATEGORY_ORDER.includes(c)).sort();
    return ['all', ...ordered, ...remaining];
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (selectedCategory === 'all') return products;
    return products.filter((p) => p.category === selectedCategory);
  }, [products, selectedCategory]);

  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.product.salePrice * item.quantity, 0);
  }, [cart]);

  const cartCount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  const addToCart = useCallback((product: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  }, []);

  const removeFromCart = useCallback((productId: string) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === productId);
      if (existing && existing.quantity > 1) {
        return prev.map((item) =>
          item.product.id === productId ? { ...item, quantity: item.quantity - 1 } : item
        );
      }
      return prev.filter((item) => item.product.id !== productId);
    });
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
  }, []);

  const handleSubmitOrder = async () => {
    if (cart.length === 0 || !table) return;
    setSubmitting(true);
    try {
      // Create one sale per batch of items
      const saleItems = cart.map((item) => ({
        productId: item.product.id,
        productName: item.product.name,
        unitPrice: item.product.salePrice,
        quantity: item.quantity,
        total: Math.round(item.product.salePrice * item.quantity * 100) / 100,
      }));

      const total = saleItems.reduce((sum, item) => sum + item.total, 0);

      const sale: Sale = {
        id: crypto.randomUUID(),
        code: `CARD-${Date.now().toString(36).toUpperCase()}`,
        date: new Date().toISOString(),
        operatorId: 'cardapio_digital',
        operatorName: 'Cliente (Cardápio Digital)',
        storeBranchId: table.storeBranchId,
        organizationId: table.organizationId,
        tableId: table.id,
        customerSessionId: session?.id || undefined,
        items: saleItems,
        subtotal: total,
        discount: 0,
        total,
        payments: [], // Will be set when comanda is closed
        status: 'pending', // Pending payment
        orderSource: 'cardapio_digital',
        kitchenStatus: 'pending',
        updatedAt: new Date().toISOString(),
      };

      storageService.addSale(sale);

      // Print to configured printers (routed by category: kitchen/bar/caixa)
      const printers = storageService.getPrinters();
      const allProducts = storageService.getProducts();
      const activePrinters = printers.filter((p) => p.transport !== 'os');

      if (activePrinters.length > 0) {
        // Route items to appropriate printers
        const routing = routeItemsToPrinters(sale.items, activePrinters, allProducts);
        for (const [printer, items] of routing.entries()) {
          try {
            const sectionLabel = printer.role === 'cozinha' ? 'Cozinha' : printer.role === 'bar' ? 'Bar' : 'Caixa';
            await printRoutedItems(sale, table, printer, items, sectionLabel);
          } catch (e) {
            // silent fail - printer may not be connected
          }
        }
      }

      setOrderSuccess(true);
      setCart([]);
    } catch (err: any) {
      setError('Erro ao enviar pedido. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#09090b] flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
          <p className="text-sm text-slate-500">Carregando cardápio...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#09090b] flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 flex items-center justify-center mx-auto">
            <QrCode className="w-8 h-8 text-rose-500" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Ops!</h2>
          <p className="text-sm text-slate-500">{error}</p>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-[#27272a] text-slate-700 dark:text-slate-300 font-bold text-xs"
          >
            Voltar
          </button>
        </div>
      </div>
    );
  }

  if (orderSuccess) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#09090b] flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Pedido Enviado!</h2>
          <p className="text-sm text-slate-500">
            Seu pedido foi enviado para a cozinha/bar. Em breve estará pronto!
          </p>
          <p className="text-xs text-slate-400">
            Você pode fazer mais pedidos ou fechar a comanda quando decidir ir embora.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => setOrderSuccess(false)}
              className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs"
            >
              Fazer Mais Pedidos
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#09090b] flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white dark:bg-[#18181b] border-b border-slate-200 dark:border-[#27272a] px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">
            {config?.title || 'Cardápio Digital'}
          </h1>
          <p className="text-xs text-slate-500">
            {table?.name} • {config?.subtitle || 'Escolha seus produtos'}
          </p>
        </div>
        <button
          onClick={() => setShowCart(true)}
          className="relative p-2 rounded-xl bg-indigo-600 text-white"
        >
          <ShoppingCart className="w-5 h-5" />
          {cartCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
              {cartCount}
            </span>
          )}
        </button>
      </div>

      {/* Category Pills */}
      <div className="px-4 py-3 overflow-x-auto">
        <div className="flex gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
                selectedCategory === cat
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white dark:bg-[#18181b] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-[#27272a]'
              }`}
            >
              {cat === 'all' ? 'Todos' : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Products Grid */}
      <div className="flex-1 px-4 pb-24 overflow-y-auto">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filteredProducts.map((product) => {
            const inCart = cart.find((item) => item.product.id === product.id);
            return (
              <div
                key={product.id}
                className="bg-white dark:bg-[#18181b] rounded-2xl border border-slate-200 dark:border-[#27272a] overflow-hidden flex flex-col"
              >
                {/* Image */}
                <div className="w-full aspect-square bg-slate-100 dark:bg-[#09090b] relative">
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxMjAiIGhlaWdodD0iMTIwIiBmaWxsPSIjZjBmOGY4Ii8+PC9zdmc+';
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="w-8 h-8 text-slate-300" />
                    </div>
                  )}
                  {product.currentStock <= 0 && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <span className="text-white text-xs font-bold">Esgotado</span>
                    </div>
                  )}
                </div>
                {/* Info */}
                <div className="p-3 flex-1 flex flex-col">
                  <p className="text-xs font-bold text-slate-900 dark:text-white line-clamp-2 mb-1">
                    {product.name}
                  </p>
                  <div className="mt-auto flex items-center justify-between">
                    <span className="text-sm font-bold text-emerald-600">
                      {config?.showPrices !== false ? `R$ ${product.salePrice.toFixed(2)}` : 'Consultar'}
                    </span>
                    {product.currentStock > 0 && config?.showPrices !== false && (
                      <button
                        onClick={() => addToCart(product)}
                        className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-500"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {inCart && (
                    <div className="mt-2 flex items-center justify-between bg-indigo-50 dark:bg-indigo-500/10 rounded-lg p-1">
                      <button
                        onClick={() => removeFromCart(product.id)}
                        className="w-6 h-6 rounded-full bg-white dark:bg-[#18181b] text-indigo-600 flex items-center justify-center"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-xs font-bold text-indigo-600">{inCart.quantity}</span>
                      <button
                        onClick={() => addToCart(product)}
                        className="w-6 h-6 rounded-full bg-white dark:bg-[#18181b] text-indigo-600 flex items-center justify-center"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {filteredProducts.length === 0 && (
          <div className="text-center py-12 text-sm text-slate-400">
            Nenhum produto nesta categoria.
          </div>
        )}
      </div>

      {/* Cart Modal */}
      {showCart && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={() => setShowCart(false)}>
          <div className="bg-white dark:bg-[#18181b] w-full max-w-md max-h-[80vh] rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-200 dark:border-[#27272a] flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Seu Pedido ({cartCount} itens)</h3>
              <button onClick={() => setShowCart(false)} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {cart.map((item) => (
                <div key={item.product.id} className="flex items-center gap-3 p-2 rounded-xl bg-slate-50 dark:bg-[#09090b]">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{item.product.name}</p>
                    <p className="text-[10px] text-slate-500">R$ {item.product.salePrice.toFixed(2)} cada</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => removeFromCart(item.product.id)} className="w-6 h-6 rounded-full bg-slate-200 dark:bg-[#27272a] flex items-center justify-center">
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="text-xs font-bold w-4 text-center">{item.quantity}</span>
                    <button onClick={() => addToCart(item.product)} className="w-6 h-6 rounded-full bg-slate-200 dark:bg-[#27272a] flex items-center justify-center">
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                  <span className="text-xs font-bold text-slate-900 dark:text-white w-16 text-right">
                    R$ {(item.product.salePrice * item.quantity).toFixed(2)}
                  </span>
                </div>
              ))}
              {cart.length === 0 && (
                <div className="text-center py-8 text-sm text-slate-400">
                  Carrinho vazio. Adicione produtos do cardápio.
                </div>
              )}
            </div>
            {cart.length > 0 && (
              <div className="p-4 border-t border-slate-200 dark:border-[#27272a] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Total</span>
                  <span className="text-lg font-bold text-slate-900 dark:text-white">R$ {cartTotal.toFixed(2)}</span>
                </div>
                <button
                  onClick={handleSubmitOrder}
                  disabled={submitting}
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
                  ) : (
                    <><ChefHat className="w-4 h-4" /> Enviar Pedido para Cozinha</>
                  )}
                </button>
                <button
                  onClick={clearCart}
                  className="w-full py-2 rounded-xl text-rose-500 font-bold text-xs"
                >
                  Limpar Carrinho
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating Cart Button (mobile) */}
      {cartCount > 0 && !showCart && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-64">
          <button
            onClick={() => setShowCart(true)}
            className="w-full py-3 rounded-xl bg-indigo-600 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg"
          >
            <ShoppingCart className="w-4 h-4" />
            Ver Pedido ({cartCount}) • R$ {cartTotal.toFixed(2)}
          </button>
        </div>
      )}
    </div>
  );
};
