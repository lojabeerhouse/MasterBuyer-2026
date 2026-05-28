import React from 'react';
import { Check } from 'lucide-react';

interface ConfirmAction {
  type: 'ban' | 'delete';
  batchId: string;
  itemIndex: number;
  itemName: string;
}

interface ConfirmActionDialogProps {
  action: ConfirmAction | null;
  dontAskAgain: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onDontAskAgainChange: (value: boolean) => void;
}

const ConfirmActionDialog: React.FC<ConfirmActionDialogProps> = ({
  action,
  dontAskAgain,
  onConfirm,
  onCancel,
  onDontAskAgainChange,
}) => {
  if (!action) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center pointer-events-auto">
      <div className="absolute inset-0 bg-transparent" onClick={onCancel} />
      <div className="bg-slate-800 border border-slate-600 rounded-lg shadow-2xl p-4 w-72 transform transition-all animate-in fade-in zoom-in-95 relative z-10">
        <h4 className="font-bold text-white mb-1">
          {action.type === 'ban' ? 'Bloquear Item?' : 'Excluir Item?'}
        </h4>
        <p className="text-xs text-slate-400 mb-3 line-clamp-2">
          {action.type === 'ban'
            ? `Isso irá adicionar "${action.itemName}" à lista negra.`
            : `Isso removerá "${action.itemName}" desta cotação.`}
        </p>
        <div
          className="flex items-center gap-2 mb-3 cursor-pointer"
          onClick={() => onDontAskAgainChange(!dontAskAgain)}
        >
          <div className={`w-3 h-3 border rounded flex items-center justify-center ${dontAskAgain ? 'bg-amber-500 border-amber-500' : 'border-slate-500'}`}>
            {dontAskAgain && <Check className="w-2 h-2 text-slate-900" />}
          </div>
          <span className="text-[10px] text-slate-400">Não perguntar novamente nesta sessão</span>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-3 py-1.5 text-xs text-slate-300 hover:text-white">
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className={`px-3 py-1.5 text-xs text-white rounded font-medium shadow-md ${action.type === 'ban' ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-600 hover:bg-slate-500'}`}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmActionDialog;
