/**
 * DeliveryClientView - Tela do cliente para fazer pedidos de delivery (VERSÃO COMPLETA)
 * 
 * Melhorias de UX:
 * - Landing page com status aberto/fechado
 * - Busca de produtos
 * - Categorias com scroll horizontal
 * - Carrinho flutuante sempre visível
 * - Indicador de progresso no checkout
 * - Empty states amigáveis
 * - Feedback visual (toasts)
 * - Produtos com thumbnail e descrição
 */

import React, { useState, useEffect, useMemo } from 'react';
import { ShoppingCart, Plus, Minus, Trash2, MapPin, User, Phone, CreditCard, Banknote, DollarSign, CheckCircle, Clock, Truck, Package, AlertCircle, Loader2, X, ChevronRight, Search, Star } from 'lucide-react';
import { Product, StoreBranch, DeliverySettings, DeliveryOrder, DeliveryOrderItem, DeliveryAddress } from '../../types';
import { storageService } from '../../services/storageService';
import { useToast } from '../shared/Toast';
import { EmptyState } from '../shared/EmptyState';
import { DeliveryStatusBadge, useDeliveryStatus } from './DeliveryStatus';

interface DeliveryClientViewProps {
  branch: StoreBranch;
  onOrderPlaced?: (order: DeliveryOrder) => void;
}

type CartItem = DeliveryOrderItem & { product: Product };
type Step = 'welcome' | 'menu' | 'cart' | 'address' | 'payment' | 'tracking';

