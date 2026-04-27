export interface FavoritesContextValue {
  favorites: string[];
  toggleFavorite: (id: string) => void;
  isFavorited: (id: string) => boolean;
  favoritesCount: number;
  isLoading: boolean;
  clearAllFavorites: () => void;
}
