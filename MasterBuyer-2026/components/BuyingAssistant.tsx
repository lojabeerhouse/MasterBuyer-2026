import React, { useState, useRef, useEffect } from 'react';
import { Supplier, CartItem, SalesRecord } from '../types';
import { ShoppingBag, X, Search, Paperclip, Plus, ChevronRight, Package, TrendingDown, Clock, AlertCircle } from 'lucide-react';

interface BuyingAssistantProps {
  suppliers: Supplier[];
  cart: CartItem[];
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
  salesData: SalesRecord[];
}

interface ProductResult {
  productName: string;
  supplierId: string;
  supplierName: string;
  unitPrice: number;
  packPrice: number;
  packQuantity: number;
  isBest: boolean;
  lastQuoteDate: number;
}

interface SearchResult {
  query: string;
  found: boolean;
  results: ProductResult[];
  purchaseHistory: { date: string; qty: number }[];
}

const formatCurrency = (val: number) =>
  val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const timeAgo = (timestamp: number) => {
  const diff = Date.now() - timestamp;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'hoje';
  if (days === 1) return 'ontem';
  if (days < 7) return `${days} dias atrás`;
  if (days < 30) return `${Math.floor(days / 7)} sem. atrás`;
  return `${Math.floor(days / 30)} mês atrás`;
};

