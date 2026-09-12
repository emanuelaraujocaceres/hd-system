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
  ChevronDown,
  ChevronUp,
  Search,
} from 'lucide-react';
import { Product, Table, DigitalMenuConfig, CustomerSession, Sale } from '../../types';
import { storageService } from '../../services/storageService';
import { ensureAnonSession, submitAnonSale, fetchSessionSalesStatus, fetchSessionSalesFull, requestClosingAnon } from '../../services/cardapioAnonService';
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
  const [menuSearch, setMenuSearch] = useState('');
  // Categorias em até 2 linhas (sem barra de rolagem gigante no celular).
  // O "ver mais" só aparece quando há conteúdo cortado.
  const [catsExpanded, setCatsExpanded] = useState(false);
  const [catsOverflow, setCatsOverflow] = useState(false);
  const catsRef = useRef<HTMLDivElement>(null);
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

          // Buscar produtos da filial (anon). deleted_at=is.null: soft-delete
          // (tombstone) não desliga is_active/show_on_cardapio, então sem este
          // filtro o produto excluído continuava no cardápio (ex.: 09/2026).
          const productsRes = await fetch(
            `${baseUrl}/rest/v1/products?store_branch_id=eq.${branchData.id}&is_active=eq.true&show_on_cardapio=eq.true&stock_quantity=gt.0&deleted_at=is.null&select=*`,
            { headers: { 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}`, 'Content-Type': 'application/json', 'x-branch-id': branchData.id } }
          );
          if (productsRes.ok) {
            const cloudProducts = await productsRes.json();
            setProducts((cloudProducts || []).filter((p: any) => !p.deleted_at).map((p: any) => ({
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
          // P0-1: em delivery NÃO vinculamos a uma mesa real — o table_id é null
          // (coluna UUID FK->tables). Antes o id virtual 'delivery-<uuid>' era
          // enviado como table_id e quebrava com 22P02 na DLQ (pedido preso no
          // celular). A fonte do delivery é sinalizada por orderSource='delivery'.
          const deviceFingerprint = navigator.userAgent.slice(0, 100) + (screen.width + 'x' + screen.height);
          const newSession: CustomerSession = {
            id: crypto.randomUUID(),
            tableId: undefined,
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

        // Fetch products for this branch (with stock > 0). deleted_at=is.null:
        // ver comentário do fetch de delivery acima (tombstone sem filtro = fantasma).
        const productsRes = await fetch(
          `${baseUrl}/rest/v1/products?store_branch_id=eq.${foundTable.storeBranchId}&is_active=eq.true&show_on_cardapio=eq.true&stock_quantity=gt.0&deleted_at=is.null&select=*`,
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
          // Map snake_case to camelCase (ignora tombstones por segurança)
          setProducts((products || []).filter((p: any) => !p.deleted_at).map((p: any) => ({
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

        // Check for existing session for this device + MESA (isolamento por mesa)
        // BUGFIX 2026-09-08: antes buscava só por deviceFingerprint + active,
        // então o mesmo celular ao escanear QR de outra mesa reaproveitava a
        // sessão da mesa anterior -> venda bipolar (tableId da nova mesa,
        // customerSessionId da antiga). Agora escopa por tableId.
        // FIX Anon 2026-09-08: getCustomerSessions() filtra por filial selecionada
        // (getSelectedBranchId) — no celular anon retorna [] e esconde tudo, por
        // isso QR só funcionava no PC logado. Agora lê por filial da mesa quando
        // não há filial selecionada.
        const deviceFingerprint = navigator.userAgent.slice(0, 100) + (screen.width + 'x' + screen.height);
        const sessions = storageService.getSelectedBranchId()
          ? storageService.getCustomerSessions()
          : storageService.getCustomerSessionsByBranch(foundTable.storeBranchId, foundTable.organizationId);
        const existingSession = sessions.find(
          (s) => s.deviceFingerprint === deviceFingerprint && s.status === 'active' && s.tableId === foundTable.id
        );

        // A mesa tem UMA sessão ativa compartilhada (constraint
        // one_active_session_per_table). Adota a ativa remota quando houver;
        // só cria quando a mesa está livre. Sem isso, cada aparelho tentava
        // inserir sua sessão → 23505, e a venda caía em FK 23503.
        const candidateId = existingSession?.id || crypto.randomUUID();
        const token = existingSession?.sessionToken || sessionId;
        const remote = await ensureAnonSession(foundTable, deviceFingerprint, token, candidateId);
        const finalId = remote.sessionId || candidateId;
        // Token REMOTO (sessão compartilhada da mesa) — o fechamento valida
        // posse por ele; o UUID fresco da página falhava no v_owned.
        const finalToken = remote.sessionToken || token;
        if (!remote.ok) console.warn('[Cardapio] sessão anon não subiu:', remote.error);
        // Espelha a comanda COMPARTILHADA da mesa: quem entra agora vê os
        // pedidos já feitos por outros aparelhos (não começa zerado).
        try {
          const full = await fetchSessionSalesFull(finalId, foundTable.storeBranchId);
          for (const r of full) {
            const known = storageService.getSalesByBranch(foundTable.storeBranchId, foundTable.organizationId).some((s) => s.id === r.id);
            if (!known) {
              storageService.saveSale(
                {
                  id: r.id,
                  code: r.code,
                  date: r.created_at,
                  operatorId: 'cardapio_digital',
                  operatorName: 'Cliente (Cardápio Digital)',
                  storeBranchId: r.store_branch_id,
                  organizationId: r.organization_id,
                  tableId: (r.table_id || foundTable.id) as any,
                  customerSessionId: (r.customer_session_id || finalId) as any,
                  items: r.items as any,
                  subtotal: r.total,
                  discount: 0,
                  total: r.total,
                  payments: [] as any,
                  status: r.status as any,
                  orderSource: (r.order_source as any) || 'cardapio_digital',
                  kitchenStatus: (r.kitchen_status as any) || 'pending',
                  updatedAt: new Date().toISOString(),
                } as any,
                { skipSync: true }
              );
            }
          }
        } catch {
          // espelho é best-effort; o poll de 5s completa em seguida
        }
        if (existingSession && existingSession.id === finalId) {
          setSession(existingSession);
          setLoading(false);
          return;
        }
        // Adota a sessão vencedora (a ativa da mesa) no espelho local.
        // Espelho local (Minha Comanda lê daqui) sem sync — o cloud vai pelo
        // serviço anon dedicado (sem JWT do operador). Sem skipSync, o upsert
        // ia com o JWT logado no mesmo aparelho → 42501/401.
        const adopted: CustomerSession = {
          id: finalId,
          tableId: foundTable.id,
          sessionToken: finalToken,
          status: 'active',
          openedAt: existingSession?.openedAt || new Date().toISOString(),
          deviceFingerprint,
          storeBranchId: foundTable.storeBranchId,
          organizationId: foundTable.organizationId,
          createdAt: existingSession?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        storageService.saveCustomerSession(adopted, { skipSync: true });
        setSession(adopted);
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
    const base = selectedCategory === 'all' ? products : products.filter((p) => p.category === selectedCategory);
    const q = menuSearch.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const searched = q
      ? base.filter((p) => (p.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q))
      : base;
    return [...searched].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [products, selectedCategory, menuSearch]);

  // Detecta se as 4 linhas cortam conteúdo (mostra "ver mais" só se precisar).
  // O limite é medido na altura real da pílula (4 linhas + gaps) — robusto a
  // fonte/zoom do celular. Re-mede em resize, observer e após fontes.
  useEffect(() => {
    const el = catsRef.current;
    if (!el) return;
    let raf = 0;
    const applyCap = () => {
      if (catsExpanded) {
        el.style.maxHeight = '';
        return;
      }
      const rowH = (el.firstElementChild as HTMLElement | null)?.offsetHeight || 30;
      el.style.maxHeight = `${4 * rowH + 3 * 8}px`;
    };
    const check = () => {
      applyCap();
      setCatsOverflow(el.scrollHeight > el.clientHeight + 4);
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(check);
    };
    schedule();
    if (document.fonts?.ready) {
      document.fonts.ready.then(schedule).catch(() => {});
    }
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(schedule);
      ro.observe(el);
    }
    window.addEventListener('resize', schedule);
    const t = setTimeout(check, 500);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
      window.removeEventListener('resize', schedule);
      ro?.disconnect();
    };
  }, [categories, catsExpanded]);

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
  // Erro visível do fechamento (antes era só console.warn — no celular sem
  // console o cliente não sabia por que o operador não recebia).
  const [closingError, setClosingError] = useState<string | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<string>('');
  const [closingCashGiven, setClosingCashGiven] = useState<number>(0);
  const [closingNeedsChange, setClosingNeedsChange] = useState(false);
  const PAYMENT_OPTIONS = [
    { value: 'cash', label: '💵 Dinheiro' },
    { value: 'pix', label: '📱 Pix' },
    { value: 'credit_card', label: '💳 Crédito' },
    { value: 'debit_card', label: '💳 Débito' },
  ];
  const submittingRef = useRef(false);

  // Load my orders on mount and after submit — só pendentes da MINHA sessão
  // BUGFIX 2026-09-08: antes filtrava só por tableId, então o próximo cliente
  // na mesma mesa herda vendas stale (halls fantasma). Agora isola por
  // customerSessionId (= sessão deste aparelho nesta mesa).
  const loadMyOrders = useCallback(() => {
    if (!table || !session) return;
    const allSales = storageService.getSelectedBranchId()
      ? storageService.getSales()
      : storageService.getSalesByBranch(table.storeBranchId, table.organizationId);
    const tableSales = allSales.filter(
      (s) => s.customerSessionId === session.id && s.tableId === table.id && (s.orderSource === 'cardapio_digital' || s.orderSource === 'delivery') && s.status !== 'completed' && s.status !== 'cancelled'
    );
    // Fallback transitório: se ainda há vendas órfãs antigas (sem customerSessionId)
    // da mesma mesa criadas antes do fix, não mostrar para o novo cliente.
    // O operador ainda as vê na ComandaView e pode removê-las.
    setMyOrders(tableSales.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
  }, [table, session]);

  useEffect(() => {
    loadMyOrders();
    // Refresh orders every 5 seconds + espelha cancelamento/finalização do
    // operador (o anon não tem Realtime; sem o poll a Minha Comanda ficava
    // presa no status local). Só espelha status/total — nunca reenvia.
    const interval = setInterval(async () => {
      if (table && session && !isDeliveryMode) {
        try {
          // Full espelha TUDO: insere vendas de outros aparelhos que ainda não
          // estão neste espelho local + atualiza status (cancelled some da lista).
          const full = await fetchSessionSalesFull(session.id, table.storeBranchId);
          if (full.length > 0) {
            const locals = storageService.getSalesByBranch(table.storeBranchId, table.organizationId);
            let changed = false;
            for (const r of full) {
              const local = locals.find((s) => s.id === r.id);
              if (!local) {
                storageService.saveSale(
                  {
                    id: r.id,
                    code: r.code,
                    date: r.created_at,
                    operatorId: 'cardapio_digital',
                    operatorName: 'Cliente (Cardápio Digital)',
                    storeBranchId: r.store_branch_id,
                    organizationId: r.organization_id,
                    tableId: (r.table_id || table.id) as any,
                    customerSessionId: (r.customer_session_id || session.id) as any,
                    items: r.items as any,
                    subtotal: r.total,
                    discount: 0,
                    total: r.total,
                    payments: [] as any,
                    status: r.status as any,
                    orderSource: (r.order_source as any) || 'cardapio_digital',
                    kitchenStatus: (r.kitchen_status as any) || 'pending',
                    updatedAt: new Date().toISOString(),
                  } as any,
                  { skipSync: true }
                );
                changed = true;
              } else if (local.status !== r.status || (local.kitchenStatus || 'pending') !== (r.kitchen_status || 'pending')) {
                storageService.saveSale(
                  { ...local, status: r.status as any, kitchenStatus: (r.kitchen_status as any) || local.kitchenStatus, total: typeof r.total === 'number' ? r.total : local.total, updatedAt: new Date().toISOString() },
                  { skipSync: true }
                );
                changed = true;
              }
            }
            loadMyOrders();
            void changed;
          } else {
            // Fallback leve: só status (quando o full vier vazio por rede parcial)
            const remote = await fetchSessionSalesStatus(session.id, table.storeBranchId);
            if (remote.length > 0) {
              for (const r of remote) {
                const local = storageService.getSalesByBranch(table.storeBranchId, table.organizationId).find((s) => s.id === r.id);
                if (local && (local.status !== r.status || (local.kitchenStatus || 'pending') !== (r.kitchen_status || 'pending'))) {
                  storageService.saveSale(
                    { ...local, status: r.status as any, kitchenStatus: (r.kitchen_status as any) || local.kitchenStatus, total: typeof r.total === 'number' ? r.total : local.total, updatedAt: new Date().toISOString() },
                    { skipSync: true }
                  );
                }
              }
            }
            loadMyOrders();
          }
        } catch {
          loadMyOrders();
        }
      } else {
        loadMyOrders();
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [loadMyOrders, table, session, isDeliveryMode]);

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
        // P0-1: delivery NÃO envia mesa — table_id null (coluna UUID FK->tables).
        // Antes, o id virtual 'delivery-<uuid>' quebrava com 22P02 na DLQ. A
        // origem do delivery vem de orderSource='delivery' (DeliveryBoard filtra por ela).
        tableId: isDeliveryMode ? undefined : table.id,
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

      if (!isDeliveryMode) {
        // Mesa (QR público): 1) espelho local sem sync do operador +
        // 2) cloud como anon puro (sales + items + RPC estoque). Sem isso, o
        // upsert ia com o JWT do operador do mesmo aparelho → RLS 42501.
        await storageService.addSale(sale, { skipSync: true });
        const res = await submitAnonSale(sale, table);
        if (!res.ok) {
          console.warn('[Cardapio] venda anon não subiu:', res.error);
          throw new Error(res.error || 'Falha ao enviar pedido. Tente novamente.');
        }
      } else {
        await storageService.addSale(sale);
      }

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

  const handleRequestCloseComanda = async (paymentMethod: string) => {
    if (!table || myOrders.length === 0 || !paymentMethod) return;
    setClosingComanda(true);
    setClosingError(null);
    try {
      // Cliente SOLICITA o fechamento informando a FORMA DE PAGAMENTO desejada.
      // Operador fecha e cobra na página de Comandas. kitchenStatus='closing_request'
      // sinaliza o Pedidos (KDS) e payments[0].method exibe a forma escolhida.
      // BUGFIX 2026-09-08: antes pegava TODAS as vendas da mesa (allTableSales por tableId)
      // incluindo órfãs/stale de sessões anteriores -> fechamento falhava no RPC por
      // v_owned mismatch. Agora fecha só as vendas da MINHA sessão (myOrders já
      // escopado por customerSessionId). Entregue já está em myOrders (status pending).
      // Autocura antes da RPC: o celular pode estar com sessão/token stale
      // (carregado antes do fix de sessão compartilhada) ou com vendas locais
      // que nunca subiram. Revalida a ativa remota e envia SÓ o que o cloud
      // reconhece — sem isso, 1 item stale derruba o lote todo (v_owned).
      let rpcSession = session;
      try {
        const deviceFp = navigator.userAgent.slice(0, 100) + (screen.width + 'x' + screen.height);
        const re = await ensureAnonSession(table, deviceFp, session?.sessionToken || sessionId, session?.id);
        if (re.sessionId && re.sessionId !== session?.id) {
          const adoptedNow: CustomerSession = {
            ...(session as CustomerSession),
            id: re.sessionId,
            sessionToken: re.sessionToken || session?.sessionToken || sessionId,
            status: 'active',
            updatedAt: new Date().toISOString(),
          };
          storageService.saveCustomerSession(adoptedNow, { skipSync: true });
          setSession(adoptedNow);
          rpcSession = adoptedNow;
        } else if (re.sessionToken && session && re.sessionToken !== session.sessionToken) {
          const fixed: CustomerSession = { ...session, sessionToken: re.sessionToken, updatedAt: new Date().toISOString() };
          storageService.saveCustomerSession(fixed, { skipSync: true });
          setSession(fixed);
          rpcSession = fixed;
        }
      } catch {
        // sem rede para revalidar: segue com a sessão local
      }
      // Só envia vendas que o cloud confirma na sessão (remove stale local).
      let eligible = myOrders;
      try {
        const full = await fetchSessionSalesFull(rpcSession?.id || session?.id || '', table.storeBranchId);
        if (full.length > 0) {
          const ids = new Set(full.map((f) => f.id));
          const filtered = myOrders.filter((s) => ids.has(s.id));
          if (filtered.length !== myOrders.length) {
            console.warn(`[Cardapio] ${myOrders.length - filtered.length} venda(s) local(is) fora do cloud — fora do fechamento.`);
          }
          if (filtered.length === 0) {
            setClosingError('Suas vendas ainda não chegaram na nuvem. Aguarde alguns segundos e tente de novo.');
            return;
          }
          eligible = filtered;
        }
      } catch {
        // segue com myOrders
      }
      const targetSales = eligible;
      const saleIds: string[] = [];
      const isCash = paymentMethod === 'cash';
      const changeDueTotal = isCash ? Math.max(0, closingCashGiven - myComandaTotal) : 0;
      const hasCashGiven = isCash && closingCashGiven > 0;
      for (const sale of targetSales) {
        const saleTotal = sale.total > 0 ? sale.total : (sale.items?.reduce((a, i) => a + (i.total || 0), 0) || 0);
        let payment: any = { method: paymentMethod, amount: saleTotal };
        if (hasCashGiven) {
          payment.cashGiven = closingCashGiven;
          payment.changeDue = changeDueTotal;
        }
        const updatedSale: Sale = {
          ...sale,
          status: 'pending', // Aguardando operador finalizar
          kitchenStatus: 'closing_request', // Sinaliza pedido de fechamento — move Entregue também
          payments: [payment] as any, // forma de pagamento solicitada (com troco se dinheiro)
          updatedAt: new Date().toISOString(),
        };
        // P0-3: gravação LOCAL apenas (skipSync) — o cloud recebe o
        // closing_request via RPC dedicada abaixo, NÃO via upsert (não existe
        // UPDATE anon em sales → 42501 na DLQ). A RPC valida posse por
        // session_token e re-deriva o amount do total REAL da venda.
        storageService.saveSale(updatedSale, { skipSync: true });
        saleIds.push(sale.id);
      }

      // P0-3: RPC SECURITY DEFINER com EXECUTE anon (exceção documentada 0f/0e,
      // idem process_sale_transaction) — única via de escrita do pedido de
      // fechamento; evita policy de UPDATE permissiva em sales (regra 0b).
      // Via fetch anon PURO (sem GoTrueClient/JWT do operador) e com o token
      // REMOTO da sessão compartilhada — o supabase-js com JWT falhava e o
      // token fresco da página falhava no v_owned.
      const tokenForRpc = rpcSession?.sessionToken || session?.sessionToken || sessionId;
      const closeRes = await requestClosingAnon(saleIds, tokenForRpc, paymentMethod, table.storeBranchId);
      if (!closeRes.ok) {
        // Lote falhou (ex.: uma venda stale sem posse contamina o lote todo) —
        // tenta venda a venda para salvar as válidas em vez de perder tudo.
        console.warn('[Cardapio] fechamento em lote falhou, tentando por venda:', closeRes.error);
        const failed: string[] = [];
        for (const sid of saleIds) {
          const one = await requestClosingAnon([sid], tokenForRpc, paymentMethod, table.storeBranchId);
          if (!one.ok) failed.push(sid);
        }
        if (failed.length === saleIds.length) {
          // Nenhuma passou: reverte o espelho local e MOSTRA o erro na tela
          // (antes era só console — no celular o cliente não sabia de nada).
          for (const sale of targetSales) {
            const current = storageService.getSalesByBranch(table.storeBranchId, table.organizationId).find((s) => s.id === sale.id);
            if (current) {
              storageService.saveSale({ ...current, kitchenStatus: sale.kitchenStatus, payments: sale.payments as any, updatedAt: new Date().toISOString() }, { skipSync: true });
            }
          }
          loadMyOrders();
          setClosingError(closeRes.error || 'Não foi possível solicitar o fechamento. Feche e abra a comanda e tente de novo.');
          return;
        }
        // Parcial: ao menos uma chegou ao operador — segue com aviso visível.
        if (failed.length > 0) {
          setClosingError(`${saleIds.length - failed.length}/${saleIds.length} enviadas. Chame o operador para o restante.`);
        }
      }

      // NÃO fecha a sessão — operador faz isso ao finalizar
      // Cliente vê mensagem de aguardando (falha total já retornou acima)
      setShowPaymentModal(false);
      setSelectedPayment('');
      setClosingNeedsChange(false);
      setClosingCashGiven(0);
      setShowMyComanda(false);
      setOrderSuccess(true); // Mostra tela de sucesso
    } catch (err: any) {
      setClosingError(err?.message || 'Não foi possível solicitar o fechamento. Tente de novo.');
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

      {/* Category Pills — até 4 linhas, sem rolagem lateral */}
      <div className="px-4 pt-3 pb-2">
        <div className="relative mb-2">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={menuSearch}
            onChange={(e) => setMenuSearch(e.target.value)}
            placeholder="Buscar produto pelo nome..."
            className="w-full pl-9 pr-8 py-2 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-xl text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {menuSearch && (
            <button
              type="button"
              onClick={() => setMenuSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              title="Limpar busca"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div
          ref={catsRef}
          className="flex flex-wrap gap-2 overflow-hidden"
        >
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
        {(catsExpanded || catsOverflow) && (
          <button
            type="button"
            onClick={() => setCatsExpanded(!catsExpanded)}
            className="mt-1.5 w-full py-1 rounded-lg text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10 transition-colors flex items-center justify-center gap-1"
          >
            {catsExpanded ? (
              <>Ver menos <ChevronUp className="w-3.5 h-3.5" /></>
            ) : (
              <>Ver mais categorias <ChevronDown className="w-3.5 h-3.5" /></>
            )}
          </button>
        )}
      </div>

      {/* Products Grid */}
      <div className="flex-1 px-4 pb-24 overflow-y-auto">
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
          {filteredProducts.map((product) => {
            const inCart = cart.find((item) => item.product.id === product.id);
            return (
              <div
                key={product.id}
                className="bg-white dark:bg-[#18181b] rounded-xl border border-slate-200 dark:border-[#27272a] overflow-hidden flex flex-col"
              >
                {/* Image - compacta: menos espaço em branco lateral */}
                <div className="w-full h-36 bg-white dark:bg-white relative flex items-center justify-center p-1">
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      loading="lazy"
                      className="max-w-full max-h-full w-auto h-auto object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxMjAiIGhlaWdodD0iMTIwIiBmaWxsPSIjZjBmOGY4Ii8+PC9zdmc+';
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-slate-50">
                      <Package className="w-8 h-8 text-slate-300" />
                    </div>
                  )}
                  {product.currentStock <= 0 && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <span className="text-white text-xs font-bold">Esgotado</span>
                    </div>
                  )}
                </div>
                {/* Info - compacto */}
                  <div className="p-2 flex-1 flex flex-col">
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
                    onClick={() => setShowPaymentModal(true)}
                    disabled={closingComanda}
                    className="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60 transition-colors"
                  >
                    {closingComanda ? 'Solicitando...' : 'Solicitar fechamento de comanda'}
                  </button>
                  <p className="text-[10px] text-slate-400 text-center">Escolha a forma de pagamento e o operador fechará a comanda.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: cliente escolhe forma de pagamento para fechar a comanda */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4" onClick={() => !closingComanda && setShowPaymentModal(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Solicitar fechamento da comanda</h3>
              <p className="text-[11px] text-slate-500 dark:text-[#71717a] mt-1">
                Total da comanda: <strong className="text-slate-900 dark:text-white">R$ {(myComandaTotal ?? 0).toFixed(2)}</strong>
              </p>
              <p className="text-[11px] text-slate-500 dark:text-[#71717a] mt-1">Escolha a forma de pagamento desejada:</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setSelectedPayment(opt.value);
                    if (opt.value === 'cash') {
                      setClosingCashGiven(myComandaTotal || 0);
                    }
                  }}
                  className={`py-3 rounded-xl text-sm font-bold border transition-colors ${
                    selectedPayment === opt.value
                      ? 'bg-teal-600 border-teal-600 text-white'
                      : 'bg-slate-50 dark:bg-[#09090b] border-slate-200 dark:border-[#27272a] text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {selectedPayment === 'cash' && (
              <div className="space-y-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Troco pra quanto? R$</label>
                <input
                  type="number"
                  step="0.01"
                  value={closingCashGiven}
                  onChange={(e) => setClosingCashGiven(parseFloat(e.target.value) || 0)}
                  className="w-full mt-1 px-3 py-2 bg-white dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-sm font-bold"
                  placeholder={myComandaTotal.toFixed(2)}
                />
                <p className="text-xs mt-1 font-bold text-emerald-600">Troco: R$ {Math.max(0, closingCashGiven - myComandaTotal).toFixed(2)}</p>
                <p className="text-[11px] text-slate-500">Deixe igual ao total se não precisar de troco.</p>
              </div>
            )}
            {closingError && (
              <p className="text-[11px] font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">
                {closingError}
              </p>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { setClosingError(null); setShowPaymentModal(false); }}
                disabled={closingComanda}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-[#27272a] text-slate-600 dark:text-slate-300 text-xs font-bold"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleRequestCloseComanda(selectedPayment)}
                disabled={!selectedPayment || closingComanda}
                className="flex-1 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-xs font-bold"
              >
                {closingComanda ? 'Enviando...' : 'Confirmar fechamento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
