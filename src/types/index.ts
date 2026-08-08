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
  kds?: boolean;            // Kitchen Display System
  cardapioDigital?: boolean; // Cardápio Digital + Mesas
}

export interface UserProfile {
  id: string;
  name: string;
  email: string; // E-mail da conta do Google
  role: Role;
  avatarUrl?: string;
  organizationId: string;
  storeBranchId: string;
  permissions: UserPermissions;
  active: boolean;
  createdAt?: string;
  password?: string;
  superadmin?: boolean;
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
}

export interface Product {
  id: string;
  barcode: string; // EAN-13
  name: string;
  category: string;
  unit: 'un' | 'kg' | 'cx' | 'lit' | 'm';
  costPrice: number;
  salePrice: number;
  currentStock: number;
  minStock: number;
  maxStock: number;
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
}

export interface Supplier {
  id: string;
  companyName: string;
  tradeName: string;
  cnpj: string;
  contactName: string;
  email: string;
  phone: string;
  storeBranchId?: string; // isolamento por filial
  organizationId?: string; // multi-tenant
}

export type OrderSource = 'pdv' | 'cardapio_digital' | 'fiado';
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
  status: 'open' | 'closed';
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
  scanDate: string;
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