export const DeliveryClientView: React.FC<DeliveryClientViewProps> = ({ branch, onOrderPlaced }) => {
  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<DeliverySettings | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [step, setStep] = useState<Step>('welcome');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [orderType, setOrderType] = useState<'delivery' | 'pickup'>('delivery');
  
  // Dados do cliente
  const [customerName, setCustomerName] = useState('');
  const [customerWhatsapp, setCustomerWhatsapp] = useState('');
  
  // Endereço
  const [address, setAddress] = useState<DeliveryAddress>({
    street: '', number: '', complement: '', neighborhood: '', city: '', state: '', zip: '',
  });
  
  // Pagamento
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'credit_card' | 'debit_card' | 'pix'>('pix');
  const [changeAmount, setChangeAmount] = useState<number>(0);
  const [notes, setNotes] = useState('');
  
  // Status
  const [saving, setSaving] = useState(false);
  const [lastOrder, setLastOrder] = useState<DeliveryOrder | null>(null);
  const deliveryStatus = useDeliveryStatus(branch.id);

  useEffect(() => {
    loadData();
  }, [branch.id]);

  const loadData = () => {
    const allProducts = storageService.getProducts();
    const filtered = allProducts.filter(p => p.active !== false && p.showOnCardapio !== false);
    setProducts(filtered);
    
    const s = storageService.getDeliverySettings();
    if (s && s.storeBranchId === branch.id) {
      setSettings(s);
    }
  };

  // Categorias dos produtos
  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.category || 'Geral'));
    return ['all', ...Array.from(cats).sort()];
  }, [products]);

  // Produtos filtrados (busca + categoria)
  const filteredProducts = useMemo(() => {
    let result = products;
    
    // Filtro por categoria
    if (selectedCategory !== 'all') {
      result = result.filter(p => p.category === selectedCategory);
    }
    
    // Filtro por busca
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(p => 
        p.name.toLowerCase().includes(term) ||
        (p.description && p.description.toLowerCase().includes(term))
      );
    }
    
    return result;
  }, [products, selectedCategory, searchTerm]);

  // Cálculo de taxa de entrega
  const deliveryFee = useMemo(() => {
    if (orderType === 'pickup' || !settings) return 0;
    
    switch (settings.feeCalculationType) {
      case 'free': return 0;
      case 'fixed': return settings.fixedFee;
      case 'neighborhood': {
        const neighborhood = storageService.getDeliveryNeighborhoods()
          .find(n => n.storeBranchId === branch.id && 
            n.neighborhood.toLowerCase() === address.neighborhood.toLowerCase());
        return neighborhood?.fee ?? settings.fixedFee;
      }
      case 'distance': return settings.fixedFee;
      default: return 0;
    }
  }, [orderType, settings, address.neighborhood, branch.id]);

  // Totais
  const subtotal = useMemo(() => cart.reduce((acc, item) => acc + item.total, 0), [cart]);
  const total = subtotal + deliveryFee;

  // Carrinho
  const addToCart = (product: Product) => {
    const existing = cart.find(item => item.productId === product.id);
    if (existing) {
      setCart(cart.map(item => 
        item.productId === product.id 
          ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * item.unitPrice }
          : item
      ));
    } else {
      setCart([...cart, {
        productId: product.id,
        productName: product.name,
        unitPrice: product.salePrice,
        quantity: 1,
        total: product.salePrice,
        product,
      }]);
    }
    toastInfo(`${product.name} adicionado!`);
  };

  const removeFromCart = (productId: string) => {
    const existing = cart.find(item => item.productId === productId);
    if (existing && existing.quantity > 1) {
      setCart(cart.map(item => 
        item.productId === productId 
          ? { ...item, quantity: item.quantity - 1, total: (item.quantity - 1) * item.unitPrice }
          : item
      ));
    } else {
      setCart(cart.filter(item => item.productId !== productId));
    }
  };

  const deleteFromCart = (productId: string) => {
    setCart(cart.filter(item => item.productId !== productId));
  };

  const cartItemCount = useMemo(() => cart.reduce((acc, item) => acc + item.quantity, 0), [cart]);

  // Finalizar pedido
  const handlePlaceOrder = () => {
    if (!customerName.trim()) {
      toastError('Informe seu nome');
      return;
    }
    if (!customerWhatsapp.trim()) {
      toastError('Informe seu WhatsApp');
      return;
    }
    if (orderType === 'delivery' && !address.street.trim()) {
      toastError('Informe o endereço de entrega');
      return;
    }
    if (settings?.minimumOrderValue && subtotal < settings.minimumOrderValue) {
      toastError(`Pedido mínimo: R$ ${settings.minimumOrderValue.toFixed(2)}`);
      return;
    }

    setSaving(true);
    try {
      const orderItems: DeliveryOrderItem[] = cart.map(item => ({
        productId: item.productId,
        productName: item.productName,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        total: item.total,
      }));

      const order: DeliveryOrder = {
        id: crypto.randomUUID(),
        organizationId: branch.organizationId || '',
        storeBranchId: branch.id,
        orderType,
        status: 'pending',
        items: orderItems,
        subtotal,
        deliveryFee,
        discount: 0,
        total,
        paymentMethod,
        changeAmount: paymentMethod === 'cash' ? changeAmount : undefined,
        deliveryAddress: orderType === 'delivery' ? address : undefined,
        customerName,
        customerWhatsapp,
        notes,
        estimatedDeliveryTime: settings?.estimatedDeliveryTime,
        whatsappSent: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      storageService.saveDeliveryOrder(order);
      setLastOrder(order);
      setStep('tracking');
      onOrderPlaced?.(order);
      toastSuccess('Pedido realizado com sucesso!');
    } catch (err: any) {
      toastError(err.message || 'Erro ao fazer pedido');
    } finally {
      setSaving(false);
    }
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'pending': return { label: 'Pendente', color: 'text-slate-500', icon: Clock, step: 1 };
      case 'confirmed': return { label: 'Confirmado', color: 'text-blue-500', icon: CheckCircle, step: 2 };
      case 'preparing': return { label: 'Preparando', color: 'text-amber-500', icon: Package, step: 3 };
      case 'ready': return { label: 'Pronto', color: 'text-emerald-500', icon: Package, step: 4 };
      case 'out_for_delivery': return { label: 'Saiu p/ Entrega', color: 'text-orange-500', icon: Truck, step: 5 };
      case 'delivered': return { label: 'Entregue!', color: 'text-green-600', icon: CheckCircle, step: 6 };
      case 'cancelled': return { label: 'Cancelado', color: 'text-rose-500', icon: AlertCircle, step: 0 };
      default: return { label: status, color: 'text-slate-500', icon: Clock, step: 1 };
    }
  };

  const statusSteps = [
    { key: 'pending', label: 'Pendente' },
    { key: 'confirmed', label: 'Confirmado' },
    { key: 'preparing', label: 'Preparando' },
    { key: 'ready', label: 'Pronto' },
    { key: 'out_for_delivery', label: 'Em Entrega' },
    { key: 'delivered', label: 'Entregue' },
  ];

  // ============ RENDERIZAÇÃO ============

  // Welcome / Landing Page
  if (step === 'welcome') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white dark:from-[#09090b] dark:to-[#18181b]">
        {/* Header */}
        <div className="relative p-6 pb-12 text-center bg-gradient-to-br from-orange-500 to-amber-500 text-white">
          <h1 className="text-3xl font-bold mb-2">{branch.name}</h1>
          <p className="text-sm opacity-90">Delivery</p>
          <div className="absolute -bottom-6 left-1/2 -translate-x-1/2">
            <DeliveryStatusBadge branchId={branch.id} />
          </div>
        </div>

        {/* Info Cards */}
        <div className="px-4 pt-12 space-y-4 max-w-md mx-auto">
          {/* Horário e Taxa */}
          <div className="p-4 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-orange-500" />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {branch.fullAddress || branch.address || 'Endereço não informado'}
                </span>
              </div>
            </div>
            {settings && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Taxa de entrega:</span>
                <span className="font-bold text-orange-500">
                  {settings.feeCalculationType === 'free' ? 'Grátis' : 
                   settings.feeCalculationType === 'fixed' ? `R$ ${settings.fixedFee.toFixed(2)}` : 'Por bairro'}
                </span>
              </div>
            )}
            {settings?.minimumOrderValue && settings.minimumOrderValue > 0 && (
              <div className="flex items-center justify-between text-xs mt-1">
                <span className="text-slate-500">Pedido mínimo:</span>
                <span className="font-bold text-slate-700 dark:text-slate-300">R$ {settings.minimumOrderValue.toFixed(2)}</span>
              </div>
            )}
          </div>

          {/* Botão Principal */}
          {deliveryStatus.isOpen ? (
            <button
              onClick={() => setStep('menu')}
              className="w-full py-4 rounded-2xl bg-orange-500 hover:bg-orange-400 text-white font-bold text-base shadow-lg shadow-orange-500/30 flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              <ShoppingCart className="w-5 h-5" />
              Ver Cardápio
            </button>
          ) : (
            <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-center">
              <AlertCircle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
              <p className="text-sm font-bold text-rose-700 dark:text-rose-300">Estamos fechados agora</p>
              {deliveryStatus.nextOpenTime && (
                <p className="text-xs text-rose-600 mt-1">Abre às {deliveryStatus.nextOpenTime}</p>
              )}
            </div>
          )}

          {/* Ações Rápidas */}
          <div className="grid grid-cols-3 gap-3">
            <a
              href={`tel:${branch.phone}`}
              className="p-3 rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-center"
            >
              <Phone className="w-5 h-5 text-blue-500 mx-auto mb-1" />
              <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-400">Ligar</span>
            </a>
            <button className="p-3 rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-center">
              <MapPin className="w-5 h-5 text-green-500 mx-auto mb-1" />
              <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-400">Local</span>
            </button>
            <button className="p-3 rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-center">
              <Star className="w-5 h-5 text-amber-500 mx-auto mb-1" />
              <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-400">Favoritar</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Menu / Cardápio
  if (step === 'menu') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#09090b] pb-24">
        {/* Header */}
        <div className="sticky top-0 z-10 p-4 bg-white dark:bg-[#18181b] border-b border-slate-200 dark:border-[#27272a]">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">{branch.name}</h1>
            <button
              onClick={() => setStep('cart')}
              className="relative p-2 rounded-xl bg-orange-500 text-white"
            >
              <ShoppingCart className="w-5 h-5" />
              {cartItemCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {cartItemCount}
                </span>
              )}
            </button>
          </div>
          
          {/* Busca */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar produto..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-100 dark:bg-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 outline-none"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            )}
          </div>

          {/* Categorias */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                  selectedCategory === cat
                    ? 'bg-orange-500 text-white'
                    : 'bg-slate-100 dark:bg-[#27272a] text-slate-600 dark:text-slate-400'
                }`}
              >
                {cat === 'all' ? 'Todos' : cat}
              </button>
            ))}
          </div>
        </div>

        {/* Produtos */}
        <div className="p-4">
          {filteredProducts.length === 0 ? (
            <EmptyState
              type="search"
              title="Nenhum produto encontrado"
              description={searchTerm ? `Nenhum resultado para "${searchTerm}"` : 'Não há produtos nesta categoria'}
              action={{ label: 'Limpar busca', onClick: () => { setSearchTerm(''); setSelectedCategory('all'); } }}
            />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {filteredProducts.map(product => {
                const inCart = cart.find(item => item.productId === product.id);
                return (
                  <div
                    key={product.id}
                    className="p-3 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] space-y-2"
                  >
                    {product.imageUrl && (
                      <img src={product.imageUrl} alt={product.name} className="w-full h-24 object-cover rounded-xl" />
                    )}
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white line-clamp-1">{product.name}</p>
                      {product.description && (
                        <p className="text-[10px] text-slate-500 line-clamp-1">{product.description}</p>
                      )}
                      <p className="text-sm font-bold text-orange-500 mt-1">R$ {product.salePrice.toFixed(2)}</p>
                    </div>
                    {inCart ? (
                      <div className="flex items-center justify-between">
                        <button onClick={() => removeFromCart(product.id)} className="p-1.5 rounded-lg bg-slate-100 dark:bg-[#27272a]">
                          <Minus className="w-4 h-4 text-slate-600" />
                        </button>
                        <span className="text-xs font-bold">{inCart.quantity}</span>
                        <button onClick={() => addToCart(product)} className="p-1.5 rounded-lg bg-orange-500">
                          <Plus className="w-4 h-4 text-white" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => addToCart(product)}
                        className="w-full py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-xs font-bold flex items-center justify-center gap-1 active:scale-95 transition-all"
                      >
                        <Plus className="w-3 h-3" /> Adicionar
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Carrinho Flutuante */}
        {cartItemCount > 0 && (
          <div className="fixed bottom-4 left-4 right-4 z-20">
            <button
              onClick={() => setStep('cart')}
              className="w-full p-4 rounded-2xl bg-orange-500 hover:bg-orange-400 text-white shadow-lg shadow-orange-500/30 flex items-center justify-between active:scale-98 transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <span className="text-sm font-bold">{cartItemCount}</span>
                </div>
                <span className="font-bold">Ver carrinho</span>
              </div>
              <span className="text-lg font-bold">R$ {total.toFixed(2)}</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  // Carrinho
  if (step === 'cart') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#09090b] pb-24">
        <div className="sticky top-0 z-10 p-4 bg-white dark:bg-[#18181b] border-b border-slate-200 dark:border-[#27272a]">
          <div className="flex items-center gap-3">
            <button onClick={() => setStep('menu')} className="p-2 rounded-xl bg-slate-100 dark:bg-[#27272a]">
              <X className="w-4 h-4 text-slate-600" />
            </button>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Seu Pedido</h2>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {cart.length === 0 ? (
            <EmptyState
              type="cart"
              title="Carrinho vazio"
              description="Adicione itens do cardápio para continuar"
              action={{ label: 'Ver cardápio', onClick: () => setStep('menu') }}
            />
          ) : (
            <>
              {/* Escolha Entrega/Retirada */}
              <div className="flex gap-2">
                <button
                  onClick={() => setOrderType('delivery')}
                  className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                    orderType === 'delivery' ? 'bg-orange-500 text-white' : 'bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-slate-600'
                  }`}
                >
                  🛵 Entrega
                  {deliveryFee > 0 && <span className="text-[10px]">+R$ {deliveryFee.toFixed(2)}</span>}
                </button>
                <button
                  onClick={() => setOrderType('pickup')}
                  className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                    orderType === 'pickup' ? 'bg-blue-500 text-white' : 'bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-slate-600'
                  }`}
                >
                  🏪 Retirada (Grátis)
                </button>
              </div>

              {/* Itens */}
              {cart.map(item => (
                <div key={item.productId} className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a]">
                  <div className="flex-1">
                    <p className="text-xs font-bold text-slate-900 dark:text-white">{item.productName}</p>
                    <p className="text-xs text-slate-500">R$ {item.unitPrice.toFixed(2)} x {item.quantity}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => removeFromCart(item.productId)} className="p-1 rounded-lg bg-slate-100 dark:bg-[#27272a]">
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="text-xs font-bold w-4 text-center">{item.quantity}</span>
                    <button onClick={() => addToCart(item.product)} className="p-1 rounded-lg bg-orange-500">
                      <Plus className="w-3 h-3 text-white" />
                    </button>
                    <button onClick={() => deleteFromCart(item.productId)} className="p-1 rounded-lg text-rose-500">
                      <Trash2 className="w-3 h-3" />
                    </button>
                    <span className="text-xs font-bold text-slate-900 dark:text-white ml-2">R$ {item.total.toFixed(2)}</span>
                  </div>
                </div>
              ))}

              {/* Resumo */}
              <div className="p-4 rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Subtotal</span>
                  <span className="font-bold text-slate-900 dark:text-white">R$ {subtotal.toFixed(2)}</span>
                </div>
                {orderType === 'delivery' && deliveryFee > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Taxa de entrega</span>
                    <span className="font-bold text-slate-900 dark:text-white">R$ {deliveryFee.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold border-t border-slate-200 dark:border-[#27272a] pt-2">
                  <span>Total</span>
                  <span className="text-orange-500">R$ {total.toFixed(2)}</span>
                </div>
              </div>
            </>
          )}
        </div>

        {cart.length > 0 && (
          <div className="fixed bottom-4 left-4 right-4 z-20">
            <button
              onClick={() => setStep('address')}
              className="w-full py-4 rounded-2xl bg-orange-500 hover:bg-orange-400 text-white font-bold text-sm shadow-lg shadow-orange-500/30 flex items-center justify-center gap-2 active:scale-98 transition-all"
            >
              Continuar <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    );
  }

  // Endereço
  if (step === 'address') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#09090b] pb-24">
        <div className="sticky top-0 z-10 p-4 bg-white dark:bg-[#18181b] border-b border-slate-200 dark:border-[#27272a]">
          <div className="flex items-center gap-3">
            <button onClick={() => setStep('cart')} className="p-2 rounded-xl bg-slate-100 dark:bg-[#27272a]">
              <X className="w-4 h-4 text-slate-600" />
            </button>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Seus Dados</h2>
              <p className="text-[10px] text-slate-500">Etapa 2 de 3</p>
            </div>
          </div>
          {/* Progress */}
          <div className="flex gap-1 mt-3">
            <div className="flex-1 h-1 rounded bg-orange-500" />
            <div className="flex-1 h-1 rounded bg-orange-500" />
            <div className="flex-1 h-1 rounded bg-slate-200 dark:bg-[#27272a]" />
          </div>
        </div>

        <div className="p-4 space-y-4">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Nome *</label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Seu nome"
                className="w-full px-3 py-2.5 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">WhatsApp *</label>
              <input
                type="text"
                value={customerWhatsapp}
                onChange={(e) => setCustomerWhatsapp(e.target.value)}
                placeholder="11999999999"
                className="w-full px-3 py-2.5 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
              />
            </div>

            {orderType === 'delivery' && (
              <>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Rua *</label>
                  <input
                    type="text"
                    value={address.street}
                    onChange={(e) => setAddress({ ...address, street: e.target.value })}
                    placeholder="Nome da rua"
                    className="w-full px-3 py-2.5 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Número *</label>
                    <input
                      type="text"
                      value={address.number}
                      onChange={(e) => setAddress({ ...address, number: e.target.value })}
                      placeholder="123"
                      className="w-full px-3 py-2.5 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Complemento</label>
                    <input
                      type="text"
                      value={address.complement}
                      onChange={(e) => setAddress({ ...address, complement: e.target.value })}
                      placeholder="Apto 1"
                      className="w-full px-3 py-2.5 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Bairro *</label>
                  <input
                    type="text"
                    value={address.neighborhood}
                    onChange={(e) => setAddress({ ...address, neighborhood: e.target.value })}
                    placeholder="Nome do bairro"
                    className="w-full px-3 py-2.5 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
                  />
                </div>
              </>
            )}
          </div>
        </div>

        <div className="fixed bottom-4 left-4 right-4 z-20">
          <button
            onClick={() => setStep('payment')}
            className="w-full py-4 rounded-2xl bg-orange-500 hover:bg-orange-400 text-white font-bold text-sm shadow-lg shadow-orange-500/30 flex items-center justify-center gap-2 active:scale-98 transition-all"
          >
            Continuar <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // Pagamento
  if (step === 'payment') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#09090b] pb-24">
        <div className="sticky top-0 z-10 p-4 bg-white dark:bg-[#18181b] border-b border-slate-200 dark:border-[#27272a]">
          <div className="flex items-center gap-3">
            <button onClick={() => setStep('address')} className="p-2 rounded-xl bg-slate-100 dark:bg-[#27272a]">
              <X className="w-4 h-4 text-slate-600" />
            </button>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Pagamento</h2>
              <p className="text-[10px] text-slate-500">Etapa 3 de 3</p>
            </div>
          </div>
          {/* Progress */}
          <div className="flex gap-1 mt-3">
            <div className="flex-1 h-1 rounded bg-orange-500" />
            <div className="flex-1 h-1 rounded bg-orange-500" />
            <div className="flex-1 h-1 rounded bg-orange-500" />
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Formas de pagamento */}
          <div className="space-y-2">
            {([
              { key: 'pix', label: 'PIX', icon: DollarSign, color: 'text-orange-500', desc: 'WhatsApp' },
              { key: 'cash', label: 'Dinheiro', icon: Banknote, color: 'text-green-500', desc: 'Troco?' },
              { key: 'credit_card', label: 'Cartão de Crédito', icon: CreditCard, color: 'text-blue-500', desc: 'Maquininha' },
              { key: 'debit_card', label: 'Cartão de Débito', icon: CreditCard, color: 'text-purple-500', desc: 'Maquininha' },
            ] as const).map(({ key, label, icon: Icon, color, desc }) => (
              <button
                key={key}
                onClick={() => setPaymentMethod(key)}
                className={`w-full p-4 rounded-xl flex items-center gap-3 transition-all ${
                  paymentMethod === key ? 'bg-orange-500/10 border-2 border-orange-500' : 'bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a]'
                }`}
              >
                <Icon className={`w-5 h-5 ${color}`} />
                <div className="flex-1 text-left">
                  <p className="text-xs font-bold text-slate-900 dark:text-white">{label}</p>
                  <p className="text-[10px] text-slate-500">{desc}</p>
                </div>
                {paymentMethod === key && <CheckCircle className="w-5 h-5 text-orange-500" />}
              </button>
            ))}
          </div>

          {paymentMethod === 'cash' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Troco para quanto?</label>
              <input
                type="number"
                value={changeAmount || ''}
                onChange={(e) => setChangeAmount(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                className="w-full px-3 py-2.5 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
              />
              {changeAmount > 0 && changeAmount < total && (
                <p className="text-[10px] text-rose-500 mt-1">Valor insuficiente para troco</p>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Observações</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: sem cebola, bem passado..."
              rows={2}
              className="w-full px-3 py-2.5 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white resize-none"
            />
          </div>

          {/* Resumo */}
          <div className="p-4 rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Subtotal</span>
              <span className="font-bold">R$ {subtotal.toFixed(2)}</span>
            </div>
            {deliveryFee > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Taxa de entrega</span>
                <span className="font-bold">R$ {deliveryFee.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-bold border-t border-slate-200 dark:border-[#27272a] pt-2">
              <span>Total</span>
              <span className="text-orange-500">R$ {total.toFixed(2)}</span>
            </div>
          </div>

          {paymentMethod === 'pix' && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
              <p className="text-[10px] text-amber-700 dark:text-amber-300">
                Ao finalizar, você será redirecionado para o WhatsApp da loja com os detalhes do pedido para realizar o pagamento via PIX.
              </p>
            </div>
          )}
        </div>

        <div className="fixed bottom-4 left-4 right-4 z-20">
          <button
            onClick={handlePlaceOrder}
            disabled={saving}
            className="w-full py-4 rounded-2xl bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-bold text-sm shadow-lg shadow-green-500/30 flex items-center justify-center gap-2 active:scale-98 transition-all"
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Finalizando...</>
            ) : (
              <><CheckCircle className="w-4 h-4" /> Confirmar Pedido</>
            )}
          </button>
        </div>
      </div>
    );
  }

  // Tracking
  if (step === 'tracking') {
    if (!lastOrder) return null;
    const statusConfig = getStatusConfig(lastOrder.status);
    const currentStep = statusConfig.step;

    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#09090b]">
        <div className="p-4 max-w-md mx-auto space-y-4">
          {/* Status atual */}
          <div className="p-6 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-center">
            <statusConfig.icon className={`w-12 h-12 mx-auto mb-3 ${statusConfig.color}`} />
            <p className="text-lg font-bold text-slate-900 dark:text-white">{statusConfig.label}</p>
            <p className="text-xs text-slate-500 mt-1">Pedido #{lastOrder.orderNumber}</p>
          </div>

          {/* Progresso */}
          <div className="p-4 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a]">
            <div className="flex items-center justify-between">
              {statusSteps.map((s, idx) => (
                <React.Fragment key={s.key}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                    idx + 1 <= currentStep ? 'bg-orange-500 text-white' : 'bg-slate-100 dark:bg-[#27272a] text-slate-400'
                  }`}>
                    {idx + 1 <= currentStep ? '✓' : idx + 1}
                  </div>
                  {idx < statusSteps.length - 1 && (
                    <div className={`flex-1 h-1 mx-1 rounded ${
                      idx + 1 < currentStep ? 'bg-orange-500' : 'bg-slate-200 dark:bg-[#27272a]'
                    }`} />
                  )}
                </React.Fragment>
              ))}
            </div>
            <div className="flex justify-between mt-2">
              {statusSteps.map(s => (
                <span key={s.key} className="text-[8px] text-slate-400 text-center">{s.label}</span>
              ))}
            </div>
          </div>

          {/* Detalhes */}
          <div className="p-4 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Total</span>
              <span className="font-bold text-slate-900 dark:text-white">R$ {lastOrder.total.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Pagamento</span>
              <span className="font-bold text-slate-900 dark:text-white">
                {lastOrder.paymentMethod === 'pix' && 'PIX'}
                {lastOrder.paymentMethod === 'cash' && 'Dinheiro'}
                {lastOrder.paymentMethod === 'credit_card' && 'Cartão Crédito'}
                {lastOrder.paymentMethod === 'debit_card' && 'Cartão Débito'}
              </span>
            </div>
            {lastOrder.paymentMethod === 'cash' && lastOrder.changeAmount && (
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Troco para</span>
                <span className="font-bold text-slate-900 dark:text-white">R$ {lastOrder.changeAmount.toFixed(2)}</span>
              </div>
            )}
          </div>

          <button
            onClick={() => { setStep('welcome'); setCart([]); setLastOrder(null); }}
            className="w-full py-3 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-bold text-xs"
          >
            Fazer Novo Pedido
          </button>
        </div>
      </div>
    );
  }

  return null;
};
