export interface WatchlistItem {
  sym: string;
  tags: string[];
  comment?: string;
}

export interface Watchlist {
  id: string;
  name: string;
  comment?: string;
  items: WatchlistItem[];
}

export interface WatchlistStorage {
  watchlists: Watchlist[];
  activeId: string;
}
