import React, { useState, useMemo } from 'react';
import { Search, ShoppingCart, Plus, Minus, Trash2, CreditCard, Banknote, Tag, ScanBarcode } from 'lucide-react';
import { MasterProduct } from '../types';

interface POSProps {
  masterProducts: MasterProduct[];
}

interface CartItem {
  product: MasterProduct;
  quantity: number;
}

const POS: React.FC<POSProps> = ({ masterProducts }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);

  // Filter products based on search term
  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) {
      // Retorna até 30 produtos como 'atalhos'
      return masterProducts.slice(0, 30);
    }
    const searchTerms = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
    return masterProducts.filter(p => {
      const name = p.name.toLowerCase();
      const sku = p.sku.toLowerCase();
      const ean = (p.ean || '').toLowerCase();
      const searchableText = `${name} ${sku} ${ean}`;
      
      return searchTerms.every(term => searchableText.includes(term));
    }).slice(0, 50);
  }, [masterProducts, searchTerm]);

  // Cart operations
  const addToCart = (product: MasterProduct) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { product, quantity: 1 }];
    });
    setSearchTerm(''); // Clear search after adding
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.product.id === productId) {
        const newQ = item.quantity + delta;
        return newQ > 0 ? { ...item, quantity: newQ } : item;
      }
      return item;
    }));
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  };

  const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const subtotal = cart.reduce((sum, item) => sum + ((item.product.priceSell || 0) * item.quantity), 0);
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="flex flex-col lg:flex-row h-full gap-4 overflow-hidden fade-in">
        {/* Left Area: Product Search & Entry */}
        <div className="flex-[3] flex flex-col bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-800 bg-slate-800/50">
                <h2 className="text-lg font-bold text-white mb-4">Frente de Caixa (PDV)</h2>
                <div className="flex gap-2 relative">
                    <Search className="absolute left-3 top-3 w-5 h-5 text-slate-500" />
                    <input 
                        type="text" 
                        placeholder="Buscar por nome ou bipar código de barras..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-white focus:outline-none focus:border-amber-500 transition-colors"
                        autoFocus
                    />
                    <button className="bg-amber-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-amber-500 transition-colors shrink-0 flex items-center gap-2" title="Bipar com Leitor">
                        <ScanBarcode className="w-5 h-5" />
                        <span className="hidden sm:inline">Bipar</span>
                    </button>
                </div>
            </div>

            {/* Quick Categories/Products Grid */}
            <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                    {searchTerm ? 'Resultados da Busca' : 'Produtos Adicionados (Atalhos)'}
                </h3>
                
                {filteredProducts.length === 0 ? (
                    <div className="text-center text-slate-500 mt-10">
                        Nenhum produto encontrado.
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                        {filteredProducts.map(p => (
                            <button 
                                key={p.id} 
                                onClick={() => addToCart(p)}
                                className="aspect-square bg-slate-800 border border-slate-700 rounded-xl p-3 flex flex-col items-center justify-center gap-2 hover:border-amber-500 hover:bg-slate-700 transition-all text-center group"
                            >
                                <div className="w-10 h-10 bg-slate-700/50 rounded-full flex items-center justify-center group-hover:bg-slate-600 transition-colors shrink-0 overflow-hidden">
                                    {p.image ? (
                                        <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <Tag className="w-4 h-4 text-slate-400 group-hover:text-amber-400" />
                                    )}
                                </div>
                                <div className="flex flex-col flex-1 justify-end min-h-0">
                                    <p className="text-[11px] font-semibold text-slate-300 leading-tight line-clamp-2" title={p.name}>{p.name}</p>
                                    <p className="text-amber-400 font-bold text-xs mt-1 shrink-0">{formatCurrency(p.priceSell || 0)}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>

        {/* Right Area: Cart & Checkout */}
        <div className="flex-[2] flex flex-col bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            {/* Header */}
            <div className="p-4 flex items-center justify-between border-b border-slate-800 bg-slate-800/50 shrink-0">
                <div className="flex items-center gap-2 text-white font-bold">
                    <ShoppingCart className="w-5 h-5 text-amber-500" />
                    <span>Resumo da Venda</span>
                </div>
                <span className="text-xs font-bold px-2 py-1 bg-slate-800 text-slate-300 rounded-md border border-slate-700">CAIXA 01</span>
            </div>

            {/* Cart Items */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                {cart.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-4">
                        <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center">
                            <ShoppingCart className="w-8 h-8 opacity-50" />
                        </div>
                        <p className="text-sm">Carrinho vazio</p>
                    </div>
                ) : (
                    cart.map(item => (
                        <div key={item.product.id} className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col gap-2 relative group overflow-hidden">
                            <div className="flex justify-between items-start gap-2">
                                <span className="text-sm font-semibold text-white leading-tight">{item.product.name}</span>
                                <span className="text-slate-400 text-[11px] font-mono whitespace-nowrap pt-0.5">{formatCurrency(item.product.priceSell)} un</span>
                            </div>
                            <div className="flex items-center justify-between mt-1 pt-2 border-t border-slate-800/50">
                                <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-0.5 border border-slate-700">
                                    <button onClick={() => updateQuantity(item.product.id, -1)} className="p-1 hover:text-white text-slate-400 transition-colors rounded">
                                        <Minus className="w-3.5 h-3.5" />
                                    </button>
                                    <span className="text-xs font-bold w-6 text-center text-white">{item.quantity}</span>
                                    <button onClick={() => updateQuantity(item.product.id, 1)} className="p-1 hover:text-white text-slate-400 transition-colors rounded">
                                        <Plus className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="font-bold text-amber-500 text-sm">
                                        {formatCurrency((item.product.priceSell || 0) * item.quantity)}
                                    </span>
                                    <button 
                                        onClick={() => removeFromCart(item.product.id)}
                                        className="text-slate-500 hover:text-red-400 transition-colors p-1" 
                                        title="Remover Item"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Totals & Actions */}
            <div className="p-4 border-t border-slate-800 bg-slate-950 space-y-4 shrink-0">
                <div className="space-y-2">
                    <div className="flex justify-between text-sm text-slate-400">
                        <span>Subtotal ({totalItems} itens)</span>
                        <span>{formatCurrency(subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-slate-400">
                        <span className="flex items-center gap-1 cursor-pointer hover:text-white transition-colors">
                            <Plus className="w-3 h-3" /> Desconto
                        </span>
                        <span className="text-emerald-400 font-mono">- R$ 0,00</span>
                    </div>
                    <div className="flex justify-between items-end pt-3 border-t border-slate-800/80 mt-1">
                        <span className="text-sm text-slate-300 font-bold uppercase tracking-wider mb-1">Total a Rceber</span>
                        <span className="text-4xl font-black text-emerald-400 tracking-tight">{formatCurrency(subtotal)}</span>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2">
                    <button disabled={cart.length === 0} className="flex flex-col items-center justify-center gap-1.5 bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-700 hover:border-emerald-500/50 text-slate-300 py-3 rounded-xl border border-slate-700 transition-all font-medium text-xs group">
                        <Banknote className="w-6 h-6 text-emerald-500 group-hover:scale-110 transition-transform" />
                        Dinheiro
                    </button>
                    <button disabled={cart.length === 0} className="flex flex-col items-center justify-center gap-1.5 bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-700 hover:border-blue-500/50 text-slate-300 py-3 rounded-xl border border-slate-700 transition-all font-medium text-xs group">
                        <CreditCard className="w-6 h-6 text-blue-400 group-hover:scale-110 transition-transform" />
                        Cartão / PIX
                    </button>
                </div>

                <button 
                    disabled={cart.length === 0}
                    className="w-full bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none hover:bg-emerald-500 text-white font-bold py-4 rounded-xl shadow-[0_0_15px_rgba(5,150,105,0.3)] transition-all text-sm uppercase tracking-widest mt-1"
                >
                    Finalizar Venda
                </button>
            </div>
        </div>
    </div>
  );
};
export default POS;
