import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  PackageSearch, Search, X, RotateCcw, Download, Save,
  SlidersHorizontal, CheckCircle2, ClipboardList, ChevronDown,
  ChevronRight, Filter, Check,
} from 'lucide-react';
import { MasterProduct, InventoryCountMap, InventoryCountSettings, InventoryCountSortOption, CategoryTree, InventoryCountTimestamps } from '../../types';
import { InventoryCountItem } from './InventoryCountItem';
import { generateInventoryCSV, downloadInventoryCSV } from '../../services/inventory_count/inventoryExportService';
import { useCheckboxSelection } from '../shared/useCheckboxSelection';
import { getDescendantIds, getChildren } from '../../services/category_manager/categoryService';

// ─── Constants ────────────────────────────────────────────────────────────────

const LS_DRAFT_PREFIX = 'mb_inventory_draft_';
const PAGE_SIZE = 100;

const DEFAULT_SETTINGS: InventoryCountSettings = {
  sortBy: 'alpha',
  showSystemStock: true,
};

const localDateStr = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ─── Props ────────────────────────────────────────────────────────────────────

interface InventoryCountProps {
  masterProducts: MasterProduct[];
  userId: string;
  confirmedCount: InventoryCountMap;
  onSaveCount: (counts: InventoryCountMap) => void;
  categoryTree?: CategoryTree;
  countTimestamps: InventoryCountTimestamps;
  onSaveTimestamps: (ts: InventoryCountTimestamps) => void;
  onUpdateStock?: (updates: Record<string, number>) => void;
}

// ─── Sort labels ─────────────────────────────────────────────────────────────

const SORT_LABELS: Record<InventoryCountSortOption, string> = {
  alpha: 'A–Z',
  category: 'Categoria',
  stockHigh: 'Maior Estoque',
  stockLow: 'Menor Estoque',
};

// ─── Main component ───────────────────────────────────────────────────────────

