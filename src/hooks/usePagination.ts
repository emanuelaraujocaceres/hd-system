/**
 * usePagination — client-side pagination hook
 *
 * Usage:
 *   const { paginatedData, currentPage, totalPages, goToPage, nextPage, prevPage } =
 *     usePagination({ data: sales, itemsPerPage: 50 });
 */

import { useState, useMemo, useEffect } from 'react';

interface UsePaginationOptions<T> {
  data: T[];
  itemsPerPage?: number;
  initialPage?: number;
}

interface UsePaginationResult<T> {
  paginatedData: T[];
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  goToPage: (page: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  hasNext: boolean;
  hasPrev: boolean;
}

export function usePagination<T>({
  data,
  itemsPerPage = 50,
  initialPage = 1,
}: UsePaginationOptions<T>): UsePaginationResult<T> {
  const [currentPage, setCurrentPage] = useState(initialPage);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(data.length / itemsPerPage)),
    [data.length, itemsPerPage]
  );

  // Clamp currentPage when data shrinks (e.g., filter reduces results)
  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return data.slice(start, start + itemsPerPage);
  }, [data, currentPage, itemsPerPage]);

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  const nextPage = () => goToPage(currentPage + 1);
  const prevPage = () => goToPage(currentPage - 1);

  return {
    paginatedData,
    currentPage,
    totalPages,
    totalItems: data.length,
    itemsPerPage,
    goToPage,
    nextPage,
    prevPage,
    hasNext: currentPage < totalPages,
    hasPrev: currentPage > 1,
  };
}
