import React, { useRef, useCallback } from 'react';
import { MasterProduct } from '../../types';
import { Plus, Minus, Package2 } from 'lucide-react';

// ─── Props ────────────────────────────────────────────────────────────────────

interface InventoryCountItemProps {
  product: MasterProduct;
  count: number | undefined;
  showSystemStock: boolean;
  onIncrement: (id: string) => void;
  onDecrement: (id: string) => void;
  onChangeManual: (id: string, value: string) => void;
  lastCountedAt?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const InventoryCountItem: React.FC<InventoryCountItemProps> = ({
  product,
  count,
  showSystemStock,
  onIncrement,
  onDecrement,
  onChangeManual,
  lastCountedAt,
}) => {
  const isCounted = count !== undefined;
  const displayCount = count ?? 0;
  const inputRef = useRef<HTMLInputElement>(null);

  const formattedTimestamp = lastCountedAt ? (() => {
    const d = new Date(lastCountedAt);
    const localDateStr = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
    const isToday = localDateStr(new Date(lastCountedAt)) === localDateStr(new Date());
    const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const date = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    return isToday ? `Contado hoje às ${time}` : `Contado ${date} às ${time}`;
  })() : null;

  // Focus the input on card tap (anywhere outside buttons)
  const handleCardClick = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <div
      onClick={handleCardClick}
      className={`
        relative flex items-center gap-3 px-3 py-2.5 rounded-xl border
        transition-all duration-150 cursor-pointer select-none
        ${isCounted
          ? 'bg-amber-600/[0.08] border-amber-600/30 shadow-[0_0_0_1px_rgba(217,119,6,0.15)]'
          : 'bg-slate-900 border-slate-800 hover:border-slate-700 hover:bg-slate-800/60'
        }
      `}
    >
      {/* Counted indicator bar */}
      {isCounted && (
        <div className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-amber-500" />
      )}

      {/* Product image / fallback icon */}
      <div className="shrink-0 w-10 h-10 rounded-lg overflow-hidden bg-slate-800 border border-slate-700 flex items-center justify-center">
        {product.image ? (
          <img
            src={product.image}
            alt={product.name}
            className="w-full h-full object-contain p-0.5"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <Package2 size={16} className="text-slate-600" />
        )}
      </div>

      {/* Product info — flex-1 with min-w-0 to prevent overflow */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-200 truncate leading-tight">
          {product.name}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="font-mono text-[10px] text-slate-500 bg-slate-800 px-1.5 py-px rounded border border-slate-700">
            {product.sku}
          </span>
          {product.category && (
            <span className="text-[10px] text-slate-500 truncate max-w-[120px]">
              {product.category}
            </span>
          )}
          {showSystemStock && product.stock !== undefined && (
            <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-px rounded border border-slate-700">
              Sist: <span className="text-slate-300 font-medium">{product.stock}</span>
            </span>
          )}
        </div>
        {formattedTimestamp && (
          <span className="text-[10px] text-amber-600/70 mt-0.5 block leading-none">
            {formattedTimestamp}
          </span>
        )}
      </div>

      {/* Counter controls */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onDecrement(product.id); }}
          className={`
            w-8 h-8 rounded-lg flex items-center justify-center border transition-all active:scale-90
            ${isCounted
              ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-red-900/40 hover:border-red-700/50 hover:text-red-400'
              : 'bg-slate-800 border-slate-700 text-slate-600 cursor-default'
            }
          `}
          aria-label="Diminuir"
        >
          <Minus size={13} />
        </button>

        <input
          ref={inputRef}
          type="number"
          min="0"
          value={isCounted ? displayCount : ''}
          onChange={e => onChangeManual(product.id, e.target.value)}
          onClick={e => e.stopPropagation()}
          placeholder="—"
          className={`
            w-14 h-8 text-center text-sm font-bold rounded-lg border-2 transition-all outline-none
            bg-slate-950 tabular-nums
            [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
            ${isCounted
              ? 'border-amber-600/60 text-amber-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20'
              : 'border-slate-700 text-slate-600 placeholder:text-slate-700 focus:border-amber-600/40 focus:text-amber-300'
            }
          `}
        />

        <button
          type="button"
          onClick={e => { e.stopPropagation(); onIncrement(product.id); }}
          className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-600 border border-amber-500 text-white hover:bg-amber-500 active:scale-90 transition-all shadow-sm shadow-amber-900/30"
          aria-label="Aumentar"
        >
          <Plus size={13} />
        </button>
      </div>
    </div>
  );
};
