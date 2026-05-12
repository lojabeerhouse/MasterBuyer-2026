import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RightSidebarState {
  content: ReactNode | null;
  isOpen: boolean;
}

interface RightSidebarContextValue extends RightSidebarState {
  setSidebarContent: (content: ReactNode) => void;
  clearSidebar: () => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const RightSidebarContext = createContext<RightSidebarContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export const RightSidebarProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<RightSidebarState>({
    content: null,
    isOpen: false,
  });

  const setSidebarContent = useCallback((content: ReactNode) => {
    setState({ content, isOpen: true });
  }, []);

  const clearSidebar = useCallback(() => {
    setState({ content: null, isOpen: false });
  }, []);

  return (
    <RightSidebarContext.Provider value={{ ...state, setSidebarContent, clearSidebar }}>
      {children}
    </RightSidebarContext.Provider>
  );
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const useSidebar = (): RightSidebarContextValue => {
  const ctx = useContext(RightSidebarContext);
  if (!ctx) throw new Error('useSidebar deve ser usado dentro de <RightSidebarProvider>');
  return ctx;
};
