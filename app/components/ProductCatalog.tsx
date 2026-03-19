
import React, { useState, useMemo } from 'react';
import { Supplier, CartItem, ForecastItem } from '../types';
import { Search, ShoppingCart, Package, Calendar, Minus, Plus, Check, ArrowDownUp, ChevronLeft, ChevronRight } from 'lucide-react';

interface ProductCatalogProps {
  suppliers: Supplier[];
  cart: CartItem[];
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
  forecast: ForecastItem[];
}

interface CatalogItem {
    id: string; // unique combo of supplier + name + pack
    supplierId: string;
    supplierName: string;
    sku: string;
    name: string;
    price: number; // Pack price
    unit: string;
    packQuantity: number;
    unitPrice: number;
    date: number;
    totalSold: number; // For sorting
}

const ITEMS_PER_PAGE = 20;

const ProductCatalog: React.FC<ProductCatalogProps> = ({ suppliers, cart, setCart, forecast }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [qtyInputs, setQtyInputs] = useState<Record<string, number>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [sortOption, setSortOption] = useState<'sales' | 'alpha'>('sales');

  // Flatten latest quotes from all enabled suppliers
  const catalogItems = useMemo(() => {
    const items: CatalogItem[] = [];
    
    // Create map for fast Sales lookup
    const salesMap = new Map<string, number>();
    forecast.forEach(f => {
        if (f.sku) {
            salesMap.set(f.sku.toLowerCase(), f.totalSold);
        }
    });
    
    // Helper to fuzzy match sales
    const getSales = (name: string, sku: string) => {
        if (sku && salesMap.has(sku.toLowerCase())) {
            return salesMap.get(sku.toLowerCase()) || 0;
        }
        // Simple name fallback logic could go here, but strict sku is safer
        return 0;
    };

    suppliers.filter(s => s.isEnabled).forEach(supplier => {
        // All completed quotes sorted by recency (newest first)
        const completedQuotes = [...supplier.quotes]
            .filter(q => q.status === 'completed')
            .sort((a, b) => b.timestamp - a.timestamp);

        // Deduplicate by product name: first occurrence = most recent price
        const seenNames = new Map<string, boolean>();
        for (const quote of completedQuotes) {
            for (const q of quote.items) {
                if (seenNames.has(q.name)) continue;
                seenNames.set(q.name, true);

                const sold = getSales(q.name, q.sku || '');
                items.push({
                    id: `${supplier.id}-${q.name}-${q.packQuantity}`,
                    supplierId: supplier.id,
                    supplierName: supplier.name,
                    sku: q.sku || 'S/N',
                    name: q.name,
                    price: q.price,
                    unit: q.unit,
                    packQuantity: q.packQuantity,
                    unitPrice: q.unitPrice,
                    date: quote.timestamp,
                    totalSold: sold
                });
            }
        }
    });

    return items;
  }, [suppliers, forecast]);

  const filteredAndSortedItems = useMemo(() => {
      let items = catalogItems;

      if (searchTerm.trim()) {
          const searchNormalize = (str: string) =>
            str.toLowerCase()
              .replace(/ç/g, '\x00')
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .replace(/\x00/g, 'ç');
          const term = searchNormalize(searchTerm);
          items = items.filter(i =>
            searchNormalize(i.name || '').includes(term) ||
            searchNormalize(i.sku || '').includes(term)
          );
      }

      return items.sort((a, b) => {
          if (sortOption === 'sales') {
              // Primary: Sales Descending
              if (b.totalSold !== a.totalSold) return b.totalSold - a.totalSold;
              // Secondary: Alphabetical
              return (a.name || '').localeCompare(b.name || '');
          } else {
              // Alphabetical
              return (a.name || '').localeCompare(b.name || '');
          }
      });
  }, [catalogItems, searchTerm, sortOption]);

  // Reset page when search changes
  useMemo(() => {
      setCurrentPage(1);
  }, [searchTerm, sortOption]);

  const totalPages = Math.ceil(filteredAndSortedItems.length / ITEMS_PER_PAGE);
  const displayedItems = filteredAndSortedItems.slice(
      (currentPage - 1) * ITEMS_PER_PAGE,
      currentPage * ITEMS_PER_PAGE
  );

  const handleQtyChange = (itemId: string, delta: number) => {
      setQtyInputs(prev => {
          const current = prev[itemId] || 1;
          const newValue = Math.max(1, current + delta);
          return { ...prev, [itemId]: newValue };
      });
  };

  const addToCart = (item: CatalogItem) => {
      const qty = qtyInputs[item.id] || 1;
      
      setCart(prev => {
        const cartItemId = `${item.supplierId}-${item.name}-${item.packQuantity}`;
        const existing = prev.find(p => p.id === cartItemId);
        
        if (existing) {
            return prev.map(p => p.id === cartItemId ? {
                ...p,
                quantityToBuy: p.quantityToBuy + qty,
                totalCost: (p.quantityToBuy + qty) * item.price
            } : p);
        }

        const newItem: CartItem = {
            id: cartItemId,
            sku: item.sku, 
            productName: item.name,
            supplierId: item.supplierId,
            supplierName: item.supplierName,
            packQuantity: item.packQuantity,
            packPrice: item.price,
            quantityToBuy: qty, 
            totalCost: item.price * qty
        };
        return [...prev, newItem];
      });
      
      // Visual feedback reset
      setQtyInputs(prev => ({ ...prev, [item.id]: 1 }));
  };

  const getCartCount = (itemId: string) => {
      const item = cart.find(c => c.id === itemId);
      return item ? item.quantityToBuy : 0;
  };

  return (
    <div className="h-full flex flex-col space-y-4 overflow-hidden">
        {/* Search Header */}
        <div className="bg-slate-800 p-6 rounded-lg border border-slate-700 shadow-sm flex flex-col gap-4 shrink-0">
            <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Search className="w-6 h-6 text-amber-500" /> Catálogo Geral
                </h2>
                <p className="text-slate-400 text-sm mt-1">
                    Pesquise produtos em todas as cotações ativas. Exibindo {catalogItems.length} itens no total.
                </p>
            </div>
            
            <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-3.5 w-5 h-5 text-slate-500" />
                    <input 
                        type="text" 
                        placeholder="Ex: Vinho, Skol, Refrigerante..." 
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg py-3 pl-12 pr-4 text-lg text-white focus:border-amber-500 focus:outline-none shadow-inner"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                
                <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-lg border border-slate-700">
                    <button 
                        onClick={() => setSortOption('sales')} 
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${sortOption === 'sales' ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                    >
                        <ArrowDownUp className="w-4 h-4" /> Vendas
                    </button>
                    <button 
                        onClick={() => setSortOption('alpha')} 
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${sortOption === 'alpha' ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                    >
                        A-Z
                    </button>
                </div>
            </div>
        </div>

        {/* Results Grid */}
        <div className="flex-1 overflow-y-auto rounded-lg custom-scrollbar">
            {displayedItems.length > 0 ? (
                <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-4">
                    {displayedItems.map((item) => {
                        const cartQty = getCartCount(item.id);
                        const currentInputQty = qtyInputs[item.id] || 1;

                        return (
                            <div key={item.id} className="bg-slate-800 border border-slate-700 rounded-lg p-4 flex flex-col justify-between hover:border-slate-600 transition-all shadow-sm group">
                                <div>
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="text-xs font-bold text-amber-500 bg-amber-950/30 px-2 py-0.5 rounded border border-amber-500/20 truncate max-w-[70%]">
                                            {item.supplierName}
                                        </span>
                                        <span className="text-[10px] text-slate-500 flex items-center gap-1">
                                            <Calendar className="w-3 h-3"/> {new Date(item.date).toLocaleDateString()}
                                        </span>
                                    </div>
                                    
                                    <h3 className="font-bold text-slate-100 text-lg leading-tight mb-1 line-clamp-2" title={item.name}>
                                        {item.name}
                                    </h3>
                                    
                                    <div className="flex items-center gap-2 mb-3 flex-wrap">
                                        {item.packQuantity > 1 ? (
                                            <span className="text-xs bg-slate-900 px-2 py-0.5 rounded text-slate-400 border border-slate-700">
                                                Caixa c/ {item.packQuantity}
                                            </span>
                                        ) : (
                                            <span className="text-xs bg-slate-900 px-2 py-0.5 rounded text-slate-400 border border-slate-700">
                                                Unidade
                                            </span>
                                        )}
                                        {item.totalSold > 0 && (
                                            <span className="text-xs bg-indigo-900/40 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/30">
                                                ★ {item.totalSold} vnds
                                            </span>
                                        )}
                                    </div>

                                    <div className="mb-4 p-3 bg-slate-900/50 rounded-lg border border-slate-800/50">
                                        <div className="flex justify-between items-end">
                                            <div>
                                                <p className="text-xs text-slate-500 uppercase">Preço Unitário</p>
                                                <p className="text-xl font-bold text-green-400">R$ {item.unitPrice.toFixed(2)}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-xs text-slate-500 uppercase">Embalagem</p>
                                                <p className="text-sm font-medium text-slate-300">R$ {item.price.toFixed(2)}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-auto pt-3 border-t border-slate-700">
                                    {cartQty > 0 && (
                                        <div className="mb-2 text-xs text-center text-green-500 font-medium bg-green-950/20 py-1 rounded border border-green-900/30 flex items-center justify-center gap-1">
                                            <Check className="w-3 h-3" /> {cartQty} caixas no pedido
                                        </div>
                                    )}
                                    <div className="flex items-center gap-2">
                                        <div className="flex items-center bg-slate-900 rounded border border-slate-700">
                                            <button 
                                                onClick={() => handleQtyChange(item.id, -1)}
                                                className="p-2 hover:bg-slate-700 text-slate-400 hover:text-white rounded-l transition-colors"
                                            >
                                                <Minus className="w-4 h-4"/>
                                            </button>
                                            <span className="w-8 text-center text-sm font-bold text-white">{currentInputQty}</span>
                                            <button 
                                                onClick={() => handleQtyChange(item.id, 1)}
                                                className="p-2 hover:bg-slate-700 text-slate-400 hover:text-white rounded-r transition-colors"
                                            >
                                                <Plus className="w-4 h-4"/>
                                            </button>
                                        </div>
                                        
                                        <button 
                                            onClick={() => addToCart(item)}
                                            className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95 text-sm"
                                        >
                                            <ShoppingCart className="w-4 h-4" /> Adicionar
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
                
                {/* Pagination Controls */}
                <div className="flex justify-center items-center gap-4 py-6">
                    <button 
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                        className="p-2 rounded bg-slate-800 border border-slate-700 text-slate-300 disabled:opacity-50 hover:bg-slate-700"
                    >
                        <ChevronLeft className="w-5 h-5"/>
                    </button>
                    <span className="text-sm text-slate-400">
                        Página <span className="text-white font-bold">{currentPage}</span> de {totalPages}
                    </span>
                    <button 
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                        className="p-2 rounded bg-slate-800 border border-slate-700 text-slate-300 disabled:opacity-50 hover:bg-slate-700"
                    >
                        <ChevronRight className="w-5 h-5"/>
                    </button>
                </div>
                </>
            ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 pb-20">
                    <Package className="w-16 h-16 mb-4 opacity-20" />
                    {searchTerm ? (
                        <p>Nenhum produto encontrado para "{searchTerm}".</p>
                    ) : (
                        <p>Digite algo acima para pesquisar em todos os fornecedores.</p>
                    )}
                </div>
            )}
        </div>
    </div>
  );
};

export default ProductCatalog;
