import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ProductQuote, Supplier, MasterProduct } from '../types';
import { X, Search, CheckCircle, ChevronDown, ChevronUp, History, BookOpen } from 'lucide-react';
import { normalizeProductName, smartSimilarityScore } from '../services/supplierCatalogService';

interface LinkProductModalProps {
  item: ProductQuote;
  supplier: Supplier;
  masterProducts: MasterProduct[];
  onLink: (normalizedName: string, targetSku: string, targetType: 'master' | 'supplier', targetName: string) => void;
  onClose: () => void;
}

const LinkProductModal: React.FC<LinkProductModalProps> = ({
  item,
  supplier,
  masterProducts,
  onLink,
  onClose,
}) => {
  const [linkSearch, setLinkSearch] = useState('');
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Unique product names from this supplier's saved quotes (excluding current batch name)
  const historicalNames = useMemo(() => {
    const seen = new Set<string>();
    const names: string[] = [];
    supplier.quotes
      .filter(q => q.isSaved)
      .forEach(q =>
        q.items.forEach(i => {
          if (!seen.has(i.name)) {
            seen.add(i.name);
            names.push(i.name);
          }
        })
      );
    return names.sort((a, b) => a.localeCompare(b));
  }, [supplier.quotes]);

  // Master products filtered and ranked by similarity
  const filteredMaster = useMemo(() => {
    if (!linkSearch.trim()) {
      // Sem busca: ordenar pelos mais similares ao nome do item sendo linkado
      return masterProducts
        .map(p => ({ p, score: smartSimilarityScore(item.name, p.name) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 30)
        .map(({ p }) => p);
    }
    const term = linkSearch.toLowerCase();
    return masterProducts
      .filter(p =>
        p.name.toLowerCase().includes(term) ||
        p.sku.toLowerCase().includes(term) ||
        (p.brand && p.brand.toLowerCase().includes(term))
      )
      .map(p => ({ p, score: smartSimilarityScore(linkSearch, p.name) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 50)
      .map(({ p }) => p);
  }, [masterProducts, linkSearch, item.name]);

  // Historical names filtered by search (only when searching)
  const filteredHistory = useMemo(() => {
    if (!linkSearch.trim()) return historicalNames.slice(0, 20);
    const term = linkSearch.toLowerCase();
    return historicalNames.filter(n => n.toLowerCase().includes(term)).slice(0, 20);
  }, [historicalNames, linkSearch]);

  const handleLinkMaster = (product: MasterProduct) => {
    onLink(normalizeProductName(item.name), product.sku, 'master', product.name);
  };

  const handleHistoryClick = (name: string) => {
    setLinkSearch(name);
    searchInputRef.current?.focus();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-slate-800 bg-slate-800/40 shrink-0">
          <BookOpen className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-sm">Vincular ao Catálogo Master</p>
            <p className="text-slate-400 text-xs truncate mt-0.5" title={item.name}>{item.name}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white p-1 rounded shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-slate-800 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              ref={searchInputRef}
              value={linkSearch}
              onChange={(e) => setLinkSearch(e.target.value)}
              placeholder="Buscar no catálogo master..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
            {linkSearch && (
              <button onClick={() => setLinkSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="overflow-y-auto flex-1">
          {/* Section A: Catálogo Master */}
          <div>
            <div className="px-4 py-2 bg-slate-800/30 border-b border-slate-800">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                Meu Catálogo Master ({filteredMaster.length}{!linkSearch ? '+' : ''})
              </span>
            </div>

            {filteredMaster.length === 0 ? (
              <div className="px-4 py-6 text-center text-slate-600 text-sm">
                Nenhum produto encontrado
              </div>
            ) : (
              <div className="divide-y divide-slate-800/50">
                {filteredMaster.map(product => (
                  <button
                    key={product.id || product.sku}
                    onClick={() => handleLinkMaster(product)}
                    className="w-full text-left px-4 py-2.5 hover:bg-amber-950/20 hover:border-l-2 hover:border-amber-500 transition-all group"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-slate-200 text-sm font-medium leading-tight truncate group-hover:text-white">
                          {product.name}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-slate-600 font-mono">{product.sku}</span>
                          {product.brand && (
                            <span className="text-[10px] text-slate-600">{product.brand}</span>
                          )}
                          {product.category && (
                            <span className="text-[10px] text-slate-700 bg-slate-800 px-1.5 rounded">{product.category}</span>
                          )}
                        </div>
                      </div>
                      <CheckCircle className="w-4 h-4 text-slate-700 group-hover:text-amber-500 transition-colors shrink-0" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Section B: Histórico do Fornecedor */}
          <div className="border-t border-slate-800">
            <button
              className="w-full px-4 py-2.5 bg-slate-800/20 hover:bg-slate-800/40 flex items-center justify-between transition-colors"
              onClick={() => setHistoryExpanded(v => !v)}
            >
              <div className="flex items-center gap-2">
                <History className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  Histórico deste Fornecedor ({historicalNames.length})
                </span>
              </div>
              {historyExpanded ? (
                <ChevronUp className="w-3.5 h-3.5 text-slate-600" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-slate-600" />
              )}
            </button>

            {historyExpanded && (
              <div className="divide-y divide-slate-800/30">
                {filteredHistory.length === 0 ? (
                  <div className="px-4 py-4 text-center text-slate-600 text-sm italic">
                    Nenhum produto no histórico
                  </div>
                ) : (
                  filteredHistory.map((name, i) => (
                    <button
                      key={i}
                      onClick={() => handleHistoryClick(name)}
                      title="Clique para usar como busca no catálogo master"
                      className="w-full text-left px-4 py-2 hover:bg-blue-950/20 transition-colors group"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-400 text-xs truncate group-hover:text-blue-300">{name}</span>
                        <Search className="w-3 h-3 text-slate-700 group-hover:text-blue-400 shrink-0" />
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2.5 border-t border-slate-800 bg-slate-950/30 shrink-0">
          <p className="text-slate-600 text-[10px] text-center">
            Selecione um produto do catálogo master para criar o vínculo permanente
          </p>
        </div>
      </div>
    </div>
  );
};

export default LinkProductModal;
