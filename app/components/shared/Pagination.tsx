import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
}

const DEFAULT_OPTIONS = [50, 100, 200];

function buildPageWindow(current: number, total: number): (number | '…')[] {
  if (total <= 1) return [1];
  if (total <= 6) return Array.from({ length: total }, (_, i) => i + 1);

  const window: (number | '…')[] = [];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);

  window.push(1);
  if (left > 2) window.push('…');
  for (let p = left; p <= right; p++) window.push(p);
  if (right < total - 1) window.push('…');
  window.push(total);

  return window;
}

const Pagination: React.FC<Props> = ({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_OPTIONS,
}) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = Math.min((page - 1) * pageSize + 1, total);
  const end = Math.min(page * pageSize, total);

  if (total <= pageSize && pageSizeOptions[0] >= total) return null;

  const pageWindow = buildPageWindow(page, totalPages);
  const isFirst = page === 1;
  const isLast = page === totalPages;

  return (
    <div className="flex items-center justify-between px-3 h-10 border-t border-slate-800 bg-slate-900/50 shrink-0 gap-2">
      {/* Left: context */}
      <span className="text-[12px] text-slate-500 shrink-0 whitespace-nowrap">
        {start}–{end} de {total}
      </span>

      {/* Center: navigation */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={isFirst}
          className="flex items-center gap-1 px-2 h-8 rounded text-[13px] text-slate-400 border border-slate-700 hover:border-slate-500 hover:text-white transition-colors disabled:opacity-35 disabled:pointer-events-none"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Ant
        </button>

        {pageWindow.map((p, i) =>
          p === '…' ? (
            <span key={`ellipsis-${i}`} className="w-8 h-8 flex items-center justify-center text-[13px] text-slate-600">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p as number)}
              className={`w-8 h-8 rounded text-[13px] border transition-colors ${
                p === page
                  ? 'bg-amber-600 border-amber-600 text-white font-medium'
                  : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white'
              }`}
            >
              {p}
            </button>
          )
        )}

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={isLast}
          className="flex items-center gap-1 px-2 h-8 rounded text-[13px] text-slate-400 border border-slate-700 hover:border-slate-500 hover:text-white transition-colors disabled:opacity-35 disabled:pointer-events-none"
        >
          Próx <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Right: density */}
      {total > pageSizeOptions[0] && (
        <select
          value={pageSize}
          onChange={e => onPageSizeChange(Number(e.target.value))}
          className="h-8 bg-slate-800 border border-slate-700 text-slate-400 text-[12px] rounded px-1.5 focus:outline-none focus:border-amber-500 shrink-0"
        >
          {pageSizeOptions.map(o => (
            <option key={o} value={o}>{o} / pág</option>
          ))}
        </select>
      )}
    </div>
  );
};

export default Pagination;
