import React, { useState, useEffect, useMemo } from 'react';
import {
  SupplierCatalog,
  SupplierCatalogProduct,
  MasterProduct,
  PriceValidityMode,
} from '../types';
import {
  findMasterProductMatches,
  getValidPrice,
  confirmProductLink,
  removeProductLink,
  rejectLinkSuggestion,
  saveCatalog,
} from '../services/supplierCatalogService';
import {
  Search, Link, Unlink, Check, X, ChevronDown, ChevronUp,
  Clock, Snowflake, Globe, Calendar, TrendingUp, TrendingDown,
  Minus, BookOpen, AlertCircle, Package,
} from 'lucide-react';

// ─── FORMATTERS ───────────────────────────────────────────────────────────────
const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (ts: number) => new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });

// Remove acentos para busca, mas preserva ç
const searchNormalize = (str: string): string =>
  str.toLowerCase()
    .replace(/ç/g, '\x00')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\x00/g, 'ç');

// ─── INTERFACES ───────────────────────────────────────────────────────────────
interface SupplierCatalogViewProps {
  catalog: SupplierCatalog;
  masterProducts: MasterProduct[];
  uid: string;
  globalValidityDays: number;
  onCatalogUpdate: (catalog: SupplierCatalog) => void;
}

// ─── LINK MODAL ───────────────────────────────────────────────────────────────
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
              type="text"
              placeholder="Buscar no meu catálogo..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-amber-500"
              autoFocus
            />
          </div>

          {!search && suggestions.length > 0 && (
            <p className="text-slate-500 text-xs">Sugestões automáticas por similaridade:</p>
          )}

          <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
            {filtered.length === 0 ? (
              <p className="text-slate-600 text-sm text-center py-6">Nenhum produto encontrado</p>
            ) : (
              filtered.map(match => {
                const master = masterProducts.find(mp => mp.sku === match.sku);
                return (
                  <button
                    key={match.sku}
                    onClick={() => onConfirm(match.sku)}
                    className="w-full text-left bg-slate-800 hover:bg-amber-950/30 border border-slate-700 hover:border-amber-600/50 rounded-xl px-4 py-3 transition-all"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">{match.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-slate-500 text-xs">SKU: {match.sku}</span>
                          {master?.category && (
                            <span className="text-slate-600 text-xs">· {master.category.split('>>').pop()?.trim()}</span>
                          )}
                        </div>
                      </div>
                      {match.score > 0 && (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${
                          match.score >= 80 ? 'bg-emerald-900/40 text-emerald-400' :
                          match.score >= 60 ? 'bg-amber-900/40 text-amber-400' :
                          'bg-slate-700 text-slate-400'
                        }`}>
                          {match.score}%
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── PRODUCT CARD ─────────────────────────────────────────────────────────────
const ProductCard: React.FC<{
  product: SupplierCatalogProduct;
  masterProducts: MasterProduct[];
  validityMode: PriceValidityMode;
  validityDays: number;
  onLink: (product: SupplierCatalogProduct) => void;
  onUnlink: (productId: string) => void;
  onConfirmSuggestion: (product: SupplierCatalogProduct) => void;
  onRejectSuggestion: (productId: string) => void;
}> = ({ product, masterProducts, validityMode, validityDays, onLink, onUnlink, onConfirmSuggestion, onRejectSuggestion }) => {
  const [expanded, setExpanded] = useState(false);

  const validPrice = getValidPrice(product, validityMode, validityDays);
  const isExpired = !validPrice;

  const priceTrend = useMemo(() => {
    if (product.priceHistory.length < 2) return null;
    const last = product.priceHistory[0].unitPrice;
    const prev = product.priceHistory[1].unitPrice;
    if (last > prev * 1.005) return 'up';
    if (last < prev * 0.995) return 'down';
    return 'stable';
  }, [product.priceHistory]);

  const masterProduct = product.masterSku
    ? masterProducts.find(mp => mp.sku === product.masterSku)
    : null;

  const tags = useMemo(() => {
    if (!masterProduct?.tags) return [];
    return masterProduct.tags
      .split('|')
      .map(t => t.split(':').pop()?.trim())
      .filter(Boolean)
      .slice(0, 2) as string[];
  }, [masterProduct]);

  return (
    <div className={`bg-slate-900 border rounded-xl overflow-hidden transition-all duration-200 ${
      isExpired
        ? 'border-slate-800 opacity-50'
        : product.linkConfirmed
        ? 'border-slate-700 hover:border-emerald-800/50'
        : product.linkSuggestion
        ? 'border-amber-800/40 hover:border-amber-700/60'
        : 'border-slate-800 hover:border-slate-700'
    }`}>

      {/* Banner de sugestão */}
      {product.linkSuggestion && !product.linkConfirmed && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-950/30 border-b border-amber-800/30">
          <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="text-amber-300 text-xs flex-1 truncate">
            Sugestão: <strong>{product.masterProductName}</strong>{' '}
            <span className="text-amber-500">({product.linkSuggestionScore}%)</span>
          </span>
          <button
            onClick={() => onConfirmSuggestion(product)}
            className="text-emerald-400 hover:text-emerald-300 p-0.5 transition-colors"
            title="Confirmar"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onRejectSuggestion(product.id)}
            className="text-slate-600 hover:text-slate-300 p-0.5 transition-colors"
            title="Rejeitar"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="p-3 space-y-2">
        {/* Nome + botão link */}
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-semibold leading-tight">{product.name}</p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              {product.supplierSku && (
                <span className="text-slate-600 text-[10px]">#{product.supplierSku}</span>
              )}
              {tags.map(tag => (
                <span key={tag} className="bg-slate-800 text-slate-400 text-[10px] px-1.5 py-0.5 rounded">
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <button
            onClick={() => product.linkConfirmed ? onUnlink(product.id) : onLink(product)}
            className={`p-1.5 rounded-lg transition-all shrink-0 ${
              product.linkConfirmed
                ? 'text-emerald-400 bg-emerald-900/20 hover:bg-red-900/20 hover:text-red-400'
                : 'text-slate-600 hover:text-amber-400 hover:bg-amber-900/20'
            }`}
            title={product.linkConfirmed ? 'Remover link' : 'Linkar com meu catálogo'}
          >
            {product.linkConfirmed
              ? <Link className="w-3.5 h-3.5" />
              : <Unlink className="w-3.5 h-3.5" />
            }
          </button>
        </div>

        {/* Produto linkado */}
        {product.linkConfirmed && masterProduct && (
          <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-900/10 rounded-lg border border-emerald-900/20">
            <BookOpen className="w-3 h-3 text-emerald-500 shrink-0" />
            <span className="text-emerald-400 text-xs truncate">{masterProduct.name}</span>
          </div>
        )}

        {/* Preço atual */}
        <div className="flex items-end justify-between gap-2">
          <div>
            {validPrice ? (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="text-white font-bold text-base">{fmt(validPrice.unitPrice)}</span>
                  <span className="text-slate-500 text-xs">/un</span>
                  {priceTrend === 'up' && <TrendingUp className="w-3.5 h-3.5 text-red-400" />}
                  {priceTrend === 'down' && <TrendingDown className="w-3.5 h-3.5 text-emerald-400" />}
                  {priceTrend === 'stable' && <Minus className="w-3.5 h-3.5 text-slate-500" />}
                </div>
                <p className="text-slate-500 text-[11px]">
                  cx c/{validPrice.packQuantity} · {fmt(validPrice.packPrice)} · {fmtDate(validPrice.date)}
                </p>
              </>
            ) : (
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-600" />
                <span className="text-slate-600 text-sm">Preço expirado</span>
                <span className="text-slate-700 text-[10px]">({fmtDate(product.lastSeenDate)})</span>
              </div>
            )}
          </div>

          {product.priceHistory.length > 1 && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="flex items-center gap-1 text-slate-600 hover:text-slate-300 text-[11px] transition-colors shrink-0"
            >
              <span>{product.priceHistory.length}×</span>
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
        </div>

        {/* Histórico expandido */}
        {expanded && (
          <div className="pt-2 border-t border-slate-800 space-y-1">
            {product.priceHistory.slice(0, 12).map((entry, idx) => (
              <div key={idx} className="grid grid-cols-4 gap-1 text-[11px]">
                <span className="text-slate-500">{fmtDate(entry.date)}</span>
                <span className="text-slate-300 text-right">{fmt(entry.unitPrice)}</span>
                <span className="text-slate-500 text-right">{fmt(entry.packPrice)}</span>
                <span className="text-slate-600 text-right">c/{entry.packQuantity}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
const SupplierCatalogView: React.FC<SupplierCatalogViewProps> = ({
  catalog,
  masterProducts,
  uid,
  globalValidityDays,
  onCatalogUpdate,
}) => {
  const [localCatalog, setLocalCatalog] = useState(catalog);
  const [search, setSearch] = useState('');
  const [filterLinked, setFilterLinked] = useState<'all' | 'linked' | 'unlinked' | 'expired'>('all');
  const [filterCategory, setFilterCategory] = useState('');
  const [linkingProduct, setLinkingProduct] = useState<SupplierCatalogProduct | null>(null);

  useEffect(() => { setLocalCatalog(catalog); }, [catalog]);

  const effectiveDays =
    localCatalog.priceValidityMode === 'custom'
      ? (localCatalog.priceValidityDays ?? globalValidityDays)
      : globalValidityDays;

  // Categorias disponíveis dos produtos linkados
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

  // Produtos filtrados e ordenados
  const filteredProducts = useMemo(() => {
    let prods = localCatalog.products;

    if (search) {
      const s = searchNormalize(search);
      prods = prods.filter(p =>
        searchNormalize(p.name).includes(s) ||
        searchNormalize(p.supplierSku ?? '').includes(s) ||
        searchNormalize(p.masterProductName ?? '').includes(s)
      );
    }

    if (filterCategory) {
      prods = prods.filter(p => p.masterCategory?.includes(filterCategory));
    }

    switch (filterLinked) {
      case 'linked':   prods = prods.filter(p => p.linkConfirmed); break;
      case 'unlinked': prods = prods.filter(p => !p.linkConfirmed && !p.linkSuggestion); break;
      case 'expired':  prods = prods.filter(p => !getValidPrice(p, localCatalog.priceValidityMode, effectiveDays)); break;
    }

    return [...prods].sort((a, b) => b.lastSeenDate - a.lastSeenDate);
  }, [localCatalog.products, search, filterLinked, filterCategory, effectiveDays, localCatalog.priceValidityMode]);

  // Stats
  const stats = useMemo(() => ({
    total: localCatalog.products.length,
    linked: localCatalog.products.filter(p => p.linkConfirmed).length,
    suggestions: localCatalog.products.filter(p => p.linkSuggestion && !p.linkConfirmed).length,
    expired: localCatalog.products.filter(p =>
      !getValidPrice(p, localCatalog.priceValidityMode, effectiveDays)
    ).length,
  }), [localCatalog, effectiveDays]);

  // Atualiza estado local + propaga para cima
  const update = (updated: SupplierCatalog) => {
    setLocalCatalog(updated);
    onCatalogUpdate(updated);
  };

  // Handlers
  const handleConfirmLink = async (productId: string, masterSku: string) => {
    const master = masterProducts.find(mp => mp.sku === masterSku);
    if (!master) return;
    const updated = await confirmProductLink(uid, localCatalog, productId, master);
    update(updated);
    setLinkingProduct(null);
  };

  const handleUnlink = async (productId: string) => {
    if (!window.confirm('Remover link deste produto?')) return;
    const updated = await removeProductLink(uid, localCatalog, productId);
    update(updated);
  };

  const handleRejectSuggestion = async (productId: string) => {
    const updated = await rejectLinkSuggestion(uid, localCatalog, productId);
    update(updated);
  };

  const handleValidityModeChange = async (mode: PriceValidityMode) => {
    const updated = { ...localCatalog, priceValidityMode: mode };
    update(updated);
    await saveCatalog(uid, updated);
  };

  const handleCustomDaysChange = async (days: number) => {
    const updated = { ...localCatalog, priceValidityDays: days };
    update(updated);
    await saveCatalog(uid, updated);
  };

  return (
    <div className="space-y-4">
      {/* Link Modal */}
      {linkingProduct && (
        <LinkModal
          product={linkingProduct}
          masterProducts={masterProducts}
          onConfirm={sku => handleConfirmLink(linkingProduct.id, sku)}
          onClose={() => setLinkingProduct(null)}
        />
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total',      value: stats.total,       color: 'text-white' },
          { label: 'Linkados',   value: stats.linked,      color: 'text-emerald-400' },
          { label: 'Sugestões',  value: stats.suggestions, color: 'text-amber-400' },
          { label: 'Expirados',  value: stats.expired,     color: 'text-slate-500' },
        ].map(s => (
          <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
            <p className="text-slate-500 text-xs mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Validade de Preços */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <p className="text-slate-400 text-[11px] font-bold uppercase tracking-widest mb-3">
          Validade de Preços
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {([
            { mode: 'global'  as PriceValidityMode, Icon: Globe,     label: `Global (${globalValidityDays}d)` },
            { mode: 'frozen'  as PriceValidityMode, Icon: Snowflake, label: 'Congelado' },
            { mode: 'custom'  as PriceValidityMode, Icon: Calendar,  label: 'Personalizado' },
          ] as const).map(({ mode, Icon, label }) => (
            <button
              key={mode}
              onClick={() => handleValidityModeChange(mode)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all ${
                localCatalog.priceValidityMode === mode
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}

          {localCatalog.priceValidityMode === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={localCatalog.priceValidityDays ?? 7}
                onChange={e => handleCustomDaysChange(Number(e.target.value))}
                className="w-16 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-sm text-center focus:outline-none focus:border-amber-500"
                min={1}
                max={365}
              />
              <span className="text-slate-400 text-sm">dias</span>
            </div>
          )}
        </div>

        {localCatalog.priceValidityMode === 'frozen' && (
          <p className="text-slate-500 text-xs mt-2">
            ❄️ Congelado — usa sempre o último preço registrado, independente da data
          </p>
        )}
        {localCatalog.priceValidityMode === 'global' && (
          <p className="text-slate-500 text-xs mt-2">
            🌐 Segue a configuração global do app ({globalValidityDays} dias)
          </p>
        )}
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar produto..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-amber-500"
          />
        </div>

        {(['all', 'linked', 'unlinked', 'expired'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilterLinked(f)}
            className={`px-3 py-2 rounded-xl text-xs font-medium transition-all ${
              filterLinked === f
                ? 'bg-amber-600 text-white'
                : 'bg-slate-900 border border-slate-700 text-slate-400 hover:text-white'
            }`}
          >
            {{ all: 'Todos', linked: '🔗 Linkados', unlinked: '❓ Sem link', expired: '⏰ Expirados' }[f]}
          </button>
        ))}

        {categories.length > 0 && (
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-400 text-xs focus:outline-none focus:border-amber-500"
          >
            <option value="">Todas categorias</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>

      {/* Contagem */}
      <p className="text-slate-600 text-xs">{filteredProducts.length} produto{filteredProducts.length !== 1 ? 's' : ''}</p>

      {/* Grid */}
      {filteredProducts.length === 0 ? (
        <div className="text-center py-16 text-slate-600">
          <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhum produto encontrado</p>
          <p className="text-xs mt-1 text-slate-700">Processe uma cotação para popular o catálogo</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filteredProducts.map(product => (
            <ProductCard
              key={product.id}
              product={product}
              masterProducts={masterProducts}
              validityMode={localCatalog.priceValidityMode}
              validityDays={effectiveDays}
              onLink={setLinkingProduct}
              onUnlink={handleUnlink}
              onConfirmSuggestion={p => handleConfirmLink(p.id, p.linkSuggestion!)}
              onRejectSuggestion={handleRejectSuggestion}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default SupplierCatalogView;