const BuyingAssistant: React.FC<BuyingAssistantProps> = ({ suppliers, cart, setCart, salesData }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [attachedText, setAttachedText] = useState('');
  const [showAttach, setShowAttach] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  const normalize = (str: string) =>
    str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '');

  const search = (searchQuery: string) => {
    const terms = normalize(searchQuery).split(/\s+/).filter(Boolean);
    if (!terms.length) return;

    const allItems: { productName: string; supplierId: string; supplierName: string; unitPrice: number; packPrice: number; packQuantity: number; lastQuoteDate: number }[] = [];

    suppliers.filter(s => s.isEnabled).forEach(supplier => {
      supplier.quotes.forEach(batch => {
        if (batch.status !== 'completed') return;
        batch.items.forEach(item => {
          const normName = normalize(item.name);
          const matches = terms.every(t => normName.includes(t));
          if (matches) {
            allItems.push({
              productName: item.name,
              supplierId: supplier.id,
              supplierName: supplier.name,
              unitPrice: item.unitPrice,
              packPrice: item.price,
              packQuantity: item.packQuantity,
              lastQuoteDate: batch.timestamp,
            });
          }
        });
      });
    });

    if (!allItems.length) {
      setResults([{ query: searchQuery, found: false, results: [], purchaseHistory: [] }]);
      setSearched(true);
      return;
    }

    // Group by product name similarity and find best price
    const minPrice = Math.min(...allItems.map(i => i.unitPrice));
    const productResults: ProductResult[] = allItems.map(item => ({
      ...item,
      isBest: item.unitPrice === minPrice,
    })).sort((a, b) => a.unitPrice - b.unitPrice);

    // Purchase history from sales data
    const normQuery = normalize(searchQuery);
    const history = salesData
      .filter(s => normalize(s.productName).includes(normQuery.split(' ')[0]))
      .reduce((acc: { date: string; qty: number }[], s) => {
        const existing = acc.find(a => a.date === s.date);
        if (existing) existing.qty += s.quantitySold;
        else acc.push({ date: s.date, qty: s.quantitySold });
        return acc;
      }, [])
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 3);

    setResults([{ query: searchQuery, found: true, results: productResults, purchaseHistory: history }]);
    setSearched(true);
  };

  const handleSearch = () => {
    const q = attachedText ? `${query} ${attachedText}`.trim() : query.trim();
    if (q) search(q);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      setAttachedText(ev.target?.result as string);
      setShowAttach(true);
    };
    reader.readAsText(file);
  };

  const addToCart = (result: ProductResult) => {
    const existing = cart.find(c => c.supplierId === result.supplierId && c.productName === result.productName);
    if (existing) return;
    const newItem: CartItem = {
      id: `${Date.now()}-${result.supplierId}`,
      sku: normalize(result.productName).slice(0, 10),
      productName: result.productName,
      supplierId: result.supplierId,
      supplierName: result.supplierName,
      packQuantity: result.packQuantity,
      packPrice: result.packPrice,
      quantityToBuy: 1,
      totalCost: result.packPrice,
    };
    setCart(prev => [...prev, newItem]);
  };

  const resetSearch = () => {
    setQuery('');
    setAttachedText('');
    setShowAttach(false);
    setResults([]);
    setSearched(false);
  };

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => { setOpen(true); resetSearch(); }}
        className="fixed bottom-6 right-6 z-50 group flex items-center gap-2 bg-amber-600 hover:bg-amber-500 text-white font-bold py-3 px-4 rounded-full shadow-2xl shadow-amber-900/50 transition-all duration-200 hover:scale-105 active:scale-95"
      >
        <ShoppingBag className="w-5 h-5" />
        <span className="text-sm hidden group-hover:inline transition-all">O que comprar?</span>
      </button>

      {/* Overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Modal */}
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden animate-in">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-amber-600 rounded-lg flex items-center justify-center">
                  <ShoppingBag className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h2 className="text-white font-bold text-sm leading-none">Assistente de Compras</h2>
                  <p className="text-slate-500 text-xs mt-0.5">Busca nas últimas cotações</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="text-slate-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-800">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search Area */}
            <div className="p-5">
              <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 focus-within:border-amber-600 transition-colors">
                <Search className="w-4 h-4 text-slate-500 shrink-0" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="O que você precisa comprar hoje?"
                  className="flex-1 bg-transparent text-white placeholder-slate-500 text-sm outline-none"
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  title="Anexar texto"
                  className={`p-1 rounded-lg transition-colors ${attachedText ? 'text-amber-400' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  <Paperclip className="w-4 h-4" />
                </button>
                <input ref={fileRef} type="file" accept=".txt,.csv" className="hidden" onChange={handleFile} />
              </div>

              {/* Attached file indicator */}
              {showAttach && attachedText && (
                <div className="mt-2 flex items-center gap-2 text-xs text-amber-400 bg-amber-950/30 border border-amber-900/50 rounded-lg px-3 py-2">
                  <Paperclip className="w-3 h-3" />
                  <span>Arquivo anexado ({attachedText.length} caracteres)</span>
                  <button onClick={() => { setAttachedText(''); setShowAttach(false); }} className="ml-auto text-slate-500 hover:text-white">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}

              <button
                onClick={handleSearch}
                disabled={!query.trim()}
                className="mt-3 w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm py-2.5 rounded-xl transition-all"
              >
                Buscar nos fornecedores
              </button>
            </div>

            {/* Results */}
            {searched && results.length > 0 && (
              <div className="border-t border-slate-800 max-h-80 overflow-y-auto">
                {results.map((result, i) => (
                  <div key={i} className="p-5">
                    {!result.found ? (
                      <div className="flex flex-col items-center gap-2 py-4 text-center">
                        <AlertCircle className="w-8 h-8 text-slate-600" />
                        <p className="text-slate-400 text-sm font-medium">Produto não cotado ainda</p>
                        <p className="text-slate-600 text-xs">Nenhum fornecedor tem <span className="text-slate-400">"{result.query}"</span> nas cotações recentes.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {/* Purchase history */}
                        {result.purchaseHistory.length > 0 && (
                          <div className="flex items-center gap-2 text-xs text-slate-500 mb-3">
                            <Clock className="w-3 h-3" />
                            <span>Compras recentes: </span>
                            {result.purchaseHistory.map((h, j) => (
                              <span key={j} className="bg-slate-800 px-2 py-0.5 rounded-full">{h.qty} un · {h.date}</span>
                            ))}
                          </div>
                        )}

                        {/* Supplier results */}
                        {result.results.map((r, j) => (
                          <div
                            key={j}
                            className={`rounded-xl border p-4 transition-all ${r.isBest ? 'border-amber-600/50 bg-amber-950/20' : 'border-slate-700/50 bg-slate-800/30'}`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  {r.isBest && (
                                    <span className="flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-900/40 px-2 py-0.5 rounded-full">
                                      <TrendingDown className="w-2.5 h-2.5" /> MELHOR PREÇO
                                    </span>
                                  )}
                                  <span className="text-[10px] text-slate-500">{timeAgo(r.lastQuoteDate)}</span>
                                </div>
                                <p className="text-white text-sm font-medium truncate">{r.productName}</p>
                                <p className="text-slate-400 text-xs mt-0.5 flex items-center gap-1">
                                  <Package className="w-3 h-3" />
                                  {r.supplierName} · caixa c/{r.packQuantity}
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-white font-bold text-base">{formatCurrency(r.unitPrice)}<span className="text-slate-500 text-xs font-normal">/un</span></p>
                                <p className="text-slate-500 text-xs">{formatCurrency(r.packPrice)} cx</p>
                              </div>
                            </div>
                            <button
                              onClick={() => addToCart(r)}
                              disabled={cart.some(c => c.supplierId === r.supplierId && c.productName === r.productName)}
                              className="mt-3 w-full flex items-center justify-center gap-2 text-xs font-semibold py-2 rounded-lg transition-all
                                disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed
                                bg-slate-700 hover:bg-amber-600 text-slate-300 hover:text-white"
                            >
                              {cart.some(c => c.supplierId === r.supplierId && c.productName === r.productName)
                                ? '✓ No carrinho'
                                : <><Plus className="w-3 h-3" /> Adicionar ao carrinho</>
                              }
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default BuyingAssistant;
