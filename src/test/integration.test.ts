/**
 * Integration tests for pure logic (no auth/branch dependencies)
 *
 * storageService tests require full auth setup — tested manually.
 * These tests verify hooks and validators work end-to-end.
 */
import { describe, it, expect } from 'vitest';

describe('usePagination integration', () => {
  it('handles 250 items across 5 pages', async () => {
    const { renderHook, act } = await import('@testing-library/react');
    const { usePagination } = await import('../hooks/usePagination');

    const items = Array.from({ length: 250 }, (_, i) => ({
      id: `item-${i}`,
      name: `Item ${i}`,
    }));

    const { result } = renderHook(() =>
      usePagination({ data: items, itemsPerPage: 50 })
    );

    expect(result.current.totalPages).toBe(5);
    expect(result.current.paginatedData).toHaveLength(50);
    expect(result.current.paginatedData[0].id).toBe('item-0');

    act(() => result.current.nextPage());
    expect(result.current.currentPage).toBe(2);
    expect(result.current.paginatedData[0].id).toBe('item-50');

    act(() => result.current.goToPage(5));
    expect(result.current.currentPage).toBe(5);
    expect(result.current.paginatedData).toHaveLength(50);

    act(() => result.current.nextPage());
    expect(result.current.currentPage).toBe(5); // clamped
    expect(result.current.hasNext).toBe(false);
  });

  it('handles filtering + pagination together', async () => {
    const { renderHook, act } = await import('@testing-library/react');
    const { usePagination } = await import('../hooks/usePagination');

    const allItems = Array.from({ length: 100 }, (_, i) => ({
      id: `item-${i}`,
      category: i % 2 === 0 ? 'A' : 'B',
    }));

    // Filter to category A only
    const filtered = allItems.filter(item => item.category === 'A');

    const { result } = renderHook(() =>
      usePagination({ data: filtered, itemsPerPage: 20 })
    );

    expect(result.current.totalItems).toBe(50);
    expect(result.current.totalPages).toBe(3);
    expect(result.current.paginatedData).toHaveLength(20);
  });
});

describe('schemas integration', () => {
  it('validates complete product form data', async () => {
    const { productSchema } = await import('../validators/schemas');

    const formData = {
      name: 'Cerveja Skol 350ml',
      barcode: '7891234567890',
      salePrice: 5.99,
      costPrice: 3.50,
      stockQuantity: 120,
      category: 'Bebidas',
      unit: 'un',
    };

    const result = productSchema.safeParse(formData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Cerveja Skol 350ml');
      expect(result.data.salePrice).toBe(5.99);
    }
  });

  it('validates complete customer form data', async () => {
    const { customerSchema } = await import('../validators/schemas');

    const formData = {
      name: 'Maria Santos',
      cpfCnpj: '123.456.789-00',
      email: 'maria@example.com',
      phone: '(11) 99999-8888',
      customerType: 'delivery' as const,
      creditLimit: 1000,
      addressStreet: 'Rua das Flores',
      addressNumber: '123',
      addressCity: 'São Paulo',
      addressState: 'SP',
      addressZip: '01234-567',
    };

    const result = customerSchema.safeParse(formData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Maria Santos');
      expect(result.data.customerType).toBe('delivery');
    }
  });

  it('validates sale with multiple payments', async () => {
    const { saleSchema } = await import('../validators/schemas');

    const saleData = {
      items: [
        { productId: 'p1', productName: 'Product A', quantity: 2, unitPrice: 10, totalPrice: 20 },
        { productId: 'p2', productName: 'Product B', quantity: 1, unitPrice: 15, totalPrice: 15 },
      ],
      payments: [
        { method: 'cash' as const, amount: 20 },
        { method: 'pix' as const, amount: 15 },
      ],
      total: 35,
    };

    const result = saleSchema.safeParse(saleData);
    expect(result.success).toBe(true);
  });
});

describe('error handling', () => {
  it('validateWithSchema returns structured errors', async () => {
    const { validateWithSchema, productSchema } = await import('../validators/schemas');

    const errors = validateWithSchema(productSchema, {
      name: '',
      salePrice: -5,
      costPrice: -1,
      stockQuantity: -10,
    });

    expect(errors).not.toBeNull();
    expect(errors!.length).toBeGreaterThanOrEqual(2);

    const fields = errors!.map(e => e.field);
    expect(fields).toContain('name');
    expect(fields).toContain('salePrice');
  });
});
