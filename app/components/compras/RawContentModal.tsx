import React from 'react';
import { X, Files, Download, FilePlus } from 'lucide-react';

interface RawContentModalProps {
  content: string;
  fileName: string;
  onCopy: () => void;
  onDownload: () => void;
  onImport: () => void;
  onClose: () => void;
}

const RawContentModal: React.FC<RawContentModalProps> = ({ content, fileName, onCopy, onDownload, onImport, onClose }) => {
  return (
    <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-800 gap-2 flex-wrap">
          <span className="text-white text-sm font-semibold truncate">{fileName}</span>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={onCopy}
              className="px-3 py-1 rounded text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 flex items-center gap-1"
            >
              <Files className="w-3 h-3" /> Copiar
            </button>
            <button
              onClick={onDownload}
              className="px-3 py-1 rounded text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 flex items-center gap-1"
            >
              <Download className="w-3 h-3" /> Baixar
            </button>
            <button
              onClick={onImport}
              className="px-3 py-1 rounded text-xs bg-amber-600 hover:bg-amber-500 text-white flex items-center gap-1"
            >
              <FilePlus className="w-3 h-3" /> Importar como cotação
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <pre className="p-4 overflow-auto text-xs text-slate-300 whitespace-pre-wrap flex-1 font-mono">
          {content}
        </pre>
      </div>
    </div>
  );
};

export default RawContentModal;
