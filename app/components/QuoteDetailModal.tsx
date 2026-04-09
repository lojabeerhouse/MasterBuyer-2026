import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Supplier, QuoteBatch, ProductQuote, ProductMapping, MasterProduct } from '../types';
import {
  Trash2, CheckCircle, Loader2, Ban, Pencil, Save, X, XCircle, RefreshCw,
  Coins, BoxSelect, Sparkles, ChevronLeft, ChevronRight, Wand2, ChevronDown,
  ChevronUp, AlertTriangle, Check, CheckSquare, Square, Search, Bot, Eye, Link2, Unlink,
  Star, RotateCcw, ShieldAlert,
} from 'lucide-react';
import { generateProductVariations, batchSmartIdentify } from '../services/geminiService';
import { normalizeProductName, normForMapping, findMasterProductMatches } from '../services/supplierCatalogService';
import LinkProductModal from './LinkProductModal';

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
  // Prevents re-render cascade (setSuppliers → Firebase) on every keystroke
  const [draftQty, setDraftQty] = useState<Record<number, number>>({});
  const [draftPrice, setDraftPrice] = useState<Record<number, number>>({});

  // ── AI Suggestions ───────────────────────────────────────────────────────────
  const [suggestionsMap, setSuggestionsMap] = useState<Record<string, string[]>>({});
  const [suggestionIndexMap, setSuggestionIndexMap] = useState<Record<string, number>>({});
  const [loadingSuggestions, setLoadingSuggestions] = useState<Set<string>>(new Set());

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

  // Reset selection and lazy suggestions when batch id changes
  useEffect(() => {
    setSelectedPendingItems(new Set());
    setDetailsSearchTerm('');
    setRevealedSuggestions(new Map());
    computedSuggestionIdxs.current = new Set();
  }, [viewingBatch.id]);

  // ── Helper: sync items to parent suppliers state ─────────────────────────────
  const updateGlobalItems = (batchId: string, newItems: ProductQuote[]) => {
    setSuppliers(prev => prev.map(s => {
      if (s.id !== supplierId) return s;
      return { ...s, quotes: s.quotes.map(q => q.id !== batchId ? q : { ...q, items: newItems }) };
    }));
  };

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
    setSuppliers(prev => prev.map(s => {
      if (s.id !== supplierId) return s;
      return { ...s, quotes: s.quotes.map(q => q.id === viewingBatch.id ? { ...q, isSaved: true, savedAt: now } : q) };
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
    const snap = batchSnapshot.current;
    setSuppliers(prev => prev.map(s => {
      if (s.id !== supplierId) return s;
      return { ...s, quotes: s.quotes.map(q => q.id === snap.id ? snap : q) };
    }));
    onClose();
  };

  // ── Item deletion ────────────────────────────────────────────────────────────
  const deleteItemFromBatch = (batchId: string, itemIndex: number) => {
    setSuppliers(prev => prev.map(s => {
      if (s.id !== supplierId) return s;
      return {
        ...s,
        quotes: s.quotes.map(q => {
          if (q.id !== batchId) return q;
          return { ...q, items: q.items.filter((_, idx) => idx !== itemIndex) };
        })
      };
    }));
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
    if (suggestionsMap[key]) cancelSuggestion(viewingBatch.id, index);
  };

  const saveItemName = (batchId: string, itemIndex: number, newName: string) => {
    const updatedItems = viewingBatch.items.map((item, idx) =>
      idx === itemIndex ? { ...item, name: newName } : item
    );
    setViewingBatch(prev => ({ ...prev, items: updatedItems }));
    updateGlobalItems(batchId, updatedItems);
    setEditingItemId(null);
  };

  // ── AI Suggestions ───────────────────────────────────────────────────────────
  const fetchSuggestions = async (batchId: string, itemIndex: number, currentName: string, forceRefresh = false) => {
    const key = `${batchId}-${itemIndex}`;
    if (suggestionsMap[key] && !forceRefresh) return;
    setLoadingSuggestions(prev => new Set(prev).add(key));
    try {
      const variations = await generateProductVariations(currentName);
      if (variations.length > 0) {
        setSuggestionsMap(prev => ({ ...prev, [key]: variations }));
        setSuggestionIndexMap(prev => ({ ...prev, [key]: 0 }));
      } else {
        if (!forceRefresh) alert('Não encontrei sugestões para este produto.');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSuggestions(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const cycleSuggestion = (batchId: string, itemIndex: number, direction: 'prev' | 'next') => {
    const key = `${batchId}-${itemIndex}`;
    const list = suggestionsMap[key] || [];
    if (list.length === 0) return;
    setSuggestionIndexMap(prev => {
      const current = prev[key] || 0;
      let next = direction === 'next' ? current + 1 : current - 1;
      if (next >= list.length) next = 0;
      if (next < 0) next = list.length - 1;
      return { ...prev, [key]: next };
    });
  };

  const applySuggestion = (batchId: string, itemIndex: number) => {
    const key = `${batchId}-${itemIndex}`;
    const list = suggestionsMap[key];
    const idx = suggestionIndexMap[key] || 0;
    if (list && list[idx]) {
      saveItemName(batchId, itemIndex, list[idx]);
      cancelSuggestion(batchId, itemIndex);
    }
  };

  const cancelSuggestion = (batchId: string, itemIndex: number) => {
    const key = `${batchId}-${itemIndex}`;
    const next = { ...suggestionsMap };
    delete next[key];
    setSuggestionsMap(next);
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

  const toggleSelectAll = (allIndices: number[]) => {
    if (allIndices.every(i => selectedPendingItems.has(i))) {
      setSelectedPendingItems(new Set());
    } else {
      setSelectedPendingItems(new Set(allIndices));
    }
  };

  // ── Batch Magic (AI identify) ─────────────────────────────────────────────────
  const handleBatchMagic = async (batchId: string, pendingItems: { item: ProductQuote; originalIndex: number }[]) => {
    const itemsToProcess = pendingItems.filter(pi => selectedPendingItems.has(pi.originalIndex));
    if (itemsToProcess.length === 0) {
      alert('Selecione pelo menos um item da lista para identificar.');
      return;
    }
    setIsBatchProcessing(true);
    const payload = itemsToProcess.map(pi => ({ index: pi.originalIndex, name: pi.item.name, price: pi.item.price }));
    try {
      const results = await batchSmartIdentify(payload);
      const newItems = [...viewingBatch.items];
      results.forEach(res => {
        if (newItems[res.index]) {
          const oldItem = newItems[res.index];
          const newQty = res.suggestedPackQty || oldItem.packQuantity;
          newItems[res.index] = {
            ...oldItem,
            name: res.suggestedName || oldItem.name,
            packQuantity: newQty,
            isVerified: newQty > 1,
            isReprocessed: false,
            unitPrice: oldItem.priceStrategy === 'unit' ? oldItem.price : oldItem.price / newQty,
          };
        }
      });
      setViewingBatch(prev => ({ ...prev, items: newItems }));
      updateGlobalItems(batchId, newItems);
      setSelectedPendingItems(new Set());
    } catch (e) {
      console.error(e);
      alert('Erro na identificação em massa.');
    } finally {
      setIsBatchProcessing(false);
    }
  };

  // ── Item recalculation ───────────────────────────────────────────────────────
  const recalculateItem = (item: ProductQuote, newStrategy?: 'pack' | 'unit', newPackQty?: number): ProductQuote => {
    const strategy = newStrategy || item.priceStrategy || 'pack';
    const qty = newPackQty !== undefined ? newPackQty : item.packQuantity;
    const unitPrice = strategy === 'unit' ? item.price : item.price / (qty || 1);
    return { ...item, priceStrategy: strategy, packQuantity: qty, unitPrice, isVerified: qty > 1 ? true : item.isVerified };
  };

  const updateItemStrategy = (batchId: string, itemIndex: number, newStrategy: 'pack' | 'unit') => {
    const updatedItems = viewingBatch.items.map((item, idx) =>
      idx === itemIndex ? recalculateItem(item, newStrategy) : item
    );
    setViewingBatch(prev => ({ ...prev, items: updatedItems }));
    updateGlobalItems(batchId, updatedItems);
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

  // onBlur: flushes local state to global (triggers parent re-render + eventual Firebase save)
  const flushItemPackQuantity = (batchId: string, itemIndex: number) => {
    setDraftQty(prev => { const n = { ...prev }; delete n[itemIndex]; return n; });
    updateGlobalItems(batchId, viewingBatch.items);
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
        return { ...item, price: safePrice, unitPrice };
      }),
    }));
  };

  // onBlur: flushes to global
  const flushItemPrice = (batchId: string, itemIndex: number) => {
    setDraftPrice(prev => { const n = { ...prev }; delete n[itemIndex]; return n; });
    updateGlobalItems(batchId, viewingBatch.items);
  };


  const toggleItemNovelty = (batchId: string, itemIndex: number, value: boolean) => {
    const updatedItems = viewingBatch.items.map((item, idx) =>
      idx === itemIndex ? { ...item, isNovelty: value } : item
    );
    setViewingBatch(prev => ({ ...prev, items: updatedItems }));
    updateGlobalItems(batchId, updatedItems);
  };

  const toggleItemVerification = (batchId: string, itemIndex: number) => {
    const updatedItems = viewingBatch.items.map((item, idx) => {
      if (idx !== itemIndex) return item;
      return { ...item, isVerified: !item.isVerified, isReprocessed: !item.isVerified ? false : item.isReprocessed };
    });
    setViewingBatch(prev => ({ ...prev, items: updatedItems }));
    updateGlobalItems(batchId, updatedItems);
  };

  const updateBatchStrategy = (batchId: string, newStrategy: 'pack' | 'unit') => {
    const updatedItems = viewingBatch.items.map(item => recalculateItem(item, newStrategy));
    setViewingBatch(prev => ({ ...prev, items: updatedItems }));
    updateGlobalItems(batchId, updatedItems);
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
    const suggestKey = `${batchId}-${idx}`;
    const suggestions = suggestionsMap[suggestKey] || [];
    const currentSuggestIdx = suggestionIndexMap[suggestKey] || 0;
    const isLoadingSuggestions = loadingSuggestions.has(suggestKey);
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
            {!isVerified && suggestionTier === 'none' && (
              <input type="checkbox" checked={isSelected} onChange={() => toggleSelection(idx)}
                className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-800 text-amber-600 cursor-pointer" />
            )}
            {!isVerified && suggestionTier === 'high' && (
              <CheckCircle className="w-3.5 h-3.5 text-emerald-500" title="Alta confiança de correspondência" />
            )}
            {!isVerified && suggestionTier === 'low' && (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" title="Sugestão de baixa confiança" />
            )}
            {isReprocessed && (
              <span className="text-blue-400 cursor-help" title="Lote ajustado automaticamente por regra de embalagem">
                <Bot className="w-3.5 h-3.5" />
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
              {suggestions.length > 0 ? (
                <div className="flex items-center gap-1.5 bg-amber-900/20 border border-amber-900/50 p-1 rounded mb-1">
                  <button onClick={() => cancelSuggestion(batchId, idx)} className="text-red-400 p-0.5"><X className="w-3 h-3" /></button>
                  <button onClick={() => cycleSuggestion(batchId, idx, 'prev')} className="text-amber-500"><ChevronLeft className="w-3.5 h-3.5" /></button>
                  <button onClick={() => applySuggestion(batchId, idx)} className="flex-1 text-center font-bold text-amber-400 hover:text-white text-xs px-1 rounded hover:bg-amber-600">
                    {suggestions[currentSuggestIdx]}
                  </button>
                  <button onClick={() => cycleSuggestion(batchId, idx, 'next')} className="text-amber-500"><ChevronRight className="w-3.5 h-3.5" /></button>
                  <button onClick={() => fetchSuggestions(batchId, idx, item.name, true)} className="text-blue-400 p-0.5"><RefreshCw className="w-3 h-3" /></button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 group/edit mb-0.5">
                  <span className={`text-sm font-medium leading-tight ${!item.isVerified ? 'text-amber-100' : 'text-white'}`}>{item.name}</span>
                  <div className="opacity-0 group-hover/edit:opacity-100 flex items-center gap-0.5 transition-opacity shrink-0">
                    <button onClick={() => startEditingItem(idx, item.name)} className="text-slate-600 hover:text-blue-400 p-0.5 rounded" title="Editar nome"><Pencil className="w-3 h-3" /></button>
                    <button onClick={() => fetchSuggestions(batchId, idx, item.name)} className="text-slate-600 hover:text-amber-400 p-0.5 rounded" disabled={isLoadingSuggestions} title="Sugerir nome com IA">
                      {isLoadingSuggestions ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
              )}
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

                {/* NO match */}
                {category !== 'green' && category !== 'novelty' && suggestionTier === 'none' && !isLoadingSuggestions && (
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

                {/* Loading state */}
                {category !== 'green' && category !== 'novelty' && isLoadingSuggestions && (
                  <div className="flex items-center gap-1 text-[10px] text-slate-600">
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    <span>Buscando correspondência...</span>
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
            onBlur={() => flushItemPackQuantity(batchId, idx)}
            className="w-14 bg-slate-800 border border-slate-700 rounded px-1 py-1 text-center text-sm font-bold text-white focus:border-amber-500 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
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
            onBlur={() => flushItemPrice(batchId, idx)}
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
  const snap = batchSnapshot.current;
  const isDirty =
    JSON.stringify(viewingBatch.items) !== JSON.stringify(snap.items) ||
    viewingBatch.timestamp !== snap.timestamp;
  const batchStatus: 'draft' | 'saved' | 'dirty' =
    !viewingBatch.isSaved ? 'draft' : isDirty ? 'dirty' : 'saved';

  // ── Link product handler ─────────────────────────────────────────────────────
  const handleLinkProduct = (normalizedName: string, targetSku: string, targetType: 'master' | 'supplier', targetName: string) => {
    const supplierSku = linkingItem?.sku && linkingItem.sku !== 'S/N' ? linkingItem.sku : undefined;
    onAddMapping?.(normalizedName, targetSku, targetType, targetName, supplierSku);
    setLinkingItem(null);
  };

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

      {/* ── Detail Modal ──────────────────────────────────────────────────────── */}
      <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-slate-900 w-full max-w-6xl max-h-[90vh] rounded-xl border border-slate-700 flex flex-col shadow-2xl">

          {/* Header */}
          <div className="p-3 border-b border-slate-700 flex flex-col md:flex-row justify-between items-start bg-slate-800 rounded-t-xl shrink-0 gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-white">Detalhes da Cotação</h3>
                <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">
                  ✓ {viewingBatch.items.filter(i => i.isVerified).length}/{viewingBatch.items.length}
                </span>
                {batchStatus === 'draft' && (
                  <span className="text-xs bg-red-950/50 text-red-400 border border-red-900/50 px-2 py-0.5 rounded-full font-bold tracking-wide">
                    ● RASCUNHO — NÃO INSERIDO NO HISTÓRICO
                  </span>
                )}
                {batchStatus === 'saved' && (
                  <span className="text-xs bg-emerald-900/30 text-emerald-400 border border-emerald-900/40 px-2 py-0.5 rounded-full">
                    ✓ INSERIDO NO HISTÓRICO
                  </span>
                )}
                {batchStatus === 'dirty' && (
                  <span className="text-xs bg-amber-950/50 text-amber-400 border border-amber-900/50 px-2 py-0.5 rounded-full font-bold">
                    ⚠ ALTERAÇÕES PENDENTES
                  </span>
                )}
              </div>
              {/* Data editável */}
              <div className="flex items-center gap-1.5 mt-1">
                <p className="text-xs text-slate-500 truncate">
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
                  <>
                    <button onClick={() => startEditingBatchDate(viewingBatch)} className="flex items-center gap-1 text-slate-400 hover:text-amber-400 transition-colors group/date">
                      <span className="text-xs">{new Date(viewingBatch.timestamp).toLocaleString('pt-BR')}</span>
                      <Pencil className="w-2.5 h-2.5 opacity-0 group-hover/date:opacity-100 transition-opacity" />
                    </button>
                    {viewingBatch.uploadedAt && viewingBatch.uploadedAt !== viewingBatch.timestamp && (
                      <span className="text-[9px] text-slate-700 ml-1">
                        · upload: {new Date(viewingBatch.uploadedAt).toLocaleString('pt-BR')}
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap justify-end">
              {/* Ordenação */}
              <select value={detailsSortBy} onChange={e => setDetailsSortBy(e.target.value as typeof detailsSortBy)}
                className="bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-amber-500">
                <option value="default">Ordem original</option>
                <option value="name">Nome A→Z</option>
                <option value="price_asc">Preço ↑</option>
                <option value="price_desc">Preço ↓</option>
                <option value="pack">Lote ↓</option>
              </select>
              {/* Estratégia em lote */}
              <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded border border-slate-700">
                <button onClick={() => updateBatchStrategy(viewingBatch.id, 'pack')} className="flex items-center gap-1 px-2 py-1 rounded text-xs hover:bg-slate-700 text-blue-400 font-medium"><BoxSelect className="w-3 h-3" /> Lote</button>
                <div className="w-px h-3 bg-slate-700" />
                <button onClick={() => updateBatchStrategy(viewingBatch.id, 'unit')} className="flex items-center gap-1 px-2 py-1 rounded text-xs hover:bg-slate-700 text-amber-400 font-medium"><Coins className="w-3 h-3" /> Unit.</button>
              </div>
              {/* Busca */}
              <div className="relative">
                <Search className="absolute left-2 top-1.5 w-3.5 h-3.5 text-slate-500" />
                <input type="text" placeholder="Filtrar..." value={detailsSearchTerm} onChange={e => setDetailsSearchTerm(e.target.value)}
                  className="bg-slate-900 border border-slate-600 rounded py-1.5 pl-7 pr-3 text-xs text-white w-36 focus:border-amber-500 focus:outline-none focus:w-48 transition-all" />
              </div>
              {/* Botão Salvar — reativo ao status */}
              <div className="flex flex-col items-center">
                <button onClick={saveBatch}
                  disabled={batchStatus === 'saved'}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    batchStatus === 'saved'
                      ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-900/40 cursor-default'
                      : 'bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-900/30'
                  }`}>
                  <Save className="w-3.5 h-3.5" />
                  {batchStatus === 'saved' ? 'Salvo' : 'Salvar cotação'}
                </button>
                {batchStatus === 'saved' && viewingBatch.savedAt && (
                  <span className="text-[10px] text-slate-600 mt-0.5">
                    {new Date(viewingBatch.savedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
              {/* Fechar */}
              <button onClick={handleClose} className="text-slate-400 hover:text-white p-1.5">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="overflow-auto p-4 flex-1 space-y-6 bg-slate-900">
            {(() => {
              const filteredItems = viewingBatch.items
                .map((it, idx) => ({ item: it, originalIndex: idx }))
                .filter(x => {
                  if (!detailsSearchTerm) return true;
                  const term = detailsSearchTerm.toLowerCase();
                  return x.item.name.toLowerCase().includes(term) || x.item.sku.toLowerCase().includes(term);
                })
                .sort((a, b) => {
                  switch (detailsSortBy) {
                    case 'name': return a.item.name.localeCompare(b.item.name);
                    case 'price_asc': return a.item.unitPrice - b.item.unitPrice;
                    case 'price_desc': return b.item.unitPrice - a.item.unitPrice;
                    case 'pack': return b.item.packQuantity - a.item.packQuantity;
                    default: return 0;
                  }
                });

              const inspectionItems = filteredItems.filter(x => getItemCategory(x.item) === 'inspection');
              const yellowItems = filteredItems.filter(x => getItemCategory(x.item) === 'yellow');
              const blueItems = filteredItems.filter(x => getItemCategory(x.item) === 'blue');
              const greenItems = filteredItems.filter(x => getItemCategory(x.item) === 'green');
              const noveltyItems = filteredItems.filter(x => getItemCategory(x.item) === 'novelty');
              const allYellowIndices = yellowItems.map(p => p.originalIndex);
              const isAllSelected = allYellowIndices.length > 0 && allYellowIndices.every(i => selectedPendingItems.has(i));

              const sectionTable = (items: typeof filteredItems, dividerColor: string) => (
                <table className="w-full text-left text-sm text-slate-300">
                  <tbody className={`divide-y ${dividerColor}`}>
                    {items.map(x => renderItemRow(x.item, x.originalIndex, viewingBatch.id))}
                  </tbody>
                </table>
              );

              return (
                <>
                  {/* SECTION 0: INSPEÇÃO HUMANA — SKU match com nome divergente */}
                  {inspectionItems.length > 0 && (
                    <div className="border border-orange-800/40 bg-orange-950/10 rounded-lg overflow-hidden">
                      <div className="p-3 bg-orange-950/20 border-b border-orange-800/40 flex justify-between items-center cursor-pointer hover:bg-orange-950/30 transition-colors"
                        onClick={() => setCollapsedSections(prev => ({ ...prev, inspection: !prev.inspection }))}>
                        <h4 className="font-bold text-orange-400 flex items-center gap-2">
                          <ShieldAlert className="w-5 h-5" />
                          Inspeção Humana ({inspectionItems.length})
                          <span className="text-[10px] font-normal text-orange-600 border border-orange-800/50 rounded px-1.5 py-0.5">
                            SKU vinculado · nome divergente
                          </span>
                        </h4>
                        {collapsedSections.inspection ? <ChevronDown className="w-5 h-5 text-orange-500" /> : <ChevronUp className="w-5 h-5 text-orange-500" />}
                      </div>
                      {!collapsedSections.inspection && sectionTable(inspectionItems, 'divide-orange-900/10')}
                    </div>
                  )}

                  {/* SECTION 1: YELLOW — Novos / Desconhecidos */}
                  <div className="border border-yellow-900/30 bg-yellow-950/5 rounded-lg overflow-hidden">
                    <div className="p-3 bg-yellow-950/20 border-b border-yellow-900/30 flex justify-between items-center cursor-pointer hover:bg-yellow-950/30 transition-colors"
                      onClick={() => setCollapsedSections(prev => ({ ...prev, yellow: !prev.yellow }))}>
                      <h4 className="font-bold text-yellow-400 flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5" /> Novos / Desconhecidos ({yellowItems.length})
                      </h4>
                      <div className="flex items-center gap-2">
                        {yellowItems.length > 0 && !collapsedSections.yellow && (
                          <button onClick={(e) => { e.stopPropagation(); handleBatchMagic(viewingBatch.id, yellowItems); }}
                            disabled={isBatchProcessing || selectedPendingItems.size === 0}
                            className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-bold flex items-center gap-1 shadow-lg shadow-amber-900/20 disabled:opacity-50 disabled:cursor-not-allowed">
                            {isBatchProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3 fill-white" />}
                            {isBatchProcessing ? 'Processando...' : `Identificar Selecionados (${selectedPendingItems.size}) com IA`}
                          </button>
                        )}
                        {collapsedSections.yellow ? <ChevronDown className="w-5 h-5 text-yellow-500" /> : <ChevronUp className="w-5 h-5 text-yellow-500" />}
                      </div>
                    </div>
                    {!collapsedSections.yellow && (
                      yellowItems.length === 0
                        ? <div className="p-8 text-center text-slate-500 italic">Nenhum item desconhecido.</div>
                        : <table className="w-full text-left text-sm text-slate-300">
                          <thead className="bg-yellow-950/20 text-yellow-600 uppercase tracking-wider text-xs sticky top-0">
                            <tr>
                              <th className="p-3 text-center w-10">
                                <button onClick={() => toggleSelectAll(allYellowIndices)}>
                                  {isAllSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                                </button>
                              </th>
                              <th className="p-3">Produto</th>
                              <th className="p-3 text-center w-28">Emb. (Qtd)</th>
                              <th className="p-3 text-center">Interpretação</th>
                              <th className="p-3 text-right">Total Lote</th>
                              <th className="p-3 text-right w-32">Unitário</th>
                              <th className="p-3 text-center w-24">Ações</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-yellow-900/10">
                            {yellowItems.map(x => renderItemRow(x.item, x.originalIndex, viewingBatch.id))}
                          </tbody>
                        </table>
                    )}
                  </div>

                  {/* SECTION 2: BLUE — Reconhecidos / Não-Master */}
                  <div className="border border-blue-900/30 bg-blue-950/5 rounded-lg overflow-hidden">
                    <div className="p-3 bg-blue-950/20 border-b border-blue-900/30 flex justify-between items-center cursor-pointer hover:bg-blue-950/30 transition-colors"
                      onClick={() => setCollapsedSections(prev => ({ ...prev, blue: !prev.blue }))}>
                      <h4 className="font-bold text-blue-400 flex items-center gap-2">
                        <Eye className="w-5 h-5" /> Reconhecidos / Não-Master ({blueItems.length})
                      </h4>
                      {collapsedSections.blue ? <ChevronDown className="w-5 h-5 text-blue-500" /> : <ChevronUp className="w-5 h-5 text-blue-500" />}
                    </div>
                    {!collapsedSections.blue && (
                      blueItems.length === 0
                        ? <div className="p-4 text-center text-slate-500 italic text-xs">Nenhum item reconhecido sem vínculo master.</div>
                        : sectionTable(blueItems, 'divide-blue-900/10')
                    )}
                  </div>

                  {/* SECTION 3: GREEN — Linkados ao Master */}
                  <div className="border border-emerald-900/30 bg-emerald-950/5 rounded-lg overflow-hidden">
                    <div className="p-3 bg-emerald-950/20 border-b border-emerald-900/30 flex justify-between items-center cursor-pointer hover:bg-emerald-950/30 transition-colors"
                      onClick={() => setCollapsedSections(prev => ({ ...prev, green: !prev.green }))}>
                      <h4 className="font-bold text-emerald-400 flex items-center gap-2">
                        <CheckCircle className="w-5 h-5" /> Linkados ao Master ({greenItems.length})
                      </h4>
                      {collapsedSections.green ? <ChevronDown className="w-5 h-5 text-emerald-500" /> : <ChevronUp className="w-5 h-5 text-emerald-500" />}
                    </div>
                    {!collapsedSections.green && (
                      greenItems.length === 0
                        ? <div className="p-8 text-center text-slate-500 italic">Nenhum item linkado ao catálogo master ainda.</div>
                        : sectionTable(greenItems, 'divide-emerald-900/10')
                    )}
                  </div>

                  {/* SECTION 4: NOVELTIES — Produtos Inéditos confirmados */}
                  {noveltyItems.length > 0 && (
                    <div className="border border-violet-900/30 bg-violet-950/5 rounded-lg overflow-hidden">
                      <div className="p-3 bg-violet-950/20 border-b border-violet-900/30 flex justify-between items-center cursor-pointer hover:bg-violet-950/30 transition-colors"
                        onClick={() => setCollapsedSections(prev => ({ ...prev, novelties: !prev.novelties }))}>
                        <h4 className="font-bold text-violet-400 flex items-center gap-2">
                          <Star className="w-5 h-5" /> Novidades / Inéditos ({noveltyItems.length})
                          <span className="text-[10px] font-normal text-violet-600 border border-violet-800/50 rounded px-1.5 py-0.5">
                            classificados manualmente
                          </span>
                        </h4>
                        {collapsedSections.novelties ? <ChevronDown className="w-5 h-5 text-violet-500" /> : <ChevronUp className="w-5 h-5 text-violet-500" />}
                      </div>
                      {!collapsedSections.novelties && sectionTable(noveltyItems, 'divide-violet-900/10')}
                    </div>
                  )}
                </>
              );
            })()}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-700 bg-slate-800 rounded-b-xl flex justify-between items-center text-sm text-slate-400 shrink-0">
            <span>{viewingBatch.items.length} itens · ✓ {viewingBatch.items.filter(i => i.isVerified).length} verificados</span>
            <button onClick={handleClose} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm">Fechar</button>
          </div>
        </div>
      </div>
    </>
  );
};

export default QuoteDetailModal;
