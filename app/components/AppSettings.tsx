import React, { useState } from 'react';
import { PackRule, HiddenProduct, AppSettings } from '../types';
import { Settings, Eye, EyeOff, Trash2, Plus, Clock, Package, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

interface AppSettingsProps {
  settings: AppSettings;
  onSettingsChange: (s: AppSettings) => void;
  globalPackRules: PackRule[];
  onPackRulesChange: (rules: PackRule[]) => void;
  hiddenProducts: HiddenProduct[];
  onUnhide: (id: string) => void;
  onClearAllHidden: () => void;
}

const AppSettingsPanel: React.FC<AppSettingsProps> = ({
  settings,
  onSettingsChange,
  globalPackRules,
  onPackRulesChange,
  hiddenProducts,
  onUnhide,
  onClearAllHidden,
}) => {
  const [newTerm, setNewTerm] = useState('');
  const [newQty, setNewQty] = useState(12);
  const [showHidden, setShowHidden] = useState(false);
  const [showPack, setShowPack] = useState(true);

  const addRule = () => {
    if (!newTerm.trim()) return;
    onPackRulesChange([
      ...globalPackRules,
      { id: crypto.randomUUID(), term: newTerm.trim(), quantity: newQty },
    ]);
    setNewTerm('');
    setNewQty(12);
  };

  const removeRule = (id: string) => {
    onPackRulesChange(globalPackRules.filter(r => r.id !== id));
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4 py-2">

      {/* ── Exibição ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800">
          <Eye className="w-4 h-4 text-amber-400" />
          <p className="text-white font-semibold text-sm">Exibição</p>
        </div>
        <div className="px-5 py-4 space-y-4">

          {/* Toggle mostrar inativos */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white text-sm font-medium">Mostrar produtos inativos</p>
              <p className="text-slate-500 text-xs mt-0.5">
                Exibe produtos ocultos no catálogo e no comparador
              </p>
            </div>
            <button
              onClick={() => onSettingsChange({ ...settings, showInactiveProducts: !settings.showInactiveProducts })}
              className={`relative w-12 h-6 rounded-full transition-all duration-200 ${
                settings.showInactiveProducts ? 'bg-amber-600' : 'bg-slate-700'
              }`}
            >
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${
                settings.showInactiveProducts ? 'left-7' : 'left-1'
              }`} />
            </button>
          </div>

          {/* Validade global */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white text-sm font-medium">Validade global de preços</p>
              <p className="text-slate-500 text-xs mt-0.5">
                Preços mais antigos que este período são marcados como expirados
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={settings.priceValidityDays}
                onChange={e => onSettingsChange({ ...settings, priceValidityDays: Number(e.target.value) })}
                className="w-16 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-sm text-center focus:outline-none focus:border-amber-500"
                min={1} max={365}
              />
              <span className="text-slate-500 text-sm">dias</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Produtos Ocultos ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <button
          onClick={() => setShowHidden(v => !v)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <EyeOff className="w-4 h-4 text-slate-400" />
            <p className="text-white font-semibold text-sm">
              Produtos Ocultos
              {hiddenProducts.length > 0 && (
                <span className="ml-2 bg-slate-700 text-slate-300 text-xs px-2 py-0.5 rounded-full">
                  {hiddenProducts.length}
                </span>
              )}
            </p>
          </div>
          {showHidden ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
        </button>

        {showHidden && (
          <div className="border-t border-slate-800">
            {hiddenProducts.length === 0 ? (
              <p className="text-slate-600 text-sm text-center py-8">Nenhum produto oculto</p>
            ) : (
              <>
                <div className="divide-y divide-slate-800 max-h-72 overflow-y-auto">
                  {hiddenProducts.map(hp => (
                    <div key={hp.id} className="flex items-center gap-3 px-5 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm truncate">{hp.productName}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-slate-500 text-xs">{hp.supplierName}</span>
                          {hp.masterSku && (
                            <span className="text-amber-600 text-xs">· linkado</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => onUnhide(hp.id)}
                        className="text-slate-500 hover:text-emerald-400 p-1.5 rounded-lg hover:bg-emerald-900/20 transition-all"
                        title="Reativar produto"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="px-5 py-3 border-t border-slate-800">
                  <button
                    onClick={() => {
                      if (window.confirm(`Reativar todos os ${hiddenProducts.length} produtos ocultos?`)) {
                        onClearAllHidden();
                      }
                    }}
                    className="text-slate-400 hover:text-white text-xs flex items-center gap-1.5 transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Reativar todos
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Regras de Embalagem ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <button
          onClick={() => setShowPack(v => !v)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Package className="w-4 h-4 text-amber-400" />
            <div className="text-left">
              <p className="text-white font-semibold text-sm">Regras de Embalagem</p>
              <p className="text-slate-500 text-xs">Define lote padrão por palavra-chave no nome do produto</p>
            </div>
          </div>
          {showPack ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
        </button>

        {showPack && (
          <div className="border-t border-slate-800">
            {/* Adicionar nova regra */}
            <div className="flex gap-2 px-5 py-4 border-b border-slate-800">
              <input
                type="text"
                placeholder="Termo (ex: Cerveja Lata 350ml)"
                value={newTerm}
                onChange={e => setNewTerm(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addRule()}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
              <input
                type="number"
                value={newQty}
                onChange={e => setNewQty(Number(e.target.value))}
                className="w-16 bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-white text-sm text-center focus:outline-none focus:border-amber-500"
                min={1}
              />
              <button
                onClick={addRule}
                className="bg-amber-600 hover:bg-amber-500 text-white px-3 py-2 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Lista de regras */}
            {globalPackRules.length === 0 ? (
              <p className="text-slate-600 text-sm text-center py-6">Nenhuma regra cadastrada</p>
            ) : (
              <div className="divide-y divide-slate-800 max-h-72 overflow-y-auto">
                {globalPackRules.map(rule => (
                  <div key={rule.id} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <p className="text-white text-sm">{rule.term}</p>
                      <p className="text-slate-500 text-xs">lote padrão: {rule.quantity} unidades</p>
                    </div>
                    <button
                      onClick={() => removeRule(rule.id)}
                      className="text-slate-600 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-900/20 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Nota sobre o assistente */}
            <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/30">
              <p className="text-slate-600 text-xs">
                💡 Dica: use o assistente para criar exceções — ex: "Defina o lote da Budweiser Zero 350ml como 8"
              </p>
            </div>
          </div>
        )}
      </div>

    </div>
  );
};

export default AppSettingsPanel;
