/**
 * DeliveryClientView - Tela do cliente para fazer pedidos de delivery
 * 
 * Funcionalidades:
 * - Cardápio com produtos do estoque (filtrados por showOnCardapio)
 * - Carrinho de compras
 * - Escolha: Entrega ou Retirada
 * - Formulário de endereço (se entrega)
 * - Formulário de dados do cliente (se convidado)
 * - Cálculo automático de taxa de entrega
 * - Forma de pagamento (dinheiro/cartão/pix)
 * - Troco para quanto (se dinheiro)
 * - Finalizar pedido
 * - Acompanhar status do pedido
 */

import React, { useState, useEffect, useMemo } from 'react';
import { ShoppingCart, Plus, Minus, Trash2, MapPin, User, Phone, CreditCard, Banknote, DollarSign, CheckCircle, Clock, Truck, Package, AlertCircle, Loader2, X, ChevronRight } from 'lucide-react';
import { Product, StoreBranch, DeliverySettings, DeliveryOrder, DeliveryOrderItem, DeliveryAddress } from '../../types';
import { storageService } from '../../services/storageService';

interface DeliveryClientViewProps {
  branch: StoreBranch;
  onOrderPlaced?: (order: DeliveryOrder) => void;
}

type CartItem = DeliveryOrderItem & { product: Product };
type Step = 'menu' | 'cart' | 'address' | 'payment' | 'confirmation' | 'tracking';

