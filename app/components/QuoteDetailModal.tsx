import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Supplier, QuoteBatch, ProductQuote, ProductMapping, MasterProduct, PackRule } from '../types';
import {
  Trash2, CheckCircle, Loader2, Ban, Pencil, Save, X, XCircle, RefreshCw,
  Coins, BoxSelect, Sparkles, AlertTriangle, Check, Search, Bot, Eye, Link2, Unlink,
  Star, RotateCcw, ShieldAlert, Calendar,
} from 'lucide-react';
import { batchSmartIdentify } from '../services/geminiService';
import { normalizeProductName, normForMapping, findMasterProductMatches } from '../services/compras/supplierCatalogService';
import { getItemCategory } from '../services/compras/itemCategorizationService';
import LinkProductModal from './LinkProductModal';
import { useSidebar } from '../contexts/RightSidebarContext';
import QuoteActionsPanel from './QuoteActionsPanel';
import ConfirmActionDialog from './compras/ConfirmActionDialog';
import UnsavedChangesDialog from './compras/UnsavedChangesDialog';
import QuoteSection from './compras/QuoteSection';
import ItemRow from './compras/ItemRow';

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
        idx === itemIndex ? { ...item, name: newName, isAiSuggested: false, isManuallyEdited: true } : item
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
      items: prev.items.map((item, idx) => idx === itemIndex ? { ...recalculateItem(item, newStrategy), isManuallyEdited: true } : item),
    }));
  };

  // onChange: updates local viewingBatch only (instant display, no global re-render)
  const updateItemPackQuantityLocal = (itemIndex: number, newQty: number) => {
    const safeQty = Math.max(1, newQty);
    setDraftQty(prev => ({ ...prev, [itemIndex]: safeQty }));
    setViewingBatch(prev => ({
      ...prev,
      items: prev.items.map((item, idx) => idx === itemIndex ? { ...recalculateItem(item, undefined, safeQty), isManuallyEdited: true } : item),
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
        return { ...item, price: safePrice, unitPrice, isAiSuggested: false, isManuallyEdited: true };
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
      items: prev.items.map((item, idx) => idx === itemIndex ? { ...item, isNovelty: value, isManuallyEdited: true } : item),
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
  const renderItemRow = (item: ProductQuote, idx: number, batchId: string) => (
    <ItemRow
      key={idx}
      item={item}
      idx={idx}
      batchId={batchId}
      isSelected={selectedPendingItems.has(idx)}
      rowAnimationType={animatingRows[`${batchId}-${idx}`]}
      isEditingName={editingItemId === idx}
      tempItemName={tempItemName}
      suggestion={revealedSuggestions.get(idx)}
      isDismissed={dismissedSuggestions.has(normForMapping(item.name))}
      productMappings={productMappings}
      masterProducts={masterProducts}
      seenNames={seenNames}
      setTempItemName={setTempItemName}
      setEditingItemId={setEditingItemId}
      setLinkingItem={setLinkingItem}
      setDismissedSuggestions={setDismissedSuggestions}
      toggleSelection={toggleSelection}
      startEditingItem={startEditingItem}
      saveItemName={saveItemName}
      updateItemPackQuantityLocal={updateItemPackQuantityLocal}
      flushItemPackQuantity={flushItemPackQuantity}
      updateItemStrategy={updateItemStrategy}
      updateItemPriceLocal={updateItemPriceLocal}
      flushItemPrice={flushItemPrice}
      toggleItemNovelty={toggleItemNovelty}
      handleRequestAction={handleRequestAction}
      computeSuggestionForItem={computeSuggestionForItem}
      onAddMapping={onAddMapping}
      onRemoveMapping={onRemoveMapping}
    />
  );

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
      <ConfirmActionDialog
        action={confirmAction}
        dontAskAgain={dontAskAgain}
        onConfirm={confirmPendingAction}
        onCancel={() => setConfirmAction(null)}
        onDontAskAgainChange={setDontAskAgain}
      />

      {/* ── Unsaved Changes Dialog ────────────────────────────────────────────── */}
      <UnsavedChangesDialog
        isOpen={showUnsavedDialog}
        onSaveAndClose={handleSaveAndClose}
        onDiscardAndClose={handleDiscardAndClose}
        onCancel={() => setShowUnsavedDialog(false)}
      />

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
                  const inspectionItems = filteredItems.filter(x => getItemCategory(x.item, productMappings, masterProducts, seenNames) === 'inspection');
                  const yellowItems = filteredItems.filter(x => getItemCategory(x.item, productMappings, masterProducts, seenNames) === 'yellow');
                  const blueItems = filteredItems.filter(x => getItemCategory(x.item, productMappings, masterProducts, seenNames) === 'blue');
                  const greenItems = filteredItems.filter(x => getItemCategory(x.item, productMappings, masterProducts, seenNames) === 'green');
                  const noveltyItems = filteredItems.filter(x => getItemCategory(x.item, productMappings, masterProducts, seenNames) === 'novelty');

                  return (
                    <>
                      {inspectionItems.length > 0 && (
                        <QuoteSection
                          title="Inspeção Humana"
                          count={inspectionItems.length}
                          icon={<ShieldAlert className="w-4 h-4" />}
                          colorVariant="orange"
                          isCollapsed={collapsedSections.inspection}
                          onToggle={() => setCollapsedSections(prev => ({ ...prev, inspection: !prev.inspection }))}
                          items={inspectionItems}
                          selectedItems={selectedPendingItems}
                          onToggleSelectAll={toggleSelectAllForCategory}
                          batchId={viewingBatch.id}
                          renderRow={renderItemRow}
                        />
                      )}

                      <QuoteSection
                        title="Desconhecidos"
                        count={yellowItems.length}
                        icon={<AlertTriangle className="w-4 h-4" />}
                        colorVariant="yellow"
                        isCollapsed={collapsedSections.yellow}
                        onToggle={() => setCollapsedSections(prev => ({ ...prev, yellow: !prev.yellow }))}
                        items={yellowItems}
                        selectedItems={selectedPendingItems}
                        onToggleSelectAll={toggleSelectAllForCategory}
                        batchId={viewingBatch.id}
                        renderRow={renderItemRow}
                        emptyMessage="Tudo limpo nesta categoria."
                      />

                      <QuoteSection
                        title="Reconhecidos"
                        count={blueItems.length}
                        icon={<Eye className="w-4 h-4" />}
                        colorVariant="blue"
                        isCollapsed={collapsedSections.blue}
                        onToggle={() => setCollapsedSections(prev => ({ ...prev, blue: !prev.blue }))}
                        items={blueItems}
                        selectedItems={selectedPendingItems}
                        onToggleSelectAll={toggleSelectAllForCategory}
                        batchId={viewingBatch.id}
                        renderRow={renderItemRow}
                        emptyMessage="Nenhum item pendente."
                      />

                      <QuoteSection
                        title="Mapeados ao Catálogo"
                        count={greenItems.length}
                        icon={<CheckCircle className="w-4 h-4" />}
                        colorVariant="emerald"
                        isCollapsed={collapsedSections.green}
                        onToggle={() => setCollapsedSections(prev => ({ ...prev, green: !prev.green }))}
                        items={greenItems}
                        selectedItems={selectedPendingItems}
                        onToggleSelectAll={toggleSelectAllForCategory}
                        batchId={viewingBatch.id}
                        renderRow={renderItemRow}
                      />

                      {noveltyItems.length > 0 && (
                        <QuoteSection
                          title="Inéditos"
                          count={noveltyItems.length}
                          icon={<Star className="w-4 h-4" />}
                          colorVariant="violet"
                          isCollapsed={collapsedSections.novelties}
                          onToggle={() => setCollapsedSections(prev => ({ ...prev, novelties: !prev.novelties }))}
                          items={noveltyItems}
                          selectedItems={selectedPendingItems}
                          onToggleSelectAll={toggleSelectAllForCategory}
                          batchId={viewingBatch.id}
                          renderRow={renderItemRow}
                        />
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
