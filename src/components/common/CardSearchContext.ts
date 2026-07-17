import React from 'react';

export const CardSearchContext = React.createContext<{
  searchQuery: string;
  setSearchQuery: (q: string) => void;
} | null>(null);
