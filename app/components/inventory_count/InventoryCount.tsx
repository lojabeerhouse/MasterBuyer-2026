import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  PackageSearch, Search, X, RotateCcw, Download, Save,
  SlidersHorizontal, CheckCircle2, ClipboardList, ChevronDown,
} from 'lucide-react';
import { MasterProduct, InventoryCountMap, InventoryCountSettings, InventoryCountSortOption } from '../../types';
import { InventoryCountItem } from './InventoryCountItem';
import { generateInventoryCSV, downloadInventoryCSV } from '../../services/inventory_count/inventoryExportService';

// ─── Constants ────────────────────────────────────────────────────────────────

const LS_DRAFT_PREFIX = 'mb_inventory_draft_';
const PAGE_SIZE = 100;

const DEFAULT_SETTINGS: InventoryCountSettings = {
  sortBy: 'alpha',
  showSystemStock: true,
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface InventoryCountProps {
  masterProducts: MasterProduct[];
  userId: string;
  /** Contagem confirmada carregada do Firebase */
  confirmedCount: InventoryCountMap;
  /** Callback para salvar a contagem no Firebase */
  onSaveCount: (counts: InventoryCountMap) => void;
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
}) => {
  // ── Local draft state (backed by localStorage) ──────────────────────────────
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
  const [settings, setSettings] = useState<InventoryCountSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [showExportPanel, setShowExportPanel] = useState(false);
  const [depotName, setDepotName] = useState('Loja 02 - Rua Águias 2100');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const sortDropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listTopRef = useRef<HTMLDivElement>(null);

  // ── Persist draft to localStorage on every change ──────────────────────────
  useEffect(() => {
    localStorage.setItem(`${LS_DRAFT_PREFIX}${userId}`, JSON.stringify(counts));
  }, [counts, userId]);

  // ── Close dropdown on outside click ────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(e.target as Node)) {
        setShowSortDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Counts handlers ──────────────────────────────────────────────────────────
  const handleIncrement = useCallback((id: string) => {
    setCounts(prev => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
  }, []);

  const handleDecrement = useCallback((id: string) => {
    setCounts(prev => {
      const current = prev[id];
      if (current === undefined || current <= 0) return prev;
      const next = current - 1;
      if (next === 0) {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      }
      return { ...prev, [id]: next };
    });
  }, []);

  const handleManualChange = useCallback((id: string, value: string) => {
    if (value === '') {
      setCounts(prev => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
      return;
    }
    const num = parseInt(value, 10);
    if (!isNaN(num) && num >= 0) {
      setCounts(prev => ({ ...prev, [id]: num }));
    }
  }, []);

  const handleResetCounts = useCallback(() => {
    setCounts({});
    localStorage.removeItem(`${LS_DRAFT_PREFIX}${userId}`);
  }, [userId]);

  // ── Search + Sort handlers (reset page inline — no useEffect flush) ────────
  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
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

  // ── Firebase save ─────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setSaveStatus('saving');
    onSaveCount(counts);
    // Simulated async feedback (real delay comes from Firebase via parent)
    await new Promise(r => setTimeout(r, 600));
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2500);
  }, [counts, onSaveCount]);

  // ── Export ────────────────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    const csv = generateInventoryCSV(masterProducts, counts, depotName);
    const dateStr = new Date().toISOString().split('T')[0];
    downloadInventoryCSV(csv, `inventario_${dateStr}.csv`);
    setShowExportPanel(false);
  }, [masterProducts, counts, depotName]);

  // ── Filtered + sorted products ────────────────────────────────────────────
  const processedProducts = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    let result = term
      ? masterProducts.filter(p =>
          p.name.toLowerCase().includes(term) ||
          p.sku.toLowerCase().includes(term) ||
          (p.category ?? '').toLowerCase().includes(term) ||
          (p.ean ?? '').includes(term),
        )
      : masterProducts;

    return [...result].sort((a, b) => {
      switch (settings.sortBy) {
        case 'alpha':     return a.name.localeCompare(b.name, 'pt-BR');
        case 'category':  return (a.category ?? '').localeCompare(b.category ?? '', 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR');
        case 'stockHigh': return (b.stock ?? 0) - (a.stock ?? 0);
        case 'stockLow':  return (a.stock ?? 0) - (b.stock ?? 0);
        default:          return 0;
      }
    });
  }, [masterProducts, searchTerm, settings.sortBy]);

  // ── Pagination slice ──────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(processedProducts.length / PAGE_SIZE));
  const paginatedProducts = useMemo(
    () => processedProducts.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE),
    [processedProducts, currentPage],
  );

  const goToPage = useCallback((page: number) => {
    setCurrentPage(page);
    // Scroll the list container back to top
    listTopRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, []);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const countedSkus = Object.keys(counts).length;
  const totalProducts = masterProducts.length;
  const progressPct = totalProducts > 0 ? Math.min(100, (countedSkus / totalProducts) * 100) : 0;

  // ── Empty state ───────────────────────────────────────────────────────────
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

  return (
    <div className="flex flex-col h-full overflow-hidden gap-0">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="shrink-0 space-y-3 pb-3">

        {/* Title row */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0">
            <PackageSearch size={20} className="text-amber-500 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-white font-bold text-base leading-tight truncate">Contagem de Estoque</h2>
              <p className="text-slate-500 text-[11px] leading-none mt-0.5">
                {countedSkus} de {totalProducts} itens contados
              </p>
            </div>
          </div>

          {/* Action buttons */}
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
              onClick={() => setShowExportPanel(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all"
            >
              <Download size={13} />
              Exportar
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

        {/* Export panel (inline, no modal) */}
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

        {/* Search + settings row */}
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
            {searchTerm && (
              <button
                onClick={() => handleSearchChange('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
              >
                <X size={13} />
              </button>
            )}
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
                    className={`w-full text-left px-4 py-2.5 text-xs font-medium transition-colors ${
                      settings.sortBy === opt
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
      </div>

      {/* ── Product list ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar -mx-1 px-1">
        {/* Anchor for scroll-to-top on page change */}
        <div ref={listTopRef} />

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
              />
            ))}
          </div>
        )}

        {/* ── Pagination bar ─────────────────────────────────────────────── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between gap-3 py-3 mt-1 border-t border-slate-800 sticky bottom-0 bg-slate-950/95 backdrop-blur-sm">
            <button
              type="button"
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              ← Anterior
            </button>

            <div className="flex items-center gap-1.5 flex-wrap justify-center">
              {Array.from({ length: totalPages }, (_, i) => {
                // Show first, last, current ±1 and ellipsis
                const show = i === 0 || i === totalPages - 1 || Math.abs(i - currentPage) <= 1;
                const showEllipsisBefore = i === currentPage - 2 && currentPage > 2;
                const showEllipsisAfter  = i === currentPage + 2 && currentPage < totalPages - 3;
                if (!show) return null;
                return (
                  <React.Fragment key={i}>
                    {showEllipsisBefore && <span className="text-slate-600 text-xs px-0.5">…</span>}
                    <button
                      type="button"
                      onClick={() => goToPage(i)}
                      className={`w-7 h-7 rounded-lg text-xs font-bold transition-all ${
                        i === currentPage
                          ? 'bg-amber-600 text-white'
                          : 'text-slate-500 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      {i + 1}
                    </button>
                    {showEllipsisAfter && <span className="text-slate-600 text-xs px-0.5">…</span>}
                  </React.Fragment>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages - 1}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              Próxima →
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default InventoryCount;
