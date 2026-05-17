import React, { useState } from 'react';
import { CategoryTree, CategoryNode } from '../../types';
import {
  getChildren, hasChildren,
  addCategoryNode, renameCategoryNode, deleteCategoryNode, moveCategoryNode, buildPath,
} from '../../services/category_manager/categoryService';
import {
  ChevronDown, ChevronRight, Plus, Pencil, Trash2, Check, X, MoveRight,
} from 'lucide-react';

interface Props {
  id: string;
  tree: CategoryTree;
  depth: number;
  productCountByNode: Record<string, number>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onTreeChange: (tree: CategoryTree) => void;
}

const CategoryTreeNode: React.FC<Props> = ({
  id, tree, depth, productCountByNode, selectedId, onSelect, onTreeChange,
}) => {
  const node = tree[id];
  const children = getChildren(tree, id);
  const [expanded, setExpanded] = useState(depth === 0);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(node?.nome ?? '');
  const [addingChild, setAddingChild] = useState(false);
  const [newChildName, setNewChildName] = useState('');
  const [moving, setMoving] = useState(false);
  const [moveTarget, setMoveTarget] = useState<string>('__root__');

  if (!node) return null;

  const productCount = productCountByNode[id] ?? 0;
  const hasKids = hasChildren(tree, id);
  const isSelected = selectedId === id;

  const confirmRename = () => {
    if (!editValue.trim() || editValue.trim() === node.nome) { setEditing(false); return; }
    onTreeChange(renameCategoryNode(tree, id, editValue.trim()));
    setEditing(false);
  };

  const confirmDelete = () => {
    if (hasKids) return;
    if (productCount > 0 && !confirm(`"${node.nome}" tem ${productCount} produto(s). Remover mesmo assim?`)) return;
    onTreeChange(deleteCategoryNode(tree, id));
  };

  const confirmAddChild = () => {
    if (!newChildName.trim()) return;
    const { tree: next } = addCategoryNode(tree, newChildName.trim(), id);
    onTreeChange(next);
    setNewChildName('');
    setAddingChild(false);
    setExpanded(true);
  };

  const confirmMove = () => {
    const newPai = moveTarget === '__root__' ? null : moveTarget;
    onTreeChange(moveCategoryNode(tree, id, newPai));
    setMoving(false);
  };

  // Options for the move dropdown: all nodes except this node and its descendants
  const moveOptions = (Object.entries(tree) as [string, CategoryNode][]).filter(([oid]) => {
    if (oid === id) return false;
    // Avoid cycles: don't allow moving to a descendant
    let cur: string | null = tree[oid].pai;
    const visited = new Set<string>();
    while (cur && !visited.has(cur)) {
      if (cur === id) return false;
      visited.add(cur);
      cur = tree[cur]?.pai ?? null;
    }
    return true;
  });

  const indent = depth * 16;

  return (
    <div>
      <div
        className={`flex items-center gap-1 px-2 py-1.5 rounded-lg cursor-pointer group transition-colors ${isSelected ? 'bg-amber-900/30 border border-amber-700/40' : 'hover:bg-slate-800'}`}
        style={{ paddingLeft: `${8 + (node.pai !== null ? Math.max(0, indent - 14) : indent)}px` }}
        onClick={() => { onSelect(id); if (hasKids) setExpanded(v => !v); }}
      >
        {/* Left reparent icon — subcategories only, uses the indent space */}
        {node.pai !== null && (
          <button
            onClick={e => { e.stopPropagation(); setMoving(v => !v); }}
            className="w-3.5 h-3.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-slate-500 hover:text-violet-400 flex items-center justify-center"
            title="Mover para outra categoria pai"
          >
            <MoveRight className="w-3 h-3" />
          </button>
        )}

        {/* Expand chevron */}
        <span className="w-4 h-4 shrink-0 text-slate-600">
          {hasKids
            ? expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
            : <span className="w-4 h-4 block" />}
        </span>

        {/* Name / edit */}
        {editing ? (
          <input
            autoFocus
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') setEditing(false); }}
            onClick={e => e.stopPropagation()}
            className="flex-1 bg-slate-900 border border-amber-600 text-white text-xs rounded px-2 py-0.5 focus:outline-none"
          />
        ) : (
          <span className={`flex-1 text-sm truncate ${isSelected ? 'text-amber-300 font-medium' : 'text-slate-200'}`}>
            {node.nome}
          </span>
        )}

        {/* Product count badge */}
        {productCount > 0 && !editing && (
          <span className="text-[10px] text-slate-500 shrink-0">{productCount}</span>
        )}

        {/* Action buttons (show on hover or when editing) */}
        <div className={`flex items-center gap-0.5 shrink-0 ${editing ? 'flex' : 'hidden group-hover:flex'}`} onClick={e => e.stopPropagation()}>
          {editing ? (
            <>
              <button onClick={confirmRename} className="p-1 text-emerald-400 hover:text-emerald-300"><Check className="w-3.5 h-3.5" /></button>
              <button onClick={() => { setEditing(false); setEditValue(node.nome); }} className="p-1 text-slate-500 hover:text-white"><X className="w-3.5 h-3.5" /></button>
            </>
          ) : (
            <>
              <button onClick={() => { setEditing(true); setEditValue(node.nome); }} className="p-1 text-slate-500 hover:text-amber-400" title="Renomear"><Pencil className="w-3 h-3" /></button>
              <button onClick={() => setAddingChild(true)} className="p-1 text-slate-500 hover:text-blue-400" title="Adicionar subcategoria"><Plus className="w-3 h-3" /></button>
              {node.pai === null && (
                <button onClick={() => setMoving(v => !v)} className="p-1 text-slate-500 hover:text-violet-400" title="Mover"><MoveRight className="w-3 h-3" /></button>
              )}
              {!hasKids && (
                <button onClick={confirmDelete} className="p-1 text-slate-500 hover:text-red-400" title="Excluir"><Trash2 className="w-3 h-3" /></button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Move picker */}
      {moving && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/60 rounded-lg mx-2 mb-1" onClick={e => e.stopPropagation()}>
          <span className="text-[11px] text-slate-500 shrink-0">Mover para:</span>
          <select
            value={moveTarget}
            onChange={e => setMoveTarget(e.target.value)}
            className="flex-1 bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded px-2 py-1 focus:outline-none focus:border-amber-500"
          >
            <option value="__root__">Raiz (nível superior)</option>
            {moveOptions
              .sort((a, b) => buildPath(tree, a[0]).localeCompare(buildPath(tree, b[0]), 'pt-BR', { numeric: true }))
              .map(([oid]) => (
                <option key={oid} value={oid}>{buildPath(tree, oid)}</option>
              ))
            }
          </select>
          <button onClick={confirmMove} className="text-emerald-400 hover:text-emerald-300 p-1"><Check className="w-3.5 h-3.5" /></button>
          <button onClick={() => setMoving(false)} className="text-slate-500 hover:text-white p-1"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Add child input */}
      {addingChild && (
        <div className="flex items-center gap-2 px-3 py-1.5" style={{ paddingLeft: `${8 + indent + 20}px` }} onClick={e => e.stopPropagation()}>
          <input
            autoFocus
            placeholder="Nome da subcategoria..."
            value={newChildName}
            onChange={e => setNewChildName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') confirmAddChild(); if (e.key === 'Escape') setAddingChild(false); }}
            className="flex-1 bg-slate-900 border border-blue-600/50 text-white text-xs rounded px-2 py-1 focus:outline-none focus:border-blue-500"
          />
          <button onClick={confirmAddChild} className="text-emerald-400 hover:text-emerald-300 p-1"><Check className="w-3.5 h-3.5" /></button>
          <button onClick={() => setAddingChild(false)} className="text-slate-500 hover:text-white p-1"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Children */}
      {expanded && children.map(childId => (
        <CategoryTreeNode
          key={childId}
          id={childId}
          tree={tree}
          depth={depth + 1}
          productCountByNode={productCountByNode}
          selectedId={selectedId}
          onSelect={onSelect}
          onTreeChange={onTreeChange}
        />
      ))}
    </div>
  );
};

export default CategoryTreeNode;
