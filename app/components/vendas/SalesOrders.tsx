import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
    ClipboardList, PackageCheck, XCircle, RotateCcw, CheckCircle2,
    Plus, User, Calendar, CreditCard, Hash, Package, ChevronRight,
    Search, Trash2, X,
} from 'lucide-react';
import { SaleOrder, SaleOrderStatus, MasterProduct, SaleOrderItem } from '../../types';

interface SalesOrdersProps {
    saleOrders: SaleOrder[];
    onCommitStock: (orderId: string) => void;
    onCancelOrder: (orderId: string, reason: string) => void;
    masterProducts?: MasterProduct[];
    onFinalizeSale?: (items: SaleOrderItem[], paymentMethod: SaleOrder['paymentMethod'], origin?: SaleOrder['origin']) => SaleOrder;
}

const STATUS_LABELS: Record<SaleOrderStatus, string> = {
    pending: 'Pendente',
    stock_committed: 'Est. Debitado',
    invoiced: 'Faturado',
    cancelled: 'Cancelado',
};

const STATUS_STYLES: Record<SaleOrderStatus, string> = {
    pending: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    stock_committed: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    invoiced: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    cancelled: 'bg-slate-700/50 text-slate-500 border-slate-600/30',
};

const STATUS_DOT: Record<SaleOrderStatus, string> = {
    pending: 'bg-amber-400',
    stock_committed: 'bg-blue-400',
    invoiced: 'bg-emerald-400',
    cancelled: 'bg-slate-500',
};

const PAYMENT_LABELS: Record<SaleOrder['paymentMethod'], string> = {
    cash: 'Dinheiro',
    card: 'Cartão / PIX',
    pix: 'PIX',
    mixed: 'Misto',
};

type FilterStatus = 'all' | SaleOrderStatus;

const fmt = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) +
        ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

const fmtDateFull = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }) +
        ' · ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

interface ManualItem {
    product: MasterProduct;
    qty: number;
    unitPrice: number;
}

