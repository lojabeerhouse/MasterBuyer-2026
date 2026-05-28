import React, { useMemo } from 'react';
import {
  AlertTriangle, ArrowRight, BarChart3, Bell, CalendarDays, CheckCircle2,
  ClipboardList, Clock3, Database, FileText, MessageSquare, Package,
  PackageSearch, Scale, ShoppingCart, Tag, TrendingDown, TrendingUp, UploadCloud, Users
} from 'lucide-react';
import { OPEN_STATUSES } from '../utils/orderUtils';
import { calcPriceMovers } from '../utils/priceUtils';
import {
  AppNotification,
  AppSettings,
  CartItem,
  CategoryTree,
  ForecastItem,
  InventoryCountMap,
  MasterProduct,
  PurchaseOrder,
  QuoteStage,
  SalesRecord,
  Supplier,
  SupplierCatalog,
  UserProfile
} from '../types';
import { User } from 'firebase/auth';

interface DashboardProps {
  user: User;
  userProfile: UserProfile;
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  masterProducts: MasterProduct[];
  notifications: AppNotification[];
  cart: CartItem[];
  supplierCatalogs?: Record<string, SupplierCatalog>;
  salesData?: SalesRecord[];
  forecast?: ForecastItem[];
  inventoryCount?: InventoryCountMap;
  categoryTree?: CategoryTree;
  quoteStages?: QuoteStage[];
  appSettings?: AppSettings;
  onNavigate: (tab: string) => void;
}

type Severity = 'critical' | 'warning' | 'info' | 'success';

const severityClasses: Record<Severity, { border: string; bg: string; icon: string; text: string }> = {
  critical: { border: 'border-red-500/35', bg: 'bg-red-500/10', icon: 'text-red-400', text: 'text-red-300' },
  warning: { border: 'border-amber-500/35', bg: 'bg-amber-500/10', icon: 'text-amber-400', text: 'text-amber-300' },
  info: { border: 'border-blue-500/30', bg: 'bg-blue-500/10', icon: 'text-blue-400', text: 'text-blue-300' },
  success: { border: 'border-emerald-500/25', bg: 'bg-emerald-500/10', icon: 'text-emerald-400', text: 'text-emerald-300' },
};

const SectionHeader: React.FC<{ title: string; action?: string; onAction?: () => void }> = ({ title, action, onAction }) => (
  <div className="mb-3 flex items-center justify-between gap-3">
    <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</h2>
    {action && onAction && (
      <button onClick={onAction} className="text-xs font-medium text-slate-500 transition-colors hover:text-slate-300">
        {action}
      </button>
    )}
  </div>
);

const MetricCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  onClick: () => void;
  severity?: Severity;
}> = ({ icon, label, value, sub, onClick, severity = 'info' }) => {
  const tone = severityClasses[severity];
  return (
    <button
      onClick={onClick}
      className={`min-h-[104px] w-full rounded-lg border ${tone.border} bg-slate-900 p-4 text-left transition-all hover:bg-slate-800/70`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className={`rounded-lg ${tone.bg} p-2.5 ${tone.icon}`}>{icon}</div>
        <ArrowRight className="mt-1 h-4 w-4 text-slate-600" />
      </div>
      <p className="mt-3 text-2xl font-bold text-white">{value}</p>
      <p className="text-xs text-slate-400">{label}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </button>
  );
};

const AttentionCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  desc: string;
  severity: Severity;
  onClick: () => void;
}> = ({ icon, title, desc, severity, onClick }) => {
  const tone = severityClasses[severity];
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg border ${tone.border} bg-slate-900 p-3 text-left transition-all hover:bg-slate-800/70`}
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone.bg} ${tone.icon}`}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-semibold ${tone.text}`}>{title}</p>
        <p className="truncate text-xs text-slate-500">{desc}</p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-slate-600" />
    </button>
  );
};

const QuickAction: React.FC<{
  icon: React.ReactNode;
  label: string;
  desc: string;
  onClick: () => void;
  highlight?: boolean;
}> = ({ icon, label, desc, onClick, highlight }) => (
  <button
    onClick={onClick}
    className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-all ${
      highlight
        ? 'border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20'
        : 'border-slate-800 bg-slate-900 hover:border-slate-600 hover:bg-slate-800/70'
    }`}
  >
    <span className={highlight ? 'text-amber-400' : 'text-slate-400'}>{icon}</span>
    <div className="min-w-0">
      <p className={`truncate text-sm font-medium ${highlight ? 'text-amber-300' : 'text-slate-200'}`}>{label}</p>
      <p className="truncate text-xs text-slate-500">{desc}</p>
    </div>
  </button>
);

