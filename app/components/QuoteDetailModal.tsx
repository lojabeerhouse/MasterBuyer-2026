import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Supplier, QuoteBatch, ProductQuote, ProductMapping, MasterProduct, PackRule } from '../types';
import {
  Trash2, CheckCircle, Loader2, Ban, Pencil, Save, X, XCircle, RefreshCw,
  Coins, BoxSelect, Sparkles, ChevronLeft, ChevronRight, ChevronDown,
  ChevronUp, AlertTriangle, Check, CheckSquare, Square, Search, Bot, Eye, Link2, Unlink,
  Star, RotateCcw, ShieldAlert, Calendar,
} from 'lucide-react';
import { batchSmartIdentify } from '../services/geminiService';
import { normalizeProductName, normForMapping, findMasterProductMatches } from '../services/compras/supplierCatalogService';
import LinkProductModal from './LinkProductModal';
import { useSidebar } from '../contexts/RightSidebarContext';
import QuoteActionsPanel from './QuoteActionsPanel';

// ─── Props ────────────────────────────────────────────────────────────────────

interface QuoteDetailModalProps {
  batch: QuoteBatch;
  supplierId: string;
  supplier: Supplier;
  setSuppliers: React.Dispatch<React.SetStateAction<Supplier[]>>;
  onClose: () => void;
  onBatchCompleted?: (batch: QuoteBatch, supplierId: string) => void;
  onBatchDateChange?: (supplierId: string, batchId: string, ts: number, items: ProductQuote[]) => void;
  onBanItem?: (itemName: string) => void;
  productMappings?: ProductMapping[];
  masterProducts?: MasterProduct[];
  onAddMapping?: (normalizedName: string, targetSku: string, targetType?: 'master' | 'supplier', targetName?: string, supplierSku?: string) => void;
  onRemoveMapping?: (supplierProductName: string) => void;
  globalPackRules?: PackRule[];
}

// ─── Component ────────────────────────────────────────────────────────────────

