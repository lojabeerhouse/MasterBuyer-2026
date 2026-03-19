import React, { useState, useEffect, useMemo } from 'react';
import {
  SupplierCatalog, SupplierCatalogProduct, MasterProduct,
  PriceValidityMode, HiddenProduct, Supplier,
} from '../types';
import {
  findMasterProductMatches, getValidPrice,
  confirmProductLink, removeProductLink,
  rejectLinkSuggestion, saveCatalog, processBatchIntoCatalog,
} from '../services/supplierCatalogService';
import {
  Search, Link, Unlink, Check, X, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  Clock, Snowflake, Globe, Calendar, TrendingUp, TrendingDown,
  Minus, BookOpen, AlertCircle, Package, EyeOff, RefreshCw, Loader2, History,
} from 'lucide-react';

// ─── FORMATTERS ──────────────────────────────────────────────────────────────
const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (ts: number) => new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
const searchNormalize = (str: string): string =>
  str.toLowerCase().replace(/ç/g, '\x00').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/\x00/g, 'ç');

// ─── INTERFACES ──────────────────────────────────────────────────────────────
interface SupplierCatalogViewProps {
  suppliers: Supplier[];
  catalogs: Record<string, SupplierCatalog>;
  masterProducts: MasterProduct[];
  uid: string;
  globalValidityDays: number;
  showInactive: boolean;
  hiddenProducts: HiddenProduct[];
  onCatalogUpdate: (catalog: SupplierCatalog) => void;
  onHideProduct: (product: SupplierCatalogProduct, supplierId: string, supplierName: string) => void;
  onUnhideProduct: (productId: string) => void;
}

