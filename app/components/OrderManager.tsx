import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  PurchaseOrder, PurchaseOrderStatus, CartItem, Supplier, SupplierCatalog, UserProfile
} from '../types';
import {
  Plus, Trash2, ChevronDown, ChevronUp, ChevronRight,
  CheckCircle, XCircle, Truck, Package, ClipboardList,
  MessageCircle, Clock, Calendar, AlertTriangle, Check,
  Send, RotateCcw, Archive, Eye, Edit3, X, Save,
  ShoppingCart, MapPin, Phone, Search
} from 'lucide-react';

interface OrderManagerProps {
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  setPurchaseOrders: React.Dispatch<React.SetStateAction<PurchaseOrder[]>>;
  cart: CartItem[];
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
  supplierCatalogs?: Record<string, SupplierCatalog>;
  userProfile?: UserProfile;
  getNextSeqNumber?: () => number;
}

// ── helpers ────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  draft: 'Rascunho',
  sent: 'Enviado',
  confirmed: 'Confirmado',
  in_transit: 'Em Trânsito',
  awaiting: 'Aguardando Retirada',
  received: 'Recebido',
  received_unchecked: 'Recebido (conferir)',
  entered_system: 'Lançado no Sistema',
  fully_checked: 'Concluído ✓',
  cancelled: 'Cancelado',
};

const STATUS_COLOR: Record<PurchaseOrderStatus, string> = {
  draft: 'text-slate-400 bg-slate-800 border-slate-700',
  sent: 'text-blue-400 bg-blue-950/40 border-blue-900/50',
  confirmed: 'text-emerald-400 bg-emerald-950/40 border-emerald-900/50',
  in_transit: 'text-amber-400 bg-amber-950/40 border-amber-900/50',
  awaiting: 'text-purple-400 bg-purple-950/40 border-purple-900/50',
  received: 'text-teal-400 bg-teal-950/40 border-teal-900/50',
  received_unchecked: 'text-yellow-400 bg-yellow-950/40 border-yellow-900/50',
  entered_system: 'text-indigo-400 bg-indigo-950/40 border-indigo-900/50',
  fully_checked: 'text-green-400 bg-green-950/40 border-green-900/50',
  cancelled: 'text-red-400 bg-red-950/40 border-red-900/50',
};

// Transições permitidas por status
const NEXT_ACTIONS: Record<PurchaseOrderStatus, { to: PurchaseOrderStatus; label: string; icon: React.ReactNode }[]> = {
  draft: [
    { to: 'sent', label: 'Marcar como Enviado', icon: <Send className="w-3.5 h-3.5"/> },
  ],
  sent: [
    { to: 'confirmed', label: 'Confirmado pelo fornecedor', icon: <CheckCircle className="w-3.5 h-3.5"/> },
    { to: 'in_transit', label: 'Saiu para entrega', icon: <Truck className="w-3.5 h-3.5"/> },
    { to: 'awaiting', label: 'Pronto para retirada', icon: <Package className="w-3.5 h-3.5"/> },
  ],
  confirmed: [
    { to: 'in_transit', label: 'Saiu para entrega', icon: <Truck className="w-3.5 h-3.5"/> },
    { to: 'awaiting', label: 'Pronto para retirada', icon: <Package className="w-3.5 h-3.5"/> },
  ],
  in_transit: [
    { to: 'received', label: 'Entregue e conferido', icon: <CheckCircle className="w-3.5 h-3.5"/> },
    { to: 'received_unchecked', label: 'Entregue (conferir depois)', icon: <Clock className="w-3.5 h-3.5"/> },
  ],
  awaiting: [
    { to: 'received', label: 'Retirado e conferido', icon: <CheckCircle className="w-3.5 h-3.5"/> },
    { to: 'received_unchecked', label: 'Retirado (conferir depois)', icon: <Clock className="w-3.5 h-3.5"/> },
  ],
  received: [
    { to: 'entered_system', label: 'Lançado no sistema', icon: <Archive className="w-3.5 h-3.5"/> },
  ],
  received_unchecked: [
    { to: 'received', label: 'Conferência concluída', icon: <Check className="w-3.5 h-3.5"/> },
    { to: 'entered_system', label: 'Lançar no sistema', icon: <Archive className="w-3.5 h-3.5"/> },
  ],
  entered_system: [
    { to: 'fully_checked', label: 'Marcar como Concluído', icon: <CheckCircle className="w-3.5 h-3.5"/> },
  ],
  fully_checked: [],
  cancelled: [],
};

const OPEN_STATUSES: PurchaseOrderStatus[] = ['draft','sent','confirmed','in_transit','awaiting','received','received_unchecked','entered_system'];
const CLOSED_STATUSES: PurchaseOrderStatus[] = ['fully_checked'];

