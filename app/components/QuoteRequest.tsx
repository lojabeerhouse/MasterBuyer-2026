import React, { useState, useMemo, useCallback } from 'react';
import { Supplier, SupplierCatalog, SupplierCatalogProduct, QuoteStage } from '../types';
import { getValidPrice } from '../services/supplierCatalogService';
import {
  Search, MessageSquare, Phone, Copy, Check, ChevronDown, ChevronUp,
  Clock, X, SendHorizonal, Zap, Square, CheckSquare, Package,
  RefreshCw, Layers, Tag, Plus, Trash2, BookmarkCheck,
  ArrowUpDown, Users,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type GroupBy = 'supplier' | 'category';
type SortBy = 'expired_desc' | 'name_asc' | 'name_desc' | 'total_desc' | 'recent_desc';
type Priority = 'urgent' | 'normal' | 'history' | 'low';
type SupplierQuoteData = { supplierName: string; supplier: Supplier | undefined; products: EnrichedProduct[] };

interface EnrichedProduct extends SupplierCatalogProduct {
  supplierId: string;
  supplierName: string;
  supplier: Supplier | undefined;
  isExpired: boolean;
  priority: Priority;
  displayPrice: { unitPrice: number; packPrice: number; packQuantity: number; date: number } | null;
}

interface QuoteRequestProps {
  suppliers: Supplier[];
  catalogs: Record<string, SupplierCatalog>;
  globalValidityDays: number;
  quoteStages: QuoteStage[];
  onSaveStages: (stages: QuoteStage[]) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (v: number) => `R$${v.toFixed(2).replace('.', ',')}`;
const fmtDate = (ts: number) =>
  new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
const searchNorm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const computePriority = (p: SupplierCatalogProduct, isExpired: boolean): Priority => {
  if (p.priceHistory.length === 0) return 'low';
  if (isExpired && p.priceHistory.length >= 3) return 'urgent';
  if (isExpired) return 'normal';
  return 'history';
};

const PRIORITY_DOT: Record<Priority, string> = {
  urgent: 'bg-red-500',
  normal: 'bg-amber-400',
  history: 'bg-emerald-500',
  low: 'bg-slate-600',
};

const PRIORITY_LABEL: Record<Priority, string> = {
  urgent: 'Urgente',
  normal: 'Normal',
  history: 'Histórico',
  low: 'Baixa',
};

const STAGE_COLORS = ['amber', 'blue', 'violet', 'emerald', 'rose', 'cyan'];
const STAGE_COLOR_MAP: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  amber:   { bg: 'bg-amber-900/20',   border: 'border-amber-700/40',   text: 'text-amber-400',   dot: 'bg-amber-500'   },
  blue:    { bg: 'bg-blue-900/20',    border: 'border-blue-700/40',    text: 'text-blue-400',    dot: 'bg-blue-500'    },
  violet:  { bg: 'bg-violet-900/20',  border: 'border-violet-700/40',  text: 'text-violet-400',  dot: 'bg-violet-500'  },
  emerald: { bg: 'bg-emerald-900/20', border: 'border-emerald-700/40', text: 'text-emerald-400', dot: 'bg-emerald-500' },
  rose:    { bg: 'bg-rose-900/20',    border: 'border-rose-700/40',    text: 'text-rose-400',    dot: 'bg-rose-500'    },
  cyan:    { bg: 'bg-cyan-900/20',    border: 'border-cyan-700/40',    text: 'text-cyan-400',    dot: 'bg-cyan-500'    },
};

// ─── Component ────────────────────────────────────────────────────────────────

const QuoteRequest: React.FC<QuoteRequestProps> = ({
  suppliers, catalogs, globalValidityDays, quoteStages, onSaveStages,
}) => {
  // ── UI state ────────────────────────────────────────────────────────────────
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [showOnlyExpired, setShowOnlyExpired] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedSubGroups, setExpandedSubGroups] = useState<Set<string>>(new Set());
  const [groupBy, setGroupBy] = useState<GroupBy>('supplier');
  const [considerSupplier, setConsiderSupplier] = useState(true);
  const [sortBy, setSortBy] = useState<SortBy>('expired_desc');
  const [categoryFilter, setCategoryFilter] = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // supplier-selection step (when !considerSupplier)
  const [showSupplierPicker, setShowSupplierPicker] = useState(false);
  const [pickedSuppliers, setPickedSuppliers] = useState<Set<string>>(new Set());

  // stages panel
  const [showStagesPanel, setShowStagesPanel] = useState(false);
  const [stageNameInput, setStageNameInput] = useState('');
  const [savingStage, setSavingStage] = useState(false);

  // ── Enrich all products ──────────────────────────────────────────────────────
  const allProducts = useMemo<EnrichedProduct[]>(() => {
    const result: EnrichedProduct[] = [];
    (Object.entries(catalogs) as [string, SupplierCatalog][]).forEach(([supplierId, catalog]) => {
      const supplier = suppliers.find(s => s.id === supplierId);
      const effectiveDays = catalog.priceValidityDays ?? globalValidityDays;
      catalog.products.forEach(p => {
        const validPrice = getValidPrice(p, catalog.priceValidityMode, effectiveDays);
        const raw = p.priceHistory[0] ?? null;
        const displayPrice = validPrice ?? (raw
          ? { unitPrice: raw.unitPrice, packPrice: raw.packPrice, packQuantity: raw.packQuantity, date: raw.date }
          : null);
        const isExpired = !validPrice && displayPrice !== null;
        result.push({
          ...p,
          supplierId,
          supplierName: catalog.supplierName,
          supplier,
          isExpired,
          priority: computePriority(p, isExpired),
          displayPrice,
        });
      });
    });
    return result;
  }, [catalogs, suppliers, globalValidityDays]);

  const totalExpired = useMemo(() => allProducts.filter(p => p.isExpired).length, [allProducts]);

  // ── All categories ───────────────────────────────────────────────────────────
  const allCategories = useMemo(() => {
    const cats = new Set<string>();
    allProducts.forEach(p => cats.add(p.masterCategory ?? 'Sem categoria'));
    return Array.from(cats).sort((a, b) =>
      a === 'Sem categoria' ? 1 : b === 'Sem categoria' ? -1 : a.localeCompare(b, 'pt-BR'));
  }, [allProducts]);

  // ── Filter products ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = allProducts;
    if (showOnlyExpired) list = list.filter(p => p.isExpired);
    if (categoryFilter.size > 0)
      list = list.filter(p => categoryFilter.has(p.masterCategory ?? 'Sem categoria'));
    if (searchTerm.trim()) {
      const t = searchNorm(searchTerm);
      list = list.filter(p =>
        searchNorm(p.name).includes(t) || searchNorm(p.supplierSku ?? '').includes(t));
    }
    return list;
  }, [allProducts, showOnlyExpired, categoryFilter, searchTerm]);

  // ── Sort helper ──────────────────────────────────────────────────────────────
  const sortGroups = useCallback(<T extends { name: string; expiredCount: number; total: number; lastDate: number }>(
    groups: T[]
  ): T[] => {
    return [...groups].sort((a, b) => {
      switch (sortBy) {
        case 'expired_desc': return b.expiredCount - a.expiredCount;
        case 'name_asc':     return a.name.localeCompare(b.name, 'pt-BR');
        case 'name_desc':    return b.name.localeCompare(a.name, 'pt-BR');
        case 'total_desc':   return b.total - a.total;
        case 'recent_desc':  return b.lastDate - a.lastDate;
        default:             return 0;
      }
    });
  }, [sortBy]);

  // ── Groups for "Por Fornecedor" ──────────────────────────────────────────────
  const supplierGroups = useMemo(() => {
    const map = new Map<string, { supplierId: string; name: string; supplier: Supplier | undefined; products: EnrichedProduct[] }>();
    filtered.forEach(p => {
      if (!map.has(p.supplierId))
        map.set(p.supplierId, { supplierId: p.supplierId, name: p.supplierName, supplier: p.supplier, products: [] });
      map.get(p.supplierId)!.products.push(p);
    });
    const groups = Array.from(map.values()).map(g => ({
      ...g,
      expiredCount: g.products.filter(p => p.isExpired).length,
      total: g.products.length,
      lastDate: g.products[0]?.lastSeenDate ?? 0,
    }));
    return sortGroups(groups);
  }, [filtered, sortGroups]);

  // ── Groups for "Por Categoria" ───────────────────────────────────────────────
  const categoryGroups = useMemo(() => {
    const map = new Map<string, EnrichedProduct[]>();
    filtered.forEach(p => {
      const cat = p.masterCategory ?? 'Sem categoria';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(p);
    });
    const groups = Array.from(map.entries()).map(([cat, products]) => ({
      supplierId: cat,
      name: cat,
      supplier: undefined as Supplier | undefined,
      products,
      expiredCount: products.filter(p => p.isExpired).length,
      total: products.length,
      lastDate: products[0]?.lastSeenDate ?? 0,
    }));
    return sortGroups(groups);
  }, [filtered, sortGroups]);

  const activeGroups = groupBy === 'supplier' ? supplierGroups : categoryGroups;

  // ── Selection helpers ────────────────────────────────────────────────────────
  const toggle = (supplierId: string, productId: string) => {
    const key = `${supplierId}:${productId}`;
    setSelectedKeys(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleGroup = (products: EnrichedProduct[], supplierId: string) => {
    const allSel = products.length > 0 && products.every(p => selectedKeys.has(`${supplierId}:${p.id}`));
    setSelectedKeys(prev => {
      const next = new Set(prev);
      products.forEach(p => {
        const k = `${supplierId}:${p.id}`;
        allSel ? next.delete(k) : next.add(k);
      });
      return next;
    });
  };

  const selectAllExpired = () => {
    const next = new Set<string>();
    allProducts.filter(p => p.isExpired).forEach(p => next.add(`${p.supplierId}:${p.id}`));
    setSelectedKeys(next);
    if (groupBy === 'supplier') {
      setExpandedGroups(new Set(supplierGroups.filter(g => g.expiredCount > 0).map(g => g.supplierId)));
    } else {
      setExpandedGroups(new Set(categoryGroups.filter(g => g.expiredCount > 0).map(g => g.name)));
    }
  };

  const clearAll = () => setSelectedKeys(new Set());

  // ── Selected grouped by supplier (for message generation) ────────────────────
  const selectedBySupplier = useMemo(() => {
    const result: Record<string, { supplierName: string; supplier: Supplier | undefined; products: EnrichedProduct[] }> = {};
    allProducts.forEach(p => {
      const key = `${p.supplierId}:${p.id}`;
      if (!selectedKeys.has(key)) return;
      if (!result[p.supplierId])
        result[p.supplierId] = { supplierName: p.supplierName, supplier: p.supplier, products: [] };
      result[p.supplierId].products.push(p);
    });
    return result;
  }, [selectedKeys, allProducts]);

  const selectedCount = selectedKeys.size;
  const selectedSupplierCount = Object.keys(selectedBySupplier).length;

  // ── Message generation ────────────────────────────────────────────────────────
  const generateMessage = (supplierName: string, products: EnrichedProduct[]): string => {
    const lines = products.map(p => {
      const priceInfo = p.displayPrice
        ? ` (últ.: ${fmt(p.displayPrice.unitPrice)}/un · ${fmtDate(p.displayPrice.date)})`
        : '';
      return `• ${p.name}${priceInfo}`;
    });
    return `Olá ${supplierName}, tudo bem?\nPreciso de cotação dos itens abaixo:\n\n${lines.join('\n')}\n\nAguardo retorno. Obrigado!`;
  };

  const copyMsg = (id: string, msg: string) => {
    navigator.clipboard.writeText(msg);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const openWhatsApp = (whatsapp: string, msg: string) => {
    const phone = whatsapp.replace(/\D/g, '');
    window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  // ── Open quote modal (with or without supplier picker) ────────────────────────
  const handleGenerate = (overrideKeys?: Set<string>) => {
    const keys = overrideKeys ?? selectedKeys;
    // rebuild selectedBySupplier from given keys
    const bySupplier: Record<string, { supplierName: string; supplier: Supplier | undefined; products: EnrichedProduct[] }> = {};
    allProducts.forEach(p => {
      const key = `${p.supplierId}:${p.id}`;
      if (!keys.has(key)) return;
      if (!bySupplier[p.supplierId])
        bySupplier[p.supplierId] = { supplierName: p.supplierName, supplier: p.supplier, products: [] };
      bySupplier[p.supplierId].products.push(p);
    });

    if (!considerSupplier) {
      // show supplier picker first
      setPickedSuppliers(new Set(Object.keys(bySupplier)));
      setShowSupplierPicker(true);
    } else {
      setActiveTab(Object.keys(bySupplier)[0] ?? null);
      setShowModal(true);
    }
  };

  // selectedBySupplier filtered by pickedSuppliers (used when considerSupplier=false)
  const selectedBySupplierFiltered = useMemo(() => {
    if (considerSupplier) return selectedBySupplier;
    const result: typeof selectedBySupplier = {};
    (Object.entries(selectedBySupplier) as [string, SupplierQuoteData][]).forEach(([sid, data]) => {
      if (pickedSuppliers.has(sid)) result[sid] = data;
    });
    return result;
  }, [selectedBySupplier, considerSupplier, pickedSuppliers]);

  const confirmSupplierPick = () => {
    setShowSupplierPicker(false);
    setActiveTab(Object.keys(selectedBySupplierFiltered)[0] ?? null);
    setShowModal(true);
  };

  // ── Stage helpers ─────────────────────────────────────────────────────────────
  const saveStage = () => {
    if (!stageNameInput.trim() || selectedCount === 0) return;
    setSavingStage(true);
    const colorIdx = quoteStages.length % STAGE_COLORS.length;
    const newStage: QuoteStage = {
      id: `stage_${Date.now()}`,
      name: stageNameInput.trim(),
      productKeys: Array.from(selectedKeys),
      createdAt: Date.now(),
      color: STAGE_COLORS[colorIdx],
    };
    onSaveStages([...quoteStages, newStage]);
    setStageNameInput('');
    setSelectedKeys(new Set());
    setSavingStage(false);
  };

  const deleteStage = (id: string) => onSaveStages(quoteStages.filter(s => s.id !== id));

  const markStageSent = (id: string) =>
    onSaveStages(quoteStages.map(s => s.id === id ? { ...s, sentAt: Date.now() } : s));

  const generateStage = (stage: QuoteStage) => {
    const keys = new Set(stage.productKeys);
    handleGenerate(keys);
  };

  const loadStageSelection = (stage: QuoteStage) => {
    setSelectedKeys(new Set(stage.productKeys));
    setShowStagesPanel(false);
  };

  // ── Category filter toggle ─────────────────────────────────────────────────
  const toggleCategoryFilter = (cat: string) => {
    setCategoryFilter(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  // ── Expand/collapse group ─────────────────────────────────────────────────
  const toggleGroup_ = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleSubGroup = (key: string) => {
    setExpandedSubGroups(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // ── Sub-category groups within supplier (groupBy='supplier') ──────────────
  const getSubCategoryGroups = (products: EnrichedProduct[]) => {
    const map = new Map<string, EnrichedProduct[]>();
    products.forEach(p => {
      const cat = p.masterCategory ?? 'Sem categoria';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(p);
    });
    return Array.from(map.entries())
      .map(([cat, prods]) => ({ cat, prods }))
      .sort((a, b) => a.cat === 'Sem categoria' ? 1 : b.cat === 'Sem categoria' ? -1 : a.cat.localeCompare(b.cat, 'pt-BR'));
  };

  // ── Pending stages count ───────────────────────────────────────────────────
  const pendingStages = quoteStages.filter(s => !s.sentAt);

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col gap-3 overflow-hidden">

      {/* ── Header ── */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 shrink-0 space-y-3">

        {/* Row 1: Title + action buttons */}
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-amber-500" /> Abrir Cotação
            </h2>
            <p className="text-slate-400 text-xs mt-0.5">Selecione produtos e gere mensagens por fornecedor</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {selectedCount > 0 && (
              <button onClick={clearAll} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 transition-colors">
                <X className="w-3.5 h-3.5" /> Limpar
              </button>
            )}
            <button
              onClick={() => setShowStagesPanel(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${showStagesPanel ? 'bg-amber-600/20 border-amber-500 text-amber-400' : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'}`}
            >
              <Layers className="w-3.5 h-3.5" />
              Etapas{pendingStages.length > 0 && <span className="ml-1 bg-amber-600 text-white rounded-full text-[10px] w-4 h-4 flex items-center justify-center">{pendingStages.length}</span>}
            </button>
            {totalExpired > 0 && (
              <button onClick={selectAllExpired} className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 text-white px-4 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-lg shadow-amber-900/30">
                <Zap className="w-3.5 h-3.5" />
                {totalExpired} expirado{totalExpired > 1 ? 's' : ''}
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Search + expired toggle */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar produto por nome ou SKU..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 pl-9 pr-4 text-sm text-white focus:border-amber-500 focus:outline-none"
            />
          </div>
          <button
            onClick={() => setShowOnlyExpired(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all border whitespace-nowrap ${showOnlyExpired ? 'bg-amber-600/20 border-amber-500 text-amber-400' : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'}`}
          >
            <Clock className="w-3.5 h-3.5" /> Só expirados
          </button>
        </div>

        {/* Row 3: Sort + View controls */}
        <div className="flex flex-wrap gap-2 items-center">
          {/* Sort dropdown */}
          <div className="relative">
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as SortBy)}
              className="appearance-none bg-slate-900 border border-slate-700 text-slate-300 text-xs rounded-lg pl-3 pr-8 py-1.5 focus:outline-none focus:border-amber-500 cursor-pointer"
            >
              <option value="expired_desc">↓ Mais expirados</option>
              <option value="name_asc">A → Z</option>
              <option value="name_desc">Z → A</option>
              <option value="total_desc">Mais produtos</option>
              <option value="recent_desc">Mais recentes</option>
            </select>
            <ArrowUpDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
          </div>

          {/* Agrupar por */}
          <div className="flex rounded-lg border border-slate-700 overflow-hidden text-xs">
            <button
              onClick={() => setGroupBy('supplier')}
              className={`flex items-center gap-1 px-3 py-1.5 transition-colors ${groupBy === 'supplier' ? 'bg-amber-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'}`}
            >
              <Users className="w-3.5 h-3.5" /> Fornecedor
            </button>
            <button
              onClick={() => setGroupBy('category')}
              className={`flex items-center gap-1 px-3 py-1.5 border-l border-slate-700 transition-colors ${groupBy === 'category' ? 'bg-amber-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'}`}
            >
              <Tag className="w-3.5 h-3.5" /> Categoria
            </button>
          </div>

          {/* Considerar fornecedor */}
          <button
            onClick={() => setConsiderSupplier(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${considerSupplier ? 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white' : 'bg-blue-900/30 border-blue-700/50 text-blue-400'}`}
            title="Quando desativado, você escolherá os fornecedores manualmente ao gerar"
          >
            <Users className="w-3.5 h-3.5" />
            {considerSupplier ? 'Fornecedor: auto' : 'Fornecedor: manual'}
          </button>
        </div>

        {/* Row 4: Category filter pills */}
        {allCategories.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {allCategories.map(cat => (
              <button
                key={cat}
                onClick={() => toggleCategoryFilter(cat)}
                className={`flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border transition-colors ${categoryFilter.has(cat) ? 'bg-amber-600/20 border-amber-500 text-amber-300' : 'bg-slate-900 border-slate-700 text-slate-500 hover:text-slate-300'}`}
              >
                {categoryFilter.has(cat) && <Check className="w-2.5 h-2.5" />}
                {cat}
              </button>
            ))}
            {categoryFilter.size > 0 && (
              <button onClick={() => setCategoryFilter(new Set())} className="text-[11px] px-2 py-1 text-slate-600 hover:text-slate-400 transition-colors">
                limpar filtros
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Stages panel ── */}
      {showStagesPanel && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 shrink-0 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-amber-500" /> Etapas de Cotação
            </h3>
            {selectedCount > 0 && (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Nome da etapa..."
                  value={stageNameInput}
                  onChange={e => setStageNameInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveStage()}
                  className="bg-slate-900 border border-slate-700 text-white text-xs rounded-lg px-3 py-1.5 w-44 focus:border-amber-500 focus:outline-none"
                />
                <button
                  onClick={saveStage}
                  disabled={!stageNameInput.trim() || savingStage}
                  className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Salvar ({selectedCount})
                </button>
              </div>
            )}
          </div>

          {quoteStages.length === 0 ? (
            <p className="text-slate-600 text-xs">Nenhuma etapa salva. Selecione produtos e salve uma etapa.</p>
          ) : (
            <div className="space-y-2">
              {quoteStages.map(stage => {
                const colorKey = stage.color ?? 'amber';
                const c = STAGE_COLOR_MAP[colorKey] ?? STAGE_COLOR_MAP.amber;
                const isSent = !!stage.sentAt;
                return (
                  <div key={stage.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${isSent ? 'bg-slate-900/40 border-slate-800' : `${c.bg} ${c.border}`}`}>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${isSent ? 'bg-slate-600' : c.dot}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${isSent ? 'text-slate-500 line-through' : 'text-slate-200'}`}>{stage.name}</p>
                      <p className="text-[11px] text-slate-500">{stage.productKeys.length} produto{stage.productKeys.length > 1 ? 's' : ''}{isSent ? ` · enviado ${fmtDate(stage.sentAt!)}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!isSent && (
                        <>
                          <button onClick={() => loadStageSelection(stage)} className="text-slate-500 hover:text-slate-300 transition-colors p-1" title="Carregar seleção">
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => generateStage(stage)} className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${c.text} bg-slate-900/60 hover:bg-slate-700`}>
                            <SendHorizonal className="w-3 h-3" /> Gerar
                          </button>
                          <button onClick={() => markStageSent(stage.id)} className="text-slate-500 hover:text-emerald-400 transition-colors p-1" title="Marcar como enviado">
                            <BookmarkCheck className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                      <button onClick={() => deleteStage(stage.id)} className="text-slate-600 hover:text-red-400 transition-colors p-1">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Product list ── */}
      <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-1">
        {activeGroups.map(group => {
          const groupKey = groupBy === 'supplier' ? group.supplierId : group.name;
          const isExpanded = expandedGroups.has(groupKey);
          const selectedInGroup = group.products.filter(p =>
            selectedKeys.has(`${p.supplierId}:${p.id}`)
          ).length;
          const allSel = group.products.length > 0 && selectedInGroup === group.products.length;
          const someSel = selectedInGroup > 0 && !allSel;

          return (
            <div key={groupKey} className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
              {/* Group header */}
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-700/40 transition-colors select-none"
                onClick={() => toggleGroup_(groupKey)}
              >
                <button
                  onClick={e => { e.stopPropagation(); toggleGroup(group.products, group.supplierId); }}
                  className="shrink-0 transition-colors hover:text-amber-400"
                >
                  {allSel
                    ? <CheckSquare className="w-4 h-4 text-amber-500" />
                    : someSel
                      ? <CheckSquare className="w-4 h-4 text-amber-500/50" />
                      : <Square className="w-4 h-4 text-slate-500" />}
                </button>

                {groupBy === 'category' && <Tag className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
                <span className="font-bold text-slate-200 flex-1 truncate">{group.name}</span>

                <div className="flex items-center gap-2 shrink-0">
                  {group.expiredCount > 0 && (
                    <span className="text-[10px] bg-amber-900/30 text-amber-400 border border-amber-700/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" /> {group.expiredCount} exp.
                    </span>
                  )}
                  {selectedInGroup > 0 && (
                    <span className="text-[10px] bg-emerald-900/20 text-emerald-400 border border-emerald-700/20 px-2 py-0.5 rounded-full">
                      {selectedInGroup} sel.
                    </span>
                  )}
                  <span className="text-slate-500 text-xs">{group.total} prod.</span>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                </div>
              </div>

              {/* Product rows */}
              {isExpanded && (
                <div className="border-t border-slate-700 divide-y divide-slate-700/40">
                  {groupBy === 'supplier'
                    ? (() => {
                        // sub-group by category if multiple categories present
                        const subGroups = getSubCategoryGroups(group.products);
                        const hasMultiCat = subGroups.length > 1;

                        if (!hasMultiCat) {
                          return group.products.map(p => (
                            <ProductRow key={`${p.supplierId}:${p.id}`} product={p} isSelected={selectedKeys.has(`${p.supplierId}:${p.id}`)} onToggle={() => toggle(p.supplierId, p.id)} showSupplierBadge={false} />
                          ));
                        }

                        return subGroups.map(({ cat, prods }) => {
                          const subKey = `${groupKey}__${cat}`;
                          const subExpanded = expandedSubGroups.has(subKey);
                          const subSelCount = prods.filter(p => selectedKeys.has(`${p.supplierId}:${p.id}`)).length;
                          return (
                            <div key={cat}>
                              <div
                                className="flex items-center gap-2 px-4 py-1.5 cursor-pointer hover:bg-slate-700/20 transition-colors select-none bg-slate-800/50"
                                onClick={() => toggleSubGroup(subKey)}
                              >
                                <Tag className="w-3 h-3 text-slate-600" />
                                <span className="text-[11px] text-slate-500 font-medium flex-1">{cat}</span>
                                {subSelCount > 0 && <span className="text-[10px] text-emerald-400">{subSelCount} sel.</span>}
                                <span className="text-[10px] text-slate-600">{prods.length}</span>
                                {subExpanded ? <ChevronUp className="w-3 h-3 text-slate-600" /> : <ChevronDown className="w-3 h-3 text-slate-600" />}
                              </div>
                              {subExpanded && prods.map(p => (
                                <ProductRow key={`${p.supplierId}:${p.id}`} product={p} isSelected={selectedKeys.has(`${p.supplierId}:${p.id}`)} onToggle={() => toggle(p.supplierId, p.id)} showSupplierBadge={false} />
                              ))}
                            </div>
                          );
                        });
                      })()
                    : group.products.map(p => (
                        <ProductRow key={`${p.supplierId}:${p.id}`} product={p} isSelected={selectedKeys.has(`${p.supplierId}:${p.id}`)} onToggle={() => toggle(p.supplierId, p.id)} showSupplierBadge={true} />
                      ))
                  }
                </div>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <Package className="w-12 h-12 mb-3 opacity-20" />
            <p className="text-sm">Nenhum produto encontrado.</p>
            {Object.keys(catalogs).length === 0 && (
              <p className="text-xs mt-1 text-slate-600">Importe cotações dos seus fornecedores para começar.</p>
            )}
          </div>
        )}
      </div>

      {/* ── Sticky action bar ── */}
      {selectedCount > 0 && (
        <div className="shrink-0 flex gap-2">
          {/* Save as stage input inline */}
          {showStagesPanel && (
            <div className="flex gap-2 flex-1">
              <input
                type="text"
                placeholder="Nome da etapa..."
                value={stageNameInput}
                onChange={e => setStageNameInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveStage()}
                className="flex-1 bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-4 py-3 focus:border-amber-500 focus:outline-none"
              />
              <button
                onClick={saveStage}
                disabled={!stageNameInput.trim()}
                className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white px-4 rounded-xl text-sm font-medium transition-colors"
              >
                <Layers className="w-4 h-4" /> Salvar etapa
              </button>
            </div>
          )}
          <button
            onClick={() => handleGenerate()}
            className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-bold py-3.5 px-6 rounded-xl flex items-center justify-center gap-3 transition-all shadow-xl shadow-amber-900/30 text-sm active:scale-[0.99]"
          >
            <SendHorizonal className="w-5 h-5" />
            Gerar cotações — {selectedCount} prod. · {selectedSupplierCount} forn.
          </button>
        </div>
      )}

      {/* ── Supplier picker modal (considerSupplier = false) ── */}
      {showSupplierPicker && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <h3 className="text-white font-bold flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-400" /> Quais fornecedores incluir?
              </h3>
              <button onClick={() => setShowSupplierPicker(false)} className="text-slate-400 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
              {(Object.entries(selectedBySupplier) as [string, SupplierQuoteData][]).map(([sid, data]) => (
                <label key={sid} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-700 bg-slate-800 cursor-pointer hover:border-slate-600 transition-colors">
                  <input
                    type="checkbox"
                    checked={pickedSuppliers.has(sid)}
                    onChange={() => {
                      setPickedSuppliers(prev => {
                        const next = new Set(prev);
                        next.has(sid) ? next.delete(sid) : next.add(sid);
                        return next;
                      });
                    }}
                    className="accent-amber-500 w-4 h-4"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 font-medium truncate">{data.supplierName}</p>
                    <p className="text-xs text-slate-500">{data.products.length} produto{data.products.length > 1 ? 's' : ''} selecionado{data.products.length > 1 ? 's' : ''}</p>
                  </div>
                </label>
              ))}
            </div>
            <div className="px-5 py-4 border-t border-slate-800 flex gap-3">
              <button onClick={() => setShowSupplierPicker(false)} className="flex-1 py-2.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white text-sm transition-colors">
                Cancelar
              </button>
              <button
                onClick={confirmSupplierPick}
                disabled={pickedSuppliers.size === 0}
                className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white font-bold text-sm transition-colors"
              >
                Gerar para {pickedSuppliers.size} forn.
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Message modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <h3 className="text-white font-bold flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-amber-500" /> Pedidos de Cotação
              </h3>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500">
                  {(Object.values(selectedBySupplierFiltered) as SupplierQuoteData[]).reduce((a, d) => a + d.products.length, 0)} prod. · {Object.keys(selectedBySupplierFiltered).length} forn.
                </span>
                <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Supplier tabs */}
            <div className="flex gap-1.5 px-4 py-2.5 border-b border-slate-800 overflow-x-auto custom-scrollbar">
              {(Object.entries(selectedBySupplierFiltered) as [string, SupplierQuoteData][]).map(([supplierId, data]) => (
                <button
                  key={supplierId}
                  onClick={() => setActiveTab(supplierId)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors border ${activeTab === supplierId ? 'bg-amber-600 text-white border-amber-600' : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'}`}
                >
                  {data.supplierName}
                  <span className={`ml-1.5 text-[10px] ${activeTab === supplierId ? 'text-amber-200' : 'text-slate-500'}`}>
                    {data.products.length}
                  </span>
                </button>
              ))}
            </div>

            {/* Message area */}
            {activeTab && selectedBySupplierFiltered[activeTab] && (() => {
              const { supplierName, supplier, products } = selectedBySupplierFiltered[activeTab];
              const msg = generateMessage(supplierName, products);
              const isCopied = copiedId === activeTab;
              return (
                <div className="flex-1 overflow-auto p-4 space-y-3 min-h-0">
                  <div className="flex flex-wrap gap-1.5">
                    {products.map(p => (
                      <span key={`${p.supplierId}:${p.id}`} className="text-[10px] bg-slate-800 border border-slate-700 text-slate-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[p.priority]}`} />
                        {p.name.length > 30 ? p.name.slice(0, 30) + '…' : p.name}
                      </span>
                    ))}
                  </div>
                  <pre className="bg-slate-800/80 border border-slate-700 rounded-xl p-4 text-sm text-slate-200 whitespace-pre-wrap font-sans leading-relaxed">
                    {msg}
                  </pre>
                  <div className="flex gap-3">
                    <button
                      onClick={() => copyMsg(activeTab, msg)}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all border ${isCopied ? 'bg-emerald-900/30 border-emerald-700/40 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'}`}
                    >
                      {isCopied ? <><Check className="w-4 h-4" /> Copiado!</> : <><Copy className="w-4 h-4" /> Copiar mensagem</>}
                    </button>
                    {supplier?.whatsapp ? (
                      <button
                        onClick={() => openWhatsApp(supplier.whatsapp!, msg)}
                        className="flex-1 flex items-center justify-center gap-2 bg-green-700 hover:bg-green-600 text-white py-2.5 rounded-xl text-sm font-medium transition-colors"
                      >
                        <Phone className="w-4 h-4" /> Abrir no WhatsApp
                      </button>
                    ) : (
                      <div className="flex-1 flex items-center justify-center gap-2 bg-slate-800/50 border border-dashed border-slate-700 text-slate-600 py-2.5 rounded-xl text-xs">
                        <Phone className="w-3.5 h-3.5" /> WhatsApp não cadastrado
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── ProductRow sub-component ─────────────────────────────────────────────────

interface ProductRowProps {
  product: EnrichedProduct;
  isSelected: boolean;
  onToggle: () => void;
  showSupplierBadge: boolean;
}

const ProductRow: React.FC<ProductRowProps> = ({ product: p, isSelected, onToggle, showSupplierBadge }) => (
  <div
    onClick={onToggle}
    className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${isSelected ? 'bg-amber-950/25' : 'hover:bg-slate-700/25'}`}
  >
    <div className="shrink-0">
      {isSelected
        ? <CheckSquare className="w-4 h-4 text-amber-500" />
        : <Square className="w-4 h-4 text-slate-600" />}
    </div>
    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${PRIORITY_DOT[p.priority]}`} title={PRIORITY_LABEL[p.priority]} />
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 min-w-0">
        <p className="text-sm text-slate-200 font-medium truncate">{p.name}</p>
        {showSupplierBadge && (
          <span className="text-[10px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded shrink-0 max-w-[100px] truncate">{p.supplierName}</span>
        )}
      </div>
      {p.displayPrice ? (
        <p className="text-[11px] text-slate-500">
          {fmt(p.displayPrice.unitPrice)}/un · cx c/{p.displayPrice.packQuantity} · {fmtDate(p.displayPrice.date)}
        </p>
      ) : (
        <p className="text-[11px] text-slate-600">Sem histórico de preços</p>
      )}
    </div>
    {p.isExpired && (
      <span className="text-[10px] text-amber-500/80 flex items-center gap-0.5 shrink-0 ml-auto">
        <Clock className="w-3 h-3" /> nova cotação
      </span>
    )}
  </div>
);

export default QuoteRequest;
