import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  Receipt,
  Truck,
} from 'lucide-react';
import { Product, Table, DigitalMenuConfig, CustomerSession, Sale } from '../../types';
import { storageService } from '../../services/storageService';
import { printRoutedItems } from '../../services/printService';
import { routeItemsToPrinters } from '../../services/printerRouting';

interface PublicMenuViewProps {
  tableToken: string;
  filialId?: string;
  onClose: () => void;
}

interface CartItem {
  product: Product;
  quantity: number;
}

const CATEGORY_ORDER = ['Entradas', 'Pratos', 'Lanches', 'Pizzas', 'Bebidas', 'Sobremesas', 'Geral'];

// Preço efetivo: a Oferta TV (tvPromoPrice) prevalece quando é menor que o preço normal.
// Garante que o desconto chegue ao pedido (KDS/Comanda/Caixa) e não só ao cardápio.
const getEffectivePrice = (p: Product): number =>
  p.tvPromoPrice && p.tvPromoPrice > 0 && p.tvPromoPrice < (p.salePrice ?? 0)
    ? p.tvPromoPrice
    : (p.salePrice ?? 0);

// ── Delivery: dados do cliente persistidos no PRÓPRIO aparelho ────────────
// O cliente de delivery informa nome/telefone/endereço uma vez; o app salva no
// localStorage do celular para auto-preencher em pedidos seguintes.
const DELIVERY_CUSTOMER_PREFIX = 'hd_delivery_customer_';
function deliveryDeviceKey(): string {
  const raw = navigator.userAgent.slice(0, 100) + (screen.width + 'x' + screen.height);
  return raw.replace(/[^a-zA-Z0-9]/g, '');
}
function loadSavedDeliveryCustomer(): { name: string; phone: string; address: string } | null {
  try {
    const raw = localStorage.getItem(DELIVERY_CUSTOMER_PREFIX + deliveryDeviceKey());
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function saveDeliveryCustomer(c: { name: string; phone: string; address: string }) {
  try { localStorage.setItem(DELIVERY_CUSTOMER_PREFIX + deliveryDeviceKey(), JSON.stringify(c)); } catch {}
}

export const PublicMenuView: React.FC<PublicMenuViewProps> = ({ tableToken, filialId, onClose }) => {
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

  // ✅ Delivery: dados do cliente (salvos no aparelho)
  const [customer, setCustomer] = useState<{ name: string; phone: string; address: string }>({ name: '', phone: '', address: '' });
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  
  // ✅ Delivery mode: no table needed
  const isDeliveryMode = tableToken === 'delivery';

    // Load table and products
  useEffect(() => {
    const loadData = async () => {
      try {
        // ✅ Delivery mode: carrega produtos/config/FILIAL do CLOUD (igual à Mesa),
        // pois o celular do cliente (anon) não tem localStorage hidratado → sem
        // isso o cardápio de delivery abre vazio.
        if (isDeliveryMode) {
          const baseUrl = import.meta.env.VITE_SUPABASE_URL;
          const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

          // URLs legadas (#/delivery ou #/cardapio sem UUID) e o fallback 'default'
          // do Settings caem aqui. Detecta a filial pelo cloud em vez de quebrar:
          // store_branches tem policy SELECT anon do cardápio.
          let resolvedFilialId = filialId;
          // R2: URL legada sem filial ('#/delivery' ou filialId='default') NÃO deve
          // vincular silenciosamente à primeira filial por ordem alfabética — isso
          // pode mostrar o cardápio de outra filial em org multi-filial. Exige o
          // QR Code correto (com o id da filial) em vez de advinhar a filial.
          if (!resolvedFilialId || resolvedFilialId === 'default') {
            setError('Cardápio de delivery indisponível. Escaneie o QR Code da loja.');
            setLoading(false);
            return;
          }

          // Buscar a filial para obter o organization_id REAL (necessário p/ o
          // Realtime do operador entregar o pedido na filial correta).
          const branchRes = await fetch(
            `${baseUrl}/rest/v1/store_branches?id=eq.${encodeURIComponent(resolvedFilialId)}&select=*`,
            { headers: { 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}`, 'Content-Type': 'application/json', 'x-branch-id': resolvedFilialId } }
          );
          const branchesData = branchRes.ok ? await branchRes.json() : [];
          const branchData = branchesData[0];
          if (!branchData) {
            setError('Filial de delivery não encontrada.');
            setLoading(false);
            return;
          }
          const branchOrg = branchData.organization_id;

          // Buscar produtos da filial (anon)
          const productsRes = await fetch(
            `${baseUrl}/rest/v1/products?store_branch_id=eq.${branchData.id}&is_active=eq.true&show_on_cardapio=eq.true&stock_quantity=gt.0&select=*`,
            { headers: { 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}`, 'Content-Type': 'application/json', 'x-branch-id': branchData.id } }
          );
          if (productsRes.ok) {
            const cloudProducts = await productsRes.json();
            setProducts((cloudProducts || []).map((p: any) => ({
              id: p.id,
              name: p.name,
              barcode: p.barcode || '',
              category: p.category || 'Geral',
              unit: p.unit || 'un',
              costPrice: p.cost_price || 0,
              salePrice: p.sale_price || 0,
              currentStock: p.stock_quantity || 0,
              minStock: p.min_stock_quantity || 0,
              maxStock: p.max_stock_quantity || 100,
              imageUrl: p.image_url || '',
              active: p.is_active !== false,
              updatedAt: p.updated_at,
              storeBranchId: p.store_branch_id,
              organizationId: p.organization_id,
              showOnCardapio: p.show_on_cardapio || false,
              showOnTV: p.show_on_tv || false,
              tvPromoPrice: p.tv_promo_price || undefined,
            })));
          }

          // Buscar config do cardápio
          const configRes = await fetch(
            `${baseUrl}/rest/v1/digital_menu_config?store_branch_id=eq.${branchData.id}&select=*`,
            { headers: { 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}`, 'Content-Type': 'application/json', 'x-branch-id': branchData.id } }
          );
          if (configRes.ok) {
            const configs = await configRes.json();
            if (configs && configs.length > 0) {
              setConfig({
                id: configs[0].id,
                title: configs[0].title,
                subtitle: configs[0].subtitle,
                logoUrl: configs[0].logo_url,
                bannerUrl: configs[0].banner_url,
                layoutMode: configs[0].layout_mode,
                showPrices: configs[0].show_prices,
                storeBranchId: configs[0].store_branch_id,
                organizationId: configs[0].organization_id,
                updatedAt: configs[0].updated_at,
              });
            }
          }

          // Tabela virtual de delivery com org real da filial
          const deliveryTable: Table = {
            id: `delivery-${branchData.id}`,
            name: 'Delivery',
            qrToken: `delivery-${resolvedFilialId}`,
            status: 'active',
            storeBranchId: branchData.id,
            organizationId: branchOrg || '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          setTable(deliveryTable);

          // Sessão do cliente (para CRM/operador identificar o pedido)
          const deviceFingerprint = navigator.userAgent.slice(0, 100) + (screen.width + 'x' + screen.height);
          const newSession: CustomerSession = {
            id: crypto.randomUUID(),
            tableId: deliveryTable.id,
            sessionToken: sessionId,
            status: 'active',
            openedAt: new Date().toISOString(),
            deviceFingerprint,
            storeBranchId: deliveryTable.storeBranchId,
            organizationId: deliveryTable.organizationId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          storageService.saveCustomerSession(newSession);
          setSession(newSession);

          // Cliente já salvo neste aparelho? auto-preencher, senão abrir formulário
          const saved = loadSavedDeliveryCustomer();
          if (saved?.name) {
            setCustomer(saved);
          } else {
            setShowCustomerForm(true);
          }
          setLoading(false);
          return;
        }
        
        // ✅ Table mode: fetch from Supabase
        const baseUrl = import.meta.env.VITE_SUPABASE_URL;
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

        // Fetch table by QR token directly from REST API
        const tableRes = await fetch(
          `${baseUrl}/rest/v1/tables?qr_token=eq.${encodeURIComponent(tableToken)}&status=eq.active&select=*`,
          {
            headers: {
              'apikey': anonKey,
              'Authorization': `Bearer ${anonKey}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (!tableRes.ok) {
          setError('Mesa não encontrada. Verifique o QR Code.');
          setLoading(false);
          return;
        }

        const tables = await tableRes.json();
        if (!tables || tables.length === 0) {
          setError('Mesa não encontrada. Verifique o QR Code.');
          setLoading(false);
          return;
        }

        const tableData = tables[0];
        const foundTable: Table = {
          id: tableData.id,
          name: tableData.name,
          number: tableData.number || undefined,
          qrToken: tableToken,
          status: 'active',
          storeBranchId: tableData.store_branch_id,
          organizationId: tableData.organization_id,
          createdAt: tableData.created_at,
          updatedAt: tableData.updated_at,
        };
        setTable(foundTable);

        // Fetch products for this branch (with stock > 0)
        const productsRes = await fetch(
          `${baseUrl}/rest/v1/products?store_branch_id=eq.${foundTable.storeBranchId}&is_active=eq.true&show_on_cardapio=eq.true&stock_quantity=gt.0&select=*`,
          {
            headers: {
              'apikey': anonKey,
              'Authorization': `Bearer ${anonKey}`,
              'Content-Type': 'application/json',
              'x-branch-id': foundTable.storeBranchId,
            },
          }
        );

        if (productsRes.ok) {
          const products = await productsRes.json();
          // Map snake_case to camelCase
          setProducts((products || []).map((p: any) => ({
            id: p.id,
            name: p.name,
            barcode: p.barcode || '',
            category: p.category || 'Geral',
            unit: p.unit || 'un',
            costPrice: p.cost_price || 0,
            salePrice: p.sale_price || 0,
            currentStock: p.stock_quantity || 0,
            minStock: p.min_stock_quantity || 0,
            maxStock: p.max_stock_quantity || 100,
            imageUrl: p.image_url || '',
            active: p.is_active !== false,
            updatedAt: p.updated_at,
            storeBranchId: p.store_branch_id,
            organizationId: p.organization_id,
            showOnCardapio: p.show_on_cardapio || false,
            showOnTV: p.show_on_tv || false,
            tvPromoPrice: p.tv_promo_price || undefined,
          })));
        }

        // Fetch menu config
        const configRes = await fetch(
          `${baseUrl}/rest/v1/digital_menu_config?store_branch_id=eq.${foundTable.storeBranchId}&select=*`,
          {
            headers: {
              'apikey': anonKey,
              'Authorization': `Bearer ${anonKey}`,
              'Content-Type': 'application/json',
              'x-branch-id': foundTable.storeBranchId,
            },
          }
        );

        if (configRes.ok) {
          const configs = await configRes.json();
          if (configs && configs.length > 0) {
            setConfig({
              id: configs[0].id,
              title: configs[0].title,
              subtitle: configs[0].subtitle,
              logoUrl: configs[0].logo_url,
              bannerUrl: configs[0].banner_url,
              layoutMode: configs[0].layout_mode,
              showPrices: configs[0].show_prices,
              storeBranchId: configs[0].store_branch_id,
              organizationId: configs[0].organization_id,
              updatedAt: configs[0].updated_at,
            });
          }
        }

        // Check for existing session for this device (same celular reutiliza)
        const deviceFingerprint = navigator.userAgent.slice(0, 100) + (screen.width + 'x' + screen.height);
        const sessions = storageService.getCustomerSessions();
        const existingSession = sessions.find(
          (s) => s.deviceFingerprint === deviceFingerprint && s.status === 'active'
        );

        // Se já existe sessão para este dispositivo, reutiliza
        if (existingSession) {
          setSession(existingSession);
          setLoading(false);
          return;
        }

        // Criar nova sessão (múltiplos dispositivos permitidos na mesma mesa)
        const newSession: CustomerSession = {
          id: crypto.randomUUID(),
          tableId: foundTable.id,
          sessionToken: sessionId,
          status: 'active',
          openedAt: new Date().toISOString(),
          deviceFingerprint,
          storeBranchId: foundTable.storeBranchId,
          organizationId: foundTable.organizationId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        storageService.saveCustomerSession(newSession);
        setSession(newSession);
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
    return cart.reduce((sum, item) => sum + getEffectivePrice(item.product) * item.quantity, 0);
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

  const [myOrders, setMyOrders] = useState<Sale[]>([]);
  const [showMyComanda, setShowMyComanda] = useState(false);
  const [closingComanda, setClosingComanda] = useState(false);
  const submittingRef = useRef(false);

  // Load my orders on mount and after submit
  const loadMyOrders = useCallback(() => {
    if (!table) return;
    const allSales = storageService.getSales();
    const tableSales = allSales.filter(
      (s) => s.tableId === table.id && (s.orderSource === 'cardapio_digital' || s.orderSource === 'delivery')
    );
    setMyOrders(tableSales.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
  }, [table]);

  useEffect(() => {
    loadMyOrders();
    // Refresh orders every 5 seconds
    const interval = setInterval(loadMyOrders, 5000);
    return () => clearInterval(interval);
  }, [loadMyOrders]);

  const myComandaTotal = myOrders.reduce((sum, s) => {
    const saleTotal = s.total > 0 ? s.total : (s.items?.reduce((a, i) => a + (i.total || 0), 0) || 0);
    return sum + saleTotal;
  }, 0);

  const handleSubmitOrder = async () => {
    if (cart.length === 0 || !table) return;
    if (isDeliveryMode && !customer.name.trim()) {
      setShowCustomerForm(true);
      return;
    }
    if (submittingRef.current) return; // Prevent double-click
    submittingRef.current = true;
    setSubmitting(true);
    try {
      // Create one sale per batch of items
      const saleItems = cart.map((item) => {
        const unit = getEffectivePrice(item.product);
        return {
          productId: item.product.id,
          productName: item.product.name,
          unitPrice: unit,
          quantity: item.quantity,
          total: Math.round(unit * item.quantity * 100) / 100,
        };
      });

      const total = saleItems.reduce((sum, item) => sum + item.total, 0);

      const sale: Sale = {
        id: crypto.randomUUID(),
        code: isDeliveryMode ? `DEL-${Date.now().toString(36).toUpperCase()}` : `CARD-${Date.now().toString(36).toUpperCase()}`,
        date: new Date().toISOString(),
        operatorId: 'cardapio_digital',
        operatorName: isDeliveryMode ? 'Cliente (Delivery)' : 'Cliente (Cardápio Digital)',
        customerName: isDeliveryMode ? customer.name.trim() : undefined,
        storeBranchId: table.storeBranchId,
        organizationId: table.organizationId,
        tableId: table.id,
        customerSessionId: session?.id || undefined,
        notes: isDeliveryMode ? `Tel: ${customer.phone.trim()} | End: ${customer.address.trim()}` : undefined,
        items: saleItems,
        subtotal: total,
        discount: 0,
        total,
        payments: [], // Will be set when comanda is closed
        status: 'pending', // Pending payment
        orderSource: isDeliveryMode ? 'delivery' : 'cardapio_digital',
        kitchenStatus: 'pending',
        updatedAt: new Date().toISOString(),
      };

      await storageService.addSale(sale);

      // Delivery: grava dados do cliente na sessão (CRM/operador) e no aparelho
      if (isDeliveryMode && session) {
        storageService.saveCustomerSession({
          ...session,
          customerName: customer.name.trim(),
          phone: customer.phone.trim(),
          address: customer.address.trim(),
          updatedAt: new Date().toISOString(),
        });
        saveDeliveryCustomer({ name: customer.name.trim(), phone: customer.phone.trim(), address: customer.address.trim() });
      }

      // Print to configured printers (routed by category: kitchen/bar/caixa)
      const printers = storageService.getPrinters();
      const allProducts = storageService.getProducts();
      const allCategories = storageService.getCategories();
      const activePrinters = printers.filter((p) => p.transport !== 'os');

      if (activePrinters.length > 0) {
        // Route items to appropriate printers
        const routing = routeItemsToPrinters(sale.items, activePrinters, allProducts, allCategories);
        for (const [printer, items] of routing.entries()) {
          try {
            const sectionLabel = printer.role === 'cozinha' ? 'Cozinha' : printer.role === 'bar' ? 'Bar' : 'Caixa';
            await printRoutedItems(sale, table, printer, items, sectionLabel);
          } catch (e) {
            // silent fail - printer may not be connected
          }
        }
      }

      setCart([]);
      setShowCart(false); // Fecha o carrinho para não reabrir vazio após a confirmação
      loadMyOrders(); // Refresh my orders
      setOrderSuccess(true);
    } catch (err: any) {
      // silent fail
    } finally {
      setSubmitting(false);
      submittingRef.current = false;
    }
  };

  const handleRequestCloseComanda = async () => {
    if (!table || myOrders.length === 0) return;
    setClosingComanda(true);
    try {
      // Cliente SOLICITA o fechamento (não cobra). Operador fecha e cobra na
      // página de Comandas. kitchenStatus='closing_request' sinaliza o Pedidos.
      for (const sale of myOrders) {
        const updatedSale: Sale = {
          ...sale,
          status: 'pending', // Aguardando operador finalizar
          kitchenStatus: 'closing_request', // Sinaliza pedido de fechamento
          updatedAt: new Date().toISOString(),
        };
        storageService.saveSale(updatedSale);
      }

      // NÃO fecha a sessão — operador faz isso ao finalizar
      // Cliente vê mensagem de aguardando
      setShowMyComanda(false);
      setOrderSuccess(true); // Mostra tela de sucesso
    } catch (err: any) {
      // silent fail
    } finally {
      setClosingComanda(false);
    }
  };

  // Calculate time elapsed for display
  const getTimeElapsed = (date: string) => {
    const diff = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
    if (diff < 1) return 'agora';
    if (diff === 1) return '1 min';
    if (diff < 60) return `${diff} min`;
    return `${Math.floor(diff / 60)}h ${diff % 60}min`;
  };

  // Get status config for display
  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'pending':
        return { label: 'Pendente', color: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20', icon: '⏳' };
      case 'preparing':
        return { label: 'Preparando', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20', icon: '👨‍🍳' };
      case 'ready':
        return { label: 'Pronto', color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20', icon: '✅' };
      case 'delivered':
        return { label: 'Entregue', color: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20', icon: '📦' };
      default:
        return { label: status, color: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20', icon: '❓' };
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
      {/* 🛵 Formulário de dados do cliente (Delivery) */}
      {isDeliveryMode && showCustomerForm && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] p-5 space-y-4 shadow-xl">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                <Truck className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Seus dados para entrega</h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-[#71717a]">Precisamos de nome, telefone e endereço para enviar o pedido.</p>
            <div className="space-y-3">
              <input
                type="text"
                value={customer.name}
                onChange={(e) => setCustomer((c) => ({ ...c, name: e.target.value }))}
                placeholder="Nome completo"
                className="w-full px-3 py-2.5 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-sm text-slate-900 dark:text-white"
              />
              <input
                type="tel"
                value={customer.phone}
                onChange={(e) => setCustomer((c) => ({ ...c, phone: e.target.value }))}
                placeholder="Telefone / WhatsApp"
                className="w-full px-3 py-2.5 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-sm text-slate-900 dark:text-white"
              />
              <textarea
                value={customer.address}
                onChange={(e) => setCustomer((c) => ({ ...c, address: e.target.value }))}
                placeholder="Endereço completo (rua, nº, bairro, cidade)"
                rows={3}
                className="w-full px-3 py-2.5 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-sm text-slate-900 dark:text-white resize-none"
              />
            </div>
            <button
              onClick={() => { if (customer.name.trim()) setShowCustomerForm(false); }}
              disabled={!customer.name.trim()}
              className="w-full px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm disabled:opacity-50"
            >
              Salvar e continuar
            </button>
          </div>
        </div>
      )}

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
        <div className="flex items-center gap-2">
          {myOrders.length > 0 && (
            <button
              onClick={() => setShowMyComanda(true)}
              className="relative px-3 py-2 rounded-xl bg-teal-600 text-white text-xs font-bold flex items-center gap-1"
            >
              <Receipt className="w-4 h-4" />
              <span>Minha Comanda</span>
              <span className="w-5 h-5 rounded-full bg-white/20 text-white text-[10px] font-bold flex items-center justify-center">
                {myOrders.length}
              </span>
            </button>
          )}
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
                    <div className="flex flex-col">
                      {product.tvPromoPrice && product.tvPromoPrice > 0 && product.tvPromoPrice < (product.salePrice ?? 0) ? (
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
                          {config?.showPrices !== false ? `R$ ${(product.salePrice ?? 0).toFixed(2)}` : 'Consultar'}
                        </span>
                      )}
                    </div>
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
                     <p className="text-[10px] text-slate-500">R$ {getEffectivePrice(item.product).toFixed(2)} cada</p>
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
                     R$ {(getEffectivePrice(item.product) * item.quantity).toFixed(2)}
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
                  <span className="text-lg font-bold text-slate-900 dark:text-white">R$ {(cartTotal ?? 0).toFixed(2)}</span>
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

      {/* My Comanda Modal */}
      {showMyComanda && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={() => setShowMyComanda(false)}>
          <div className="bg-white dark:bg-[#18181b] w-full max-w-md max-h-[85vh] rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-200 dark:border-[#27272a] flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Receipt className="w-4 h-4" />
                Minha Comanda — {table?.name}
              </h3>
              <button onClick={() => setShowMyComanda(false)} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {myOrders.length === 0 ? (
                <div className="text-center py-8 text-sm text-slate-400">
                  Nenhum pedido ainda. Faça seu primeiro pedido!
                </div>
              ) : (
                myOrders.map((sale) => (
                  <div key={sale.id} className="p-3 rounded-xl bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-bold text-slate-500">
                        #{sale.code || sale.id.slice(-6)}
                      </span>
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${
                        sale.kitchenStatus === 'pending' ? 'bg-yellow-500/10 text-yellow-600' :
                        sale.kitchenStatus === 'preparing' ? 'bg-blue-500/10 text-blue-600' :
                        sale.kitchenStatus === 'ready' ? 'bg-emerald-500/10 text-emerald-600' :
                        'bg-slate-500/10 text-slate-600'
                      }`}>
                        {sale.kitchenStatus === 'pending' ? 'Pendente' :
                         sale.kitchenStatus === 'preparing' ? 'Preparando' :
                         sale.kitchenStatus === 'ready' ? 'Pronto' : 'Entregue'}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {(sale.items || []).map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-700 dark:text-slate-300">
                            {item.quantity}x {item.productName}
                          </span>
                          <span className="font-semibold text-slate-900 dark:text-white">R$ {(item.total ?? 0).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 pt-2 border-t border-slate-200 dark:border-[#27272a] flex items-center justify-between">
                      <span className="text-[10px] text-slate-400">{new Date(sale.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        R$ {((sale.total > 0 ? sale.total : (sale.items?.reduce((a, i) => a + (i.total || 0), 0) || 0)) ?? 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
            {myOrders.length > 0 && (
              <div className="p-4 border-t border-slate-200 dark:border-[#27272a] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-300">TOTAL</span>
                  <span className="text-xl font-bold text-slate-900 dark:text-white">R$ {(myComandaTotal ?? 0).toFixed(2)}</span>
                </div>
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">Fechamento</p>
                  <button
                    onClick={handleRequestCloseComanda}
                    disabled={closingComanda}
                    className="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60 transition-colors"
                  >
                    {closingComanda ? 'Solicitando...' : 'Solicitar fechamento de comanda'}
                  </button>
                  <p className="text-[10px] text-slate-400 text-center">O operador irá fechar e cobrar na comanda.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
