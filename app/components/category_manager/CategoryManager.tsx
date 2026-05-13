import React, { useMemo, useState } from 'react';
import { CategoryTree, MasterProduct } from '../../types';
import {
  getChildren, addCategoryNode, importFromLegacyStrings,
} from '../../services/category_manager/categoryService';
import CategoryTreeNode from './CategoryTreeNode';
import CategoryProductList from './CategoryProductList';
import { Tag, Plus, Download, X, Check } from 'lucide-react';

interface Props {
  categoryTree: CategoryTree;
  masterProducts: MasterProduct[];
  onSaveCategoryTree: (tree: CategoryTree) => void;
  onUpdateMasterProducts: (products: MasterProduct[]) => void;
}

const CategoryManager: React.FC<Props> = ({
  categoryTree, masterProducts, onSaveCategoryTree, onUpdateMasterProducts,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newRootName, setNewRootName] = useState('');
  const [addingRoot, setAddingRoot] = useState(false);
  const [importConfirm, setImportConfirm] = useState(false);

  // Count products per node (direct assignment only; display uses descendants)
  const productCountByNode = useMemo<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    masterProducts.forEach(p => {
      if (p.categoryId) counts[p.categoryId] = (counts[p.categoryId] ?? 0) + 1;
    });
    return counts;
  }, [masterProducts]);

  const rootNodes = useMemo(() => getChildren(categoryTree, null), [categoryTree]);

  const handleTreeChange = (next: CategoryTree) => onSaveCategoryTree(next);

  const confirmAddRoot = () => {
    if (!newRootName.trim()) return;
    const { tree: next } = addCategoryNode(categoryTree, newRootName.trim(), null);
    onSaveCategoryTree(next);
    setNewRootName('');
    setAddingRoot(false);
  };

  // Legacy import: build tree from masterCategory strings
  const legacyCategories = useMemo(
    () => [...new Set(masterProducts.map(p => p.category).filter((c): c is string => !!c))],
    [masterProducts]
  );

  const handleLegacyImport = () => {
    const next = importFromLegacyStrings(categoryTree, legacyCategories);
    onSaveCategoryTree(next);
    setImportConfirm(false);
  };

  const handleAssignCategory = (productId: string, categoryId: string | undefined) => {
    onUpdateMasterProducts(
      masterProducts.map(p => p.id === productId ? { ...p, categoryId } : p)
    );
  };

  const handleBatchAssignCategory = (updates: Array<{ productId: string; categoryId: string }>) => {
    const map = new Map(updates.map(u => [u.productId, u.categoryId]));
    onUpdateMasterProducts(
      masterProducts.map(p => map.has(p.id) ? { ...p, categoryId: map.get(p.id) } : p)
    );
  };

  const hasUnimportedLegacy = useMemo(() => {
    if (!legacyCategories.length) return false;
    const result = importFromLegacyStrings(categoryTree, legacyCategories);
    return Object.keys(result).length > Object.keys(categoryTree).length;
  }, [categoryTree, legacyCategories]);

  const nodeCount = Object.keys(categoryTree).length;
  const categorizedCount = masterProducts.filter(p => p.categoryId).length;

  return (
    <div className="h-full flex flex-col gap-0 overflow-hidden">

      {/* Header */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 shrink-0 mb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Tag className="w-5 h-5 text-amber-500" /> Categorias de Produtos
            </h2>
            <p className="text-slate-400 text-xs mt-0.5">
              {nodeCount} categoria{nodeCount !== 1 ? 's' : ''} · {categorizedCount}/{masterProducts.length} produto{masterProducts.length !== 1 ? 's' : ''} categorizados
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasUnimportedLegacy && !importConfirm && (
              <button
                onClick={() => setImportConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-slate-700 bg-slate-900 text-slate-400 hover:text-white transition-colors"
                title="Importar categorias do campo legado '>>' dos produtos"
              >
                <Download className="w-3.5 h-3.5" /> Importar legado ({legacyCategories.length})
              </button>
            )}
            {importConfirm && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-amber-700/40 bg-amber-900/20 text-xs text-amber-300">
                <span>Importar {legacyCategories.length} categorias do campo antigo?</span>
                <button onClick={handleLegacyImport} className="text-emerald-400 hover:text-emerald-300 p-0.5"><Check className="w-3.5 h-3.5" /></button>
                <button onClick={() => setImportConfirm(false)} className="text-slate-500 hover:text-white p-0.5"><X className="w-3.5 h-3.5" /></button>
              </div>
            )}
            <button
              onClick={() => setAddingRoot(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-amber-600 hover:bg-amber-500 text-white font-medium transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Nova categoria raiz
            </button>
          </div>
        </div>

        {addingRoot && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-700">
            <input
              autoFocus
              placeholder="Nome da categoria raiz..."
              value={newRootName}
              onChange={e => setNewRootName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmAddRoot(); if (e.key === 'Escape') setAddingRoot(false); }}
              className="flex-1 bg-slate-900 border border-amber-600/50 text-white text-sm rounded-lg px-3 py-2 focus:border-amber-500 focus:outline-none"
            />
            <button onClick={confirmAddRoot} disabled={!newRootName.trim()} className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-sm font-medium transition-colors">
              Criar
            </button>
            <button onClick={() => setAddingRoot(false)} className="p-2 text-slate-500 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Main content: tree + product list */}
      <div className="flex-1 flex gap-3 overflow-hidden min-h-0">

        {/* Left: Category tree */}
        <div className="w-72 shrink-0 bg-slate-800 border border-slate-700 rounded-xl flex flex-col overflow-hidden">
          <div className="px-3 py-2.5 border-b border-slate-700 shrink-0">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Árvore de Categorias</p>
          </div>
          <div className="flex-1 overflow-y-auto py-2 custom-scrollbar">
            {rootNodes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-600 px-4 text-center">
                <Tag className="w-8 h-8 opacity-20 mb-2" />
                <p className="text-xs">Nenhuma categoria ainda.</p>
                <p className="text-xs mt-1">Clique em "Nova categoria raiz" para começar.</p>
              </div>
            ) : (
              rootNodes.map(id => (
                <CategoryTreeNode
                  key={id}
                  id={id}
                  tree={categoryTree}
                  depth={0}
                  productCountByNode={productCountByNode}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onTreeChange={handleTreeChange}
                />
              ))
            )}
          </div>
        </div>

        {/* Right: Product list for selected node */}
        <div className="flex-1 bg-slate-800 border border-slate-700 rounded-xl overflow-hidden min-w-0">
          <CategoryProductList
            selectedNodeId={selectedId}
            tree={categoryTree}
            masterProducts={masterProducts}
            onAssignCategory={handleAssignCategory}
            onBatchAssignCategory={handleBatchAssignCategory}
          />
        </div>
      </div>
    </div>
  );
};

export default CategoryManager;
