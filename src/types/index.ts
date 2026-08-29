export type Role = 'admin' | 'collaborator' | 'manager' | 'cashier';

export interface UserPermissions {
  pdv: boolean;
  inventory: boolean;
  crm: boolean;
  finance: boolean;
  dashboard: boolean;
  settings: boolean;
  tvShowcase?: boolean;
  comanda?: boolean;        // Fiados/Comanda/Mesa
  kds?: boolean;            // Pedidos / Cozinha
  cardapioDigital?: boolean; // Cardápio Digital + Mesas
  delivery?: boolean;       // Delivery
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatarUrl?: string;
  organizationId: string;
  storeBranchId: string;
  permissions: UserPermissions;
  active: boolean;
  createdAt?: string;
  password?: string;
  superadmin?: boolean;
  // Holerite / Payroll
  whatsapp?: string;
  salary?: number;
  transportationAllowance?: number;
  mealAllowance?: number;
  otherBenefits?: number;
  inssDiscount?: number;
  irDiscount?: number;
  otherDiscounts?: number;
}

export interface StoreBranch {
  id: string;
  name: string;
  code: string;
  cnpj: string;
  city: string;
  state: string;
  address: string;
  phone: string;
  isHeadquarters: boolean;
  active: boolean;
  organizationId?: string; // multi-tenant: qual organização esta filial pertence
  
  // Campos para Delivery (2026)
  fullAddress?: string; // Endereço completo para exibição e mapa
  whatsappPhone?: string; // WhatsApp para pedidos PIX do delivery
  latitude?: number; // Latitude para cálculo de distância
  longitude?: number; // Longitude para cálculo de distância
  deliveryEnabled?: boolean; // Delivery habilitado por filial
  pickupEnabled?: boolean; // Retirada habilitada por filial
}

export interface ProductLot {
  id: string;
  productId: string;          // ID do produto (obrigatório)
  lotNumber: string;         // Código do lote (ex: LOTE-2026-001)
  expirationDate: string;    // Data de validade (YYYY-MM-DD)
  quantity: number;          // Quantidade em estoque deste lote
  costPrice?: number;        // Custo específico deste lote (opcional)
  status: 'active' | 'expired' | 'disposed'; // active = em estoque; expired = vencido; disposed = descartado
  supplierId?: string;       // Fornecedor (opcional)
  receivedAt?: string;       // Data de recebimento (opcional)
  storeBranchId?: string;    // Filial
  organizationId?: string;   // Organização
}

export interface StockLossLog {
  id: string;
  reason: 'expired' | 'damaged' | 'other';
  quantity: number;
  productName?: string;
  productId?: string;
  lotId?: string;
  storeBranchId?: string;
  organizationId?: string;
  operatorName?: string;
  notes?: string;
  createdAt?: string;
}

export interface Product {
  id: string;
  barcode: string;
  name: string;
  description?: string;
  category: string;
  unit: 'un' | 'kg' | 'cx' | 'lit' | 'm';
  costPrice: number;
  salePrice: number;
  currentStock: number;
  minStock: number;
  maxStock: number; // mapeia max_stock_quantity no banco
  imageUrl: string;
  supplierId?: string;
  ncm?: string;
  cfop?: string;
  active: boolean;
  updatedAt: string;
  storeBranchId?: string;
  showOnTV?: boolean;
  tvPromoPrice?: number;
  tvHighlightTag?: string; // e.g. "COMBO DO DIA", "OFERTA TV", "LEVE 3 PAGUE 2"
  showOnCardapio?: boolean; // exibir no cardápio digital (QR code)
  organizationId?: string; // multi-tenant: qual organização este produto pertence
  // Venda no ATACADO: uma ou mais caixas com quantidades e preços diferentes
  wholesaleOptions?: WholesaleOption[];
  expirationDate?: string; // Data de validade (YYYY-MM-DD) — para alertas no Dashboard
  isComposite?: boolean; // true = produto composto (desconta ingredientes do estoque)
  useLots?: boolean;       // se verdadeiro, usa controle por lote (FEFO)
  // Produto Fragmentável (rendimento): ex.: garrafa de vódka fechada -> doses abertas
  is_fragmentable?: boolean;   // true = pode ser vendido em frações (doses)
  yield_count?: number;        // quantas frações (doses) cabem em 1 unidade fechada
  fraction_product_id?: string; // produto que representa a fração (ex.: "Dose Vódka")
  productLots?: ProductLot[]; // lotes ativos deste produto (para referência UI)
  activeStockLossLogs?: StockLossLog[]; // perdas registradas recentemente
}

