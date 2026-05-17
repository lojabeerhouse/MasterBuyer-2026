import React, { useRef, useEffect } from 'react';
import { Terminal, Trash2, Maximize2, CheckCircle, Clock, X, AlertTriangle, Info } from 'lucide-react';
import { AppLog, LogLevel } from '../../types';

interface LogViewerProps {
  logs: AppLog[];
  onClose: () => void;
  onClear: () => void;
  onExpand: () => void;
}

const timeAgo = (ts: number) => {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}m`;
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

const getLevelStyles = (level: LogLevel) => {
  switch (level) {
    case 'success': return { text: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: <CheckCircle className="w-3 h-3 text-emerald-500" /> };
    case 'error': return { text: 'text-red-400', bg: 'bg-red-500/10', icon: <X className="w-3 h-3 text-red-500" /> };
    case 'warn': return { text: 'text-amber-400', bg: 'bg-amber-500/10', icon: <AlertTriangle className="w-3 h-3 text-amber-500" /> };
    default: return { text: 'text-blue-400', bg: 'bg-blue-500/10', icon: <Info className="w-3 h-3 text-blue-500" /> };
  }
};

const LogViewer: React.FC<LogViewerProps> = ({ logs, onClose, onClear, onExpand }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to top when new logs arrive (since we reverse the list)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [logs.length]);

  return (
    <div className="absolute right-0 top-full mt-2 w-96 bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl z-[100] overflow-hidden font-mono animate-in fade-in zoom-in-95 slide-in-from-top-2">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-blue-400" />
          <span className="text-blue-400 font-bold text-xs uppercase tracking-widest">System Log</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onExpand}
            className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
            title="Expandir visualização"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClear}
            className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-950/20 rounded-lg transition-all"
            title="Limpar console"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <div className="w-px h-4 bg-slate-800 mx-1" />
          <button
            onClick={onClose}
            className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div 
        ref={scrollRef}
        className="max-h-[400px] overflow-y-auto p-2 space-y-1 custom-scrollbar bg-[#050505]"
      >
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-700 gap-2">
            <Terminal className="w-8 h-8 opacity-20" />
            <p className="text-[10px] uppercase tracking-widest">Aguardando operações...</p>
          </div>
        ) : (
          logs.map((log) => {
            const styles = getLevelStyles(log.level);
            return (
              <div 
                key={log.id} 
                className={`group flex items-start gap-3 px-3 py-2 rounded-lg transition-all border border-transparent hover:border-slate-800/50 ${styles.bg}`}
              >
                <div className="mt-0.5 shrink-0">
                  {styles.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    {log.source && (
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter truncate">
                        [{log.source}]
                      </span>
                    )}
                    <div className="flex items-center gap-1 text-slate-600 ml-auto shrink-0">
                      <Clock className="w-2.5 h-2.5" />
                      <span className="text-[9px]">{timeAgo(log.timestamp)}</span>
                    </div>
                  </div>
                  <p className={`text-[11px] leading-relaxed font-medium ${styles.text}`}>
                    {log.message}
                  </p>
                  {log.hint && (
                    <div className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-500 italic bg-slate-900/50 p-1 rounded">
                      <span className="text-amber-500 font-bold shrink-0">TIP:</span>
                      <span className="truncate">{log.hint}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 bg-slate-900/30 border-t border-slate-800/50 flex justify-between items-center">
        <span className="text-[9px] text-slate-600 font-medium">
          {logs.length} EVENTOS NA SESSÃO
        </span>
        <div className="flex gap-1">
           <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
           <span className="text-[9px] text-slate-500">LIVE</span>
        </div>
      </div>
    </div>
  );
};

export default LogViewer;
