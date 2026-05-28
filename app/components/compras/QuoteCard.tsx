import React from 'react';
import { QuoteBatch } from '../../types';
import { Archive, CheckCircle, AlertCircle, Loader2, FileText, Download, Trash2, Maximize2, Clock, Bot } from 'lucide-react';

export interface QuoteCardProps {
  quote: QuoteBatch;
  supplierId: string;
  onViewRaw: (content: string, fileName: string, supplierId: string) => void;
  onDownloadCsv: (quote: QuoteBatch) => void;
  onRemove: (supplierId: string, quoteId: string) => void;
  onOpen: (quote: QuoteBatch) => void;
  onDownloadArchived: (quote: QuoteBatch) => void;
}

const QuoteCard = React.memo<QuoteCardProps>(({ quote, supplierId, onViewRaw, onDownloadCsv, onRemove, onOpen, onDownloadArchived }) => {
  if (quote.archivedCsv) {
    return (
      <div className="flex items-center gap-3 px-3 py-2 bg-slate-900/50 border border-slate-800 rounded text-xs text-slate-500 group hover:border-slate-700 transition-all">
        <Archive className="w-3.5 h-3.5 text-slate-600 shrink-0" />
        <span className="text-slate-500 truncate flex-1">
          {quote.sourceType === 'file' ? quote.fileName : 'Texto Colado'}
        </span>
        <span className="text-slate-600 whitespace-nowrap">
          {new Date(quote.timestamp).toLocaleDateString('pt-BR')}
        </span>
        <span className="text-slate-600 whitespace-nowrap">
          {quote.archivedItemCount ?? '?'} itens
        </span>
        <span className="text-slate-700 text-[10px] whitespace-nowrap italic">Arquivado</span>
        <button onClick={() => onDownloadArchived(quote)} title="Baixar CSV" className="text-slate-600 hover:text-blue-400 p-0.5 opacity-0 group-hover:opacity-100 transition-all">
          <Download className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => onRemove(supplierId, quote.id)} title="Apagar" className="text-slate-600 hover:text-red-400 p-0.5 opacity-0 group-hover:opacity-100 transition-all">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-700 rounded p-4 relative group hover:border-amber-500/30 transition-all">
      <div className="absolute top-2 right-2 flex items-center gap-1">
        {quote.rawContent && (
          <button
            onClick={(e) => { e.stopPropagation(); onViewRaw(quote.rawContent!, quote.fileName ?? 'texto', supplierId); }}
            className="text-slate-600 hover:text-amber-400 p-1"
            title="Ver texto bruto"
          >
            <FileText className="w-4 h-4" />
          </button>
        )}
        {quote.status === 'completed' && (
          <button onClick={() => onDownloadCsv(quote)} className="text-slate-600 hover:text-blue-400 p-1" title="Baixar CSV para re-uso">
            <Download className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(supplierId, quote.id); }}
          className="text-slate-600 hover:text-red-400 p-1"
          title="Apagar Cotação"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-start gap-3">
        <div className="mt-1">
          {quote.status === 'analyzing' && <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />}
          {quote.status === 'completed' && <CheckCircle className="w-5 h-5 text-green-500" />}
          {quote.status === 'error' && <AlertCircle className="w-5 h-5 text-red-500" />}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-slate-200">
              {quote.sourceType === 'file' ? `Arquivo: ${quote.fileName}` : 'Texto Colado'}
            </span>
            <span className="text-xs text-slate-500">
              {new Date(quote.timestamp).toLocaleString('pt-BR')}
            </span>
            {quote.uploadedAt && quote.uploadedAt !== quote.timestamp && (
              <span className="text-[9px] text-slate-700">
                upload: {new Date(quote.uploadedAt).toLocaleString('pt-BR')}
              </span>
            )}
          </div>

          {quote.status === 'completed' && (
            <div className="mt-2">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <p className="text-sm text-slate-400">{quote.items.length} itens identificados.</p>
                  {quote.items.filter(i => i.isReprocessed).length > 0 && (
                    <span className="flex items-center gap-1 text-[10px] bg-blue-950/60 text-blue-400 border border-blue-900/40 px-1.5 py-0.5 rounded-full" title="Itens com lote ajustado por regra de embalagem">
                      <Bot className="w-2.5 h-2.5" /> {quote.items.filter(i => i.isReprocessed).length} lotes
                    </span>
                  )}
                </div>
                <button
                  onClick={() => onOpen(quote)}
                  className="text-xs flex items-center gap-1 text-amber-500 hover:text-amber-400 font-medium"
                >
                  <Maximize2 className="w-3 h-3" /> Ver Lista Completa
                </button>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 mt-2 opacity-80">
                {quote.items.slice(0, 4).map((item, idx) => (
                  <div key={idx} className="bg-slate-800 px-2 py-1.5 rounded border border-slate-700 text-xs flex justify-between items-center">
                    <span className="font-medium text-slate-300 truncate mr-2 flex-1">{item.name}</span>
                    <div className="text-right whitespace-nowrap">
                      <span className="text-amber-500 font-bold block">R$ {item.unitPrice.toFixed(2)} un</span>
                    </div>
                  </div>
                ))}
                {quote.items.length > 4 && <span className="text-xs pt-1 text-slate-500 italic pl-1">...mais {quote.items.length - 4} itens (clique em ver lista)</span>}
              </div>
            </div>
          )}
          {quote.status === 'completed' && !quote.isSaved && (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-950/70 border-t border-amber-900/50 rounded-b-lg">
              <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-xs font-bold text-amber-400 tracking-wide uppercase">
                Cotação aguardando conferência —{' '}
                <span className="font-semibold">Salve a lista para entrada no sistema</span>
              </span>
            </div>
          )}
          {quote.status === 'error' && (
            <p className="text-red-400 text-sm mt-1">{quote.errorMessage}</p>
          )}
        </div>
      </div>
    </div>
  );
}, (prev, next) => prev.quote === next.quote && prev.supplierId === next.supplierId);

export default QuoteCard;
