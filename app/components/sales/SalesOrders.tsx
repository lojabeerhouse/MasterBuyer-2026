import React from 'react';
import { ClipboardList, Filter } from 'lucide-react';

const SalesOrders: React.FC = () => {
    return (
        <div className="h-full flex flex-col bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl fade-in">
            {/* Header / Tabs / Search */}
            <div className="p-4 border-b border-slate-800 bg-slate-800/30 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-500/20 text-blue-400 rounded-xl flex items-center justify-center border border-blue-500/30">
                        <ClipboardList className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-white leading-tight">Pedidos de Vendas</h2>
                        <p className="text-xs text-slate-400">Gerencie ordens do comércio B2B</p>
                    </div>
                </div>

                <div className="flex items-center gap-2 self-stretch sm:self-auto">
                    <button className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
                        <Filter className="w-4 h-4 text-slate-400" />
                        Filtrar
                    </button>
                    <button className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-blue-900/20 transition-all">
                        + Novo Pedido
                    </button>
                </div>
            </div>

            {/* Content Placeholder */}
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500">
                <div className="w-24 h-24 bg-slate-800/50 rounded-full flex items-center justify-center mb-6 border border-slate-700/50 ring-8 ring-slate-800/10">
                    <ClipboardList className="w-10 h-10 text-slate-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-300 mb-2">Módulo em Desenvolvimento</h3>
                <p className="max-w-md text-sm text-slate-500 leading-relaxed mb-6">
                    Em breve, você poderá criar pedidos de vendas diretas, gerar notas fiscais de saída, aprovar orçamentos e emitir boletos integrados ao financeiro.
                </p>
                <div className="flex gap-2">
                    <span className="w-2 h-2 rounded-full bg-slate-700 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 rounded-full bg-slate-700 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 rounded-full bg-slate-700 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
            </div>
        </div>
    );
};
export default SalesOrders;
