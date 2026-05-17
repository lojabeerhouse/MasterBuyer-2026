import React from 'react';
import { AlertTriangle, X, Save, LogOut } from 'lucide-react';

interface ExitUnsavedModalProps {
  onConfirm: () => void; // Sair sem salvar
  onCancel: () => void;  // Voltar
  onSaveAndExit?: () => void; // Salvar e Sair (opcional)
}

const ExitUnsavedModal: React.FC<ExitUnsavedModalProps> = ({ onConfirm, onCancel, onSaveAndExit }) => {
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-slate-950/50 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-900/30 flex items-center justify-center border border-red-500/30">
              <AlertTriangle className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <h3 className="text-white font-bold text-sm uppercase tracking-wider">Alterações não salvas</h3>
              <p className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">Atenção ao sair da página</p>
            </div>
          </div>
          <button onClick={onCancel} className="text-slate-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          <p className="text-slate-300 text-sm leading-relaxed">
            Você tem alterações que ainda não foram salvas. Se sair agora, essas modificações serão <span className="text-red-400 font-bold">perdidas</span>.
          </p>
          <p className="text-slate-400 text-xs mt-3 italic">
            Deseja salvar antes de sair ou descartar as alterações?
          </p>
        </div>

        {/* Footer */}
        <div className="bg-slate-950/50 px-6 py-4 flex flex-col gap-2">
          {onSaveAndExit && (
            <button
              onClick={onSaveAndExit}
              className="w-full py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold uppercase transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-900/20"
            >
              <Save className="w-4 h-4" /> Salvar Alterações e Sair
            </button>
          )}
          
          <div className="flex gap-2">
            <button
              onClick={onConfirm}
              className="flex-1 py-2.5 bg-slate-800 hover:bg-red-900/40 text-slate-300 hover:text-red-400 border border-slate-700 hover:border-red-500/30 rounded-xl text-xs font-bold uppercase transition-all flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" /> Sair sem Salvar
            </button>
            
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-xs font-bold uppercase transition-all"
            >
              Voltar e Editar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExitUnsavedModal;
