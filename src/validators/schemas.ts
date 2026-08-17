/**
 * Zod Validation Schemas — HD-System
 *
 * Centralized validation for all entity forms.
 * Each schema includes:
 * - Field-level validation rules
 * - Custom error messages in Portuguese
 * - Transformations (trim, coerce numbers)
 *
 * Uso:
 *   import { productSchema } from '../validators/schemas';
 *   const result = productSchema.safeParse(formData);
 *   if (!result.success) { /* show errors * / }
 */

import { z } from 'zod';

// ─── Helper: Brazilian phone format ────────────────────────────
const phoneRegex = /^\(?\d{2}\)?\s?\d{4,5}-?\d{4}$/;
const cpfCnpjRegex = /^(\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cepRegex = /^\d{5}-?\d{3}$/;

// ─── PRODUCT ───────────────────────────────────────────────────
export const productSchema = z.object({
  name: z.string().trim().min(1, 'Nome do produto é obrigatório.'),
  barcode: z.string().optional().default(''),
  salePrice: z.coerce
    .number({ invalid_type_error: 'Preço de venda deve ser um número.' })
    .positive('Preço de venda deve ser maior que zero.'),
  costPrice: z.coerce
    .number({ invalid_type_error: 'Preço de custo deve ser um número.' })
    .min(0, 'Preço de custo não pode ser negativo.'),
  stockQuantity: z.coerce
    .number({ invalid_type_error: 'Estoque deve ser um número.' })
    .int('Estoque deve ser um número inteiro.')
    .min(0, 'Estoque não pode ser negativo.')
    .optional()
    .default(0),
  category: z.string().optional().default(''),
  unit: z.string().optional().default('un'),
  description: z.string().optional().default(''),
  active: z.boolean().optional().default(true),
  showOnCardapio: z.boolean().optional().default(false),
  minStock: z.coerce.number().min(0).optional().default(0),
  maxStock: z.coerce.number().min(0).optional().default(0),
  // Wholesale
  boxQuantity: z.coerce.number().int().min(0).optional().default(0),
  boxPrice: z.coerce.number().min(0).optional().default(0),
});

export type ProductInput = z.infer<typeof productSchema>;

// ─── CUSTOMER ──────────────────────────────────────────────────
export const customerSchema = z.object({
  name: z.string().trim().min(1, 'Nome do cliente é obrigatório.'),
  cpfCnpj: z.string().optional().default('').refine(
    (val) => !val || cpfCnpjRegex.test(val.replace(/\D/g, '')),
    'CPF/CNPJ inválido.'
  ),
  email: z.string().optional().default('').refine(
    (val) => !val || emailRegex.test(val),
    'E-mail inválido.'
  ),
  phone: z.string().optional().default('').refine(
    (val) => !val || phoneRegex.test(val.replace(/\D/g, '').replace(/^(\d{2})/, '($1) ')),
    'Telefone inválido.'
  ),
  whatsapp: z.string().optional().default(''),
  customerType: z.enum(['walkin', 'delivery', 'both']).optional().default('walkin'),
  creditLimit: z.coerce.number().min(0).optional().default(0),
  notes: z.string().optional().default(''),
  birthDate: z.string().optional().default(''),
  // Address
  addressStreet: z.string().optional().default(''),
  addressNumber: z.string().optional().default(''),
  addressComplement: z.string().optional().default(''),
  addressNeighborhood: z.string().optional().default(''),
  addressCity: z.string().optional().default(''),
  addressState: z.string().optional().default('').refine(
    (val) => !val || val.length === 2,
    'Estado deve ter 2 letras (UF).'
  ),
  addressZip: z.string().optional().default('').refine(
    (val) => !val || cepRegex.test(val),
    'CEP inválido.'
  ),
});

export type CustomerInput = z.infer<typeof customerSchema>;

// ─── SUPPLIER ──────────────────────────────────────────────────
export const supplierSchema = z.object({
  companyName: z.string().trim().min(1, 'Nome / Razão Social é obrigatório.'),
  tradeName: z.string().optional().default(''),
  cnpj: z.string().optional().default(''),
  contactName: z.string().optional().default(''),
  email: z.string().optional().default('').refine(
    (val) => !val || emailRegex.test(val),
    'E-mail inválido.'
  ),
  phone: z.string().optional().default('').refine(
    (val) => !val || phoneRegex.test(val.replace(/\D/g, '').replace(/^(\d{2})/, '($1) ')),
    'Telefone inválido.'
  ),
  address: z.string().optional().default(''),
  notes: z.string().optional().default(''),
});

export type SupplierInput = z.infer<typeof supplierSchema>;

// ─── CATEGORY ──────────────────────────────────────────────────
export const categorySchema = z.object({
  name: z.string().trim().min(1, 'Nome da categoria é obrigatório.'),
});

export type CategoryInput = z.infer<typeof categorySchema>;

// ─── TABLE (MESA) ──────────────────────────────────────────────
export const tableSchema = z.object({
  name: z.string().trim().min(1, 'Nome/número da mesa é obrigatório.'),
  number: z.coerce.number().int().positive().optional(),
  capacity: z.coerce.number().int().positive().optional().default(4),
  status: z.enum(['available', 'occupied', 'reserved', 'maintenance']).optional().default('available'),
});

export type TableInput = z.infer<typeof tableSchema>;

// ─── USER PROFILE ──────────────────────────────────────────────
export const userProfileSchema = z.object({
  name: z.string().trim().min(1, 'Nome do usuário é obrigatório.'),
  email: z.string().trim().min(1, 'E-mail é obrigatório.').email('E-mail inválido.'),
  role: z.enum(['admin', 'collaborator']).optional().default('collaborator'),
});

export type UserProfileInput = z.infer<typeof userProfileSchema>;

// ─── PASSWORD CHANGE ───────────────────────────────────────────
export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, 'Informe a senha atual.'),
  newPassword: z.string().min(8, 'A nova senha deve ter pelo menos 8 caracteres.'),
  confirmPassword: z.string().min(1, 'Confirme a nova senha.'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'As senhas não conferem.',
  path: ['confirmPassword'],
});

