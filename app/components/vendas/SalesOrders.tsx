import React, { useState, useMemo, useCallback, useRef } from 'react';
import { ClipboardList, PackageCheck, XCircle, ChevronDown, ChevronUp, RotateCcw, CheckCircle2 } from 'lucide-react';
import { SaleOrder, SaleOrderStatus } from '../../types';

interface SalesOrdersProps {
    saleOrders: SaleOrder[];
    onCommitStock: (orderId: string) => void;
    onCancelOrder: (orderId: string, reason: string) => void;
}

const STATUS_LABELS: Record<SaleOrderStatus, string> = {
    pending: 'Pendente',
    stock_committed: 'Estoque Debitado',
    invoiced: 'Faturado',
    cancelled: 'Cancelado',
};

const STATUS_STYLES: Record<SaleOrderStatus, string> = {
    pending: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    stock_committed: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    invoiced: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    cancelled: 'bg-slate-700/50 text-slate-500 border-slate-600/30',
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

const SalesOrders: React.FC<SalesOrdersProps> = ({ saleOrders, onCommitStock, onCancelOrder }) => {
    const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
    const [cancelingId, setCancelingId] = useState<string | null>(null);
    const [cancelReason, setCancelReason] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [toast, setToast] = useState<{ msg: string; seq?: number } | null>(null);
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        <div className="h-full flex flex-col bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl fade-in relative">
            {/* Toast de sucesso */}
            {toast && (
                <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
                    <div className="flex items-center gap-2.5 bg-emerald-950 border border-emerald-700/60 text-emerald-300 text-xs font-semibold px-4 py-2.5 rounded-xl shadow-2xl shadow-emerald-900/40 animate-fade-in">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>{toast.msg}{toast.seq !== undefined ? ` — Pedido #${toast.seq}` : ''}</span>
                    </div>
                </div>
            )}
            {/* Header */}
            <div className="px-4 pt-4 pb-3 border-b border-slate-800 bg-slate-800/30 shrink-0">
                <div className="flex items-center justify-between gap-4 mb-3">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-blue-500/20 text-blue-400 rounded-xl flex items-center justify-center border border-blue-500/30 shrink-0">
                            <ClipboardList className="w-4 h-4" />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-white leading-tight">Pedidos de Vendas</h2>
                            <p className="text-[11px] text-slate-500">{saleOrders.length} pedido{saleOrders.length !== 1 ? 's' : ''} no total</p>
                        </div>
                    </div>
                </div>

                {/* Filtros de status */}
                <div className="flex gap-1.5 flex-wrap">
                    {FILTER_TABS.map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setStatusFilter(tab.key)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                                statusFilter === tab.key
                                    ? 'bg-amber-600 border-amber-500 text-white'
                                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:border-slate-600'
                            }`}
                        >
                            {tab.label}
                            <span className={`text-[10px] font-black px-1 py-0.5 rounded ${
                                statusFilter === tab.key ? 'bg-white/20 text-white' : 'bg-slate-700 text-slate-400'
                            }`}>
                                {counts[tab.key]}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Lista */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {filtered.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-500">
                        <ClipboardList className="w-10 h-10 text-slate-700 mb-3" />
                        <p className="text-sm font-medium text-slate-400">Nenhum pedido encontrado</p>
                        <p className="text-xs text-slate-600 mt-1">
                            {statusFilter === 'all' ? 'As vendas do PDV aparecem aqui.' : 'Tente outro filtro.'}
                        </p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-800/60">
                        {filtered.map(order => {
                            const isCanceling = cancelingId === order.id;
                            const isExpanded = expandedId === order.id;
                            const totalItems = order.items.reduce((s, i) => s + i.qty, 0);

                            return (
                                <div key={order.id} className={`transition-colors ${order.status === 'cancelled' ? 'opacity-60' : ''}`}>
                                    {/* Linha principal */}
                                    <div className="px-4 py-3 flex items-center gap-3 hover:bg-slate-800/30 transition-colors">
                                        {/* Seq */}
                                        <span className="text-xs font-black text-slate-500 w-10 shrink-0 tabular-nums">
                                            #{order.seqNumber ?? '—'}
                                        </span>

                                        {/* Data */}
                                        <span className="text-[11px] text-slate-500 w-[72px] shrink-0 tabular-nums">
                                            {fmtDate(order.createdAt)}
                                        </span>

                                        {/* Resumo itens */}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs text-slate-300 truncate">
                                                {order.items.length === 1
                                                    ? order.items[0].name
                                                    : `${order.items.length} produtos · ${totalItems} un`}
                                            </p>
                                            <p className="text-[10px] text-slate-600 mt-0.5">{PAYMENT_LABELS[order.paymentMethod]}</p>
                                        </div>

                                        {/* Total */}
                                        <span className="text-sm font-bold text-emerald-400 w-24 text-right shrink-0 tabular-nums">
                                            {fmt(order.total)}
                                        </span>

                                        {/* Status badge */}
                                        <span className={`text-[10px] font-bold px-2 py-1 rounded-md border w-[110px] text-center shrink-0 ${STATUS_STYLES[order.status]}`}>
                                            {STATUS_LABELS[order.status]}
                                        </span>

                                        {/* Expandir / itens */}
                                        <button
                                            onClick={() => setExpandedId(isExpanded ? null : order.id)}
                                            className="text-slate-600 hover:text-slate-300 transition-colors p-1 shrink-0"
                                            title="Ver itens"
                                        >
                                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                        </button>
                                    </div>

                                    {/* Itens expandidos */}
                                    {isExpanded && (
                                        <div className="px-4 pb-3 bg-slate-950/30">
                                            <div className="border border-slate-800 rounded-xl overflow-hidden">
                                                <table className="w-full text-xs">
                                                    <thead>
                                                        <tr className="border-b border-slate-800 bg-slate-800/40">
                                                            <th className="text-left py-2 px-3 text-slate-500 font-semibold">Produto</th>
                                                            <th className="text-right py-2 px-3 text-slate-500 font-semibold w-12">Qtd</th>
                                                            <th className="text-right py-2 px-3 text-slate-500 font-semibold w-20">Unit.</th>
                                                            <th className="text-right py-2 px-3 text-slate-500 font-semibold w-20">Total</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-800/50">
                                                        {order.items.map(item => (
                                                            <tr key={item.productId} className="hover:bg-slate-800/20 transition-colors">
                                                                <td className="py-1.5 px-3 text-slate-300 truncate max-w-0" style={{ maxWidth: '200px' }}>{item.name}</td>
                                                                <td className="py-1.5 px-3 text-right text-slate-400 tabular-nums">{item.qty} {item.unit}</td>
                                                                <td className="py-1.5 px-3 text-right text-slate-400 tabular-nums">{fmt(item.unitPrice)}</td>
                                                                <td className="py-1.5 px-3 text-right text-slate-200 font-semibold tabular-nums">{fmt(item.total)}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}

                                    {/* Ações */}
                                    {!isCanceling && (order.status === 'pending' || order.status === 'stock_committed') && (
                                        <div className="px-4 pb-3 flex items-center gap-2">
                                            {order.status === 'pending' && (
                                                <button
                                                    onClick={() => { onCommitStock(order.id); showToast('Estoque comprometido', order.seqNumber); }}
                                                    className="flex items-center gap-1.5 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-400 hover:text-blue-300 text-xs font-bold px-3 py-1.5 rounded-lg transition-all"
                                                >
                                                    <PackageCheck className="w-3.5 h-3.5" />
                                                    Comprometer Estoque
                                                </button>
                                            )}
                                            {order.status === 'stock_committed' && (
                                                <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
                                                    <PackageCheck className="w-3 h-3 text-blue-500" />
                                                    Estoque debitado · {order.stockMovementIds.length} mov.
                                                </div>
                                            )}
                                            <button
                                                onClick={() => { setCancelingId(order.id); setCancelReason(''); }}
                                                className="flex items-center gap-1.5 text-slate-600 hover:text-red-400 text-xs font-medium px-2 py-1.5 rounded-lg transition-colors hover:bg-red-500/10"
                                            >
                                                <XCircle className="w-3.5 h-3.5" />
                                                Cancelar
                                            </button>
                                        </div>
                                    )}

                                    {/* Cancel inline */}
                                    {isCanceling && (
                                        <div className="px-4 pb-3">
                                            <div className="bg-red-950/30 border border-red-800/40 rounded-xl p-3 flex flex-col gap-2">
                                                <p className="text-xs font-bold text-red-400">
                                                    {order.status === 'stock_committed'
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
                                                    onKeyDown={e => { if (e.key === 'Enter') handleCancelConfirm(order.id); if (e.key === 'Escape') handleCancelAbort(); }}
                                                />
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => handleCancelConfirm(order.id)}
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
                                        </div>
                                    )}

                                    {/* Motivo de cancelamento */}
                                    {order.status === 'cancelled' && order.cancelReason && (
                                        <div className="px-4 pb-3">
                                            <p className="text-[11px] text-slate-600 italic">Motivo: {order.cancelReason}</p>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default SalesOrders;
