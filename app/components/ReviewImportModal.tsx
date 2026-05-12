import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, AlertCircle } from 'lucide-react';
import { ProductQuote } from '../types';

interface ReviewImportModalProps {
  file: File;
  quotes: ProductQuote[];
  supplierName: string;
  onConfirm: (reviewedQuotes: ProductQuote[]) => void;
  onCancel: () => void;
}

export default function ReviewImportModal({ file, quotes, supplierName, onConfirm, onCancel }: ReviewImportModalProps) {
  const [editableQuotes, setEditableQuotes] = useState<ProductQuote[]>([]);
  const [fileUrl, setFileUrl] = useState<string | null>(null);

  useEffect(() => {
    // Clone para edição
    setEditableQuotes(JSON.parse(JSON.stringify(quotes)));
    
    // Cria object URL para o iframe/img
    const url = URL.createObjectURL(file);
    setFileUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [quotes, file]);

  const handleUpdate = (index: number, field: keyof ProductQuote, value: number) => {
    setEditableQuotes(prev => {
      const n = [...prev];
      n[index] = { ...n[index], [field]: value };
      return n;
    });
  };

  const isImage = file.type.startsWith('image/');
  const isPdf = file.type === 'application/pdf';

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-[95vw] h-[90vh] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-900/50">
          <div>
            <h3 className="font-bold text-white text-lg">Revisar Leitura da Nota</h3>
            <p className="text-xs text-slate-400">Fornecedor: <strong className="text-slate-300">{supplierName}</strong></p>
          </div>
          <button onClick={onCancel} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-800 text-slate-500 hover:text-white transition-colors">
            <X className="w-5 h-5"/>
          </button>
        </div>

        {/* Content Split */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          
          {/* Lado Esquerdo: Visualizador */}
          <div className="lg:w-1/2 border-r border-slate-800 bg-slate-950 flex flex-col">
            <div className="p-2 bg-slate-900/80 border-b border-slate-800 text-xs font-semibold text-slate-400 text-center">
              Documento Original ({file.name})
            </div>
            <div className="flex-1 overflow-auto p-4 custom-scrollbar flex items-center justify-center">
              {fileUrl && (
                isImage ? (
                  <img src={fileUrl} alt="Documento Original" className="max-w-full rounded border border-slate-800 shadow-md" />
                ) : isPdf ? (
                  <iframe src={`${fileUrl}#view=FitH`} className="w-full h-full rounded border border-slate-800" title="PDF Viewer" />
                ) : (
                  <div className="text-slate-500 text-sm flex flex-col items-center gap-2">
                    <AlertCircle className="w-8 h-8 opacity-50"/>
                    <p>Visualização não disponível para este tipo de arquivo.</p>
                  </div>
                )
              )}
            </div>
          </div>

          {/* Lado Direito: Tabela Editável */}
          <div className="lg:w-1/2 flex flex-col bg-slate-900">
            <div className="p-2 bg-slate-900/80 border-b border-slate-800 text-xs font-semibold text-purple-400 text-center flex items-center justify-center gap-2">
              Extração via IA / XML
            </div>
            
            <div className="flex-1 overflow-auto custom-scrollbar p-4">
              <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-xs text-left whitespace-nowrap">
                  <thead className="bg-slate-900/80 border-b border-slate-800">
                    <tr>
                      <th className="p-3 text-slate-400 font-semibold">Produto Lido</th>
                      <th className="p-3 text-slate-400 font-semibold text-center w-24">Tamanho<br/>do Pack</th>
                      <th className="p-3 text-purple-400 font-bold text-center w-24 bg-purple-900/10">Qtd Comprada<br/>(Packs)</th>
                      <th className="p-3 text-slate-400 font-semibold text-right">Preço Pack</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {editableQuotes.map((q, i) => (
                      <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                        <td className="p-3">
                          <p className="text-slate-200 font-medium truncate max-w-[200px]" title={q.name}>{q.name}</p>
                          <p className="text-[10px] text-slate-500">{q.sku}</p>
                        </td>
                        <td className="p-2 border-l border-slate-800/50">
                          <div className="flex justify-center">
                            <input 
                              type="number" min="1"
                              value={q.packQuantity}
                              onChange={e => handleUpdate(i, 'packQuantity', Number(e.target.value))}
                              className="w-14 bg-slate-950 border border-slate-700 rounded text-center py-1 text-sm focus:outline-none focus:border-amber-500 text-slate-300"
                            />
                          </div>
                        </td>
                        <td className="p-2 border-l border-slate-800/50 bg-purple-900/10">
                          <div className="flex justify-center">
                            <input 
                              type="number" min="1"
                              value={q.quantityBought || 1}
                              onChange={e => handleUpdate(i, 'quantityBought', Number(e.target.value))}
                              className="w-16 bg-slate-950 border border-purple-800 rounded text-center py-1 text-sm font-bold focus:outline-none focus:border-purple-400 text-purple-300"
                            />
                          </div>
                        </td>
                        <td className="p-3 border-l border-slate-800/50 text-right">
                          <input 
                            type="number" step="0.01" min="0"
                            value={q.price}
                            onChange={e => handleUpdate(i, 'price', Number(e.target.value))}
                            className="w-20 bg-transparent border-b border-dashed border-slate-600 text-right text-slate-300 focus:outline-none focus:border-amber-500"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-900/80 flex items-center justify-between shrink-0">
               <span className="text-xs text-slate-400">Certifique-se de que as quantidades e preços conferem com o documento.</span>
               <button onClick={() => onConfirm(editableQuotes)} className="flex items-center gap-2 px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold shadow-lg shadow-purple-900/20 transition-all">
                  <CheckCircle2 className="w-5 h-5"/>
                  Confirmar Leitura
               </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
