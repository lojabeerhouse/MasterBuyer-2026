import React, { useEffect, useMemo, useState } from 'react';
import { MasterProduct, CategoryTree } from '../../types';
import { buildPath, getDescendantIds, getChildren, findNodeByLegacyPath } from '../../services/category_manager/categoryService';
import { Search, Tag, X, ChevronDown, ArrowRight } from 'lucide-react';
import Pagination from '../shared/Pagination';
import { useCheckboxSelection } from '../shared/useCheckboxSelection';

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

  // Multi-select state
  const { selectedIds, handleChange, toggleAll, clearSelection, isAllSelected } = useCheckboxSelection<MasterProduct>();
  const [bulkTarget, setBulkTarget] = useState('');

  // Pagination state — uncategorized
  const [uncatPage, setUncatPage] = useState(1);
  const [uncatPageSize, setUncatPageSize] = useState(50);

  // Pagination state — legacy matched
  const [legacyPage, setLegacyPage] = useState(1);
  const [legacyPageSize, setLegacyPageSize] = useState(50);

  // Pagination state — other categories
  const [showOther, setShowOther] = useState(false);
  const [showNode, setShowNode] = useState(true);
  const [otherPage, setOtherPage] = useState(1);
  const [otherPageSize, setOtherPageSize] = useState(50);

  useEffect(() => { setUncatPage(1); }, [search, uncatPageSize]);
  useEffect(() => { setLegacyPage(1); }, [selectedNodeId, search, legacyPageSize]);
  useEffect(() => { setOtherPage(1); }, [selectedNodeId, search, otherPageSize]);

  // Reset selection and collapse state; pre-fill bulk target when selected node is a leaf
  useEffect(() => {
    clearSelection();
    setShowOther(false);
    setShowNode(true);
    if (selectedNodeId && getChildren(tree, selectedNodeId).length === 0) {
      setBulkTarget(selectedNodeId);
    } else {
      setBulkTarget('');
    }
  }, [selectedNodeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedPath = useMemo(
    () => selectedNodeId ? buildPath(tree, selectedNodeId) : null,
    [selectedNodeId, tree]
  );

  const nodeProducts = useMemo(() => {
    if (!selectedNodeId) return [];
    const ids = new Set(getDescendantIds(tree, selectedNodeId));
    return masterProducts.filter(p => p.categoryId && ids.has(p.categoryId));
  }, [selectedNodeId, tree, masterProducts]);

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

  const uncatProducts = useMemo(
    () => masterProducts.filter(p => !p.categoryId && !p.category),
    [masterProducts]
  );

  const allLegacyUncategorized = useMemo(
    () => masterProducts.filter(p => !p.categoryId && !!p.category),
    [masterProducts]
  );

  const filteredNode = useMemo(() => {
    if (!search.trim()) return nodeProducts;
    const tokens = norm(search).split(/\s+/).filter(t => t);
    return nodeProducts.filter(p => {
      const n = norm(p.name);
      const s = norm(p.sku);
      return tokens.every(t => n.includes(t) || s.includes(t));
    });
  }, [nodeProducts, search]);

  const filteredUncat = useMemo(() => {
    const base = [...uncatProducts, ...allLegacyUncategorized];
    if (!search.trim()) return base;
    const tokens = norm(search).split(/\s+/).filter(t => t);
    return base.filter(p => {
      const n = norm(p.name);
      const s = norm(p.sku);
      return tokens.every(t => n.includes(t) || s.includes(t));
    });
  }, [uncatProducts, allLegacyUncategorized, search]);

  const filteredLegacy = useMemo(() => {
    if (!search.trim()) return legacyMatchedProducts;
    const tokens = norm(search).split(/\s+/).filter(t => t);
    return legacyMatchedProducts.filter(p => {
      const n = norm(p.name);
      const s = norm(p.sku);
      return tokens.every(t => n.includes(t) || s.includes(t));
    });
  }, [legacyMatchedProducts, search]);

  // Products that already have a categoryId, but pointing to a DIFFERENT node (not this one or its descendants)
  const otherCatProducts = useMemo(() => {
    if (!selectedNodeId) return [];
    const descendantSet = new Set(getDescendantIds(tree, selectedNodeId));
    return masterProducts.filter(p => p.categoryId && !descendantSet.has(p.categoryId));
  }, [selectedNodeId, tree, masterProducts]);

  const filteredOther = useMemo(() => {
    if (!search.trim()) return otherCatProducts;
    const tokens = norm(search).split(/\s+/).filter(t => t);
    return otherCatProducts.filter(p => {
      const n = norm(p.name);
      const s = norm(p.sku);
      return tokens.every(t => n.includes(t) || s.includes(t));
    });
  }, [otherCatProducts, search]);

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

  const confirmBulkAssign = () => {
    if (!bulkTarget || selectedIds.size === 0) return;
    const updates = [...selectedIds].map(productId => ({ productId, categoryId: bulkTarget }));
    if (onBatchAssignCategory) {
      onBatchAssignCategory(updates);
    } else {
      updates.forEach(u => onAssignCategory(u.productId, u.categoryId));
    }
    clearSelection();
  };

  const renderProduct = (p: MasterProduct, visibleList: MasterProduct[], showNodeBadge = false) => (
    <div key={p.id} className="flex items-center gap-2 px-3 py-2 border-b border-slate-800/60 last:border-0 group hover:bg-slate-800/40 transition-colors">
      <input
        type="checkbox"
        checked={selectedIds.has(p.id)}
        onChange={(e) => handleChange(p.id, (e.nativeEvent as MouseEvent).shiftKey, visibleList)}
        className="w-3.5 h-3.5 shrink-0 cursor-pointer accent-amber-500"
      />
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

  const renderLegacyProduct = (p: MasterProduct, visibleList: MasterProduct[]) => {
    const matchedId = p.category ? findNodeByLegacyPath(tree, p.category) : null;
    return (
      <div key={p.id} className="flex items-center gap-2 px-3 py-2 border-b border-slate-800/60 last:border-0 group hover:bg-slate-800/40 transition-colors">
        <input
          type="checkbox"
          checked={selectedIds.has(p.id)}
          onChange={(e) => handleChange(p.id, (e.nativeEvent as MouseEvent).shiftKey, visibleList)}
          className="w-3.5 h-3.5 shrink-0 cursor-pointer accent-violet-500"
        />
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

  const uncatSlice = filteredUncat.slice((uncatPage - 1) * uncatPageSize, uncatPage * uncatPageSize);
  const legacySlice = filteredLegacy.slice((legacyPage - 1) * legacyPageSize, legacyPage * legacyPageSize);
  const otherSlice = filteredOther.slice((otherPage - 1) * otherPageSize, otherPage * otherPageSize);

  const visibleList = [
    ...(showNode ? filteredNode : []),
    ...(showLegacy ? legacySlice : []),
    ...(showUncat ? uncatSlice : []),
    ...(showOther ? otherSlice : []),
  ];

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

        {/* Bulk assign bar — visible only when products are selected */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 mt-2 px-2 py-1.5 rounded-lg bg-amber-900/20 border border-amber-700/30">
            <span className="text-xs text-amber-300 shrink-0 font-medium whitespace-nowrap">
              {selectedIds.size} selecionado{selectedIds.size !== 1 ? 's' : ''}
            </span>
            <select
              value={bulkTarget}
              onChange={e => setBulkTarget(e.target.value)}
              className="flex-1 min-w-0 bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded px-2 py-1 focus:outline-none focus:border-amber-500"
            >
              <option value="">Selecione categoria...</option>
              {leafOptions.map(o => <option key={o.id} value={o.id}>{o.path}</option>)}
            </select>
            <button
              onClick={confirmBulkAssign}
              disabled={!bulkTarget}
              className="px-3 py-1 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-xs font-medium transition-colors shrink-0"
            >
              Atribuir
            </button>
            <button
              onClick={clearSelection}
              className="p-1 text-slate-500 hover:text-white shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Product list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">

        {/* Stage 1 — Nesta categoria */}
        {selectedNodeId && (
          <div className="flex items-center gap-2 px-4 py-2 bg-emerald-900/15 border-b border-emerald-800/25 shrink-0">
            <input
              type="checkbox"
              checked={showNode && isAllSelected(filteredNode)}
              onChange={() => toggleAll(filteredNode)}
              disabled={!showNode || filteredNode.length === 0}
              className="w-3.5 h-3.5 shrink-0 cursor-pointer accent-emerald-500 disabled:opacity-30"
              title="Selecionar todos desta categoria"
            />
            <button
              onClick={() => setShowNode(v => !v)}
              className="flex items-center gap-2 flex-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showNode ? '' : '-rotate-90'}`} />
              <span className="font-semibold uppercase tracking-wide">Nesta categoria</span>
              <span className="text-emerald-700">— {filteredNode.length} produto{filteredNode.length !== 1 ? 's' : ''}</span>
            </button>
          </div>
        )}
        {showNode && selectedNodeId && filteredNode.length > 0 && (
          <div>{filteredNode.map(p => renderProduct(p, visibleList))}</div>
        )}
        {showNode && selectedNodeId && filteredNode.length === 0 && nodeProducts.length === 0 && !search && legacyMatchedProducts.length === 0 && (
          <div className="px-4 py-3 text-xs text-emerald-900/60">Nenhum produto nesta categoria ainda.</div>
        )}

        {/* Legacy (not yet migrated) products that belong to selected node */}
        {selectedNodeId && filteredLegacy.length > 0 && (
          <div className="border-t border-slate-700/60">
            <div className="flex items-center gap-2 px-3 py-2.5 bg-violet-900/10 border-b border-violet-800/20">
              <input
                type="checkbox"
                checked={showLegacy && isAllSelected(legacySlice)}
                onChange={() => toggleAll(legacySlice)}
                disabled={!showLegacy || legacySlice.length === 0}
                className="w-3.5 h-3.5 shrink-0 cursor-pointer accent-violet-500 disabled:opacity-30"
                title="Selecionar todos desta página"
              />
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
                <div>{legacySlice.map(p => renderLegacyProduct(p, visibleList))}</div>
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

        {/* Stage 2 — Sem categoria */}
        <div className="border-t border-slate-700">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-800/60">
            <input
              type="checkbox"
              checked={showUncat && isAllSelected(uncatSlice)}
              onChange={() => toggleAll(uncatSlice)}
              disabled={!showUncat || uncatSlice.length === 0}
              className="w-3.5 h-3.5 shrink-0 cursor-pointer accent-amber-500 disabled:opacity-30"
              title="Selecionar todos desta página"
            />
            <button
              onClick={() => setShowUncat(v => !v)}
              className="flex items-center gap-2 flex-1 text-xs text-slate-300 hover:text-white transition-colors"
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showUncat ? '' : '-rotate-90'}`} />
              <span className="font-medium">Sem categoria</span>
              <span className="text-slate-500">— {filteredUncat.length} produto{filteredUncat.length !== 1 ? 's' : ''}</span>
            </button>
          </div>
          {showUncat && (
            <>
              <div>
                {uncatSlice.map(p => renderProduct(p, visibleList, false))}
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

        {/* Stage 3 — Em outra categoria (collapsed by default, suppressed) */}
        {selectedNodeId && filteredOther.length > 0 && (
          <div className="border-t border-slate-700/30">
            <div className="flex items-center gap-2 px-4 py-2 bg-slate-900/40">
              <input
                type="checkbox"
                checked={showOther && isAllSelected(otherSlice)}
                onChange={() => toggleAll(otherSlice)}
                disabled={!showOther || otherSlice.length === 0}
                className="w-3.5 h-3.5 shrink-0 cursor-pointer accent-slate-500 disabled:opacity-30"
                title="Selecionar todos desta página"
              />
              <button
                onClick={() => setShowOther(v => !v)}
                className="flex items-center gap-2 flex-1 text-xs text-slate-500 hover:text-slate-400 transition-colors"
              >
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showOther ? '' : '-rotate-90'}`} />
                <span>Em outra categoria</span>
                <span className="text-slate-600">— {filteredOther.length} produto{filteredOther.length !== 1 ? 's' : ''}</span>
              </button>
            </div>
            {showOther && (
              <>
                <div>{otherSlice.map(p => renderProduct(p, visibleList, true))}</div>
                <Pagination
                  total={filteredOther.length}
                  page={otherPage}
                  pageSize={otherPageSize}
                  onPageChange={setOtherPage}
                  onPageSizeChange={setOtherPageSize}
                />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CategoryProductList;