const QuoteDetailModal: React.FC<QuoteDetailModalProps> = ({
  batch: initialBatch,
  supplierId,
  supplier,
  setSuppliers,
  onClose,
  onBatchCompleted,
  onBatchDateChange,
  onBanItem,
  productMappings,
  masterProducts,
  onAddMapping,
  onRemoveMapping,
  globalPackRules = [],
}) => {
  // ── Local batch state ────────────────────────────────────────────────────────
  const [viewingBatch, setViewingBatch] = useState<QuoteBatch>(initialBatch);
  const batchSnapshot = useRef<QuoteBatch>(JSON.parse(JSON.stringify(initialBatch)));

  // ── Search / sort ────────────────────────────────────────────────────────────
  const [detailsSearchTerm, setDetailsSearchTerm] = useState('');
  const [detailsSortBy, setDetailsSortBy] = useState<'default' | 'name' | 'price_asc' | 'price_desc' | 'pack'>('default');

  // ── Batch date editing ───────────────────────────────────────────────────────
  const [editingBatchDate, setEditingBatchDate] = useState(false);
  const [tempBatchDate, setTempBatchDate] = useState('');

  // ── Sections collapsed ───────────────────────────────────────────────────────
  const [collapsedSections, setCollapsedSections] = useState({ inspection: false, yellow: false, blue: true, green: true, novelties: true });

  // ── Selection & batch magic ──────────────────────────────────────────────────
  const [selectedPendingItems, setSelectedPendingItems] = useState<Set<number>>(new Set());
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  // ── Draft values (local only — synced to global on blur or save) ─────────────
  const [draftQty, setDraftQty] = useState<Record<number, number>>({});
  const [draftPrice, setDraftPrice] = useState<Record<number, number>>({});

  // ── Item name editing ────────────────────────────────────────────────────────
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [tempItemName, setTempItemName] = useState('');

  // ── Row animations & confirm dialog ─────────────────────────────────────────
  const [animatingRows, setAnimatingRows] = useState<Record<string, 'ban' | 'delete'>>({});
  const [confirmAction, setConfirmAction] = useState<{
    type: 'ban' | 'delete';
    batchId: string;
    itemIndex: number;
    itemName: string;
  } | null>(null);
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const dontAskAgainRef = useRef(false);

  // ── Unsaved changes dialog ───────────────────────────────────────────────────
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);

  // ── Link product modal ───────────────────────────────────────────────────────
  const [linkingItem, setLinkingItem] = useState<ProductQuote | null>(null);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set());
  // Sugestões calculadas lazily (por hover), para não travar a UI no mount
  const [revealedSuggestions, setRevealedSuggestions] = useState<Map<number, { sku: string; name: string; score: number }>>(new Map());
  const computedSuggestionIdxs = useRef<Set<number>>(new Set());

  // ── Sidebar Context ───────────────────────────────────────────────────
  const { setSidebarContent, clearSidebar, setCollapsed, setBadgeCount } = useSidebar();

  // Reset selection and lazy suggestions when batch id changes
  useEffect(() => {
    setSelectedPendingItems(new Set());
    setDetailsSearchTerm('');
    setRevealedSuggestions(new Map());
    computedSuggestionIdxs.current = new Set();
  }, [viewingBatch.id]);

  // ── Helper: sync items to parent suppliers state ─────────────────────────────
  // ── Batch date editing ───────────────────────────────────────────────────────
  const startEditingBatchDate = (batch: QuoteBatch) => {
    const d = new Date(batch.timestamp);
    const pad = (n: number) => n.toString().padStart(2, '0');
    const val = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    setTempBatchDate(val);
    setEditingBatchDate(true);
  };

  const saveBatchDate = (batchId: string) => {
    if (!tempBatchDate) return;
    const ts = new Date(tempBatchDate).getTime();
    setSuppliers(prev => prev.map(s => {
      if (s.id !== supplierId) return s;
      return { ...s, quotes: s.quotes.map(q => q.id === batchId ? { ...q, timestamp: ts } : q) };
    }));
    setViewingBatch(prev => ({ ...prev, timestamp: ts }));
    setEditingBatchDate(false);
    onBatchDateChange?.(supplierId, batchId, ts, viewingBatch.items);
  };

  // ── Save batch ───────────────────────────────────────────────────────────────
  const saveBatch = () => {
    const now = Date.now();
    const saved = { ...viewingBatch, isSaved: true, savedAt: now };
    batchSnapshot.current = JSON.parse(JSON.stringify(saved));
    // Única escrita no estado global (dispara Firebase via useEffect no App.tsx)
    setSuppliers(prev => prev.map(s => {
      if (s.id !== supplierId) return s;
      return { ...s, quotes: s.quotes.map(q => q.id === viewingBatch.id ? saved : q) };
    }));
    setViewingBatch(saved);
    onBatchCompleted?.(saved, supplierId);
  };

  // ── Close with dirty check ───────────────────────────────────────────────────
  const handleClose = () => {
    const snap = batchSnapshot.current;
    const hasChanges =
      JSON.stringify(viewingBatch.items) !== JSON.stringify(snap.items) ||
      viewingBatch.timestamp !== snap.timestamp;
    if (hasChanges) {
      setShowUnsavedDialog(true);
    } else {
      onClose();
    }
  };

  const handleSaveAndClose = () => {
    saveBatch();
    onClose();
  };

  const handleDiscardAndClose = () => {
    // Estado global nunca foi alterado durante edição — só fecha
    onClose();
  };

  // ── Item deletion ────────────────────────────────────────────────────────────
  const deleteItemFromBatch = (batchId: string, itemIndex: number) => {
    setViewingBatch(prev => {
      if (prev.id !== batchId) return prev;
      return { ...prev, items: prev.items.filter((_, idx) => idx !== itemIndex) };
    });
  };

  // ── Ban / delete flow ────────────────────────────────────────────────────────
  const handleRequestAction = (type: 'ban' | 'delete', batchId: string, itemIndex: number, itemName: string) => {
    if (dontAskAgainRef.current) {
      triggerRowAnimation(type, batchId, itemIndex, itemName);
    } else {
      setConfirmAction({ type, batchId, itemIndex, itemName });
      setDontAskAgain(false);
    }
  };

  const confirmPendingAction = () => {
    if (!confirmAction) return;
    if (dontAskAgain) dontAskAgainRef.current = true;
    triggerRowAnimation(confirmAction.type, confirmAction.batchId, confirmAction.itemIndex, confirmAction.itemName);
    setConfirmAction(null);
  };

  const triggerRowAnimation = (type: 'ban' | 'delete', batchId: string, itemIndex: number, itemName: string) => {
    const key = `${batchId}-${itemIndex}`;
    setAnimatingRows(prev => ({ ...prev, [key]: type }));
    setTimeout(() => {
      if (type === 'ban') onBanItem?.(itemName);
      deleteItemFromBatch(batchId, itemIndex);
      setAnimatingRows(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }, 2000);
  };

  // ── Item name editing ────────────────────────────────────────────────────────
  const startEditingItem = (index: number, currentName: string) => {
    setEditingItemId(index);
    setTempItemName(currentName);
    const key = `${viewingBatch.id}-${index}`;
  };

  const saveItemName = (_batchId: string, itemIndex: number, newName: string) => {
    setViewingBatch(prev => ({
      ...prev,
      items: prev.items.map((item, idx) =>
        idx === itemIndex ? { ...item, name: newName, isAiSuggested: false } : item
      ),
    }));
    setEditingItemId(null);
  };

  // ── Selection ────────────────────────────────────────────────────────────────
  const toggleSelection = (index: number) => {
    setSelectedPendingItems(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const toggleSelectAllForCategory = (indices: number[]) => {
    const isAllSelected = indices.every(idx => selectedPendingItems.has(idx));
    setSelectedPendingItems(prev => {
      const next = new Set(prev);
      if (isAllSelected) {
        indices.forEach(idx => next.delete(idx));
      } else {
        indices.forEach(idx => next.add(idx));
      }
      return next;
    });
  };

  // ── Batch Actions ────────────────────────────────────────────────────────────
  const handleBatchSuggestPacks = async () => {
    if (selectedPendingItems.size === 0 || isBatchProcessing) return;
    setIsBatchProcessing(true);

    try {
      const itemsToProcess = Array.from(selectedPendingItems).map((idx) => {
        const index = idx as number;
        return {
          index,
          name: viewingBatch.items[index].name,
          price: viewingBatch.items[index].price
        };
      });

      // Combina exceções do fornecedor + regras globais para guiar a IA
      const allRules = [...(supplier.packRules || []), ...globalPackRules];
      const results = await batchSmartIdentify(itemsToProcess, allRules);

      const nextItems = [...viewingBatch.items];
      results.forEach((res: { index: number; suggestedPackQty: number }) => {
        const item = nextItems[res.index];
        const packQty = Number(res.suggestedPackQty) || 1;
        nextItems[res.index] = {
          ...item,
          packQuantity: packQty,
          unitPrice: item.priceStrategy === 'pack' ? (item.price / packQty) : item.price,
          isAiSuggested: true
        };
      });

      setViewingBatch({ ...viewingBatch, items: nextItems });
    } catch (e) {
      console.error(e);
      alert("Erro ao sugerir lotes por IA.");
    } finally {
      setIsBatchProcessing(false);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedPendingItems.size === 0) return;
    if (!confirm(`Tem certeza que deseja excluir ${selectedPendingItems.size} itens selecionados?`)) return;

    const indices = Array.from(selectedPendingItems).map(i => i as number).sort((a, b) => b - a);
    let nextItems = [...viewingBatch.items];
    
    indices.forEach(idx => {
      nextItems.splice(idx, 1);
    });

    setViewingBatch({ ...viewingBatch, items: nextItems });
    setSelectedPendingItems(new Set());
  };

  const handleBatchVerify = () => {
    if (selectedPendingItems.size === 0) return;
    const nextItems = viewingBatch.items.map((item, idx) => {
      if (selectedPendingItems.has(idx)) {
        return { ...item, isVerified: true };
      }
      return item;
    });
    setViewingBatch({ ...viewingBatch, items: nextItems });
    setSelectedPendingItems(new Set());
  };

  const clearSelection = () => setSelectedPendingItems(new Set());

  // ── Colapsar sidebar ao montar o modal e restaurar ao desmontar ─────────────
  useEffect(() => {
    setCollapsed(true);
    return () => { setCollapsed(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Injetar / sincronizar painel na sidebar global ───────────────────────────
  // Atualiza o conteúdo da sidebar sempre que o estado relevante muda.
  // O cleanup do useEffect garante que a sidebar é limpa ao desmontar o modal.
  useEffect(() => {
    setBadgeCount(selectedPendingItems.size);
    setSidebarContent(
      <QuoteActionsPanel
        selectedCount={selectedPendingItems.size}
        isBatchProcessing={isBatchProcessing}
        onIdentifyWithAI={handleBatchSuggestPacks}
        onVerifySelected={handleBatchVerify}
        onDeleteSelected={handleBatchDelete}
        onClearSelection={clearSelection}
        onSetStrategyPack={() => updateBatchStrategy(viewingBatch.id, 'pack')}
        onSetStrategyUnit={() => updateBatchStrategy(viewingBatch.id, 'unit')}
      />
    );
    return () => { clearSidebar(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPendingItems.size, isBatchProcessing, viewingBatch.id]);

  const recalculateItem = (item: ProductQuote, newStrategy?: 'pack' | 'unit', newPackQty?: number): ProductQuote => {
    const strategy = newStrategy || item.priceStrategy || 'pack';
    const qty = newPackQty !== undefined ? newPackQty : item.packQuantity;
    const unitPrice = strategy === 'unit' ? item.price : item.price / (qty || 1);
    return { 
      ...item, 
      priceStrategy: strategy, 
      packQuantity: qty, 
      unitPrice, 
      isVerified: qty > 1 ? true : item.isVerified,
      isAiSuggested: newPackQty !== undefined ? false : item.isAiSuggested
    };
  };

  const updateItemStrategy = (_batchId: string, itemIndex: number, newStrategy: 'pack' | 'unit') => {
    setViewingBatch(prev => ({
      ...prev,
      items: prev.items.map((item, idx) => idx === itemIndex ? recalculateItem(item, newStrategy) : item),
    }));
  };

  // onChange: updates local viewingBatch only (instant display, no global re-render)
  const updateItemPackQuantityLocal = (itemIndex: number, newQty: number) => {
    const safeQty = Math.max(1, newQty);
    setDraftQty(prev => ({ ...prev, [itemIndex]: safeQty }));
    setViewingBatch(prev => ({
      ...prev,
      items: prev.items.map((item, idx) => idx === itemIndex ? recalculateItem(item, undefined, safeQty) : item),
    }));
  };

  // onBlur: apenas limpa o draft (estado local já está atualizado via onChange)
  const flushItemPackQuantity = (itemIndex: number) => {
    setDraftQty(prev => { const n = { ...prev }; delete n[itemIndex]; return n; });
  };

  // onChange: updates local viewingBatch only
  const updateItemPriceLocal = (itemIndex: number, newPrice: number) => {
    const safePrice = Math.max(0, newPrice);
    setDraftPrice(prev => ({ ...prev, [itemIndex]: safePrice }));
    setViewingBatch(prev => ({
      ...prev,
      items: prev.items.map((item, idx) => {
        if (idx !== itemIndex) return item;
        const unitPrice = item.priceStrategy === 'unit' ? safePrice : safePrice / Math.max(1, item.packQuantity);
        return { ...item, price: safePrice, unitPrice, isAiSuggested: false };
      }),
    }));
  };

  // onBlur: apenas limpa o draft
  const flushItemPrice = (itemIndex: number) => {
    setDraftPrice(prev => { const n = { ...prev }; delete n[itemIndex]; return n; });
  };


  const toggleItemNovelty = (_batchId: string, itemIndex: number, value: boolean) => {
    setViewingBatch(prev => ({
      ...prev,
      items: prev.items.map((item, idx) => idx === itemIndex ? { ...item, isNovelty: value } : item),
    }));
  };

  const toggleItemVerification = (_batchId: string, itemIndex: number) => {
    setViewingBatch(prev => ({
      ...prev,
      items: prev.items.map((item, idx) => {
        if (idx !== itemIndex) return item;
        return { ...item, isVerified: !item.isVerified, isReprocessed: !item.isVerified ? false : item.isReprocessed };
      }),
    }));
  };

  const updateBatchStrategy = (_batchId: string, newStrategy: 'pack' | 'unit') => {
    setViewingBatch(prev => ({
      ...prev,
      items: prev.items.map(item => recalculateItem(item, newStrategy)),
    }));
  };

  // ── Item classification ──────────────────────────────────────────────────────

  // Pre-compute set of normalised names seen in saved quotes (avoids O(n²) in render)
  const seenNames = useMemo(() => {
    const set = new Set<string>();
    supplier.quotes
      .filter(q => q.isSaved && q.id !== viewingBatch.id)
      .forEach(q => q.items.forEach(i => set.add(normalizeProductName(i.name))));
    return set;
  }, [supplier.quotes, viewingBatch.id]);

  const getItemCategory = (item: ProductQuote): 'green' | 'blue' | 'yellow' | 'novelty' | 'inspection' => {
    if (item.isNovelty) return 'novelty';

    // Primary match: supplier SKU
    if (item.sku && item.sku !== 'S/N' && productMappings) {
      const skuMapping = productMappings.find(m => m.supplierSku === item.sku);
      if (skuMapping) {
        // Sanity check: if name similarity is too low, flag for human inspection
        const nameSim = findMasterProductMatches(item.name,
          masterProducts?.filter(p => p.sku === skuMapping.targetSku) ?? [], 1);
        const nameScore = nameSim.length > 0 ? nameSim[0].score : 0;
        if (nameScore < 40) return 'inspection';
        if (!skuMapping.targetType || skuMapping.targetType === 'master') {
          if (masterProducts?.some(p => p.sku === skuMapping.targetSku)) return 'green';
        }
        if (skuMapping.targetType === 'supplier') return 'blue';
      }
    }

    // Fallback: name-based mapping
    const mappingKey = normForMapping(item.name);
    const mapping = productMappings?.find(m => m.supplierProductNameNormalized === mappingKey);
    if (mapping) {
      if (!mapping.targetType || mapping.targetType === 'master') {
        if (masterProducts?.some(p => p.sku === mapping.targetSku)) return 'green';
      }
      if (mapping.targetType === 'supplier') return 'blue';
    }
    const displayKey = normalizeProductName(item.name);
    if (seenNames.has(displayKey)) return 'blue';
    return 'yellow';
  };

  // Calcula sugestão para UM item sob demanda (lazy, no hover da linha)
  // Pré-filtro de tokens reduz de ~2.000 → ~30 candidatos antes do Levenshtein: ~66× mais rápido
  const computeSuggestionForItem = useCallback((idx: number, itemName: string) => {
    if (!masterProducts || masterProducts.length === 0) return;
    if (computedSuggestionIdxs.current.has(idx)) return;
    computedSuggestionIdxs.current.add(idx);

    const tokens = itemName.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/\s+/).filter(t => t.length > 2);
    const candidates = tokens.length > 0
      ? masterProducts
          .map(p => ({ p, hits: tokens.filter(t => p.name.toUpperCase().includes(t)).length }))
          .filter(x => x.hits > 0)
          .sort((a, b) => b.hits - a.hits)
          .slice(0, 30)
          .map(x => x.p)
      : masterProducts.slice(0, 50);

    const matches = findMasterProductMatches(itemName, candidates, 1);
    if (matches.length > 0 && matches[0].score >= 60) {
      setRevealedSuggestions(prev => new Map(prev).set(idx, matches[0]));
    }
  }, [masterProducts]);

  // ── renderItemRow ─────────────────────────────────────────────────────────────
  const renderItemRow = (item: ProductQuote, idx: number, batchId: string) => {
    const isVerified = item.isVerified;
    const isReprocessed = item.isReprocessed;
    const isSelected = selectedPendingItems.has(idx);
    const rowAnimationType = animatingRows[`${batchId}-${idx}`];

    if (rowAnimationType) {
      return (
        <tr key={idx} className="relative h-16 overflow-hidden">
          <td colSpan={10} className="p-0 relative bg-slate-900 border-b border-slate-800">
            <div
              className={`absolute inset-0 z-10 origin-left transition-transform duration-[2000ms] ease-linear ${rowAnimationType === 'ban' ? 'bg-red-950/40' : 'bg-slate-700/40'}`}
              style={{ transform: 'scaleX(0)', animation: 'progressFill 2s linear forwards' }}
            />
            <div className="absolute inset-0 flex items-center justify-center z-20 text-slate-300 font-medium animate-pulse gap-2">
              {rowAnimationType === 'ban' ? <Ban className="w-4 h-4 text-red-500" /> : <Trash2 className="w-4 h-4" />}
              {rowAnimationType === 'ban' ? 'Bloqueando item...' : 'Excluindo item...'}
            </div>
          </td>
        </tr>
      );
    }

    const category = getItemCategory(item);
    const suggestion = revealedSuggestions.get(idx);
    const isDismissed = dismissedSuggestions.has(normForMapping(item.name));
    const hasSuggestion = !!suggestion && !isDismissed && category !== 'green' && category !== 'novelty';
    const suggestionScore = hasSuggestion ? suggestion!.score : 0;
    // high = ≥85, low = 60–84, none = no suggestion or dismissed
    const suggestionTier: 'high' | 'low' | 'none' = hasSuggestion
      ? suggestionScore >= 85 ? 'high' : 'low'
      : 'none';

    return (
      <tr key={idx} onMouseEnter={() => { if (category !== 'green' && category !== 'novelty') computeSuggestionForItem(idx, item.name); }} className={`group border-b border-slate-800/30 last:border-0 transition-colors ${isSelected ? 'bg-amber-900/20' : 'hover:bg-slate-800/40'}`}>
        {/* Checkbox + Auto — only visible when no suggestion (suggestion is the primary action) */}
        <td className="px-2 py-1.5 text-center w-10">
          <div className="flex flex-col items-center gap-1">
            <input type="checkbox" checked={isSelected} onChange={() => toggleSelection(idx)}
              className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-800 text-amber-600 cursor-pointer" />
            {!isVerified && suggestionTier === 'high' && (
              <CheckCircle className="w-2.5 h-2.5 text-emerald-500/50" title="Alta confiança de correspondência" />
            )}
            {!isVerified && suggestionTier === 'low' && (
              <AlertTriangle className="w-2.5 h-2.5 text-amber-500/50" title="Sugestão de baixa confiança" />
            )}
            {isReprocessed && (
              <span className="text-blue-400 cursor-help" title="Lote ajustado automaticamente por regra de embalagem">
                <Bot className="w-3 h-3" />
              </span>
            )}
          </div>
        </td>

        {/* Nome + Zona de Status (altura fixa) */}
        <td className="px-2 py-1.5">
          {editingItemId === idx ? (
            <div className="flex items-center gap-1.5">
              <input autoFocus value={tempItemName} onChange={(e) => setTempItemName(e.target.value)}
                className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-white text-sm w-full focus:outline-none focus:border-amber-500"
                onKeyDown={(e) => { if (e.key === 'Enter') saveItemName(batchId, idx, tempItemName); if (e.key === 'Escape') setEditingItemId(null); }} />
              <button onClick={() => saveItemName(batchId, idx, tempItemName)} className="text-green-500"><CheckCircle className="w-4 h-4" /></button>
              <button onClick={() => setEditingItemId(null)} className="text-red-500"><X className="w-4 h-4" /></button>
            </div>
          ) : (
            <div>
              {/* Nome + edição inline (IA de nome) */}
                <div className="flex items-center gap-1.5 group/edit mb-0.5">
                  <span className={`text-sm font-medium leading-tight ${!item.isVerified ? 'text-amber-100' : 'text-white'}`}>{item.name}</span>
                  <div className="opacity-0 group-hover/edit:opacity-100 flex items-center gap-0.5 transition-opacity shrink-0">
                    <button onClick={() => startEditingItem(idx, item.name)} className="text-slate-600 hover:text-blue-400 p-0.5 rounded" title="Editar nome"><Pencil className="w-3 h-3" /></button>
                  </div>
                </div>
              {item.sku && <span className="text-[10px] text-slate-600 block mb-0.5">{item.sku}</span>}

              {/* ── Zona de Status — altura fixa min-h-[28px] ── */}
              <div className="min-h-[28px] flex items-center">
                {/* GREEN: vinculado ao master */}
                {category === 'green' && (() => {
                  const mapping = productMappings?.find(m =>
                    m.supplierSku === item.sku || m.supplierProductNameNormalized === normForMapping(item.name)
                  );
                  const linkedName = masterProducts?.find(p => p.sku === mapping?.targetSku)?.name ?? mapping?.targetName;
                  return (
                    <div className="flex items-center gap-1 text-[10px] text-emerald-600">
                      <CheckCircle className="w-2.5 h-2.5 shrink-0" />
                      <span className="truncate">{linkedName ?? '—'}</span>
                    </div>
                  );
                })()}

                {/* NOVELTY: inédito confirmado */}
                {category === 'novelty' && (
                  <div className="flex items-center gap-1.5 text-[10px] text-violet-400">
                    <Star className="w-2.5 h-2.5 shrink-0" />
                    <span>Produto inédito</span>
                    <button
                      onClick={() => toggleItemNovelty(batchId, idx, false)}
                      className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 text-slate-500 hover:text-slate-200 transition-all ml-1"
                      title="Desfazer — mover de volta para Desconhecidos">
                      <RotateCcw className="w-2.5 h-2.5" />
                    </button>
                  </div>
                )}

                {/* HIGH confidence suggestion (≥85%) */}
                {category !== 'green' && category !== 'novelty' && suggestionTier === 'high' && (
                  <div className="flex items-stretch w-full rounded overflow-hidden border border-emerald-800/50 text-[10px]">
                    <button
                      onClick={() => onAddMapping?.(item.name, suggestion!.sku, 'master', suggestion!.name, item.sku && item.sku !== 'S/N' ? item.sku : undefined)}
                      className="flex items-center gap-1.5 flex-1 px-1.5 py-1 bg-emerald-950/50 hover:bg-emerald-900/40 transition-colors text-left min-w-0"
                      title="Confirmar vínculo">
                      <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0" />
                      <span className="truncate flex-1 text-emerald-300">
                        <strong>{suggestion!.name}</strong>
                        <span className="text-emerald-700 ml-1">· {suggestion!.score}%</span>
                      </span>
                    </button>
                    <button onClick={() => setLinkingItem(item)}
                      className="px-2 py-1 bg-slate-800/60 hover:bg-slate-700 text-slate-400 hover:text-white shrink-0 transition-colors border-l border-emerald-800/30"
                      title="Ver mais opções"><Search className="w-3 h-3" /></button>
                    <button
                      onClick={() => setDismissedSuggestions(prev => new Set(prev).add(normForMapping(item.name)))}
                      className="px-2 py-1 bg-slate-800/60 hover:bg-slate-700 text-slate-500 hover:text-slate-200 shrink-0 transition-colors border-l border-emerald-800/30"
                      title="Pular"><X className="w-3 h-3" /></button>
                  </div>
                )}

                {/* LOW confidence suggestion (60–84%) */}
                {category !== 'green' && category !== 'novelty' && suggestionTier === 'low' && (
                  <div className="flex items-stretch w-full rounded overflow-hidden border border-amber-800/40 text-[10px]">
                    <button
                      onClick={() => onAddMapping?.(item.name, suggestion!.sku, 'master', suggestion!.name, item.sku && item.sku !== 'S/N' ? item.sku : undefined)}
                      className="flex items-center gap-1.5 flex-1 px-1.5 py-1 bg-amber-950/40 hover:bg-amber-900/50 transition-colors text-left min-w-0"
                      title="Aceitar sugestão">
                      <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                      <span className="truncate flex-1 text-amber-300">
                        <span className="text-slate-400">Sugestão: </span>
                        <strong className="text-amber-200">{suggestion!.name}</strong>
                        <span className="text-slate-600 ml-1">({suggestion!.score}%)</span>
                      </span>
                    </button>
                    <button onClick={() => setLinkingItem(item)}
                      className="px-2 py-1 bg-slate-800/60 hover:bg-slate-700 text-slate-400 hover:text-white shrink-0 transition-colors border-l border-amber-800/30"
                      title="Procurar outro"><Search className="w-3 h-3" /></button>
                    <button
                      onClick={() => setDismissedSuggestions(prev => new Set(prev).add(normForMapping(item.name)))}
                      className="px-2 py-1 bg-slate-800/60 hover:bg-slate-700/80 text-slate-500 hover:text-slate-200 shrink-0 transition-colors border-l border-amber-800/30"
                      title="Pular"><X className="w-3 h-3" /></button>
                  </div>
                )}

                {category !== 'green' && category !== 'novelty' && suggestionTier === 'none' && (
                  <div className="flex items-center gap-1.5 w-full text-[10px]">
                    <span className="text-slate-600">— Sem correspondência</span>
                    <button onClick={() => setLinkingItem(item)}
                      className="flex items-center gap-0.5 text-slate-500 hover:text-amber-400 transition-colors ml-auto"
                      title="Procurar manualmente"><Search className="w-3 h-3" /><span>Procurar</span></button>
                    <button onClick={() => toggleItemNovelty(batchId, idx, true)}
                      className="flex items-center gap-0.5 text-slate-500 hover:text-violet-400 transition-colors"
                      title="Marcar como produto inédito deste fornecedor"><Star className="w-3 h-3" /><span>Inédito</span></button>
                  </div>
                )}
              </div>
            </div>
          )}
        </td>

        {/* Lote */}
        <td className="px-2 py-1.5 text-center w-16">
          <input type="number" min="1" value={item.packQuantity}
            onChange={(e) => updateItemPackQuantityLocal(idx, parseInt(e.target.value) || 1)}
            onBlur={() => flushItemPackQuantity(idx)}
            className={`w-14 bg-slate-800 border rounded px-1 py-1 text-center text-sm font-bold focus:border-amber-500 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none transition-colors ${item.isAiSuggested ? 'border-indigo-500/50 text-indigo-300 ring-1 ring-indigo-500/20' : 'border-slate-700 text-white'}`}
            title={item.isAiSuggested ? 'Sugerido pela IA' : ''} />
        </td>

        {/* Estratégia */}
        <td className="px-2 py-1.5 text-center w-14">
          <div className="flex items-center justify-center gap-0.5 bg-slate-950/50 p-0.5 rounded border border-slate-800">
            <button onClick={() => updateItemStrategy(batchId, idx, 'pack')}
              className={`p-1 rounded transition-all ${(!item.priceStrategy || item.priceStrategy === 'pack') ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-white'}`}
              title="Preço é do lote/caixa"><BoxSelect className="w-3 h-3" /></button>
            <button onClick={() => updateItemStrategy(batchId, idx, 'unit')}
              className={`p-1 rounded transition-all ${item.priceStrategy === 'unit' ? 'bg-amber-500 text-white' : 'text-slate-500 hover:text-white'}`}
              title="Preço é por unidade"><Coins className="w-3 h-3" /></button>
          </div>
        </td>

        {/* Preço lote */}
        <td className="px-2 py-1.5 text-right w-24">
          <input type="number" min="0" step="0.01" value={item.price.toFixed(2)}
            onChange={(e) => updateItemPriceLocal(idx, parseFloat(e.target.value) || 0)}
            onBlur={() => flushItemPrice(idx)}
            className="w-20 bg-slate-800 border border-slate-700 rounded px-1 py-1 text-right text-sm text-slate-300 font-medium focus:border-amber-500 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
        </td>

        {/* Preço unitário */}
        <td className="px-2 py-1.5 text-right w-20">
          <span className="font-bold text-amber-400 text-sm">R$ {item.unitPrice.toFixed(2)}</span>
        </td>

        {/* Ações */}
        <td className="px-2 py-1.5 text-center w-20">
          <div className="flex items-center justify-center gap-0.5">
            {getItemCategory(item) !== 'green' && (
              <button onClick={() => setLinkingItem(item)}
                className="text-slate-600 hover:text-amber-400 p-1.5 rounded hover:bg-amber-950/20 transition-all"
                title="Vincular ao catálogo master">
                <Link2 className="w-3.5 h-3.5" />
              </button>
            )}
            {getItemCategory(item) === 'green' && (
              <button onClick={() => onRemoveMapping?.(item.name)}
                className="text-slate-700 hover:text-orange-400 p-1.5 rounded hover:bg-orange-950/20 opacity-0 group-hover:opacity-100 transition-all"
                title="Remover vínculo com catálogo master">
                <Unlink className="w-3.5 h-3.5" />
              </button>
            )}
            <button onClick={() => handleRequestAction('ban', batchId, idx, item.name)}
              className="text-slate-700 hover:text-red-500 p-1.5 rounded hover:bg-red-950/20 opacity-0 group-hover:opacity-100 transition-all"
              title="Bloquear item"><Ban className="w-3.5 h-3.5" /></button>
            <button onClick={() => handleRequestAction('delete', batchId, idx, item.name)}
              className="text-slate-700 hover:text-red-500 p-1.5 rounded hover:bg-red-950/20 opacity-0 group-hover:opacity-100 transition-all"
              title="Remover item"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        </td>
      </tr>
    );
  };

  // ── Batch status (derived) ─────────────────────────────────────────────────
  const isDirty = useMemo(() => {
    const snap = batchSnapshot.current;
    return (
      JSON.stringify(viewingBatch.items) !== JSON.stringify(snap.items) ||
      viewingBatch.timestamp !== snap.timestamp
    );
  }, [viewingBatch.items, viewingBatch.timestamp]);
  const batchStatus: 'draft' | 'saved' | 'dirty' =
    !viewingBatch.isSaved ? 'draft' : isDirty ? 'dirty' : 'saved';

  // ── Link product handler ─────────────────────────────────────────────────────
  const handleLinkProduct = (normalizedName: string, targetSku: string, targetType: 'master' | 'supplier', targetName: string) => {
    const supplierSku = linkingItem?.sku && linkingItem.sku !== 'S/N' ? linkingItem.sku : undefined;
    onAddMapping?.(normalizedName, targetSku, targetType, targetName, supplierSku);
    setLinkingItem(null);
  };

  // ── Filtered + sorted items (memoised — evita re-sort em cada render) ────────
  const filteredItems = useMemo(() =>
    viewingBatch.items
      .map((it, idx) => ({ item: it, originalIndex: idx }))
      .filter(x => {
        if (!detailsSearchTerm) return true;
        const tokens = detailsSearchTerm.toLowerCase().split(/\s+/).filter(t => t);
        const n = x.item.name.toLowerCase();
        const s = (x.item.sku || '').toLowerCase();
        return tokens.every(t => n.includes(t) || s.includes(t));
      })
      .sort((a, b) => {
        switch (detailsSortBy) {
          case 'name': return a.item.name.localeCompare(b.item.name);
          case 'price_asc': return a.item.unitPrice - b.item.unitPrice;
          case 'price_desc': return b.item.unitPrice - a.item.unitPrice;
          case 'pack': return b.item.packQuantity - a.item.packQuantity;
          default: return 0;
        }
      }),
  [viewingBatch.items, detailsSearchTerm, detailsSortBy]);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes progressFill {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }
      `}</style>

      {/* ── Link Product Modal ────────────────────────────────────────────────── */}
      {linkingItem && masterProducts && (
        <LinkProductModal
          item={linkingItem}
          supplier={supplier}
          masterProducts={masterProducts}
          onLink={handleLinkProduct}
          onClose={() => setLinkingItem(null)}
        />
      )}

      {/* ── Confirm Action Dialog ─────────────────────────────────────────────── */}
      {confirmAction && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center pointer-events-auto">
          <div className="absolute inset-0 bg-transparent" onClick={() => setConfirmAction(null)} />
          <div className="bg-slate-800 border border-slate-600 rounded-lg shadow-2xl p-4 w-72 transform transition-all animate-in fade-in zoom-in-95 relative z-10">
            <h4 className="font-bold text-white mb-1">
              {confirmAction.type === 'ban' ? 'Bloquear Item?' : 'Excluir Item?'}
            </h4>
            <p className="text-xs text-slate-400 mb-3 line-clamp-2">
              {confirmAction.type === 'ban'
                ? `Isso irá adicionar "${confirmAction.itemName}" à lista negra.`
                : `Isso removerá "${confirmAction.itemName}" desta cotação.`}
            </p>
            <div className="flex items-center gap-2 mb-3 cursor-pointer" onClick={() => setDontAskAgain(!dontAskAgain)}>
              <div className={`w-3 h-3 border rounded flex items-center justify-center ${dontAskAgain ? 'bg-amber-500 border-amber-500' : 'border-slate-500'}`}>
                {dontAskAgain && <Check className="w-2 h-2 text-slate-900" />}
              </div>
              <span className="text-[10px] text-slate-400">Não perguntar novamente nesta sessão</span>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmAction(null)} className="px-3 py-1.5 text-xs text-slate-300 hover:text-white">Cancelar</button>
              <button onClick={confirmPendingAction} className={`px-3 py-1.5 text-xs text-white rounded font-medium shadow-md ${confirmAction.type === 'ban' ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-600 hover:bg-slate-500'}`}>Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Unsaved Changes Dialog ────────────────────────────────────────────── */}
      {showUnsavedDialog && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center pointer-events-auto">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowUnsavedDialog(false)} />
          <div className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl p-5 w-80 relative z-10">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <h4 className="font-bold text-white text-sm">Alterações não salvas</h4>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Você fez alterações nesta cotação. O que deseja fazer?
            </p>
            <div className="flex flex-col gap-2">
              <button onClick={handleSaveAndClose} className="px-3 py-2 text-xs text-white bg-amber-600 hover:bg-amber-500 rounded-lg font-semibold flex items-center gap-2 transition-colors">
                <Save className="w-3.5 h-3.5" /> Salvar e fechar
              </button>
              <button onClick={handleDiscardAndClose} className="px-3 py-2 text-xs text-slate-200 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium flex items-center gap-2 transition-colors">
                <X className="w-3.5 h-3.5" /> Fechar sem salvar
              </button>
              <button onClick={() => setShowUnsavedDialog(false)} className="px-3 py-1.5 text-xs text-slate-400 hover:text-white text-center transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Detail Modal ──────────────────────────────────────────────────────────────── */}
      <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-slate-900 w-full max-w-5xl h-[92vh] rounded-none md:rounded-2xl border border-slate-700 flex flex-col overflow-hidden shadow-2xl transition-all duration-300">

          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-800/80 flex flex-col md:flex-row justify-between items-center bg-slate-800/40 backdrop-blur-md shrink-0 gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <h3 className="text-lg font-bold text-white tracking-tight">Detalhes da Cotação</h3>
                  <div className="flex items-center gap-1.5 bg-slate-700/50 px-2.5 py-1 rounded-full border border-slate-600/50">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-xs font-semibold text-slate-200">
                       {viewingBatch.items.filter(i => i.isVerified).length}/{viewingBatch.items.length} verificados
                    </span>
                  </div>
                  {batchStatus === 'draft' && (
                    <span className="text-[10px] bg-red-950/40 text-red-400 border border-red-900/40 px-2 py-0.5 rounded uppercase font-black tracking-tighter">
                      Rascunho
                    </span>
                  )}
                </div>
                
                <div className="flex items-center gap-2 mt-1.5">
                  <p className="text-xs text-slate-500 font-medium truncate max-w-[200px]">
                    {viewingBatch.sourceType === 'file' ? viewingBatch.fileName : 'Texto Importado'}
                  </p>
                  <span className="text-slate-700">·</span>
                  {editingBatchDate ? (
                    <div className="flex items-center gap-1">
                      <input type="datetime-local" value={tempBatchDate} onChange={e => setTempBatchDate(e.target.value)}
                        className="bg-slate-700 border border-amber-500 rounded px-1.5 py-0.5 text-white text-xs focus:outline-none" />
                      <button onClick={() => saveBatchDate(viewingBatch.id)} className="text-green-400 p-0.5"><Check className="w-3 h-3" /></button>
                      <button onClick={() => setEditingBatchDate(false)} className="text-red-400 p-0.5"><X className="w-3 h-3" /></button>
                    </div>
                  ) : (
                    <button onClick={() => startEditingBatchDate(viewingBatch)} className="flex items-center gap-1.5 text-slate-400 hover:text-amber-400 transition-all group/date">
                      <Calendar className="w-3 h-3" />
                      <span className="text-xs">{new Date(viewingBatch.timestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      <Pencil className="w-2.5 h-2.5 opacity-0 group-hover/date:opacity-100 transition-opacity" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2.5 flex-wrap">
                <select value={detailsSortBy} onChange={e => setDetailsSortBy(e.target.value as typeof detailsSortBy)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-amber-500/50 hover:border-slate-600 transition-colors">
                  <option value="default">Ordem original</option>
                  <option value="name">Nome A→Z</option>
                  <option value="price_asc">Preço ↑</option>
                  <option value="price_desc">Preço ↓</option>
                  <option value="pack">Lote ↓</option>
                </select>

                <div className="relative">
                  <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-500" />
                  <input type="text" placeholder="Filtrar itens..." value={detailsSearchTerm} onChange={e => setDetailsSearchTerm(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg py-1.5 pl-8 pr-3 text-xs text-white w-40 focus:border-amber-500/50 focus:outline-none focus:w-56 transition-all" />
                </div>

                <div className="w-px h-6 bg-slate-700/50 mx-1" />

                <button onClick={handleClose} className="text-slate-500 hover:text-white transition-colors">
                  <XCircle className="w-7 h-7" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="overflow-auto flex-1 bg-[#0b0e14] custom-scrollbar">
              <div className="p-6 space-y-8">
                {(() => {
                  const inspectionItems = filteredItems.filter(x => getItemCategory(x.item) === 'inspection');
                  const yellowItems = filteredItems.filter(x => getItemCategory(x.item) === 'yellow');
                  const blueItems = filteredItems.filter(x => getItemCategory(x.item) === 'blue');
                  const greenItems = filteredItems.filter(x => getItemCategory(x.item) === 'green');
                  const noveltyItems = filteredItems.filter(x => getItemCategory(x.item) === 'novelty');
                  
                  const sectionTable = (items: typeof filteredItems, dividerColor: string, category: string) => {
                    const indices = items.map(p => p.originalIndex);
                    const isAllSelected = indices.length > 0 && indices.every(i => selectedPendingItems.has(i));
                    
                    return (
                      <table className="w-full text-left text-sm text-slate-300">
                        <thead className={`${dividerColor.replace('divide-', 'bg-')}/5 text-[10px] uppercase font-bold tracking-widest text-slate-500 border-b ${dividerColor}`}>
                          <tr>
                            <th className="p-2 text-center w-10">
                              <button onClick={() => toggleSelectAllForCategory(indices)} className="hover:text-amber-400 transition-colors">
                                {isAllSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                              </button>
                            </th>
                            <th className="p-2">Produto</th>
                            <th className="p-2 text-center w-20">Emb.</th>
                            <th className="p-2 text-center w-14">Modo</th>
                            <th className="p-2 text-right w-24">Lote (R$)</th>
                            <th className="p-2 text-right w-24">Unit. (R$)</th>
                            <th className="p-2 text-center w-28">Ações</th>
                          </tr>
                        </thead>
                        <tbody className={`divide-y ${dividerColor}`}>
                          {items.map(x => renderItemRow(x.item, x.originalIndex, viewingBatch.id))}
                        </tbody>
                      </table>
                    );
                  };

                  return (
                    <>
                      {/* SECTION: INSPEÇÃO */}
                      {inspectionItems.length > 0 && (
                        <div className="rounded-xl overflow-hidden border border-orange-900/30 bg-orange-950/5">
                          <div className="p-3.5 bg-orange-950/20 flex justify-between items-center cursor-pointer" onClick={() => setCollapsedSections(prev => ({ ...prev, inspection: !prev.inspection }))}>
                            <h4 className="font-bold text-orange-400 flex items-center gap-2.5 text-sm uppercase tracking-tight">
                              <ShieldAlert className="w-4 h-4" /> Inspeção Humana ({inspectionItems.length})
                            </h4>
                            <ChevronDown className={`w-4 h-4 text-orange-700 transition-transform ${collapsedSections.inspection ? '-rotate-90' : ''}`} />
                          </div>
                          {!collapsedSections.inspection && sectionTable(inspectionItems, 'divide-orange-900/20', 'inspection')}
                        </div>
                      )}

                      {/* SECTION: NOVOS / DESCONHECIDOS */}
                      <div className="rounded-xl overflow-hidden border border-yellow-900/30 bg-yellow-950/5">
                        <div className="p-3.5 bg-yellow-950/20 flex justify-between items-center cursor-pointer" onClick={() => setCollapsedSections(prev => ({ ...prev, yellow: !prev.yellow }))}>
                          <h4 className="font-bold text-yellow-400 flex items-center gap-2.5 text-sm uppercase tracking-tight">
                            <AlertTriangle className="w-4 h-4" /> Desconhecidos ({yellowItems.length})
                          </h4>
                          <ChevronDown className={`w-4 h-4 text-yellow-700 transition-transform ${collapsedSections.yellow ? '-rotate-90' : ''}`} />
                        </div>
                        {!collapsedSections.yellow && (
                          yellowItems.length === 0 
                          ? <div className="p-10 text-center text-slate-600 text-xs italic">Tudo limpo nesta categoria.</div>
                          : sectionTable(yellowItems, 'divide-yellow-900/20', 'yellow')
                        )}
                      </div>

                      {/* SECTION: RECONHECIDOS */}
                      <div className="rounded-xl overflow-hidden border border-blue-900/20 bg-blue-950/5">
                        <div className="p-3.5 bg-blue-950/20 flex justify-between items-center cursor-pointer" onClick={() => setCollapsedSections(prev => ({ ...prev, blue: !prev.blue }))}>
                          <h4 className="font-bold text-blue-400 flex items-center gap-2.5 text-sm uppercase tracking-tight">
                            <Eye className="w-4 h-4" /> Reconhecidos ({blueItems.length})
                          </h4>
                          <ChevronDown className={`w-4 h-4 text-blue-700 transition-transform ${collapsedSections.blue ? '-rotate-90' : ''}`} />
                        </div>
                        {!collapsedSections.blue && (
                          blueItems.length === 0 
                          ? <div className="p-10 text-center text-slate-600 text-xs italic">Nenhum item pendente.</div>
                          : sectionTable(blueItems, 'divide-blue-900/20', 'blue')
                        )}
                      </div>

                      {/* SECTION: LINKADOS */}
                      <div className="rounded-xl overflow-hidden border border-emerald-900/20 bg-emerald-950/5 opacity-80 hover:opacity-100 transition-opacity">
                        <div className="p-3.5 bg-emerald-950/20 flex justify-between items-center cursor-pointer" onClick={() => setCollapsedSections(prev => ({ ...prev, green: !prev.green }))}>
                          <h4 className="font-bold text-emerald-400 flex items-center gap-2.5 text-sm uppercase tracking-tight">
                            <CheckCircle className="w-4 h-4" /> Mapeados ao Catálogo ({greenItems.length})
                          </h4>
                          <ChevronDown className={`w-4 h-4 text-emerald-700 transition-transform ${collapsedSections.green ? '-rotate-90' : ''}`} />
                        </div>
                        {!collapsedSections.green && sectionTable(greenItems, 'divide-emerald-900/20', 'green')}
                      </div>

                      {/* SECTION: INÉDITOS */}
                      {noveltyItems.length > 0 && (
                         <div className="rounded-xl overflow-hidden border border-violet-900/20 bg-violet-950/5">
                          <div className="p-3.5 bg-violet-950/20 flex justify-between items-center cursor-pointer" onClick={() => setCollapsedSections(prev => ({ ...prev, novelties: !prev.novelties }))}>
                            <h4 className="font-bold text-violet-400 flex items-center gap-2.5 text-sm uppercase tracking-tight">
                              <Star className="w-4 h-4" /> Inéditos ({noveltyItems.length})
                            </h4>
                            <ChevronDown className={`w-4 h-4 text-violet-700 transition-transform ${collapsedSections.novelties ? '-rotate-90' : ''}`} />
                          </div>
                          {!collapsedSections.novelties && sectionTable(noveltyItems, 'divide-violet-900/20', 'novelty')}
                         </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Main Footer */}
            <div className="p-5 border-t border-slate-800 bg-slate-800/80 flex justify-between items-center shrink-0">
               <div className="flex items-center gap-6">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">Total de Itens</span>
                    <span className="text-sm font-bold text-white">{viewingBatch.items.length}</span>
                  </div>
                  <div className="flex flex-col border-l border-slate-700 pl-6">
                    <span className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">Valor Total Estimado</span>
                    <span className="text-sm font-bold text-amber-500">
                       R$ {viewingBatch.items.reduce((acc, it) => acc + (it.priceStrategy === 'pack' ? it.price : it.price * it.packQuantity), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
               </div>

               <div className="flex items-center gap-3">
                  <button onClick={handleClose} className="px-5 py-2 text-xs font-bold text-slate-400 hover:text-white transition-colors">Cancelar</button>
                  <button onClick={saveBatch} 
                    disabled={batchStatus === 'saved'}
                    className={`flex items-center gap-2 px-8 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-xl ${
                    batchStatus === 'saved'
                      ? 'bg-emerald-950/30 text-emerald-500 border border-emerald-900/40 cursor-default'
                      : 'bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-900 shadow-amber-900/20 active:scale-95'
                  }`}>
                    <Save className="w-4 h-4" />
                    {batchStatus === 'saved' ? 'Salvo no Banco' : 'Confirmar e Salvar'}
                  </button>
               </div>
            </div>
          </div>
        </div>
    </>
  );
};

export default QuoteDetailModal;
