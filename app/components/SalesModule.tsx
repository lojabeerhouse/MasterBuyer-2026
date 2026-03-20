import React, { useState, Suspense, lazy } from 'react';
import { ShoppingCart, ClipboardList, BarChart3 } from 'lucide-react';

const POS = lazy(() => import('./POS'));
const SalesOrders = lazy(() => import('./SalesOrders'));
const SalesAnalyzer = lazy(() => import('./SalesAnalyzer'));

interface SalesModuleProps {
    setForecast: any;
    salesData: any;
    setSalesData: any;
    csvContent: string;
    setCsvContent: any;
    salesConfig: any;
    setSalesConfig: any;
    salesUrl: string;
    setSalesUrl: any;
    masterProducts: any; // Using any or MasterProduct[] here
}

const SalesModule: React.FC<SalesModuleProps> = (props) => {
    const [salesTab, setSalesTab] = useState<'pos' | 'orders' | 'reports'>('pos');

    return (
        <div className="flex flex-col h-full gap-3 fade-in">
            <div className="flex gap-2 shrink-0 border-b border-slate-800/50 pb-3 mb-1">
              <button
                onClick={() => setSalesTab('pos')}
                className={`px-4 py-2.5 flex items-center gap-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${
                  salesTab === 'pos' ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/20' : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <ShoppingCart className="w-4 h-4" /> Frente de Caixa (PDV)
              </button>
              <button
                onClick={() => setSalesTab('orders')}
                className={`px-4 py-2.5 flex items-center gap-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${
                  salesTab === 'orders' ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/20' : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <ClipboardList className="w-4 h-4" /> Pedidos de Vendas
              </button>
              <button
                onClick={() => setSalesTab('reports')}
                className={`px-4 py-2.5 flex items-center gap-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${
                  salesTab === 'reports' ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/20' : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <BarChart3 className="w-4 h-4" /> Relatórios
              </button>
            </div>

            <div className={`flex-1 min-h-0 ${salesTab === 'reports' ? '' : 'overflow-hidden'}`}>
                <Suspense fallback={<div className="flex flex-col items-center justify-center h-full text-slate-500 text-sm gap-3">
                    <div className="w-10 h-10 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
                    Carregando Módulo...
                </div>}>
                    {salesTab === 'pos' && <POS masterProducts={props.masterProducts} />}
                    {salesTab === 'orders' && <SalesOrders />}
                    {salesTab === 'reports' && <SalesAnalyzer {...props} />}
                </Suspense>
            </div>
        </div>
    );
};

export default SalesModule;
