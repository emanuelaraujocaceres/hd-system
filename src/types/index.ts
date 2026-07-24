export type Role = 'admin' | 'manager' | 'cashier';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatarUrl?: string;
  organizationId: string;
  storeBranchId: string;
}

export interface StoreBranch {
  id: string;
  name: string;
  cnpj: string;
  city: string;
  state: string;
  isMain: boolean;
}

export interface Product {
  id: string;
  sku: string;
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
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
  unitPrice: number;
  discount: number; // R$
  totalPrice: number;
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
}

export interface Supplier {
  id: string;
  companyName: string;
  tradeName: string;
  cnpj: string;
  contactName: string;
  email: string;
  phone: string;
}

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
  nfceKey?: string;
  nfceProtocol?: string;
  nfceStatus?: 'issued' | 'pending' | 'none';
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
}

export interface FinancialAccount {
  id: string;
  title: string;
  type: 'payable' | 'receivable'; // Contas a Pagar x Receber
  category: string;
  amount: number;
  dueDate: string;
  paidDate?: string;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  recipientOrPayer: string;
  notes?: string;
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
  thermalPrinterWidth: '58mm' | '80mm';
  autoPrintReceipt: boolean;
  soundEffectsEnabled: boolean;
  receiptHeaderMsg: string;
  receiptFooterMsg: string;
}
