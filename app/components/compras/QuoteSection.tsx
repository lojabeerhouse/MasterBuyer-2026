import React from 'react';
import { ProductQuote } from '../../types';
import { ChevronDown, CheckSquare, Square } from 'lucide-react';

const COLOR_CLASSES = {
  orange: {
    wrapper: 'border border-orange-900/30 bg-orange-950/5',
    header: 'bg-orange-950/20',
    title: 'text-orange-400',
    chevron: 'text-orange-700',
    divider: 'divide-orange-900/20',
    theadBorder: 'border-orange-900/20',
    theadBg: 'bg-orange-950/5',
  },
  yellow: {
    wrapper: 'border border-yellow-900/30 bg-yellow-950/5',
    header: 'bg-yellow-950/20',
    title: 'text-yellow-400',
    chevron: 'text-yellow-700',
    divider: 'divide-yellow-900/20',
    theadBorder: 'border-yellow-900/20',
    theadBg: 'bg-yellow-950/5',
  },
  blue: {
    wrapper: 'border border-blue-900/20 bg-blue-950/5',
    header: 'bg-blue-950/20',
    title: 'text-blue-400',
    chevron: 'text-blue-700',
    divider: 'divide-blue-900/20',
    theadBorder: 'border-blue-900/20',
    theadBg: 'bg-blue-950/5',
  },
  emerald: {
    wrapper: 'border border-emerald-900/20 bg-emerald-950/5 opacity-80 hover:opacity-100 transition-opacity',
    header: 'bg-emerald-950/20',
    title: 'text-emerald-400',
    chevron: 'text-emerald-700',
    divider: 'divide-emerald-900/20',
    theadBorder: 'border-emerald-900/20',
    theadBg: 'bg-emerald-950/5',
  },
  violet: {
    wrapper: 'border border-violet-900/20 bg-violet-950/5',
    header: 'bg-violet-950/20',
    title: 'text-violet-400',
    chevron: 'text-violet-700',
    divider: 'divide-violet-900/20',
    theadBorder: 'border-violet-900/20',
    theadBg: 'bg-violet-950/5',
  },
} as const;

export type QuoteSectionColor = keyof typeof COLOR_CLASSES;

interface QuoteSectionProps {
  title: string;
  count: number;
  icon: React.ReactNode;
  colorVariant: QuoteSectionColor;
  isCollapsed: boolean;
  onToggle: () => void;
  items: Array<{ item: ProductQuote; originalIndex: number }>;
  selectedItems: Set<number>;
  onToggleSelectAll: (indices: number[]) => void;
  batchId: string;
  renderRow: (item: ProductQuote, originalIndex: number, batchId: string) => React.ReactNode;
  emptyMessage?: string;
}

const QuoteSection: React.FC<QuoteSectionProps> = ({
  title,
  count,
  icon,
  colorVariant,
  isCollapsed,
  onToggle,
  items,
  selectedItems,
  onToggleSelectAll,
  batchId,
  renderRow,
  emptyMessage,
}) => {
  const c = COLOR_CLASSES[colorVariant];
  const indices = items.map(p => p.originalIndex);
  const isAllSelected = indices.length > 0 && indices.every(i => selectedItems.has(i));

  return (
    <div className={`rounded-xl overflow-hidden ${c.wrapper}`}>
      <div
        className={`p-3.5 ${c.header} flex justify-between items-center cursor-pointer`}
        onClick={onToggle}
      >
        <h4 className={`font-bold ${c.title} flex items-center gap-2.5 text-sm uppercase tracking-tight`}>
          {icon} {title} ({count})
        </h4>
        <ChevronDown className={`w-4 h-4 ${c.chevron} transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
      </div>

      {!isCollapsed && (
        items.length === 0 && emptyMessage
          ? <div className="p-10 text-center text-slate-600 text-xs italic">{emptyMessage}</div>
          : (
            <table className="w-full text-left text-sm text-slate-300">
              <thead className={`${c.theadBg} text-[10px] uppercase font-bold tracking-widest text-slate-500 border-b ${c.theadBorder}`}>
                <tr>
                  <th className="p-2 text-center w-10">
                    <button
                      onClick={() => onToggleSelectAll(indices)}
                      className="hover:text-amber-400 transition-colors"
                    >
                      {isAllSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                    </button>
                  </th>
                  <th className="p-2">Produto</th>
                  <th className="p-2 text-center w-20">Emb.</th>
                  <th className="p-2 text-center w-14">Modo</th>
                  <th className="p-2 text-right w-24">Lote (R$)</th>
                  <th className="p-2 text-right w-24">Unit. (R$)</th>
                  <th className="p-2 text-center w-28">Ações</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${c.divider}`}>
                {items.map(x => renderRow(x.item, x.originalIndex, batchId))}
              </tbody>
            </table>
          )
      )}
    </div>
  );
};

export default QuoteSection;
