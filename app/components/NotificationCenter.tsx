import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AppNotification, DuplicatePayload } from '../types';
import { Bell, Terminal, X, CheckCircle, AlertTriangle, Clock, ChevronRight, Trash2, Maximize2 } from 'lucide-react';
import ExpandedNotifications from './ExpandedNotifications';

interface NotificationCenterProps {
  notifications: AppNotification[];
  onResolve: (id: string, keepWhich?: 'existing' | 'incoming') => void;
  onClearConsole: () => void;
}

const formatCurrency = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const timeAgo = (ts: number) => {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}m atrás`;
  if (hours < 24) return `${hours}h atrás`;
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

// ─── Duplicate Resolution Modal ──────────────────────────────────────────────
const DuplicateModal: React.FC<{
  notification: AppNotification;
  onKeep: (which: 'existing' | 'incoming') => void;
  onClose: () => void;
}> = ({ notification, onKeep, onClose }) => {
  const payload = notification.payload as DuplicatePayload;
  if (!payload) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border border-amber-600/40 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800 bg-amber-950/20">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-sm">Duplicidade detectada</p>
            <p className="text-slate-400 text-xs truncate">{payload.productName}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white p-1 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <p className="text-slate-400 text-xs text-center">Qual registro manter no histórico?</p>

          {/* Existing */}
          <button
            onClick={() => onKeep('existing')}
            className="w-full text-left bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-500 rounded-xl p-4 transition-all group"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Registro Anterior</span>
              <span className="text-xs text-slate-500">{timeAgo(payload.existing.timestamp)}</span>
            </div>
            {payload.existingName && (
              <p className="text-slate-400 text-xs italic truncate mb-2" title={payload.existingName}>· {payload.existingName} antes da modific.</p>
            )}
            <div className="flex items-center justify-between">
              <span className="text-slate-300 text-sm">{payload.existing.supplierName}</span>
              <div className="text-right">
                <p className="text-white font-bold">{formatCurrency(payload.existing.unitPrice)}<span className="text-slate-500 text-xs">/un</span></p>
                <p className="text-slate-500 text-xs">cx {formatCurrency(payload.existing.packPrice)}</p>
              </div>
            </div>
            <div className="mt-2 text-xs text-slate-500">lote c/{payload.existing.packQuantity}</div>
          </button>

          {/* Incoming */}
          <button
            onClick={() => onKeep('incoming')}
            className="w-full text-left bg-slate-800 hover:bg-amber-950/30 border border-slate-700 hover:border-amber-600/50 rounded-xl p-4 transition-all group"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-amber-500 uppercase tracking-wide">Nova Cotação</span>
              <span className="text-xs text-slate-500">{timeAgo(payload.incoming.timestamp)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-300 text-sm">{payload.incoming.supplierName}</span>
              <div className="text-right">
                <p className="text-white font-bold">{formatCurrency(payload.incoming.unitPrice)}<span className="text-slate-500 text-xs">/un</span></p>
                <p className="text-slate-500 text-xs">cx {formatCurrency(payload.incoming.packPrice)}</p>
              </div>
            </div>
            <div className="mt-2 text-xs text-slate-500">lote c/{payload.incoming.packQuantity}</div>
          </button>

          <p className="text-slate-600 text-xs text-center pt-1">O outro registro será descartado permanentemente.</p>
        </div>
      </div>
    </div>
  );
};

// ─── Main Component ──────────────────────────────────────────────────────────
const NotificationCenter: React.FC<NotificationCenterProps> = ({
  notifications,
  onResolve,
  onClearConsole,
}) => {
  const [openPanel, setOpenPanel] = useState<'attention' | 'console' | null>(null);
  const [selectedNotif, setSelectedNotif] = useState<AppNotification | null>(null);
  const [expandedOpen, setExpandedOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const attentionNotifs = notifications.filter(n => n.type === 'attention' && !n.resolved);
  const consoleNotifs = notifications.filter(n => n.type === 'console');
  const unreadConsole = consoleNotifs.filter(n => !n.resolved).length;

  // Close panel on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpenPanel(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const toggle = (panel: 'attention' | 'console') => {
    setOpenPanel(prev => prev === panel ? null : panel);
  };

  return (
    <>
      {expandedOpen && createPortal(
        <ExpandedNotifications
          notifications={notifications}
          onResolve={onResolve}
          onClose={() => setExpandedOpen(false)}
        />,
        document.body
      )}

      {/* Duplicate resolution modal */}
      {selectedNotif && (
        <DuplicateModal
          notification={selectedNotif}
          onKeep={(which) => {
            onResolve(selectedNotif.id, which);
            setSelectedNotif(null);
          }}
          onClose={() => setSelectedNotif(null)}
        />
      )}

      <div ref={panelRef} className="relative flex items-center gap-1">
        {/* ─── Attention Bell ─── */}
        <div className="relative">
          <button
            onClick={() => toggle('attention')}
            title="Notificações de atenção"
            className={`relative p-1.5 rounded-lg transition-all ${
              openPanel === 'attention'
                ? 'bg-amber-600/20 text-amber-400'
                : 'text-slate-400 hover:text-amber-400 hover:bg-slate-800'
            }`}
          >
            <Bell className="w-4 h-4" />
            {attentionNotifs.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center">
                {attentionNotifs.length > 9 ? '9+' : attentionNotifs.length}
              </span>
            )}
          </button>

          {openPanel === 'attention' && (
            <div className="absolute left-0 bottom-full mb-2 w-80 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span className="text-white font-semibold text-sm">Atenção</span>
                  {attentionNotifs.length > 0 && (
                    <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                      {attentionNotifs.length}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => { setExpandedOpen(true); setOpenPanel(null); }}
                  className="flex items-center gap-1 text-slate-400 hover:text-amber-400 text-xs transition-colors"
                  title="Expandir notificações"
                >
                  Expandir <Maximize2 className="w-3 h-3" />
                </button>
              </div>

              <div className="max-h-80 overflow-y-auto">
                {attentionNotifs.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-8 text-slate-600">
                    <CheckCircle className="w-8 h-8" />
                    <p className="text-sm">Nenhuma pendência</p>
                  </div>
                ) : (
                  attentionNotifs.map(n => (
                    <button
                      key={n.id}
                      onClick={() => { setSelectedNotif(n); setOpenPanel(null); }}
                      className="w-full text-left px-4 py-3 border-b border-slate-800/50 hover:bg-amber-950/20 transition-all group"
                    >
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-xs font-semibold">{n.title}</p>
                          <p className="text-slate-400 text-xs mt-0.5 leading-relaxed">{n.message}</p>
                          <p className="text-slate-600 text-[10px] mt-1">{timeAgo(n.timestamp)}</p>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-amber-400 transition-colors shrink-0 mt-0.5" />
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* ─── Console Terminal ─── */}
        <div className="relative">
          <button
            onClick={() => toggle('console')}
            title="Log de operações"
            className={`relative p-1.5 rounded-lg transition-all ${
              openPanel === 'console'
                ? 'bg-slate-700 text-slate-200'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Terminal className="w-4 h-4" />
            {unreadConsole > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full" />
            )}
          </button>

          {openPanel === 'console' && (
            <div className="absolute left-0 bottom-full mb-2 w-80 bg-slate-950 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden font-mono">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400 font-bold text-sm">console.log</span>
                </div>
                <button
                  onClick={onClearConsole}
                  className="text-slate-600 hover:text-slate-300 transition-colors"
                  title="Limpar console"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="max-h-80 overflow-y-auto p-2 space-y-1">
                {consoleNotifs.length === 0 ? (
                  <p className="text-slate-600 text-xs px-2 py-4 text-center">Nenhum log ainda</p>
                ) : (
                  [...consoleNotifs].reverse().map(n => (
                    <div key={n.id} className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-slate-900 transition-colors">
                      <CheckCircle className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-emerald-300 text-[11px] leading-relaxed">{n.message}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <Clock className="w-2.5 h-2.5 text-slate-600" />
                          <span className="text-slate-600 text-[10px]">{timeAgo(n.timestamp)}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default NotificationCenter;