export interface Category {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  description?: string;
  storeBranchId?: string; // isolamento por filial
  organizationId?: string; // multi-tenant
  sectors?: string[]; // setores vinculados (cozinha/bar/caixa)
}

// Opção de venda no ATACADO (caixa/fardo): quantidade de unidades na caixa + preço
// de venda da caixa INTEIRA. Ex.: { boxQuantity: 12, salePrice: 38.00 } =
// caixa com 12 unidades vendida por R$ 38,00 (preço unitário efetivo 3,17).
export interface WholesaleOption {
  id: string;
  boxQuantity: number; // quantas unidades vêm na caixa (12, 15, 18...)
  salePrice: number;   // preço de venda da caixa inteira (R$)
}

// ─── PRODUTOS COMPOSTOS (RECEITAS / BILL OF MATERIALS) ────────
// Um produto composto é montado por N ingredientes (outros produtos do estoque).
// Ao vender 1 unidade do composto, o sistema desconta automaticamente os ingredientes.
export interface ProductRecipe {
  id: string;
  compositeProductId: string; // FK → Product.id (o produto composto)
  ingredientProductId: string; // FK → Product.id (o ingrediente)
  ingredientName?: string; // Nome do ingrediente (denormalizado para exibição)
  quantity: number; // Quantidade do ingrediente por 1 unidade do composto (ex: 0.25 = 1 dose de 1L)
  unit?: string; // un, lit, kg — unidade de medida da receita
  storeBranchId?: string; // isolamento de filial
  organizationId?: string; // isolamento de org
}

// Tipo estendido de Product para incluir campos de compostos
export interface CompositeProduct extends Product {
  isComposite: boolean; // true = produto composto (desconta ingredientes)
  recipe?: ProductRecipe[]; // Lista de ingredientes da receita
}

// Contêiner aberto / fracionado (ex.: garrafa de vódka aberta, contendo doses disponíveis)
export interface OpenContainer {
  id: string;
  organizationId?: string;
  storeBranchId?: string;
  productId: string; // produto fechado original (ex.: Vódka 1L)
  remainingQuantity: number; // quantas frações (doses) ainda restam
  openedAt: string; // ISO timestamp da abertura
  status: 'open' | 'empty' | 'discarded';
  createdAt?: string;
  updatedAt?: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
  unitPrice: number;
  discount: number; // R$
  totalPrice: number;
  // Quando o item é uma opção de ATACADO (caixa):
  sourceProductId?: string; // id REAL do produto (para baixa de estoque unitária)
  stockQuantity?: number;   // quantas UNIDADES o item representa no estoque (ex.: 12)
}

export type PaymentMethod = 'cash' | 'pix' | 'credit_card' | 'debit_card' | 'credit_account';

export interface PaymentDetails {
  method: PaymentMethod;
  amount: number;
  installments?: number;
  cashGiven?: number;
  changeDue?: number;
  pixTxId?: string;
  cardBrand?: string;
}

export interface Customer {
  id: string;
  name: string;
  cpfCnpj: string;
  email: string;
  phone: string;
  creditLimit: number;
  currentBalance: number; // Debts or credit
  loyaltyPoints: number;
  city: string;
  state: string;
  createdAt: string;
  storeBranchId?: string; // isolamento por filial
  organizationId?: string; // multi-tenant
  
  // Campos para Delivery (2026)
  birthDate?: string; // Data de nascimento (para recuperação de senha)
  whatsapp?: string; // WhatsApp para contato
  addressStreet?: string;
  addressNumber?: string;
  addressComplement?: string;
  addressNeighborhood?: string;
  addressCity?: string;
  addressState?: string;
  addressZip?: string;
  googleId?: string; // ID do Google para login OAuth
  passwordHash?: string; // Senha para login manual do cliente
  customerType?: 'walkin' | 'delivery' | 'both'; // Tipo de cliente
}

