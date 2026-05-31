import React, { useState, useMemo } from 'react';
import { Search, ShoppingCart, Plus, Minus, Trash2, CreditCard, Banknote, Tag, ScanBarcode, CheckCircle2, X, User, Lock, Unlock } from 'lucide-react';
import { MasterProduct, SaleOrder, SaleOrderItem, PdvSession } from '../../types';

interface POSProps {
  masterProducts: MasterProduct[];
  onFinalizeSale: (items: SaleOrderItem[], paymentMethod: SaleOrder['paymentMethod'], origin?: SaleOrder['origin'], customerName?: string) => SaleOrder;
  activeSession?: PdvSession;
  onOpenSession?: (cashierName: string, openingBalance: number) => void;
  onCloseSession?: (sessionId: string) => void;
}

interface CartItem {
  product: MasterProduct;
  quantity: number;
}

type PaymentMethod = SaleOrder['paymentMethod'];

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: 'Dinheiro',
  card: 'Cartão / PIX',
  pix: 'PIX',
  mixed: 'Misto',
};

const POS: React.FC<POSProps> = ({ masterProducts, onFinalizeSale, activeSession, onOpenSession, onCloseSession }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod | null>(null);
  const [confirmedOrder, setConfirmedOrder] = useState<SaleOrder | null>(null);
  const [customerName, setCustomerName] = useState('Consumidor Final');

  // Modal de abertura de caixa
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [sessionCashier, setSessionCashier] = useState('');
  const [sessionBalance, setSessionBalance] = useState('0');

  const handleOpenSessionSubmit = () => {
    if (!sessionCashier.trim() || !onOpenSession) return;
    onOpenSession(sessionCashier.trim(), parseFloat(sessionBalance) || 0);
    setShowSessionModal(false);
    setSessionCashier('');
    setSessionBalance('0');
  };

  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return masterProducts.slice(0, 30);
    const terms = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
    return masterProducts.filter(p => {
      const text = `${p.name} ${p.sku} ${p.ean || ''}`.toLowerCase();
      return terms.every(t => text.includes(t));
    }).slice(0, 50);
  }, [masterProducts, searchTerm]);

  const addToCart = (product: MasterProduct) => {
    setCart(prev => {
      const existing = prev.find(i => i.product.id === product.id);
      if (existing) return prev.map(i => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { product, quantity: 1 }];
    });
    setSearchTerm('');
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(prev => prev.map(i => {
      if (i.product.id !== productId) return i;
      const newQ = i.quantity + delta;
      return newQ > 0 ? { ...i, quantity: newQ } : i;
    }));
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(i => i.product.id !== productId));
  };

  const fmt = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const subtotal = cart.reduce((s, i) => s + ((i.product.priceSell || 0) * i.quantity), 0);
  const totalItems = cart.reduce((s, i) => s + i.quantity, 0);
  const canFinalize = cart.length > 0 && selectedPayment !== null;

  const handleFinalize = () => {
    if (!canFinalize || !selectedPayment) return;
    const items: SaleOrderItem[] = cart.map(i => ({
      productId: i.product.id,
      sku: i.product.sku,
      name: i.product.name,
      unit: i.product.unit || 'un',
      qty: i.quantity,
      unitPrice: i.product.priceSell || 0,
      total: (i.product.priceSell || 0) * i.quantity,
    }));
    const order = onFinalizeSale(items, selectedPayment, 'pdv', customerName || 'Consumidor Final');
    setConfirmedOrder(order);
  };

  const handleNewSale = () => {
    setCart([]);
    setSelectedPayment(null);
    setConfirmedOrder(null);
    setCustomerName('Consumidor Final');
  };

  return (
    <div className="flex flex-col h-full overflow-hidden fade-in">
      {/* Banner de sessão de caixa */}
      {activeSession ? (
        <div className="flex items-center justify-between px-4 py-2 bg-emerald-950/40 border-b border-emerald-800/40 text-xs shrink-0">
          <div className="flex items-center gap-2 text-emerald-400 font-semibold">
            <Unlock className="w-3 h-3" />
            Caixa: {activeSession.cashierName}
            <span className="text-emerald-600 font-normal">· aberto {new Date(activeSession.openedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          {onCloseSession && (
            <button
              onClick={() => onCloseSession(activeSession.id)}
              className="text-slate-500 hover:text-red-400 font-medium transition-colors flex items-center gap-1"
            >
              <Lock className="w-3 h-3" /> Fechar Caixa
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between px-4 py-2 bg-slate-900/60 border-b border-slate-800/50 text-xs shrink-0">
          <span className="text-slate-600 flex items-center gap-1.5"><Lock className="w-3 h-3" /> Nenhuma sessão de caixa aberta</span>
          {onOpenSession && (
            <button
              onClick={() => setShowSessionModal(true)}
              className="text-amber-500 hover:text-amber-400 font-bold transition-colors"
            >
              Abrir Caixa →
            </button>
          )}
        </div>
      )}

      {/* Modal de abertura de caixa */}
      {showSessionModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 flex flex-col gap-4 w-80 shadow-2xl">
            <h3 className="text-sm font-bold text-white">Abrir Sessão de Caixa</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Nome do caixa / operador</label>
                <input
                  type="text"
                  value={sessionCashier}
                  onChange={e => setSessionCashier(e.target.value)}
                  placeholder="Ex: Caixa 1 — João"
                  autoFocus
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-colors"
                  onKeyDown={e => { if (e.key === 'Enter') handleOpenSessionSubmit(); if (e.key === 'Escape') setShowSessionModal(false); }}
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Saldo inicial (R$)</label>
                <input
                  type="number"
                  value={sessionBalance}
                  onChange={e => setSessionBalance(e.target.value)}
                  min="0"
                  step="0.01"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleOpenSessionSubmit}
                disabled={!sessionCashier.trim()}
                className="flex-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white font-bold py-2 rounded-xl text-sm transition-colors"
              >
                Abrir Caixa
              </button>
              <button
                onClick={() => setShowSessionModal(false)}
                className="px-4 text-slate-400 hover:text-white text-sm transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col lg:flex-row flex-1 gap-4 overflow-hidden p-0 relative">
      {/* Overlay de confirmação */}
      {confirmedOrder && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-sm rounded-2xl">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-8 flex flex-col items-center gap-5 max-w-sm w-full mx-4 shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
            <div className="text-center">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Venda Concluída</p>
              <p className="text-2xl font-black text-white">Pedido #{confirmedOrder.seqNumber}</p>
            </div>
            <div className="w-full bg-slate-800/60 rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm text-slate-400">
                <span>Forma de pagamento</span>
                <span className="text-white font-semibold">{PAYMENT_LABELS[confirmedOrder.paymentMethod]}</span>
              </div>
              <div className="flex justify-between text-sm text-slate-400">
                <span>Itens</span>
                <span className="text-white font-semibold">{confirmedOrder.items.reduce((s, i) => s + i.qty, 0)}</span>
              </div>
              <div className="flex justify-between items-end pt-2 border-t border-slate-700 mt-1">
                <span className="text-sm font-bold text-slate-300 uppercase tracking-wider">Total</span>
                <span className="text-2xl font-black text-emerald-400">{fmt(confirmedOrder.total)}</span>
              </div>
            </div>
            <button
              onClick={handleNewSale}
              className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-3 rounded-xl transition-colors text-sm uppercase tracking-widest"
            >
              Nova Venda
            </button>
          </div>
        </div>
      )}

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

        <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
            {searchTerm ? 'Resultados da Busca' : 'Produtos Adicionados (Atalhos)'}
          </h3>
          {filteredProducts.length === 0 ? (
            <div className="text-center text-slate-500 mt-10">Nenhum produto encontrado.</div>
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
                    <p className="text-amber-400 font-bold text-xs mt-1 shrink-0">{fmt(p.priceSell || 0)}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right Area: Cart & Checkout */}
      <div className="flex-[2] flex flex-col bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 flex items-center justify-between border-b border-slate-800 bg-slate-800/50 shrink-0">
          <div className="flex items-center gap-2 text-white font-bold">
            <ShoppingCart className="w-5 h-5 text-amber-500" />
            <span>Resumo da Venda</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold px-2 py-1 bg-slate-800 text-slate-300 rounded-md border border-slate-700">CAIXA 01</span>
            {cart.length > 0 && (
              <button
                onClick={() => { setCart([]); setSelectedPayment(null); }}
                className="text-slate-500 hover:text-red-400 transition-colors p-1"
                title="Limpar carrinho"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

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
                  <span className="text-slate-400 text-[11px] font-mono whitespace-nowrap pt-0.5">{fmt(item.product.priceSell || 0)} un</span>
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
                    <span className="font-bold text-amber-500 text-sm">{fmt((item.product.priceSell || 0) * item.quantity)}</span>
                    <button onClick={() => removeFromCart(item.product.id)} className="text-slate-500 hover:text-red-400 transition-colors p-1" title="Remover Item">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t border-slate-800 bg-slate-950 space-y-4 shrink-0">
          {/* Campo de cliente */}
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
            <input
              type="text"
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              onFocus={e => { if (e.target.value === 'Consumidor Final') e.target.select(); }}
              placeholder="Consumidor Final"
              className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm text-slate-400">
              <span>Subtotal ({totalItems} itens)</span>
              <span>{fmt(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm text-slate-400">
              <span className="flex items-center gap-1 cursor-pointer hover:text-white transition-colors">
                <Plus className="w-3 h-3" /> Desconto
              </span>
              <span className="text-emerald-400 font-mono">- R$ 0,00</span>
            </div>
            <div className="flex justify-between items-end pt-3 border-t border-slate-800/80 mt-1">
              <span className="text-sm text-slate-300 font-bold uppercase tracking-wider mb-1">Total a Receber</span>
              <span className="text-4xl font-black text-emerald-400 tracking-tight">{fmt(subtotal)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <button
              disabled={cart.length === 0}
              onClick={() => setSelectedPayment('cash')}
              className={`flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl border transition-all font-medium text-xs group disabled:opacity-40 disabled:cursor-not-allowed ${
                selectedPayment === 'cash'
                  ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:border-emerald-500/50'
              }`}
            >
              <Banknote className={`w-6 h-6 transition-transform group-hover:scale-110 ${selectedPayment === 'cash' ? 'text-emerald-400' : 'text-emerald-500'}`} />
              Dinheiro
            </button>
            <button
              disabled={cart.length === 0}
              onClick={() => setSelectedPayment('card')}
              className={`flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl border transition-all font-medium text-xs group disabled:opacity-40 disabled:cursor-not-allowed ${
                selectedPayment === 'card'
                  ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:border-blue-500/50'
              }`}
            >
              <CreditCard className={`w-6 h-6 transition-transform group-hover:scale-110 ${selectedPayment === 'card' ? 'text-blue-400' : 'text-blue-400'}`} />
              Cartão / PIX
            </button>
          </div>

          <button
            disabled={!canFinalize}
            onClick={handleFinalize}
            className="w-full bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none hover:bg-emerald-500 text-white font-bold py-4 rounded-xl shadow-[0_0_15px_rgba(5,150,105,0.3)] transition-all text-sm uppercase tracking-widest mt-1"
          >
            Finalizar Venda
          </button>
        </div>
      </div>
      </div>
    </div>
  );
};
export default POS;
