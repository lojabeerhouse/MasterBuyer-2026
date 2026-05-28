import React, { useState, useMemo } from 'react';
import { Supplier } from '../../types';
import { Ban, X, Search, Undo2 } from 'lucide-react';

interface BlacklistModalProps {
  supplier: Supplier;
  onRestore: (itemName: string) => void;
  onClose: () => void;
}

const BlacklistModal: React.FC<BlacklistModalProps> = ({ supplier, onRestore, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredBlacklist = useMemo(() => {
    if (!supplier.blacklist) return [];
    const term = searchTerm.toLowerCase();
    return supplier.blacklist.filter(item => item.toLowerCase().includes(term));
  }, [supplier.blacklist, searchTerm]);

  return (
    <div className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 w-full max-w-3xl rounded-xl border border-slate-700 flex flex-col shadow-2xl max-h-[80vh]">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950 rounded-t-xl">
          <h3 className="font-bold text-white flex items-center gap-2">
            <Ban className="w-5 h-5 text-red-500" /> Lista Negra ({supplier.blacklist?.length || 0})
          </h3>
          <button onClick={onClose}><X className="w-6 h-6 text-slate-500 hover:text-white" /></button>
        </div>
        <div className="p-4 border-b border-slate-800 bg-slate-900">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Pesquisar itens bloqueados..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 pl-10 pr-4 text-sm text-white focus:border-red-500 focus:outline-none"
            />
          </div>
        </div>
        <div className="p-4 overflow-y-auto space-y-2 bg-slate-900">
          <p className="text-sm text-slate-400 mb-2">Itens abaixo são ignorados automaticamente ao importar cotações deste fornecedor.</p>
          {(!supplier.blacklist || supplier.blacklist.length === 0) && (
            <div className="text-center text-slate-500 py-8 italic border-2 border-dashed border-slate-800 rounded-lg">
              Nenhum item bloqueado.
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {filteredBlacklist.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between bg-slate-800 p-3 rounded border border-slate-700 hover:border-red-900/50 transition-colors">
                <span className="text-sm text-slate-300 truncate mr-2" title={item}>{item}</span>
                <button
                  onClick={() => onRestore(item)}
                  className="text-green-500 hover:text-white hover:bg-green-600 p-1.5 rounded transition-colors"
                  title="Restaurar para lista de cotação"
                >
                  <Undo2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex justify-end rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 border border-slate-700">Fechar</button>
        </div>
      </div>
    </div>
  );
};

export default BlacklistModal;
