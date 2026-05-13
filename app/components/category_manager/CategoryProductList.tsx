import React, { useEffect, useMemo, useState } from 'react';
import { MasterProduct, CategoryTree } from '../../types';
import { buildPath, getDescendantIds, getChildren, findNodeByLegacyPath } from '../../services/category_manager/categoryService';
import { Search, Tag, X, ChevronDown, ArrowRight } from 'lucide-react';
import Pagination from '../shared/Pagination';

interface Props {
  selectedNodeId: string | null;
  tree: CategoryTree;
  masterProducts: MasterProduct[];
  onAssignCategory: (productId: string, categoryId: string | undefined) => void;
  onBatchAssignCategory?: (updates: Array<{ productId: string; categoryId: string }>) => void;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const CategoryProductList: React.FC<Props> = ({
  selectedNodeId, tree, masterProducts, onAssignCategory, onBatchAssignCategory,
}) => {
  const [search, setSearch] = useState('');
  const [showUncat, setShowUncat] = useState(false);
  const [showLegacy, setShowLegacy] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assignTarget, setAssignTarget] = useState('');

  // Pagination state — uncategorized
  const [uncatPage, setUncatPage] = useState(1);
  const [uncatPageSize, setUncatPageSize] = useState(50);

  // Pagination state — legacy matched
  const [legacyPage, setLegacyPage] = useState(1);
  const [legacyPageSize, setLegacyPageSize] = useState(50);

  // Reset uncategorized page on filter/size change
  useEffect(() => { setUncatPage(1); }, [search, uncatPageSize]);

  // Reset legacy page on node change or filter/size change
  useEffect(() => { setLegacyPage(1); }, [selectedNodeId, search, legacyPageSize]);

  const selectedPath = useMemo(
    () => selectedNodeId ? buildPath(tree, selectedNodeId) : null,
    [selectedNodeId, tree]
  );

  // Products in selected node and all descendants (already have categoryId)
  const nodeProducts = useMemo(() => {
    if (!selectedNodeId) return [];
    const ids = new Set(getDescendantIds(tree, selectedNodeId));
    return masterProducts.filter(p => p.categoryId && ids.has(p.categoryId));
  }, [selectedNodeId, tree, masterProducts]);

  // Products with legacy category string that maps to selected node or descendant
  const legacyMatchedProducts = useMemo(() => {
    if (!selectedNodeId || Object.keys(tree).length === 0) return [];
    const descendantSet = new Set(getDescendantIds(tree, selectedNodeId));
    return masterProducts.filter(p => {
      if (p.categoryId) return false;
      if (!p.category) return false;
      const matchedId = findNodeByLegacyPath(tree, p.category);
      return matchedId !== null && descendantSet.has(matchedId);
    });
  }, [selectedNodeId, tree, masterProducts]);

  // Uncategorized products (no categoryId, no legacy match OR no node selected)
  const uncatProducts = useMemo(
    () => masterProducts.filter(p => !p.categoryId && !p.category),
    [masterProducts]
  );

  // All products with legacy string but no categoryId (for "Sem categoria" section)
  const allLegacyUncategorized = useMemo(
    () => masterProducts.filter(p => !p.categoryId && !!p.category),
    [masterProducts]
  );

  const filteredNode = useMemo(() => {
    if (!search.trim()) return nodeProducts;
    const t = norm(search);
    return nodeProducts.filter(p => norm(p.name).includes(t) || norm(p.sku).includes(t));
  }, [nodeProducts, search]);

  const filteredUncat = useMemo(() => {
    const base = [...uncatProducts, ...allLegacyUncategorized];
    if (!search.trim()) return base;
    const t = norm(search);
    return base.filter(p => norm(p.name).includes(t) || norm(p.sku).includes(t));
  }, [uncatProducts, allLegacyUncategorized, search]);

  const filteredLegacy = useMemo(() => {
    if (!search.trim()) return legacyMatchedProducts;
    const t = norm(search);
    return legacyMatchedProducts.filter(p => norm(p.name).includes(t) || norm(p.sku).includes(t));
  }, [legacyMatchedProducts, search]);