const SalesOrders: React.FC<SalesOrdersProps> = ({ saleOrders, onCommitStock, onCancelOrder, masterProducts, onFinalizeSale }) => {
    const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [cancelingId, setCancelingId] = useState<string | null>(null);
    const [cancelReason, setCancelReason] = useState('');
    const [toast, setToast] = useState<{ msg: string; seq?: number } | null>(null);
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Modal de pedido manual
    const [showManual, setShowManual] = useState(false);
    const [manualSearch, setManualSearch] = useState('');
    const [manualItems, setManualItems] = useState<ManualItem[]>([]);
    const [manualPayment, setManualPayment] = useState<SaleOrder['paymentMethod']>('cash');
    const [manualCustomer, setManualCustomer] = useState('Consumidor Final');
    const [manualSearchOpen, setManualSearchOpen] = useState(false);

    const showToast = useCallback((msg: string, seq?: number) => {
        if (toastTimer.current) clearTimeout(toastTimer.current);
        setToast({ msg, seq });
        toastTimer.current = setTimeout(() => setToast(null), 2500);
    }, []);

    const filtered = useMemo(() => {
        const base = statusFilter === 'all'
            ? saleOrders
            : saleOrders.filter(o => o.status === statusFilter);
        return [...base].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }, [saleOrders, statusFilter]);

    const counts: Record<FilterStatus, number> = useMemo(() => ({
        all: saleOrders.length,
        pending: saleOrders.filter(o => o.status === 'pending').length,
        stock_committed: saleOrders.filter(o => o.status === 'stock_committed').length,
        invoiced: saleOrders.filter(o => o.status === 'invoiced').length,
        cancelled: saleOrders.filter(o => o.status === 'cancelled').length,
    }), [saleOrders]);

    const selectedOrder = useMemo(
        () => saleOrders.find(o => o.id === selectedId) ?? null,
        [saleOrders, selectedId]
    );

    const manualSearchResults = useMemo(() => {
        if (!masterProducts || !manualSearch.trim()) return [];
        const tokens = manualSearch.toLowerCase().trim().split(/\s+/).filter(Boolean);
        return masterProducts
            .filter(p => {
                const text = `${p.name} ${p.sku} ${p.ean ?? ''}`.toLowerCase();
                return tokens.every(t => text.includes(t));
            })
            .slice(0, 8);
    }, [masterProducts, manualSearch]);

    const addManualItem = (product: MasterProduct) => {
        setManualItems(prev => {
            const existing = prev.find(i => i.product.id === product.id);
            if (existing) return prev.map(i => i.product.id === product.id ? { ...i, qty: i.qty + 1 } : i);
            return [...prev, { product, qty: 1, unitPrice: product.priceSell || 0 }];
        });
        setManualSearch('');
        setManualSearchOpen(false);
    };

    const manualTotal = manualItems.reduce((s, i) => s + i.qty * i.unitPrice, 0);

    const handleSubmitManual = () => {
        if (!onFinalizeSale || manualItems.length === 0) return;
        const items: SaleOrderItem[] = manualItems.map(i => ({
            productId: i.product.id,
            sku: i.product.sku,
            name: i.product.name,
            unit: i.product.unit || 'un',
            qty: i.qty,
            unitPrice: i.unitPrice,
            total: i.qty * i.unitPrice,
        }));
        const order = onFinalizeSale(items, manualPayment, 'manual', manualCustomer || 'Consumidor Final');
        showToast('Pedido criado', order.seqNumber);
        setSelectedId(order.id);
        setShowManual(false);
        setManualItems([]);
        setManualSearch('');
        setManualCustomer('Consumidor Final');
        setManualPayment('cash');
    };

    const handleCancelConfirm = (orderId: string) => {
        onCancelOrder(orderId, cancelReason.trim() || 'Sem motivo informado');
        setCancelingId(null);
        setCancelReason('');
    };

    const handleCancelAbort = () => {
        setCancelingId(null);
        setCancelReason('');
    };

    const FILTER_TABS: { key: FilterStatus; label: string }[] = [
        { key: 'all', label: 'Todos' },
        { key: 'pending', label: 'Pendentes' },
        { key: 'stock_committed', label: 'Debitados' },
        { key: 'cancelled', label: 'Cancelados' },
    ];

    return (
        <div className="h-full flex bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl fade-in relative">
            {/* Toast */}
            {toast && (
                <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
                    <div className="flex items-center gap-2.5 bg-emerald-950 border border-emerald-700/60 text-emerald-300 text-xs font-semibold px-4 py-2.5 rounded-xl shadow-2xl shadow-emerald-900/40">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>{toast.msg}{toast.seq !== undefined ? ` — Pedido #${toast.seq}` : ''}</span>
                    </div>
                </div>
            )}

            {/* ── Painel esquerdo: lista ── */}
            <div className="w-[340px] shrink-0 flex flex-col border-r border-slate-800">
                {/* Header */}
                <div className="px-4 pt-4 pb-3 border-b border-slate-800 bg-slate-800/30 shrink-0">
                    <div className="flex items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 bg-blue-500/20 text-blue-400 rounded-xl flex items-center justify-center border border-blue-500/30 shrink-0">
                                <ClipboardList className="w-3.5 h-3.5" />
                            </div>
                            <div>
                                <h2 className="text-xs font-bold text-white leading-tight">Pedidos de Vendas</h2>
                                <p className="text-[10px] text-slate-500">{saleOrders.length} pedido{saleOrders.length !== 1 ? 's' : ''}</p>
                            </div>
                        </div>
                        {onFinalizeSale && masterProducts && (
                            <button
                                onClick={() => setShowManual(true)}
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/30 text-amber-400 hover:text-amber-300 text-[11px] font-bold rounded-lg transition-all"
                            >
                                <Plus className="w-3 h-3" /> Novo
                            </button>
                        )}
                    </div>

                    {/* Filtros chips */}
                    <div className="flex gap-1 flex-wrap">
                        {FILTER_TABS.map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setStatusFilter(tab.key)}
                                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all border ${
                                    statusFilter === tab.key
                                        ? 'bg-amber-600 border-amber-500 text-white'
                                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:border-slate-600'
                                }`}
                            >
                                {tab.label}
                                <span className={`text-[9px] font-black px-1 py-0.5 rounded ${statusFilter === tab.key ? 'bg-white/20' : 'bg-slate-700 text-slate-400'}`}>
                                    {counts[tab.key]}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Cabeçalho sticky das colunas */}
                <div className="flex items-center gap-2 px-4 py-2 bg-slate-900 border-b border-slate-800/70 shrink-0">
                    <span className="w-8 text-[9px] font-bold text-slate-600 uppercase tracking-wider">#</span>
                    <span className="flex-1 text-[9px] font-bold text-slate-600 uppercase tracking-wider">Pedido</span>
                    <span className="w-[68px] text-right text-[9px] font-bold text-slate-600 uppercase tracking-wider">Total</span>
                </div>

                {/* Lista scrollável */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {filtered.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-500">
                            <ClipboardList className="w-8 h-8 text-slate-700 mb-2" />
                            <p className="text-xs font-medium text-slate-400">Nenhum pedido</p>
                            <p className="text-[11px] text-slate-600 mt-0.5">
                                {statusFilter === 'all' ? 'As vendas do PDV aparecem aqui.' : 'Tente outro filtro.'}
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-800/50">
                            {filtered.map(order => {
                                const isSelected = selectedId === order.id;
                                return (
                                    <button
                                        key={order.id}
                                        onClick={() => setSelectedId(isSelected ? null : order.id)}
                                        className={`w-full text-left px-4 py-3 flex items-start gap-2.5 transition-colors group ${
                                            isSelected
                                                ? 'bg-amber-600/10 border-l-2 border-amber-500'
                                                : 'hover:bg-slate-800/40 border-l-2 border-transparent'
                                        } ${order.status === 'cancelled' ? 'opacity-50' : ''}`}
                                    >
                                        {/* Dot de status */}
                                        <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${STATUS_DOT[order.status]}`} />

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-1 mb-0.5">
                                                <span className="text-[10px] font-black text-slate-500 tabular-nums">
                                                    #{order.seqNumber ?? '—'}
                                                </span>
                                                <span className="text-[10px] text-slate-600 tabular-nums shrink-0">
                                                    {fmtDate(order.createdAt)}
                                                </span>
                                            </div>
                                            <p className="text-xs text-slate-300 truncate leading-snug">
                                                {order.items.length === 1
                                                    ? order.items[0].name
                                                    : `${order.items.length} produtos`}
                                            </p>
                                            <div className="flex items-center justify-between mt-1">
                                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${STATUS_STYLES[order.status]}`}>
                                                    {STATUS_LABELS[order.status]}
                                                </span>
                                                <span className="text-xs font-bold text-emerald-400 tabular-nums">
                                                    {fmt(order.total)}
                                                </span>
                                            </div>
                                        </div>

                                        <ChevronRight className={`w-3 h-3 shrink-0 mt-2 transition-colors ${isSelected ? 'text-amber-400' : 'text-slate-700 group-hover:text-slate-500'}`} />
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Painel direito: detalhe ── */}
            <div className="flex-1 min-w-0 flex flex-col">
                {!selectedOrder ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-3">
                        <ClipboardList className="w-12 h-12 text-slate-800" />
                        <p className="text-sm font-medium text-slate-500">Selecione um pedido</p>
                        <p className="text-xs text-slate-600">Clique em um pedido da lista para ver os detalhes</p>
                    </div>
                ) : (
                    <div className="flex flex-col h-full overflow-hidden">
                        {/* Header do detalhe */}
                        <div className="px-5 pt-4 pb-3 border-b border-slate-800 bg-slate-800/20 shrink-0">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <div className="flex items-center gap-2.5 mb-1">
                                        <span className="text-lg font-black text-white tabular-nums">
                                            Pedido #{selectedOrder.seqNumber ?? '—'}
                                        </span>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${STATUS_STYLES[selectedOrder.status]}`}>
                                            {STATUS_LABELS[selectedOrder.status]}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-500 flex items-center gap-1.5">
                                        <Calendar className="w-3 h-3" />
                                        {fmtDateFull(selectedOrder.createdAt)}
                                    </p>
                                </div>

                                {/* Ações principais */}
                                <div className="flex items-center gap-2 shrink-0">
                                    {selectedOrder.status === 'pending' && (
                                        <button
                                            onClick={() => {
                                                onCommitStock(selectedOrder.id);
                                                showToast('Estoque comprometido', selectedOrder.seqNumber);
                                            }}
                                            className="flex items-center gap-1.5 bg-blue-600/20 hover:bg-blue-600/35 border border-blue-500/40 text-blue-400 hover:text-blue-300 text-xs font-bold px-3 py-1.5 rounded-lg transition-all"
                                        >
                                            <PackageCheck className="w-3.5 h-3.5" />
                                            Comprometer Estoque
                                        </button>
                                    )}
                                    {(selectedOrder.status === 'pending' || selectedOrder.status === 'stock_committed') && (
                                        cancelingId === selectedOrder.id ? null : (
                                            <button
                                                onClick={() => { setCancelingId(selectedOrder.id); setCancelReason(''); }}
                                                className="flex items-center gap-1.5 text-slate-500 hover:text-red-400 text-xs font-medium px-2 py-1.5 rounded-lg transition-colors hover:bg-red-500/10"
                                            >
                                                <XCircle className="w-3.5 h-3.5" />
                                                Cancelar
                                            </button>
                                        )
                                    )}
                                </div>
                            </div>

                            {/* Cancel inline */}
                            {cancelingId === selectedOrder.id && (
                                <div className="mt-3 bg-red-950/30 border border-red-800/40 rounded-xl p-3 flex flex-col gap-2">
                                    <p className="text-xs font-bold text-red-400">
                                        {selectedOrder.status === 'stock_committed'
                                            ? 'Cancelar irá reverter o estoque debitado.'
                                            : 'Confirmar cancelamento deste pedido?'}
                                    </p>
                                    <input
                                        type="text"
                                        placeholder="Motivo (opcional)"
                                        value={cancelReason}
                                        onChange={e => setCancelReason(e.target.value)}
                                        className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-red-500 transition-colors"
                                        autoFocus
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') handleCancelConfirm(selectedOrder.id);
                                            if (e.key === 'Escape') handleCancelAbort();
                                        }}
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleCancelConfirm(selectedOrder.id)}
                                            className="flex items-center gap-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                                        >
                                            <XCircle className="w-3.5 h-3.5" />
                                            Confirmar Cancelamento
                                        </button>
                                        <button
                                            onClick={handleCancelAbort}
                                            className="flex items-center gap-1.5 text-slate-400 hover:text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors hover:bg-slate-800"
                                        >
                                            <RotateCcw className="w-3 h-3" />
                                            Voltar
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Corpo do detalhe — scrollável */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4">
                            {/* Metadados */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-slate-800/40 border border-slate-800 rounded-xl p-3">
                                    <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1 flex items-center gap-1.5">
                                        <User className="w-3 h-3" /> Cliente
                                    </p>
                                    <p className="text-sm font-semibold text-slate-200">
                                        {(selectedOrder as any).customerName ?? 'Consumidor Final'}
                                    </p>
                                </div>
                                <div className="bg-slate-800/40 border border-slate-800 rounded-xl p-3">
                                    <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1 flex items-center gap-1.5">
                                        <CreditCard className="w-3 h-3" /> Pagamento
                                    </p>
                                    <p className="text-sm font-semibold text-slate-200">
                                        {PAYMENT_LABELS[selectedOrder.paymentMethod]}
                                    </p>
                                </div>
                                <div className="bg-slate-800/40 border border-slate-800 rounded-xl p-3">
                                    <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1 flex items-center gap-1.5">
                                        <Hash className="w-3 h-3" /> Origem
                                    </p>
                                    <p className="text-sm font-semibold text-slate-200 capitalize">{selectedOrder.origin}</p>
                                </div>
                                {selectedOrder.status === 'stock_committed' && (
                                    <div className="bg-blue-950/30 border border-blue-900/40 rounded-xl p-3">
                                        <p className="text-[10px] text-blue-400 font-semibold uppercase tracking-wider mb-1 flex items-center gap-1.5">
                                            <Package className="w-3 h-3" /> Movimentos
                                        </p>
                                        <p className="text-sm font-semibold text-blue-300">
                                            {selectedOrder.stockMovementIds.length} mov. de estoque
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Motivo de cancelamento */}
                            {selectedOrder.status === 'cancelled' && selectedOrder.cancelReason && (
                                <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-3">
                                    <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1">Motivo do cancelamento</p>
                                    <p className="text-xs text-slate-400 italic">{selectedOrder.cancelReason}</p>
                                </div>
                            )}

                            {/* Tabela de itens */}
                            <div>
                                <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-2">
                                    Itens do pedido ({selectedOrder.items.length})
                                </p>
                                <div className="border border-slate-800 rounded-xl overflow-hidden">
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="border-b border-slate-800 bg-slate-800/50">
                                                <th className="text-left py-2 px-3 text-slate-500 font-semibold">Produto</th>
                                                <th className="text-right py-2 px-3 text-slate-500 font-semibold w-14">Qtd</th>
                                                <th className="text-right py-2 px-3 text-slate-500 font-semibold w-20">Unit.</th>
                                                <th className="text-right py-2 px-3 text-slate-500 font-semibold w-22">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/60">
                                            {selectedOrder.items.map(item => (
                                                <tr key={item.productId} className="hover:bg-slate-800/20 transition-colors">
                                                    <td className="py-2 px-3 text-slate-200 truncate max-w-[200px]">{item.name}</td>
                                                    <td className="py-2 px-3 text-right text-slate-400 tabular-nums">{item.qty} {item.unit}</td>
                                                    <td className="py-2 px-3 text-right text-slate-400 tabular-nums">{fmt(item.unitPrice)}</td>
                                                    <td className="py-2 px-3 text-right text-slate-200 font-semibold tabular-nums">{fmt(item.total)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Totais */}
                            <div className="bg-slate-800/30 border border-slate-800 rounded-xl p-3 space-y-1.5">
                                <div className="flex justify-between text-xs text-slate-400">
                                    <span>Subtotal</span>
                                    <span className="tabular-nums">{fmt(selectedOrder.subtotal)}</span>
                                </div>
                                {selectedOrder.discount > 0 && (
                                    <div className="flex justify-between text-xs text-red-400">
                                        <span>Desconto</span>
                                        <span className="tabular-nums">- {fmt(selectedOrder.discount)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between text-sm font-bold text-emerald-400 pt-1.5 border-t border-slate-700">
                                    <span>Total</span>
                                    <span className="tabular-nums">{fmt(selectedOrder.total)}</span>
                                </div>
                            </div>

                            {/* Notas */}
                            {selectedOrder.notes && (
                                <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-3">
                                    <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1">Observações</p>
                                    <p className="text-xs text-slate-400">{selectedOrder.notes}</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Modal — Pedido Manual */}
            {showManual && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm rounded-2xl">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl w-[480px] max-h-[85%] flex flex-col shadow-2xl">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
                            <h3 className="text-sm font-bold text-white">Novo Pedido Manual</h3>
                            <button onClick={() => setShowManual(false)} className="text-slate-500 hover:text-white transition-colors">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
                            {/* Cliente */}
                            <div>
                                <label className="block text-[11px] text-slate-400 mb-1 font-semibold uppercase tracking-wider">Cliente</label>
                                <div className="relative">
                                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                                    <input
                                        type="text"
                                        value={manualCustomer}
                                        onChange={e => setManualCustomer(e.target.value)}
                                        onFocus={e => { if (e.target.value === 'Consumidor Final') e.target.select(); }}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500 transition-colors"
                                    />
                                </div>
                            </div>

                            {/* Busca de produto */}
                            <div>
                                <label className="block text-[11px] text-slate-400 mb-1 font-semibold uppercase tracking-wider">Adicionar Produto</label>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                                    <input
                                        type="text"
                                        value={manualSearch}
                                        onChange={e => { setManualSearch(e.target.value); setManualSearchOpen(true); }}
                                        onFocus={() => setManualSearchOpen(true)}
                                        placeholder="Buscar por nome ou SKU..."
                                        className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
                                    />
                                    {manualSearchOpen && manualSearchResults.length > 0 && (
                                        <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-xl z-10">
                                            {manualSearchResults.map(p => (
                                                <button
                                                    key={p.id}
                                                    onMouseDown={() => addManualItem(p)}
                                                    className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-700 transition-colors text-left"
                                                >
                                                    <div>
                                                        <p className="text-xs text-slate-200 font-medium">{p.name}</p>
                                                        <p className="text-[10px] text-slate-500">{p.sku}</p>
                                                    </div>
                                                    <span className="text-xs font-bold text-amber-400 tabular-nums shrink-0 ml-3">{fmt(p.priceSell || 0)}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Itens */}
                            {manualItems.length > 0 && (
                                <div className="space-y-2">
                                    <label className="block text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Itens ({manualItems.length})</label>
                                    {manualItems.map((item, idx) => (
                                        <div key={item.product.id} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3 flex items-center gap-2">
                                            <p className="flex-1 text-xs text-slate-200 font-medium truncate min-w-0">{item.product.name}</p>
                                            <input
                                                type="number"
                                                value={item.qty}
                                                min={1}
                                                onChange={e => setManualItems(prev => prev.map((i, j) => j === idx ? { ...i, qty: Math.max(1, Number(e.target.value)) } : i))}
                                                className="w-12 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-center text-white focus:outline-none focus:border-amber-500"
                                            />
                                            <span className="text-[10px] text-slate-500">×</span>
                                            <input
                                                type="number"
                                                value={item.unitPrice}
                                                min={0}
                                                step={0.01}
                                                onChange={e => setManualItems(prev => prev.map((i, j) => j === idx ? { ...i, unitPrice: parseFloat(e.target.value) || 0 } : i))}
                                                className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-right text-white focus:outline-none focus:border-amber-500"
                                            />
                                            <span className="text-xs font-bold text-emerald-400 tabular-nums w-16 text-right shrink-0">{fmt(item.qty * item.unitPrice)}</span>
                                            <button onClick={() => setManualItems(prev => prev.filter((_, j) => j !== idx))} className="text-slate-600 hover:text-red-400 transition-colors p-0.5 shrink-0">
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Pagamento */}
                            <div>
                                <label className="block text-[11px] text-slate-400 mb-1 font-semibold uppercase tracking-wider">Pagamento</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {(['cash', 'card', 'pix', 'mixed'] as SaleOrder['paymentMethod'][]).map(m => (
                                        <button
                                            key={m}
                                            onClick={() => setManualPayment(m)}
                                            className={`py-2 rounded-xl text-xs font-semibold border transition-all ${manualPayment === m ? 'bg-amber-600 border-amber-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:border-slate-600'}`}
                                        >
                                            {({ cash: 'Dinheiro', card: 'Cartão/PIX', pix: 'PIX', mixed: 'Misto' } as Record<string, string>)[m]}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="px-5 py-4 border-t border-slate-800 shrink-0 flex items-center justify-between gap-3">
                            <div className="text-sm">
                                <span className="text-slate-500">Total: </span>
                                <span className="font-bold text-emerald-400 tabular-nums">{fmt(manualTotal)}</span>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => setShowManual(false)} className="px-4 py-2 text-xs text-slate-400 hover:text-white transition-colors">Cancelar</button>
                                <button
                                    onClick={handleSubmitManual}
                                    disabled={manualItems.length === 0}
                                    className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition-colors"
                                >
                                    Criar Pedido
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SalesOrders;