// ─── LINK MODAL ──────────────────────────────────────────────────────────────
const LinkModal: React.FC<{
  product: SupplierCatalogProduct;
  masterProducts: MasterProduct[];
  onConfirm: (masterSku: string) => void;
  onClose: () => void;
}> = ({ product, masterProducts, onConfirm, onClose }) => {
  const [search, setSearch] = useState('');

  const suggestions = useMemo(
    () => findMasterProductMatches(product.name, masterProducts, 5),
    [product.name, masterProducts]
  );

  const filtered = useMemo(() => {
    if (!search) return suggestions;
    const s = searchNormalize(search);
    return masterProducts
      .filter(mp => searchNormalize(mp.name).includes(s) || searchNormalize(mp.sku).includes(s))
      .slice(0, 10)
      .map(mp => ({ sku: mp.sku, name: mp.name, score: 0 }));
  }, [search, suggestions, masterProducts]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border border-amber-600/40 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800 bg-amber-950/20">
          <Link className="w-5 h-5 text-amber-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-sm">Linkar produto</p>
            <p className="text-slate-400 text-xs truncate">{product.name}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white p-1 rounded transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text" placeholder="Buscar no meu catálogo..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-amber-500"
              autoFocus
            />
          </div>
          {!search && suggestions.length > 0 && (
            <p className="text-slate-500 text-xs">Sugestões automáticas por similaridade:</p>
          )}
          <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
            {filtered.length === 0
              ? <p className="text-slate-600 text-sm text-center py-6">Nenhum produto encontrado</p>
              : filtered.map(match => {
                const master = masterProducts.find(mp => mp.sku === match.sku);
                return (
                  <button key={match.sku} onClick={() => onConfirm(match.sku)}
                    className="w-full text-left bg-slate-800 hover:bg-amber-950/30 border border-slate-700 hover:border-amber-600/50 rounded-xl px-4 py-3 transition-all">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">{match.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-slate-500 text-xs">SKU: {match.sku}</span>
                          {master?.category && <span className="text-slate-600 text-xs">· {master.category.split('>>').pop()?.trim()}</span>}
                        </div>
                      </div>
                      {match.score > 0 && (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${
                          match.score >= 80 ? 'bg-emerald-900/40 text-emerald-400' :
                          match.score >= 60 ? 'bg-amber-900/40 text-amber-400' : 'bg-slate-700 text-slate-400'
                        }`}>{match.score}%</span>
                      )}
                    </div>
                  </button>
                );
              })
            }
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── HIDE CONFIRM MODAL ──────────────────────────────────────────────────────
const HideConfirmModal: React.FC<{
  product: SupplierCatalogProduct;
  onConfirm: () => void;
  onClose: () => void;
}> = ({ product, onConfirm, onClose }) => (
  <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
    <div className="relative bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-amber-900/30 border border-amber-800/40 flex items-center justify-center shrink-0">
          <EyeOff className="w-4 h-4 text-amber-400" />
        </div>
        <div>
          <p className="text-white font-semibold text-sm">Ocultar produto?</p>
          <p className="text-slate-400 text-xs">Este produto está linkado ao seu catálogo</p>
        </div>
      </div>
      <p className="text-slate-400 text-sm leading-relaxed">
        <span className="text-white font-medium">{product.masterProductName}</span> será ocultado no catálogo e no comparador em todos os fornecedores.
      </p>
      <div className="flex gap-2 pt-1">
        <button onClick={onClose}
          className="flex-1 py-2 rounded-xl bg-slate-800 text-slate-300 text-sm hover:bg-slate-700 transition-colors">
          Cancelar
        </button>
        <button onClick={onConfirm}
          className="flex-1 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold transition-colors">
          Ocultar
        </button>
      </div>
    </div>
  </div>
);

// ─── PRODUCT CARD ─────────────────────────────────────────────────────────────
const ProductCard: React.FC<{
  product: SupplierCatalogProduct;
  masterProducts: MasterProduct[];
  validityMode: PriceValidityMode;
  validityDays: number;
  isHidden: boolean;
  onLink: (p: SupplierCatalogProduct) => void;
  onUnlink: (id: string) => void;
  onConfirmSuggestion: (p: SupplierCatalogProduct) => void;
  onRejectSuggestion: (id: string) => void;
  onHide: (p: SupplierCatalogProduct) => void;
  onUnhide: (id: string) => void;
  onShowHistory: (p: SupplierCatalogProduct) => void;
}> = ({ product, masterProducts, validityMode, validityDays, isHidden,
        onLink, onUnlink, onConfirmSuggestion, onRejectSuggestion, onHide, onUnhide, onShowHistory }) => {
  const validPrice = getValidPrice(product, validityMode, validityDays);
  const displayPrice = validPrice ?? (product.priceHistory.length > 0 ? product.priceHistory[0] : null);
  const isExpired = !validPrice && displayPrice !== null;

  const priceTrend = useMemo(() => {
    if (product.priceHistory.length < 2) return null;
    const last = product.priceHistory[0].unitPrice;
    const prev = product.priceHistory[1].unitPrice;
    if (last > prev * 1.005) return 'up';
    if (last < prev * 0.995) return 'down';
    return 'stable';
  }, [product.priceHistory]);

  const masterProduct = product.masterSku ? masterProducts.find(mp => mp.sku === product.masterSku) : null;
  const tags = useMemo(() => {
    if (!masterProduct?.tags) return [];
    return masterProduct.tags.split('|').map(t => t.split(':').pop()?.trim()).filter(Boolean).slice(0, 2) as string[];
  }, [masterProduct]);

  return (
    <div className={`bg-slate-900 border rounded-xl overflow-hidden transition-all duration-200 ${
      isHidden ? 'border-slate-800 opacity-40' :
      isExpired ? 'border-slate-800 opacity-55' :
      product.linkConfirmed ? 'border-slate-700 hover:border-emerald-800/50' :
      product.linkSuggestion ? 'border-amber-800/40 hover:border-amber-700/60' :
      'border-slate-800 hover:border-slate-700'
    }`}>

      {/* Suggestion banner */}
      {product.linkSuggestion && !product.linkConfirmed && !isHidden && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-950/30 border-b border-amber-800/30">
          <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="text-amber-300 text-xs flex-1 truncate">
            Sugestão: <strong>{product.masterProductName}</strong> <span className="text-amber-500">({product.linkSuggestionScore}%)</span>
          </span>
          <button onClick={() => onConfirmSuggestion(product)} className="text-emerald-400 hover:text-emerald-300 p-0.5 transition-colors" title="Confirmar">
            <Check className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onRejectSuggestion(product.id)} className="text-slate-600 hover:text-slate-300 p-0.5 transition-colors" title="Rejeitar">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="p-3 space-y-2">
        {/* Nome + ações */}
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <p
              className={`text-white text-sm font-semibold leading-tight ${product.priceHistory.length > 1 ? 'cursor-pointer hover:text-amber-300 transition-colors' : ''}`}
              onClick={() => product.priceHistory.length > 1 && onShowHistory(product)}
            >{product.name}</p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              {product.supplierSku && <span className="text-slate-600 text-[10px]">#{product.supplierSku}</span>}
              {tags.map(tag => (
                <span key={tag} className="bg-slate-800 text-slate-400 text-[10px] px-1.5 py-0.5 rounded">{tag}</span>
              ))}
              {isHidden && <span className="bg-slate-800 text-slate-500 text-[10px] px-1.5 py-0.5 rounded">oculto</span>}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* Botão ocultar/reativar */}
            <button
              onClick={() => isHidden ? onUnhide(product.id) : onHide(product)}
              className={`p-1.5 rounded-lg transition-all ${
                isHidden
                  ? 'text-slate-500 hover:text-emerald-400 hover:bg-emerald-900/20'
                  : 'text-slate-700 hover:text-amber-400 hover:bg-amber-900/20'
              }`}
              title={isHidden ? 'Reativar produto' : 'Ocultar produto'}
            >
              {isHidden ? <RefreshCw className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            </button>

            {/* Botão link */}
            {!isHidden && (
              <button
                onClick={() => product.linkConfirmed ? onUnlink(product.id) : onLink(product)}
                className={`p-1.5 rounded-lg transition-all ${
                  product.linkConfirmed
                    ? 'text-emerald-400 bg-emerald-900/20 hover:bg-red-900/20 hover:text-red-400'
                    : 'text-slate-600 hover:text-amber-400 hover:bg-amber-900/20'
                }`}
                title={product.linkConfirmed ? 'Remover link' : 'Linkar com meu catálogo'}
              >
                {product.linkConfirmed ? <Link className="w-3.5 h-3.5" /> : <Unlink className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        </div>

        {/* Produto linkado */}
        {product.linkConfirmed && masterProduct && !isHidden && (
          <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-900/10 rounded-lg border border-emerald-900/20">
            <BookOpen className="w-3 h-3 text-emerald-500 shrink-0" />
            <span className="text-emerald-400 text-xs truncate">{masterProduct.name}</span>
          </div>
        )}

        {/* Preço */}
        <div className="flex items-end justify-between gap-2">
          <div>
            {displayPrice ? (
              <>
                <div className="flex items-center gap-1.5">
                  <span className={`font-bold text-base ${isExpired ? 'text-slate-400' : 'text-white'}`}>{fmt(displayPrice.unitPrice)}</span>
                  <span className="text-slate-500 text-xs">/un</span>
                  {!isExpired && priceTrend === 'up' && <TrendingUp className="w-3.5 h-3.5 text-red-400" />}
                  {!isExpired && priceTrend === 'down' && <TrendingDown className="w-3.5 h-3.5 text-emerald-400" />}
                  {!isExpired && priceTrend === 'stable' && <Minus className="w-3.5 h-3.5 text-slate-500" />}
                </div>
                <p className="text-slate-500 text-[11px]">cx c/{displayPrice.packQuantity} · {fmt(displayPrice.packPrice)} · {fmtDate(displayPrice.date)}</p>
                {isExpired && (
                  <div className="flex items-center gap-1 mt-1">
                    <Clock className="w-3 h-3 text-amber-500/80" />
                    <span className="text-amber-500/80 text-[10px] font-medium">Necessita nova cotação</span>
                  </div>
                )}
              </>
            ) : (
              <span className="text-slate-600 text-sm">Sem histórico</span>
            )}
          </div>
          {product.priceHistory.length > 1 && (
            <button
              onClick={() => onShowHistory(product)}
              className="flex items-center gap-1 text-slate-600 hover:text-amber-400 text-[10px] transition-colors shrink-0 ml-auto"
              title="Ver histórico de preços"
            >
              <History className="w-3 h-3" />
              <span>Cotado {product.priceHistory.length}×</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── CATALOG CONTENT ─────────────────────────────────────────────────────────
const CatalogContent: React.FC<{
  catalog: SupplierCatalog;
  masterProducts: MasterProduct[];
  uid: string;
  globalValidityDays: number;
  showInactive: boolean;
  hiddenProducts: HiddenProduct[];
  onCatalogUpdate: (c: SupplierCatalog) => void;
  onHideProduct: (p: SupplierCatalogProduct, supplierId: string, supplierName: string) => void;
  onUnhideProduct: (id: string) => void;
}> = ({ catalog, masterProducts, uid, globalValidityDays, showInactive, hiddenProducts, onCatalogUpdate, onHideProduct, onUnhideProduct }) => {
  const [localCatalog, setLocalCatalog] = useState(catalog);
  const [search, setSearch] = useState('');
  const [filterLinked, setFilterLinked] = useState<'all' | 'linked' | 'unlinked' | 'expired'>('all');
  const [filterCategory, setFilterCategory] = useState('');
  const [linkingProduct, setLinkingProduct] = useState<SupplierCatalogProduct | null>(null);
  const [hideConfirmProduct, setHideConfirmProduct] = useState<SupplierCatalogProduct | null>(null);
  const [historyModal, setHistoryModal] = useState<SupplierCatalogProduct | null>(null);
  const [historyPage, setHistoryPage] = useState(0);

  useEffect(() => { setLocalCatalog(catalog); }, [catalog]);

  const effectiveDays = localCatalog.priceValidityMode === 'custom'
    ? (localCatalog.priceValidityDays ?? globalValidityDays) : globalValidityDays;

  const hiddenIds = useMemo(() => new Set(hiddenProducts.map(h => h.id)), [hiddenProducts]);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    localCatalog.products.forEach(p => {
      if (p.masterCategory) {
        const parts = p.masterCategory.split('>>');
        if (parts[1]) cats.add(parts[1].trim());
      }
    });
    return Array.from(cats).sort();
  }, [localCatalog.products]);

  const filteredProducts = useMemo(() => {
    let prods = localCatalog.products;
    if (!showInactive) prods = prods.filter(p => !hiddenIds.has(p.id));
    if (search) {
      const s = searchNormalize(search);
      prods = prods.filter(p =>
        searchNormalize(p.name).includes(s) ||
        searchNormalize(p.supplierSku ?? '').includes(s) ||
        searchNormalize(p.masterProductName ?? '').includes(s)
      );
    }
    if (filterCategory) prods = prods.filter(p => p.masterCategory?.includes(filterCategory));
    switch (filterLinked) {
      case 'linked':   prods = prods.filter(p => p.linkConfirmed); break;
      case 'unlinked': prods = prods.filter(p => !p.linkConfirmed && !p.linkSuggestion); break;
      case 'expired':  prods = prods.filter(p => !getValidPrice(p, localCatalog.priceValidityMode, effectiveDays)); break;
    }
    return [...prods].sort((a, b) => {
      // ocultos vão para o final
      const aH = hiddenIds.has(a.id) ? 1 : 0;
      const bH = hiddenIds.has(b.id) ? 1 : 0;
      if (aH !== bH) return aH - bH;
      return b.lastSeenDate - a.lastSeenDate;
    });
  }, [localCatalog.products, search, filterLinked, filterCategory, effectiveDays, showInactive, hiddenIds, localCatalog.priceValidityMode]);

  const stats = useMemo(() => ({
    total: localCatalog.products.length,
    linked: localCatalog.products.filter(p => p.linkConfirmed).length,
    suggestions: localCatalog.products.filter(p => p.linkSuggestion && !p.linkConfirmed).length,
    hidden: hiddenIds.size,
  }), [localCatalog, hiddenIds]);

  const update = (updated: SupplierCatalog) => { setLocalCatalog(updated); onCatalogUpdate(updated); };

  const handleConfirmLink = async (productId: string, masterSku: string) => {
    const master = masterProducts.find(mp => mp.sku === masterSku);
    if (!master) return;
    update(await confirmProductLink(uid, localCatalog, productId, master));
    setLinkingProduct(null);
  };
  const handleUnlink = async (productId: string) => {
    if (!window.confirm('Remover link deste produto?')) return;
    update(await removeProductLink(uid, localCatalog, productId));
  };
  const handleRejectSuggestion = async (productId: string) => {
    update(await rejectLinkSuggestion(uid, localCatalog, productId));
  };
  const handleValidityModeChange = async (mode: PriceValidityMode) => {
    const updated = { ...localCatalog, priceValidityMode: mode };
    update(updated); await saveCatalog(uid, updated);
  };
  const handleCustomDaysChange = async (days: number) => {
    const updated = { ...localCatalog, priceValidityDays: days };
    update(updated); await saveCatalog(uid, updated);
  };
  const handleHide = (p: SupplierCatalogProduct) => {
    if (p.linkConfirmed) { setHideConfirmProduct(p); return; }
    onHideProduct(p, localCatalog.supplierId, localCatalog.supplierName);
  };
  const handleConfirmHide = () => {
    if (hideConfirmProduct) {
      onHideProduct(hideConfirmProduct, localCatalog.supplierId, localCatalog.supplierName);
      setHideConfirmProduct(null);
    }
  };

  return (
    <div className="space-y-4 h-full">
      {linkingProduct && (
        <LinkModal product={linkingProduct} masterProducts={masterProducts}
          onConfirm={sku => handleConfirmLink(linkingProduct.id, sku)}
          onClose={() => setLinkingProduct(null)} />
      )}
      {hideConfirmProduct && (
        <HideConfirmModal product={hideConfirmProduct}
          onConfirm={handleConfirmHide}
          onClose={() => setHideConfirmProduct(null)} />
      )}

      {/* MODAL DE HISTÓRICO DE PREÇOS */}
      {historyModal && (() => {
        const ENTRIES_PER_PAGE = 20;
        const GROUP_SIZE = 5;
        const history = historyModal.priceHistory;
        const totalPages = Math.ceil(history.length / ENTRIES_PER_PAGE);
        const pageEntries = history.slice(historyPage * ENTRIES_PER_PAGE, (historyPage + 1) * ENTRIES_PER_PAGE);
        const groups: typeof pageEntries[] = [];
        for (let i = 0; i < pageEntries.length; i += GROUP_SIZE) groups.push(pageEntries.slice(i, i + GROUP_SIZE));
        return (
          <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[85vh]">
              {/* Header */}
              <div className="flex items-start justify-between p-5 border-b border-slate-800">
                <div>
                  <h3 className="text-white font-bold text-sm leading-tight">{historyModal.name}</h3>
                  <p className="text-slate-500 text-xs mt-0.5 flex items-center gap-1.5">
                    <History className="w-3 h-3" />
                    {history.length} cotação{history.length !== 1 ? 'ões' : ''} registrada{history.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <button onClick={() => { setHistoryModal(null); setHistoryPage(0); }} className="text-slate-500 hover:text-white p-1 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Cabeçalho das colunas */}
              <div className={`grid gap-3 px-5 pt-4 pb-2`} style={{ gridTemplateColumns: `repeat(${groups.length}, 1fr)` }}>
                {groups.map((_, gi) => (
                  <div key={gi} className="grid grid-cols-4 gap-1 text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                    <span>Data</span><span className="text-right">Unit</span><span className="text-right">Cx</span><span className="text-right">Qtd</span>
                  </div>
                ))}
              </div>

              {/* Grupos de entradas lado a lado */}
              <div className={`grid gap-3 px-5 pb-4 flex-1 overflow-auto`} style={{ gridTemplateColumns: `repeat(${groups.length}, 1fr)` }}>
                {groups.map((group, gi) => (
                  <div key={gi} className="space-y-1.5 border-l border-slate-800 pl-3 first:border-l-0 first:pl-0">
                    {group.map((entry, idx) => (
                      <div key={idx} className="grid grid-cols-4 gap-1 text-[11px]">
                        <span className="text-slate-500">{fmtDate(entry.date)}</span>
                        <span className="text-slate-200 text-right font-medium">{fmt(entry.unitPrice)}</span>
                        <span className="text-slate-500 text-right">{fmt(entry.packPrice)}</span>
                        <span className="text-slate-600 text-right">c/{entry.packQuantity}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {/* Paginação */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 p-4 border-t border-slate-800">
                  <button onClick={() => setHistoryPage(p => Math.max(0, p - 1))} disabled={historyPage === 0}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-default transition-colors">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-slate-500 text-xs">Pág {historyPage + 1}/{totalPages}</span>
                  <button onClick={() => setHistoryPage(p => Math.min(totalPages - 1, p + 1))} disabled={historyPage === totalPages - 1}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-default transition-colors">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Total',      value: stats.total,       color: 'text-white' },
          { label: 'Linkados',   value: stats.linked,      color: 'text-emerald-400' },
          { label: 'Sugestões',  value: stats.suggestions, color: 'text-amber-400' },
          { label: 'Ocultos',    value: stats.hidden,      color: 'text-slate-500' },
        ].map(s => (
          <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
            <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
            <p className="text-slate-600 text-[11px] mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Validade */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">
        <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-2">Validade de Preços</p>
        <div className="flex items-center gap-2 flex-wrap">
          {([
            { mode: 'global' as PriceValidityMode, Icon: Globe, label: `Global (${globalValidityDays}d)` },
            { mode: 'frozen' as PriceValidityMode, Icon: Snowflake, label: 'Congelado' },
            { mode: 'custom' as PriceValidityMode, Icon: Calendar, label: 'Personalizado' },
          ] as const).map(({ mode, Icon, label }) => (
            <button key={mode} onClick={() => handleValidityModeChange(mode)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all ${
                localCatalog.priceValidityMode === mode ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}>
              <Icon className="w-3 h-3" />{label}
            </button>
          ))}
          {localCatalog.priceValidityMode === 'custom' && (
            <div className="flex items-center gap-1.5">
              <input type="number" value={localCatalog.priceValidityDays ?? 7}
                onChange={e => handleCustomDaysChange(Number(e.target.value))}
                className="w-14 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-xs text-center focus:outline-none focus:border-amber-500"
                min={1} max={365} />
              <span className="text-slate-500 text-xs">dias</span>
            </div>
          )}
          {localCatalog.priceValidityMode === 'frozen' && (
            <span className="text-slate-500 text-xs ml-1">❄️ Sempre usa o último preço</span>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input type="text" placeholder="Buscar produto..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-amber-500" />
        </div>
        {(['all', 'linked', 'unlinked', 'expired'] as const).map(f => (
          <button key={f} onClick={() => setFilterLinked(f)}
            className={`px-3 py-2 rounded-xl text-xs font-medium transition-all ${
              filterLinked === f ? 'bg-amber-600 text-white' : 'bg-slate-900 border border-slate-700 text-slate-400 hover:text-white'
            }`}>
            {{ all: 'Todos', linked: '🔗 Linkados', unlinked: '❓ Sem link', expired: '⏰ Expirados' }[f]}
          </button>
        ))}
        {categories.length > 0 && (
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-400 text-xs focus:outline-none focus:border-amber-500">
            <option value="">Todas categorias</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>

      <p className="text-slate-700 text-xs">{filteredProducts.length} produto{filteredProducts.length !== 1 ? 's' : ''}</p>

      {filteredProducts.length === 0 ? (
        <div className="text-center py-16 text-slate-600">
          <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhum produto encontrado</p>
          <p className="text-xs mt-1 text-slate-700">Processe uma cotação para popular o catálogo</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filteredProducts.map(product => (
            <ProductCard key={product.id} product={product} masterProducts={masterProducts}
              validityMode={localCatalog.priceValidityMode} validityDays={effectiveDays}
              isHidden={hiddenIds.has(product.id)}
              onLink={setLinkingProduct} onUnlink={handleUnlink}
              onConfirmSuggestion={p => handleConfirmLink(p.id, p.linkSuggestion!)}
              onRejectSuggestion={handleRejectSuggestion}
              onHide={handleHide}
              onUnhide={onUnhideProduct}
              onShowHistory={p => { setHistoryModal(p); setHistoryPage(0); }}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ─── MAIN COMPONENT (com sidebar) ────────────────────────────────────────────
const SupplierCatalogView: React.FC<SupplierCatalogViewProps> = ({
  suppliers, catalogs, masterProducts, uid,
  globalValidityDays, showInactive, hiddenProducts,
  onCatalogUpdate, onHideProduct, onUnhideProduct,
}) => {
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(
    suppliers.filter(s => s.isEnabled)[0]?.id ?? null
  );
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const enabledSuppliers = suppliers.filter(s => s.isEnabled);

  const handleSync = async (supplier: Supplier) => {
    setSyncingId(supplier.id);
    try {
      const allBatches = supplier.quotes.filter(q => q.status === 'completed');
      let catalog = catalogs[supplier.id] ?? {
        supplierId: supplier.id, supplierName: supplier.name,
        products: [], priceValidityMode: 'global' as PriceValidityMode, updatedAt: Date.now(),
      };
      for (const batch of allBatches) {
        const result = await processBatchIntoCatalog(uid, batch, supplier.id, supplier.name, masterProducts);
        catalog = result.catalog;
      }
      onCatalogUpdate(catalog);
    } finally {
      setSyncingId(null);
    }
  };

  const selectedCatalog = selectedSupplierId ? catalogs[selectedSupplierId] : null;
  const selectedSupplier = selectedSupplierId ? suppliers.find(s => s.id === selectedSupplierId) : null;

  return (
    <div className="flex gap-4 h-full min-h-0">
      {/* Sidebar */}
      <div className="w-52 shrink-0 flex flex-col gap-1 overflow-y-auto">
        {enabledSuppliers.map(s => {
          const cat = catalogs[s.id];
          const count = cat?.products.length ?? 0;
          const isSyncing = syncingId === s.id;
          const isEmpty = count === 0;
          const isSelected = selectedSupplierId === s.id;

          return (
            <div key={s.id}
              onClick={() => setSelectedSupplierId(s.id)}
              className={`group relative flex flex-col gap-1 px-3 py-2.5 rounded-xl cursor-pointer transition-all border ${
                isSelected
                  ? 'bg-amber-600/10 border-amber-600/50 text-white'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-white'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-sm font-medium truncate">{s.name}</span>
                {/* Botão sincronizar */}
                {isEmpty && (
                  <button
                    onClick={e => { e.stopPropagation(); handleSync(s); }}
                    className="shrink-0 p-1 rounded-lg text-slate-600 hover:text-amber-400 hover:bg-amber-900/20 transition-all"
                    title="Sincronizar catálogo"
                    disabled={isSyncing}
                  >
                    {isSyncing
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <RefreshCw className="w-3.5 h-3.5" />
                    }
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                {count > 0
                  ? <span className={`text-[11px] ${isSelected ? 'text-amber-300' : 'text-slate-600'}`}>{count} produtos</span>
                  : <span className="text-[11px] text-slate-700">vazio</span>
                }
              </div>
            </div>
          );
        })}
      </div>

      {/* Conteúdo */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        {!selectedSupplierId ? (
          <div className="text-center py-20 text-slate-600">
            <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Selecione um fornecedor</p>
          </div>
        ) : !selectedCatalog ? (
          <div className="text-center py-20 text-slate-600">
            <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Catálogo vazio</p>
            <p className="text-xs mt-1 text-slate-700">Clique em ↺ para sincronizar as cotações existentes</p>
            {selectedSupplier && (
              <button
                onClick={() => handleSync(selectedSupplier)}
                disabled={syncingId === selectedSupplierId}
                className="mt-4 flex items-center gap-2 mx-auto px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm rounded-xl transition-colors disabled:opacity-50"
              >
                {syncingId === selectedSupplierId
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <RefreshCw className="w-4 h-4" />
                }
                Sincronizar catálogo
              </button>
            )}
          </div>
        ) : (
          <CatalogContent
            catalog={selectedCatalog}
            masterProducts={masterProducts}
            uid={uid}
            globalValidityDays={globalValidityDays}
            showInactive={showInactive}
            hiddenProducts={hiddenProducts.filter(h => h.supplierId === selectedSupplierId)}
            onCatalogUpdate={onCatalogUpdate}
            onHideProduct={onHideProduct}
            onUnhideProduct={onUnhideProduct}
          />
        )}
      </div>
    </div>
  );
};

export default SupplierCatalogView;