  // Leaf nodes for the assign dropdown
  const leafOptions = useMemo(
    () => Object.entries(tree)
      .filter(([id]) => getChildren(tree, id).length === 0)
      .map(([id]) => ({ id, path: buildPath(tree, id) }))
      .sort((a, b) => a.path.localeCompare(b.path, 'pt-BR')),
    [tree]
  );

  const confirmAssign = (productId: string) => {
    if (!assignTarget) return;
    onAssignCategory(productId, assignTarget || undefined);
    setAssigningId(null);
    setAssignTarget('');
  };

  const migrateProduct = (p: MasterProduct) => {
    if (!p.category) return;
    const matchedId = findNodeByLegacyPath(tree, p.category);
    if (matchedId) onAssignCategory(p.id, matchedId);
  };

  const migrateAll = () => {
    const updates = filteredLegacy
      .map(p => {
        const matchedId = p.category ? findNodeByLegacyPath(tree, p.category) : null;
        return matchedId ? { productId: p.id, categoryId: matchedId } : null;
      })
      .filter((u): u is { productId: string; categoryId: string } => u !== null);

    if (onBatchAssignCategory) {
      onBatchAssignCategory(updates);
    } else {
      updates.forEach(u => onAssignCategory(u.productId, u.categoryId));
    }
  };

  const renderProduct = (p: MasterProduct, showNodeBadge = false) => (
    <div key={p.id} className="flex items-center gap-3 px-3 py-2 border-b border-slate-800/60 last:border-0 group hover:bg-slate-800/40 transition-colors">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-200 font-medium truncate">{p.name}</p>
        <p className="text-[11px] text-slate-500">{p.sku}{showNodeBadge && p.categoryId ? ` · ${buildPath(tree, p.categoryId)}` : ''}</p>
      </div>
      {assigningId === p.id ? (
        <div className="flex items-center gap-1 shrink-0">
          <select
            autoFocus
            value={assignTarget}
            onChange={e => setAssignTarget(e.target.value)}
            className="bg-slate-800 border border-amber-600/50 text-slate-200 text-xs rounded px-2 py-1 focus:outline-none max-w-[200px]"
          >
            <option value="">Selecione...</option>
            {leafOptions.map(o => <option key={o.id} value={o.id}>{o.path}</option>)}
          </select>
          <button onClick={() => confirmAssign(p.id)} disabled={!assignTarget} className="text-emerald-400 hover:text-emerald-300 disabled:opacity-40 p-1 text-xs">✓</button>
          <button onClick={() => setAssigningId(null)} className="text-slate-500 hover:text-white p-1"><X className="w-3.5 h-3.5" /></button>
        </div>
      ) : (
        <button
          onClick={() => { setAssigningId(p.id); setAssignTarget(p.categoryId ?? ''); }}
          className="shrink-0 flex items-center gap-1 text-[11px] text-slate-600 hover:text-amber-400 opacity-0 group-hover:opacity-100 transition-all"
        >
          <Tag className="w-3 h-3" /> categorizar
        </button>
      )}
    </div>
  );

