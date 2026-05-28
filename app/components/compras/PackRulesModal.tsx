import React, { useState } from 'react';
import { PackRule } from '../../types';
import { Settings, X, Plus, Trash2, RefreshCw } from 'lucide-react';

interface PackRulesModalProps {
  supplierName: string;
  rules: PackRule[];
  onAdd: (term: string, qty: number) => void;
  onRemove: (ruleId: string) => void;
  onReprocess: () => void;
  onClose: () => void;
}

const PackRulesModal: React.FC<PackRulesModalProps> = ({ supplierName, rules, onAdd, onRemove, onReprocess, onClose }) => {
  const [term, setTerm] = useState('');
  const [qty, setQty] = useState(1);

  const handleAdd = () => {
    if (!term.trim() || qty < 1) return;
    onAdd(term, qty);
    setTerm('');
    setQty(1);
  };

  return (
    <div className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 w-full max-w-2xl rounded-xl border border-slate-700 flex flex-col shadow-2xl max-h-[80vh]">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950 rounded-t-xl">
          <h3 className="font-bold text-white flex items-center gap-2">
            <Settings className="w-5 h-5 text-blue-500" /> Exceções de Embalagem (Deste Fornecedor)
          </h3>
          <button onClick={onClose}><X className="w-6 h-6 text-slate-500 hover:text-white" /></button>
        </div>

        <div className="p-4 bg-slate-900 space-y-4">
          <p className="text-sm text-slate-400">
            Defina exceções apenas para <strong className="text-white">{supplierName}</strong>. Estas regras sobrescrevem as regras globais (configuráveis em ⚙️ Configurações).
          </p>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Ex: Longneck, Lata 350ml, Pack..."
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              className="flex-1 bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
            />
            <input
              type="number"
              min="1"
              placeholder="Qtd"
              value={qty}
              onChange={(e) => setQty(parseInt(e.target.value))}
              className="w-20 bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white focus:border-blue-500 focus:outline-none text-center"
            />
            <button onClick={handleAdd} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-bold">
              <Plus className="w-5 h-5" />
            </button>
          </div>

          <div className="border-t border-slate-800 pt-4 max-h-60 overflow-y-auto space-y-2">
            {rules.length === 0 && (
              <p className="text-center text-slate-600 italic">Nenhuma regra definida.</p>
            )}
            {rules.map(rule => (
              <div key={rule.id} className="flex justify-between items-center bg-slate-800 p-2 rounded border border-slate-700">
                <div className="flex items-center gap-2">
                  <span className="text-slate-300">Contém: <strong className="text-white">"{rule.term}"</strong></span>
                  <span className="text-slate-500">→</span>
                  <span className="text-blue-400 font-bold">Lote: {rule.quantity}</span>
                </div>
                <button onClick={() => onRemove(rule.id)} className="text-slate-500 hover:text-red-500">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="pt-4 border-t border-slate-800">
            <button
              onClick={onReprocess}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-600 flex items-center justify-center gap-2 text-sm"
            >
              <RefreshCw className="w-4 h-4" /> Re-processar Cotações
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PackRulesModal;