const OrderStatusRow: React.FC<{
  label: string;
  count: number;
  color: string;
  onClick: () => void;
}> = ({ label, count, color, onClick }) => (
  <button
    onClick={onClick}
    className="flex w-full items-center justify-between rounded-lg border border-slate-800 bg-slate-900 px-3 py-2.5 text-left transition-all hover:border-slate-600 hover:bg-slate-800/70"
  >
    <div className="flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      <span className="text-sm text-slate-300">{label}</span>
    </div>
    <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-300">{count}</span>
  </button>
);

const SystemBaseCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string | number;
  desc: string;
  onClick: () => void;
}> = ({ icon, label, value, desc, onClick }) => (
  <button
    onClick={onClick}
    className="rounded-lg border border-slate-800 bg-slate-900 p-3 text-left transition-all hover:border-slate-600 hover:bg-slate-800/70"
  >
    <div className="mb-3 flex items-center justify-between gap-3">
      <span className="rounded-lg bg-slate-800 p-2 text-slate-400">{icon}</span>
      <span className="text-lg font-bold text-white">{value}</span>
    </div>
    <p className="text-sm font-medium text-slate-200">{label}</p>
    <p className="mt-0.5 text-xs text-slate-500">{desc}</p>
  </button>
);

const statusLabel: Record<string, { label: string; color: string; dot: string }> = {
  draft: { label: 'Rascunho', color: 'text-slate-400', dot: 'bg-slate-500' },
  sent: { label: 'Enviado', color: 'text-blue-400', dot: 'bg-blue-500' },
  confirmed: { label: 'Confirmado', color: 'text-amber-400', dot: 'bg-amber-500' },
  in_transit: { label: 'Em trânsito', color: 'text-purple-400', dot: 'bg-purple-500' },
  awaiting: { label: 'Aguardando', color: 'text-yellow-400', dot: 'bg-yellow-500' },
  delivered: { label: 'Entregue', color: 'text-green-400', dot: 'bg-green-500' },
  cancelled: { label: 'Cancelado', color: 'text-red-400', dot: 'bg-red-500' },
};

const getQuoteTime = (quote: { savedAt?: number; timestamp?: number }) => quote.savedAt ?? quote.timestamp ?? 0;

