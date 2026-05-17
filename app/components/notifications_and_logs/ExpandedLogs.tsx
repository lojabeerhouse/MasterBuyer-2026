import React, { useState, useMemo } from 'react';
import { 
  X, Terminal, Trash2, Filter, Download, Search, 
  CheckCircle, AlertTriangle, Info, Clock, ChevronRight
} from 'lucide-react';
import { AppLog, LogLevel } from '../../types';

interface ExpandedLogsProps {
  logs: AppLog[];
  onClear: () => void;
  onClose: () => void;
}

const ExpandedLogs: React.FC<ExpandedLogsProps> = ({ logs, onClear, onClose }) => {
  const [filter, setFilter] = useState<LogLevel | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchesFilter = filter === 'all' || log.level === filter;
      const matchesSearch = log.message.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           log.source?.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [logs, filter, searchTerm]);

  const stats = useMemo(() => ({
    total: logs.length,
    errors: logs.filter(l => l.level === 'error').length,
    warnings: logs.filter(l => l.level === 'warn').length,
    success: logs.filter(l => l.level === 'success').length,
  }), [logs]);

  const exportLogs = () => {
    const data = JSON.stringify(logs, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `masterbuyer_logs_${new Date().toISOString()}.json`;
    a.click();
  };

  const getLevelIcon = (level: LogLevel) => {
    switch (level) {
      case 'success': return <CheckCircle className="w-4 h-4 text-emerald-500" />;
      case 'error': return <X className="w-4 h-4 text-red-500" />;
      case 'warn': return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      default: return <Info className="w-4 h-4 text-blue-500" />;
    }
  };

  const getLevelColor = (level: LogLevel) => {
    switch (level) {
      case 'success': return 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5';
      case 'error': return 'text-red-400 border-red-500/20 bg-red-500/5';
      case 'warn': return 'text-amber-400 border-amber-500/20 bg-amber-500/5';
      default: return 'text-blue-400 border-blue-500/20 bg-blue-500/5';
    }
  };

  return (
    <div className="fixed inset-0 z-[110] bg-slate-950 flex flex-col font-mono animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Header */}
      <header className="h-16 flex items-center justify-between px-6 bg-slate-900 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-600/20 rounded-xl flex items-center justify-center border border-blue-500/30">
            <Terminal className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-white font-bold text-lg tracking-tight">Console de Operações</h1>
            <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold">Monitoramento de Sistema em Tempo Real</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={exportLogs}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-bold transition-all border border-slate-700"
          >
            <Download className="w-4 h-4" /> Exportar JSON
          </button>
          <button
            onClick={onClear}
            className="flex items-center gap-2 px-4 py-2 bg-red-950/20 hover:bg-red-900/30 text-red-400 rounded-xl text-xs font-bold transition-all border border-red-900/30"
          >
            <Trash2 className="w-4 h-4" /> Limpar Tudo
          </button>
          <div className="w-px h-8 bg-slate-800 mx-2" />
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Toolbar */}
      <div className="p-6 bg-slate-900/30 border-b border-slate-800/50 flex flex-wrap items-center gap-6">
        {/* Search */}
        <div className="relative flex-1 min-w-[300px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input 
            type="text"
            placeholder="Filtrar por mensagem ou origem..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-all"
          />
        </div>

        {/* Level Filters */}
        <div className="flex items-center gap-2 p-1 bg-slate-950 rounded-xl border border-slate-800">
          {(['all', 'info', 'success', 'warn', 'error'] as const).map((lvl) => (
            <button
              key={lvl}
              onClick={() => setFilter(lvl)}
              className={`px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                filter === lvl 
                  ? 'bg-blue-600 text-white shadow-lg' 
                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900'
              }`}
            >
              {lvl === 'all' ? 'Todos' : lvl}
            </button>
          ))}
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-auto">
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-600" /> {stats.total} Total</div>
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /> {stats.success} SUCESSO</div>
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" /> {stats.warnings} AVISOS</div>
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" /> {stats.errors} ERROS</div>
        </div>
      </div>

      {/* Main Table */}
      <div className="flex-1 overflow-hidden flex flex-col p-6">
        <div className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden flex flex-col">
          <div className="overflow-y-auto flex-1 custom-scrollbar">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-slate-900 z-10">
                <tr className="border-b border-slate-800">
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest w-20">Nível</th>
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest w-32">Data/Hora</th>
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest w-32">Origem</th>
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">Mensagem</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-20 text-center text-slate-600">
                      <div className="flex flex-col items-center gap-4">
                        <Search className="w-12 h-12 opacity-10" />
                        <p className="text-sm font-medium">Nenhum log encontrado para os filtros atuais.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr key={log.id} className="border-b border-slate-900 hover:bg-slate-900/40 transition-all group">
                      <td className="px-6 py-4">
                        <div className={`flex items-center gap-2 ${getLevelColor(log.level)}`}>
                          {getLevelIcon(log.level)}
                          <span className="text-[10px] font-bold uppercase tracking-tighter">{log.level}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
                          <Clock className="w-3 h-3" />
                          {new Date(log.timestamp).toLocaleString('pt-BR')}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="bg-slate-900 px-2 py-1 rounded text-slate-400 text-[10px] font-bold border border-slate-800">
                          {log.source || 'SYSTEM'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          <p className={`text-sm font-medium leading-relaxed ${getLevelColor(log.level)}`}>
                            {log.message}
                          </p>
                          {log.hint && (
                            <div className="flex items-start gap-2 bg-amber-950/10 border border-amber-900/20 p-2 rounded-lg max-w-2xl">
                              <Info className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                              <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-1">Sugestão de Resolução</span>
                                <p className="text-xs text-slate-400 italic leading-relaxed">{log.hint}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Footer bar */}
      <div className="h-8 bg-slate-900 border-t border-slate-800 flex items-center justify-between px-6 text-[9px] font-bold text-slate-600 uppercase tracking-[0.2em]">
        <span>MasterBuyer 2026 Engine v2.4</span>
        <div className="flex items-center gap-4">
          <span>Status: Online</span>
          <span className="text-blue-500">Buffer: {logs.length}/500</span>
        </div>
      </div>
    </div>
  );
};

export default ExpandedLogs;
