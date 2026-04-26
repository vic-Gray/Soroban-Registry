'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';
import { ThemeProvider } from '@/providers/ThemeProvider';
import ToastProvider from '@/providers/ToastProvider';
import RealtimeProvider from '@/providers/RealtimeProvider';
import FavoritesProvider from '@/providers/FavoritesProvider';
import ErrorBoundary from './ErrorBoundary';
import { CookiesProvider } from 'react-cookie';

export default function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <ErrorBoundary>
      <CookiesProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <RealtimeProvider>
              <ToastProvider>
                {children}
              </ToastProvider>
            </RealtimeProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </CookiesProvider>
    </ErrorBoundary>
  );
}