export interface Supplier {
  id: string;
  name?: string;
  companyName: string;
  tradeName: string;
  cnpj: string;
  contactName: string;
  email: string;
  phone: string;
  storeBranchId?: string; // isolamento por filial
  organizationId?: string; // multi-tenant
}

export type OrderSource = 'pdv' | 'cardapio_digital' | 'fiado' | 'delivery';
export type KitchenStatus = 'pending' | 'preparing' | 'ready' | 'delivered' | 'cancelled' | 'closing_request';

export interface Sale {
  id: string;
  code: string; // e.g. VEN-10492
  date: string;
  operatorId: string;
  operatorName: string;
  customerId?: string;
  customerName?: string;
  storeBranchId: string;
  items: {
    productId: string;
    productName: string;
    unitPrice: number;
    quantity: number;
    total: number;
  }[];
  subtotal: number;
  discount: number;
  total: number;
  payments: PaymentDetails[];
  status: 'completed' | 'cancelled' | 'pending';
  updatedAt?: string;
  organizationId?: string; // multi-tenant
  // Cardápio Digital / Comanda
  tableId?: string;            // mesa onde o pedido foi feito
  customerSessionId?: string;  // sessão do cliente (1 por mesa)
  orderSource?: OrderSource;   // origem da venda
  kitchenStatus?: KitchenStatus; // status no KDS
  // Payment Provider
  payment_id?: string;          // ID do pagamento no provedor (Mercado Pago, Stripe, etc.)
  // Observações
  notes?: string;               // Observações da venda (usado no cupom e syncSale)
}

export interface CashRegisterSession {
  id: string;
  openedAt: string;
  closedAt?: string;
  operatorId: string;
  operatorName: string;
  initialCash: number;
  currentCashBalance: number;
  totalSalesCash: number;
  totalSalesPix: number;
  totalSalesCard: number;
  totalSalesCreditAccount: number;
  suprimentos: number; // Add money
  sangrias: number; // Withdraw money
  status: 'open' | 'closed' | 'final_closed';
  notes?: string;
  storeBranchId?: string;
  organizationId?: string; // multi-tenant
}

export interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  type: 'in' | 'out' | 'adjustment' | 'loss';
  quantity: number;
  previousStock: number;
  newStock: number;
  reason: string;
  date: string;
  operatorName: string;
  storeBranchId?: string;
  organizationId?: string; // multi-tenant
  sale_id?: string | null; // venda de origem (preenchido pelo RPC process_sale_transaction)
}

export interface FinancialAccount {
  id: string;
  title: string;
  type: 'payable' | 'receivable';
  category?: string;
  amount: number; // Para parcelado: valor total. Para recorrência: valor fixo por ocorrência.
  dueDate: string;
  paidDate?: string;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  recipientOrPayer: string;
  notes?: string;
  storeBranchId?: string;
  organizationId?: string;
  // Recorrência / Parcelamento
  isRecurring?: boolean;
  isInstallment?: boolean;
  recurrenceType?: 'monthly' | 'weekly' | 'biweekly';
  recurrenceCount?: number;
  recurrenceParentId?: string;
  installmentNumber?: number;
  // Parcelas (para contas parceladas) — cada parcela tem seu próprio status/baixa
  installments?: FinancialInstallment[];
  // Ocorrências (para contas recorrentes) — cada ocorrência tem seu próprio status/baixa
  recurrences?: FinancialRecurrence[];
}

// Parcela individual de uma conta parcelada
export interface FinancialInstallment {
  id: string;
  number: number; // 1, 2, 3...
  amount: number;
  dueDate: string;
  status: 'pending' | 'paid' | 'overdue';
  paidDate?: string;
}

// Ocorrência individual de uma conta recorrente
export interface FinancialRecurrence {
  id: string;
  number: number; // 1, 2, 3...
  dueDate: string;
  status: 'pending' | 'paid' | 'overdue';
  paidDate?: string;
}

// Histórico de boletos escaneados (sincronizado — tabela scanned_boletos)
export interface ScannedBoleto {
  id: string;
  linhaDigitavel: string;
  barcode?: string;
  amount: number;
  dueDate?: string;
  payer: string;
  scanDate: string;
  financialAccountId?: string; // conta a pagar criada a partir do boleto
  status?: string;
  storeBranchId?: string;
  organizationId?: string;
}