const Dashboard: React.FC<DashboardProps> = ({
  user,
  userProfile,
  suppliers,
  purchaseOrders,
  masterProducts,
  notifications,
  cart,
  supplierCatalogs = {},
  salesData = [],
  forecast = [],
  inventoryCount = {},
  categoryTree = {},
  quoteStages = [],
  appSettings,
  onNavigate,
}) => {
  const firstName = (userProfile.displayName || user.displayName || user.email || 'Usuario').split(' ')[0];
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';

  const activeOrders = purchaseOrders.filter(o => OPEN_STATUSES.includes(o.status));
  const draftOrders = purchaseOrders.filter(o => o.status === 'draft');
  const sentOrders = purchaseOrders.filter(o => o.status === 'sent');
  const awaitingOrders = purchaseOrders.filter(o => o.status === 'awaiting');
  const confirmedOrders = purchaseOrders.filter(o => o.status === 'confirmed');
  const inTransitOrders = purchaseOrders.filter(o => o.status === 'in_transit');
  const toCheckOrders = purchaseOrders.filter(o => o.status === 'received_unchecked');

  const unresolvedNotifications = notifications.filter(n => !n.resolved);
  const catalogCount = Object.keys(supplierCatalogs).length;
  const categoryCount = Object.keys(categoryTree).length;
  const inventoryCountedItems = Object.keys(inventoryCount).length;
  const inventoryPendingCount = masterProducts.length > 0
    ? Math.max(masterProducts.length - inventoryCountedItems, 0)
    : 0;
  const priceValidityDays = appSettings?.priceValidityDays ?? 7;

  const suppliersWithQuotes = suppliers
    .map(supplier => {
      const quoteTimes = [
        ...(supplier.quotes ?? []).map(getQuoteTime),
        ...(supplier.batches ?? []).map(getQuoteTime),
      ].filter(Boolean);
      return {
        supplier,
        lastQuoteAt: quoteTimes.length ? Math.max(...quoteTimes) : 0,
        quoteCount: quoteTimes.length,
      };
    })
    .filter(item => item.quoteCount > 0)
    .sort((a, b) => b.lastQuoteAt - a.lastQuoteAt);

  const staleQuoteSuppliers = suppliersWithQuotes.filter(item => {
    if (!item.lastQuoteAt) return false;
    const ageDays = Math.floor((Date.now() - item.lastQuoteAt) / 86_400_000);
    return ageDays > priceValidityDays;
  });

  const priceMovers = useMemo(() => calcPriceMovers(suppliers), [suppliers]);

  const recentOrders = [...activeOrders]
    .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
    .slice(0, 4);

  const attentionItems = [
    ...(unresolvedNotifications.length > 0 ? [{
      id: 'notifications',
      icon: <Bell className="h-4 w-4" />,
      title: `${unresolvedNotifications.length} pendencia${unresolvedNotifications.length === 1 ? '' : 's'} nao resolvida${unresolvedNotifications.length === 1 ? '' : 's'}`,
      desc: 'Revise alertas antes de seguir com compras.',
      severity: 'critical' as Severity,
      tab: unresolvedNotifications.some(n => n.supplierId) ? 'suppliers' : 'uploads',
    }] : []),
    ...(toCheckOrders.length > 0 ? [{
      id: 'to-check',
      icon: <Package className="h-4 w-4" />,
      title: `${toCheckOrders.length} pedido${toCheckOrders.length === 1 ? '' : 's'} aguardando conferencia`,
      desc: 'Mercadoria chegou — confira itens, quantidades e NF.',
      severity: 'critical' as Severity,
      tab: 'purchase_orders',
    }] : []),
    ...(cart.length > 0 ? [{
      id: 'cart',
      icon: <ShoppingCart className="h-4 w-4" />,
      title: `${cart.length} ${cart.length === 1 ? 'item' : 'itens'} aguardando fechamento`,
      desc: 'Converta o carrinho em pedido de compra.',
      severity: 'warning' as Severity,
      tab: 'purchase_orders',
    }] : []),
    ...(draftOrders.length > 0 ? [{
      id: 'draft-orders',
      icon: <ClipboardList className="h-4 w-4" />,
      title: `${draftOrders.length} pedido${draftOrders.length === 1 ? '' : 's'} em rascunho`,
      desc: 'Finalize ou descarte pedidos ainda abertos.',
      severity: 'warning' as Severity,
      tab: 'purchase_orders',
    }] : []),
    ...(awaitingOrders.length + sentOrders.length > 0 ? [{
      id: 'waiting-orders',
      icon: <Clock3 className="h-4 w-4" />,
      title: `${awaitingOrders.length + sentOrders.length} pedido${awaitingOrders.length + sentOrders.length === 1 ? '' : 's'} aguardando retorno`,
      desc: 'Acompanhe fornecedor, confirmacao ou proxima etapa.',
      severity: 'info' as Severity,
      tab: 'purchase_orders',
    }] : []),
    ...(staleQuoteSuppliers.length > 0 ? [{
      id: 'stale-quotes',
      icon: <AlertTriangle className="h-4 w-4" />,
      title: `${staleQuoteSuppliers.length} ${staleQuoteSuppliers.length === 1 ? 'cotacao' : 'cotacoes'} fora da validade`,
      desc: `Validade configurada: ${priceValidityDays} dias.`,
      severity: 'warning' as Severity,
      tab: 'suppliers',
    }] : []),
    ...(suppliers.length === 0 ? [{
      id: 'setup-suppliers',
      icon: <Users className="h-4 w-4" />,
      title: 'Cadastre fornecedores para iniciar',
      desc: 'Sem fornecedores, cotacoes e pedidos ficam bloqueados.',
      severity: 'info' as Severity,
      tab: 'suppliers',
    }] : []),
    ...(masterProducts.length === 0 ? [{
      id: 'setup-products',
      icon: <Database className="h-4 w-4" />,
      title: 'Importe ou cadastre produtos',
      desc: 'A base de produtos alimenta catalogo, estoque e comparador.',
      severity: 'info' as Severity,
      tab: 'database',
    }] : []),
    ...(suppliers.length > 0 && suppliersWithQuotes.length === 0 ? [{
      id: 'setup-quotes',
      icon: <MessageSquare className="h-4 w-4" />,
      title: 'Nenhuma cotacao disponivel',
      desc: 'Solicite ou importe precos para comparar compras.',
      severity: 'info' as Severity,
      tab: 'quote_request',
    }] : []),
    ...(masterProducts.length > 0 && categoryCount === 0 ? [{
      id: 'setup-categories',
      icon: <Tag className="h-4 w-4" />,
      title: 'Produtos sem arvore de categorias',
      desc: 'Organize a base para analises e navegacao.',
      severity: 'info' as Severity,
      tab: 'category_manager',
    }] : []),
    ...(salesData.length === 0 ? [{
      id: 'setup-sales',
      icon: <BarChart3 className="h-4 w-4" />,
      title: 'Historico de vendas ausente',
      desc: 'Carregue vendas para melhorar forecast e sugestoes.',
      severity: 'info' as Severity,
      tab: 'sales',
    }] : []),
  ].sort((a, b) => {
    const rank: Record<Severity, number> = { critical: 0, warning: 1, info: 2, success: 3 };
    return rank[a.severity] - rank[b.severity];
  }).slice(0, 5);

  const primaryAction = cart.length > 0
    ? 'purchase_orders'
    : suppliersWithQuotes.length > 0
      ? 'comparator'
      : suppliers.length > 0
        ? 'quote_request'
        : 'suppliers';

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-6 pb-6">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold text-white">{greeting}, {firstName}!</h1>
            <p className="mt-0.5 text-sm text-slate-400">
              {now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
          {user.photoURL && (
            <img src={user.photoURL} alt="avatar" className="h-10 w-10 rounded-full border-2 border-slate-700" />
          )}
        </div>

        <section>
          <SectionHeader title="Precisa de atencao" />
          {attentionItems.length > 0 ? (
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              {attentionItems.map(item => (
                <AttentionCard
                  key={item.id}
                  icon={item.icon}
                  title={item.title}
                  desc={item.desc}
                  severity={item.severity}
                  onClick={() => onNavigate(item.tab)}
                />
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              <div>
                <p className="text-sm font-semibold text-emerald-300">Operacao sem pendencias criticas</p>
                <p className="text-xs text-slate-500">Use as proximas acoes para planejar novas compras.</p>
              </div>
            </div>
          )}
        </section>

        <section className={`grid grid-cols-2 gap-3 ${toCheckOrders.length > 0 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
          <MetricCard
            icon={<Bell className="h-5 w-5" />}
            label="Notificacoes"
            value={unresolvedNotifications.length}
            sub={unresolvedNotifications.length > 0 ? 'Requer revisao' : 'Tudo resolvido'}
            onClick={() => onNavigate(unresolvedNotifications.some(n => n.supplierId) ? 'suppliers' : 'uploads')}
            severity={unresolvedNotifications.length > 0 ? 'critical' : 'success'}
          />
          <MetricCard
            icon={<ClipboardList className="h-5 w-5" />}
            label="Em aberto"
            value={activeOrders.length}
            sub={`${purchaseOrders.length} pedidos no total`}
            onClick={() => onNavigate('purchase_orders')}
            severity={activeOrders.length > 0 ? 'warning' : 'info'}
          />
          {toCheckOrders.length > 0 && (
            <MetricCard
              icon={<Package className="h-5 w-5" />}
              label="A conferir"
              value={toCheckOrders.length}
              sub="Mercadoria chegou"
              onClick={() => onNavigate('purchase_orders')}
              severity="critical"
            />
          )}
          <MetricCard
            icon={<Scale className="h-5 w-5" />}
            label="Prontas para comparar"
            value={suppliersWithQuotes.length}
            sub={suppliersWithQuotes.length > 0 ? `${staleQuoteSuppliers.length} fora da validade` : 'Sem cotacoes importadas'}
            onClick={() => onNavigate(suppliersWithQuotes.length > 0 ? 'comparator' : 'quote_request')}
            severity={
              staleQuoteSuppliers.length > 0 && staleQuoteSuppliers.length === suppliersWithQuotes.length
                ? 'critical'
                : staleQuoteSuppliers.length > 0
                  ? 'warning'
                  : 'info'
            }
          />
          <MetricCard
            icon={<ShoppingCart className="h-5 w-5" />}
            label="Carrinho"
            value={cart.length}
            sub={cart.length > 0 ? 'Pronto para pedido' : 'Sem itens selecionados'}
            onClick={() => onNavigate(cart.length > 0 ? 'purchase_orders' : 'comparator')}
            severity={cart.length > 0 ? 'warning' : 'info'}
          />
        </section>

        {(priceMovers.topGainers.length > 0 || priceMovers.topLosers.length > 0) && (
          <section>
            <SectionHeader title="Variacao de precos — ultimos 7 dias" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {priceMovers.topLosers.length > 0 && (
                <div className="space-y-2">
                  <p className="px-1 text-xs font-semibold uppercase tracking-wider text-emerald-400">Maiores quedas</p>
                  {priceMovers.topLosers.slice(0, 3).map((entry, i) => (
                    <button
                      key={i}
                      onClick={() => onNavigate('comparator')}
                      className="flex w-full items-center gap-3 rounded-lg border border-emerald-500/20 bg-slate-900 p-3 text-left transition-all hover:border-emerald-500/40 hover:bg-slate-800/70"
                    >
                      <TrendingDown className="h-4 w-4 shrink-0 text-emerald-400" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-200">{entry.productName}</p>
                        <p className="truncate text-xs text-slate-500">{entry.supplierName}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-bold text-emerald-400">{entry.changePct.toFixed(1)}%</p>
                        <p className="text-xs text-slate-500">R$ {entry.currentPrice.toFixed(2).replace('.', ',')}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {priceMovers.topGainers.length > 0 && (
                <div className="space-y-2">
                  <p className="px-1 text-xs font-semibold uppercase tracking-wider text-red-400">Maiores altas</p>
                  {priceMovers.topGainers.slice(0, 3).map((entry, i) => (
                    <button
                      key={i}
                      onClick={() => onNavigate('comparator')}
                      className="flex w-full items-center gap-3 rounded-lg border border-red-500/20 bg-slate-900 p-3 text-left transition-all hover:border-red-500/40 hover:bg-slate-800/70"
                    >
                      <TrendingUp className="h-4 w-4 shrink-0 text-red-400" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-200">{entry.productName}</p>
                        <p className="truncate text-xs text-slate-500">{entry.supplierName}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-bold text-red-400">+{entry.changePct.toFixed(1)}%</p>
                        <p className="text-xs text-slate-500">R$ {entry.currentPrice.toFixed(2).replace('.', ',')}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.15fr]">
          <section>
            <SectionHeader title="Proximas acoes" />
            <div className="space-y-2">
              <QuickAction
                icon={primaryAction === 'purchase_orders' ? <ShoppingCart className="h-4 w-4" /> : primaryAction === 'comparator' ? <Scale className="h-4 w-4" /> : primaryAction === 'quote_request' ? <MessageSquare className="h-4 w-4" /> : <Users className="h-4 w-4" />}
                label={primaryAction === 'purchase_orders' ? 'Finalizar pedido' : primaryAction === 'comparator' ? 'Comparar precos' : primaryAction === 'quote_request' ? 'Abrir cotacao' : 'Cadastrar fornecedores'}
                desc={primaryAction === 'purchase_orders' ? 'Transformar carrinho em pedido' : primaryAction === 'comparator' ? 'Escolher melhores condicoes' : primaryAction === 'quote_request' ? 'Solicitar precos aos fornecedores' : 'Preparar base de compras'}
                onClick={() => onNavigate(primaryAction)}
                highlight
              />
              {suppliers.length > 0 && primaryAction !== 'quote_request' && (
                <QuickAction
                  icon={<MessageSquare className="h-4 w-4" />}
                  label="Solicitar cotacao"
                  desc="Pedir precos atualizados aos fornecedores"
                  onClick={() => onNavigate('quote_request')}
                />
              )}
              <QuickAction
                icon={<UploadCloud className="h-4 w-4" />}
                label="Uploads"
                desc="Importar bases, vendas ou arquivos operacionais"
                onClick={() => onNavigate('uploads')}
              />
              <QuickAction
                icon={<PackageSearch className="h-4 w-4" />}
                label="Contagem de Estoque"
                desc="Conferir estoque e sincronizar produtos"
                onClick={() => onNavigate('inventory_count')}
              />
              <QuickAction
                icon={<Tag className="h-4 w-4" />}
                label="Categorias"
                desc="Organizar arvore e classificacao da base"
                onClick={() => onNavigate('category_manager')}
              />
              <QuickAction
                icon={<CalendarDays className="h-4 w-4" />}
                label="Cronograma"
                desc="Acompanhar entregas e compromissos"
                onClick={() => onNavigate('schedule')}
              />
            </div>
          </section>

          <section>
            <SectionHeader title="Pedidos em andamento" action="Ver pedidos" onAction={() => onNavigate('purchase_orders')} />
            {activeOrders.length === 0 ? (
              <div className="rounded-lg border border-slate-800 bg-slate-900 p-6 text-center">
                <ClipboardList className="mx-auto mb-2 h-8 w-8 text-slate-700" />
                <p className="text-sm text-slate-500">Nenhum pedido ativo no momento</p>
                <button
                  onClick={() => onNavigate('comparator')}
                  className="mt-3 text-xs text-amber-400 transition-colors hover:text-amber-300"
                >
                  Ir para o Comparador
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <OrderStatusRow label="Rascunhos" count={draftOrders.length} color="bg-slate-500" onClick={() => onNavigate('purchase_orders')} />
                <OrderStatusRow label="Enviados" count={sentOrders.length} color="bg-blue-500" onClick={() => onNavigate('purchase_orders')} />
                <OrderStatusRow label="Aguardando" count={awaitingOrders.length} color="bg-yellow-500" onClick={() => onNavigate('purchase_orders')} />
                <OrderStatusRow label="Confirmados" count={confirmedOrders.length} color="bg-amber-500" onClick={() => onNavigate('purchase_orders')} />
                <OrderStatusRow label="Em transito" count={inTransitOrders.length} color="bg-purple-500" onClick={() => onNavigate('purchase_orders')} />
              </div>
            )}

            {recentOrders.length > 0 && (
              <div className="mt-3 space-y-2">
                {recentOrders.map(order => {
                  const st = statusLabel[order.status] ?? { label: order.status, color: 'text-slate-400', dot: 'bg-slate-500' };
                  const supplier = suppliers.find(s => s.id === order.supplierId);
                  return (
                    <button
                      key={order.id}
                      onClick={() => onNavigate('purchase_orders')}
                      className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900 p-3 text-left transition-all hover:border-slate-600 hover:bg-slate-800/70"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-200">
                          #{order.seqNumber} - {supplier?.name ?? order.supplierName ?? 'Fornecedor'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {order.createdAt ? new Date(order.createdAt).toLocaleDateString('pt-BR') : 'Sem data'}
                        </p>
                      </div>
                      <span className={`shrink-0 text-xs font-medium ${st.color}`}>{st.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <section>
          <SectionHeader title="Cotacoes e fornecedores" action="Ver fornecedores" onAction={() => onNavigate('suppliers')} />
          {suppliersWithQuotes.length > 0 ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {suppliersWithQuotes.slice(0, 8).map(({ supplier, lastQuoteAt }) => {
                const daysAgo = lastQuoteAt ? Math.floor((Date.now() - lastQuoteAt) / 86_400_000) : null;
                const stale = daysAgo !== null && daysAgo > priceValidityDays;
                return (
                  <button
                    key={supplier.id}
                    onClick={() => onNavigate(stale ? 'suppliers' : 'comparator')}
                    className="rounded-lg border border-slate-800 bg-slate-900 p-3 text-left transition-all hover:border-slate-600 hover:bg-slate-800/70"
                  >
                    <p className="truncate text-sm font-medium text-slate-200">{supplier.name}</p>
                    <p className={`mt-0.5 text-xs ${stale ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {daysAgo === 0 ? 'Atualizada hoje' : `${daysAgo}d atras`}
                    </p>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <p className="text-sm font-medium text-slate-300">Nenhuma cotacao pronta para comparar</p>
              <p className="mt-1 text-xs text-slate-500">Solicite precos ou importe arquivos para alimentar o comparador.</p>
            </div>
          )}
        </section>

        <section>
          <SectionHeader title="Base do sistema" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <SystemBaseCard
              icon={<Database className="h-4 w-4" />}
              label="Produtos"
              value={masterProducts.length}
              desc="Base mestre"
              onClick={() => onNavigate('database')}
            />
            <SystemBaseCard
              icon={<Users className="h-4 w-4" />}
              label="Fornecedores"
              value={suppliers.length}
              desc="Cadastro ativo"
              onClick={() => onNavigate('suppliers')}
            />
            <SystemBaseCard
              icon={<FileText className="h-4 w-4" />}
              label="Catalogos"
              value={catalogCount}
              desc="Por fornecedor"
              onClick={() => onNavigate('catalog')}
            />
            <SystemBaseCard
              icon={<Tag className="h-4 w-4" />}
              label="Categorias"
              value={categoryCount}
              desc="Arvore criada"
              onClick={() => onNavigate('category_manager')}
            />
            <SystemBaseCard
              icon={<Package className="h-4 w-4" />}
              label="Inventario"
              value={inventoryPendingCount}
              desc="Itens pendentes"
              onClick={() => onNavigate('inventory_count')}
            />
            <SystemBaseCard
              icon={<TrendingUp className="h-4 w-4" />}
              label="Vendas"
              value={forecast.length || salesData.length}
              desc={forecast.length > 0 ? 'Itens em forecast' : 'Registros'}
              onClick={() => onNavigate('sales')}
            />
          </div>
        </section>
      </div>
    </div>
  );
};

export default Dashboard;
