'use client';

import { useContext } from 'react';
import { FavoritesContext, FavoritesContextValue } from '@/providers/FavoritesProvider';

export function useFavorites(): FavoritesContextValue {
  const context = useContext(FavoritesContext);

  if (!context) {
    // During SSR prerendering there is no FavoritesProvider in scope.
    // Return a no-op fallback — all real call-sites are 'use client'
    // components so this path is never hit at runtime.
    return {
      favorites: [],
      toggleFavorite: () => {},
      isFavorited: () => false,
      favoritesCount: 0,
      isLoading: false,
      clearAllFavorites: () => {},
    };
  }

  return context;
}