export const DeliveryClientView: React.FC<DeliveryClientViewProps> = ({ branch, onOrderPlaced }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<DeliverySettings | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [step, setStep] = useState<Step>('menu');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [orderType, setOrderType] = useState<'delivery' | 'pickup'>('delivery');
  
  // Dados do cliente (convidado)
  const [customerName, setCustomerName] = useState('');
  const [customerWhatsapp, setCustomerWhatsapp] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastOrder, setLastOrder] = useState<DeliveryOrder | null>(null);
  const [trackingOrder, setTrackingOrder] = useState<DeliveryOrder | null>(null);

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

  const filteredProducts = useMemo(() => {
    if (selectedCategory === 'all') return products;
    return products.filter(p => p.category === selectedCategory);
  }, [products, selectedCategory]);

  // Cálculo de taxa de entrega
  const deliveryFee = useMemo(() => {
    if (orderType === 'pickup' || !settings) return 0;
    
    switch (settings.feeCalculationType) {
      case 'free':
        return 0;
      case 'fixed':
        return settings.fixedFee;
      case 'neighborhood':
        const neighborhood = storageService.getDeliveryNeighborhoods()
          .find(n => n.storeBranchId === branch.id && 
            n.neighborhood.toLowerCase() === address.neighborhood.toLowerCase());
        return neighborhood?.fee ?? settings.fixedFee;
      case 'distance':
        // Calcular distância seria com API externa, por hora usa taxa fixa
        return settings.fixedFee;
      default:
        return 0;
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
      setErrorMessage('Informe seu nome');
      return;
    }
    if (!customerWhatsapp.trim()) {
      setErrorMessage('Informe seu WhatsApp');
      return;
    }
    if (orderType === 'delivery' && !address.street.trim()) {
      setErrorMessage('Informe o endereço de entrega');
      return;
    }
    if (settings?.minimumOrderValue && subtotal < settings.minimumOrderValue) {
      setErrorMessage(`Pedido mínimo: R$ ${settings.minimumOrderValue.toFixed(2)}`);
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
        customerEmail,
        notes,
        estimatedDeliveryTime: settings?.estimatedDeliveryTime,
        whatsappSent: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      storageService.saveDeliveryOrder(order);
      setLastOrder(order);
      setTrackingOrder(order);
      setStep('tracking');
      onOrderPlaced?.(order);
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao fazer pedido');
    } finally {
      setSaving(false);
    }
  };

  // Acompanhar pedido
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

  // Renderização por etapa
  const renderMenu = () => (
    <div className="space-y-4">
      {/* Categorias */}
      <div className="flex gap-2 overflow-x-auto pb-2">
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

      {/* Produtos */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {filteredProducts.map(product => {
          const inCart = cart.find(item => item.productId === product.id);
          return (
            <div
              key={product.id}
              className="p-3 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] space-y-2"
            >
              {product.imageUrl && (
                <img src={product.imageUrl} alt={product.name} className="w-full h-20 object-cover rounded-xl" />
              )}
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white">{product.name}</p>
                <p className="text-sm font-bold text-orange-500">R$ {product.salePrice.toFixed(2)}</p>
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
                  className="w-full py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-xs font-bold flex items-center justify-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Adicionar
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderCart = () => (
    <div className="space-y-4">
      {cart.length === 0 ? (
        <div className="text-center py-8">
          <ShoppingCart className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">Seu carrinho está vazio</p>
        </div>
      ) : (
        <>
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
          
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#09090b] space-y-1">
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
  );

  const renderAddress = () => (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          onClick={() => setOrderType('delivery')}
          className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all ${
            orderType === 'delivery' ? 'bg-orange-500 text-white' : 'bg-slate-100 dark:bg-[#27272a] text-slate-600'
          }`}
        >
          🛵 Entrega
        </button>
        <button
          onClick={() => setOrderType('pickup')}
          className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all ${
            orderType === 'pickup' ? 'bg-blue-500 text-white' : 'bg-slate-100 dark:bg-[#27272a] text-slate-600'
          }`}
        >
          🏪 Retirada
        </button>
      </div>

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
  );

  const renderPayment = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <button
          onClick={() => setPaymentMethod('pix')}
          className={`w-full p-3 rounded-xl flex items-center gap-3 transition-all ${
            paymentMethod === 'pix' ? 'bg-orange-500/10 border-2 border-orange-500' : 'bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a]'
          }`}
        >
          <DollarSign className="w-5 h-5 text-orange-500" />
          <span className="text-xs font-bold text-slate-900 dark:text-white">PIX</span>
          <span className="text-[10px] text-slate-500 ml-auto">WhatsApp</span>
        </button>
        <button
          onClick={() => setPaymentMethod('cash')}
          className={`w-full p-3 rounded-xl flex items-center gap-3 transition-all ${
            paymentMethod === 'cash' ? 'bg-orange-500/10 border-2 border-orange-500' : 'bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a]'
          }`}
        >
          <Banknote className="w-5 h-5 text-green-500" />
          <span className="text-xs font-bold text-slate-900 dark:text-white">Dinheiro</span>
        </button>
        <button
          onClick={() => setPaymentMethod('credit_card')}
          className={`w-full p-3 rounded-xl flex items-center gap-3 transition-all ${
            paymentMethod === 'credit_card' ? 'bg-orange-500/10 border-2 border-orange-500' : 'bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a]'
          }`}
        >
          <CreditCard className="w-5 h-5 text-blue-500" />
          <span className="text-xs font-bold text-slate-900 dark:text-white">Cartão de Crédito</span>
        </button>
        <button
          onClick={() => setPaymentMethod('debit_card')}
          className={`w-full p-3 rounded-xl flex items-center gap-3 transition-all ${
            paymentMethod === 'debit_card' ? 'bg-orange-500/10 border-2 border-orange-500' : 'bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a]'
          }`}
        >
          <CreditCard className="w-5 h-5 text-purple-500" />
          <span className="text-xs font-bold text-slate-900 dark:text-white">Cartão de Débito</span>
        </button>
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

      {paymentMethod === 'pix' && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
          <p className="text-[10px] text-amber-700 dark:text-amber-300">
            Ao finalizar, você será redirecionado para o WhatsApp da loja com os detalhes do pedido para realizar o pagamento via PIX.
          </p>
        </div>
      )}
    </div>
  );

  const renderTracking = () => {
    if (!trackingOrder) return null;
    const statusConfig = getStatusConfig(trackingOrder.status);
    const currentStep = statusConfig.step;

    return (
      <div className="space-y-4">
        {/* Status atual */}
        <div className="p-6 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-center">
          <statusConfig.icon className={`w-12 h-12 mx-auto mb-3 ${statusConfig.color}`} />
          <p className="text-lg font-bold text-slate-900 dark:text-white">{statusConfig.label}</p>
          <p className="text-xs text-slate-500 mt-1">Pedido #{trackingOrder.orderNumber}</p>
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

        {/* Detalhes do pedido */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#09090b] space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Total</span>
            <span className="font-bold text-slate-900 dark:text-white">R$ {trackingOrder.total.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Pagamento</span>
            <span className="font-bold text-slate-900 dark:text-white">
              {trackingOrder.paymentMethod === 'pix' && 'PIX'}
              {trackingOrder.paymentMethod === 'cash' && 'Dinheiro'}
              {trackingOrder.paymentMethod === 'credit_card' && 'Cartão Crédito'}
              {trackingOrder.paymentMethod === 'debit_card' && 'Cartão Débito'}
            </span>
          </div>
          {trackingOrder.paymentMethod === 'cash' && trackingOrder.changeAmount && (
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Troco para</span>
              <span className="font-bold text-slate-900 dark:text-white">R$ {trackingOrder.changeAmount.toFixed(2)}</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#09090b]">
      {/* Header */}
      <div className="sticky top-0 z-10 p-4 bg-white dark:bg-[#18181b] border-b border-slate-200 dark:border-[#27272a]">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">🛵 {branch.name}</h1>
          {step === 'menu' && cartItemCount > 0 && (
            <button
              onClick={() => setStep('cart')}
              className="relative p-2 rounded-xl bg-orange-500 text-white"
            >
              <ShoppingCart className="w-5 h-5" />
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                {cartItemCount}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Conteúdo */}
      <div className="p-4 max-w-2xl mx-auto">
        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-center gap-2 mb-4">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {errorMessage}
          </div>
        )}

        {step === 'menu' && renderMenu()}
        {step === 'cart' && renderCart()}
        {step === 'address' && renderAddress()}
        {step === 'payment' && renderPayment()}
        {step === 'tracking' && renderTracking()}
      </div>

      {/* Botões de Navegação */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white dark:bg-[#18181b] border-t border-slate-200 dark:border-[#27272a]">
        <div className="max-w-2xl mx-auto flex gap-3">
          {step === 'menu' && (
            <>
              <button
                onClick={() => { setStep('cart'); setErrorMessage(null); }}
                disabled={cart.length === 0}
                className="flex-1 py-3 rounded-xl bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2"
              >
                <ShoppingCart className="w-4 h-4" />
                Ver Carrinho ({cartItemCount})
              </button>
            </>
          )}
          {step === 'cart' && (
            <>
              <button
                onClick={() => setStep('menu')}
                className="px-4 py-3 rounded-xl bg-slate-100 dark:bg-[#27272a] text-slate-600 dark:text-slate-400 font-bold text-xs"
              >
                Voltar
              </button>
              <button
                onClick={() => { setStep('address'); setErrorMessage(null); }}
                disabled={cart.length === 0}
                className="flex-1 py-3 rounded-xl bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white font-bold text-xs"
              >
                Continuar <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}
          {step === 'address' && (
            <>
              <button
                onClick={() => setStep('cart')}
                className="px-4 py-3 rounded-xl bg-slate-100 dark:bg-[#27272a] text-slate-600 dark:text-slate-400 font-bold text-xs"
              >
                Voltar
              </button>
              <button
                onClick={() => { setStep('payment'); setErrorMessage(null); }}
                className="flex-1 py-3 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-bold text-xs"
              >
                Continuar <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}
          {step === 'payment' && (
            <>
              <button
                onClick={() => setStep('address')}
                className="px-4 py-3 rounded-xl bg-slate-100 dark:bg-[#27272a] text-slate-600 dark:text-slate-400 font-bold text-xs"
              >
                Voltar
              </button>
              <button
                onClick={handlePlaceOrder}
                disabled={saving}
                className="flex-1 py-3 rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2"
              >
                {saving ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Finalizando...</>
                ) : (
                  <><CheckCircle className="w-4 h-4" /> Fazer Pedido</>
                )}
              </button>
            </>
          )}
          {step === 'tracking' && (
            <button
              onClick={() => { setStep('menu'); setCart([]); setLastOrder(null); setTrackingOrder(null); }}
              className="flex-1 py-3 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-bold text-xs"
            >
              Fazer Novo Pedido
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
