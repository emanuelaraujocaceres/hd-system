/**
 * Tests for Zod validation schemas
 */
import { describe, it, expect } from 'vitest';
import {
  productSchema,
  customerSchema,
  supplierSchema,
  categorySchema,
  tableSchema,
  userProfileSchema,
  passwordChangeSchema,
  saleSchema,
  validateWithSchema,
} from '../validators/schemas';

describe('productSchema', () => {
  it('accepts valid product', () => {
    const result = productSchema.safeParse({
      name: 'Cerveja Skol',
      salePrice: 5.99,
      costPrice: 3.50,
      stockQuantity: 100,
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = productSchema.safeParse({ name: '', salePrice: 10 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('obrigatório');
    }
  });

  it('rejects zero sale price', () => {
    const result = productSchema.safeParse({ name: 'Product', salePrice: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects negative sale price', () => {
    const result = productSchema.safeParse({ name: 'Product', salePrice: -5 });
    expect(result.success).toBe(false);
  });

  it('accepts zero cost price', () => {
    const result = productSchema.safeParse({
      name: 'Product',
      salePrice: 10,
      costPrice: 0,
    });
    expect(result.success).toBe(true);
  });

  it('rejects negative cost price', () => {
    const result = productSchema.safeParse({
      name: 'Product',
      salePrice: 10,
      costPrice: -1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative stock', () => {
    const result = productSchema.safeParse({
      name: 'Product',
      salePrice: 10,
      stockQuantity: -5,
    });
    expect(result.success).toBe(false);
  });

  it('coerces string prices to numbers', () => {
    const result = productSchema.safeParse({
      name: 'Product',
      salePrice: '10.50',
      costPrice: '5.00',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.salePrice).toBe(10.5);
    }
  });
});

describe('customerSchema', () => {
  it('accepts valid customer with name only', () => {
    const result = customerSchema.safeParse({ name: 'João Silva' });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = customerSchema.safeParse({ name: '  ' });
    expect(result.success).toBe(false);
  });

  it('validates email format', () => {
    const result = customerSchema.safeParse({
      name: 'João',
      email: 'invalid-email',
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid email', () => {
    const result = customerSchema.safeParse({
      name: 'João',
      email: 'joao@example.com',
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty optional fields', () => {
    const result = customerSchema.safeParse({
      name: 'João',
      cpfCnpj: '',
      email: '',
      phone: '',
    });
    expect(result.success).toBe(true);
  });

  it('validates UF length', () => {
    const result = customerSchema.safeParse({
      name: 'João',
      addressState: 'SPX',
    });
    expect(result.success).toBe(false);
  });
});

describe('supplierSchema', () => {
  it('accepts valid supplier', () => {
    const result = supplierSchema.safeParse({
      companyName: 'Fornecedor ABC',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty company name', () => {
    const result = supplierSchema.safeParse({ companyName: '' });
    expect(result.success).toBe(false);
  });
});

describe('categorySchema', () => {
  it('accepts valid category', () => {
    const result = categorySchema.safeParse({ name: 'Bebidas' });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = categorySchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });
});

describe('tableSchema', () => {
  it('accepts valid table', () => {
    const result = tableSchema.safeParse({ name: 'Mesa 1' });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = tableSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });
});

describe('userProfileSchema', () => {
  it('accepts valid user', () => {
    const result = userProfileSchema.safeParse({
      name: 'Admin',
      email: 'admin@example.com',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = userProfileSchema.safeParse({
      name: '',
      email: 'admin@example.com',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email', () => {
    const result = userProfileSchema.safeParse({
      name: 'Admin',
      email: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });
});

describe('passwordChangeSchema', () => {
  it('accepts valid password change', () => {
    const result = passwordChangeSchema.safeParse({
      currentPassword: 'old12345',
      newPassword: 'new12345',
      confirmPassword: 'new12345',
    });
    expect(result.success).toBe(true);
  });

  it('rejects short password', () => {
    const result = passwordChangeSchema.safeParse({
      currentPassword: 'old',
      newPassword: 'short',
      confirmPassword: 'short',
    });
    expect(result.success).toBe(false);
  });

  it('rejects mismatched passwords', () => {
    const result = passwordChangeSchema.safeParse({
      currentPassword: 'old12345',
      newPassword: 'new12345',
      confirmPassword: 'different12345',
    });
    expect(result.success).toBe(false);
  });
});

describe('saleSchema', () => {
  it('accepts valid sale', () => {
    const result = saleSchema.safeParse({
      items: [
        { productId: '1', productName: 'Product', quantity: 2, unitPrice: 10, totalPrice: 20 },
      ],
      payments: [{ method: 'cash', amount: 20 }],
      total: 20,
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty items', () => {
    const result = saleSchema.safeParse({
      items: [],
      payments: [{ method: 'cash', amount: 20 }],
      total: 20,
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty payments', () => {
    const result = saleSchema.safeParse({
      items: [{ productId: '1', productName: 'Product', quantity: 1, unitPrice: 10, totalPrice: 10 }],
      payments: [],
      total: 10,
    });
    expect(result.success).toBe(false);
  });
});

describe('validateWithSchema', () => {
  it('returns null for valid data', () => {
    const errors = validateWithSchema(productSchema, {
      name: 'Product',
      salePrice: 10,
      costPrice: 5,
    });
    expect(errors).toBeNull();
  });

  it('returns formatted errors for invalid data', () => {
    const errors = validateWithSchema(productSchema, {
      name: '',
      salePrice: -1,
    });
    expect(errors).not.toBeNull();
    expect(errors!.length).toBeGreaterThan(0);
    expect(errors![0]).toHaveProperty('field');
    expect(errors![0]).toHaveProperty('message');
  });
});
