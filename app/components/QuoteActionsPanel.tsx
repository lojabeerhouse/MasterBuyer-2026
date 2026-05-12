import React from 'react';
import {
  Sparkles, CheckCircle, Trash2, X, CheckSquare, Loader2,
  BoxSelect, Coins,
} from 'lucide-react';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface QuoteActionsPanelProps {
  selectedCount: number;
  isBatchProcessing: boolean;
  batchStrategyLabel?: string;
  onIdentifyWithAI: () => void;
  onVerifySelected: () => void;
  onDeleteSelected: () => void;
  onClearSelection: () => void;
  onSetStrategyPack: () => void;
  onSetStrategyUnit: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * QuoteActionsPanel
 *
 * Painel de ações para o modal de cotação. É injetado no RightSidebarContext
 * pelo QuoteDetailModal ao montar, e removido ao desmontar/fechar.
 * É completamente desacoplado do modal — recebe apenas callbacks e estado
 * primitivo via props.
 */
const QuoteActionsPanel: React.FC<QuoteActionsPanelProps> = ({
  selectedCount,
  isBatchProcessing,
  onIdentifyWithAI,
  onVerifySelected,
  onDeleteSelected,
  onClearSelection,
  onSetStrategyPack,
  onSetStrategyUnit,
}) => {
  const hasSelection = selectedCount > 0;

  return (
    <div className="flex flex-col h-full">

      {/* ── Seção: Ações Principais ────────────────────────────────────────── */}
      <div className="p-5 border-b border-slate-800/60 bg-slate-900/30">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4">
          Ações em Lote
        </p>
        <div className="flex flex-col gap-3">

          {/* Identificar com IA */}
          <button
            onClick={onIdentifyWithAI}
            disabled={!hasSelection || isBatchProcessing}
            className="flex items-center gap-3 w-full p-4 rounded-xl bg-gradient-to-br from-indigo-600/20 to-violet-600/20 border border-indigo-500/30 text-indigo-100 hover:from-indigo-600/30 hover:to-violet-600/30 transition-all group disabled:opacity-40 disabled:cursor-not-allowed text-left"
          >
            <div className="p-2 bg-indigo-500/20 rounded-lg group-hover:scale-110 transition-transform shrink-0">
              {isBatchProcessing
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Sparkles className="w-4 h-4 text-indigo-400 fill-indigo-400/20" />
              }
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold">
                {isBatchProcessing ? 'Processando...' : 'Identificar com IA'}
              </span>
              <span className="text-[10px] text-slate-400">Sugere tamanho de lote</span>
            </div>
          </button>

          {/* Verificar selecionados */}
          <button
            onClick={onVerifySelected}
            disabled={!hasSelection}
            className="flex items-center gap-3 w-full p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-emerald-100 hover:bg-emerald-500/10 transition-all group disabled:opacity-40 disabled:cursor-not-allowed text-left"
          >
            <div className="p-2 bg-emerald-500/20 rounded-lg group-hover:scale-110 transition-transform shrink-0">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold">Verificar Selecionados</span>
              <span className="text-[10px] text-slate-400">Marcar como OK</span>
            </div>
          </button>

        </div>
      </div>

      {/* ── Seção: Status da Seleção ───────────────────────────────────────── */}
      <div className="flex-1 p-5 overflow-auto">
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
              Seleção
            </span>
            <span className="text-[10px] bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded-full font-bold">
              {selectedCount} {selectedCount === 1 ? 'item' : 'itens'}
            </span>
          </div>

          {hasSelection ? (
            <div className="flex flex-col gap-2">
              <button
                onClick={onClearSelection}
                className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all text-xs font-medium"
              >
                <X className="w-3.5 h-3.5" /> Limpar Seleção
              </button>
              <button
                onClick={onDeleteSelected}
                className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-950/20 transition-all text-xs font-medium"
              >
                <Trash2 className="w-3.5 h-3.5" /> Excluir Selecionados
              </button>
            </div>
          ) : (
            <div className="p-8 border-2 border-dashed border-slate-800/30 rounded-2xl flex flex-col items-center justify-center text-center opacity-50">
              <CheckSquare className="w-8 h-8 text-slate-700 mb-3" />
              <p className="text-[10px] text-slate-600 font-medium leading-relaxed">
                Selecione itens na tabela para activar as ações
              </p>
            </div>
          )}
        </div>

        {/* ── Atalhos Globais ──────────────────────────────────────────────── */}
        <div>
          <h4 className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-4">
            Atalhos Globais
          </h4>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onSetStrategyPack}
              className="flex flex-col items-center gap-2 p-3 rounded-xl bg-slate-800/30 border border-slate-700/50 hover:bg-slate-700/40 transition-all text-blue-400"
            >
              <BoxSelect className="w-4 h-4" />
              <span className="text-[9px] font-bold uppercase">Lote</span>
            </button>
            <button
              onClick={onSetStrategyUnit}
              className="flex flex-col items-center gap-2 p-3 rounded-xl bg-slate-800/30 border border-slate-700/50 hover:bg-slate-700/40 transition-all text-amber-400"
            >
              <Coins className="w-4 h-4" />
              <span className="text-[9px] font-bold uppercase">Unit.</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Rodapé ──────────────────────────────────────────────────────────── */}
      <div className="p-5 bg-slate-900/30 border-t border-slate-800/60 mt-auto shrink-0">
        <div className="flex items-center gap-3 p-3 bg-indigo-500/5 border border-indigo-500/20 rounded-xl">
          <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)] animate-pulse shrink-0" />
          <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest">
            Processamento Flash
          </span>
        </div>
      </div>

    </div>
  );
};

export default QuoteActionsPanel;
