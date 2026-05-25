import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RightSidebarState {
  content: ReactNode | null;
  isOpen: boolean;
  isCollapsed: boolean;
  badgeCount: number;
}

interface RightSidebarContextValue extends RightSidebarState {
  setSidebarContent: (content: ReactNode) => void;
  clearSidebar: () => void;
  setCollapsed: (collapsed: boolean) => void;
  setBadgeCount: (count: number) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const RightSidebarContext = createContext<RightSidebarContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export const RightSidebarProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<RightSidebarState>({
    content: null,
    isOpen: false,
    isCollapsed: false,
    badgeCount: 0,
  });

  const setSidebarContent = useCallback((content: ReactNode) => {
    setState(prev => ({ ...prev, content, isOpen: true }));
  }, []);

  const clearSidebar = useCallback(() => {
    setState(prev => ({ ...prev, content: null, isOpen: false, isCollapsed: false, badgeCount: 0 }));
  }, []);

  const setCollapsed = useCallback((collapsed: boolean) => {
    setState(prev => ({ ...prev, isCollapsed: collapsed }));
  }, []);

  const setBadgeCount = useCallback((count: number) => {
    setState(prev => ({ ...prev, badgeCount: count }));
  }, []);

  return (
    <RightSidebarContext.Provider value={{ ...state, setSidebarContent, clearSidebar, setCollapsed, setBadgeCount }}>
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
