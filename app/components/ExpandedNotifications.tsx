import React, { useState, useEffect } from 'react';
import { AppNotification, DuplicatePayload } from '../types';
import { X, Bell, AlertTriangle, Layers, HelpCircle, CheckSquare, Square, GitMerge } from 'lucide-react';

const timeAgo = (ts: number) => {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}m atrás`;
  if (hours < 24) return `${hours}h atrás`;
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

const formatCurrency = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface ExpandedNotificationsProps {
  notifications: AppNotification[];
  onResolve: (id: string, keepWhich?: 'existing' | 'incoming' | 'both') => void;
  onClose: () => void;
}

const ExpandedNotifications: React.FC<ExpandedNotificationsProps> = ({
  notifications,
  onResolve,
  onClose,
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [helpOpen, setHelpOpen] = useState(false);

  const attentionNotifs = notifications.filter(n => n.type === 'attention' && !n.resolved);

  const selectedDuplicateIds = [...selectedIds].filter(id =>
    attentionNotifs.find(n => n.id === id)?.payload != null
  );
  const hasDuplicatesSelected = selectedDuplicateIds.length > 0;
  const allSelected = attentionNotifs.length > 0 && selectedIds.size === attentionNotifs.length;

  // ESC fecha a tela
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const lastSelectedIdRef = React.useRef<string | null>(null);

  const toggleSelect = (id: string, shiftKey: boolean = false) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      const items = attentionNotifs.map(n => n.id);

      if (shiftKey && lastSelectedIdRef.current) {
        const startIdx = items.indexOf(lastSelectedIdRef.current);
        const endIdx = items.indexOf(id);

        if (startIdx !== -1 && endIdx !== -1) {
          const min = Math.min(startIdx, endIdx);
          const max = Math.max(startIdx, endIdx);

          const isChecking = !prev.has(id);
          for (let i = min; i <= max; i++) {
            if (isChecking) next.add(items[i]);
            else next.delete(items[i]);
          }
        } else {
          if (next.has(id)) next.delete(id);
          else next.add(id);
        }
      } else {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      }

      lastSelectedIdRef.current = id;
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(attentionNotifs.map(n => n.id)));
  };

  const handleBulkResolve = (keepWhich: 'existing' | 'incoming' | 'both') => {
    selectedDuplicateIds.forEach(id => onResolve(id, keepWhich));
    setSelectedIds(new Set());
  };

  const handleCardClick = (
    e: React.MouseEvent,
    notifId: string,
    keepWhich: 'existing' | 'incoming' | 'both'
  ) => {
    e.stopPropagation();
    if (hasDuplicatesSelected) {
      handleBulkResolve(keepWhich);
    } else {
      onResolve(notifId, keepWhich);
    }
  };

  return (
    <div className="fixed inset-0 z-[95]">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative h-full flex flex-col bg-slate-950">

        {/* ─── Toolbar fixa ─── */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-slate-800 bg-slate-900 shrink-0">
          {/* Seleção global */}
          <button
            onClick={toggleSelectAll}
            className="text-slate-400 hover:text-amber-400 transition-colors shrink-0"
            title={allSelected ? 'Desmarcar todos' : 'Selecionar todos'}
          >
            {allSelected
              ? <CheckSquare className="w-4 h-4 text-amber-400" />
              : <Square className="w-4 h-4" />}
          </button>

          {/* Título */}
          <div className="flex items-center gap-2 mr-auto">
            <Bell className="w-4 h-4 text-amber-400" />
            <span className="text-white font-bold text-sm">Notificações</span>
            {attentionNotifs.length > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {attentionNotifs.length}
              </span>
            )}
            {selectedIds.size > 0 && (
              <span className="text-slate-500 text-xs">{selectedIds.size} selecionado(s)</span>
            )}
          </div>

          {/* Segmented button group: resolver duplicidades em massa */}
          <div className={`relative flex rounded-lg overflow-hidden border transition-all ${
            hasDuplicatesSelected ? 'border-slate-600' : 'border-slate-700/50'
          }`}>
            {/* Manter registro anterior */}
            <button
              onClick={() => handleBulkResolve('existing')}
              disabled={!hasDuplicatesSelected}
              title="Manter registro anterior"
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all border-r ${
                hasDuplicatesSelected
                  ? 'bg-slate-800 text-slate-300 hover:bg-slate-700 border-slate-600'
                  : 'bg-slate-800/40 text-slate-600 border-slate-700/50 cursor-not-allowed'
              }`}
            >
              ← Anterior
            </button>

            {/* Manter as duas */}
            <button
              onClick={() => handleBulkResolve('both')}
              disabled={!hasDuplicatesSelected}
              title="Manter as duas cotações"
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all border-r ${
                hasDuplicatesSelected
                  ? 'bg-teal-900/40 text-teal-400 hover:bg-teal-900/60 border-slate-600'
                  : 'bg-slate-800/40 text-slate-600 border-slate-700/50 cursor-not-allowed'
              }`}
            >
              <GitMerge className="w-3 h-3" />
              Manter as duas
            </button>

            {/* Manter nova cotação */}
            <button
              onClick={() => handleBulkResolve('incoming')}
              disabled={!hasDuplicatesSelected}
              title="Manter nova cotação"
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all ${
                hasDuplicatesSelected
                  ? 'bg-slate-800 text-amber-400 hover:bg-amber-950/40 '
                  : 'bg-slate-800/40 text-slate-600 cursor-not-allowed'
              }`}
            >
              Nova →
            </button>
          </div>

          {/* Contador de selecionados (tooltip do grupo) */}
          {hasDuplicatesSelected && (
            <div className="flex items-center gap-1 text-slate-500 text-[10px]">
              <Layers className="w-3 h-3" />
              {selectedDuplicateIds.length}
            </div>
          )}

          {/* Ícone ? */}
          <div className="relative">
            <button
              onClick={() => setHelpOpen(o => !o)}
              className={`p-1.5 rounded-lg transition-colors ${
                helpOpen ? 'text-white bg-slate-700' : 'text-slate-500 hover:text-white'
              }`}
              title="Ajuda"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
            {helpOpen && (
              <div className="absolute top-full right-0 mt-2 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-4 z-20">
                <p className="text-white font-bold text-sm mb-3">Tipos de notificação</p>
                <div className="space-y-3 text-xs text-slate-400">
                  <div>
                    <p className="text-amber-400 font-semibold mb-1">Duplicidade</p>
                    <p>Produto importado mais de uma vez. Clique em um dos cards para resolver, ou selecione vários e use as ações em massa.</p>
                  </div>
                  <div className="border-t border-slate-800 pt-3">
                    <p className="text-slate-300 font-semibold mb-1">Ações em massa</p>
                    <p className="mb-1"><span className="text-slate-300">← Anterior</span> — descarta a nova importação, preserva o existente.</p>
                    <p className="mb-1"><span className="text-teal-400">Manter as duas</span> — adiciona a nova cotação sem remover a anterior. Útil para lotes com tamanhos ou preços diferentes.</p>
                    <p><span className="text-amber-400">Nova →</span> — substitui o histórico pelo registro mais recente.</p>
                  </div>
                  <div className="border-t border-slate-800 pt-3 text-slate-600">
                    <p>Pressione <kbd className="bg-slate-800 px-1 py-0.5 rounded text-slate-400">ESC</kbd> para fechar.</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Fechar */}
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm transition-colors pl-3 border-l border-slate-800 ml-1"
          >
            <X className="w-4 h-4" /> Fechar
          </button>
        </div>

        {/* ─── Lista ─── */}
        <div className="flex-1 overflow-y-auto">
          {attentionNotifs.length === 0 ? (
            <div className="flex flex-col items-center gap-3 mt-20 text-slate-600">
              <AlertTriangle className="w-10 h-10" />
              <p className="text-sm">Nenhuma pendência</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/60">
              {attentionNotifs.map(n => {
                const isSelected = selectedIds.has(n.id);
                const payload = n.payload as DuplicatePayload | undefined;

                if (payload) {
                  // ── Linha de duplicidade com cards inline ──
                  return (
                    <div
                      key={n.id}
                      className={`flex items-start gap-3 px-4 py-3 transition-colors ${
                        isSelected ? 'bg-amber-950/10' : 'hover:bg-slate-900/30'
                      }`}
                    >
                      {/* Checkbox */}
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleSelect(n.id, e.shiftKey); }}
                        className="mt-1 shrink-0 text-slate-500 hover:text-amber-400 transition-colors"
                      >
                        {isSelected
                          ? <CheckSquare className="w-4 h-4 text-amber-400" />
                          : <Square className="w-4 h-4" />}
                      </button>

                      {/* 3 Columns Grid */}
                      <div className="grid grid-cols-3 gap-3 flex-1 min-w-0 items-start">
                        {/* Zona esquerda: info */}
                        <div className="min-w-0 pr-2">
                          <div
                            className="cursor-pointer"
                            onClick={(e) => toggleSelect(n.id, e.shiftKey)}
                          >
                            <div className="flex items-start gap-1.5 mb-1 max-w-full">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                              <p className="text-white text-xs font-semibold leading-snug break-words line-clamp-3" title={n.title}>{n.title}</p>
                            </div>
                            <span className="text-[10px] font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded inline-block mb-1.5">
                              DUPLICIDADE
                            </span>
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-slate-600 text-[10px]">{timeAgo(n.timestamp)}</span>
                              {n.supplierName && (
                                <span className="text-slate-600 text-[10px] truncate">{n.supplierName}</span>
                              )}
                            </div>
                          </div>
                          {/* Ação rápida: manter as duas */}
                          <button
                            onClick={(e) => handleCardClick(e, n.id, 'both')}
                            className="flex items-center gap-1 text-[10px] text-teal-500 hover:text-teal-300 transition-colors"
                            title="Manter ambas as cotações no histórico"
                          >
                            <GitMerge className="w-3 h-3" />
                            Manter as duas
                          </button>
                        </div>

                        {/* Card: Registro Atual */}
                        <div className="relative group/existing w-full min-w-0">
                          <button
                            onClick={(e) => handleCardClick(e, n.id, 'existing')}
                            className="w-full text-left bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-500 rounded-xl p-2.5 transition-all"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Registro Anterior</span>
                              <span className="text-[10px] text-slate-500">{timeAgo(payload.existing.timestamp)}</span>
                            </div>
                            {payload.existingName && (
                              <p className="text-slate-400 text-[10px] italic truncate mb-1" title={payload.existingName}>· {payload.existingName} antes da modific.</p>
                            )}
                            <p className="text-slate-300 text-xs mb-1 truncate">{payload.existing.supplierName}</p>
                            <div className="flex items-baseline gap-1.5">
                              <p className="text-white font-bold text-sm">
                                {formatCurrency(payload.existing.unitPrice)}
                                <span className="text-slate-500 text-[10px]">/un</span>
                              </p>
                              <p className="text-slate-500 text-[10px]">cx {formatCurrency(payload.existing.packPrice)}</p>
                            </div>
                            <p className="text-slate-600 text-[10px] mt-0.5">lote c/{payload.existing.packQuantity}</p>
                          </button>
                          {/* Overlay hover (seleção ativa) */}
                          {hasDuplicatesSelected && (
                            <div className="absolute inset-0 rounded-xl bg-slate-900/90 opacity-0 group-hover/existing:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5 pointer-events-none">
                              <Layers className="w-4 h-4 text-slate-400" />
                              <span className="text-slate-300 text-[11px] text-center px-2">
                                Manter anterior para {selectedDuplicateIds.length}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Card: Nova Cotação */}
                        <div className="relative group/incoming w-full min-w-0">
                          <button
                            onClick={(e) => handleCardClick(e, n.id, 'incoming')}
                            className="w-full text-left bg-slate-800 hover:bg-amber-950/30 border border-slate-700 hover:border-amber-600/50 rounded-xl p-2.5 transition-all"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wide">Nova Cotação</span>
                              <span className="text-[10px] text-slate-500">{timeAgo(payload.incoming.timestamp)}</span>
                            </div>
                            {payload.productName && (
                              <p className="text-amber-500/80 text-[10px] italic truncate mb-1" title={payload.productName}>· {payload.productName}</p>
                            )}
                            <p className="text-slate-300 text-xs mb-1 truncate">{payload.incoming.supplierName}</p>
                            <div className="flex items-baseline gap-1.5">
                              <p className="text-white font-bold text-sm">
                                {formatCurrency(payload.incoming.unitPrice)}
                                <span className="text-slate-500 text-[10px]">/un</span>
                              </p>
                              <p className="text-slate-500 text-[10px]">cx {formatCurrency(payload.incoming.packPrice)}</p>
                            </div>
                            <p className="text-slate-600 text-[10px] mt-0.5">lote c/{payload.incoming.packQuantity}</p>
                          </button>
                          {/* Overlay hover (seleção ativa) */}
                          {hasDuplicatesSelected && (
                            <div className="absolute inset-0 rounded-xl bg-amber-950/80 opacity-0 group-hover/incoming:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5 pointer-events-none">
                              <Layers className="w-4 h-4 text-amber-400" />
                              <span className="text-amber-300 text-[11px] text-center px-2">
                                Manter nova para {selectedDuplicateIds.length}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                }

                // ── Linha simples (sem payload) ──
                return (
                  <div
                    key={n.id}
                    onClick={(e) => toggleSelect(n.id, e.shiftKey)}
                    className={`flex items-start gap-4 px-6 py-4 cursor-pointer transition-colors ${
                      isSelected ? 'bg-amber-950/10' : 'hover:bg-slate-900/50'
                    }`}
                  >
                    <div className="mt-0.5 shrink-0 text-slate-500">
                      {isSelected
                        ? <CheckSquare className="w-4 h-4 text-amber-400" />
                        : <Square className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <p className="text-white text-sm font-semibold">{n.title}</p>
                      </div>
                      <p className="text-slate-400 text-xs leading-relaxed">{n.message}</p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-slate-600 text-[10px]">{timeAgo(n.timestamp)}</span>
                        {n.supplierName && (
                          <span className="text-slate-600 text-[10px]">{n.supplierName}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default ExpandedNotifications;
