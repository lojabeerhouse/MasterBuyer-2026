import { useRef, useState } from 'react';

export function useCheckboxSelection<T extends { id: string }>() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastClickedIdRef = useRef<string | null>(null);

  const handleChange = (itemId: string, shiftKey: boolean, visibleList: T[]) => {
    if (shiftKey && lastClickedIdRef.current !== null) {
      const from = visibleList.findIndex(p => p.id === lastClickedIdRef.current);
      const to = visibleList.findIndex(p => p.id === itemId);
      if (from !== -1 && to !== -1) {
        const [lo, hi] = from < to ? [from, to] : [to, from];
        const rangeIds = visibleList.slice(lo, hi + 1).map(p => p.id);
        setSelectedIds(prev => {
          const next = new Set(prev);
          rangeIds.forEach(id => next.add(id));
          return next;
        });
        lastClickedIdRef.current = itemId;
        return;
      }
    }
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(itemId) ? next.delete(itemId) : next.add(itemId);
      return next;
    });
    lastClickedIdRef.current = itemId;
  };

  const toggleAll = (items: T[], forceSelect?: boolean) => {
    const shouldSelect = forceSelect ?? !items.every(p => selectedIds.has(p.id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      items.forEach(p => shouldSelect ? next.add(p.id) : next.delete(p.id));
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    lastClickedIdRef.current = null;
  };

  const isAllSelected = (items: T[]) =>
    items.length > 0 && items.every(p => selectedIds.has(p.id));

  return { selectedIds, setSelectedIds, handleChange, toggleAll, clearSelection, isAllSelected };
}