  const renderLegacyProduct = (p: MasterProduct) => {
    const matchedId = p.category ? findNodeByLegacyPath(tree, p.category) : null;
    return (
      <div key={p.id} className="flex items-center gap-3 px-3 py-2 border-b border-slate-800/60 last:border-0 group hover:bg-slate-800/40 transition-colors">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-200 font-medium truncate">{p.name}</p>
          <p className="text-[11px] text-slate-500 truncate" title={p.category}>
            {p.sku}{p.category ? ` · ${p.category}` : ''}
          </p>
        </div>
        {matchedId && (
          <button
            onClick={() => migrateProduct(p)}
            className="shrink-0 flex items-center gap-1 text-[11px] text-violet-400 hover:text-violet-300 opacity-0 group-hover:opacity-100 transition-all whitespace-nowrap"
          >
            Migrar <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>
    );
  };

  if (Object.keys(tree).length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2">
        <Tag className="w-10 h-10 opacity-20" />
        <p className="text-sm">Nenhuma categoria criada ainda.</p>
        <p className="text-xs text-slate-600">Use o painel à esquerda para criar sua primeira categoria.</p>
      </div>
    );
  }

  // Paginated slices
  const uncatSlice = filteredUncat.slice((uncatPage - 1) * uncatPageSize, uncatPage * uncatPageSize);
  const legacySlice = filteredLegacy.slice((legacyPage - 1) * legacyPageSize, legacyPage * legacyPageSize);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-800 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div>
            {selectedPath
              ? <p className="text-sm font-bold text-slate-200">{selectedPath}</p>
              : <p className="text-sm text-slate-500">Selecione uma categoria</p>}
            {selectedNodeId && (
              <p className="text-[11px] text-slate-500 mt-0.5">
                {nodeProducts.length} produto{nodeProducts.length !== 1 ? 's' : ''} migrado{nodeProducts.length !== 1 ? 's' : ''}
                {legacyMatchedProducts.length > 0 && ` · ${legacyMatchedProducts.length} aguardando migração`}
              </p>
            )}
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar produto..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg py-1.5 pl-8 pr-3 text-xs text-white focus:border-amber-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Product list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
        {/* Migrated products in selected node */}
        {selectedNodeId && filteredNode.length > 0 && (
          <div>{filteredNode.map(p => renderProduct(p))}</div>
        )}
        {selectedNodeId && filteredNode.length === 0 && !search && nodeProducts.length === 0 && legacyMatchedProducts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-slate-600">
            <p className="text-xs">Nenhum produto nesta categoria.</p>
          </div>
        )}

        {/* Legacy (not yet migrated) products that belong to selected node */}
        {selectedNodeId && filteredLegacy.length > 0 && (
          <div className="border-t border-slate-700/60">
            <div className="flex items-center gap-2 px-3 py-2.5 bg-violet-900/10 border-b border-violet-800/20">
              <button
                onClick={() => setShowLegacy(v => !v)}
                className="flex items-center gap-2 flex-1 text-xs text-violet-300 hover:text-violet-200 transition-colors"
              >
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showLegacy ? '' : '-rotate-90'}`} />
                <span className="font-medium">Não migrados (legado)</span>
                <span className="text-violet-500">— {filteredLegacy.length} produto{filteredLegacy.length !== 1 ? 's' : ''}</span>
              </button>
              {showLegacy && filteredLegacy.length > 0 && (
                <button
                  onClick={migrateAll}
                  className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded bg-violet-800/40 text-violet-300 hover:bg-violet-700/40 hover:text-violet-200 border border-violet-700/40 transition-colors shrink-0"
                >
                  Migrar todos <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
            {showLegacy && (
              <>
                <div>{legacySlice.map(p => renderLegacyProduct(p))}</div>
                <Pagination
                  total={filteredLegacy.length}
                  page={legacyPage}
                  pageSize={legacyPageSize}
                  onPageChange={setLegacyPage}
                  onPageSizeChange={setLegacyPageSize}
                />
              </>
            )}
          </div>
        )}

        {/* Uncategorized section */}
        <div className="border-t border-slate-800">
          <button
            onClick={() => setShowUncat(v => !v)}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-800/40 transition-colors"
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showUncat ? '' : '-rotate-90'}`} />
            Sem categoria — {filteredUncat.length} produto{filteredUncat.length !== 1 ? 's' : ''}
          </button>
          {showUncat && (
            <>
              <div>
                {uncatSlice.map(p => renderProduct(p, false))}
                {filteredUncat.length === 0 && (
                  <p className="text-xs text-slate-600 px-4 py-3">{search ? 'Sem resultados.' : 'Todos os produtos têm categoria.'}</p>
                )}
              </div>
              <Pagination
                total={filteredUncat.length}
                page={uncatPage}
                pageSize={uncatPageSize}
                onPageChange={setUncatPage}
                onPageSizeChange={setUncatPageSize}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CategoryProductList;
