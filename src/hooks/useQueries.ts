/**
 * useQuery hooks for HD-System data
 *
 * Wraps storageService methods with React Query for:
 * - Automatic caching
 * - Background refetching
 * - Optimistic updates
 * - Cache invalidation
 *
 * Usage:
 *   const { data: products } = useProductsQuery();
 *   const { data: customers } = useCustomersQuery();
 *   const { mutate: saveProduct } = useSaveProductMutation();
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { storageService } from '../services/storageService';
import { syncService } from '../services/syncService';
import { Product, Customer, Supplier, Category, Sale, CashRegisterSession, UserProfile } from '../types';
import { queryClient } from '../providers/QueryProvider';

// ─── Query Keys ─────────────────────────────────────────────
export const queryKeys = {
  products: ['products'] as const,
  customers: ['customers'] as const,
  suppliers: ['suppliers'] as const,
  categories: ['categories'] as const,
  sales: ['sales'] as const,
  cashSessions: ['cashSessions'] as const,
  users: ['users'] as const,
  settings: ['settings'] as const,
  tables: ['tables'] as const,
  financial: ['financial'] as const,
} as const;

// ─── Products ───────────────────────────────────────────────
export function useProductsQuery() {
  return useQuery({
    queryKey: queryKeys.products,
    queryFn: () => storageService.getProducts(),
    staleTime: 30 * 1000, // Products change often — 30s stale time
  });
}

export function useSaveProductMutation() {
  const queryClient = useQueryClient();
  return useMutation<Product, Error, Product>({
    mutationFn: async (product: Product) => {
      storageService.saveProduct(product);
      syncService.upsertRow('products', product as any);
      return product;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products });
    },
  });
}

// ─── Customers ──────────────────────────────────────────────
export function useCustomersQuery() {
  return useQuery({
    queryKey: queryKeys.customers,
    queryFn: () => storageService.getCustomers(),
  });
}

export function useSaveCustomerMutation() {
  const queryClient = useQueryClient();
  return useMutation<Customer, Error, Customer>({
    mutationFn: async (customer: Customer) => {
      storageService.saveCustomer(customer);
      return customer;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customers });
    },
  });
}

// ─── Suppliers ──────────────────────────────────────────────
export function useSuppliersQuery() {
  return useQuery({
    queryKey: queryKeys.suppliers,
    queryFn: () => storageService.getSuppliers(),
  });
}

// ─── Categories ─────────────────────────────────────────────
export function useCategoriesQuery() {
  return useQuery({
    queryKey: queryKeys.categories,
    queryFn: () => storageService.getCategories(),
  });
}

// ─── Sales ──────────────────────────────────────────────────
export function useSalesQuery() {
  return useQuery({
    queryKey: queryKeys.sales,
    queryFn: () => storageService.getSales(),
    staleTime: 60 * 1000, // Sales change less frequently — 1min
  });
}

// ─── Cash Sessions ──────────────────────────────────────────
export function useCashSessionsQuery() {
  return useQuery({
    queryKey: queryKeys.cashSessions,
    queryFn: () => storageService.getCaixaSessions(),
  });
}

// ─── Users ──────────────────────────────────────────────────
export function useUsersQuery() {
  return useQuery({
    queryKey: queryKeys.users,
    queryFn: () => storageService.getUsers(),
  });
}

// ─── Tables ─────────────────────────────────────────────────
export function useTablesQuery() {
  return useQuery({
    queryKey: queryKeys.tables,
    queryFn: () => storageService.getTables(),
  });
}

// ─── Cache Invalidation Helpers ─────────────────────────────
export function invalidateProducts() {
  queryClient.invalidateQueries({ queryKey: queryKeys.products });
}

export function invalidateCustomers() {
  queryClient.invalidateQueries({ queryKey: queryKeys.customers });
}

export function invalidateSales() {
  queryClient.invalidateQueries({ queryKey: queryKeys.sales });
}

export function invalidateAll() {
  queryClient.invalidateQueries();
}
