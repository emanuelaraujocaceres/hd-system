/**
 * QueryProvider — wraps the app with React Query context
 *
 * Provides:
 * - Automatic caching with stale-while-revalidate
 * - Background refetching
 * - Optimistic updates
 * - Error retries
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cache data for 5 minutes before considering it stale
      staleTime: 5 * 60 * 1000,
      // Keep data in cache for 10 minutes after component unmounts
      gcTime: 10 * 60 * 1000,
      // Retry failed queries 2 times
      retry: 2,
      // Don't refetch on window focus in dev
      refetchOnWindowFocus: import.meta.env.PROD,
      // Don't refetch on reconnect for offline-first
      refetchOnReconnect: false,
    },
    mutations: {
      // Don't retry mutations
      retry: false,
    },
  },
});

interface QueryProviderProps {
  children: ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

// Export for manual cache invalidation
export { queryClient };
