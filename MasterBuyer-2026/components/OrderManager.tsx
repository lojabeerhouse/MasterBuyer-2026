
import React, { useState } from 'react';
import { CartItem, PurchaseOrder } from '../types';
import { ShoppingBag, Trash2, Send, Table2, Grid } from 'lucide-react';

interface OrderManagerProps {
  cart: CartItem[];
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
}

const OrderManager: React.FC<OrderManagerProps> = ({ cart, setCart }) => {
  const [activeView, setActiveView] = useState<'summary' | 'suppliers'>('summary');
  
  const orders: PurchaseOrder[] = Object.values(cart.reduce((acc, item) => {
      if (!acc[item.supplierId]) {
          acc[item.supplierId] = {
              supplierId: item.supplierId,
              supplierName: item.supplierName,
              items: [],
              totalValue: 0
          };
      }
      acc[item.supplierId].items.push(item);
      acc[item.supplierId].totalValue += item.totalCost;
      return acc;
  }, {} as Record<string, PurchaseOrder>));

  const totalGeneralCost = cart.reduce((acc, item) => acc + item.totalCost, 0);

  const removeItem = (itemId: string) => {
      setCart(prev => prev.filter(item => item.id !== itemId));
  };

  const updateQuantity = (itemId: string, newQtyPacks: number) => {
      // Se a quantidade descer para 0 ou menos, removemos o item da lista
      if (newQtyPacks <= 0) {
          removeItem(itemId);
          return;
      }

      setCart(prev => prev.map(item => {
          if (item.id === itemId) {
              return {
                  ...item,
                  quantityToBuy: newQtyPacks,
                  totalCost: newQtyPacks * item.packPrice
              };
          }
          return item;
      }));
  };

  const sendToWhatsApp = (order: PurchaseOrder) => {
    const today = new Date().toLocaleDateString();
    let text = `*PEDIDO DE COMPRA - ${order.supplierName}*\n`;
    text += `Data: ${today}\n`;
    text += `--------------------------------\n`;
    order.items.forEach(item => {
        const type = item.packQuantity > 1 ? `(Cx/${item.packQuantity})` : '(UN)';
        text += `• ${item.quantityToBuy}x ${item.productName} ${type}\n`;
        text += `  _Total Unid: ${item.quantityToBuy * item.packQuantity}_\n`;
    });
    text += `--------------------------------\n`;
    text += `*Valor Estimado: R$ ${order.totalValue.toLocaleString('pt-BR', {minimumFractionDigits: 2})}*\n`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  if (cart.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-slate-500">
            <ShoppingBag className="w-16 h-16 mb-4 opacity-20" />
            <p>Seu pedido está vazio.</p>
        </div>
      );
  }

  return (
    <div className="h-full flex flex-col pb-6">
        <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 mb-6 flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex bg-slate-900 p-1 rounded-md border border-slate-800">
                <button onClick={() => setActiveView('summary')} className={`px-4 py-2 rounded text-sm font-medium flex items-center gap-2 transition-all ${activeView === 'summary' ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}><Table2 className="w-4 h-4"/> Visão Geral</button>
                <button onClick={() => setActiveView('suppliers')} className={`px-4 py-2 rounded text-sm font-medium flex items-center gap-2 transition-all ${activeView === 'suppliers' ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}><Grid className="w-4 h-4"/> Por Fornecedor</button>
            </div>
            <div className="text-right">
                <span className="text-xs text-slate-400 uppercase">Total Geral</span>
                <p className="text-2xl font-bold text-green-400">R$ {totalGeneralCost.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
            </div>
        </div>

        {activeView === 'summary' ? (
            <div className="flex-1 bg-slate-800 rounded-lg border border-slate-700 shadow-xl overflow-hidden flex flex-col">
                <div className="overflow-x-auto flex-1">
                    <table className="w-full text-sm text-left border-collapse">
                        <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider text-xs sticky top-0 z-10">
                            <tr>
                                <th className="p-4">Descrição</th>
                                <th className="p-4 text-center">Caixas</th>
                                <th className="p-4 text-center">Und.</th>
                                <th className="p-4 text-right">Preço Cx</th>
                                <th className="p-4 text-right font-bold">Preço Total</th>
                                <th className="p-4 text-center">Lote</th>
                                <th className="p-4">Fornecedor</th>
                                <th className="p-4 text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="text-slate-300 divide-y divide-slate-700">
                            {cart.map((item) => (
                                <tr key={item.id} className="hover:bg-slate-700/30 transition-colors bg-slate-900/20 group">
                                    <td className="p-3 font-medium text-white">{item.productName}</td>
                                    <td className="p-3 text-center">
                                        <input type="number" min="0" value={item.quantityToBuy} onChange={(e) => updateQuantity(item.id, parseInt(e.target.value) || 0)} className="w-16 bg-slate-800 border border-slate-600 rounded p-1 text-center font-bold text-white focus:border-amber-500 focus:outline-none"/>
                                    </td>
                                    <td className="p-3 text-center text-slate-400">{Math.round(item.quantityToBuy * item.packQuantity)}</td>
                                    <td className="p-3 text-right">R$ {item.packPrice.toFixed(2)}</td>
                                    <td className="p-3 text-right font-bold text-green-400">R$ {item.totalCost.toFixed(2)}</td>
                                    <td className="p-3 text-center"><span className="bg-slate-800 px-2 py-0.5 rounded text-xs border border-slate-700">{item.packQuantity}</span></td>
                                    <td className="p-3 text-amber-500 font-medium">{item.supplierName}</td>
                                    <td className="p-3 text-center">
                                        <button onClick={() => { if(confirm(`Remover "${item.productName}" do pedido?`)) removeItem(item.id); }} className="p-2 text-slate-500 hover:text-red-500 transition-colors"><Trash2 className="w-5 h-5"/></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 overflow-y-auto">
                {orders.map(order => (
                    <div key={order.supplierId} className="bg-slate-800 rounded-lg border border-slate-700 h-fit shadow-lg overflow-hidden">
                        <div className="p-4 border-b border-slate-700 bg-slate-900/50 flex justify-between items-center">
                            <div><h3 className="font-bold text-white text-lg">{order.supplierName}</h3><p className="text-slate-400 text-sm">{order.items.length} itens</p></div>
                            <div className="text-right"><p className="text-xs text-slate-400">Total</p><p className="text-xl font-bold text-amber-500">R$ {order.totalValue.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p></div>
                        </div>
                        <div className="p-4 space-y-3">
                            {order.items.map(item => (
                                <div key={item.id} className="flex items-center gap-4 bg-slate-900 p-3 rounded border border-slate-700/50">
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-slate-200 truncate">{item.productName}</p>
                                        <p className="text-xs text-slate-500">Lote: {item.packQuantity} • Unit: R$ {(item.packPrice/item.packQuantity).toFixed(2)}</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <input type="number" min="0" value={item.quantityToBuy} onChange={(e) => updateQuantity(item.id, parseInt(e.target.value) || 0)} className="w-14 bg-slate-800 border border-slate-600 rounded p-1 text-center text-xs font-bold text-white focus:outline-none"/>
                                        <button onClick={() => { if(confirm(`Remover "${item.productName}"?`)) removeItem(item.id); }} className="text-slate-600 hover:text-red-400 p-1 transition-colors"><Trash2 className="w-4 h-4" /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="p-4 border-t border-slate-700 flex justify-end gap-3 bg-slate-900/30">
                            <button onClick={() => sendToWhatsApp(order)} className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-medium transition-all shadow-lg shadow-green-900/20"><Send className="w-4 h-4" /> WhatsApp</button>
                        </div>
                    </div>
                ))}
            </div>
        )}
    </div>
  );
};

export default OrderManager;
