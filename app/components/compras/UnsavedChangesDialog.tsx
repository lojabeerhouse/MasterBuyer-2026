import React from 'react';
import { AlertTriangle, Save, X } from 'lucide-react';

interface UnsavedChangesDialogProps {
  isOpen: boolean;
  onSaveAndClose: () => void;
  onDiscardAndClose: () => void;
  onCancel: () => void;
}

const UnsavedChangesDialog: React.FC<UnsavedChangesDialogProps> = ({
  isOpen,
  onSaveAndClose,
  onDiscardAndClose,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center pointer-events-auto">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl p-5 w-80 relative z-10">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          <h4 className="font-bold text-white text-sm">Alterações não salvas</h4>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Você fez alterações nesta cotação. O que deseja fazer?
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={onSaveAndClose}
            className="px-3 py-2 text-xs text-white bg-amber-600 hover:bg-amber-500 rounded-lg font-semibold flex items-center gap-2 transition-colors"
          >
            <Save className="w-3.5 h-3.5" /> Salvar e fechar
          </button>
          <button
            onClick={onDiscardAndClose}
            className="px-3 py-2 text-xs text-slate-200 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium flex items-center gap-2 transition-colors"
          >
            <X className="w-3.5 h-3.5" /> Fechar sem salvar
          </button>
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs text-slate-400 hover:text-white text-center transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};

export default UnsavedChangesDialog;
