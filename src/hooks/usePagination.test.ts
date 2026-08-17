/**
 * Tests for usePagination hook
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePagination } from '../hooks/usePagination';

describe('usePagination', () => {
  const items = Array.from({ length: 120 }, (_, i) => ({ id: i, name: `Item ${i}` }));

  it('returns first page by default', () => {
    const { result } = renderHook(() => usePagination({ data: items, itemsPerPage: 50 }));

    expect(result.current.currentPage).toBe(1);
    expect(result.current.totalPages).toBe(3);
    expect(result.current.paginatedData).toHaveLength(50);
    expect(result.current.totalItems).toBe(120);
    expect(result.current.hasNext).toBe(true);
    expect(result.current.hasPrev).toBe(false);
  });

  it('navigates to next page', () => {
    const { result } = renderHook(() => usePagination({ data: items, itemsPerPage: 50 }));

    act(() => result.current.nextPage());

    expect(result.current.currentPage).toBe(2);
    expect(result.current.paginatedData).toHaveLength(50);
    expect(result.current.paginatedData[0].id).toBe(50);
  });

  it('navigates to previous page', () => {
    const { result } = renderHook(() => usePagination({ data: items, itemsPerPage: 50 }));

    act(() => result.current.nextPage());
    act(() => result.current.prevPage());

    expect(result.current.currentPage).toBe(1);
  });

  it('goes to specific page', () => {
    const { result } = renderHook(() => usePagination({ data: items, itemsPerPage: 50 }));

    act(() => result.current.goToPage(3));

    expect(result.current.currentPage).toBe(3);
    expect(result.current.paginatedData).toHaveLength(20); // 120 % 50 = 20
    expect(result.current.hasNext).toBe(false);
  });

  it('clamps page to valid range', () => {
    const { result } = renderHook(() => usePagination({ data: items, itemsPerPage: 50 }));

    act(() => result.current.goToPage(100));
    expect(result.current.currentPage).toBe(3); // max page

    act(() => result.current.goToPage(-5));
    expect(result.current.currentPage).toBe(1); // min page
  });

  it('handles empty data', () => {
    const { result } = renderHook(() => usePagination({ data: [], itemsPerPage: 50 }));

    expect(result.current.paginatedData).toHaveLength(0);
    expect(result.current.totalPages).toBe(1);
    expect(result.current.totalItems).toBe(0);
    expect(result.current.hasNext).toBe(false);
    expect(result.current.hasPrev).toBe(false);
  });

  it('handles single page', () => {
    const { result } = renderHook(() => usePagination({ data: items.slice(0, 10), itemsPerPage: 50 }));

    expect(result.current.totalPages).toBe(1);
    expect(result.current.hasNext).toBe(false);
    expect(result.current.hasPrev).toBe(false);
  });
});