const InventoryCount: React.FC<InventoryCountProps> = ({
  masterProducts,
  userId,
  confirmedCount,
  onSaveCount,
  categoryTree,
  countTimestamps,
  onSaveTimestamps,
  onUpdateStock,
}) => {
  // ── Local draft state ────────────────────────────────────────────────────────
  const [counts, setCounts] = useState<InventoryCountMap>(() => {
    try {
      const raw = localStorage.getItem(`${LS_DRAFT_PREFIX}${userId}`);
      return raw ? JSON.parse(raw) : confirmedCount;
    } catch {
      return confirmedCount;
    }
  });

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [settings, setSettings] = useState<InventoryCountSettings>(DEFAULT_SETTINGS);
  const [showExportPanel, setShowExportPanel] = useState(false);
  const [depotName, setDepotName] = useState('Loja 02 - Rua Águias 2100');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [goToPageInput, setGoToPageInput] = useState('');
  const sortDropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listTopRef = useRef<HTMLDivElement>(null);

  // ── Category filter ───────────────────────────────────────────────────────────
  const {
    selectedIds: selectedCategoryIds,
    setSelectedIds: setSelectedCategoryIds,
    clearSelection: clearCategorySelection,
  } = useCheckboxSelection<{ id: string }>();
  const [selectionOrder, setSelectionOrder] = useState<string[]>([]);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [catDropdownOpen, setCatDropdownOpen] = useState(false);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const catDropdownRef = useRef<HTMLDivElement>(null);

  // ── Timestamp filter state ────────────────────────────────────────────────────
  const [touchedIds, setTouchedIds] = useState<Set<string>>(new Set());
  const [hideCountedDate, setHideCountedDate] = useState<string>(
    () => localDateStr(new Date()),
  );
  const [filterHideCounted, setFilterHideCounted] = useState<boolean>(true);

  // ── Persist draft ────────────────────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem(`${LS_DRAFT_PREFIX}${userId}`, JSON.stringify(counts));
  }, [counts, userId]);

  // ── Debounce search (0,4s) ─────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 400);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Reset página quando a busca efetiva muda
  useEffect(() => {
    setCurrentPage(0);
  }, [debouncedSearch]);

  // ── Close dropdowns on outside click ─────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(e.target as Node)) {
        setShowSortDropdown(false);
      }
      if (catDropdownRef.current && !catDropdownRef.current.contains(e.target as Node)) {
        setCatDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Counts handlers ───────────────────────────────────────────────────────────
  const handleIncrement = useCallback((id: string) => {
    setCounts(prev => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
    setTouchedIds(prev => new Set([...prev, id]));
  }, []);

  const handleDecrement = useCallback((id: string) => {
    setCounts(prev => {
      const current = prev[id];
      if (current === undefined) return prev;      // null: não faz nada
      if (current === 0) {
        const copy = { ...prev };
        delete copy[id];
        return copy;                               // 0 → volta a null
      }
      return { ...prev, [id]: current - 1 };      // n → n-1 (inclusive 1→0)
    });
    setTouchedIds(prev => new Set([...prev, id]));
  }, []);

  const handleManualChange = useCallback((id: string, value: string) => {
    if (value === '') {
      setCounts(prev => { const copy = { ...prev }; delete copy[id]; return copy; });
      setTouchedIds(prev => new Set([...prev, id]));
      return;
    }
    const num = parseInt(value, 10);
    if (!isNaN(num) && num >= 0) {
      setCounts(prev => ({ ...prev, [id]: num }));
      setTouchedIds(prev => new Set([...prev, id]));
    }
  }, []);

  const handleResetCounts = useCallback(() => {
    setCounts({});
    localStorage.removeItem(`${LS_DRAFT_PREFIX}${userId}`);
  }, [userId]);

  // ── Search + Sort ────────────────────────────────────────────────────────────
  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
    if (!value) setDebouncedSearch(''); // limpa imediatamente ao apagar
    setCurrentPage(0);
  }, []);

  const handleSortChange = useCallback((sortBy: InventoryCountSortOption) => {
    setSettings(s => ({ ...s, sortBy }));
    setCurrentPage(0);
    setShowSortDropdown(false);
  }, []);

  const handleToggleSystemStock = useCallback(() => {
    setSettings(s => ({ ...s, showSystemStock: !s.showSystemStock }));
  }, []);

  // ── Firebase save ─────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setSaveStatus('saving');

    const now = new Date().toISOString();
    const newTimestamps: InventoryCountTimestamps = {};
    touchedIds.forEach(id => { if (counts[id] !== undefined) newTimestamps[id] = now; });
    const savedCount = Object.keys(newTimestamps).length;
    if (savedCount > 0) onSaveTimestamps(newTimestamps);

    if (Object.keys(counts).length > 0) {
      onUpdateStock?.(counts);
      setCounts({});
      localStorage.removeItem(`${LS_DRAFT_PREFIX}${userId}`);
    }

    console.log(`Contagem de Estoque salva com sucesso - ${savedCount} produto(s) atualizados`);
    setTouchedIds(new Set());

    await new Promise(r => setTimeout(r, 600));
    setSaveStatus('saved');
  }, [counts, onSaveTimestamps, onUpdateStock, touchedIds, userId]);

  // Reseta botão para idle apenas quando o usuário adiciona nova contagem (ignora clear pós-save)
  useEffect(() => {
    if (Object.keys(counts).length > 0) setSaveStatus('idle');
  }, [counts]);

  // ── Export ────────────────────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    const csv = generateInventoryCSV(masterProducts, counts, depotName);
    const dateStr = localDateStr(new Date());
    downloadInventoryCSV(csv, `inventario_${dateStr}.csv`);
    setShowExportPanel(false);
  }, [masterProducts, counts, depotName]);

  // ── Category filter logic ─────────────────────────────────────────────────────
  const rootCategories = useMemo(() => {
    if (!categoryTree) return [];
    return getChildren(categoryTree, null);
  }, [categoryTree]);

  const toggleCategoryNode = useCallback((nodeId: string) => {
    if (!categoryTree) return;
    const descendants = getDescendantIds(categoryTree, nodeId);
    const isSelected = selectedCategoryIds.has(nodeId);

    setSelectedCategoryIds(prev => {
      const next = new Set(prev);
      if (isSelected) {
        descendants.forEach(id => next.delete(id));
      } else {
        descendants.forEach(id => next.add(id));
      }
      return next;
    });

    setSelectionOrder(prev => {
      if (isSelected) return prev.filter(id => id !== nodeId);
      return [...prev.filter(id => id !== nodeId), nodeId];
    });
  }, [categoryTree, selectedCategoryIds, setSelectedCategoryIds]);

  const handleClearCategoryFilter = useCallback(() => {
    clearCategorySelection();
    setSelectionOrder([]);
  }, [clearCategorySelection]);

  const handleSelectAllCategories = useCallback(() => {
    if (!categoryTree) return;
    setSelectedCategoryIds(new Set(Object.keys(categoryTree)));
    setSelectionOrder(getChildren(categoryTree, null));
  }, [categoryTree, setSelectedCategoryIds]);

  const getCategoryCheckState = (nodeId: string): 'checked' | 'indeterminate' | 'unchecked' => {
    if (!categoryTree) return 'unchecked';
    if (selectedCategoryIds.has(nodeId)) return 'checked';
    const descendants = getDescendantIds(categoryTree, nodeId);
    if (descendants.some(id => selectedCategoryIds.has(id))) return 'indeterminate';
    return 'unchecked';
  };

  // ── Processed products (search + sort) ───────────────────────────────────────
  const processedProducts = useMemo(() => {
    if (!debouncedSearch.trim()) return masterProducts;

    const tokens = debouncedSearch.toLowerCase().trim().split(/\s+/).filter(t => t);
    const result = masterProducts.filter(p => {
      const name = p.name.toLowerCase();
      const sku = (p.sku || '').toLowerCase();
      const cat = (p.category || '').toLowerCase();
      const ean = (p.ean || '').toLowerCase();

      return tokens.every(t =>
        name.includes(t) ||
        sku.includes(t) ||
        cat.includes(t) ||
        ean.includes(t)
      );
    });

    return [...result].sort((a, b) => {
      switch (settings.sortBy) {
        case 'alpha': return a.name.localeCompare(b.name, 'pt-BR');
        case 'category': return (a.category ?? '').localeCompare(b.category ?? '', 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR');
        case 'stockHigh': return (b.stock ?? 0) - (a.stock ?? 0);
        case 'stockLow': return (a.stock ?? 0) - (b.stock ?? 0);
        default: return 0;
      }
    });
  }, [masterProducts, debouncedSearch, settings.sortBy]);

  // ── Category-filtered products ────────────────────────────────────────────────
  const filteredByCategory = useMemo(() => {
    if (!categoryTree || selectedCategoryIds.size === 0) return processedProducts;
    return processedProducts.filter(p => {
      if (p.categoryId) return selectedCategoryIds.has(p.categoryId);
      return [...selectedCategoryIds].some(id => {
        const node = categoryTree[id];
        return node && (p.category ?? '').toLowerCase().includes(node.nome.toLowerCase());
      });
    });
  }, [processedProducts, selectedCategoryIds, categoryTree]);

  // ── Timestamp filter (ocultar contados em [data]) ────────────────────────────
  const filteredProducts = useMemo(() => {
    if (!filterHideCounted) return filteredByCategory;
    return filteredByCategory.filter(p => {
      const ts = countTimestamps[p.id];
      if (!ts) return true;
      return localDateStr(new Date(ts)) !== hideCountedDate;
    });
  }, [filteredByCategory, filterHideCounted, hideCountedDate, countTimestamps]);

  // ── Grouped products (collapsible, most-recent-first) ────────────────────────
  const groupedProducts = useMemo(() => {
    if (!categoryTree || selectedCategoryIds.size === 0) return null;
    const orderedGroups = [...selectionOrder].reverse();
    const assigned = new Set<string>();

    return orderedGroups.map(groupId => {
      const node = categoryTree[groupId];
      const groupName = node?.nome ?? groupId;
      const groupDescendants = new Set(getDescendantIds(categoryTree, groupId));

      const items = filteredProducts.filter(p => {
        if (assigned.has(p.id)) return false;
        const matches = p.categoryId
          ? groupDescendants.has(p.categoryId)
          : (p.category ?? '').toLowerCase().includes((node?.nome ?? '').toLowerCase());
        if (matches) { assigned.add(p.id); return true; }
        return false;
      });
      return { groupId, groupName, items };
    }).filter(g => g.items.length > 0);
  }, [selectionOrder, filteredProducts, categoryTree, selectedCategoryIds]);

  // ── Pagination (only when no category grouping active) ───────────────────────
  const paginationProducts = groupedProducts ? [] : filteredProducts;
  const totalPages = Math.max(1, Math.ceil(paginationProducts.length / PAGE_SIZE));
  const paginatedProducts = useMemo(
    () => paginationProducts.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE),
    [paginationProducts, currentPage],
  );

  const goToPage = useCallback((page: number) => {
    setCurrentPage(page);
    listTopRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, []);

  // ── Stats (relativos aos produtos visíveis) ───────────────────────────────────
  const countedSkus = filteredProducts.filter(p => counts[p.id] !== undefined).length;
  const totalProducts = filteredProducts.length;
  const progressPct = totalProducts > 0 ? Math.min(100, (countedSkus / totalProducts) * 100) : 0;

  // ── Category checkbox visual ───────────────────────────────────────────────────
  const renderCategoryCheckbox = (nodeId: string) => {
    const state = getCategoryCheckState(nodeId);
    return (
      <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${state === 'checked'
        ? 'bg-amber-600 border-amber-600'
        : state === 'indeterminate'
          ? 'bg-amber-600/20 border-amber-600/50'
          : 'border-slate-600 group-hover:border-amber-500/60'
        }`}>
        {state === 'checked' && <Check className="w-2.5 h-2.5 text-white stroke-[3]" />}
        {state === 'indeterminate' && <div className="w-2 h-0.5 bg-amber-500 rounded-full" />}
      </div>
    );
  };

  // ── Recursive category tree renderer ───────────────────────────────────────────
  const renderCategoryNode = (nodeId: string, depth: number = 0): React.ReactNode => {
    if (!categoryTree) return null;
    const node = categoryTree[nodeId];
    if (!node) return null;
    const children = getChildren(categoryTree, nodeId);
    const hasChildren = children.length > 0;
    const isExpanded = expandedParents.has(nodeId);

    return (
      <div key={nodeId}>
        <div
          className="flex items-center gap-1.5 py-2 hover:bg-slate-800/50 cursor-pointer group transition-colors"
          style={{ paddingLeft: `${10 + depth * 14}px`, paddingRight: '10px' }}
        >
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              if (!hasChildren) return;
              setExpandedParents(prev => {
                const next = new Set(prev);
                next.has(nodeId) ? next.delete(nodeId) : next.add(nodeId);
                return next;
              });
            }}
            className={`shrink-0 w-4 h-4 flex items-center justify-center transition-colors ${hasChildren ? 'text-slate-500 hover:text-slate-300' : 'invisible'}`}
          >
            <ChevronRight className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
          </button>

          <div
            onClick={() => toggleCategoryNode(nodeId)}
            className="flex items-center gap-2 flex-1 min-w-0"
          >
            {renderCategoryCheckbox(nodeId)}
            <span className="text-xs text-slate-300 truncate group-hover:text-white transition-colors leading-tight">
              {node.nome}
            </span>
          </div>
        </div>

        {hasChildren && isExpanded && children.map(childId => renderCategoryNode(childId, depth + 1))}
      </div>
    );
  };

  // ── Empty: no master products ─────────────────────────────────────────────────
  if (masterProducts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-20 gap-4">
        <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center">
          <PackageSearch size={28} className="text-slate-600" />
        </div>
        <div>
          <p className="text-slate-300 font-semibold">Nenhum produto no banco de dados</p>
          <p className="text-slate-500 text-sm mt-1">
            Importe sua planilha de produtos em <span className="text-amber-500">Produtos</span> primeiro.
          </p>
        </div>
      </div>
    );
  }

  const showChooseCategoryState = !!categoryTree && selectedCategoryIds.size === 0 && !searchTerm;

  return (
    <div className="flex flex-col h-full overflow-hidden gap-0">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="shrink-0 space-y-3 pb-3">

        {/* Title row: [title] [category filter] [actions] */}
        <div className="flex items-center gap-3 flex-wrap">

          {/* Left: Title + stats */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <PackageSearch size={20} className="text-amber-500 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-white font-bold text-base leading-tight truncate">Contagem de Estoque</h2>
              <p className="text-slate-500 text-[11px] leading-none mt-0.5">
                {countedSkus} de {totalProducts} itens contados
              </p>
            </div>
          </div>

          {/* Center: Category filter dropdown */}
          {categoryTree && (
            <div className="relative shrink-0" ref={catDropdownRef}>
              <button
                type="button"
                onClick={() => setCatDropdownOpen(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${selectedCategoryIds.size > 0
                  ? 'bg-amber-600/10 border-amber-600/40 text-amber-400 hover:bg-amber-600/20'
                  : 'text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border-slate-700'
                  }`}
              >
                <Filter size={13} />
                {selectionOrder.length > 0
                  ? <span>{selectionOrder.length} {selectionOrder.length === 1 ? 'categoria' : 'categorias'}</span>
                  : <span>Filtrar por Categoria</span>
                }
                <ChevronDown size={11} className={`transition-transform ${catDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {selectedCategoryIds.size > 0 && (
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); handleClearCategoryFilter(); }}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-slate-700 hover:bg-red-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors z-10"
                  title="Remover filtro"
                >
                  <X size={8} />
                </button>
              )}

              {catDropdownOpen && (
                <div className="absolute top-full right-0 sm:right-auto sm:left-1/2 sm:-translate-x-1/2 mt-1.5 z-50 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden w-72 max-w-[calc(100vw-1rem)] max-h-80 flex flex-col">
                  <div className="px-3 py-2 border-b border-slate-800 shrink-0 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider shrink-0">Categorias</span>
                    <div className="flex items-center gap-2 ml-auto">
                      <button
                        type="button"
                        onClick={handleSelectAllCategories}
                        className="text-[10px] text-slate-500 hover:text-amber-400 transition-colors font-medium"
                      >
                        Todas
                      </button>
                      {selectedCategoryIds.size > 0 && (
                        <button
                          type="button"
                          onClick={handleClearCategoryFilter}
                          className="text-[10px] text-slate-500 hover:text-red-400 transition-colors font-medium"
                        >
                          Limpar
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar py-1">
                    {rootCategories.map(id => renderCategoryNode(id, 0))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Right: Action buttons */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {countedSkus > 0 && (
              <button
                type="button"
                onClick={handleResetCounts}
                title="Zerar contagem"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-red-400 hover:bg-red-900/20 border border-slate-700 hover:border-red-700/40 transition-all"
              >
                <RotateCcw size={13} />
                Zerar
              </button>
            )}

            <button
              type="button"
              onClick={() => { setShowExportPanel(v => !v); if (!showExportPanel) setShowFilters(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all"
            >
              <Download size={13} />
              Exportar
            </button>

            <button
              type="button"
              onClick={() => setShowFilters(v => !v)}
              className={`lg:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${showFilters
                ? 'text-amber-400 bg-amber-600/10 border-amber-600/40'
                : 'text-slate-300 bg-slate-800 hover:bg-slate-700 border-slate-700'
                }`}
            >
              <SlidersHorizontal size={13} />
              {showFilters ? 'Ocultar' : 'Filtros'}
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saveStatus === 'saving' || countedSkus === 0}
              className={`
                flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all
                ${saveStatus === 'saved'
                  ? 'bg-emerald-600/20 border-emerald-600/40 text-emerald-400'
                  : 'bg-amber-600 hover:bg-amber-500 border-amber-500 text-white disabled:opacity-40 disabled:cursor-not-allowed'
                }
              `}
            >
              {saveStatus === 'saved' ? (
                <><CheckCircle2 size={13} /> Salvo!</>
              ) : saveStatus === 'saving' ? (
                <><span className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Salvando...</>
              ) : (
                <><Save size={13} /> Salvar Contagem</>
              )}
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 rounded-full transition-all duration-700 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-[10px] font-bold text-slate-500 tabular-nums whitespace-nowrap uppercase tracking-wide">
            {progressPct.toFixed(0)}%
          </span>
        </div>

        {/* Collapsible filters (hidden on mobile when collapsed, always visible on lg+) */}
        <div className={`space-y-3 ${showFilters ? 'block' : 'hidden'} lg:block`}>

          {/* Export panel */}
          {showExportPanel && (
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ClipboardList size={14} className="text-amber-500" />
                  <span className="text-sm font-semibold text-slate-200">Exportar Contagem</span>
                </div>
                <button
                  onClick={() => setShowExportPanel(false)}
                  className="p-1 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-all"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-800/50 px-3 py-2 rounded-lg border border-slate-700">
                <span>{countedSkus} itens contados</span>
                <span className="text-slate-600">·</span>
                <span>{totalProducts - countedSkus} sem contagem (não exportados)</span>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-400">Nome do Depósito</label>
                <input
                  type="text"
                  value={depotName}
                  onChange={e => setDepotName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-600/50 focus:ring-1 focus:ring-amber-600/20 transition-all"
                  placeholder="Ex: Loja Central"
                />
                <p className="text-[10px] text-slate-600">Preenchido na coluna Depósito do CSV exportado.</p>
              </div>
              <button
                onClick={handleExport}
                disabled={countedSkus === 0}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-amber-600 hover:bg-amber-500 text-white text-sm font-bold rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Download size={15} />
                Baixar CSV
              </button>
            </div>
          )}

          {/* Search + Sort row */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              <input
                ref={searchRef}
                type="text"
                value={searchTerm}
                onChange={e => handleSearchChange(e.target.value)}
                placeholder="Buscar por nome, SKU, EAN ou categoria..."
                className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-8 pr-8 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-amber-600/50 focus:ring-1 focus:ring-amber-600/20 transition-all"
              />
              {searchTerm && searchTerm !== debouncedSearch ? (
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-amber-500/40 border-t-amber-500 animate-spin" />
              ) : searchTerm ? (
                <button
                  onClick={() => handleSearchChange('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  <X size={13} />
                </button>
              ) : null}
            </div>

            {/* Sort dropdown */}
            <div className="relative shrink-0" ref={sortDropdownRef}>
              <button
                type="button"
                onClick={() => setShowSortDropdown(v => !v)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-700 transition-all"
              >
                <SlidersHorizontal size={13} />
                <span className="hidden sm:inline">{SORT_LABELS[settings.sortBy]}</span>
                <ChevronDown size={11} className={`transition-transform ${showSortDropdown ? 'rotate-180' : ''}`} />
              </button>
              {showSortDropdown && (
                <div className="absolute right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden w-44">
                  {(Object.keys(SORT_LABELS) as InventoryCountSortOption[]).map(opt => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => handleSortChange(opt)}
                      className={`w-full text-left px-4 py-2.5 text-xs font-medium transition-colors ${settings.sortBy === opt
                        ? 'text-amber-400 bg-amber-600/10'
                        : 'text-slate-300 hover:text-white hover:bg-slate-700'
                        }`}
                    >
                      {SORT_LABELS[opt]}
                    </button>
                  ))}
                  <div className="border-t border-slate-700 px-4 py-2.5">
                    <label className="flex items-center justify-between cursor-pointer gap-3">
                      <span className="text-xs text-slate-400">Estoque do sistema</span>
                      <div
                        onClick={handleToggleSystemStock}
                        className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 ${settings.showSystemStock ? 'bg-amber-600' : 'bg-slate-600'}`}
                      >
                        <div className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform duration-200 ${settings.showSystemStock ? 'translate-x-4' : 'translate-x-0'}`} />
                      </div>
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Timestamp filter row */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer group" onClick={() => setFilterHideCounted(v => !v)}>
              <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${filterHideCounted ? 'bg-amber-600 border-amber-600' : 'border-slate-600 group-hover:border-amber-500/60'
                }`}>
                {filterHideCounted && <Check className="w-2.5 h-2.5 text-white stroke-[3]" />}
              </div>
              <span className="text-xs text-slate-400 select-none group-hover:text-slate-300 transition-colors">
                Desconsiderar contados em
              </span>
            </label>
            <input
              type="date"
              value={hideCountedDate}
              onChange={e => setHideCountedDate(e.target.value)}
              className="text-xs bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-slate-300 focus:border-amber-600/60 focus:outline-none focus:ring-1 focus:ring-amber-600/20 transition-all"
            />
            {filterHideCounted && (() => {
              const hiddenCount = masterProducts.filter(p => {
                const ts = countTimestamps[p.id];
                return ts && localDateStr(new Date(ts)) === hideCountedDate;
              }).length;
              return hiddenCount > 0 ? (
                <span className="text-[10px] text-slate-500">
                  ({hiddenCount} oculto{hiddenCount > 1 ? 's' : ''})
                </span>
              ) : null;
            })()}
          </div>

        </div>

      </div>

      {/* ── Product list ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar -mx-1 px-1">
        <div ref={listTopRef} />

        {/* STATE A: Aguardando seleção de categoria */}
        {showChooseCategoryState && (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-slate-800/60 border border-slate-700 flex items-center justify-center">
              <Filter size={22} className="text-slate-600" />
            </div>
            <div>
              <p className="text-slate-300 font-semibold text-sm">Escolha uma categoria</p>
              <p className="text-slate-600 text-xs mt-1.5 max-w-[200px] leading-relaxed">
                Selecione categorias no filtro acima para listar os produtos
              </p>
            </div>
          </div>
        )}

        {/* STATE B: Grupos colapsáveis (filtro de categoria ativo) */}
        {!showChooseCategoryState && groupedProducts !== null && (
          <div className="space-y-3 pb-2">
            {groupedProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                <Search size={24} className="text-slate-700" />
                <div>
                  <p className="text-slate-400 font-medium text-sm">Nenhum produto encontrado</p>
                  <p className="text-slate-600 text-xs mt-1">Tente outro termo de busca ou selecione outra categoria.</p>
                </div>
              </div>
            ) : (
              groupedProducts.map(({ groupId, groupName, items }) => {
                const isCollapsed = collapsedGroups.has(groupId);
                return (
                  <div key={groupId} className="bg-slate-900/30 border border-slate-800/60 rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setCollapsedGroups(prev => {
                        const next = new Set(prev);
                        next.has(groupId) ? next.delete(groupId) : next.add(groupId);
                        return next;
                      })}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800/40 transition-colors group"
                    >
                      <div className="flex items-center gap-2">
                        <ChevronDown
                          size={14}
                          className={`text-slate-500 group-hover:text-slate-300 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`}
                        />
                        <span className="text-xs font-bold text-slate-300 uppercase tracking-wide group-hover:text-white transition-colors">
                          {groupName}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full font-bold border border-slate-700">
                        {items.length}
                      </span>
                    </button>

                    {!isCollapsed && (
                      <div className="px-2 pb-2 space-y-1.5 border-t border-slate-800/40 pt-1.5">
                        {items.map(product => (
                          <InventoryCountItem
                            key={product.id}
                            product={product}
                            count={counts[product.id]}
                            showSystemStock={settings.showSystemStock}
                            onIncrement={handleIncrement}
                            onDecrement={handleDecrement}
                            onChangeManual={handleManualChange}
                            lastCountedAt={countTimestamps[product.id]}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* STATE C: Lista plana (sem filtro de categoria) */}
        {!showChooseCategoryState && groupedProducts === null && (
          <>
            {processedProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                <Search size={24} className="text-slate-700" />
                <div>
                  <p className="text-slate-400 font-medium text-sm">Nenhum produto encontrado</p>
                  <p className="text-slate-600 text-xs mt-1">Tente outro termo de busca.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5 pb-2">
                {paginatedProducts.map(product => (
                  <InventoryCountItem
                    key={product.id}
                    product={product}
                    count={counts[product.id]}
                    showSystemStock={settings.showSystemStock}
                    onIncrement={handleIncrement}
                    onDecrement={handleDecrement}
                    onChangeManual={handleManualChange}
                    lastCountedAt={countTimestamps[product.id]}
                  />
                ))}
              </div>
            )}

            {/* ── Pagination (Forcato style) ─────────────────────────────── */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between gap-2 py-3 mt-1 border-t border-slate-800 sticky bottom-0 bg-slate-950/95 backdrop-blur-sm">
                <button
                  type="button"
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-amber-400 bg-slate-900 hover:bg-amber-600/10 border border-slate-800 hover:border-amber-600/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  ← Anterior
                </button>

                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 tabular-nums">
                    Página <span className="text-white font-bold">{currentPage + 1}</span> / {totalPages}
                  </span>
                  {totalPages > 5 && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-600">ir para:</span>
                      <input
                        type="number"
                        min="1"
                        max={totalPages}
                        value={goToPageInput}
                        onChange={e => setGoToPageInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            const p = parseInt(goToPageInput, 10);
                            if (!isNaN(p) && p >= 1 && p <= totalPages) {
                              goToPage(p - 1);
                              setGoToPageInput('');
                            }
                          }
                        }}
                        className="w-12 h-6 text-center text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-300 focus:outline-none focus:border-amber-600/50 tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages - 1}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-amber-400 bg-slate-900 hover:bg-amber-600/10 border border-slate-800 hover:border-amber-600/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  Próxima →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default InventoryCount;
