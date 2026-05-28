import React from 'react';
import { ProductQuote, ProductMapping, MasterProduct } from '../../types';
import {
  Trash2, CheckCircle, Ban, Pencil, X,
  Coins, BoxSelect, AlertTriangle, Bot, Search, Link2, Unlink,
  Star, RotateCcw,
} from 'lucide-react';
import { getItemCategory } from '../../services/compras/itemCategorizationService';
import { normForMapping } from '../../services/compras/supplierCatalogService';

interface ItemRowProps {
  item: ProductQuote;
  idx: number;
  batchId: string;

  // Derived state (pre-computed by parent)
  isSelected: boolean;
  rowAnimationType: 'ban' | 'delete' | undefined;
  isEditingName: boolean;
  tempItemName: string;
  suggestion: { sku: string; name: string; score: number } | undefined;
  isDismissed: boolean;

  // External data
  productMappings?: ProductMapping[];
  masterProducts?: MasterProduct[];
  seenNames: Set<string>;

  // Direct setters
  setTempItemName: React.Dispatch<React.SetStateAction<string>>;
  setEditingItemId: React.Dispatch<React.SetStateAction<number | null>>;
  setLinkingItem: React.Dispatch<React.SetStateAction<ProductQuote | null>>;
  setDismissedSuggestions: React.Dispatch<React.SetStateAction<Set<string>>>;

  // Callbacks
  toggleSelection: (idx: number) => void;
  startEditingItem: (idx: number, name: string) => void;
  saveItemName: (batchId: string, idx: number, name: string) => void;
  updateItemPackQuantityLocal: (idx: number, value: number) => void;
  flushItemPackQuantity: (idx: number) => void;
  updateItemStrategy: (batchId: string, idx: number, strategy: 'pack' | 'unit') => void;
  updateItemPriceLocal: (idx: number, value: number) => void;
  flushItemPrice: (idx: number) => void;
  toggleItemNovelty: (batchId: string, idx: number, value: boolean) => void;
  handleRequestAction: (type: 'ban' | 'delete', batchId: string, idx: number, name: string) => void;
  computeSuggestionForItem: (idx: number, name: string) => void;
  onAddMapping?: (name: string, sku: string, type?: 'master' | 'supplier', targetName?: string, supplierSku?: string) => void;
  onRemoveMapping?: (name: string) => void;
}

const ItemRow: React.FC<ItemRowProps> = ({
  item, idx, batchId,
  isSelected, rowAnimationType, isEditingName, tempItemName, suggestion, isDismissed,
  productMappings, masterProducts, seenNames,
  setTempItemName, setEditingItemId, setLinkingItem, setDismissedSuggestions,
  toggleSelection, startEditingItem, saveItemName,
  updateItemPackQuantityLocal, flushItemPackQuantity,
  updateItemStrategy, updateItemPriceLocal, flushItemPrice,
  toggleItemNovelty, handleRequestAction, computeSuggestionForItem,
  onAddMapping, onRemoveMapping,
}) => {
  if (rowAnimationType) {
    return (
      <tr className="relative h-16 overflow-hidden">
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

  const isVerified = item.isVerified;
  const isReprocessed = item.isReprocessed;
  const category = getItemCategory(item, productMappings, masterProducts, seenNames);
  const hasSuggestion = !!suggestion && !isDismissed && category !== 'green' && category !== 'novelty';
  const suggestionScore = hasSuggestion ? suggestion!.score : 0;
  const suggestionTier: 'high' | 'low' | 'none' = hasSuggestion
    ? suggestionScore >= 85 ? 'high' : 'low'
    : 'none';

  return (
    <tr
      onMouseEnter={() => { if (category !== 'green' && category !== 'novelty') computeSuggestionForItem(idx, item.name); }}
      className={`group border-b border-slate-800/30 last:border-0 transition-colors ${isSelected ? 'bg-amber-900/20' : 'hover:bg-slate-800/40'}`}
    >
      {/* Checkbox + Auto */}
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

      {/* Nome + Zona de Status */}
      <td className="px-2 py-1.5">
        {isEditingName ? (
          <div className="flex items-center gap-1.5">
            <input autoFocus value={tempItemName} onChange={(e) => setTempItemName(e.target.value)}
              className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-white text-sm w-full focus:outline-none focus:border-amber-500"
              onKeyDown={(e) => { if (e.key === 'Enter') saveItemName(batchId, idx, tempItemName); if (e.key === 'Escape') setEditingItemId(null); }} />
            <button onClick={() => saveItemName(batchId, idx, tempItemName)} className="text-green-500"><CheckCircle className="w-4 h-4" /></button>
            <button onClick={() => setEditingItemId(null)} className="text-red-500"><X className="w-4 h-4" /></button>
          </div>
        ) : (
          <div>
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
          {category !== 'green' && (
            <button onClick={() => setLinkingItem(item)}
              className="text-slate-600 hover:text-amber-400 p-1.5 rounded hover:bg-amber-950/20 transition-all"
              title="Vincular ao catálogo master">
              <Link2 className="w-3.5 h-3.5" />
            </button>
          )}
          {category === 'green' && (
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

export default ItemRow;
