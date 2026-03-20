import React from 'react';
import {
  Users, Database, ClipboardList, BarChart3, Scale,
  FileText, CalendarDays, MessageSquare, ShoppingCart,
  Bell, TrendingUp, Package
} from 'lucide-react';
import { Supplier, PurchaseOrder, MasterProduct, AppNotification, UserProfile, CartItem } from '../types';
import { User } from 'firebase/auth';

interface DashboardProps {
  user: User;
  userProfile: UserProfile;
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  masterProducts: MasterProduct[];
  notifications: AppNotification[];
  cart: CartItem[];
  onNavigate: (tab: string) => void;
}

const StatCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  onClick: () => void;
  accent?: string;
}> = ({ icon, label, value, sub, onClick, accent = 'text-amber-400' }) => (
  <button
    onClick={onClick}
    className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-4 hover:border-slate-600 hover:bg-slate-800/60 transition-all text-left w-full"
  >
    <div className={`p-2.5 rounded-lg bg-slate-800 ${accent}`}>{icon}</div>
    <div>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-xs text-slate-400">{label}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  </button>
);

const QuickAction: React.FC<{
  icon: React.ReactNode;
  label: string;
  desc: string;
  onClick: () => void;
  highlight?: boolean;
}> = ({ icon, label, desc, onClick, highlight }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left w-full ${
      highlight
        ? 'bg-amber-600/10 border-amber-600/40 hover:bg-amber-600/20'
        : 'bg-slate-900 border-slate-800 hover:border-slate-600 hover:bg-slate-800/60'
    }`}
  >
    <span className={highlight ? 'text-amber-400' : 'text-slate-400'}>{icon}</span>
    <div>
      <p className={`text-sm font-medium ${highlight ? 'text-amber-300' : 'text-slate-200'}`}>{label}</p>
      <p className="text-xs text-slate-500">{desc}</p>
    </div>
  </button>
);

const Dashboard: React.FC<DashboardProps> = ({
  user, userProfile, suppliers, purchaseOrders, masterProducts, notifications, cart, onNavigate,
}) => {
  const firstName = (userProfile.displayName || user.displayName || user.email || 'Usuário').split(' ')[0];

  const activeOrders = purchaseOrders.filter(o =>
    ['draft', 'sent', 'confirmed', 'in_transit', 'awaiting'].includes(o.status)
  );

  const unreadNotifs = notifications.filter(n => !n.resolved).length;
  const activeSuppliers = suppliers.filter(s => s.batches && s.batches.length > 0);

  // Últimos pedidos
  const recentOrders = [...purchaseOrders]
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 3);

  const statusLabel: Record<string, { label: string; color: string }> = {
    draft: { label: 'Rascunho', color: 'text-slate-400' },
    sent: { label: 'Enviado', color: 'text-blue-400' },
    confirmed: { label: 'Confirmado', color: 'text-amber-400' },
    in_transit: { label: 'Em trânsito', color: 'text-purple-400' },
    awaiting: { label: 'Aguardando', color: 'text-yellow-400' },
    delivered: { label: 'Entregue', color: 'text-green-400' },
    cancelled: { label: 'Cancelado', color: 'text-red-400' },
  };

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto space-y-6 pb-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">{greeting}, {firstName}!</h1>
            <p className="text-slate-400 text-sm mt-0.5">
              {now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
          {user.photoURL && (
            <img src={user.photoURL} alt="avatar" className="w-10 h-10 rounded-full border-2 border-slate-700" />
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            icon={<Users className="w-5 h-5" />}
            label="Fornecedores com cotação"
            value={activeSuppliers.length}
            sub={`${suppliers.length} total`}
            onClick={() => onNavigate('suppliers')}
          />
          <StatCard
            icon={<ClipboardList className="w-5 h-5" />}
            label="Pedidos ativos"
            value={activeOrders.length}
            sub={`${purchaseOrders.length} total`}
            onClick={() => onNavigate('purchase_orders')}
            accent="text-blue-400"
          />
          <StatCard
            icon={<Package className="w-5 h-5" />}
            label="Produtos cadastrados"
            value={masterProducts.length}
            onClick={() => onNavigate('database')}
            accent="text-purple-400"
          />
          <StatCard
            icon={<Bell className="w-5 h-5" />}
            label="Notificações pendentes"
            value={unreadNotifs}
            onClick={() => onNavigate('suppliers')}
            accent={unreadNotifs > 0 ? 'text-red-400' : 'text-slate-500'}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Ações rápidas */}
          <div>
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Ações rápidas</h2>
            <div className="space-y-2">
              <QuickAction
                icon={<MessageSquare className="w-4 h-4" />}
                label="Abrir Cotação"
                desc="Solicitar preços aos fornecedores"
                onClick={() => onNavigate('quote_request')}
                highlight
              />
              <QuickAction
                icon={<Scale className="w-4 h-4" />}
                label="Comparador de Preços"
                desc="Comparar cotações e montar pedido"
                onClick={() => onNavigate('comparator')}
              />
              <QuickAction
                icon={<BarChart3 className="w-4 h-4" />}
                label="Análise de Vendas"
                desc="Forecast e histórico de vendas"
                onClick={() => onNavigate('sales')}
              />
              <QuickAction
                icon={<FileText className="w-4 h-4" />}
                label="Catálogo"
                desc="Visualizar produtos por fornecedor"
                onClick={() => onNavigate('catalog')}
              />
              <QuickAction
                icon={<CalendarDays className="w-4 h-4" />}
                label="Cronograma"
                desc="Agendamentos e entregas"
                onClick={() => onNavigate('schedule')}
              />
            </div>
          </div>

          {/* Pedidos recentes / carrinho */}
          <div>
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Pedidos recentes</h2>
            {recentOrders.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-center">
                <ClipboardList className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                <p className="text-slate-500 text-sm">Nenhum pedido ainda</p>
                <button
                  onClick={() => onNavigate('comparator')}
                  className="mt-3 text-xs text-amber-400 hover:text-amber-300 transition-colors"
                >
                  Ir para o Comparador →
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {recentOrders.map(order => {
                  const st = statusLabel[order.status] ?? { label: order.status, color: 'text-slate-400' };
                  const supplier = suppliers.find(s => s.id === order.supplierId);
                  return (
                    <button
                      key={order.id}
                      onClick={() => onNavigate('purchase_orders')}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center justify-between hover:border-slate-600 hover:bg-slate-800/60 transition-all text-left"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-200">
                          #{order.seqNumber} — {supplier?.name ?? 'Fornecedor'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {order.createdAt ? new Date(order.createdAt).toLocaleDateString('pt-BR') : '—'}
                        </p>
                      </div>
                      <span className={`text-xs font-medium ${st.color}`}>{st.label}</span>
                    </button>
                  );
                })}
                <button
                  onClick={() => onNavigate('purchase_orders')}
                  className="w-full text-xs text-slate-500 hover:text-slate-300 transition-colors pt-1"
                >
                  Ver todos os pedidos →
                </button>
              </div>
            )}

            {/* Carrinho */}
            {cart.length > 0 && (
              <div className="mt-4">
                <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Carrinho</h2>
                <button
                  onClick={() => onNavigate('purchase_orders')}
                  className="w-full bg-amber-600/10 border border-amber-600/30 rounded-xl p-3 flex items-center gap-3 hover:bg-amber-600/20 transition-all"
                >
                  <ShoppingCart className="w-4 h-4 text-amber-400" />
                  <div className="text-left">
                    <p className="text-sm font-medium text-amber-300">{cart.length} {cart.length === 1 ? 'item' : 'itens'} no carrinho</p>
                    <p className="text-xs text-slate-500">Clique para finalizar o pedido</p>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Fornecedores com cotação recente */}
        {activeSuppliers.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Fornecedores com cotação
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {activeSuppliers.slice(0, 8).map(s => {
                const lastBatch = s.batches?.[s.batches.length - 1];
                const daysAgo = lastBatch
                  ? Math.floor((Date.now() - lastBatch.timestamp) / 86400000)
                  : null;
                return (
                  <button
                    key={s.id}
                    onClick={() => onNavigate('suppliers')}
                    className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-left hover:border-slate-600 hover:bg-slate-800/60 transition-all"
                  >
                    <p className="text-sm font-medium text-slate-200 truncate">{s.name}</p>
                    {daysAgo !== null && (
                      <p className={`text-xs mt-0.5 ${daysAgo <= 7 ? 'text-green-400' : daysAgo <= 14 ? 'text-amber-400' : 'text-slate-500'}`}>
                        {daysAgo === 0 ? 'Hoje' : `${daysAgo}d atrás`}
                      </p>
                    )}
                  </button>
                );
              })}
              {activeSuppliers.length > 8 && (
                <button
                  onClick={() => onNavigate('suppliers')}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center hover:border-slate-600 transition-all"
                >
                  <p className="text-sm text-slate-500">+{activeSuppliers.length - 8} mais</p>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
