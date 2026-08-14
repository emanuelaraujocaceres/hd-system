import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  ArrowLeft,
  Package,
  Loader2,
  Eye,
  Users,
} from 'lucide-react';
import { Product, Table, DigitalMenuConfig, Sale, UserProfile } from '../../types';
import { storageService } from '../../services/storageService';
import { printRoutedItems } from '../../services/printService';
import { routeItemsToPrinters } from '../../services/printerRouting';

interface CardapioPreviewViewProps {
  products: Product[];
  user: UserProfile;
}

interface CartItem {
  product: Product;
  quantity: number;
}

export const CardapioPreviewView: React.FC<CardapioPreviewViewProps> = ({ products, user }) => {
  const [config, setConfig] = useState<DigitalMenuConfig | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [submitting, setSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);

  // Load menu config
  useEffect(() => {
    setConfig(storageService.getDigitalMenuConfig());
  }, []);

  // Filter products: only active AND showOnCardapio = true
  const filteredProducts = useMemo(() => {
    return products.filter((p) => p.active !== false && p.showOnCardapio !== false);
  }, [products]);

  // Categories from products
  const categories = useMemo(() => {
    const cats = new Set(filteredProducts.map((p) => p.category || 'Geral'));
    const ordered = ['Entradas', 'Pratos', 'Lanches', 'Pizzas', 'Bebidas', 'Sobremesas', 'Geral'].filter((c) => cats.has(c));
    const remaining = Array.from(cats).filter((c) => !['Entradas', 'Pratos', 'Lanches', 'Pizzas', 'Bebidas', 'Sobremesas', 'Geral'].includes(c)).sort();
    return ['all', ...ordered, ...remaining];
  }, [filteredProducts]);

  const categoryFiltered = useMemo(() => {
    if (selectedCategory === 'all') return filteredProducts;
    return filteredProducts.filter((p) => p.category === selectedCategory);
  }, [filteredProducts, selectedCategory]);

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
    if (cart.length === 0) return;
    setSubmitting(true);
    try {
      // Create sale with table name "Caixa" (collaborator/admin order)
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
        code: `CAIXA-${Date.now().toString(36).toUpperCase()}`,
        date: new Date().toISOString(),
        operatorId: user.id,
        operatorName: `${user.name} (Caixa)`,
        storeBranchId: user.storeBranchId,
        organizationId: user.organizationId,
        customerName: 'Caixa',
        items: saleItems,
        subtotal: total,
        discount: 0,
        total,
        payments: [],
        status: 'pending',
        orderSource: 'cardapio_digital',
        kitchenStatus: 'pending',
        updatedAt: new Date().toISOString(),
      };

      storageService.addSale(sale);

      // Print to configured printers (routed by category)
      const printers = storageService.getPrinters();
      const activePrinters = printers.filter((p) => p.transport !== 'os');

      if (activePrinters.length > 0) {
        // Create virtual table for "Caixa"
        const caixaTable: Table = {
          id: 'caixa',
          name: 'Caixa',
          qrToken: '',
          status: 'active',
          storeBranchId: user.storeBranchId,
          organizationId: user.organizationId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const routing = routeItemsToPrinters(sale.items, activePrinters, products);
        for (const [printer, items] of routing.entries()) {
          try {
            const sectionLabel = printer.role === 'cozinha' ? 'Cozinha' : printer.role === 'bar' ? 'Bar' : 'Caixa';
            await printRoutedItems(sale, caixaTable, printer, items, sectionLabel);
          } catch (e) {
            // silent fail
          }
        }
      }

      setOrderSuccess(true);
      setCart([]);
    } catch (err: any) {
      // silent fail
    } finally {
      setSubmitting(false);
    }
  };

  if (orderSuccess) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4 max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Pedido Registrado!</h2>
          <p className="text-sm text-slate-500">
            Pedido registrado como <strong>Caixa</strong>. A cozinha/bar receberá o pedido.
          </p>
          <button
            onClick={() => setOrderSuccess(false)}
            className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs"
          >
            Fazer Outro Pedido
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Eye className="w-6 h-6 text-teal-600 dark:text-teal-400" />
            Cardápio Digital (Preview)
            <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20 font-sans font-bold uppercase tracking-widest">
              Visualização
            </span>
          </h2>
          <p className="text-xs text-slate-500">
            Assim como o cliente vê. Pedidos feitos aqui saem como <strong>"Caixa"</strong>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20">
            {filteredProducts.length} produto(s) visível(is)
          </span>
        </div>
      </div>

      {/* Category Pills */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
              selectedCategory === cat
                ? 'bg-teal-600 text-white'
                : 'bg-white dark:bg-[#18181b] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-[#27272a]'
            }`}
          >
            {cat === 'all' ? 'Todos' : cat}
          </button>
        ))}
      </div>

      {/* Products Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {categoryFiltered.map((product) => {
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
              </div>
              {/* Info */}
              <div className="p-3 flex-1 flex flex-col">
                <p className="text-xs font-bold text-slate-900 dark:text-white line-clamp-2 mb-1">
                  {product.name}
                </p>
                <div className="mt-auto flex items-center justify-between">
                  <div className="flex flex-col">
                    {config?.showPrices !== false ? (
                      product.tvPromoPrice && product.tvPromoPrice > 0 && product.tvPromoPrice < (product.salePrice ?? 0) ? (
                        <>
                          <span className="text-[10px] font-bold text-rose-500 line-through">
                            R$ {(product.salePrice ?? 0).toFixed(2)}
                          </span>
                          <span className="text-sm font-bold text-emerald-600">
                            R$ {product.tvPromoPrice.toFixed(2)}
                          </span>
                        </>
                      ) : (
                        <span className="text-sm font-bold text-emerald-600">
                          R$ {(product.salePrice ?? 0).toFixed(2)}
                        </span>
                      )
                    ) : (
                      <span className="text-sm font-bold text-emerald-600">Consultar</span>
                    )}
                  </div>
                  {product.currentStock > 0 && config?.showPrices !== false && (
                    <button
                      onClick={() => addToCart(product)}
                      className="w-8 h-8 rounded-full bg-teal-600 text-white flex items-center justify-center hover:bg-teal-500"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {inCart && (
                  <div className="mt-2 flex items-center justify-between bg-teal-50 dark:bg-teal-500/10 rounded-lg p-1">
                    <button
                      onClick={() => removeFromCart(product.id)}
                      className="w-6 h-6 rounded-full bg-white dark:bg-[#18181b] text-teal-600 flex items-center justify-center"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="text-xs font-bold text-teal-600">{inCart.quantity}</span>
                    <button
                      onClick={() => addToCart(product)}
                      className="w-6 h-6 rounded-full bg-white dark:bg-[#18181b] text-teal-600 flex items-center justify-center"
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

      {categoryFiltered.length === 0 && (
        <div className="text-center py-12 text-sm text-slate-400">
          Nenhum produto visível no cardápio.
          <p className="text-xs mt-1">Ative "Exibir no Cardápio Digital" nos produtos do estoque.</p>
        </div>
      )}

      {/* Cart Modal */}
      {showCart && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={() => setShowCart(false)}>
          <div className="bg-white dark:bg-[#18181b] w-full max-w-md max-h-[80vh] rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-200 dark:border-[#27272a] flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Users className="w-4 h-4" />
                Pedido Caixa ({cartCount} itens)
              </h3>
              <button onClick={() => setShowCart(false)} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100">
                <span className="text-lg">✕</span>
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
                  Carrinho vazio.
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
                  className="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
                  ) : (
                    <><ShoppingCart className="w-4 h-4" /> Enviar para Cozinha/Bar</>
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

      {/* Floating Cart Button */}
      {cartCount > 0 && !showCart && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-64">
          <button
            onClick={() => setShowCart(true)}
            className="w-full py-3 rounded-xl bg-teal-600 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg"
          >
            <ShoppingCart className="w-4 h-4" />
            Ver Pedido ({cartCount}) • R$ {cartTotal.toFixed(2)}
          </button>
        </div>
      )}
    </div>
  );
};