export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;

// ─── SALE (PDV) ────────────────────────────────────────────────
export const saleItemSchema = z.object({
  productId: z.string().min(1),
  productName: z.string().min(1),
  quantity: z.coerce.number().positive('Quantidade deve ser maior que zero.'),
  unitPrice: z.coerce.number().min(0),
  totalPrice: z.coerce.number().min(0),
  discount: z.coerce.number().min(0).optional().default(0),
});

export const paymentSchema = z.object({
  method: z.enum(['cash', 'credit_card', 'debit_card', 'pix', 'credit_account', 'other']),
  amount: z.coerce.number().positive('Valor do pagamento deve ser maior que zero.'),
  reference: z.string().optional().default(''),
});

export const saleSchema = z.object({
  items: z.array(saleItemSchema).min(1, 'Adicione pelo menos um item.'),
  payments: z.array(paymentSchema).min(1, 'Adicione pelo menos uma forma de pagamento.'),
  total: z.coerce.number().positive(),
  discount: z.coerce.number().min(0).optional().default(0),
  customerId: z.string().optional().default(''),
  notes: z.string().optional().default(''),
});

export type SaleInput = z.infer<typeof saleSchema>;
export type SaleItemInput = z.infer<typeof saleItemSchema>;
export type PaymentInput = z.infer<typeof paymentSchema>;

// ─── CASH SESSION (CAIXA) ──────────────────────────────────────
export const cashSessionSchema = z.object({
  openingAmount: z.coerce.number().min(0, 'Valor de abertura não pode ser negativo.'),
  notes: z.string().optional().default(''),
});

export type CashSessionInput = z.infer<typeof cashSessionSchema>;

// ─── FINANCIAL TRANSACTION ─────────────────────────────────────
export const financialTransactionSchema = z.object({
  description: z.string().trim().min(1, 'Descrição é obrigatória.'),
  amount: z.coerce.number().positive('Valor deve ser maior que zero.'),
  type: z.enum(['income', 'expense']),
  category: z.string().optional().default(''),
  dueDate: z.string().min(1, 'Data de vencimento é obrigatória.'),
  status: z.enum(['pending', 'paid', 'overdue', 'cancelled']).optional().default('pending'),
  notes: z.string().optional().default(''),
});

export type FinancialTransactionInput = z.infer<typeof financialTransactionSchema>;

// ─── VALIDATION HELPER ─────────────────────────────────────────
/**
 * Validate data with a Zod schema and return formatted errors.
 * Returns null if valid, or array of { field, message } objects.
 */
export function validateWithSchema<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { field: string; message: string }[] | null {
  const result = schema.safeParse(data);
  if (result.success) return null;

  return result.error.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }));
}

/**
 * Validate and throw if invalid (for service layer).
 */
export function validateOrThrow<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context?: string
): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errors = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`${context ? `[${context}] ` : ''}Validation failed: ${errors}`);
  }
  return result.data;
}
