export interface Sale {
  id: string;
  code: string;
  date: string;
  items: CartItem[];
  subtotal: number;
  discount: number;
  total: number;
  payments: PaymentDetails[];
  status: 'completed' | 'cancelled' | 'pending';
}
