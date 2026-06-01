import React, { useState, useMemo, Suspense, lazy } from 'react';
import { ShoppingCart, ClipboardList, BarChart3 } from 'lucide-react';
import { MasterProduct, SaleOrder, SaleOrderItem, PdvSession, Contact } from '../../types';

const POS = lazy(() => import('./POS'));
const SalesOrders = lazy(() => import('./SalesOrders'));
const SalesAnalyzer = lazy(() => import('./SalesAnalyzer'));

interface SalesDashboardProps {
    setForecast: any;
    salesData: any;
    setSalesData: any;
    csvContent: string;
    setCsvContent: any;
    salesConfig: any;
    setSalesConfig: any;
    salesUrl: string;
    setSalesUrl: any;
    masterProducts: MasterProduct[];
    onFinalizeSale: (items: SaleOrderItem[], paymentMethod: SaleOrder['paymentMethod'], origin?: SaleOrder['origin'], customerName?: string) => SaleOrder;
    userId: string;
    saleOrders: SaleOrder[];
    onCommitStock: (orderId: string) => void;
    onCancelOrder: (orderId: string, reason: string) => void;
    activeSession?: PdvSession;
    onOpenSession?: (cashierName: string, openingBalance: number) => void;
    onCloseSession?: (sessionId: string) => void;
    contacts?: Contact[];
}

// Helper local — data no fuso local (evita UTC shift após 21h BRT)
const localDateStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const fmt = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const SalesDashboard: React.FC<SalesDashboardProps> = (props) => {
    const [salesTab, setSalesTab] = useState<'pos' | 'orders' | 'reports'>('pos');

    const pendingCount = props.saleOrders.filter(o => o.status === 'pending').length;

    const todayStats = useMemo(() => {
        const today = localDateStr(new Date());
        const todayOrders = props.saleOrders.filter(
            o => o.status !== 'cancelled' && localDateStr(new Date(o.createdAt)) === today
        );
        return {
            total: todayOrders.reduce((s, o) => s + o.total, 0),
            count: todayOrders.length,
        };
    }, [props.saleOrders]);

    const tabBase = 'px-4 py-2.5 flex items-center gap-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all border';
    const tabActive = 'bg-amber-600 border-amber-500 text-white shadow-lg shadow-amber-900/30';
    const tabIdle = 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700 hover:bg-slate-800/70';

    return (
        <div className="flex flex-col h-full fade-in">
            {/* Barra de tabs */}
            <div className="flex gap-2 shrink-0 border-b border-slate-800/50 pb-3 mb-1">
                <button onClick={() => setSalesTab('pos')} className={`${tabBase} ${salesTab === 'pos' ? tabActive : tabIdle}`}>
                    <ShoppingCart className="w-4 h-4" /> Frente de Caixa
                </button>
                <button onClick={() => setSalesTab('orders')} className={`${tabBase} ${salesTab === 'orders' ? tabActive : tabIdle}`}>
                    <ClipboardList className="w-4 h-4" /> Pedidos
                    {pendingCount > 0 && (
                        <span className="bg-amber-500 text-white text-[10px] font-black leading-none px-1.5 py-0.5 rounded-full">
                            {pendingCount}
                        </span>
                    )}
                </button>
                <button onClick={() => setSalesTab('reports')} className={`${tabBase} ${salesTab === 'reports' ? tabActive : tabIdle}`}>
                    <BarChart3 className="w-4 h-4" /> Relatórios
                </button>
            </div>

            {/* Barra de status do dia — visível no PDV quando houver vendas hoje */}
            {salesTab === 'pos' && todayStats.count > 0 && (
                <div className="flex items-center gap-3 px-1 pb-2 shrink-0 text-xs text-slate-500">
                    <span>Hoje:</span>
                    <span className="text-emerald-400 font-bold tabular-nums">{fmt(todayStats.total)}</span>
                    <span>·</span>
                    <span>{todayStats.count} pedido{todayStats.count !== 1 ? 's' : ''}</span>
                    <button
                        onClick={() => setSalesTab('orders')}
                        className="text-amber-500 hover:text-amber-400 font-semibold transition-colors"
                    >
                        Ver pedidos →
                    </button>
                </div>
            )}

            <div className={`flex-1 min-h-0 ${salesTab === 'reports' ? '' : 'overflow-hidden'}`}>
                <Suspense fallback={
                    <div className="flex flex-col items-center justify-center h-full text-slate-500 text-sm gap-3">
                        <div className="w-10 h-10 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
                        Carregando Módulo...
                    </div>
                }>
                    {salesTab === 'pos' && (
                        <POS
                            masterProducts={props.masterProducts}
                            onFinalizeSale={props.onFinalizeSale}
                            activeSession={props.activeSession}
                            onOpenSession={props.onOpenSession}
                            onCloseSession={props.onCloseSession}
                            contacts={props.contacts}
                        />
                    )}
                    {salesTab === 'orders' && (
                        <SalesOrders
                            saleOrders={props.saleOrders}
                            onCommitStock={props.onCommitStock}
                            onCancelOrder={props.onCancelOrder}
                            masterProducts={props.masterProducts}
                            onFinalizeSale={props.onFinalizeSale}
                        />
                    )}
                    {salesTab === 'reports' && (
                        <SalesAnalyzer
                            setForecast={props.setForecast}
                            salesData={props.salesData}
                            setSalesData={props.setSalesData}
                            csvContent={props.csvContent}
                            setCsvContent={props.setCsvContent}
                            salesConfig={props.salesConfig}
                            setSalesConfig={props.setSalesConfig}
                            salesUrl={props.salesUrl}
                            setSalesUrl={props.setSalesUrl}
                            saleOrders={props.saleOrders}
                        />
                    )}
                </Suspense>
            </div>
        </div>
    );
};

export default SalesDashboard;