// Pagamento de dívida fiado (sincronizado — tabela credit_payments)
export interface CreditPayment {
  id: string;
  saleId: string;
  customerId?: string;
  customerName?: string;
  amount: number;
  date: string; // ISO
  paymentMethod?: string;
  storeBranchId?: string;
  organizationId?: string;
}

// Nota fiscal importada (sincronizado — tabela nf_records)
export interface NFRecord {
  id: string;
  nfNumber?: string;
  scanDate: string;
  createdAt?: string;
  supplierName: string;
  items: { productName: string; quantity: number; unitPrice: number }[];
  totalValue: number;
  note: string;
  storeBranchId?: string;
  organizationId?: string;
}

export interface SystemSettings {
  companyName: string;
  tradeName: string;
  cnpj: string;
  ie: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pixKey: string;
  printerPaperSize?: '58mm' | '80mm';
  thermalPrinterWidth?: '58mm' | '80mm';
  autoPrintReceipt: boolean;
  soundEffectsEnabled: boolean;
  receiptHeaderMsg: string;
  receiptFooterMsg: string;
  // TV Showcase Settings
  tvSlideSpeed?: number;
  tvDisplayMode?: 'single' | 'grid';
}

// ─── FRENTES TV E IMPRESSORA (agosto/2026) ─────────────────────────────
// Sincronizadas — tabelas footer_messages, media_devices, printers.
// Nomes de coluna conferidos contra o catálogo real do Supabase.

// Mensagem do rodapé da vitrine de TV (tabela footer_messages)
export interface FooterMessage {
  id: string;
  message: string;   // coluna message
  active: boolean;   // coluna active
  sortOrder: number; // coluna sort_order
  storeBranchId?: string;
  organizationId?: string;
}

// Dispositivo de TV/vitrine pareado (tabela media_devices).
// ATENÇÃO: não existe coluna status no banco — status é DERIVADO de
// last_seen_at (online se heartbeat < 60s).
export interface MediaDevice {
  id: string;
  name: string;
  deviceType: 'tv' | 'vitrine';
  address?: string;      // coluna address
  pairingCode: string;   // coluna pairing_code
  active: boolean;       // coluna is_active
  status: 'online' | 'offline' | 'pending';
  lastSeenAt?: string;   // coluna last_seen_at
  storeBranchId?: string;
  organizationId?: string;
}

// Impressora configurada (tabela printers)
export type PrinterRole = 'caixa' | 'bar' | 'cozinha' | 'outro';

export interface Printer {
  id: string;
  name: string;
  model?: string;                                        // coluna model
  transport: 'webusb' | 'serial' | 'network' | 'os';     // coluna transport
  ipAddress?: string;                                    // coluna ip_address
  port?: number;                                         // coluna port
  isDefault: boolean;                                    // coluna is_default
  status?: string;                                       // coluna status (texto bruto)
  lastSeenAt?: string;                                   // coluna last_seen_at
  storeBranchId?: string;
  organizationId?: string;
  role?: PrinterRole;                                    // roteamento: caixa/bar/cozinha
  categoryId?: string;                                   // categoria específica (opcional)
}

// ─── CARDÁPIO DIGITAL / COMANDAS / MESAS (2026) ──────────────────────────────