function fmtCurrency(v: number) { return `R$ ${v.toFixed(2).replace('.', ',')}`; }
function fmtDate(ts?: number) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
function fmtDatetime(ts?: number) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function getWeekLabel(ts: number) {
  const d = new Date(ts);
  const day = d.getDay();
  const mon = new Date(d); mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return `Semana de ${mon.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} – ${sun.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
}

// ── componente principal ───────────────────────────────────────────────────

const OrderManager: React.FC<OrderManagerProps> = ({
  suppliers, purchaseOrders, setPurchaseOrders, cart, setCart,
  supplierCatalogs = {}, userProfile, getNextSeqNumber,
}) => {
  const [viewMode, setViewMode] = useState<'technical' | 'objective'>('technical');
  const [sortBy, setSortBy] = useState<'date' | 'supplier' | 'value'>('date');
  const [collapsedWeeks, setCollapsedWeeks] = useState<Set<string>>(new Set());
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelNote, setCancelNote] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newOrderSupplierId, setNewOrderSupplierId] = useState('');
  const [newOrderType, setNewOrderType] = useState<'delivery' | 'pickup'>('delivery');
  const [newOrderExpectedDate, setNewOrderExpectedDate] = useState('');
  const [newOrderExpectedTime, setNewOrderExpectedTime] = useState('');
  const [editingExpected, setEditingExpected] = useState(false);
  const [tempExpectedDate, setTempExpectedDate] = useState('');
  const [tempExpectedTime, setTempExpectedTime] = useState('');

  // Estado do modal de pedido manual
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualSupplierId, setManualSupplierId] = useState('');
  const [manualSearch, setManualSearch] = useState('');
  const [manualQtys, setManualQtys] = useState<Record<string, number>>({});
  const [manualSupplierSearch, setManualSupplierSearch] = useState('');
  const [manualSupplierOpen, setManualSupplierOpen] = useState(false);
  const manualSupplierRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (manualSupplierRef.current && !manualSupplierRef.current.contains(e.target as Node)) {
        setManualSupplierOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Transição de status
  const transition = (orderId: string, to: PurchaseOrderStatus, extra?: Partial<PurchaseOrder>) => {
    const now = Date.now();
    setPurchaseOrders(prev => prev.map(o => {
      if (o.id !== orderId) return o;
      return {
        ...o,
        status: to,
        updatedAt: now,
        transitions: [...(o.transitions || []), { from: o.status, to, timestamp: now, note: extra?.cancelNote }],
        ...extra,
      };
    }));
    if (selectedOrder?.id === orderId) setSelectedOrder(prev => prev ? { ...prev, status: to, ...extra } : null);
  };

  const handleCancel = (orderId: string) => {
    if (!cancelReason) return;
    transition(orderId, 'cancelled', { cancelReason, cancelNote });
    setShowCancelModal(false);
    setCancelReason('');
    setCancelNote('');
  };

  // Criar pedido a partir do carrinho
  const createFromCart = () => {
    if (!newOrderSupplierId || cart.length === 0) return;
    const supplier = suppliers.find(s => s.id === newOrderSupplierId);
    const items = cart.filter(i => i.supplierId === newOrderSupplierId);
    if (items.length === 0) return;
    const now = Date.now();
    const newOrder: PurchaseOrder = {
      id: crypto.randomUUID(),
      supplierId: newOrderSupplierId,
      supplierName: supplier?.name || newOrderSupplierId,
      items,
      totalValue: items.reduce((s, i) => s + i.packPrice * i.quantityToBuy, 0),
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      deliveryOrPickup: newOrderType,
      expectedDate: newOrderExpectedDate ? new Date(newOrderExpectedDate).getTime() : undefined,
      expectedTime: newOrderExpectedTime || undefined,
      transitions: [],
    };
    setPurchaseOrders(prev => [newOrder, ...prev]);
    setCart(prev => prev.filter(i => i.supplierId !== newOrderSupplierId));
    setShowCreateModal(false);
    setNewOrderSupplierId('');
    setNewOrderExpectedDate('');
    setNewOrderExpectedTime('');
  };

  // WhatsApp
  const buildWhatsAppMessage = (order: PurchaseOrder) => {
    const supplier = suppliers.find(s => s.id === order.supplierId);
    const template = supplier?.orderTemplate;
    const itemsText = order.items.map(i => `• ${i.productName} × ${i.quantityToBuy} = ${fmtCurrency(i.packPrice * i.quantityToBuy)}`).join('\n');
    const total = fmtCurrency(order.totalValue);
    const date = fmtDate(order.createdAt);
    const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const tipo = order.deliveryOrPickup === 'pickup' ? 'RETIRADA' : 'ENTREGA';
    const previsao = order.expectedDate ? fmtDate(order.expectedDate) + (order.expectedTime ? ` às ${order.expectedTime}` : '') : 'a confirmar';

    if (template) {
      return template
        .replace('[DATA]', date).replace('[HORA]', time)
        .replace('[ITENS]', itemsText).replace('[TOTAL]', total)
        .replace('[TIPO]', tipo).replace('[PREVISAO]', previsao);
    }
    return `Olá! Segue pedido ${date} ${time}:\n\n${itemsText}\n\nTotal: ${total}\n${tipo}: ${previsao}`;
  };

  const openWhatsApp = (order: PurchaseOrder) => {
    const supplier = suppliers.find(s => s.id === order.supplierId);
    const phone = supplier?.whatsapp;
    const msg = encodeURIComponent(buildWhatsAppMessage(order));
    if (phone) {
      window.open(`https://wa.me/55${phone}?text=${msg}`, '_blank');
    } else {
      window.open(`https://wa.me/?text=${msg}`, '_blank');
    }
  };

  // Agrupamento por semana (modo técnico)
  const openOrders = useMemo(() => purchaseOrders.filter(o => OPEN_STATUSES.includes(o.status)), [purchaseOrders]);
  const closedOrders = useMemo(() => purchaseOrders.filter(o => CLOSED_STATUSES.includes(o.status)), [purchaseOrders]);
  const cancelledOrders = useMemo(() => purchaseOrders.filter(o => o.status === 'cancelled'), [purchaseOrders]);

  const weekGroups = useMemo(() => {
    const map: Record<string, PurchaseOrder[]> = {};
    openOrders.forEach(o => {
      const k = getWeekLabel(o.createdAt);
      if (!map[k]) map[k] = [];
      map[k].push(o);
    });
    return Object.entries(map).sort((a, b) => {
      const ta = a[1][0]?.createdAt || 0;
      const tb = b[1][0]?.createdAt || 0;
      return tb - ta;
    });
  }, [openOrders]);

  const sortedOrders = useMemo(() => {
    const all = purchaseOrders.filter(o => o.status !== 'cancelled');
    return [...all].sort((a, b) => {
      if (sortBy === 'supplier') return a.supplierName.localeCompare(b.supplierName);
      if (sortBy === 'value') return b.totalValue - a.totalValue;
      return b.createdAt - a.createdAt;
    });
  }, [purchaseOrders, sortBy]);

  const cartSupplierIds = useMemo(() => [...new Set(cart.map(i => i.supplierId))], [cart]);

  const manualFilteredProducts = useMemo(() => {
    const catalog = supplierCatalogs[manualSupplierId];
    if (!catalog) return [];
    const q = manualSearch.toLowerCase();
    return catalog.products.filter(p => p.name.toLowerCase().includes(q));
  }, [supplierCatalogs, manualSupplierId, manualSearch]);

  const createManualOrder = () => {
    const supplier = suppliers.find(s => s.id === manualSupplierId);
    const catalog = supplierCatalogs[manualSupplierId];
    if (!supplier || !catalog) return;

    const items: CartItem[] = (Object.entries(manualQtys) as [string, number][])
      .filter(([, qty]) => qty > 0)
      .map(([productId, qty]) => {
        const p = catalog.products.find(pr => pr.id === productId)!;
        return {
          id: `${manualSupplierId}-${p.name}-${p.packQuantity}`,
          sku: p.supplierSku || p.name.substring(0, 10),
          productName: p.name,
          supplierId: manualSupplierId,
          supplierName: supplier.name,
          packQuantity: p.packQuantity || 1,
          packPrice: p.lastPackPrice,
          quantityToBuy: qty,
          totalCost: p.lastPackPrice * qty,
        };
      });

    if (items.length === 0) return;

    const now = Date.now();
    const newOrder: PurchaseOrder = {
      id: crypto.randomUUID(),
      seqNumber: getNextSeqNumber?.(),
      supplierId: manualSupplierId,
      supplierName: supplier.name,
      items,
      totalValue: items.reduce((s, i) => s + i.packPrice * i.quantityToBuy, 0),
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      deliveryOrPickup: 'delivery',
      transitions: [],
    };
    setPurchaseOrders(prev => [newOrder, ...prev]);
    setShowManualModal(false);
    setManualSupplierId('');
    setManualSearch('');
    setManualQtys({});
  };

  // ── render helpers ───────────────────────────────────────────────────────

  const renderStatusBadge = (status: PurchaseOrderStatus) => (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLOR[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );

  const renderOrderCard = (order: PurchaseOrder) => {
    const isSelected = selectedOrder?.id === order.id;
    const supplier = suppliers.find(s => s.id === order.supplierId);
    const actions = NEXT_ACTIONS[order.status];
    return (
      <div
        key={order.id}
        onClick={() => setSelectedOrder(isSelected ? null : order)}
        className={`border rounded-xl p-3 cursor-pointer transition-all ${isSelected ? 'border-amber-600/60 bg-amber-950/10' : 'border-slate-700/50 bg-slate-900 hover:border-slate-600'}`}
      >
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-white text-sm">{order.supplierName}</span>
              {renderStatusBadge(order.status)}
              <span className="text-[10px] text-slate-500">{order.deliveryOrPickup === 'pickup' ? '🏪 Retirada' : '🚚 Entrega'}</span>
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
              <span>Criado: {fmtDatetime(order.createdAt)}</span>
              {order.expectedDate && <span className="text-amber-400/80">Previsão: {fmtDate(order.expectedDate)}{order.expectedTime ? ` às ${order.expectedTime}` : ''}</span>}
              <span className="font-semibold text-slate-300">{fmtCurrency(order.totalValue)}</span>
              <span className="text-slate-600">{order.items.length} itens</span>
            </div>
          </div>
          <ChevronRight className={`w-4 h-4 text-slate-600 transition-transform shrink-0 mt-1 ${isSelected ? 'rotate-90' : ''}`} />
        </div>

        {/* Expandido */}
        {isSelected && (
          <div className="mt-3 space-y-3" onClick={e => e.stopPropagation()}>
            {/* Itens */}
            <div className="bg-slate-950/50 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="text-left p-2 text-slate-500 font-medium">Produto</th>
                    <th className="text-center p-2 text-slate-500 font-medium w-12">Qtd</th>
                    <th className="text-right p-2 text-slate-500 font-medium w-20">Unit.</th>
                    <th className="text-right p-2 text-slate-500 font-medium w-20">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item, i) => (
                    <tr key={i} className="border-b border-slate-800/50 last:border-0">
                      <td className="p-2 text-slate-300">{item.productName}</td>
                      <td className="p-2 text-center text-white font-bold">{item.quantityToBuy}</td>
                      <td className="p-2 text-right text-slate-400">{fmtCurrency(item.packPrice)}</td>
                      <td className="p-2 text-right text-amber-400 font-semibold">{fmtCurrency(item.packPrice * item.quantityToBuy)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-700">
                    <td colSpan={3} className="p-2 text-right text-slate-400 font-medium">Total</td>
                    <td className="p-2 text-right text-white font-bold">{fmtCurrency(order.totalValue)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Previsão editável */}
            <div className="flex items-center gap-2 text-xs">
              <Calendar className="w-3.5 h-3.5 text-slate-500"/>
              {editingExpected && isSelected ? (
                <div className="flex items-center gap-2">
                  <input type="date" value={tempExpectedDate} onChange={e => setTempExpectedDate(e.target.value)}
                    className="bg-slate-800 border border-amber-500 rounded px-2 py-0.5 text-white focus:outline-none text-xs"/>
                  <input type="time" value={tempExpectedTime} onChange={e => setTempExpectedTime(e.target.value)}
                    className="bg-slate-800 border border-amber-500 rounded px-2 py-0.5 text-white focus:outline-none text-xs w-24"/>
                  <button onClick={() => {
                    setPurchaseOrders(prev => prev.map(o => o.id === order.id ? {
                      ...o,
                      expectedDate: tempExpectedDate ? new Date(tempExpectedDate).getTime() : undefined,
                      expectedTime: tempExpectedTime || undefined,
                      updatedAt: Date.now(),
                    } : o));
                    setEditingExpected(false);
                  }} className="text-green-400 p-0.5"><Check className="w-3.5 h-3.5"/></button>
                  <button onClick={() => setEditingExpected(false)} className="text-red-400 p-0.5"><X className="w-3.5 h-3.5"/></button>
                </div>
              ) : (
                <button className="text-slate-400 hover:text-amber-400 flex items-center gap-1 group/ed" onClick={() => {
                  setTempExpectedDate(order.expectedDate ? new Date(order.expectedDate).toISOString().split('T')[0] : '');
                  setTempExpectedTime(order.expectedTime || '');
                  setEditingExpected(true);
                }}>
                  <span>{order.expectedDate ? `Previsão: ${fmtDate(order.expectedDate)}${order.expectedTime ? ` às ${order.expectedTime}` : ''}` : 'Definir previsão...'}</span>
                  <Edit3 className="w-3 h-3 opacity-0 group-hover/ed:opacity-100 transition-opacity"/>
                </button>
              )}
            </div>

            {/* Histórico de transições */}
            {order.transitions?.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] text-slate-600 uppercase font-bold">Histórico</p>
                {order.transitions.map((t, i) => (
                  <div key={i} className="flex items-center gap-2 text-[11px] text-slate-500">
                    <span className="w-32 shrink-0">{new Date(t.timestamp).toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</span>
                    <span className={STATUS_COLOR[t.from].split(' ')[0]}>{STATUS_LABEL[t.from]}</span>
                    <ChevronRight className="w-3 h-3 text-slate-700 shrink-0"/>
                    <span className={STATUS_COLOR[t.to].split(' ')[0]}>{STATUS_LABEL[t.to]}</span>
                    {t.note && <span className="text-slate-600 italic truncate">— {t.note}</span>}
                  </div>
                ))}
              </div>
            )}

            {/* Ações */}
            <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-slate-800">
              {/* WhatsApp */}
              {(supplier?.whatsapp || order.status === 'draft') && (
                <button onClick={() => openWhatsApp(order)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-900/30 border border-green-900/50 text-green-400 text-xs hover:bg-green-900/50 transition-colors">
                  <MessageCircle className="w-3.5 h-3.5"/>
                  {supplier?.whatsapp ? 'Enviar WhatsApp' : 'Copiar mensagem'}
                </button>
              )}
              {/* Endereço */}
              {supplier?.address && (
                <button onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(supplier.address!)}`, '_blank')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-900/30 border border-blue-900/50 text-blue-400 text-xs hover:bg-blue-900/50 transition-colors">
                  <MapPin className="w-3.5 h-3.5"/> Maps
                </button>
              )}
              {/* Próximas transições */}
              {actions.map(action => (
                <button key={action.to} onClick={() => transition(order.id, action.to)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-xs hover:border-amber-600 hover:text-white transition-colors">
                  {action.icon} {action.label}
                </button>
              ))}
              {/* Cancelar */}
              {!['fully_checked','cancelled'].includes(order.status) && (
                <button onClick={() => { setSelectedOrder(order); setShowCancelModal(true); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-950/30 border border-red-900/50 text-red-400 text-xs hover:bg-red-950/60 transition-colors ml-auto">
                  <XCircle className="w-3.5 h-3.5"/> Cancelar pedido
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── render principal ─────────────────────────────────────────────────────

  return (
    <div className="h-full overflow-y-auto space-y-5">

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-amber-400"/>
          <h2 className="text-white font-bold text-lg">Pedidos de Compra</h2>
          {openOrders.length > 0 && (
            <span className="bg-amber-600 text-white text-xs px-2 py-0.5 rounded-full font-bold">{openOrders.length} em aberto</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Modo */}
          <div className="flex items-center bg-slate-800/60 border border-slate-700 rounded-lg p-0.5">
            <button onClick={() => setViewMode('technical')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === 'technical' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}>
              🗂 Técnico
            </button>
            <button onClick={() => setViewMode('objective')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === 'objective' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}>
              📋 Objetivo
            </button>
          </div>
          {viewMode === 'objective' && (
            <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none">
              <option value="date">Mais recente</option>
              <option value="supplier">Fornecedor</option>
              <option value="value">Maior valor</option>
            </select>
          )}
          {/* Novo pedido manual */}
          <button onClick={() => setShowManualModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold transition-colors border border-slate-600">
            <Plus className="w-3.5 h-3.5"/>
            Novo Pedido
          </button>
          {/* Criar pedido do carrinho */}
          {cartSupplierIds.length > 0 && (
            <button onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition-colors">
              <ShoppingCart className="w-3.5 h-3.5"/>
              Carrinho ({cart.length})
            </button>
          )}
        </div>
      </div>

      {/* MODO TÉCNICO — agrupado por semana */}
      {viewMode === 'technical' && (
        <div className="space-y-3">
          {/* Em Aberto — por semana */}
          {weekGroups.length === 0 && (
            <div className="text-center py-12 text-slate-600">
              <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30"/>
              <p className="text-sm">Nenhum pedido em aberto.</p>
              {cartSupplierIds.length > 0 && <p className="text-xs mt-1 text-amber-600/70">Você tem {cart.length} itens no carrinho — crie um pedido!</p>}
            </div>
          )}
          {weekGroups.map(([week, orders]) => {
            const isCollapsed = collapsedWeeks.has(week);
            return (
              <div key={week} className="border border-slate-800 rounded-xl overflow-hidden">
                <button
                  onClick={() => setCollapsedWeeks(prev => { const n = new Set(prev); n.has(week) ? n.delete(week) : n.add(week); return n; })}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-800/60 hover:bg-slate-800 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-slate-500"/>
                    <span className="text-sm font-semibold text-slate-300">{week}</span>
                    <span className="text-xs text-slate-500">({orders.length} pedido{orders.length > 1 ? 's' : ''})</span>
                    <span className="text-xs text-amber-400/70">{fmtCurrency(orders.reduce((s,o) => s + o.totalValue, 0))}</span>
                  </div>
                  {isCollapsed ? <ChevronDown className="w-4 h-4 text-slate-500"/> : <ChevronUp className="w-4 h-4 text-slate-500"/>}
                </button>
                {!isCollapsed && (
                  <div className="p-3 space-y-2">
                    {orders.map(renderOrderCard)}
                  </div>
                )}
              </div>
            );
          })}

          {/* Concluídos */}
          {closedOrders.length > 0 && (
            <div className="border border-slate-800 rounded-xl overflow-hidden">
              <button
                onClick={() => setCollapsedSections(p => ({ ...p, closed: !p.closed }))}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-800/40 hover:bg-slate-800/60 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-green-500"/>
                  <span className="text-sm font-semibold text-slate-400">Concluídos</span>
                  <span className="text-xs text-slate-600">({closedOrders.length})</span>
                </div>
                {collapsedSections.closed ? <ChevronDown className="w-4 h-4 text-slate-600"/> : <ChevronUp className="w-4 h-4 text-slate-600"/>}
              </button>
              {!collapsedSections.closed && (
                <div className="p-3 space-y-2">{closedOrders.map(renderOrderCard)}</div>
              )}
            </div>
          )}

          {/* Cancelados */}
          {cancelledOrders.length > 0 && (
            <div className="border border-red-900/20 rounded-xl overflow-hidden">
              <button
                onClick={() => setCollapsedSections(p => ({ ...p, cancelled: !p.cancelled }))}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-red-950/10 hover:bg-red-950/20 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <XCircle className="w-3.5 h-3.5 text-red-500"/>
                  <span className="text-sm font-semibold text-slate-500">Cancelados</span>
                  <span className="text-xs text-slate-600">({cancelledOrders.length})</span>
                </div>
                {collapsedSections.cancelled ? <ChevronDown className="w-4 h-4 text-slate-600"/> : <ChevronUp className="w-4 h-4 text-slate-600"/>}
              </button>
              {!collapsedSections.cancelled && (
                <div className="p-3 space-y-2">{cancelledOrders.map(renderOrderCard)}</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* MODO OBJETIVO — lista flat */}
      {viewMode === 'objective' && (
        <div className="space-y-2">
          {sortedOrders.length === 0 ? (
            <div className="text-center py-12 text-slate-600">
              <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30"/>
              <p className="text-sm">Nenhum pedido ainda.</p>
            </div>
          ) : sortedOrders.map(renderOrderCard)}
        </div>
      )}

      {/* ── MODAL: Criar pedido ── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-white flex items-center gap-2"><ShoppingCart className="w-4 h-4 text-amber-400"/> Criar Pedido de Compra</h3>
              <button onClick={() => setShowCreateModal(false)}><X className="w-5 h-5 text-slate-500 hover:text-white"/></button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Fornecedor</label>
                <select value={newOrderSupplierId} onChange={e => setNewOrderSupplierId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500">
                  <option value="">Selecionar...</option>
                  {cartSupplierIds.map(id => {
                    const s = suppliers.find(s => s.id === id);
                    const count = cart.filter(i => i.supplierId === id).length;
                    return <option key={id} value={id}>{s?.name || id} ({count} itens)</option>;
                  })}
                </select>
              </div>
              {newOrderSupplierId && (
                <div className="bg-slate-800/50 rounded-lg p-3 text-xs space-y-1">
                  {cart.filter(i => i.supplierId === newOrderSupplierId).map((item, i) => (
                    <div key={i} className="flex justify-between text-slate-400">
                      <span>{item.productName} × {item.quantityToBuy}</span>
                      <span>{fmtCurrency(item.packPrice * item.quantityToBuy)}</span>
                    </div>
                  ))}
                  <div className="border-t border-slate-700 pt-1 flex justify-between font-semibold text-white">
                    <span>Total</span>
                    <span>{fmtCurrency(cart.filter(i => i.supplierId === newOrderSupplierId).reduce((s,i) => s + i.packPrice * i.quantityToBuy, 0))}</span>
                  </div>
                </div>
              )}
              <div>
                <label className="text-xs text-slate-400 block mb-1">Tipo</label>
                <div className="flex gap-2">
                  {(['delivery', 'pickup'] as const).map(t => (
                    <button key={t} onClick={() => setNewOrderType(t)}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all ${newOrderType === t ? 'bg-amber-600 border-amber-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}>
                      {t === 'delivery' ? '🚚 Entrega' : '🏪 Retirada'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Data prevista</label>
                  <input type="date" value={newOrderExpectedDate} onChange={e => setNewOrderExpectedDate(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"/>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Hora prevista</label>
                  <input type="time" value={newOrderExpectedTime} onChange={e => setNewOrderExpectedTime(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"/>
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-slate-800 flex justify-end gap-2">
              <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 rounded-xl text-sm text-slate-400 hover:text-white">Cancelar</button>
              <button onClick={createFromCart} disabled={!newOrderSupplierId}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-semibold flex items-center gap-2">
                <Plus className="w-4 h-4"/> Criar Pedido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Novo Pedido Manual ── */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh]">

            {/* Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-amber-400"/>
                <h3 className="font-bold text-white">Novo Pedido Manual</h3>
                {Object.keys(manualQtys).length > 0 && (
                  <span className="bg-amber-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {Object.keys(manualQtys).length} {Object.keys(manualQtys).length === 1 ? 'item' : 'itens'}
                  </span>
                )}
              </div>
              <button onClick={() => { setShowManualModal(false); setManualSupplierId(''); setManualSearch(''); setManualQtys({}); setManualSupplierSearch(''); setManualSupplierOpen(false); }}>
                <X className="w-5 h-5 text-slate-500 hover:text-white"/>
              </button>
            </div>

            {/* Body: 2 colunas */}
            <div className="flex flex-1 min-h-0">

              {/* Coluna esquerda — Catálogo */}
              <div className="flex flex-col flex-[3] p-4 gap-3 border-r border-slate-800 min-h-0">

                {/* Combobox de fornecedor */}
                <div className="relative shrink-0" ref={manualSupplierRef}>
                  <label className="text-xs text-slate-400 block mb-1">Fornecedor</label>
                  <button
                    type="button"
                    onClick={() => setManualSupplierOpen(o => !o)}
                    className={`w-full flex items-center justify-between px-3 py-2 border rounded-lg text-sm transition-colors ${
                      !manualSupplierId ? 'bg-slate-800/60 border-slate-700 text-slate-400' : 'bg-slate-800 border-amber-600/50 text-white'
                    }`}
                  >
                    <span className="truncate">{manualSupplierId ? suppliers.find(s => s.id === manualSupplierId)?.name : 'Selecionar fornecedor...'}</span>
                    <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${manualSupplierOpen ? 'rotate-180' : ''}`}/>
                  </button>
                  {manualSupplierOpen && (
                    <div className="absolute top-full left-0 z-50 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl overflow-hidden">
                      <div className="p-2 border-b border-slate-700 relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400"/>
                        <input
                          type="text"
                          autoFocus
                          placeholder="Buscar..."
                          value={manualSupplierSearch}
                          onChange={e => setManualSupplierSearch(e.target.value)}
                          className="w-full pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-sm text-white focus:outline-none focus:border-amber-500"
                        />
                      </div>
                      <div className="max-h-40 overflow-y-auto">
                        {suppliers.filter(s => s.name.toLowerCase().includes(manualSupplierSearch.toLowerCase())).length === 0 ? (
                          <div className="p-3 text-xs text-slate-500 text-center">Nenhum encontrado</div>
                        ) : suppliers.filter(s => s.name.toLowerCase().includes(manualSupplierSearch.toLowerCase())).map(s => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => { setManualSupplierId(s.id); setManualSearch(''); setManualQtys({}); setManualSupplierOpen(false); setManualSupplierSearch(''); }}
                            className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center gap-2 ${manualSupplierId === s.id ? 'bg-amber-600 text-white' : 'text-slate-200 hover:bg-slate-700'}`}
                          >
                            {manualSupplierId === s.id && <Check className="w-3.5 h-3.5 shrink-0"/>}
                            {s.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Busca de produto */}
                {manualSupplierId && (
                  <div className="relative shrink-0">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500"/>
                    <input
                      type="text"
                      placeholder="Buscar produto no catálogo..."
                      value={manualSearch}
                      onChange={e => setManualSearch(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500 placeholder-slate-600"
                    />
                  </div>
                )}

                {/* Lista de produtos */}
                <div className="flex-1 overflow-y-auto min-h-0">
                  {!manualSupplierId ? (
                    <div className="flex items-center justify-center h-full text-slate-600 text-xs">Selecione um fornecedor para ver os produtos</div>
                  ) : !supplierCatalogs[manualSupplierId] || supplierCatalogs[manualSupplierId].products.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-slate-600 text-xs">Este fornecedor não tem produtos no catálogo ainda</div>
                  ) : manualFilteredProducts.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-slate-600 text-xs">Nenhum produto encontrado</div>
                  ) : (
                    <div className="space-y-1 pr-1">
                      {manualFilteredProducts.map(p => {
                        const qty = manualQtys[p.id] || 0;
                        const isAdded = qty > 0;
                        return (
                          <div key={p.id}
                            className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg transition-all ${
                              isAdded
                                ? 'bg-amber-950/40 border border-amber-600/50'
                                : 'bg-slate-800/50 border border-transparent hover:border-slate-700'
                            }`}>
                            <div className="flex-1 min-w-0">
                              <p className={`text-xs truncate ${isAdded ? 'text-amber-100' : 'text-slate-200'}`}>{p.name}</p>
                              <p className="text-slate-500 text-[10px]">Cx {p.packQuantity} · {fmtCurrency(p.lastPackPrice)}/cx</p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {isAdded && <Check className="w-3 h-3 text-amber-400"/>}
                              <button
                                onClick={() => setManualQtys(prev => { const n = { ...prev }; if ((n[p.id] || 0) <= 1) delete n[p.id]; else n[p.id]--; return n; })}
                                className={`w-6 h-6 rounded flex items-center justify-center text-sm transition-colors ${isAdded ? 'bg-amber-800/60 hover:bg-amber-700 text-amber-100' : 'bg-slate-700 hover:bg-slate-600 text-slate-400'}`}>−</button>
                              <span className="w-6 text-center text-white text-xs font-semibold">{qty}</span>
                              <button
                                onClick={() => setManualQtys(prev => ({ ...prev, [p.id]: (prev[p.id] || 0) + 1 }))}
                                className="w-6 h-6 rounded bg-slate-700 hover:bg-amber-600 text-slate-300 hover:text-white flex items-center justify-center text-sm transition-colors">+</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Coluna direita — Resumo */}
              <div className="flex flex-col flex-[2] p-4 min-h-0">
                <p className="text-xs text-slate-400 font-semibold mb-3 shrink-0">Resumo do Pedido</p>

                {Object.keys(manualQtys).length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center gap-2">
                    <ShoppingCart className="w-8 h-8 text-slate-700"/>
                    <p className="text-xs text-slate-600">Adicione produtos<br/>ao lado para montar<br/>o pedido</p>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto min-h-0 space-y-1 pr-1 mb-3">
                    {(Object.entries(manualQtys) as [string, number][]).map(([productId, qty]) => {
                      const p = supplierCatalogs[manualSupplierId]?.products.find(pr => pr.id === productId);
                      if (!p) return null;
                      return (
                        <div key={productId} className="flex items-start gap-2 py-1.5 border-b border-slate-800/60 last:border-0">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-slate-300 truncate leading-tight">{p.name}</p>
                            <p className="text-[10px] text-slate-500">× {qty}cx · {fmtCurrency(p.lastPackPrice * qty)}</p>
                          </div>
                          <button
                            onClick={() => setManualQtys(prev => { const n = { ...prev }; delete n[productId]; return n; })}
                            className="shrink-0 w-5 h-5 rounded hover:bg-red-900/40 text-slate-600 hover:text-red-400 flex items-center justify-center transition-colors mt-0.5">
                            <X className="w-3 h-3"/>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Total + Botões */}
                <div className="shrink-0 mt-auto space-y-3">
                  {Object.keys(manualQtys).length > 0 && (
                    <div className="flex justify-between items-center border-t border-slate-700 pt-2">
                      <span className="text-xs text-slate-400">Total</span>
                      <span className="text-sm font-bold text-white">
                        {fmtCurrency((Object.entries(manualQtys) as [string, number][]).reduce((s, [id, qty]) => {
                          const p = supplierCatalogs[manualSupplierId]?.products.find(pr => pr.id === id);
                          return s + (p?.lastPackPrice || 0) * qty;
                        }, 0))}
                      </span>
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    <button onClick={createManualOrder}
                      disabled={!manualSupplierId || Object.keys(manualQtys).length === 0}
                      className="w-full px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors">
                      <Plus className="w-4 h-4"/> Criar Pedido
                    </button>
                    <button onClick={() => { setShowManualModal(false); setManualSupplierId(''); setManualSearch(''); setManualQtys({}); setManualSupplierSearch(''); setManualSupplierOpen(false); }}
                      className="w-full px-4 py-2 rounded-xl text-sm text-slate-500 hover:text-white transition-colors">
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Cancelar pedido ── */}
      {showCancelModal && selectedOrder && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-red-900/40 rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-white flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-400"/> Cancelar Pedido</h3>
              <button onClick={() => setShowCancelModal(false)}><X className="w-5 h-5 text-slate-500 hover:text-white"/></button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-sm text-slate-400">Pedido <strong className="text-white">{selectedOrder.supplierName}</strong> — {fmtCurrency(selectedOrder.totalValue)}</p>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Motivo *</label>
                <select value={cancelReason} onChange={e => setCancelReason(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-red-500">
                  <option value="">Selecionar...</option>
                  <option value="sem_estoque">Sem estoque no fornecedor</option>
                  <option value="preco">Preço fora do esperado</option>
                  <option value="erro">Pedido criado por engano</option>
                  <option value="outro">Outro</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Observação (opcional)</label>
                <textarea value={cancelNote} onChange={e => setCancelNote(e.target.value)} rows={2} placeholder="Detalhes adicionais..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-red-500 resize-none"/>
              </div>
            </div>
            <div className="p-4 border-t border-slate-800 flex justify-end gap-2">
              <button onClick={() => setShowCancelModal(false)} className="px-4 py-2 rounded-xl text-sm text-slate-400 hover:text-white">Voltar</button>
              <button onClick={() => handleCancel(selectedOrder.id)} disabled={!cancelReason}
                className="px-4 py-2 rounded-xl bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-semibold flex items-center gap-2">
                <XCircle className="w-4 h-4"/> Confirmar Cancelamento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderManager;
