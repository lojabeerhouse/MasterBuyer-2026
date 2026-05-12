import React, { useState, useEffect, useMemo } from 'react';
import { X, AlertTriangle, CheckCircle2, PackageCheck } from 'lucide-react';
import { PurchaseOrder, CartItem } from '../types';

interface EditOrderModalProps {
  order: PurchaseOrder;
  onClose: () => void;
  onSave: (updatedItems: CartItem[], note: string, originalItems: CartItem[]) => void;
}

export default function EditOrderModal({ order, onClose, onSave }: EditOrderModalProps) {
  // Trabalharemos com uma cópia mutável dos itens atuais
  const [editableItems, setEditableItems] = useState<CartItem[]>([]);
  const [note, setNote] = useState('');

  useEffect(() => {
    // Clonagem profunda para não mutar o objeto original acidentalmente
    setEditableItems(JSON.parse(JSON.stringify(order.items)));
  }, [order]);

  // Verifica se há alguma quebra (Físico difere da Nota atual)
  const hasDiscrepancy = useMemo(() => {
    return editableItems.some((item, i) => {
      const original = order.items[i];
      if (!original) return false;
      return item.quantityToBuy !== original.quantityToBuy || item.packPrice !== original.packPrice;
    });
  }, [editableItems, order.items]);

  const handleUpdateItem = (index: number, field: keyof CartItem, value: number) => {
    setEditableItems(prev => {
      const n = [...prev];
      n[index] = { ...n[index], [field]: value };
      n[index].totalCost = n[index].quantityToBuy * n[index].packPrice;
      return n;
    });
  };

  const handleSave = () => {
    if (hasDiscrepancy && note.trim().length < 5) {
      alert("Por favor, detalhe a divergência na observação antes de salvar.");
      return;
    }
    onSave(editableItems, note, order.items);
  };

  const fmtCurrency = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const currentTotal = editableItems.reduce((acc, item) => acc + item.totalCost, 0);
  const diffTotal = currentTotal - order.totalValue;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/10 border border-blue-600/30 flex items-center justify-center shrink-0">
              <PackageCheck className="w-5 h-5 text-blue-400"/>
            </div>
            <div>
              <h3 className="font-bold text-white text-lg">Conferência de Carga</h3>
              <p className="text-xs text-slate-400">Fornecedor: <strong className="text-slate-300">{order.supplierName}</strong></p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-800 text-slate-500 hover:text-white transition-colors">
            <X className="w-5 h-5"/>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          
          <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden mb-6">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left whitespace-nowrap">
                <thead className="bg-slate-900/80 border-b border-slate-800">
                  <tr>
                    <th className="p-3 text-slate-400 font-semibold">Produto</th>
                    <th className="p-3 text-slate-400 font-semibold text-center border-l border-slate-800/50">Qtd Pedida<br/><span className="text-[9px] text-slate-500">(App)</span></th>
                    <th className="p-3 text-slate-400 font-semibold text-center border-l border-slate-800/50 bg-purple-900/10">Qtd Nota<br/><span className="text-[9px] text-purple-400">(XML)</span></th>
                    <th className="p-3 text-slate-200 font-bold text-center border-l border-slate-800/50 bg-blue-900/20">FÍSICO<br/><span className="text-[9px] text-blue-400">(Recebido)</span></th>
                    <th className="p-3 text-slate-400 font-semibold text-right border-l border-slate-800/50">Valor Unit.</th>
                    <th className="p-3 text-slate-400 font-semibold text-right border-l border-slate-800/50">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {editableItems.map((item, i) => {
                    const ogApp = order.originalSnapshot?.[i]?.quantityToBuy;
                    const invoiced = order.invoicedSnapshot?.[i]?.quantityToBuy || order.items[i]?.quantityToBuy;
                    const isDiffFromInvoice = item.quantityToBuy !== invoiced;
                    
                    return (
                      <tr key={item.id} className={`hover:bg-slate-800/30 transition-colors ${isDiffFromInvoice ? 'bg-amber-900/10' : ''}`}>
                        <td className="p-3">
                          <p className="text-slate-200 font-medium truncate max-w-[200px]" title={item.productName}>{item.productName}</p>
                          <p className="text-[10px] text-slate-500">Cx {item.packQuantity}</p>
                        </td>
                        
                        {/* Qtd Pedida (Se houver originalSnapshot, mostra. Senão, é o próprio item atual se não tiver nota) */}
                        <td className="p-3 text-center text-slate-500 border-l border-slate-800/50 font-medium">
                          {ogApp !== undefined ? ogApp : '-'}
                        </td>
                        
                        {/* Qtd Faturada */}
                        <td className="p-3 text-center text-purple-300 border-l border-slate-800/50 font-medium bg-purple-900/5">
                          {invoiced}
                        </td>
                        
                        {/* Qtd FÍSICA (Editável) */}
                        <td className="p-2 border-l border-slate-800/50 bg-blue-900/10">
                          <div className="flex items-center justify-center">
                            <input 
                              type="number" 
                              min="0"
                              value={item.quantityToBuy} 
                              onChange={(e) => handleUpdateItem(i, 'quantityToBuy', Number(e.target.value))}
                              className={`w-16 bg-slate-950 border rounded text-center py-1 text-sm font-bold focus:outline-none focus:border-blue-500 ${isDiffFromInvoice ? 'border-amber-500 text-amber-400' : 'border-slate-700 text-blue-400'}`}
                            />
                          </div>
                        </td>

                        {/* Valor Unit. */}
                        <td className="p-3 text-right border-l border-slate-800/50">
                           <input 
                              type="number" 
                              step="0.01"
                              min="0"
                              value={item.packPrice} 
                              onChange={(e) => handleUpdateItem(i, 'packPrice', Number(e.target.value))}
                              className="w-20 bg-transparent border-b border-dashed border-slate-600 text-right text-slate-300 focus:outline-none focus:border-amber-500"
                            />
                        </td>
                        
                        {/* Total Linha */}
                        <td className={`p-3 text-right font-bold border-l border-slate-800/50 ${isDiffFromInvoice ? 'text-amber-400' : 'text-slate-300'}`}>
                          {fmtCurrency(item.totalCost)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {hasDiscrepancy ? (
            <div className="bg-amber-950/20 border border-amber-900/50 rounded-xl p-4 animate-in fade-in slide-in-from-bottom-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-5 h-5 text-amber-500"/>
                <h4 className="text-amber-400 font-bold text-sm">Divergência Detectada</h4>
              </div>
              <p className="text-xs text-amber-200/70 mb-3">Você alterou quantidades ou preços em relação à nota faturada. Registre abaixo o motivo para notificar o vendedor/compras.</p>
              <textarea
                autoFocus
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Ex: Faltou 1 cx de Heineken e 2 vieram avariadas. Solicitar desconto..."
                className="w-full bg-slate-950 border border-amber-700/50 rounded-lg p-3 text-sm text-amber-100 placeholder:text-amber-700 focus:outline-none focus:border-amber-500 min-h-[80px]"
              />
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 py-6 text-emerald-500/50 border border-dashed border-emerald-900/30 rounded-xl bg-emerald-950/10">
              <CheckCircle2 className="w-5 h-5"/>
              <span className="text-sm font-semibold">Tudo batendo perfeitamente com a nota.</span>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/80 flex items-center justify-between shrink-0 rounded-b-2xl">
          <div className="flex flex-col">
            <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">Total Conferido</span>
            <div className="flex items-end gap-3">
              <span className="text-2xl font-bold text-white leading-none">{fmtCurrency(currentTotal)}</span>
              {diffTotal !== 0 && (
                <span className={`text-sm font-bold mb-0.5 ${diffTotal > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {diffTotal > 0 ? '+' : ''}{fmtCurrency(diffTotal)}
                </span>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-slate-300 font-semibold hover:bg-slate-800 transition-colors">
              Cancelar
            </button>
            <button onClick={handleSave} className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold shadow-lg shadow-blue-900/20 transition-all">
              <PackageCheck className="w-5 h-5"/>
              Salvar Conferência
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