// Mesa física do estabelecimento (tabela tables)
export interface Table {
  id: string;
  name: string;
  number?: number;
  qrToken: string;          // token embaralhado usado no QR code
  status: 'active' | 'inactive';
  storeBranchId: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

// Sessão de cliente em uma mesa — 1 ativa por mesa (tabela customer_sessions)
export interface CustomerSession {
  id: string;
  tableId: string;
  sessionToken: string;
  status: 'active' | 'completed' | 'cancelled';
  openedAt: string;
  closedAt?: string;
  deviceFingerprint?: string;
  customerName?: string;
  phone?: string;
  address?: string;
  storeBranchId: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

// Configuração do cardápio digital por filial (tabela digital_menu_config)
export interface DigitalMenuConfig {
  id: string;
  title: string;
  subtitle?: string;
  logoUrl?: string;
  bannerUrl?: string;
  layoutMode: 'grid' | 'list';
  showPrices: boolean;
  storeBranchId: string;
  organizationId: string;
  updatedAt: string;
}

// Paleta de cores por filial (tabela branch_themes)
export interface BranchTheme {
  id: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  bgColor: string;
  logoUrl?: string;
  faviconUrl?: string;
  storeBranchId: string;
  organizationId: string;
  updatedAt: string;
  // Extended colors (2026)
  buttonBg?: string;
  buttonText?: string;
  menuBg?: string;
  signalRed?: string;
  signalGreen?: string;
  signalYellow?: string;
}

// Chave de API para integrações externas — por filial (tabela api_keys)
export interface ApiKey {
  id: string;
  name: string;
  keyHash: string;
  keyPrefix: string;        // primeiros 8 chars para exibir ex: "pk_live_a3..."
  permissions: string[];
  isActive: boolean;
  lastUsedAt?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
  storeBranchId: string;
  organizationId: string;
}

// ─── DELIVERY (2026) ──────────────────────────────────────────────────────────

// Configurações de delivery por filial (tabela delivery_settings)
export interface DeliverySettings {
  id: string;
  organizationId: string;
  storeBranchId: string;
  isActive: boolean;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  operatingHours: Record<string, { open: string; close: string }>;
  feeCalculationType: 'fixed' | 'neighborhood' | 'distance' | 'free';
  fixedFee: number;
  minimumOrderValue: number;
  estimatedDeliveryTime: number;
  maxDeliveryDistanceKm: number;
  branchLatitude?: number;
  branchLongitude?: number;
  whatsappPhone?: string;
  fullAddress?: string;
  // Configurações do colaborador do delivery (2026)
  deliveryWorkerFeePercent?: number; // % da taxa que o colaborador recebe (0-100)
  deliveryWorkerPayType?: 'salary' | 'daily'; // salary = com holerite, daily = diarista sem holerite
  deliveryWorkerDailyPay?: number; // Valor fixo da diária (se payType = daily)
  createdAt: string;
  updatedAt: string;
}

// Bairro com taxa de entrega (tabela delivery_neighborhoods)
export interface DeliveryNeighborhood {
  id: string;
  organizationId: string;
  storeBranchId: string;
  neighborhood: string;
  fee: number;
  estimatedTimeMinutes: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Faixa de distância com taxa de entrega (tabela delivery_distance_rates)
export interface DeliveryDistanceRate {
  id: string;
  organizationId: string;
  storeBranchId: string;
  minKm: number;
  maxKm: number;
  fee: number;
  estimatedTimeMinutes: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Endereço de entrega
export interface DeliveryAddress {
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  zip?: string;
  latitude?: number;
  longitude?: number;
}

// Item do pedido de delivery
export interface DeliveryOrderItem {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  total: number;
  notes?: string;
}

// Pedido de delivery (tabela delivery_orders)
export interface DeliveryOrder {
  id: string;
  organizationId: string;
  storeBranchId: string;
  customerId?: string;
  orderNumber: number;
  orderType: 'delivery' | 'pickup';
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'out_for_delivery' | 'delivered' | 'cancelled';
  items: DeliveryOrderItem[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  paymentMethod?: 'cash' | 'credit_card' | 'debit_card' | 'pix';
  changeAmount?: number;
  deliveryAddress?: DeliveryAddress;
  customerName: string;
  customerWhatsapp?: string;
  customerEmail?: string;
  notes?: string;
  estimatedDeliveryTime?: number;
  confirmedAt?: string;
  preparingAt?: string;
  readyAt?: string;
  outForDeliveryAt?: string;
  deliveredAt?: string;
  cancelledAt?: string;
  cancelledReason?: string;
  whatsappSent: boolean;
  whatsappSentAt?: string;
  deliveredBy?: string;
  createdAt: string;
  updatedAt: string;
}

// Ganhos do colaborador do delivery (tabela delivery_worker_earnings)
export interface DeliveryWorkerEarnings {
  id: string;
  organizationId: string;
  storeBranchId: string;
  workerId: string;
  deliveryOrderId?: string;
  deliveryFee: number;
  workerAmount: number;
  companyAmount: number;
  payType: 'salary' | 'daily';
  paid: boolean;
  paidAt?: string;
  createdAt: string;
}
